import { test } from 'node:test';
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
globalThis.SillyTavern = {
    getContext() {
        return { extensionSettings: {}, saveSettingsDebounced() {}, chat: [], characters: [], name1: 'User', name2: 'Char' };
    },
};

const { parseToolCallsFromText } = await import('../src/features/feature-tools-engine.js');

test('existing tool parsing: single fenced get_recent_messages call', () => {
    const text = 'Sure.\n```tool_call\n{"name":"get_recent_messages","input":{"prompt":"Eloise in the chapel","composition":"character_sheet","subjects":[{"name":"Eloise"}]}}\n```\n';
    const calls = parseToolCallsFromText(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'get_recent_messages');
    assert.equal(calls[0].input.composition, 'character_sheet');
    assert.equal(calls[0].input.prompt, 'Eloise in the chapel');
});

test('existing tool parsing: search_chat still parses', () => {
    const text = '```tool_call\n{"name":"search_chat","input":{"queries":["chapel"]}}\n```';
    const calls = parseToolCallsFromText(text);
    assert.equal(calls[0].name, 'search_chat');
    assert.deepEqual(calls[0].input.queries, ['chapel']);
});

test('existing tool parsing: adjacent JSON objects in one fence', () => {
    const text = '```tool_call\n{"name":"get_char_info","input":{"fields":["description"]}}\n{"name":"get_chat_stats","input":{}}\n```';
    const calls = parseToolCallsFromText(text);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, 'get_char_info');
    assert.equal(calls[1].name, 'get_chat_stats');
});
