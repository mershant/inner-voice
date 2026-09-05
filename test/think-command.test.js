import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    executeThinkSubmission,
    parseThinkCommand,
    syncThinkCommandHint,
} from '../src/think-command.js';

const COMMAND_FORMS = command => [
    `${command} carry it through`,
    `${command}:carry it through`,
    `/${command} carry it through`,
];

function commandHarness({ exchangeResult = { role: 'assistant' } } = {}) {
    const calls = [];
    let suppressionActive = false;
    let automaticPortrays = 0;

    return {
        calls,
        get automaticPortrays() { return automaticPortrays; },
        deps: {
            consumeInput() {
                calls.push(['consume-input']);
            },
            expandExchangeText(text) {
                calls.push(['expand', text]);
                return `expanded:${text}`;
            },
            async sendExchange(text) {
                calls.push(['exchange', text]);
                if (!suppressionActive) automaticPortrays += 1;
                return exchangeResult;
            },
            async suppressAutoTrigger(task) {
                calls.push(['suppress-start']);
                suppressionActive = true;
                try {
                    return await task();
                } finally {
                    suppressionActive = false;
                    calls.push(['suppress-end']);
                }
            },
            async portray(form, options) {
                calls.push(['portray', form, options]);
                return { text: 'portrayed' };
            },
            portrayForm: { style: 'summary', person: 'third' },
        },
    };
}

test('p recognizes space, colon, and slash forms only at the absolute start', async () => {
    for (const input of COMMAND_FORMS('p')) {
        const harness = commandHarness();
        const result = await executeThinkSubmission(input, harness.deps);

        assert.equal(result.kind, 'portray');
        assert.deepEqual(harness.calls, [[
            'portray',
            { style: 'summary', person: 'third' },
            { seedText: 'carry it through', consumeSeed: true, forceSend: false },
        ]]);
    }
});

test('dp recognizes space, colon, and slash forms as one exchange followed by one unseeded portray', async () => {
    for (const input of COMMAND_FORMS('dp')) {
        const harness = commandHarness();
        const result = await executeThinkSubmission(input, harness.deps);

        assert.equal(result.kind, 'delayed-portray');
        assert.equal(harness.automaticPortrays, 0);
        assert.deepEqual(harness.calls, [
            ['expand', 'carry it through'],
            ['consume-input'],
            ['suppress-start'],
            ['exchange', 'expanded:carry it through'],
            ['suppress-end'],
            [
                'portray',
                { style: 'summary', person: 'third' },
                { seedText: '', consumeSeed: false, forceSend: false },
            ],
        ]);
    }
});

test('pa recognizes space, colon, and slash forms as a seeded portray forced to send', async () => {
    for (const input of COMMAND_FORMS('pa')) {
        const harness = commandHarness();
        const result = await executeThinkSubmission(input, harness.deps);

        assert.equal(result.kind, 'portray-and-send');
        assert.deepEqual(harness.calls, [[
            'portray',
            { style: 'summary', person: 'third' },
            { seedText: 'carry it through', consumeSeed: true, forceSend: true },
        ]]);
    }
});

test('bare p and pa are unseeded portrays, while bare dp behaves as bare p', async () => {
    for (const [input, kind, forceSend] of [
        ['p', 'portray', false],
        ['/p', 'portray', false],
        ['dp', 'portray', false],
        ['/dp', 'portray', false],
        ['pa', 'portray-and-send', true],
        ['/pa', 'portray-and-send', true],
    ]) {
        const harness = commandHarness();
        const result = await executeThinkSubmission(input, harness.deps);

        assert.equal(result.kind, kind);
        assert.deepEqual(harness.calls, [[
            'portray',
            { style: 'summary', person: 'third' },
            { seedText: '', consumeSeed: true, forceSend },
        ]]);
    }
});

test('command letters after any other character remain an ordinary exchange message', async () => {
    for (const input of [
        'say p carry it through',
        'xdp:carry it through',
        ' pa:carry it through',
        'perhaps this works',
        '/portrait the hall',
    ]) {
        const harness = commandHarness();
        const result = await executeThinkSubmission(input, harness.deps);

        assert.equal(result.kind, 'exchange');
        assert.deepEqual(harness.calls, [
            ['expand', input.trim()],
            ['consume-input'],
            ['exchange', `expanded:${input.trim()}`],
        ]);
    }
});

test('dp does not portray when the exchange reply does not complete', async () => {
    const harness = commandHarness({ exchangeResult: null });
    const result = await executeThinkSubmission('dp:carry it through', harness.deps);

    assert.equal(result.kind, 'delayed-portray');
    assert.equal(result.portrayResult, null);
    assert.ok(!harness.calls.some(([name]) => name === 'portray'));
});

test('parseThinkCommand leaves near matches and leading whitespace alone', () => {
    assert.deepEqual(parseThinkCommand('p: exact seed  '), { command: 'p', text: 'exact seed' });
    assert.deepEqual(parseThinkCommand('/dp exact turn'), { command: 'dp', text: 'exact turn' });
    assert.deepEqual(parseThinkCommand('pa '), { command: 'pa', text: '' });

    for (const input of ['P:seed', 'dplease', 'paper', '/portrait', ' p:seed', '\tdp turn']) {
        assert.equal(parseThinkCommand(input), null);
    }
});

test('the command hint follows matching input without inserting or changing text', () => {
    const input = { value: 'p:keep typing' };
    const hint = { hidden: true };

    assert.equal(syncThinkCommandHint(input, hint), true);
    assert.equal(hint.hidden, false);
    assert.equal(input.value, 'p:keep typing');

    input.value = 'say p:keep typing';
    assert.equal(syncThinkCommandHint(input, hint), false);
    assert.equal(hint.hidden, true);
    assert.equal(input.value, 'say p:keep typing');
});
