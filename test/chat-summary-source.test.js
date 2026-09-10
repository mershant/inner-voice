import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
    createElement() {
        return {
            style: {}, dataset: {},
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener() {}, appendChild() {}, setAttribute() {},
        };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {} },
};
globalThis.window = globalThis;
globalThis.toastr = { error() {}, warning() {}, success() {}, info() {} };

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

const stub = {
    chat: [],
    chatId: 'chat-a',
    chatMetadata: {},
    extensionSettings: {},
    extensionPrompts: {},
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: 0,
            characters: [{ name: 'Kyrine' }],
            name1: 'Alice',
            name2: 'Kyrine',
            extensionSettings: stub.extensionSettings,
            extensionPrompts: stub.extensionPrompts,
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadata; },
            set chatMetadata(v) { stub.chatMetadata = v; },
            setExtensionPrompt(key, value, position, depth, scan = false, role = 0) {
                stub.extensionPrompts[key] = { value: String(value), position, depth, scan, role };
            },
        };
    },
};

const {
    initConversation,
    getConversation,
    addTurn,
    setActiveVoice,
    setActiveMode,
    createVoiceSession,
    setExchangeHidden,
} = await import('../src/conversation.js');
const { innerVoiceChatSummarySource, collectChatSummarySource } = await import('../src/chat-summary-source.js');

function mainMsg(text, extra = {}) {
    return { mes: text, is_user: false, ...extra };
}

function contents(result) {
    return result.parts.flatMap(part => part.turns.map(turn => turn.content));
}

async function reset() {
    files.clear();
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = {};
    stub.extensionSettings = {};
    stub.extensionPrompts = {};
    await initConversation({ forceReset: true });
}

beforeEach(reset);

test('a summary range includes Chat on its last anchor and every character, ignoring the open page', async () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'Hold the lantern until dawn.', { ownerVoice: 'Mira', mode: 'chat' });
    addTurn(conv, 'assistant', 'I will keep it lit.', { ownerVoice: 'Mira', mode: 'chat' });
    stub.chat.push(mainMsg('Rain starts on the square.'));
    addTurn(conv, 'user', 'The cellar key is under the mat.', { ownerVoice: 'Ada', mode: 'chat' });
    addTurn(conv, 'assistant', 'I heard you.', { ownerVoice: 'Ada', mode: 'chat' });
    addTurn(conv, 'assistant', 'private worry', { ownerVoice: 'Mira', mode: 'iv' });

    createVoiceSession(conv, 'Mira');
    setActiveVoice(conv, 'Mira');
    setActiveMode(conv, 'iv');

    const first = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 0 });
    assert.equal(first.status, 'ok');
    assert.deepEqual(contents(first), ['Hold the lantern until dawn.', 'I will keep it lit.']);
    assert.equal(first.parts[0].personaLabel, 'Alice');
    assert.equal(first.parts[0].characterLabel, 'Mira');
    assert.equal(first.parts[0].anchorIndex, 0);

    const full = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 1 });
    assert.equal(full.status, 'ok');
    assert.deepEqual(contents(full), [
        'Hold the lantern until dawn.',
        'I will keep it lit.',
        'The cellar key is under the mat.',
        'I heard you.',
    ]);
    assert.equal(full.parts.map(part => part.characterLabel).join(','), 'Mira,Ada');
    assert.ok(!contents(full).includes('private worry'));
});

test('manually hidden Chat is omitted, IV and prompts are not source, and a range is included once', async () => {
    const conv = getConversation();
    conv.overrides = { chatSystemPrompt: 'You are writing future instructions, not events.' };
    addTurn(conv, 'user', 'Meet me at dawn.', { ownerVoice: 'Mira', mode: 'chat' });
    addTurn(conv, 'assistant', 'I will be there.', { ownerVoice: 'Mira', mode: 'chat' });
    addTurn(conv, 'user', 'Keep this thought private.', { ownerVoice: 'Mira', mode: 'iv' });
    addTurn(conv, 'assistant', 'Nobody else hears this.', { ownerVoice: 'Mira', mode: 'iv' });
    stub.chat.push(mainMsg('A second scene.'));
    addTurn(conv, 'user', 'Ada spoken line.', { ownerVoice: 'Ada', mode: 'chat' });
    setExchangeHidden(conv, 0, true, 'Mira', 'chat');

    const result = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 1 });
    assert.equal(result.status, 'ok');
    assert.deepEqual(contents(result), ['Ada spoken line.']);
    const again = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 1 });
    assert.deepEqual(contents(again), ['Ada spoken line.']);
    const text = JSON.stringify(result);
    assert.ok(!text.includes('Keep this thought private.'));
    assert.ok(!text.includes('Nobody else hears this.'));
    assert.ok(!text.includes('future instructions'));
});

test('Chat on a ghosted anchor remains available as summary source', async () => {
    stub.chat[0].is_hidden = true;
    stub.chat[0].extra = { sc_ghosted: true };
    const conv = getConversation();
    addTurn(conv, 'user', 'The password is silverfin.', { ownerVoice: 'Mira', mode: 'chat' });
    addTurn(conv, 'assistant', 'I will not forget it.', { ownerVoice: 'Mira', mode: 'chat' });

    const result = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 0 });
    assert.equal(result.status, 'ok');
    assert.deepEqual(contents(result), ['The password is silverfin.', 'I will not forget it.']);
});

test('a not-ready or mismatched chat is unavailable, and a ready empty range is ok', () => {
    const emptyReady = collectChatSummarySource({
        chatId: 'chat-a',
        startIndex: 0,
        endIndex: 0,
        sourceStatus: 'uninitialized',
        loadedChatId: 'chat-a',
        conversation: getConversation(),
        personaName: 'Alice',
    });
    assert.equal(emptyReady.status, 'unavailable');
    assert.equal(emptyReady.reason, 'not-ready');

    const mismatch = innerVoiceChatSummarySource({ chatId: 'other-chat', startIndex: 0, endIndex: 0 });
    assert.equal(mismatch.status, 'unavailable');
    assert.equal(mismatch.reason, 'chat-mismatch');

    const readyEmpty = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 0 });
    assert.equal(readyEmpty.status, 'ok');
    assert.deepEqual(readyEmpty.parts, []);

    const missingConversation = collectChatSummarySource({
        chatId: 'chat-a',
        startIndex: 0,
        endIndex: 0,
        sourceStatus: 'ready',
        loadedChatId: 'chat-a',
        conversation: null,
        personaName: 'Alice',
    });
    assert.equal(missingConversation.status, 'unavailable');
});

test('a later Chat edit is current source, and a shortened range drops future anchors', async () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'OLD-CHAT', { ownerVoice: 'Mira', mode: 'chat' });
    stub.chat.push(mainMsg('A later scene.'));
    addTurn(conv, 'user', 'FUTURE-CHAT', { ownerVoice: 'Ada', mode: 'chat' });
    conv.messages.find(turn => turn.content === 'OLD-CHAT').content = 'EDITED-CHAT';

    const current = innerVoiceChatSummarySource({ chatId: 'chat-a', startIndex: 0, endIndex: 0 });
    assert.deepEqual(contents(current), ['EDITED-CHAT']);
    assert.ok(!contents(current).includes('OLD-CHAT'));
    assert.ok(!contents(current).includes('FUTURE-CHAT'));
});

