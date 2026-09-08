import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
};
globalThis.window = globalThis;
globalThis.toastr = { error() {}, warning() {}, success() {}, info() {} };

const stub = {
    name1: 'Elaine',
    name2: 'Kyrine',
    substituteParams: undefined,
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: [],
            characterId: 0,
            characters: [{ name: stub.name2 }],
            name1: stub.name1,
            name2: stub.name2,
            extensionSettings: {},
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => 'chat-a',
            getRequestHeaders: () => ({}),
            chatMetadata: {},
            substituteParams: stub.substituteParams,
        };
    },
};

const { expandMacros } = await import('../src/conversation.js');

beforeEach(() => {
    stub.name1 = 'Elaine';
    stub.name2 = 'Kyrine';
    stub.substituteParams = undefined;
});

test('{{voice}} resolves to the persona name in the {{user}} session', () => {
    assert.equal(expandMacros('{{voice}}'), 'Elaine');
});

test('{{voice}} resolves to a non-{{user}} owner while {{user}} stays the persona', () => {
    assert.equal(expandMacros('{{voice}} speaks privately to {{user}}', 'Kyrine'), 'Kyrine speaks privately to Elaine');
});

test('{{user}} still resolves to the persona name', () => {
    assert.equal(expandMacros('{{user}}'), 'Elaine');
});

test('in the {{user}} session, {{voice}} and {{user}} resolve to the same name', () => {
    assert.equal(expandMacros('hello {{voice}}'), expandMacros('hello {{user}}'));
});

test('{{user}} still resolves through SillyTavern when substituteParams is present', () => {
    stub.substituteParams = (text) => String(text).replace(/\{\{user\}\}/gi, stub.name1);
    assert.equal(expandMacros('{{user}}'), 'Elaine');
    assert.equal(expandMacros('{{voice}}'), 'Elaine');
});
