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
    segmentTurns,
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

// ─── Segments: the window renders one continuous conversation in exchanges ───

test('segmentTurns groups turns by anchor in conversation order', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'first thought');
    addTurn(conv, 'assistant', 'first answer');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'second thought');

    const segments = segmentTurns(conv);
    assert.equal(segments.length, 2);
    assert.deepEqual(segments.map(s => s.anchorIndex), [1, 2]);
    assert.deepEqual(segments[0].turns.map(t => t.content), ['first thought', 'first answer']);
    assert.deepEqual(segments[1].turns.map(t => t.content), ['second thought']);
});

test('segmentTurns keeps a pre-story segment first, ordered before anchored ones', () => {
    stub.chat = [];
    const conv = getConversation();
    addTurn(conv, 'user', 'pre-story thought');
    stub.chat.push(mainMsg('one'));
    addTurn(conv, 'user', 'present thought');

    const segments = segmentTurns(conv);
    assert.deepEqual(segments.map(s => s.anchorIndex), [null, 0]);
    assert.deepEqual(segments[0].turns.map(t => t.content), ['pre-story thought']);
});

// ─── Anchor labels: markers identify their main-chat message ─────────────────

test('segmentAnchorLabel names the speaker and opens the anchored line', () => {
    stub.chat = [
        mainMsg('The corridor breathes.', false),
        mainMsg('I head for the bridge.', true),
    ];
    assert.equal(segmentAnchorLabel(1), 'You · I head for the bridge.');
    assert.equal(segmentAnchorLabel(0), 'Char · The corridor breathes.');
});

test('segmentAnchorLabel survives missing, unnamed, and long anchors', () => {
    stub.chat = [];
    assert.equal(segmentAnchorLabel(null), 'Unanchored');
    assert.equal(segmentAnchorLabel(5), 'Main chat · message 6');
    stub.chat = [{ mes: 'x'.repeat(200), is_user: true }];
    const label = segmentAnchorLabel(0);
    assert.ok(label.startsWith('You · '));
    assert.ok(label.length < 60);
});

// ─── Closed segments: old exchanges present as closed, not extendable ────────

test('only the live-edge segment is open; earlier ones present as closed', () => {
    stub.chat = [mainMsg('one'), mainMsg('two')];
    const conv = getConversation();
    addTurn(conv, 'user', 'thought at one');
    stub.chat.push(mainMsg('three'));
    addTurn(conv, 'user', 'thought at two');

    assert.equal(isSegmentClosed(conv, 1), true);
    assert.equal(isSegmentClosed(conv, 2), false);
});

test('a live-edge segment is open regardless of turn count', () => {
    stub.chat = [mainMsg('one')];
    const conv = getConversation();
    addTurn(conv, 'user', 'a');
    addTurn(conv, 'assistant', 'b');
    addTurn(conv, 'user', 'c');
    assert.equal(isSegmentClosed(conv, 0), false);
});

// ─── Jump navigation: move between segments ──────────────────────────────────

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

test('unanchored segments participate in navigation as one end of the chain', () => {
    stub.chat = [];
    const conv = getConversation();
    addTurn(conv, 'user', 'pre-story');
    stub.chat.push(mainMsg('one'));
    addTurn(conv, 'user', 'at 0');

    assert.equal(nearestSegmentAbove(conv, 0), null);
    assert.equal(nearestSegmentBelow(conv, null), 0);
});
