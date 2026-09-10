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

const fetchCalls = [];
globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url, opts });
    return {
        ok: true,
        status: 200,
        json: async () => ({ content: 'ok' }),
        text: async () => 'ok',
    };
};

const stub = {
    chat: [],
    chatId: 'chat-a',
    chatMetadata: {},
    extensionSettings: {},
    model: 'grok-4.6',
    main_api: 'openai',
    cmCalls: [],
    ccCalls: [],
    streamFailOnce: false,
};

stub.cm = {
    getSupportedProfiles() {
        return stub.profiles || [];
    },
    async sendRequest(...args) {
        stub.cmCalls.push(args);
        if (stub.streamFailOnce && stub.cmCalls.length === 1) throw new Error('stream failed');
        return { content: 'ok' };
    },
};

stub.cc = {
    async processRequest(...args) {
        stub.ccCalls.push(args);
        if (stub.streamFailOnce && stub.ccCalls.length === 1) throw new Error('stream failed');
        return { content: 'ok' };
    },
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
            ConnectionManagerRequestService: stub.cm,
            ChatCompletionService: stub.cc,
            getChatCompletionModel: () => stub.model,
            main_api: stub.main_api,
            oai_settings: { preset_settings_openai: 'Active RP' },
        };
    },
};

const { callGenerate, runGenerate } = await import('../src/api.js');
const { innerReasoningOverride } = await import('../src/reasoning-level.js');
const { getSettings, getEffectiveSettings, initConversation, getConversation, createVoiceSession, setActiveVoice, setActiveMode, addTurn } = await import('../src/conversation.js');

const MESSAGES = Object.freeze([
    Object.freeze({ role: 'user', content: 'think' }),
]);

function baseSettings(extra = {}) {
    return {
        connectionSource: 'default',
        connectionProfileId: '',
        customUrl: 'http://localhost:5000/v1',
        customKey: '',
        customModel: 'grok-4.6',
        maxTokens: 16,
        forceStreaming: 'off',
        reasoningLevel: 'unset',
        ...extra,
    };
}

beforeEach(() => {
    fetchCalls.length = 0;
    stub.cmCalls = [];
    stub.ccCalls = [];
    stub.streamFailOnce = false;
    stub.model = 'grok-4.6';
    stub.main_api = 'openai';
    stub.profiles = [{ id: 'p1', name: 'Inner', model: 'grok-4.6' }];
    stub.extensionSettings = {};
    stub.chat = [];
    globalThis.window.main_api = 'openai';
    globalThis.window.oai_settings = { preset_settings_openai: 'Active RP' };
});

test('reasoning level defaults to Unset', () => {
    stub.extensionSettings = {};
    assert.equal(getSettings().reasoningLevel, 'unset');
});

test('the actual Chat request has the captured speaker, Chat instructions, and one independent dispatch', async () => {
    await initConversation({ forceReset: true });
    stub.chat = [{ mes: 'A card-less merchant waits.', is_user: false }];
    const settings = { ...getEffectiveSettings(), ...baseSettings({ connectionSource: 'profile', connectionProfileId: 'p1', reasoningLevel: 'off' }),
        systemPrompt: 'IV-ONLY', postHistoryText: 'IV-POST',
        chatSystemPrompt: '{{voice}} answers {{user}} in plain dialogue.', chatPostHistoryText: 'Reply as {{voice}}, to {{user}}.' };
    await callGenerate(getConversation(), settings, 'How much?', null, undefined, 'Mira', 'chat');
    assert.equal(stub.cmCalls.length, 1);
    assert.equal(stub.ccCalls.length, 0);
    const text = stub.cmCalls[0][1].map(m => m.content).join('\n');
    assert.match(text, /Mira answers User in plain dialogue/);
    assert.match(text, /Reply as Mira, to User/);
    assert.doesNotMatch(text, /IV-ONLY|IV-POST|\{\{voice\}\}|\{\{user\}\}|<modules>/);
    assert.match(text, /How much\?/);
    assert.equal(getSettings().systemPrompt === 'IV-ONLY', false, 'request settings do not overwrite globals');
});

test('current-chat override inherits and clears like neighboring connection fields', async () => {
    stub.extensionSettings = {};
    await initConversation({ forceReset: true });
    getSettings().reasoningLevel = 'high';
    assert.equal(getEffectiveSettings().reasoningLevel, 'high');
    getConversation().overrides.reasoningLevel = 'off';
    assert.equal(getEffectiveSettings().reasoningLevel, 'off');
    delete getConversation().overrides.reasoningLevel;
    assert.equal(getEffectiveSettings().reasoningLevel, 'high');
});

test('Chat saves into its request page after selection changes and sends the entered turn only once', async () => {
    await initConversation({ forceReset: true });
    stub.chat = [{ mes: 'the scene', is_user: false }];
    const conv = getConversation();
    createVoiceSession(conv, 'Mira');
    setActiveVoice(conv, 'Mira');
    setActiveMode(conv, 'chat');
    Object.assign(getSettings(), baseSettings({ connectionSource: 'profile', connectionProfileId: 'p1' }), { portrayAutoTrigger: true });
    const send = stub.cm.sendRequest;
    stub.cm.sendRequest = async (...args) => {
        stub.cmCalls.push(args);
        setActiveMode(conv, 'iv');
        setActiveVoice(conv, '{{user}}');
        return { content: 'A spoken reply. <scene-now />' };
    };
    try {
        await runGenerate(conv, 'UNIQUE-QUESTION');
        assert.equal(stub.cmCalls.length, 1, 'no Portray/tool/recap request');
        const text = stub.cmCalls[0][1].map(m => m.content).join('\n');
        assert.equal(text.split('UNIQUE-QUESTION').length - 1, 1);
        assert.deepEqual(conv.messages.map(m => [m.ownerVoice, m.mode, m.anchorIndex]), [['Mira', 'chat', 0], ['Mira', 'chat', 0]]);
        assert.equal(conv.messages.at(-1).content, 'A spoken reply. <scene-now />', 'Chat text is not an IV command');
    } finally { stub.cm.sendRequest = send; }
});

test('resending a saved Chat turn includes it once and preserves interleaved private history', async () => {
    await initConversation({ forceReset: true });
    stub.chat = [{ mes: 'the scene', is_user: false }];
    const conv = getConversation();
    createVoiceSession(conv, 'Mira');
    setActiveVoice(conv, 'Mira');
    setActiveMode(conv, 'chat');
    Object.assign(getSettings(), baseSettings({ connectionSource: 'profile', connectionProfileId: 'p1' }));
    addTurn(conv, 'user', 'SAVED-QUESTION');
    addTurn(conv, 'assistant', 'PRIVATE-DOUBT', { mode: 'iv' });
    await runGenerate(conv, 'SAVED-QUESTION', false);
    const text = stub.cmCalls[0][1].map(m => m.content).join('\n');
    assert.equal(text.split('SAVED-QUESTION').length - 1, 1);
    assert.equal(text.split('PRIVATE-DOUBT').length - 1, 1);
    assert.equal(conv.messages.filter(m => m.mode === 'iv').length, 1);
    assert.equal(conv.messages.at(-1).mode, 'chat');
});

test('streaming Chat keeps its original owner, mode, and anchor when selection changes between chunks', async () => {
    await initConversation({ forceReset: true });
    stub.chat = [{ mes: 'the scene', is_user: false }];
    const conv = getConversation();
    createVoiceSession(conv, 'Mira');
    setActiveVoice(conv, 'Mira');
    setActiveMode(conv, 'chat');
    Object.assign(getSettings(), baseSettings({ connectionSource: 'profile', connectionProfileId: 'p1', forceStreaming: 'on' }));
    const send = stub.cm.sendRequest;
    stub.cm.sendRequest = async (...args) => {
        stub.cmCalls.push(args);
        return async function* () {
            yield { text: 'First words' };
            setActiveMode(conv, 'iv');
            setActiveVoice(conv, '{{user}}');
            stub.chat.push({ mes: 'next main moment', is_user: false });
            yield { text: 'First words, finished.' };
        };
    };
    try {
        await runGenerate(conv, 'Question');
        assert.equal(stub.cmCalls.length, 1);
        assert.equal(conv.messages.length, 2);
        assert.deepEqual(conv.messages.map(m => [m.ownerVoice, m.mode, m.anchorIndex]), [['Mira', 'chat', 0], ['Mira', 'chat', 0]]);
        assert.equal(conv.messages.at(-1).content, 'First words, finished.');
    } finally { stub.cm.sendRequest = send; }
});

test('Specific Profile passes the override as sendRequest fifth argument', async () => {
    const settings = baseSettings({
        connectionSource: 'profile',
        connectionProfileId: 'p1',
        reasoningLevel: 'off',
    });
    const expected = innerReasoningOverride(settings, SillyTavern.getContext());
    await callGenerate({}, settings, null, null, MESSAGES);
    assert.equal(stub.cmCalls.length, 1);
    assert.equal(stub.cmCalls[0].length, 5);
    assert.deepEqual(stub.cmCalls[0][4], expected);
    assert.equal(stub.cmCalls[0][0], 'p1');
    assert.equal(stub.cmCalls[0][3].stream, false);
});

test('Specific Profile passes the same override on non-streaming fallback', async () => {
    stub.streamFailOnce = true;
    const settings = baseSettings({
        connectionSource: 'profile',
        connectionProfileId: 'p1',
        reasoningLevel: 'max',
        forceStreaming: 'on',
    });
    const expected = innerReasoningOverride(settings, SillyTavern.getContext());
    await callGenerate({}, settings, null, null, MESSAGES);
    assert.equal(stub.cmCalls.length, 2);
    assert.equal(stub.cmCalls[0][3].stream, true);
    assert.equal(stub.cmCalls[1][3].stream, false);
    assert.deepEqual(stub.cmCalls[0][4], expected);
    assert.deepEqual(stub.cmCalls[1][4], expected);
    assert.deepEqual(JSON.parse(expected.custom_include_body), { reasoning_effort: 'max' });
});

test('Current Chat Completion spreads the override into the request object', async () => {
    const settings = baseSettings({ reasoningLevel: 'off' });
    const expected = innerReasoningOverride(settings, SillyTavern.getContext());
    await callGenerate({}, settings, null, null, MESSAGES);
    assert.equal(stub.ccCalls.length, 1);
    assert.equal(stub.ccCalls[0][0].custom_include_body, expected.custom_include_body);
    assert.equal(stub.ccCalls[0][0].custom_exclude_body, expected.custom_exclude_body);
    assert.equal(stub.ccCalls[0][0].stream, false);
    assert.deepEqual(stub.ccCalls[0][0].messages, MESSAGES);
});

test('Current Chat Completion passes the same override on non-streaming fallback', async () => {
    stub.streamFailOnce = true;
    const settings = baseSettings({ reasoningLevel: 'xhigh', forceStreaming: 'on' });
    const expected = innerReasoningOverride(settings, SillyTavern.getContext());
    await callGenerate({}, settings, null, null, MESSAGES);
    assert.equal(stub.ccCalls.length, 2);
    assert.equal(stub.ccCalls[0][0].stream, true);
    assert.equal(stub.ccCalls[1][0].stream, false);
    assert.equal(stub.ccCalls[0][0].custom_include_body, expected.custom_include_body);
    assert.equal(stub.ccCalls[1][0].custom_include_body, expected.custom_include_body);
    assert.deepEqual(JSON.parse(expected.custom_include_body), { reasoning_effort: 'xhigh' });
});

test('Custom Endpoint sends the applied AGAPE body without carrier fields', async () => {
    const settings = baseSettings({
        connectionSource: 'custom',
        reasoningLevel: 'off',
        customModel: 'grok-4.6',
    });
    await callGenerate({}, settings, null, null, MESSAGES);
    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.equal(body.reasoning_effort, 'none');
    assert.equal(body.thinking, undefined);
    assert.equal(body.thinking_config, undefined);
    assert.equal(body.custom_include_body, undefined);
    assert.equal(body.custom_exclude_body, undefined);
    assert.equal(body.model, 'grok-4.6');
    assert.deepEqual(body.messages, MESSAGES);
});

test('Unset preserves the pre-ticket request for all three sources', async () => {
    const unset = baseSettings({ reasoningLevel: 'unset' });

    await callGenerate({}, { ...unset, connectionSource: 'profile', connectionProfileId: 'p1' }, null, null, MESSAGES);
    assert.equal(stub.cmCalls.length, 1);
    assert.equal(stub.cmCalls[0].length, 4);

    await callGenerate({}, unset, null, null, MESSAGES);
    assert.equal(stub.ccCalls.length, 1);
    assert.equal(stub.ccCalls[0][0].custom_include_body, undefined);
    assert.equal(stub.ccCalls[0][0].custom_exclude_body, undefined);
    assert.deepEqual(Object.keys(stub.ccCalls[0][0]).sort(), ['max_tokens', 'messages', 'stream']);

    await callGenerate({}, { ...unset, connectionSource: 'custom' }, null, null, MESSAGES);
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.deepEqual(body, {
        model: 'grok-4.6',
        messages: MESSAGES,
        max_tokens: 16,
        stream: false,
    });
});

test('dispatch never mutates presets or source messages', async () => {
    const messages = Object.freeze([{ role: 'user', content: 'think' }]);
    const settings = Object.freeze(baseSettings({
        connectionSource: 'profile',
        connectionProfileId: 'p1',
        reasoningLevel: 'high',
    }));
    await callGenerate({}, settings, null, null, messages);
    assert.equal(messages[0].content, 'think');
    assert.equal(settings.reasoningLevel, 'high');
    assert.equal(stub.cmCalls[0].length, 5);
});
