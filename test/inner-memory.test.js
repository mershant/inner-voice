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
const { DEFAULT_SYSTEM_PROMPT, LEGACY_SYSTEM_PROMPTS, DEFAULT_MEMORY_PROMPT, LEGACY_MEMORY_PROMPTS, DEFAULT_TOOLS_PROMPT } = await import('../src/constants.js');
const { getSettings } = await import('../src/conversation.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

function payloadText(messages) {
    return messages.map(m => m.content).join('\n');
}

function mainChatContent(messages) {
    const block = messages.find(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    assert.ok(block, 'payload has a main-chat slice');
    return block.content;
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

test('each in-slice exchange appears once, directly below its anchor, in exchange-block form', async () => {
    stub.chat = [mainMsg('scene gamma')];
    const conv = getConversation();
    addTurn(conv, 'user', 'gamma thought');
    addTurn(conv, 'assistant', 'gamma answer');

    stub.chat.push(mainMsg('scene delta'));
    addTurn(conv, 'user', 'delta thought');

    const settings = getEffectiveSettings();
    const messages = await assembleMessages(conv, settings, null);
    const mainChat = mainChatContent(messages);

    for (const [anchor, thought] of [['scene gamma', 'gamma thought'], ['scene delta', 'delta thought']]) {
        const anchorPos = mainChat.indexOf(anchor);
        const thoughtPos = mainChat.indexOf(thought);
        assert.ok(anchorPos >= 0, `${anchor} is in the main-chat slice`);
        assert.ok(thoughtPos >= 0, `${thought} is in the main-chat slice`);
        const msgClose = mainChat.indexOf('</msg>', anchorPos);
        assert.ok(thoughtPos > msgClose, `${thought} sits below its anchor message, not inside it`);
        const between = mainChat.slice(msgClose, thoughtPos);
        assert.ok(!between.includes('<msg '), `no other message between ${anchor} and ${thought}`);
        assert.equal(mainChat.split(thought).length - 1, 1, `${thought} appears once`);
    }

    assert.match(mainChat, /<inner-exchange>/);
    assert.match(mainChat, /<\/inner-exchange>/);
    assert.match(mainChat, /\{\{user\}\}'s private inner exchange/);
    assert.match(mainChat, /NPCs and the World/);
    assert.match(mainChat, /IV: gamma thought/);
    assert.match(mainChat, /\{\{user\}\}: gamma answer/);
    assert.match(mainChat, /IV: delta thought/);
});

test('an exchange whose anchor is outside the depth slice appears nowhere in the payload', async () => {
    stub.chat = [mainMsg('scene alpha')];
    const conv = getConversation();
    addTurn(conv, 'user', 'alpha thought');

    stub.chat.push(mainMsg('scene beta'));
    addTurn(conv, 'user', 'beta thought');

    stub.chat.push(mainMsg('scene gamma'));
    addTurn(conv, 'user', 'gamma thought');

    stub.chat.push(mainMsg('scene delta'));
    addTurn(conv, 'user', 'delta thought');

    conv.overrides = { contextDepth: 2 };
    const text = payloadText(await assembleMessages(conv, getEffectiveSettings(), null));

    assert.ok(!text.includes('alpha thought'));
    assert.ok(!text.includes('beta thought'));
    assert.ok(text.includes('gamma thought'));
    assert.ok(text.includes('delta thought'));
});

test('an exchange whose anchor message is hidden appears nowhere in the payload', async () => {
    stub.chat = [mainMsg('visible one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'visible thought one');

    stub.chat.push({ mes: 'hidden scene', is_user: false, is_system: true });
    addTurn(conv, 'user', 'hidden-anchor thought');

    stub.chat.push(mainMsg('visible two'));
    addTurn(conv, 'user', 'visible thought two');

    const text = payloadText(await assembleMessages(conv, getEffectiveSettings(), null));

    assert.ok(!text.includes('hidden-anchor thought'));
    assert.ok(!text.includes('hidden scene'));
    assert.ok(text.includes('visible thought one'));
    assert.ok(text.includes('visible thought two'));
});

test('no flat exchange-stream section remains in the payload', async () => {
    stub.chat = [mainMsg('scene')];
    const conv = getConversation();
    addTurn(conv, 'user', 'only-in-block thought');
    addTurn(conv, 'assistant', 'only-in-block answer');

    const messages = await assembleMessages(conv, getEffectiveSettings(), 'pending IV line');
    const standalone = messages.filter(m =>
        m.content === 'only-in-block thought' || m.content === 'only-in-block answer'
    );
    assert.equal(standalone.length, 0);

    const mainIdx = messages.findIndex(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    const afterMain = messages.slice(mainIdx + 1);
    assert.equal(afterMain.length, 2);
    assert.equal(afterMain[0].content, 'Caught up. I remember all of it.');
    assert.equal(afterMain[1].role, 'user');
    assert.equal(afterMain[1].content, 'pending IV line');
    assert.ok(messages[mainIdx].content.includes('only-in-block thought'));
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

test('stored copies of every superseded default prompt upgrade to the current default', () => {
    for (const legacy of LEGACY_SYSTEM_PROMPTS) {
        stub.extensionSettings.inner_voice = { systemPrompt: legacy };
        assert.equal(getSettings().systemPrompt, DEFAULT_SYSTEM_PROMPT);
    }

    // A genuinely customized prompt stays untouched.
    stub.extensionSettings.inner_voice = { systemPrompt: 'My own prompt.' };
    assert.equal(getSettings().systemPrompt, 'My own prompt.');
});

test('profiles carrying a superseded default prompt upgrade too', () => {
    stub.extensionSettings.inner_voice = {
        profiles: {
            'Default': { systemPrompt: LEGACY_SYSTEM_PROMPTS[LEGACY_SYSTEM_PROMPTS.length - 1] },
            'Mine': { systemPrompt: 'My own profile prompt.' },
        },
    };
    const s = getSettings();
    assert.equal(s.profiles['Default'].systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.equal(s.profiles['Mine'].systemPrompt, 'My own profile prompt.');
});

test('a stored copy of the superseded tools prompt empties back to the current default', async () => {
    const { LEGACY_TOOLS_PROMPTS } = await import('../src/constants.js');
    stub.extensionSettings.inner_voice = { toolsSystemPrompt: LEGACY_TOOLS_PROMPTS[0] };
    assert.equal(getSettings().toolsSystemPrompt, '');

    stub.extensionSettings.inner_voice = { toolsSystemPrompt: 'My own tools prompt.' };
    assert.equal(getSettings().toolsSystemPrompt, 'My own tools prompt.');
});

// ─── Voice repair (ticket #11) ─────────────────────────────────────────────────

test('the system prompt casts the model as {{user}} in first person', async () => {
    // The answering voice is {{user}} themselves, thinking.
    assert.match(DEFAULT_SYSTEM_PROMPT, /\{\{user\}\}:\s*you\b/i);
    assert.match(DEFAULT_SYSTEM_PROMPT, /first person/i);

    // The player's side is the Inner Voice, and the live system content
    // still defines both entities.
    const sys = await buildSystemContent(getEffectiveSettings());
    assert.ok(sys.includes('Inner Voice'));
    assert.match(sys, /\{\{user\}\}:\s*you\b/i);
});

test('no assistant or co-writer framing remains in the default prompt', async () => {
    const framings = [
        /you are (an? |the )?(assistant|co-?writer|copilot|engine|strategist)/i,
        /sounding board/i,
        /brainstorm/i,
        /dungeon master/i,
        /meta-analytical/i,
        /use markdown/i,
        /bullet points/i,
    ];
    // The full live system content — the system prompt plus every module block
    // that rides along with it — must not recast the answering voice.
    const sys = await buildSystemContent(getEffectiveSettings());
    for (const f of framings) {
        assert.ok(!f.test(DEFAULT_SYSTEM_PROMPT), `default prompt still carries assistant framing: ${f}`);
        assert.ok(!f.test(sys), `live system content still carries assistant framing: ${f}`);
    }
    // The system prompt itself additionally never speaks OOC vocabulary; the
    // memory module may say OOC about its own administrative database.
    assert.ok(!/\bOOC\b/.test(DEFAULT_SYSTEM_PROMPT));
});

test('the ticket-#4 inner-voice-cast default is superseded, not the live default', () => {
    // The previous default cast the model as the guiding half — the Inner
    // Voice. That casting must now live only in the legacy list.
    assert.ok(!/guiding half of one mind/i.test(DEFAULT_SYSTEM_PROMPT));
    assert.ok(LEGACY_SYSTEM_PROMPTS.some(p => /guiding half of one mind/i.test(p)),
        'the superseded inner-voice-cast default must upgrade on load');
});

test('the tools prompt speaks to {{user}}, not about {{user}} from outside', () => {
    // Tools are cast as reaching into the speaker's own memory...
    assert.match(DEFAULT_TOOLS_PROMPT, /your memory/i);
    assert.match(DEFAULT_TOOLS_PROMPT, /you remembering/i);
    // ...never as a helper serving a third-person {{user}}.
    assert.ok(!/\{\{user\}\}\s+(wonders|asks|wants|needs)/i.test(DEFAULT_TOOLS_PROMPT),
        'the tools prompt must not describe {{user}} in the third person');
});

test('stored copies of superseded memory prompts upgrade, including CRLF copies', () => {
    for (const legacy of LEGACY_MEMORY_PROMPTS) {
        stub.extensionSettings.inner_voice = { memoryManagePrompt: legacy.replace(/\n/g, '\r\n') };
        assert.equal(getSettings().memoryManagePrompt, DEFAULT_MEMORY_PROMPT);
    }
    stub.extensionSettings.inner_voice = { memoryManagePrompt: 'Custom memory prompt.' };
    assert.equal(getSettings().memoryManagePrompt, 'Custom memory prompt.');
});
