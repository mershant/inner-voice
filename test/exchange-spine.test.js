import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: tools-parse.test.js) ──────────────────

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
};
globalThis.window = globalThis;
globalThis.toastr = { error() {}, warning() {}, success() {}, info() {} };

// In-memory stand-in for SillyTavern's user file storage.
const files = new Map();
globalThis.fetch = async (url, opts = {}) => {
    if (url === '/api/files/upload') {
        const body = JSON.parse(opts.body);
        files.set(body.name, body.data);
        return { ok: true, status: 200 };
    }
    const m = String(url).match(/^\/user\/files\/(.+)$/);
    if (m) {
        if (!files.has(m[1])) return { ok: false, status: 404 };
        return {
            ok: true,
            status: 200,
            text: async () => decodeURIComponent(escape(atob(files.get(m[1])))),
        };
    }
    return { ok: false, status: 500 };
};

// Mutable main-chat state the stub context exposes.
const stub = {
    chat: [],
    chatId: 'chat-a',
    chatMetadataByChat: { 'chat-a': {}, 'chat-b': {} },
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: 0,
            characters: [{ name: 'Char' }],
            name1: 'User',
            name2: 'Char',
            extensionSettings: {},
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadataByChat[stub.chatId]; },
            set chatMetadata(v) { stub.chatMetadataByChat[stub.chatId] = v; },
        };
    },
};

const {
    initConversation,
    commitConversation,
    getConversation,
    getLiveEdgeIndex,
    addTurn,
    addTurnAt,
    getExchanges,
    getExchangeAt,
    getLiveExchange,
} = await import('../src/conversation.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

async function resetChats() {
    files.clear();
    stub.chat = [mainMsg('Opening scene.')];
    stub.chatId = 'chat-a';
    stub.chatMetadataByChat = { 'chat-a': {}, 'chat-b': {} };
    await initConversation({ forceReset: true });
}

beforeEach(resetChats);

// ─── Anchoring ────────────────────────────────────────────────────────────────

test('a new turn anchors to the live edge', () => {
    stub.chat = [mainMsg('one'), mainMsg('two'), mainMsg('three')];
    const conv = getConversation();
    const turn = addTurn(conv, 'user', 'what is she planning?');
    assert.equal(getLiveEdgeIndex(), 2);
    assert.equal(turn.anchorIndex, 2);
});

test('turns under the same main-chat message form one exchange', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'she is lying, right?');
    addTurn(conv, 'assistant', 'Watch her hands. She always fidgets when she lies.');
    addTurn(conv, 'user', 'yeah. let us call it out.');

    const exchanges = getExchanges(conv);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].anchorIndex, 1);
    assert.equal(exchanges[0].turns.length, 3);

    // At most one exchange per main-chat message.
    const anchors = exchanges.map(e => e.anchorIndex);
    assert.equal(new Set(anchors).size, anchors.length);
});

test('an old segment rejects a new turn', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'thinking at the edge');
    stub.chat.push(mainMsg('three'));

    const before = conv.messages.length;
    const rejected = addTurnAt(conv, 1, 'user', 'thinking in the past');
    assert.equal(rejected, null);
    assert.equal(conv.messages.length, before);
    assert.equal(getExchangeAt(conv, 1).turns.length, 1);
});

test('advancing the main chat starts the next exchange at the new live edge', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'first thought');
    addTurn(conv, 'assistant', 'first answer');

    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'new thought');

    const exchanges = getExchanges(conv);
    assert.equal(exchanges.length, 2);
    // The previous exchange ended where it was left.
    assert.equal(exchanges[0].anchorIndex, 1);
    assert.equal(exchanges[0].turns.length, 2);
    // The next exchange lives at the new live edge.
    assert.equal(exchanges[1].anchorIndex, 2);
    assert.equal(exchanges[1].turns.length, 1);
    assert.deepEqual(getLiveExchange(conv).turns.map(t => t.content), ['new thought']);
});

test('turns before any main-chat message form a segment that closes once the story starts', () => {
    stub.chat = [];
    const conv = getConversation();
    const turn = addTurn(conv, 'user', 'pre-story thought');
    assert.equal(turn.anchorIndex, null);

    stub.chat.push(mainMsg('one'));
    assert.equal(addTurnAt(conv, null, 'user', 'still in the past'), null);
    const next = addTurn(conv, 'user', 'present thought');
    assert.equal(next.anchorIndex, 0);
    assert.equal(getExchanges(conv).length, 2);
});

// ─── Persistence with the main chat ──────────────────────────────────────────

test('the inner conversation persists and reloads with its main chat', async () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'remember this');
    addTurn(conv, 'assistant', 'I will.');
    await commitConversation(true);

    // Leave for another chat, then come back — reload from storage.
    stub.chatId = 'chat-b';
    stub.chat = [mainMsg('other story')];
    await initConversation();
    assert.equal(getConversation().messages.length, 0);

    stub.chatId = 'chat-a';
    stub.chat = [mainMsg('one'), mainMsg('two')];
    await initConversation();

    const reloaded = getConversation();
    assert.deepEqual(reloaded.messages.map(m => m.content), ['remember this', 'I will.']);
    assert.deepEqual(reloaded.messages.map(m => m.anchorIndex), [1, 1]);
});

test("switching main chats switches to that chat's inner conversation", async () => {
    const convA = getConversation();
    addTurn(convA, 'user', 'thought in A');
    await commitConversation(true);

    stub.chatId = 'chat-b';
    stub.chat = [mainMsg('b opening')];
    await initConversation();
    const convB = getConversation();
    assert.equal(convB.messages.length, 0);
    addTurn(convB, 'user', 'thought in B');
    await commitConversation(true);

    stub.chatId = 'chat-a';
    stub.chat = [mainMsg('Opening scene.')];
    await initConversation();
    assert.deepEqual(getConversation().messages.map(m => m.content), ['thought in A']);
});

test('a legacy multi-session bucket migrates into the single conversation', async () => {
    const legacyPayload = {
        _version: 4,
        chat_id_reference: 'chat-a',
        bucket: {
            activeSessionId: 's2',
            sessions: [
                { id: 's1', name: 'Session 1', messages: [{ id: 'm1', role: 'user', content: 'stale' }] },
                {
                    id: 's2', name: 'Session 2',
                    messages: [{ id: 'm2', role: 'user', content: 'kept thought' }],
                    overrides: { maxTokens: 1234 },
                    pickedChatIndices: [0],
                },
            ],
        },
    };
    files.set('legacy.json', btoa(unescape(encodeURIComponent(JSON.stringify(legacyPayload)))));
    stub.chatMetadataByChat['chat-a'] = {
        inner_voice: { format: 'v4', file_id: 'legacy.json', chat_id: 'chat-a' },
    };
    await initConversation();

    const conv = getConversation();
    assert.deepEqual(conv.messages.map(m => m.content), ['kept thought']);
    assert.equal(conv.overrides.maxTokens, 1234);
    assert.deepEqual(conv.pickedChatIndices, [0]);
});
