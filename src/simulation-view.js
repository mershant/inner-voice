import { getConversation, getExchanges, getOrderedExchangeParts, isExchangeHidden, getEffectiveSettings } from './conversation.js';
import { USER_VOICE, prepareVoiceMacroForHostPrompt } from './voice.js';

// Retired depth prompts are cleared on upgrade. Context now belongs to the
// host's temporary anchor message, so token selection cannot orphan it.
const KEY_PREFIX = 'inner_voice_exchange_';

function parseDepth(value) {
    if (value === undefined || value === null) return 1;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 1;
}

function depthForVoice(settings, ownerVoice) {
    if (!ownerVoice || ownerVoice === USER_VOICE) return parseDepth(settings.exchangeDepth);
    return parseDepth(settings.otherVoicesDepth);
}

function visibleAnchoredExchanges(conversation) {
    return getExchanges(conversation).filter(e =>
        e.anchorIndex !== null && e.anchorIndex !== undefined
        && !isExchangeHidden(conversation, e.anchorIndex, e.ownerVoice, e.mode)
    );
}

export const EXCHANGE_BLOCK_FRAME = "This is {{voice}}'s private inner exchange — one mind talking to itself — imperceptible to everyone except {{voice}}. IV: is the Inner Voice; {{voice}}: is {{voice}}.";

export function renderExchangeBlock(turns, ownerVoice = USER_VOICE, mode = 'iv') {
    if (mode === 'chat') {
        const body = (turns || []).map(t => `${t.role === 'assistant' ? '{{voice}}' : '{{user}}'}: ${t.content}`).join('\n');
        return prepareVoiceMacroForHostPrompt(`<scene-conversation>\nThis actual conversation between {{user}} and {{voice}}, including its actions, happened at this point in the simulation. Continue after its last turn. Who heard or witnessed it follows the scene, not the model's access to this transcript.\n\n${body}\n</scene-conversation>`, ownerVoice);
    }
    const body = (turns || []).map(t => {
        const label = t.role === 'assistant' ? '{{voice}}' : 'IV';
        return `${label}: ${t.content}`;
    }).join('\n');
    return prepareVoiceMacroForHostPrompt(
        `<inner-exchange>\n${EXCHANGE_BLOCK_FRAME}\n\n${body}\n</inner-exchange>`,
        ownerVoice,
    );
}

export function assembleSimulationView(conversation, settings, chatLength) {
    if (!chatLength) return [];
    const byVoice = new Map();
    const selectedTurns = new Set();
    for (const e of visibleAnchoredExchanges(conversation)) {
        if (e.anchorIndex < 0 || e.anchorIndex >= chatLength) continue;
        if (e.mode === 'chat') {
            e.turns.forEach(t => selectedTurns.add(t));
            continue;
        }
        const voice = e.ownerVoice || USER_VOICE;
        if (!byVoice.has(voice)) byVoice.set(voice, []);
        byVoice.get(voice).push(e);
    }
    for (const [voice, exchanges] of byVoice) {
        const n = depthForVoice(settings, voice);
        if (n === 0) continue;
        exchanges.slice(-n).forEach(e => e.turns.forEach(t => selectedTurns.add(t)));
    }
    return getOrderedExchangeParts(conversation, t => selectedTurns.has(t)).map(e => ({
        anchorIndex: e.anchorIndex,
        ownerVoice: e.ownerVoice,
        mode: e.mode,
        depth: Math.max(0, chatLength - 1 - e.anchorIndex),
        content: renderExchangeBlock(e.turns, e.ownerVoice, e.mode),
    }));
}

export function syncSimulationView() {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') return;
    for (const key of Object.keys(ctx.extensionPrompts || {})) {
        if (key.startsWith(KEY_PREFIX)) ctx.setExtensionPrompt(key, '', 1, 0, false, 0);
    }
}

// ST supplies prompt-only message copies with `index` in its filtered core
// chat (script.js, before runGenerationInterceptors). Preserve that identity
// through earlier interceptors; never match by text, which may repeat/regex.
export function injectSimulationView(coreChat) {
    syncSimulationView();
    const ctx = SillyTavern.getContext();
    const settings = getEffectiveSettings();
    if (!settings.enabled || !Array.isArray(coreChat)) return;
    const canUseTools = ctx.isToolCallingSupported?.() || false;
    const anchors = (ctx.chat || []).map((m, anchorIndex) => ({ m, anchorIndex }))
        .filter(({ m }) => !m.is_system || (canUseTools && Array.isArray(m.extra?.tool_invocations)));
    const attached = new Map();
    for (const part of assembleSimulationView(getConversation(), settings, ctx.chat?.length || 0)) {
        if (!attached.has(part.anchorIndex)) attached.set(part.anchorIndex, []);
        attached.get(part.anchorIndex).push(part.content);
    }
    for (let i = 0; i < coreChat.length; i++) {
        const message = coreChat[i];
        if (!Number.isInteger(message.index)) continue;
        const parts = attached.get(anchors[message.index]?.anchorIndex);
        if (!parts?.length) continue;
        const content = parts.join('\n\n');
        const expanded = typeof ctx.substituteParams === 'function' ? ctx.substituteParams(content) : content;
        coreChat[i] = { ...message, mes: `${message.mes}\n\n${expanded}` };
    }
}
