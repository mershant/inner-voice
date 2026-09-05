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
        if (id === 'iv-input') return stub.thinkBox;
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
    thinkBox: { value: '', events: [], dispatchEvent(ev) { this.events.push(ev.type); return true; } },
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
const { DEFAULT_PORTRAY_PROMPT } = await import('../src/constants.js');
const {
    assemblePortrayMessages,
    readFireTimePortrayForm,
    routePortrayToInput,
    runPortray,
    considerAutoTriggerPortray,
    flushPendingAutoPortray,
    splitPortraySignal,
} = await import('../src/portray.js');

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
    stub.thinkBox.value = '';
    stub.thinkBox.events = [];
    stub.sendButton.clicks = 0;
    stub.fireStyleEl.value = 'rp';
    stub.firePersonEl.value = 'first';
    state.generating = false;
    await initConversation({ forceReset: true });
    await flushPendingAutoPortray();
}

beforeEach(reset);

test('the default portray request carries the scene-response prompt, not the old source-from-thinking wording', async () => {
    const sys = (await assemblePortrayMessages(getConversation(), getEffectiveSettings()))
        .find(m => m.role === 'system')?.content || '';
    assert.ok(sys.includes('answers the present scene'));
    assert.ok(sys.includes('supporting opinion'));
    assert.ok(!/the turn comes from its feelings, plans, and conclusions/i.test(sys));
    assert.ok(!/from what they presently hold/i.test(sys));
});

test('the default portray prompt answers the scene; private thinking only shapes how', () => {
    // Ticket #17 / IV-P-006: the turn answers the present scene. The exchange
    // is a supporting opinion that tilts manner. It is never source material.
    assert.match(DEFAULT_PORTRAY_PROMPT, /answers the present scene/i);
    assert.match(DEFAULT_PORTRAY_PROMPT, /supporting opinion/i);
    assert.match(DEFAULT_PORTRAY_PROMPT, /how \{\{user\}\} acts/i);
    assert.match(DEFAULT_PORTRAY_PROMPT, /not the material of the turn/i);
    assert.match(DEFAULT_PORTRAY_PROMPT, /without private thinking/i);
    assert.ok(DEFAULT_PORTRAY_PROMPT.includes("{{user}}'s own actions and spoken words"));

    // The live failure: "the turn comes from its feelings, plans, and conclusions"
    // made the model restage the exchange as the action.
    assert.ok(!/the turn comes from its feelings, plans, and conclusions/i.test(DEFAULT_PORTRAY_PROMPT));
    assert.ok(!/from what they presently hold/i.test(DEFAULT_PORTRAY_PROMPT));
});

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

test('portray carries a written post-history message the same way', async () => {
    const conv = getConversation();
    const settings = getEffectiveSettings();
    settings.postHistoryText = 'Ready.';
    settings.postHistoryRole = 'user';

    const messages = await assemblePortrayMessages(conv, settings);
    const mainIdx = messages.findIndex(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    const afterMain = messages.slice(mainIdx + 1);
    assert.equal(afterMain[0].role, 'user');
    assert.equal(afterMain[0].content, 'Ready.');
    assert.equal(afterMain[afterMain.length - 1].role, 'user');
    assert.ok(afterMain[afterMain.length - 1].content.includes("Write {{user}}'s next turn"));
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
    assert.match(text, /without private thinking/i);
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

test('an edited portray prompt is what the portray request carries, and reset restores the default', async () => {
    const edited = 'EDITED-PORTRAY-SEAM: write the knock at the door, not the private argument.';
    getSettings().portrayPrompt = edited;
    saveSettings();

    let sys = (await assemblePortrayMessages(getConversation(), getEffectiveSettings()))
        .find(m => m.role === 'system')?.content || '';
    assert.ok(sys.includes('EDITED-PORTRAY-SEAM: write the knock at the door, not the private argument.'));
    assert.ok(!sys.includes('answers the present scene'));

    getSettings().portrayPrompt = DEFAULT_PORTRAY_PROMPT;
    saveSettings();
    sys = (await assemblePortrayMessages(getConversation(), getEffectiveSettings()))
        .find(m => m.role === 'system')?.content || '';
    assert.ok(sys.includes('answers the present scene'));
    assert.ok(!sys.includes('EDITED-PORTRAY-SEAM'));
});

test('a blank portray prompt falls back to the default', async () => {
    getSettings().portrayPrompt = '   ';
    const sys = (await assemblePortrayMessages(getConversation(), getEffectiveSettings()))
        .find(m => m.role === 'system')?.content || '';
    assert.ok(sys.includes('answers the present scene'));
});

test('the portray prompt setting defaults to the shipped default', () => {
    assert.equal(getSettings().portrayPrompt, DEFAULT_PORTRAY_PROMPT);
});

test('a stored copy of the superseded portray prompt upgrades to the current default', async () => {
    const { LEGACY_PORTRAY_PROMPTS } = await import('../src/constants.js');
    stub.extensionSettings.inner_voice = { portrayPrompt: LEGACY_PORTRAY_PROMPTS[0] };
    assert.equal(getSettings().portrayPrompt, DEFAULT_PORTRAY_PROMPT);

    stub.extensionSettings.inner_voice = { portrayPrompt: 'My own portray prompt.' };
    assert.equal(getSettings().portrayPrompt, 'My own portray prompt.');
});

test('profiles carrying a superseded portray prompt upgrade too', async () => {
    const { LEGACY_PORTRAY_PROMPTS } = await import('../src/constants.js');
    stub.extensionSettings.inner_voice = {
        profiles: {
            'Default': { portrayPrompt: LEGACY_PORTRAY_PROMPTS[0] },
            'Mine': { portrayPrompt: 'My own portray prompt.' },
        },
    };
    const s = getSettings();
    assert.equal(s.profiles['Default'].portrayPrompt, DEFAULT_PORTRAY_PROMPT);
    assert.equal(s.profiles['Mine'].portrayPrompt, 'My own portray prompt.');
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

test('auto-trigger off ignores a hidden portray signal and makes no extra request', async () => {
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "Screw it. I'm doing it.\n\n<scene-now />" },
        {
            generate: async () => { generateCalls += 1; return { text: 'I nod.' }; },
        },
    );

    assert.equal(getSettings().portrayAutoTrigger, false);
    assert.equal(generateCalls, 0);
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);
});

test('auto-trigger with immediate send on sends the portray', async () => {
    getSettings().portrayAutoTrigger = true;
    getSettings().portrayImmediateSend = true;
    const draft = 'I look at Kyrine. "Enough."';
    await considerAutoTriggerPortray(
        { role: 'assistant', content: 'Just thank him and take it. Tell him.\n\n<scene-now />' },
        {
            generate: async () => ({ text: draft }),
        },
    );

    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 1);
});

test('a generated reply without the hidden portray signal does not fire portray', async () => {
    getSettings().portrayAutoTrigger = true;
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "Screw it. I'm doing it." },
        {
            generate: async () => { generateCalls += 1; return { text: 'I stare.' }; },
        },
    );

    assert.equal(generateCalls, 0);
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);
});

test('rejection or deferral without the hidden portray signal does not fire portray', async () => {
    getSettings().portrayAutoTrigger = true;
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "don't tell her yet" },
        {
            generate: async () => { generateCalls += 1; return { text: 'I wait.' }; },
        },
    );

    assert.equal(generateCalls, 0);
    assert.equal(stub.inputBox.value, '');
});

test('the hidden portray signal fires regardless of the visible wording', async () => {
    getSettings().portrayAutoTrigger = true;
    const draft = 'I look at Kyrine. "Enough."';
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "don't tell her yet\n\n<scene-now />" },
        {
            generate: async () => { generateCalls += 1; return { text: draft }; },
        },
    );

    assert.equal(generateCalls, 1);
    assert.equal(stub.inputBox.value, draft);
});

test('an Inner Voice turn does not carry the automatic trigger decision', async () => {
    getSettings().portrayAutoTrigger = true;
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'user', content: 'Just thank him and take it. Tell him.\n\n<scene-now />' },
        {
            generate: async () => { generateCalls += 1; return { text: 'I nod.' }; },
        },
    );

    assert.equal(generateCalls, 0);
    assert.equal(stub.inputBox.value, '');
});

test('the portray request carries think-box text as authored conduct, never main-chat box content', async () => {
    stub.thinkBox.value = 'thank him and take it. tell him.';
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    const block = messages.find(m => typeof m.content === 'string' && m.content.includes('<authored-conduct>'));
    assert.ok(block, 'portray request is missing the authored-conduct block');
    assert.ok(block.content.includes('thank him and take it. tell him.'));
    assert.match(block.content, /already decided/i);
    assert.ok(!payloadText(messages).includes('DECOY FROM MAIN CHAT'));
});

test('an empty think box leaves the portray request without an authored-conduct block', async () => {
    stub.thinkBox.value = '';
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    assert.ok(!payloadText(messages).includes('<authored-conduct>'));
    assert.ok(!payloadText(messages).includes('already decided this conduct'));
    assert.ok(!payloadText(messages).includes('DECOY FROM MAIN CHAT'));
});

test('whitespace in the think box is treated as empty', async () => {
    stub.thinkBox.value = '  \n\t  ';
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    assert.ok(!payloadText(messages).includes('<authored-conduct>'));
    assert.ok(!payloadText(messages).includes('DECOY FROM MAIN CHAT'));
});

test('an empty think box matches unseeded portray byte-for-byte even with main-chat box text', async () => {
    stub.thinkBox.value = '';
    stub.inputBox.value = '';
    const unseeded = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';
    const withDecoy = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    assert.deepEqual(withDecoy, unseeded);
});

test('authored conduct stays outside the exchange and does not restage it', async () => {
    const conv = getConversation();
    addTurn(conv, 'user', 'alright, TELL HER');
    addTurn(conv, 'assistant', 'Fine. I am going to say it to her face.');
    stub.thinkBox.value = 'thank him and take it. tell him.';
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';

    const messages = await assemblePortrayMessages(conv, getEffectiveSettings());
    const innerMemory = messages.find(m => typeof m.content === 'string' && m.content.includes('<inner-exchange>'));
    const block = messages.find(m => typeof m.content === 'string' && m.content.includes('<authored-conduct>'));

    assert.ok(innerMemory);
    assert.ok(block);
    assert.ok(innerMemory.content.includes('alright, TELL HER'));
    assert.ok(!innerMemory.content.includes('thank him and take it. tell him.'));
    assert.ok(!block.content.includes('<inner-exchange>'));
    assert.ok(!block.content.includes('alright, TELL HER'));
    assert.ok(block.content.includes('thank him and take it. tell him.'));
    assert.ok(!payloadText(messages).includes('DECOY FROM MAIN CHAT'));
});

test('a think box with text and an empty think box differ only by the authored-conduct block', async () => {
    stub.thinkBox.value = '';
    stub.inputBox.value = 'DECOY FROM MAIN CHAT';
    const unseeded = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const seeded = await assemblePortrayMessages(getConversation(), getEffectiveSettings());

    assert.equal(seeded.length, unseeded.length + 1);
    const blockIdx = seeded.findIndex(m => typeof m.content === 'string' && m.content.includes('<authored-conduct>'));
    assert.ok(blockIdx >= 0);
    const withoutBlock = [...seeded.slice(0, blockIdx), ...seeded.slice(blockIdx + 1)];
    assert.deepEqual(withoutBlock, unseeded);
    assert.equal(seeded[seeded.length - 1].content, unseeded[unseeded.length - 1].content);
    assert.ok(seeded[blockIdx].content.includes('thank him and take it. tell him.'));
});

test('portray with think-box text still routes to the main-chat box without sending', async () => {
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const draft = 'I thank him and take the cup. "You should hear this."';
    await runPortray({}, { generate: async () => ({ text: draft }) });
    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
    assert.equal(stub.generateCalls, 0);
});

test('portray with think-box text and immediate send still sends', async () => {
    getSettings().portrayImmediateSend = true;
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const draft = 'I thank him and take the cup. "You should hear this."';
    await runPortray({}, { generate: async () => ({ text: draft }) });
    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 1);
});

test('a successful portray consumes think-box text without posting an exchange turn', async () => {
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const before = getConversation().messages.slice();
    const draft = 'I thank him and take the cup. "You should hear this."';
    await runPortray({}, { generate: async () => ({ text: draft }) });
    assert.equal(stub.thinkBox.value, '');
    assert.deepEqual(getConversation().messages, before);
    assert.equal(stub.inputBox.value, draft);
});

test('an empty portray result leaves think-box text in place', async () => {
    stub.thinkBox.value = 'thank him and take it. tell him.';
    await runPortray({}, { generate: async () => ({ text: '   ' }) });
    assert.equal(stub.thinkBox.value, 'thank him and take it. tell him.');
    assert.equal(stub.sendButton.clicks, 0);
});

test('with text in the think box, the portray request carries it as authored conduct', async () => {
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const messages = await assemblePortrayMessages(getConversation(), getEffectiveSettings());
    const block = messages.find(m => typeof m.content === 'string' && m.content.includes('<authored-conduct>'));
    assert.ok(block, 'portray request is missing the authored-conduct block');
    assert.ok(block.content.includes('thank him and take it. tell him.'));
    assert.match(block.content, /already decided/i);
    assert.match(block.content, /manner/i);
    const sys = messages.find(m => m.role === 'system')?.content || '';
    assert.ok(sys.includes('supporting opinion'));
    assert.ok(!sys.includes('thank him and take it. tell him.'));
});

test('auto-triggered portray never consumes think-box text', async () => {
    getSettings().portrayAutoTrigger = true;
    stub.thinkBox.value = 'thank him and take it. tell him.';
    const draft = 'I look at Kyrine. "Enough."';
    let portrayPayload = null;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "Screw it. I'm doing it.\n\n<scene-now />" },
        {
            generate: async (_conv, _settings, _pending, messages) => {
                portrayPayload = messages;
                return { text: draft };
            },
        },
    );

    assert.ok(portrayPayload);
    assert.ok(!payloadText(portrayPayload).includes('<authored-conduct>'));
    assert.ok(!payloadText(portrayPayload).includes('thank him and take it. tell him.'));
    assert.equal(stub.thinkBox.value, 'thank him and take it. tell him.');
    assert.equal(stub.inputBox.value, draft);
});

test('auto-trigger waits until inner generation is idle, then still does not send', async () => {
    getSettings().portrayAutoTrigger = true;
    let generateCalls = 0;
    const draft = 'I look at Kyrine. "Enough."';
    state.generating = true;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: 'Just say it. Take it. Walk.\n\n<scene-now />' },
        {
            generate: async () => { generateCalls += 1; return { text: draft }; },
        },
    );
    assert.equal(generateCalls, 0);
    assert.equal(stub.inputBox.value, '');
    assert.equal(stub.sendButton.clicks, 0);

    state.generating = false;
    await flushPendingAutoPortray();
    assert.equal(generateCalls, 1);
    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
});

test('a generated reply with the hidden portray signal stays visible without the signal', () => {
    const { visible, triggered } = splitPortraySignal(
        'Yeah. I am going to say it.\n\n<scene-now />',
    );
    assert.equal(triggered, true);
    assert.equal(visible, 'Yeah. I am going to say it.');
});

test('a generated reply without the hidden portray signal is unchanged', () => {
    const { visible, triggered } = splitPortraySignal("Screw it. I'm doing it.");
    assert.equal(triggered, false);
    assert.equal(visible, "Screw it. I'm doing it.");
});

test('auto-trigger on puts the hidden marker instruction in the inner reply, covering both voices', async () => {
    getSettings().portrayAutoTrigger = true;
    const { assembleMessages } = await import('../src/api.js');
    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings()));
    assert.ok(text.includes('<scene-now />'));
    assert.match(text, /settled course/i);
    assert.match(text, /Inner Voice/i);
    assert.match(text, /committed/i);
});

test('auto-trigger off keeps the inner reply free of the hidden marker instruction', async () => {
    const { assembleMessages } = await import('../src/api.js');
    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings()));
    assert.ok(!text.includes('<scene-now />'));
    assert.ok(!text.includes('<scene_now>'));
});

test('the portray request does not carry the hidden marker instruction', async () => {
    getSettings().portrayAutoTrigger = true;
    const text = payloadText(await assemblePortrayMessages(getConversation(), getEffectiveSettings()));
    assert.ok(!text.includes('<scene-now />'));
    assert.ok(!text.includes('<scene_now>'));
});

test('a generated reply with the hidden portray signal drafts a portray as the only extra request', async () => {
    getSettings().portrayAutoTrigger = true;
    const draft = 'I set the cup down. "We leave at dawn."';
    let generateCalls = 0;
    await considerAutoTriggerPortray(
        { role: 'assistant', content: "Screw it. I'm doing it.\n\n<scene-now />" },
        {
            generate: async () => {
                generateCalls += 1;
                return { text: draft };
            },
        },
    );

    assert.equal(generateCalls, 1);
    assert.equal(stub.inputBox.value, draft);
    assert.equal(stub.sendButton.clicks, 0);
    assert.equal(stub.generateCalls, 0);
    assert.equal(stub.chat.length, 1);
});
