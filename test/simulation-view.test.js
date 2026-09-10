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
const { renderExchangeBlock, syncSimulationView, injectSimulationView, assembleSimulationView } = await import('../src/simulation-view.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

// Exercise the actual host interceptor seam. Split each message into its
// original text and appended context only to make placement assertions readable.
function placeInChat(chat) {
    const core = chat.filter(m => !m.is_system).map((m, index) => ({ ...m, index }));
    const originals = core.map(m => m.mes);
    injectSimulationView(core);
    return core.flatMap((m, i) => [{ mes: originals[i] },
        ...(m.mes.length > originals[i].length ? [{ mes: m.mes.slice(originals[i].length), injected: true }] : [])]);
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

test('simulation view preserves cross-character Chat → IV → Chat order without spending IV slots', () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'FIRST-CHAT', { ownerVoice: 'Mira', mode: 'chat' });
    addTurn(conv, 'assistant', 'SELF-THOUGHT');
    addTurn(conv, 'assistant', 'OTHER-CHAT', { ownerVoice: 'Ada', mode: 'chat' });
    addTurn(conv, 'assistant', 'LAST-CHAT', { ownerVoice: 'Mira', mode: 'chat' });
    const text = assembleSimulationView(conv, { exchangeDepth: 1, otherVoicesDepth: 0 }, 1).map(p => p.content).join('\n');
    const tokens = ['FIRST-CHAT', 'SELF-THOUGHT', 'OTHER-CHAT', 'LAST-CHAT'];
    assert.deepEqual(tokens.map(t => text.indexOf(t)).slice().sort((a,b) => a-b), tokens.map(t => text.indexOf(t)));
    for (const t of tokens) assert.equal(text.split(t).length - 1, 1, t);
    assert.match(text, /Continue after its last turn/);
});

test('host context selection keeps or drops anchor and exchanges as one message, without editing saved chat', () => {
    const conv = getConversation();
    addTurn(conv, 'assistant', 'OLD-CHAT', { ownerVoice: 'Mira', mode: 'chat' });
    stub.chat.push(mainMsg('latest scene'));
    addTurn(conv, 'assistant', 'NEW-CHAT', { ownerVoice: 'Mira', mode: 'chat' });
    const before = structuredClone(stub.chat);
    const coreChat = stub.chat.map((m, index) => ({ ...m, index }));
    injectSimulationView(coreChat);
    assert.deepEqual(stub.chat, before);
    assert.equal(coreChat.length, 2, 'no independently retained injected message');
    assert.match(coreChat[0].mes, /OLD-CHAT/);
    assert.doesNotMatch(coreChat.slice(-1).map(m => m.mes).join('\n'), /OLD-CHAT/);
    assert.match(coreChat.at(-1).mes, /NEW-CHAT/);
});

test('more than 30 Chat exchanges stay anchor-bound, with independent hides and unchanged IV depth', () => {
    const conv = getConversation();
    for (let i = 0; i < 35; i++) {
        if (i) stub.chat.push(mainMsg(`scene ${i}`));
        addTurn(conv, 'user', `CHAT-${i}-END`, { ownerVoice: 'Mira', mode: 'chat' });
        addTurn(conv, 'assistant', `IV-${i}-END`, { ownerVoice: 'Mira', mode: 'iv' });
    }
    const text = () => assembleSimulationView(conv, { otherVoicesDepth: 1 }, 35).map(p => p.content).join('\n');
    assert.equal((text().match(/CHAT-\d+-END/g) || []).length, 35);
    assert.equal((text().match(/IV-\d+-END/g) || []).length, 1);
    setExchangeHidden(conv, 34, true, 'Mira', 'chat');
    assert.doesNotMatch(text(), /CHAT-34-END/);
    assert.match(text(), /IV-34-END/);
    stub.chat[0].is_system = true;
    assert.doesNotMatch(text(), /CHAT-0-END/);
    delete stub.chat[0].is_system;
    setExchangeHidden(conv, 34, false, 'Mira', 'chat');
    assert.equal((text().match(/CHAT-\d+-END/g) || []).length, 35);
    const filtered = stub.chat.filter((_, i) => i !== 1).map((m, index) => ({ ...m, index: index ? index + 1 : 0 }));
    injectSimulationView(filtered);
    assert.doesNotMatch(filtered.map(m => m.mes).join('\n'), /CHAT-1-END/, 'omitted anchor has no raw Chat');
});

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
    assert.match(block, /one mind talking to itself/);
    assert.match(block, /imperceptible to everyone except \{\{user\}\}/);
    assert.match(block, /IV: is the Inner Voice/);
    assert.match(block, /\{\{user\}\}: is \{\{user\}\}/);
    assert.match(block, /IV: wtf\? how can she talk to us like that\?/);
    assert.match(block, /\{\{user\}\}: I don't know\. It still stings\./);
    assert.ok(!/assistant|co-?writer|external/i.test(block));
});

test('a talkative voice does not crowd another voice out of the outgoing prompt', () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'persona at zero');
    addTurn(conv, 'user', 'npc at zero', { ownerVoice: 'Kyrine' });

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'persona at one');

    stub.chat.push(mainMsg('scene two'));
    addTurn(conv, 'user', 'persona at two');

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);

    const zeroPos = texts.indexOf('scene zero');
    const twoPos = texts.indexOf('scene two');
    assert.match(texts[zeroPos + 1] || '', /npc at zero/);
    assert.match(texts[twoPos + 1] || '', /persona at two/);
    assert.ok(!texts.some(t => t.includes('persona at zero')));
    assert.ok(!texts.some(t => t.includes('persona at one')));
});

test('{{user}} exchange depth and other-voices exchange depth select independently', () => {
    stub.chat = [mainMsg('scene zero')];
    const conv = getConversation();
    addTurn(conv, 'user', 'persona at zero');
    addTurn(conv, 'user', 'npc at zero', { ownerVoice: 'Kyrine' });

    stub.chat.push(mainMsg('scene one'));
    addTurn(conv, 'user', 'persona at one');
    addTurn(conv, 'user', 'npc at one', { ownerVoice: 'Kyrine' });

    stub.chat.push(mainMsg('scene two'));
    addTurn(conv, 'user', 'persona at two');
    addTurn(conv, 'user', 'npc at two', { ownerVoice: 'Kyrine' });

    stub.extensionSettings.inner_voice = {
        ...(stub.extensionSettings.inner_voice || {}),
        exchangeDepth: 1,
        otherVoicesDepth: 2,
    };

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);

    assert.ok(!texts.some(t => t.includes('persona at zero')));
    assert.ok(!texts.some(t => t.includes('persona at one')));
    assert.ok(texts.some(t => t.includes('persona at two')));
    assert.ok(!texts.some(t => t.includes('npc at zero')));
    assert.ok(texts.some(t => t.includes('npc at one')));
    assert.ok(texts.some(t => t.includes('npc at two')));
});

test('two voices under one anchor keep separate outgoing blocks', () => {
    stub.chat = [mainMsg('Kyrine waits.')];
    const conv = getConversation();
    addTurn(conv, 'user', 'persona thought');
    addTurn(conv, 'user', 'npc thought', { ownerVoice: 'Kyrine' });

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);
    const afterAnchor = texts.slice(texts.indexOf('Kyrine waits.') + 1);
    assert.ok(afterAnchor.some(t => t.includes('persona thought')));
    assert.ok(afterAnchor.some(t => t.includes('npc thought')));
    assert.ok(afterAnchor.some(t => t.includes("{{user}}'s private inner exchange")));
    assert.ok(afterAnchor.some(t => t.includes("Kyrine's private inner exchange")));
});

test('hide overrides the outgoing prompt for one voice without removing the other at the same anchor', () => {
    stub.chat = [mainMsg('Kyrine waits.')];
    const conv = getConversation();
    addTurn(conv, 'user', 'persona thought');
    addTurn(conv, 'user', 'npc thought', { ownerVoice: 'Kyrine' });
    setExchangeHidden(conv, 0, true, 'Kyrine');

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);
    assert.ok(texts.some(t => t.includes('persona thought')));
    assert.ok(!texts.some(t => t.includes('npc thought')));
});

test('a hidden main-chat anchor removes every voice at that anchor from the outgoing prompt', () => {
    stub.chat = [mainMsg('Kyrine waits.')];
    const conv = getConversation();
    addTurn(conv, 'user', 'persona thought');
    addTurn(conv, 'user', 'npc thought', { ownerVoice: 'Kyrine' });
    stub.chat[0].is_system = true;

    syncSimulationView();
    const outgoing = placeInChat(stub.chat, stub.extensionPrompts);
    const texts = outgoing.map(m => m.mes);
    assert.ok(!texts.some(t => t.includes('persona thought')));
    assert.ok(!texts.some(t => t.includes('npc thought')));
});

test('an NPC exchange names its owner and is private from every other mind, including {{user}}', () => {
    const block = renderExchangeBlock([
        { role: 'user', content: 'Maybe Mira is right.' },
        { role: 'assistant', content: 'I hate that she might be.' },
    ], 'Kyrine');

    assert.match(block, /Kyrine's private inner exchange/);
    assert.match(block, /imperceptible to everyone except Kyrine/i);
    assert.match(block, /IV: Maybe Mira is right\./);
    assert.match(block, /Kyrine: I hate that she might be\./);
    assert.ok(!block.includes('{{user}}'));
    assert.ok(!/NPCs and the World cannot perceive it/.test(block));
});
