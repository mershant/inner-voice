import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: inner-memory.test.js) ──────────────────

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById(id) {
        if (id === 'send_textarea') return stub.inputBox;
        if (id === 'send_but') return stub.sendButton;
        if (id === 'iv-fire-portray-style') return stub.fireStyleEl;
        if (id === 'iv-fire-portray-person') return stub.firePersonEl;
        return null;
    },
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
    generateCalls: 0,
    inputBox: { value: '', events: [], dispatchEvent(ev) { this.events.push(ev.type); return true; } },
    sendButton: { clicks: 0, click() { this.clicks += 1; } },
    fireStyleEl: { value: 'rp' },
    firePersonEl: { value: 'first' },
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: 0,
            characters: [{ name: 'Kyrine' }],
            name1: 'Eloise',
            name2: 'Kyrine',
            extensionSettings: stub.extensionSettings,
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadata; },
            set chatMetadata(v) { stub.chatMetadata = v; },
            generate() { stub.generateCalls += 1; },
        };
    },
};

const {
    initConversation,
    getConversation,
    getEffectiveSettings,
    getSettings,
    saveSettings,
    addTurn,
} = await import('../src/conversation.js');
const { state } = await import('../src/state.js');
const { assemblePortrayMessages, readFireTimePortrayForm, routePortrayToInput, runPortray, considerAutoTriggerPortray, flushPendingAutoPortray } = await import('../src/portray.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

function payloadText(messages) {
    return messages.map(m => m.content).join('\n');
}

function lastUserText(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
}

async function reset() {
    files.clear();
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = {};
    stub.extensionSettings = {};
    stub.generateCalls = 0;
    stub.inputBox.value = '';
    stub.inputBox.events = [];
    stub.sendButton.clicks = 0;
    stub.fireStyleEl.value = 'rp';
    stub.firePersonEl.value = 'first';
    state.generating = false;
    await initConversation({ forceReset: true });
    await flushPendingAutoPortray();
}

beforeEach(reset);

test('the portray request carries inner memory', async () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'alright, TELL HER');
    addTurn(conv, 'assistant', 'Fine. I am going to say it to her face.');

    const messages = await assemblePortrayMessages(conv, getEffectiveSettings());
    const text = payloadText(messages);

    assert.match(text, /<main_chat[ >]/);
    assert.ok(text.includes('The tavern falls silent.'));
    assert.ok(text.includes('alright, TELL HER'));
    assert.ok(text.includes('Fine. I am going to say it to her face.'));
});

test('the portray request uses RP-style first person by default and stays {{user}}-only', async () => {
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    const text = payloadText(messages);
    const task = lastUserText(messages);

    assert.ok(text.includes("{{user}}'s own actions and spoken words"));
    assert.ok(task.includes('spoken words and bodily action'));
    assert.ok(task.includes('in first person'));
    assert.ok(!task.includes('without quoted speech'));
    assert.ok(!task.includes('in second person'));
    assert.ok(!task.includes('in third person'));
});

test('portray with no live exchange still carries {{user}} standing state', async () => {
    stub.chat = [mainMsg('Kyrine waits at the door, one eyebrow up.')];
    const conv = getConversation();
    assert.equal(conv.messages.length, 0);

    const messages = await assemblePortrayMessages(conv, getEffectiveSettings());
    const text = payloadText(messages);

    assert.ok(text.includes('Kyrine waits at the door'));
    assert.ok(!text.includes('<inner-exchange>'));
    assert.ok(text.includes('standing state'));
    assert.ok(text.includes("{{user}}'s own actions and spoken words"));
});

test('portray form settings persist globally and a fire-time override does not change them', async () => {
    const s = getSettings();
    assert.equal(s.portrayStyle, 'rp');
    assert.equal(s.portrayPerson, 'first');

    s.portrayStyle = 'summary';
    s.portrayPerson = 'third';
    saveSettings();
    assert.equal(getSettings().portrayStyle, 'summary');
    assert.equal(getSettings().portrayPerson, 'third');

    const stored = lastUserText(await assemblePortrayMessages(getConversation(), getEffectiveSettings()));
    assert.ok(stored.includes('without quoted speech'));
    assert.ok(stored.includes('in third person'));

    const fired = lastUserText(await assemblePortrayMessages(
        getConversation(),
        getEffectiveSettings(),
        { style: 'rp', person: 'second' },
    ));
    assert.equal(getSettings().portrayStyle, 'summary');
    assert.equal(getSettings().portrayPerson, 'third');
    assert.ok(fired.includes('spoken words and bodily action'));
    assert.ok(fired.includes('in second person'));
    assert.ok(!fired.includes('without quoted speech'));
    assert.ok(!fired.includes('in third person'));
});

test('fire-time window form overrides stored defaults without saving them', async () => {
    const s = getSettings();
    s.portrayStyle = 'summary';
    s.portrayPerson = 'third';
    saveSettings();
    stub.fireStyleEl.value = 'rp';
    stub.firePersonEl.value = 'second';

    const fired = lastUserText(await assemblePortrayMessages(
        getConversation(),
        getEffectiveSettings(),
        readFireTimePortrayForm(),
    ));
    assert.equal(getSettings().portrayStyle, 'summary');
    assert.equal(getSettings().portrayPerson, 'third');
    assert.ok(fired.includes('spoken words and bodily action'));
    assert.ok(fired.includes('in second person'));
});

test('portray does not flip stored tool settings or keep tool modules', async () => {
    getSettings().toolsEnabled = true;
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    assert.equal(getSettings().toolsEnabled, true);
    assert.ok(!payloadText(messages).includes('<modules>'));
    assert.ok(!payloadText(messages).includes('tool_calls_system'));
});

test('portray asks for the next turn instead of more private thinking', async () => {
    const text = payloadText(await assemblePortrayMessages(getConversation(), getEffectiveSettings()));
    assert.ok(!text.includes('Thinking is all that happens here'));
    assert.ok(text.includes("Write {{user}}'s next turn"));
});

test('portray trigger defaults are manual and input-box landing', () => {
    assert.equal(getSettings().portrayAutoTrigger, false);
    assert.equal(getSettings().portrayImmediateSend, false);
});

test('the portray result lands in the input box and is not sent', async () => {
    const draft = 'I set the cup down. "We leave at dawn."';
    routePortrayToInput(draft);

    assert.equal(stub.inputBox.value, draft);
    assert.ok(stub.inputBox.events.includes('input'));
    assert.equal(stub.sendButton.clicks, 0);
    assert.equal(stub.generateCalls, 0);
    assert.equal(stub.chat.length, 1);
});

test('runPortray routes generated text to the input box without sending', async () => {
    const draft = 'I look at Kyrine. "Enough."';
    await runPortray({}, {
        generate: async () => ({ text: draft }),
    });

    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
    assert.equal(stub.generateCalls, 0);
    assert.equal(stub.chat.length, 1);
});

test('immediate send routes the same portray result to a sent message', async () => {
    getSettings().portrayImmediateSend = true;
    const draft = 'I look at Kyrine. "Enough."';
    await runPortray({}, {
        generate: async () => ({ text: draft }),
    });

    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 1);
    assert.equal(stub.generateCalls, 0);
});

test('auto-trigger disabled produces no detection behavior at all', async () => {
    let portrayStarted = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "...yeah, let's just do that." },
        { generate: async () => { portrayStarted += 1; return { text: 'I nod.' }; } },
    );

    assert.equal(getSettings().portrayAutoTrigger, false);
    assert.equal(portrayStarted, 0);
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);
});

test('auto-trigger firing never sends unless immediate send is separately enabled', async () => {
    getSettings().portrayAutoTrigger = true;
    const draft = 'I set the cup down. "We leave at dawn."';
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "...yeah, let's just do that." },
        { generate: async () => ({ text: draft }) },
    );

    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
    assert.equal(stub.generateCalls, 0);
    assert.equal(stub.chat.length, 1);
});

test('auto-trigger with immediate send on sends the portray', async () => {
    getSettings().portrayAutoTrigger = true;
    getSettings().portrayImmediateSend = true;
    const draft = 'I look at Kyrine. "Enough."';
    await considerAutoTriggerPortray(
        { role: 'user', content: 'you should probably tell her about the letter.' },
        { generate: async () => ({ text: draft }) },
    );

    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 1);
});

test('a non-concluding exchange turn does not fire auto-trigger', async () => {
    getSettings().portrayAutoTrigger = true;
    let portrayStarted = 0;
    await considerAutoTriggerPortray(
        { role: 'user', content: 'wtf? how can she talk to us like that?' },
        { generate: async () => { portrayStarted += 1; return { text: 'I stare.' }; } },
    );

    assert.equal(portrayStarted, 0);
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);
});

test('telling someone not to speak is not a portray conclusion cue', async () => {
    getSettings().portrayAutoTrigger = true;
    let portrayStarted = 0;
    await considerAutoTriggerPortray(
        { role: 'user', content: "don't tell her yet" },
        { generate: async () => { portrayStarted += 1; return { text: 'I wait.' }; } },
    );

    assert.equal(portrayStarted, 0);
    assert.equal(stub.inputBox.value, '');
});

test('an intrusive command is not a portray conclusion cue', async () => {
    getSettings().portrayAutoTrigger = true;
    let portrayStarted = 0;
    await considerAutoTriggerPortray(
        { role: 'user', content: 'Slap Kyrine.' },
        { generate: async () => { portrayStarted += 1; return { text: 'I slap her.' }; } },
    );

    assert.equal(portrayStarted, 0);
    assert.equal(stub.inputBox.value, '');
});

test('auto-trigger waits until inner generation is idle, then still does not send', async () => {
    getSettings().portrayAutoTrigger = true;
    const draft = 'I look at Kyrine. "Enough."';
    state.generating = true;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "...yeah, let's just do that." },
        { generate: async () => ({ text: draft }) },
    );
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);

    state.generating = false;
    await flushPendingAutoPortray();
    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
});
