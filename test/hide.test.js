import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: simulation-view.test.js) ───────────────

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
            name1: 'User',
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
    getEffectiveSettings,
    addTurn,
    isExchangeHidden,
    setExchangeHidden,
    getVisibleTurns,
} = await import('../src/conversation.js');
const { assembleMessages } = await import('../src/api.js');
const { syncSimulationView, injectSimulationView } = await import('../src/simulation-view.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

function payloadText(messages) {
    return messages.map(m => m.content).join('\n');
}

function placeInChat(chat) {
    const messages = chat.filter(m => !m.is_system).map((m, index) => ({ ...m, index }));
    injectSimulationView(messages);
    return messages;
}

function outgoingTexts() {
    return placeInChat(stub.chat, stub.extensionPrompts).map(m => m.mes);
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

test('hiding the anchor message in the main chat auto-hides its exchange', async () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'old thought');

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'latest thought');

    stub.chat[1].is_system = true;

    assert.equal(isExchangeHidden(conv, 1), true);
    assert.ok(conv.messages.some(m => m.content === 'latest thought'), 'hiding is never deletion');

    const inner = payloadText(await assembleMessages(conv, getEffectiveSettings(), null));
    assert.ok(!inner.includes('latest thought'));
    assert.ok(inner.includes('old thought'));

    syncSimulationView();
    const outgoing = outgoingTexts();
    assert.ok(!outgoing.some(t => t.includes('latest thought')));
    assert.ok(outgoing.some(t => t.includes('old thought')), 'the previous exchange still counts toward depth');
});

test('unhiding the anchor message restores the exchange to inner memory, the simulation view, and depth', async () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'old thought');

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'restored thought');

    stub.chat[1].is_system = true;
    stub.chat[1].is_system = false;

    assert.equal(isExchangeHidden(conv, 1), false);

    const inner = payloadText(await assembleMessages(conv, getEffectiveSettings(), null));
    assert.ok(inner.includes('restored thought'));

    stub.extensionSettings.inner_voice = { ...(stub.extensionSettings.inner_voice || {}), exchangeDepth: 1 };
    syncSimulationView();
    const outgoing = outgoingTexts();
    assert.ok(outgoing.some(t => t.includes('restored thought')));
    assert.ok(!outgoing.some(t => t.includes('old thought')), 'restored latest exchange is the one that counts toward depth');
});

test('a hidden exchange stays readable with a clear hidden state', async () => {
    stub.chat = [mainMsg('scene')];
    const conv = getConversation();
    addTurn(conv, 'user', 'kept thought');
    addTurn(conv, 'assistant', 'kept answer');

    setExchangeHidden(conv, 0, true);

    assert.equal(isExchangeHidden(conv, 0), true);
    assert.deepEqual(conv.messages.map(m => m.content), ['kept thought', 'kept answer']);
    assert.equal(getVisibleTurns(conv).length, 0);

    stub.chat[0].is_system = true;
    assert.equal(isExchangeHidden(conv, 0), true);
    assert.deepEqual(conv.messages.map(m => m.content), ['kept thought', 'kept answer']);
});

test('an auto-hidden exchange is not a visible turn even when the hide flag is unset', () => {
    stub.chat = [mainMsg('scene')];
    const conv = getConversation();
    addTurn(conv, 'user', 'forgotten thought');
    stub.chat[0].is_system = true;

    assert.deepEqual(conv.hiddenAnchors, []);
    assert.equal(isExchangeHidden(conv, 0), true);
    assert.equal(getVisibleTurns(conv).some(m => m.content === 'forgotten thought'), false);
    assert.ok(conv.messages.some(m => m.content === 'forgotten thought'));
});

test('unhiding the anchor message does not clear a hide toggle', () => {
    stub.chat = [mainMsg('scene')];
    const conv = getConversation();
    addTurn(conv, 'user', 'still hidden thought');
    setExchangeHidden(conv, 0, true);

    stub.chat[0].is_system = true;
    stub.chat[0].is_system = false;

    assert.equal(isExchangeHidden(conv, 0), true);
    assert.ok(conv.messages.some(m => m.content === 'still hidden thought'));
});

test('manual hide is scoped to one owner voice at an anchor', () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'persona thought');
    addTurn(conv, 'user', 'npc thought', { ownerVoice: 'Kyrine' });

    setExchangeHidden(conv, 0, true, 'Kyrine');

    assert.equal(isExchangeHidden(conv, 0, 'Kyrine'), true);
    assert.equal(isExchangeHidden(conv, 0, '{{user}}'), false);
    assert.deepEqual(getVisibleTurns(conv, '{{user}}').map(m => m.content), ['persona thought']);
    assert.deepEqual(getVisibleTurns(conv, 'Kyrine'), []);
});

test('a hidden main-chat anchor auto-hides every owner voice at that anchor', () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'persona thought');
    addTurn(conv, 'user', 'npc thought', { ownerVoice: 'Kyrine' });
    stub.chat[0].is_hidden = true;

    assert.equal(isExchangeHidden(conv, 0, '{{user}}'), true);
    assert.equal(isExchangeHidden(conv, 0, 'Kyrine'), true);
    assert.deepEqual(conv.hiddenAnchors, []);
});
