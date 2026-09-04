import { DEFAULT_TOOLS_PROMPT, TOOL_CALL_FORMAT_BLOCK, TOOL_DEFINITIONS } from '../constants.js';
import { getSettings } from '../session.js';
import { _ensureWrapped } from '../utils/util-text.js';

export function getEnabledTools() {
    const s = getSettings();
    if (!s.toolsEnabled) return [];
    return TOOL_DEFINITIONS.filter(t => s[t.settingKey] !== false);
}

export function buildAnthropicToolsPayload() {
    return getEnabledTools().map(t => ({
        name: t.name,
        description: t.label + ': ' + t.description,
        input_schema: t.schema,
    }));
}

export async function executeTool(toolName, toolInput) {
    const ctx = SillyTavern.getContext();
    switch (toolName) {
        case 'search_chat': {
            const msgs = ctx.chat || [];
            let rawQueries = Array.isArray(toolInput.queries) ? toolInput.queries : (Array.isArray(toolInput.query) ? toolInput.query : [toolInput.query || '']);
            const parsedQueries = rawQueries.map(q => {
                const s = String(q);
                const regexMatch = s.match(/^\/(.+)\/([gimsuy]*)$/);
                if (regexMatch) {
                    try { return { type: 'regex', re: new RegExp(regexMatch[1], regexMatch[2]) }; } catch(_) {}
                }
                return { type: 'text', lq: s.toLowerCase() };
            });
            const role = toolInput.role || 'all';
            const fromIdx = toolInput.from_index ?? 0;
            const toIdx = toolInput.to_index ?? msgs.length - 1;
            const maxResults = Math.min(toolInput.max_results ?? 10, 50);
            const includeContent = toolInput.include_content !== false;
            
            const results = [];
            for (let i = Math.max(0, fromIdx); i <= Math.min(msgs.length - 1, toIdx); i++) {
                const m = msgs[i];
                if (role === 'user' && !m.is_user) continue;
                if (role === 'assistant' && m.is_user) continue;
                const text = m.mes || '';
                
                let matched = false;
                for (const pq of parsedQueries) {
                    if (pq.type === 'regex' && pq.re) {
                        pq.re.lastIndex = 0;
                        if (pq.re.test(text)) { matched = true; break; }
                    } else {
                        if (text.toLowerCase().includes(pq.lq)) { matched = true; break; }
                        const tokens = pq.lq.split(/\s+/).filter(Boolean);
                        if (tokens.length > 1 && tokens.every(t => text.toLowerCase().includes(t))) { matched = true; break; }
                    }
                }
                
                if (matched) {
                    const entry = { index: i, role: m.is_user ? 'user' : 'assistant', name: m.name || (m.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character')) };
                    if (includeContent) entry.content = text.length > 500 ? text.slice(0, 500) + '...[truncated]' : text;
                    results.push(entry);
                    if (results.length >= maxResults) break;
                }
            }
            return { found: results.length, results, note: `Total messages searched: ${Math.min(msgs.length - 1, toIdx) - Math.max(0, fromIdx) + 1}` };
        }
        case 'ask_user': {
            return { __ask_user: true, question: toolInput.question, context: toolInput.context };
        }
        case 'get_chat_stats': {
            const msgs = ctx.chat || [];
            const userMsgs = msgs.filter(m => m.is_user);
            const asMsgs = msgs.filter(m => !m.is_user);
            const totalChars = msgs.reduce((s, m) => s + (m.mes || '').length, 0);
            return {
                total_messages: msgs.length,
                user_messages: userMsgs.length,
                assistant_messages: asMsgs.length,
                approx_tokens: Math.ceil(totalChars / 3.5),
                first_message_index: 0,
                last_message_index: msgs.length - 1,
                char_name: ctx.name2 || 'Character',
                user_name: ctx.name1 || 'User',
            };
        }
        case 'get_recent_messages': {
            const msgs = ctx.chat || [];
            const count = Math.min(toolInput.count ?? 10, 50);
            const fromEnd = toolInput.from_end !== false;
            const role = toolInput.role || 'all';
            let filtered = msgs.map((m, i) => ({ ...m, _idx: i }));
            if (role === 'user') filtered = filtered.filter(m => m.is_user);
            if (role === 'assistant') filtered = filtered.filter(m => !m.is_user);
            if (fromEnd) filtered = filtered.slice(-count);
            else filtered = filtered.slice(0, count);
            return {
                messages: filtered.map(m => ({
                    index: m._idx,
                    role: m.is_user ? 'user' : 'assistant',
                    name: m.name || (m.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character')),
                    content: (m.mes || '').length > 600 ? m.mes.slice(0, 600) + '...[truncated]' : (m.mes || ''),
                })),
                            };
        }
        default: return { error: `Unknown tool: ${toolName}` };
    }
}

export function parseToolCallsFromText(text) {
    const results = [];
    const re = /```tool_call\n?([\s\S]*?)(?:```|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const rawBlock = m[1].trim();
        if (!rawBlock) continue;

        let extracted = [];

        try {
            const parsed = JSON.parse(rawBlock);
            if (Array.isArray(parsed)) {
                extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
            } else if (parsed && parsed.name) {
                extracted.push({ name: parsed.name, input: parsed.input || {} });
            }
        } catch (_) {}

        if (!extracted.length) {
            try {
                const fixedRaw = '[' + rawBlock.replace(/}\s*{/g, '},{') + ']';
                const parsed = JSON.parse(fixedRaw);
                if (Array.isArray(parsed)) {
                    extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
                }
            } catch (_) {}
        }

        if (!extracted.length) {
            const lines = rawBlock.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed && parsed.name) {
                        extracted.push({ name: parsed.name, input: parsed.input || {} });
                    }
                } catch (_) {}
            }
        }

        if (!extracted.length) {
            const nameMatch = rawBlock.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch) {
                extracted.push({ name: nameMatch[1], input: {} });
            } else {
                extracted.push({ name: 'parsing...', input: {} });
            }
        }

        results.push(...extracted);
    }
    return results;
}

export function stripToolCallsFromText(text) {
    return text.replace(/```tool_call[\s\S]*?```/gi, '').trim();
}

export function buildToolCallsSystemBlock() {
    const tools = getEnabledTools();
    if (!tools.length) return '';
    const s = getSettings();
    
    const formatSchemaProps = (properties) => {
        if (!properties || Object.keys(properties).length === 0) return '{}';
        const lines = [];
        for (const [key, prop] of Object.entries(properties)) {
            lines.push(`"${key}": ${JSON.stringify(prop)}`);
        }
        return `{${lines.join(',\n    ')}}`;
    };

    const toolsList = tools.map(t =>
        `- **${t.name}**: ${t.description} | Params: ${formatSchemaProps(t.schema.properties)}`
    ).join("\n");
    
    let prompt = s.toolsSystemPrompt || DEFAULT_TOOLS_PROMPT;
    if (!prompt.includes('{{tools_list}}')) {
        prompt += '\n\nTools available:\n{{tools_list}}';
    }
    if (!prompt.includes('{{tool_call_format}}')) {
        prompt = prompt.replace('Format requirement:', 'Format requirement:\n{{tool_call_format}}');
    }
    
    const finalPrompt = prompt
        .replace('{{tools_list}}', toolsList)
        .replace('{{tool_call_format}}', TOOL_CALL_FORMAT_BLOCK);
        
    return '\n\n' + _ensureWrapped(finalPrompt, 'tool_calls_system');
}