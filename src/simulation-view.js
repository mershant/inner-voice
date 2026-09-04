import { getConversation, getExchanges, isExchangeHidden, getEffectiveSettings } from './conversation.js';

// SillyTavern in-chat injection. Depth 0 is after the last message.
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const KEY_PREFIX = 'inner_voice_exchange_';

const _activeKeys = new Set();

function promptKey(anchorIndex) {
    return `${KEY_PREFIX}${anchorIndex}`;
}

function exchangeDepthOf(settings) {
    if (settings.exchangeDepth === undefined || settings.exchangeDepth === null) return 1;
    const n = parseInt(settings.exchangeDepth, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 1;
}

function visibleAnchoredExchanges(conversation) {
    return getExchanges(conversation).filter(e =>
        e.anchorIndex !== null && e.anchorIndex !== undefined
        && !isExchangeHidden(conversation, e.anchorIndex)
    );
}

export function renderExchangeBlock(turns) {
    const body = (turns || []).map(t => {
        const label = t.role === 'assistant' ? '{{user}}' : 'IV';
        return `${label}: ${t.content}`;
    }).join('\n');
    const explanation = "This is {{user}}'s private inner exchange — one mind talking to itself. NPCs and the World cannot perceive it. IV: is the Inner Voice; {{user}}: is {{user}}.";
    return `<inner-exchange>\n${explanation}\n\n${body}\n</inner-exchange>`;
}

export function assembleSimulationView(conversation, settings, chatLength) {
    const n = exchangeDepthOf(settings);
    if (n === 0 || !chatLength) return [];
    const selected = visibleAnchoredExchanges(conversation).slice(-n);
    return selected.map(e => ({
        anchorIndex: e.anchorIndex,
        depth: Math.max(0, chatLength - 1 - e.anchorIndex),
        content: renderExchangeBlock(e.turns),
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
        const key = promptKey(inj.anchorIndex);
        nextKeys.add(key);
        ctx.setExtensionPrompt(key, inj.content, IN_CHAT, inj.depth, false, SYSTEM_ROLE);
    }
    for (const key of _activeKeys) {
        if (!nextKeys.has(key)) ctx.setExtensionPrompt(key, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    }
    _activeKeys.clear();
    for (const key of nextKeys) _activeKeys.add(key);
}
