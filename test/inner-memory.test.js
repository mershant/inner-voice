import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: exchange-spine.test.js) ────────────────

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
    chatMetadata: {},
    extensionSettings: {},
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
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadata; },
            set chatMetadata(v) { stub.chatMetadata = v; },
        };
    },
};

const {
    initConversation,
    getConversation,
    getEffectiveSettings,
    addTurn,
    setExchangeHidden,
    isExchangeHidden,
} = await import('../src/conversation.js');
const { assembleMessages, buildSystemContent } = await import('../src/api.js');
const { DEFAULT_SYSTEM_PROMPT, LEGACY_SYSTEM_PROMPTS, DEFAULT_MEMORY_PROMPT, LEGACY_MEMORY_PROMPTS } = await import('../src/constants.js');
const { getSettings } = await import('../src/conversation.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

function payloadText(messages) {
    return messages.map(m => m.content).join('\n');
}

async function reset() {
    files.clear();
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = {};
    stub.extensionSettings = {};
    await initConversation({ forceReset: true });
}

beforeEach(reset);

// ─── The main-chat slice ──────────────────────────────────────────────────────

test('the payload carries the depth-limited main-chat slice', async () => {
    stub.chat = [
        mainMsg('scene alpha'), mainMsg('scene beta'),
        mainMsg('scene gamma'), mainMsg('scene delta'),
    ];
    const conv = getConversation();
    conv.overrides = { contextDepth: 2 };
    const settings = getEffectiveSettings();

    const messages = await assembleMessages(conv, settings, null);
    const text = payloadText(messages);

    assert.match(text, /<main_chat[ >]/);
    assert.ok(text.includes('scene gamma'));
    assert.ok(text.includes('scene delta'));
    assert.ok(!text.includes('scene alpha'));
    assert.ok(!text.includes('scene beta'));
});

test('the summary covers older parts of the main chat', async () => {
    stub.chat = [mainMsg('recent event')];
    stub.chatMetadata.summaryception = {
        layers: [[{ text: 'Long ago, the heist at the chapel set everything in motion.' }]],
    };
    const conv = getConversation();
    const settings = getEffectiveSettings();

    const text = payloadText(await assembleMessages(conv, settings, null));
    assert.ok(text.includes('<summary_context>'));
    assert.ok(text.includes('the heist at the chapel'));
});

// ─── Exchanges in the inner memory ────────────────────────────────────────────

test('the payload carries exactly the non-hidden exchanges', async () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'first-exchange thought');
    addTurn(conv, 'assistant', 'first-exchange answer');

    stub.chat.push(mainMsg('two'));
    addTurn(conv, 'user', 'second-exchange thought');

    setExchangeHidden(conv, 0, true);
    assert.equal(isExchangeHidden(conv, 0), true);

    const settings = getEffectiveSettings();
    const text = payloadText(await assembleMessages(conv, settings, null));

    assert.ok(!text.includes('first-exchange thought'));
    assert.ok(!text.includes('first-exchange answer'));
    assert.ok(text.includes('second-exchange thought'));
});

test('unhiding an exchange restores it to the payload', async () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'reversible thought');

    setExchangeHidden(conv, 0, true);
    setExchangeHidden(conv, 0, false);

    const settings = getEffectiveSettings();
    const text = payloadText(await assembleMessages(conv, settings, null));
    assert.ok(text.includes('reversible thought'));
});

test('hiding one exchange leaves the others intact and does not delete turns', async () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'kept thought A');
    stub.chat.push(mainMsg('two'));
    addTurn(conv, 'user', 'hidden thought');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'kept thought B');

    setExchangeHidden(conv, 1, true);

    const settings = getEffectiveSettings();
    const text = payloadText(await assembleMessages(conv, settings, null));
    assert.ok(text.includes('kept thought A'));
    assert.ok(!text.includes('hidden thought'));
    assert.ok(text.includes('kept thought B'));
    // Hiding is never deletion: the turn is still in the conversation.
    assert.ok(conv.messages.some(m => m.content === 'hidden thought'));
});

// ─── The system prompt (ticket #4 / ADR 0002) ─────────────────────────────────

test('the system prompt defines the entities in tagged sections', async () => {
    const sys = await buildSystemContent(getEffectiveSettings());
    assert.ok(sys.includes('<entity_definitions>'));
    assert.ok(sys.includes('Inner Voice'));
    assert.ok(sys.includes('{{user}}'));
    assert.ok(/main chat/i.test(sys));
});

test('the extension-authored payload says simulation, never roleplay', async () => {
    stub.chat = [mainMsg('an event')];
    const conv = getConversation();
    addTurn(conv, 'user', 'a thought');
    const settings = getEffectiveSettings();

    // The system prompt itself carries the simulation framing.
    const sys = await buildSystemContent(settings);
    assert.ok(/simulation/i.test(sys));
    assert.ok(!/role-?play/i.test(sys));

    // And no extension-authored part of the payload says roleplay. Main-chat
    // content is story text, so keep it neutral here.
    const text = payloadText(await assembleMessages(conv, settings, null));
    assert.ok(!/role-?play/i.test(text));
});

test('no default prompt restricts the Voice to established events (ADR 0002)', async () => {
    const fences = [
        /only\s+(refer|respond|draw|speak)[^.]*establish/i,
        /(do not|don'?t|never)\s+(invent|fabricate|make up|hallucinate)/i,
        /stick to\s+(the\s+)?(establish|canon|source)/i,
        /only\s+establish\w* (events|facts)/i,
        /source[- ]fidelity/i,
    ];
    // Check the full live system content — the system prompt plus every
    // module block (memory, tools) that rides along with it.
    const sys = await buildSystemContent(getEffectiveSettings());
    for (const fence of fences) {
        assert.ok(!fence.test(DEFAULT_SYSTEM_PROMPT), `system prompt matches forbidden fence: ${fence}`);
        assert.ok(!fence.test(sys), `live system content matches forbidden fence: ${fence}`);
    }
});

test('a stored copy of the superseded default prompt upgrades to the current default', () => {
    stub.extensionSettings.inner_voice = { systemPrompt: LEGACY_SYSTEM_PROMPTS[0] };
    const s = getSettings();
    assert.equal(s.systemPrompt, DEFAULT_SYSTEM_PROMPT);

    // A genuinely customized prompt stays untouched.
    stub.extensionSettings.inner_voice = { systemPrompt: 'My own prompt.' };
    assert.equal(getSettings().systemPrompt, 'My own prompt.');
});

test('stored copies of superseded memory prompts upgrade, including CRLF copies', () => {
    for (const legacy of LEGACY_MEMORY_PROMPTS) {
        stub.extensionSettings.inner_voice = { memoryManagePrompt: legacy.replace(/\n/g, '\r\n') };
        assert.equal(getSettings().memoryManagePrompt, DEFAULT_MEMORY_PROMPT);
    }
    stub.extensionSettings.inner_voice = { memoryManagePrompt: 'Custom memory prompt.' };
    assert.equal(getSettings().memoryManagePrompt, 'Custom memory prompt.');
});
