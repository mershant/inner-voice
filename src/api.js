import { DEFAULT_SYSTEM_PROMPT, EXT_DISPLAY } from './constants.js';
import { state } from './state.js';
import { getEffectiveSettings, saveConversation, addTurn, getConversation, getLiveEdgeIndex, getExchangeAt, isExchangeHidden } from './conversation.js';
import { renderExchangeBlock } from './simulation-view.js';
import { _dbgAdd } from './utils/util-debug.js';
import { escHtml } from './utils/util-dom.js';
import { _ensureWrapped, normalizeCharNamesInBlock } from './utils/util-text.js';
import { getCharInfo, getUserPersona } from './utils/util-st.js';
import { _getAspectEvolutiaPersonaFields } from './integrations/integ-evolutia.js';
import { _getSummaryceptionSummary } from './integrations/integ-summaryception.js';
import { applyRegexIfEnabled } from './integrations/integ-regex.js';

import { buildMemoryContextBlock, buildMemoryAIInstructions, processMemoryUpdates, stripMemoryBlock } from './features/feature-memory.js';
import { buildLorebookContextBlock } from './features/feature-lorebook.js';
import { buildCharacterInformationBlock } from './features/feature-characters.js';
import { buildToolCallsSystemBlock, parseToolCallsFromText, executeTool, getEnabledTools } from './features/feature-tools-engine.js';
import { buildPortraySignalBlock, splitPortraySignal } from './portray-signal.js';

import { updateMsgCount, smartScrollToBottom, setGeneratingState, showGenerationError, _renderMsgBodyContent, _refreshSwipeBars, appendMsgEl } from './ui/ui-chat.js';
import { getDisplayContent, extractToolCallPlaceholders, renderMarkdown, postProcessHTMLBlocks } from './ui/ui-chat.js'; 
import { postProcessToolCalls, executeAskUser } from './features/feature-tools-ui.js';
import { playCompletionSound } from './ui/ui-widgets.js';

function sanitizeToolCallsForSave(toolCalls) {
    return (toolCalls || []).map(tc => ({ ...tc }));
}

export async function notePortrayAutoTrigger(turn, opts = {}) {
    const { considerAutoTriggerPortray } = await import('./portray.js');
    await considerAutoTriggerPortray(turn, opts);
}

export async function flushPortrayAutoTrigger() {
    const { flushPendingAutoPortray } = await import('./portray.js');
    await flushPendingAutoPortray();
}

function visibleAssistantText(text) {
    const raw = typeof text === 'string' ? text : '';
    return stripMemoryBlock(splitPortraySignal(raw).visible);
}

export async function buildSystemContent(settings) {
    let sysPromptRaw = (typeof settings.systemPrompt === 'string' && settings.systemPrompt.trim()) ? settings.systemPrompt : DEFAULT_SYSTEM_PROMPT;
    const parts = [_ensureWrapped(sysPromptRaw, 'system_prompt')];
    const ctx = SillyTavern.getContext();

    if (settings.includeSystemPrompt) {
        const sp = ctx.systemPrompt || ctx.system_prompt || '';
        if (sp) parts.push(`\n\n<st_system_prompt>\n${sp}\n</st_system_prompt>`);
    }

    if (ctx.groupId && ctx.groups) {
        const group = ctx.groups.find(g => g.id === ctx.groupId);
        if (group && Array.isArray(group.members)) {
            const memberNames = group.members.map(m => {
                const c = ctx.characters.find(char => char.avatar === m);
                return c ? c.name : m;
            }).filter(Boolean);
            if (memberNames.length > 0) {
                parts.push(`\n<chat_group_members>\nThats chat with multiple characters. Current group members: ${memberNames.join(', ')}\n</chat_group_members>`);
            }
        }
    }

    const memoryBlock = buildMemoryContextBlock(settings)
    if (memoryBlock) parts.push(memoryBlock);

    const lorebookBlock = await buildLorebookContextBlock(settings);
    if (lorebookBlock) parts.push(lorebookBlock);

    const characterBlock = buildCharacterInformationBlock(settings);
    if (characterBlock) parts.push(characterBlock);

    {
        const userName = ctx.name1 || 'User';
        let inner = `Name: ${userName}`;
        
        if (settings.includeUserPersonality) {
            let hasEvolutia = false;
            if (settings.useAspectEvolutia) {
                const aeUserFields = _getAspectEvolutiaPersonaFields();
                if (aeUserFields && aeUserFields.length) {
                    const aeContent = aeUserFields.map(f => `<evolutia_user_field name="${escHtml(f.name)}">\n${f.content}\n</evolutia_user_field>`).join('\n\n');
                    inner += `\n${aeContent}`;
                    hasEvolutia = true;
                }
            }
            if (!hasEvolutia) {
                const personaContent = getUserPersona();
                if (personaContent) inner += `\n${personaContent}`;
            }
        }
        parts.push(`\n\n<{{user}}_persona>\n${inner}\n</{{user}}_persona>`);
    }

    const memoryAIInstr = buildMemoryAIInstructions(settings).trim();
    const toolsBlock = buildToolCallsSystemBlock().trim();
    const portraySignalBlock = buildPortraySignalBlock(settings).trim();

    const modules = [memoryAIInstr, toolsBlock, portraySignalBlock].filter(Boolean);
    if (modules.length > 0) {
        parts.push(`\n\n<modules>\n${modules.join('\n\n')}\n</modules>`);
    }

    return parts.join('\n');
}

export function getMainChatSlice(depth) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chat) return [];
    
    const _incHidden = getEffectiveSettings().includeHiddenMessages;
    const extractData = (m, i) => ({
        role: m.is_user ? 'user' : 'assistant',
        name: m.is_user ? (ctx.name1 || 'User') : (m.name || getCharInfo()?.name || 'Character'),
        content: typeof m.mes === 'string' ? m.mes : '',
        chatIndex: i,
        is_hidden: (!_incHidden && (!!m.is_system || !!m.is_hidden || !!(m.extra && m.extra.is_hidden))) || !!(m.extra?.sc_ghosted)
    });

    try {
        const conv = getConversation();
        const picked = conv.pickedChatIndices;
        if (picked && picked.length > 0) {
            return picked
                .filter(i => i >= 0 && i < ctx.chat.length)
                .map(i => extractData(ctx.chat[i], i));
        }
    } catch(_) {}
    
    if (depth === 0) return [];
    const total = ctx.chat.length;
    const start = Math.max(0, total - depth);
    return ctx.chat.slice(start).map((m, i) => extractData(m, start + i));
}

export async function assembleMessages(conversation, settings, pendingUserText) {
    const messages = [{ role: 'system', content: await buildSystemContent(settings) }];
    const depth = Math.max(0, parseInt(settings.contextDepth) || 0);
    const hasPicked = !!(conversation.pickedChatIndices && conversation.pickedChatIndices.length > 0);
    
    if (depth > 0 || hasPicked) {
        const slice = getMainChatSlice(depth);
        if (slice.length) {
            const chatTotal = SillyTavern.getContext().chat?.length ?? 0;
            const processedSlice = await Promise.all(slice.map(async m => ({
                ...m, content: await applyRegexIfEnabled(m.content, m.role === 'user', chatTotal - m.chatIndex - 1),
            })));
            const ctx = SillyTavern.getContext();
            const visibleSlice = processedSlice.filter(m => !m.is_hidden);

            if (settings.includeAlternateSwipes && visibleSlice.length > 0) {
                let lastAstMsg = null;
                for (let i = visibleSlice.length - 1; i >= 0; i--) {
                    if (visibleSlice[i].role === 'assistant') {
                        lastAstMsg = visibleSlice[i];
                        break;
                    }
                }
                if (lastAstMsg) {
                    const stChatMsg = ctx.chat[lastAstMsg.chatIndex];
                    if (stChatMsg && Array.isArray(stChatMsg.swipes) && stChatMsg.swipes.length > 1) {
                        let swipesXml = '<alternate_swipes>\n';
                        const activeSwipeId = stChatMsg.swipe_id ?? 0;
                        stChatMsg.swipes.forEach((sw, idx) => {
                            if (idx === activeSwipeId) return;
                            const text = typeof sw === 'string' ? sw : (sw.mes || '');
                            if (text) swipesXml += `<swipe index="${idx}">\n${text}\n</swipe>\n`;
                        });
                        swipesXml += '</alternate_swipes>\n';
                        lastAstMsg.content = swipesXml + lastAstMsg.content;
                    }
                }
            }

            // Inner memory: each non-hidden exchange sits directly below its
            // anchor inside this slice. Hidden or out-of-slice anchors take
            // their exchanges with them; the UI keeps every exchange readable.
            const block = visibleSlice.map(m => {
                const msgXml = `<msg index="${m.chatIndex}" role="${m.role === 'user' ? 'user' : 'assistant'}">\n${m.content}\n</msg>`;
                if (isExchangeHidden(conversation, m.chatIndex)) return msgXml;
                const exchange = getExchangeAt(conversation, m.chatIndex);
                if (!exchange || !exchange.turns.length) return msgXml;
                return `${msgXml}\n\n${renderExchangeBlock(exchange.turns)}`;
            }).join('\n\n');
            
            let summaryText = '';
            if (settings.includeSummaryception !== false) {
                const scSummary = _getSummaryceptionSummary();
                if (scSummary) summaryText = `\n<summary_context>\n${scSummary}\n</summary_context>\n\n`;
            }

            const ctxAttr = hasPicked ? `picked_messages="${visibleSlice.length}"` : `last_messages="${visibleSlice.length}"`;
            messages.push({
                role: 'user',
                content: `<main_chat ${ctxAttr}>\n${summaryText}${block}\n\n</main_chat>`,
            });
            const postHistoryText = typeof settings.postHistoryText === 'string' ? settings.postHistoryText.trim() : '';
            if (postHistoryText) {
                const role = settings.postHistoryRole === 'system' || settings.postHistoryRole === 'assistant'
                    ? settings.postHistoryRole
                    : 'user';
                messages.push({ role, content: postHistoryText });
            }
        }
    }
    if (pendingUserText !== null && pendingUserText !== undefined && pendingUserText !== '') {
        messages.push({ role: 'user', content: pendingUserText });
    }

    return messages;
}

export function formatPayloadAsText(messages) {
    return messages.map(m => {
        const label = m.role === 'system' ? '■ SYSTEM' : m.role === 'user' ? '▶ USER' : '◀ ASSISTANT';
        let c = m.content;
        if (Array.isArray(c)) {
            c = c.map(part => {
                if (part.type === 'text') return part.text;
                if (part.type === 'image_url') return `[Image Base64 Attached]`;
                return `[Unknown Block]`;
            }).join('\n');
        }
        return `${label}\n${'─'.repeat(50)}\n${c}`;
    }).join('\n\n');
}

export async function estimateTokens(text) {
    if (!text) return 0;
    let str = text;
    if (Array.isArray(text)) {
        str = text.map(t => t.type === 'text' ? t.text : '').join('\n');
    }
    
    if (state.tokenCountCache.has(str)) return state.tokenCountCache.get(str);
    if (state.tokenCountPromises.has(str)) return state.tokenCountPromises.get(str);

    const promise = (async () => {
        const ctx = SillyTavern.getContext();
        
        try {
            if (typeof ctx.getTokenCountAsync === 'function') return await ctx.getTokenCountAsync(str);
            if (typeof window.getTokenCountAsync === 'function') return await window.getTokenCountAsync(str);
        } catch (_) {}
        
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            if (typeof ctx.getTokenCount === 'function') return ctx.getTokenCount(str);
            if (typeof window.getTokenCount === 'function') return window.getTokenCount(str);
        } catch (_) {}
        
        try {
            const res = await fetch('/api/tokencount', {
                method: 'POST',
                headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: str })
            });
            if (res.ok) {
                const data = await res.json();
                if (typeof data.length === 'number') return data.length;
                if (typeof data.count === 'number') return data.count;
                if (typeof data === 'number') return data;
            }
        } catch (_) {}
        
        return Math.ceil(str.length / 3.5);
    })();

    state.tokenCountPromises.set(str, promise);
    try {
        const count = await promise;
        if (state.tokenCountCache.size > 500) {
            const keysToDel = Array.from(state.tokenCountCache.keys()).slice(0, 100);
            keysToDel.forEach(k => state.tokenCountCache.delete(k));
        }
        state.tokenCountCache.set(str, count);
        return count;
    } finally {
        state.tokenCountPromises.delete(str);
    }
}

export async function callGenerate(conversation, settings, pendingText, onChunk, messagesOverride) {
    const ctx = SillyTavern.getContext();
    const messages = messagesOverride || await assembleMessages(conversation, settings, pendingText);
    const maxTokens = parseInt(settings.maxTokens) || 8200;

    const abort = new AbortController();
    state.abortController = abort;

    const streamSetting = settings.forceStreaming;
    let useStream;

    if (streamSetting === 'on' || streamSetting === true) {
        useStream = true;
    } else if (streamSetting === 'off') {
        useStream = false;
    } else {
        useStream = !!(document.getElementById('stream_toggle')?.checked
            ?? ctx.chatCompletionSettings?.stream_openai
            ?? ctx.textCompletionSettings?.streaming
            ?? true);
    }

    function deepExtract(obj) {
        if (!obj || typeof obj !== 'object') return { t: '', r: null };
        let r = null;
        
        if (typeof obj.state?.reasoning === 'string' && obj.state.reasoning !== '') r = obj.state.reasoning;
        else if (typeof obj.reasoning === 'string' && obj.reasoning !== '') r = obj.reasoning;
        else if (typeof obj.reasoning_content === 'string' && obj.reasoning_content !== '') r = obj.reasoning_content;
        else if (typeof obj.thinking === 'string' && obj.thinking !== '') r = obj.thinking;

        else if (typeof obj.original_response?.choices?.[0]?.message?.reasoning === 'string' && obj.original_response.choices[0].message.reasoning !== '') r = obj.original_response.choices[0].message.reasoning;
        else if (typeof obj.original_response?.choices?.[0]?.message?.reasoning_content === 'string' && obj.original_response.choices[0].message.reasoning_content !== '') r = obj.original_response.choices[0].message.reasoning_content;
        else if (typeof obj.choices?.[0]?.message?.reasoning === 'string' && obj.choices[0].message.reasoning !== '') r = obj.choices[0].message.reasoning;
        else if (typeof obj.choices?.[0]?.message?.reasoning_content === 'string' && obj.choices[0].message.reasoning_content !== '') r = obj.choices[0].message.reasoning_content;
        else if (typeof obj.choices?.[0]?.delta?.reasoning === 'string' && obj.choices[0].delta.reasoning !== '') r = obj.choices[0].delta.reasoning;
        else if (typeof obj.choices?.[0]?.delta?.reasoning_content === 'string' && obj.choices[0].delta.reasoning_content !== '') r = obj.choices[0].delta.reasoning_content;

        if (!r) {
            const getGeminiThoughts = (src) => {
                if (Array.isArray(src?.responseContent?.parts)) return src.responseContent.parts;
                if (Array.isArray(src?.candidates?.[0]?.content?.parts)) return src.candidates[0].content.parts;
                return [];
            };
            const geminiParts = [...getGeminiThoughts(obj), ...getGeminiThoughts(obj.original_response)];
            const geminiThoughts = geminiParts.filter(p => p.thought || p.thought === null).map(p => p.text).filter(Boolean);
            if (geminiThoughts.length > 0) r = geminiThoughts.join('\n\n');
        }
        
        if (!r) {
            const getClaudeThoughts = (src) => Array.isArray(src?.content) ? src.content : [];
            const claudeParts = [...getClaudeThoughts(obj), ...getClaudeThoughts(obj.original_response)];
            const claudeThoughts = claudeParts.filter(p => p.type === 'thinking').map(p => p.thinking).filter(Boolean);
            if (claudeThoughts.length > 0) r = claudeThoughts.join('\n\n');
        }
            
        if (!r) {
            const getMistralContent = (src) => Array.isArray(src?.choices?.[0]?.message?.content) ? src.choices[0].message.content : [];
            const mistralParts = [...getMistralContent(obj), ...getMistralContent(obj.original_response)];
            let mistralThoughts = [];
            for (const part of mistralParts) {
                if (Array.isArray(part.thinking)) mistralThoughts.push(...part.thinking.map(t => t.text).filter(Boolean));
                else if (part.type === 'thinking' || part.thinking) mistralThoughts.push(typeof part.thinking === 'string' ? part.thinking : part.text);
            }
            if (mistralThoughts.length > 0) r = mistralThoughts.join('\n\n');
        }

        let t = '';
        if (typeof obj.text === 'string' && obj.text !== '') t = obj.text;
        else if (typeof obj.content === 'string' && obj.content !== '') t = obj.content;
        else if (Array.isArray(obj.content)) {
            const textParts = obj.content.filter(p => p.type === 'text' || (p.text && !p.thought && p.type !== 'thinking')).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (Array.isArray(obj.responseContent?.parts)) {
            const textParts = obj.responseContent.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (typeof obj.message?.content === 'string' && obj.message.content !== '') t = obj.message.content;
        else if (typeof obj.original_response?.choices?.[0]?.message?.content === 'string' && obj.original_response.choices[0].message.content !== '') t = obj.original_response.choices[0].message.content;
        else if (typeof obj.choices?.[0]?.message?.content === 'string' && obj.choices[0].message.content !== '') t = obj.choices[0].message.content;
        else if (typeof obj.choices?.[0]?.delta?.content === 'string' && obj.choices[0].delta.content !== '') t = obj.choices[0].delta.content;
        else if (typeof obj.choices?.[0]?.text === 'string' && obj.choices[0].text !== '') t = obj.choices[0].text;
        else if (typeof obj.results?.[0]?.text === 'string' && obj.results[0].text !== '') t = obj.results[0].text;
        else if (Array.isArray(obj.original_response?.candidates?.[0]?.content?.parts)) {
            const textParts = obj.original_response.candidates[0].content.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (Array.isArray(obj.candidates?.[0]?.content?.parts)) {
            const textParts = obj.candidates[0].content.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }

        return { t, r };
    }

    if (settings.connectionSource === 'custom') {
        let text = '';
        let reasoning = null;
        let reasoningStartMs = null;
        let reasoningDone = false;

        try {
            const url = (settings.customUrl || 'http://localhost:5000/v1').replace(/\/+$/, '') + '/chat/completions';
            const payload = {
                model: settings.customModel || 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: maxTokens,
                stream: useStream
            };
            const headers = { 'Content-Type': 'application/json' };
            if (settings.customKey) headers['Authorization'] = `Bearer ${settings.customKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: abort.signal
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(`Custom API Error ${res.status}: ${errText}`);
            }

            if (useStream) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                while (true) {
                    if (abort.signal.aborted) { state.abortController = null; return null; }
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); 

                    for (const line of lines) {
                        const l = line.trim();
                        if (!l || l.startsWith(':') || l === 'data: [DONE]') continue;
                        if (l.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(l.slice(6));
                                const ext = deepExtract(data);
                                if (ext.t) text += ext.t;
                                if (ext.r) {
                                    if (reasoningStartMs === null) reasoningStartMs = performance.now();
                                    reasoning = (reasoning || '') + ext.r;
                                }
                                if (text && !reasoningDone && reasoning) {
                                    reasoningDone = true;
                                    data._finalReasoningMs = performance.now() - reasoningStartMs;
                                }
                                if (typeof onChunk === 'function') {
                                    const rMs = reasoningDone && data._finalReasoningMs ? data._finalReasoningMs : (reasoningStartMs !== null ? performance.now() - reasoningStartMs : null);
                                    onChunk(text, reasoning, rMs, reasoningDone);
                                }
                            } catch (e) {}
                        }
                    }
                }
            } else {
                const data = await res.json();
                const ext = deepExtract(data);
                text = ext.t || '';
                reasoning = ext.r;
            }
        } catch (e) {
            state.abortController = null;
            if (abort.signal.aborted || e?.name === 'AbortError') return null;
            throw e;
        }

        state.abortController = null;
        return { text: text.trim(), reasoning, isMaxTokens: false };
    }

    const service = ctx.ConnectionManagerRequestService;
    let profiles = [];
    if (service && typeof service.getSupportedProfiles === 'function') {
        profiles = service.getSupportedProfiles();
    } else {
        profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
    }

    let useConnectionManager = false;
    let profileId = null;

    if (settings.connectionSource === 'profile') {
        if (settings.connectionProfileId) {
            const found = profiles.find(p =>
                p.id === settings.connectionProfileId || p.name === settings.connectionProfileId
            );
            if (found) {
                profileId = found.id;
                useConnectionManager = true;
            } else {
                throw new Error(`Connection profile "${settings.connectionProfileId}" not found. Available: ${profiles.map(p => p.name).join(', ') || 'None'}`);
            }
        } else {
            throw new Error('No profile selected in Inner Voice settings.');
        }
    } else if (settings.connectionSource !== 'custom') {
        const domSelect = document.getElementById('connection_profiles');
        if (domSelect && domSelect.value) {
            profileId = domSelect.value;
        } else if (ctx.extensionSettings?.connectionManager?.selectedProfile) {
            profileId = ctx.extensionSettings.connectionManager.selectedProfile;
        }
        
        if (profileId) {
            useConnectionManager = true;
        }
    }

    let asyncGeneratorFn;
    const origFetch = window.fetch;
    
    window.fetch = async function(...args) {
        let requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if ((requestUrl.includes('/generate') || requestUrl.includes('/caption-image')) && args[1] && typeof args[1].body === 'string') {
            try {
                let reqBody = JSON.parse(args[1].body);
                let changed = false;
                
                if (reqBody.reasoning_effort === 'auto') { delete reqBody.reasoning_effort; changed = true; }
                else if (reqBody.reasoning_effort === 'min') { reqBody.reasoning_effort = 'low'; changed = true; }
                else if (reqBody.reasoning_effort === 'max') { reqBody.reasoning_effort = 'high'; changed = true; }

                if (reqBody.reasoning && typeof reqBody.reasoning === 'object') {
                    if (reqBody.reasoning.effort === 'auto') { delete reqBody.reasoning.effort; changed = true; }
                    else if (reqBody.reasoning.effort === 'min') { reqBody.reasoning.effort = 'low'; changed = true; }
                    else if (reqBody.reasoning.effort === 'max') { reqBody.reasoning.effort = 'high'; changed = true; }
                }

                if (reqBody.custom_prompt_post_processing === '') { delete reqBody.custom_prompt_post_processing; changed = true; }
                if (reqBody.request_image_resolution === '') { delete reqBody.request_image_resolution; changed = true; }
                if (reqBody.request_image_aspect_ratio === '') { delete reqBody.request_image_aspect_ratio; changed = true; }

                if (reqBody.chat_completion_source === 'zai' || (typeof reqBody.model === 'string' && reqBody.model.toLowerCase().includes('glm'))) {
                    if (reqBody.reasoning_effort !== undefined) { delete reqBody.reasoning_effort; changed = true; }
                    if (reqBody.reasoning !== undefined) { delete reqBody.reasoning; changed = true; }
                    if (Array.isArray(reqBody.messages)) {
                        reqBody.messages.forEach(m => { if (m.name !== undefined) { delete m.name; changed = true; } });
                    }
                }
                
                if (changed) args[1].body = JSON.stringify(reqBody);
            } catch(_) {}
        }
        return origFetch.apply(this, args);
    };

    try {
        if (useConnectionManager && service && typeof service.sendRequest === 'function') {
            asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                stream: useStream,
                signal: abort.signal,
                extractData: false,
                includePreset: true
            });
        } else {
            const mainApi = window.main_api || ctx.main_api;
            if (mainApi === 'openai' && ctx.ChatCompletionService) {
                const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                    messages: messages,
                    max_tokens: maxTokens,
                    stream: useStream
                }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
            } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                    prompt: messages,
                    max_tokens: maxTokens,
                    stream: useStream
                }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
            } else {
                throw new Error('No active API connection found. Please select a profile in Connection Manager or configure the main API.');
            }
        }
    } catch (e) {
        if (useStream && !abort.signal.aborted && e?.name !== 'AbortError' && e?.message !== 'userStopped') {
            console.warn(`[${EXT_DISPLAY}] Streaming failed, falling back to non-streaming:`, e);
            _dbgAdd('GEN_STREAM_FALLBACK', { error: e.message || String(e) });
            useStream = false;
            try {
                if (useConnectionManager && service && typeof service.sendRequest === 'function') {
                    asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                        stream: false,
                        signal: abort.signal,
                        extractData: false,
                        includePreset: true
                    });
                } else {
                    const mainApi = window.main_api || ctx.main_api;
                    if (mainApi === 'openai' && ctx.ChatCompletionService) {
                        const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                        asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                            messages: messages,
                            max_tokens: maxTokens,
                            stream: false
                        }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
                    } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                        const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                        asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                            prompt: messages,
                            max_tokens: maxTokens,
                            stream: false
                        }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
                    }
                }
            } catch (err2) {
                state.abortController = null;
                if (abort.signal.aborted || err2?.name === 'AbortError' || err2?.message === 'userStopped') return null;
                if (err2.cause) err2.message = `${err2.message} — CAUSE: ${err2.cause.message || String(err2.cause)}`;
                throw err2;
            }
        } else {
            state.abortController = null;
            if (abort.signal.aborted || e?.name === 'AbortError' || e?.message === 'userStopped') return null;
            if (e.cause) e.message = `${e.message} — CAUSE: ${e.cause.message || String(e.cause)}`;
            throw e;
        }
    } finally {
        window.fetch = origFetch;
    }

    let text = '';
    let reasoning = null;
    let reasoningStartMs = null;
    let reasoningDone = false;

    const isGen = typeof asyncGeneratorFn === 'function' ||
        (asyncGeneratorFn != null && typeof asyncGeneratorFn[Symbol.asyncIterator] === 'function') ||
        (asyncGeneratorFn != null && typeof asyncGeneratorFn.next === 'function');

    let lastValue = null;

    if (!isGen) {
        const value = asyncGeneratorFn;
        if (typeof value === 'string') {
            text = value.trim();
        } else {
            const ext = deepExtract(value);
            text = ext.t.trim();
            reasoning = ext.r;
            lastValue = value;
        }
        
        const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
        const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';

        state.abortController = null;
        return { text, reasoning, isMaxTokens };
    }

    const gen = typeof asyncGeneratorFn === 'function' ? asyncGeneratorFn() : asyncGeneratorFn;

    try {
        while (true) {
            if (abort.signal.aborted) { state.abortController = null; return null; }
            const { value, done } = await gen.next();
            if (done) {
                if (value) lastValue = value;
                break;
            }
            lastValue = value;

            const ext = deepExtract(value);
            text = ext.t;
            const newReasoning = ext.r;

            if (newReasoning) {
                if (reasoningStartMs === null) reasoningStartMs = performance.now();
                reasoning = newReasoning;
            }
            if (text && !reasoningDone && reasoning) {
                reasoningDone = true;
                lastValue._finalReasoningMs = performance.now() - reasoningStartMs;
            }

            if (typeof onChunk === 'function') {
                const reasoningMs = reasoningDone && lastValue?._finalReasoningMs 
                    ? lastValue._finalReasoningMs 
                    : (reasoningStartMs !== null ? performance.now() - reasoningStartMs : null);
                onChunk(text, reasoning, reasoningMs, reasoningDone);
            }
        }
    } catch (e) {
        state.abortController = null;
        if (abort.signal.aborted || e?.name === 'AbortError' || e?.message === 'userStopped') return null;
        throw e;
    }

    const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
    const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';

    state.abortController = null;
    return { text: text.trim(), reasoning, isMaxTokens };
}

export async function runGenerate(conversation, userText, addUserMsg = true) {
    if (state.generating) return;
    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    let streamMsgId = null;
    let streamMsgEl = null;
    let streamContentEl = null;
    let streamReasoningBlockEl = null;
    let streamReasoningSummaryEl = null;
    let streamReasoningContentEl = null;
    let cursorEl = null;
    let isStreaming = false;
    let streamAccumText = '';
    let streamAccumReasoning = null;

    const cleanupCursor = () => {
        if (cursorEl && cursorEl.parentNode) cursorEl.remove();
        cursorEl = null;
    };

    const onChunk = (text, reasoning, reasoningMs, reasoningDone) => {
        isStreaming = true;
        streamAccumText = text;
        streamAccumReasoning = reasoning;

        if (!streamMsgId) {
            const placeholder = { id: `msg_${Date.now()}`, role: 'assistant', content: '', reasoning: null, timestamp: Date.now(), anchorIndex: getLiveEdgeIndex() };
            conversation.messages.push(placeholder);
            streamMsgId = placeholder.id;
            
            appendMsgEl(placeholder, true);
            
            streamMsgEl = document.querySelector(`.iv-msg[data-id="${streamMsgId}"]`);
            if (streamMsgEl) {
                const body = streamMsgEl.querySelector('.iv-msg-body');
                streamContentEl = streamMsgEl.querySelector('.iv-msg-content');

                streamReasoningBlockEl = document.createElement('details');
                streamReasoningBlockEl.className = 'iv-reasoning-block';
                streamReasoningBlockEl.style.display = 'none';
                streamReasoningSummaryEl = document.createElement('summary');
                streamReasoningSummaryEl.className = 'iv-reasoning-summary';
                streamReasoningSummaryEl.textContent = 'Thinking…';
                streamReasoningContentEl = document.createElement('div');
                streamReasoningContentEl.className = 'iv-reasoning-content';
                streamReasoningBlockEl.appendChild(streamReasoningSummaryEl);
                streamReasoningBlockEl.appendChild(streamReasoningContentEl);
                if (body) body.insertBefore(streamReasoningBlockEl, streamContentEl);

                cursorEl = document.createElement('span');
                cursorEl.className = 'iv-stream-cursor';

                const bar = document.getElementById('iv-thinking-bar');
                if (bar) bar.style.display = 'flex';
            }
        }

        if (streamContentEl) {
            let procReasoning = reasoning || '';
            let procText = visibleAssistantText(text);
            
            let tcIndex = 0;
            if (procReasoning) {
                const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                procReasoning = resR.text;
                tcIndex = resR.nextIndex;
            }
            const resC = extractToolCallPlaceholders(procText, tcIndex);
            procText = resC.text;

            if (reasoning && streamReasoningBlockEl) {
                streamReasoningBlockEl.style.display = '';
                streamReasoningContentEl.innerHTML = renderMarkdown(procReasoning);
                postProcessHTMLBlocks(streamReasoningContentEl);
                const secs = reasoningMs ? (reasoningMs / 1000).toFixed(1) : null;
                streamReasoningSummaryEl.textContent = reasoningDone
                    ? `Thought for ${secs}s`
                    : secs ? `Thinking for ${secs}s…` : 'Thinking…';
            }

            streamContentEl.innerHTML = renderMarkdown(procText);
            if (procText) streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (state.activeToolCalls.length || tcIndex > 0) {
                const liveTCs = parseToolCallsFromText((reasoning || '') + '\n' + text);
                const displayed = liveTCs.map((tc, i) => state.activeToolCalls[i] || {
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'running', result: undefined
                });
                postProcessToolCalls(streamMsgEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    try {
        if (addUserMsg && userText) {
            const msgObj = addTurn(conversation, 'user', userText);
            appendMsgEl(msgObj);
        }

        const fullMessages = await assembleMessages(conversation, settings, userText || null);
        const fullPromptText = fullMessages.map(m => m.content).join('\n');
        const tokensIn = await estimateTokens(fullPromptText);

        _dbgAdd('GEN_START', {
            src: settings.connectionSource,
            profile: settings.connectionProfileId || null,
            maxTokens: settings.maxTokens,
            streaming: settings.forceStreaming,
            ctxDepth: settings.contextDepth,
            tokensIn
        });

        let result = await callGenerate(conversation, settings, userText || null, onChunk);

        cleanupCursor();
        
        if (result && !result.text.trim() && !result.reasoning?.trim()) {
            toastr.warning('⚠ Generation failed: AI returned an empty response.', EXT_DISPLAY, { timeOut: 10000 });
        }

        if (result !== null && !splitPortraySignal(result.text || '').triggered
            && settings.toolsEnabled && getEnabledTools().length > 0) {
            const maxRounds = settings.toolsMaxRounds ?? 5;
            let roundText = result.text || '';
            let roundReasoning = result.reasoning;
            let extraHistory = [];

            let accumulatedText = roundText;
            let accumulatedReasoning = roundReasoning || null;

            const _updateLiveUI = (tempText = '', tempReasoning = null) => {
                if (!streamMsgEl || !streamContentEl) return;
                let combinedText = tempText ? accumulatedText + '\n\n' + tempText : accumulatedText;
                let combinedReasoning = accumulatedReasoning || '';
                if (tempReasoning) {
                    combinedReasoning = combinedReasoning ? combinedReasoning + '\n\n' + tempReasoning : tempReasoning;
                }
                
                let procReasoning = combinedReasoning;
                let procText = visibleAssistantText(combinedText);
                let tcIndex = 0;
                
                if (procReasoning) {
                    const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                    procReasoning = resR.text;
                    tcIndex = resR.nextIndex;
                }
                const resC = extractToolCallPlaceholders(procText, tcIndex);
                procText = resC.text;

                if (combinedReasoning && streamReasoningBlockEl) {
                    streamReasoningBlockEl.style.display = '';
                    streamReasoningContentEl.innerHTML = renderMarkdown(procReasoning);
                    postProcessHTMLBlocks(streamReasoningContentEl);
                }
                streamContentEl.innerHTML = renderMarkdown(procText);
                postProcessHTMLBlocks(streamContentEl);

                if (state.activeToolCalls.length || tcIndex > 0) {
                    postProcessToolCalls(streamMsgEl, state.activeToolCalls);
                }
                smartScrollToBottom();
            };

            for (let round = 0; round < maxRounds; round++) {
                let tcs = parseToolCallsFromText(roundText);
                if (!tcs.length) break;

                const roundEntries = [];
                for (const tc of tcs) {
                    const tcId = `tc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
                    const entry = { id: tcId, name: tc.name, input: tc.input, status: 'running', result: undefined };
                    state.activeToolCalls.push(entry);
                    roundEntries.push(entry);
                    
                    _updateLiveUI();

                    try {
                        const res = await executeTool(tc.name, tc.input);
                        if (res?.__ask_user) {
                            if (!streamMsgEl) {
                                entry.result = { warning: 'ask_user requires streaming to be enabled.' };
                                entry.status = 'warning';
                            } else {
                                entry.result = await executeAskUser(res, streamMsgEl);
                                entry.status = 'done';
                            }
                        } else if (res?.__imagePending) {
                            entry.result = res.sentinel;
                            entry.status = 'done';
                        } else {
                            entry.result = res?.result && res?.sentinel ? res.sentinel : res;
                            entry.status = 'done';
                        }
                    } catch (e) {
                        _dbgAdd('TOOL_EXECUTION_FAILED', { toolName: tc.name, error: e.message });
                        entry.result = { error: e.message };
                        entry.status = 'error';
                    }
                    
                    _updateLiveUI();
                }

                extraHistory.push({ role: 'assistant', content: visibleAssistantText(roundText) });
                const toolResultsText = roundEntries.map(e =>
                    `<tool_result name="${e.name}" status="${e.status}">\n${typeof e.result === 'string' ? e.result : JSON.stringify(e.result, null, 2)}\n</tool_result>`
                ).join("\n");

                extraHistory.push({ role: 'user', content: `<tool_results>\n${toolResultsText}\n</tool_results>\n\nCONTINUE your response using these results. Write exactly where you left off.` });

                const thinkingText = document.getElementById('iv-thinking-text');
                if (thinkingText) thinkingText.textContent = `Round ${round + 2}/${maxRounds + 1}…`;
                const bar = document.getElementById('iv-thinking-bar');
                if (bar) bar.style.display = 'flex';

                for (const eh of extraHistory) {
                    conversation.messages.push({ id: `tc_hist_${Date.now()}`, role: eh.role, content: eh.content, timestamp: Date.now(), _tcTemp: true });
                }

                isStreaming = false;
                streamAccumText = '';
                const cursor2 = document.createElement('span');
                cursor2.className = 'iv-stream-cursor';
                
                const tempConversation = { 
                    ...conversation, 
                    messages: conversation.messages.filter(m => m.id !== streamMsgId) 
                };

                const nextResult = await callGenerate(tempConversation, settings, null, (t, r) => {
                    _updateLiveUI(t, r);
                    if (streamContentEl) streamContentEl.appendChild(cursor2);
                });

                conversation.messages = conversation.messages.filter(m => !m._tcTemp);
                cursor2.remove();

                if (nextResult === null) break;

                roundText = nextResult.text || '';
                roundReasoning = nextResult.reasoning || null;
                
                accumulatedText += '\n\n' + roundText;
                if (roundReasoning) {
                    accumulatedReasoning = accumulatedReasoning ? accumulatedReasoning + '\n\n' + roundReasoning : roundReasoning;
                }
                
                result = { text: accumulatedText, reasoning: accumulatedReasoning };
            }
        }

        if (result === null) {
            if (streamMsgId && isStreaming && streamAccumText) {
                const msg = conversation.messages.find(m => m.id === streamMsgId);
                const visible = visibleAssistantText(streamAccumText);
                if (msg) { msg.content = visible; msg.reasoning = streamAccumReasoning || null; saveConversation(); }
                if (streamContentEl) { streamContentEl.innerHTML = renderMarkdown(visible); postProcessHTMLBlocks(streamContentEl); }
            } else if (streamMsgId) {
                const idx = conversation.messages.findIndex(m => m.id === streamMsgId);
                if (idx >= 0 && !conversation.messages[idx].content) {
                    conversation.messages.splice(idx, 1);
                    streamMsgEl?.remove();
                    updateMsgCount(conversation);
                }
            }
            return null;
        }

        const { text: rawFullText, reasoning: fullReasoning } = result;
        const rawNormalized = normalizeCharNamesInBlock(rawFullText);
        const { triggered } = splitPortraySignal(rawNormalized);
        processMemoryUpdates(rawNormalized, streamMsgId);
        const fullText = visibleAssistantText(rawNormalized);

        const savedToolCalls = state.activeToolCalls.length ? sanitizeToolCallsForSave(JSON.parse(JSON.stringify(state.activeToolCalls))) : undefined;

        let completedAssistant = null;
        if (streamMsgId) {
            const msg = conversation.messages.find(m => m.id === streamMsgId);
            if (msg) { 
                msg.content = fullText; 
                msg.reasoning = fullReasoning || null; 
                msg.toolCalls = savedToolCalls; 
                msg.swipes = [{ content: fullText, reasoning: fullReasoning || null }];
                msg.swipeIndex = 0;
                completedAssistant = msg;
            }
            saveConversation();

            if (msg && streamMsgEl) {
                _renderMsgBodyContent(streamMsgEl, msg);
            }
        } else {
            const newMsg = addTurn(conversation, 'assistant', fullText, { reasoning: fullReasoning || null, toolCalls: savedToolCalls });
            newMsg.swipes = [{ content: fullText, reasoning: fullReasoning || null }];
            newMsg.swipeIndex = 0;
            saveConversation();
            appendMsgEl(newMsg);
            completedAssistant = newMsg;
        }
        if (completedAssistant) await notePortrayAutoTrigger(completedAssistant, { triggered });

        _refreshSwipeBars(conversation);
        state.activeToolCalls = [];

        const tokensOut = await estimateTokens(fullText);

        playCompletionSound();
        _dbgAdd('GEN_DONE', { chars: fullText?.length || 0, hasReasoning: !!fullReasoning, tokensOut });
        return completedAssistant;

    } catch (err) {
        cleanupCursor();
        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') {
            state.generating = false;
            setGeneratingState(false);
            return null;
        }
        
        const inputEl = document.getElementById('iv-input');
        if (inputEl && inputEl.value.trim() === '' && userText) {
            inputEl.value = userText;
        }

        _dbgAdd('GEN_ERROR', { msg: err?.message || String(err), stack: err?.stack });
        console.error(`[${EXT_DISPLAY}] Generation failed:`, err);
        
        showGenerationError(err);
        return null;
    } finally {
        state.generating = false;
        setGeneratingState(false);
        await flushPortrayAutoTrigger();
    }
}

export function _joinContinuation(existing, continuation) {
    if (!continuation) return existing;
    const trimmed = existing.trimEnd();
    const needsSpace = /[\w.,!?;:'")\]}>]$/.test(trimmed);
    return trimmed + (needsSpace ? ' ' : '') + continuation;
}

export async function runContinue(conversation, targetMsgId) {
    _dbgAdd('CONTINUE_TRIGGERED', { targetMsgId });
    
    if (state.generating) return;
    const targetMsg = conversation.messages.find(m => m.id === targetMsgId);
    if (!targetMsg || targetMsg.role !== 'assistant') return;

    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    const CONTINUE_PROMPT = 'Continue your response exactly from where you left off. Do not repeat any previously written text.';

    let streamContentEl = null;
    let cursorEl = null;
    let isStreaming = false;
    let streamAccumContinuation = '';
    const originalContent = targetMsg.content;

    const targetEl = document.querySelector(`.iv-msg[data-id="${targetMsgId}"]`);
    if (targetEl) streamContentEl = targetEl.querySelector('.iv-msg-content');

    const cleanupCursor = () => {
        if (cursorEl && cursorEl.parentNode) cursorEl.remove();
        cursorEl = null;
    };

    const onChunk = (text) => {
        isStreaming = true;
        streamAccumContinuation = text;
        if (!cursorEl) {
            cursorEl = document.createElement('span');
            cursorEl.className = 'iv-stream-cursor';
            const bar = document.getElementById('iv-thinking-bar');
            if (bar) bar.style.display = 'flex';
        }
        const combined = _joinContinuation(originalContent, text);
        let tcIndex = 0;
        const resC = extractToolCallPlaceholders(combined, tcIndex);
        let procText = resC.text;

        const { content: disp } = getDisplayContent(procText, settings);
        if (streamContentEl) {
            streamContentEl.innerHTML = renderMarkdown(disp);
            streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (resC.nextIndex > 0) {
                const liveTCs = parseToolCallsFromText(combined);
                const displayed = liveTCs.map((tc, i) => targetMsg.toolCalls?.[i] || {
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'done', result: undefined
                });
                postProcessToolCalls(targetEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    const _applyFinalContinuation = (fullCombined) => {
        const { content: disp } = getDisplayContent(fullCombined, settings);
        if (streamContentEl) { streamContentEl.innerHTML = renderMarkdown(disp); postProcessHTMLBlocks(streamContentEl); }
        _renderMsgBodyContent(targetEl, targetMsg);
    };

    try {
        const fullMessages = await assembleMessages(conversation, settings, CONTINUE_PROMPT);
        const fullPromptText = fullMessages.map(m => m.content).join('\n');
        
        const tokensIn = await estimateTokens(fullPromptText);

        _dbgAdd('CONTINUE_START', {
            src: settings.connectionSource,
            maxTokens: settings.maxTokens,
            streaming: settings.forceStreaming,
            ctxDepth: settings.contextDepth,
            tokensIn
        });

        const result = await callGenerate(conversation, settings, CONTINUE_PROMPT, onChunk);
        cleanupCursor();

        if (result === null) {
            if (isStreaming && streamAccumContinuation) {
                const combined = _joinContinuation(originalContent, streamAccumContinuation);
                targetMsg.content = combined;
                if (targetMsg.swipes && targetMsg.swipeIndex !== undefined) {
                    targetMsg.swipes[targetMsg.swipeIndex] = { content: combined, reasoning: targetMsg.reasoning || null };
                }
                saveConversation();
                _applyFinalContinuation(combined);
            }
            return;
        }

        const { text: rawContinuation, isMaxTokens } = result;
        processMemoryUpdates(rawContinuation, targetMsgId);
        const continuation = visibleAssistantText(rawContinuation);
        const combined = _joinContinuation(originalContent, continuation);
        
        if (isMaxTokens) {
            toastr.warning('Generation stopped: reached Max Response Tokens limit.', EXT_DISPLAY, { timeOut: 10000 });
        }

        targetMsg.content = combined;

        if (targetMsg.swipes && targetMsg.swipeIndex !== undefined) {
            targetMsg.swipes[targetMsg.swipeIndex] = { content: combined, reasoning: targetMsg.reasoning || null };
        }
        saveConversation();
        _applyFinalContinuation(combined);

        const tokensOut = await estimateTokens(continuation);

        updateMsgCount(conversation);
        playCompletionSound();
        _dbgAdd('CONTINUE_DONE', { chars: continuation?.length || 0, tokensOut });

    } catch (err) {
        cleanupCursor();
        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') {
            state.generating = false;
            setGeneratingState(false);
            return;
        }
        _dbgAdd('GEN_ERROR', { msg: err?.message || String(err), stack: err?.stack });
        console.error(`[${EXT_DISPLAY}] Continuation failed:`, err);

        showGenerationError(err);
    } finally {
        state.generating = false;
        setGeneratingState(false);
    }
}
