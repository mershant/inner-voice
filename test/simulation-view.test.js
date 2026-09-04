import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: inner-memory.test.js) ─────────────────

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
    addTurn,
    setExchangeHidden,
} = await import('../src/conversation.js');
const { syncSimulationView } = await import('../src/simulation-view.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

// SillyTavern in-chat injection: depth 0 sits after the last message. The
// test copies that host rule so "below the anchor" is checked independently
// of how the extension computes depth.
function placeInChat(chat, extensionPrompts) {
    const messages = chat.map(m => ({ mes: m.mes }));
    messages.reverse();
    let totalInserted = 0;
    const depths = Object.values(extensionPrompts)
        .filter(p => p && p.value && p.position === 1)
        .map(p => p.depth ?? 0);
    const maxDepth = depths.length ? Math.max(...depths) : -1;
    for (let i = 0; i <= maxDepth; i++) {
        const atDepth = Object.values(extensionPrompts)
            .filter(p => p && p.value && p.position === 1 && p.depth === i);
        if (!atDepth.length) continue;
        const injectIdx = Math.min(i + totalInserted, messages.length);
        messages.splice(injectIdx, 0, ...atDepth.map(p => ({ mes: p.value, injected: true })));
        totalInserted += atDepth.length;
    }
    messages.reverse();
    return messages;
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

test('default depth 1 injects only the most recent non-hidden exchange, below its anchor', async () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'old thought');

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'middle thought');

    stub.chat.push(mainMsg('scene two'));
    addTurn(conv, 'user', 'latest thought');
    setExchangeHidden(conv, 2, true);

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);

    const anchorPos = texts.indexOf('scene one');
    assert.ok(anchorPos >= 0, 'anchor message is in the outgoing chat');
    assert.match(texts[anchorPos + 1] || '', /middle thought/);
    assert.ok(!texts.some(t => t.includes('old thought')));
    assert.ok(!texts.some(t => t.includes('latest thought')));
});

test('depth N injects the N most recent non-hidden exchanges, each below its own anchor', async () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'old thought');

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'middle thought');

    stub.chat.push(mainMsg('scene two'));
    addTurn(conv, 'user', 'latest thought');

    stub.extensionSettings.inner_voice = { ...(stub.extensionSettings.inner_voice || {}), exchangeDepth: 2 };

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);

    const onePos = texts.indexOf('scene one');
    const twoPos = texts.indexOf('scene two');
    assert.match(texts[onePos + 1] || '', /middle thought/);
    assert.match(texts[twoPos + 1] || '', /latest thought/);
    assert.ok(!texts.some(t => t.includes('old thought')));
});

test('the block frame carries the privacy explanation and IV:/{{user}}: labels', async () => {
    stub.chat = [mainMsg('Kyrine teases her.')];
    const conv = getConversation();
    addTurn(conv, 'user', 'wtf? how can she talk to us like that?');
    addTurn(conv, 'assistant', "I don't know. It still stings.");

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const block = outgoing.find(m => m.injected)?.mes || '';

    assert.match(block, /<inner-exchange>/);
    assert.match(block, /<\/inner-exchange>/);
    assert.match(block, /\{\{user\}\}'s private inner exchange/);
    assert.match(block, /NPCs and the World/);
    assert.match(block, /cannot perceive it|imperceptible/);
    assert.match(block, /one mind talking to itself/);
    assert.match(block, /IV:/);
    assert.match(block, /\{\{user\}\}:/);
    assert.match(block, /IV: wtf\? how can she talk to us like that\?/);
    assert.match(block, /\{\{user\}\}: I don't know\. It still stings\./);
    assert.ok(!/assistant|co-?writer|external/i.test(block));
});
