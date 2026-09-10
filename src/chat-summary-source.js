import {
    getConversation,
    getOrderedExchangeParts,
    isExchangeManuallyHidden,
    turnMode,
    getChatSourceState,
} from './conversation.js';
import { USER_VOICE, resolveVoiceName } from './voice.js';

export function collectChatSummarySource({
    chatId,
    startIndex,
    endIndex,
    sourceStatus,
    loadedChatId,
    conversation,
    personaName,
}) {
    if (sourceStatus !== 'ready') {
        return { status: 'unavailable', reason: 'not-ready' };
    }
    if (chatId !== undefined && chatId !== null && String(chatId) !== String(loadedChatId)) {
        return { status: 'unavailable', reason: 'chat-mismatch' };
    }
    if (!conversation || !Array.isArray(conversation.messages)) {
        return { status: 'unavailable', reason: 'not-ready' };
    }
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
        return { status: 'unavailable', reason: 'not-ready' };
    }

    const parts = [];
    for (const run of getOrderedExchangeParts(conversation, turn => {
        if (turnMode(turn) !== 'chat') return false;
        if (!turn.content || turn._tcTemp) return false;
        const anchor = turn.anchorIndex;
        if (!Number.isInteger(anchor) || anchor < startIndex || anchor > endIndex) return false;
        const ownerVoice = turn.ownerVoice || USER_VOICE;
        if (isExchangeManuallyHidden(conversation, anchor, ownerVoice, 'chat')) return false;
        return true;
    })) {
        const ownerVoice = run.ownerVoice || USER_VOICE;
        parts.push({
            anchorIndex: run.anchorIndex,
            ownerVoice,
            personaLabel: personaName || resolveVoiceName(USER_VOICE),
            characterLabel: resolveVoiceName(ownerVoice),
            turns: run.turns.map(turn => ({ role: turn.role, content: turn.content })),
        });
    }

    return { status: 'ok', parts };
}

export function innerVoiceChatSummarySource({ chatId, startIndex, endIndex } = {}) {
    const state = getChatSourceState();
    return collectChatSummarySource({
        chatId,
        startIndex,
        endIndex,
        sourceStatus: state.status,
        loadedChatId: state.chatId,
        conversation: getConversation(),
        personaName: resolveVoiceName(USER_VOICE),
    });
}
