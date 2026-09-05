import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: exchange-spine.test.js) ───────────────

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
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

const { initConversation, getConversation, addTurn } = await import('../src/conversation.js');
const {
    segmentAnchorLabel,
    isSegmentClosed,
    nearestSegmentAbove,
    nearestSegmentBelow,
} = await import('../src/ui/ui-chat.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

beforeEach(async () => {
    files.clear();
    stub.chat = [mainMsg('Opening scene.')];
    stub.chatId = 'chat-a';
    stub.chatMetadataByChat = { 'chat-a': {}, 'chat-b': {} };
    await initConversation({ forceReset: true });
});

// ─── Anchor markers identify their main-chat message ─────────────────────────

test('segmentAnchorLabel names the speaker and opens the anchored line', () => {
    stub.chat = [
        mainMsg('The corridor breathes.', false),
        mainMsg('I head for the bridge.', true),
    ];
    assert.equal(segmentAnchorLabel(1), '#1 · You · I head for the bridge.');
    assert.equal(segmentAnchorLabel(0), '#0 · Char · The corridor breathes.');
});

test('segmentAnchorLabel skips opening markup and shows the first readable words', () => {
    stub.chat = [
        mainMsg('<!-- EP_PLAN: n=1 | source="scene" -->\nThe corridor breathes.', false),
    ];
    stub.chat[0].name = 'Lewd World';
    assert.equal(segmentAnchorLabel(0), '#0 · Lewd World · The corridor breathes.');
});

test('segmentAnchorLabel skips tags and code fences before the excerpt', () => {
    stub.chat = [mainMsg('<em>The corridor breathes.</em>', false)];
    assert.equal(segmentAnchorLabel(0), '#0 · Char · The corridor breathes.');
    stub.chat = [mainMsg('```html\nsecret\n```\nThe corridor breathes.', false)];
    assert.equal(segmentAnchorLabel(0), '#0 · Char · The corridor breathes.');
});

test('segmentAnchorLabel keeps a markup-only message identifiable by number and speaker', () => {
    stub.chat = [mainMsg('<!-- EP_PLAN: n=1 | source="scene" -->', false)];
    assert.equal(segmentAnchorLabel(0), '#0 · Char');
});

test('segmentAnchorLabel survives missing, unnamed, and long anchors', () => {
    stub.chat = [];
    assert.equal(segmentAnchorLabel(null), 'Unanchored');
    assert.equal(segmentAnchorLabel(5), 'Main chat · message 6');
    stub.chat = [{ mes: 'x'.repeat(200), is_user: true }];
    assert.equal(segmentAnchorLabel(0), `#0 · You · ${'x'.repeat(48)}…`);
});

// ─── Closed exchanges: old ones present as closed, not extendable ────────────

test('only the live-edge exchange is open; earlier ones present as closed', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'thought at one');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'thought at two');

    assert.equal(isSegmentClosed(1), true);
    assert.equal(isSegmentClosed(2), false);
});

test('a live-edge exchange is open regardless of turn count', () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'a');
    addTurn(conv, 'assistant', 'b');
    addTurn(conv, 'user', 'c');
    assert.equal(isSegmentClosed(0), false);
});

// ─── Jump navigation: move between exchanges ─────────────────────────────────

test('nearestSegmentAbove steps to the previous distinct anchor', () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'at 0');
    stub.chat.push(mainMsg('two'));
    addTurn(conv, 'user', 'at 1');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'at 2');

    assert.equal(nearestSegmentAbove(conv, 1), 0);
    assert.equal(nearestSegmentAbove(conv, 2), 1);
    assert.equal(nearestSegmentAbove(conv, 0), null);
});

test('nearestSegmentBelow steps to the next distinct anchor', () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'at 0');
    stub.chat.push(mainMsg('two'));
    addTurn(conv, 'user', 'at 1');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'at 2');

    assert.equal(nearestSegmentBelow(conv, 0), 1);
    assert.equal(nearestSegmentBelow(conv, 1), 2);
    assert.equal(nearestSegmentBelow(conv, 2), null);
});

test('unanchored exchanges participate in navigation as one end of the chain', () => {
    stub.chat = [];
    const conv = getConversation();
    addTurn(conv, 'user', 'pre-story');
    stub.chat.push(mainMsg('one'));
    addTurn(conv, 'user', 'at 0');

    assert.equal(nearestSegmentAbove(conv, 0), null);
    assert.equal(nearestSegmentBelow(conv, null), 0);
});
