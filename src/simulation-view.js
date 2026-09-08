import { getConversation, getExchanges, isExchangeHidden, getEffectiveSettings } from './conversation.js';
import { USER_VOICE, prepareVoiceMacroForHostPrompt } from './voice.js';

// SillyTavern in-chat injection. Depth 0 is after the last message.
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const KEY_PREFIX = 'inner_voice_exchange_';

const _activeKeys = new Set();

function promptKey(anchorIndex, ownerVoice = USER_VOICE) {
    if (!ownerVoice || ownerVoice === USER_VOICE) return `${KEY_PREFIX}${anchorIndex}`;
    return `${KEY_PREFIX}${anchorIndex}:${ownerVoice}`;
}

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
        && !isExchangeHidden(conversation, e.anchorIndex, e.ownerVoice)
    );
}

export const EXCHANGE_BLOCK_FRAME = "This is {{voice}}'s private inner exchange — one mind talking to itself — imperceptible to everyone except {{voice}}. IV: is the Inner Voice; {{voice}}: is {{voice}}.";

export function renderExchangeBlock(turns, ownerVoice = USER_VOICE) {
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
    for (const e of visibleAnchoredExchanges(conversation)) {
        const voice = e.ownerVoice || USER_VOICE;
        if (!byVoice.has(voice)) byVoice.set(voice, []);
        byVoice.get(voice).push(e);
    }
    const selected = [];
    for (const [voice, exchanges] of byVoice) {
        const n = depthForVoice(settings, voice);
        if (n === 0) continue;
        selected.push(...exchanges.slice(-n));
    }
    return selected.map(e => ({
        anchorIndex: e.anchorIndex,
        ownerVoice: e.ownerVoice,
        depth: Math.max(0, chatLength - 1 - e.anchorIndex),
        content: renderExchangeBlock(e.turns, e.ownerVoice),
    }));
}

export function syncSimulationView() {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') return;

    const conv = getConversation();
    const settings = getEffectiveSettings();
    const chatLength = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    const injections = assembleSimulationView(conv, settings, chatLength);

    const nextKeys = new Set();
    for (const inj of injections) {
        const key = promptKey(inj.anchorIndex, inj.ownerVoice);
        nextKeys.add(key);
        ctx.setExtensionPrompt(key, inj.content, IN_CHAT, inj.depth, false, SYSTEM_ROLE);
    }
    for (const key of _activeKeys) {
        if (!nextKeys.has(key)) ctx.setExtensionPrompt(key, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    }
    _activeKeys.clear();
    for (const key of nextKeys) _activeKeys.add(key);
}
