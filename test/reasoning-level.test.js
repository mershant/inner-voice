import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
    innerReasoningOverride,
    mergeExcludedFields,
    applyReasoningOverrideToBody,
} = await import('../src/reasoning-level.js');

const GEMINI_OFF_BODY = '{"thinking":{"type":"disabled"},"thinking_config":{"thinking_budget":0}}';



test('the three Inner connection surfaces place Reasoning level above Streaming', () => {
    const drawer = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
    const overlay = readFileSync(new URL('../settings_overlay.html', import.meta.url), 'utf8');
    const drawerReasoning = drawer.indexOf('id="iv-reasoning-level"');
    const drawerStreaming = drawer.indexOf('Streaming Mode');
    assert.ok(drawerReasoning >= 0 && drawerReasoning < drawerStreaming);
    const globalReasoning = overlay.indexOf('id="iv-sp-reasoning-level"');
    const globalStreaming = overlay.indexOf('id="iv-sp-stream-auto"');
    assert.ok(globalReasoning >= 0 && globalReasoning < globalStreaming);
    const ovReasoning = overlay.indexOf('id="iv-sp-ov-reasoning-level"');
    const ovStreaming = overlay.indexOf('id="iv-sp-ov-stream-auto"');
    assert.ok(ovReasoning >= 0 && ovReasoning < ovStreaming);
    for (const html of [drawer, overlay]) {
        assert.match(html, /value="unset">Unset/);
        assert.match(html, /value="off">Off/);
        assert.match(html, /value="xhigh">xHigh/);
        assert.match(html, /value="max">Max/);
    }
});

test('Unset reasoning returns no override', () => {
    assert.equal(
        innerReasoningOverride({ reasoningLevel: 'unset' }, { getChatCompletionModel: () => 'gpt-5.6-sol' }),
        undefined,
    );
    assert.equal(
        innerReasoningOverride({}, { getChatCompletionModel: () => 'gemini-3.7-flash' }),
        undefined,
    );
    assert.equal(
        innerReasoningOverride({ reasoningLevel: 'bogus' }, { getChatCompletionModel: () => 'gpt-5.6-sol' }),
        undefined,
    );
});

test('Off produces the explicit disable shape for Gemini-style and effort-style targets', () => {
    assert.equal(
        innerReasoningOverride(
            { reasoningLevel: 'off', connectionSource: 'default' },
            { getChatCompletionModel: () => 'gemini-3.7-flash' },
        ).custom_include_body,
        GEMINI_OFF_BODY,
    );
    assert.deepEqual(
        JSON.parse(innerReasoningOverride(
            { reasoningLevel: 'off', connectionSource: 'default' },
            { getChatCompletionModel: () => 'gpt-5.6-sol' },
        ).custom_include_body),
        { thinking: { type: 'disabled' }, reasoning_effort: 'none' },
    );
});

test('each reasoning level produces the Gemini-style and effort-style dialects', () => {
    const geminiLevels = {
        low: { thinking: { type: 'enabled' }, thinking_config: { thinking_level: 'low' } },
        medium: { thinking: { type: 'enabled' }, thinking_config: { thinking_level: 'medium' } },
        high: { thinking: { type: 'enabled' }, thinking_config: { thinking_level: 'high' } },
        xhigh: { thinking: { type: 'enabled' }, thinking_config: { thinking_level: 'xhigh' } },
        max: { thinking: { type: 'enabled' }, thinking_config: { thinking_level: 'max' } },
    };
    const effortLevels = {
        low: { reasoning_effort: 'low' },
        medium: { reasoning_effort: 'medium' },
        high: { reasoning_effort: 'high' },
        xhigh: { reasoning_effort: 'xhigh' },
        max: { reasoning_effort: 'max' },
    };

    for (const [level, body] of Object.entries(geminiLevels)) {
        assert.deepEqual(
            JSON.parse(innerReasoningOverride(
                { reasoningLevel: level, connectionSource: 'default' },
                { getChatCompletionModel: () => 'gemini-3.7-flash' },
            ).custom_include_body),
            body,
        );
    }
    for (const [level, body] of Object.entries(effortLevels)) {
        assert.deepEqual(
            JSON.parse(innerReasoningOverride(
                { reasoningLevel: level, connectionSource: 'default' },
                { getChatCompletionModel: () => 'gpt-5.6-sol' },
            ).custom_include_body),
            body,
        );
    }
});

test('incompatible reasoning fields are dropped without changing other request content', () => {
    const presetBody = {
        temperature: 0.8,
        top_p: 0.9,
        thinking: { type: 'enabled' },
        thinking_config: { thinking_budget: 2048 },
        reasoning_effort: 'medium',
        seed: 7,
    };

    const gemini = applyReasoningOverrideToBody(
        presetBody,
        innerReasoningOverride(
            { reasoningLevel: 'high', connectionSource: 'default' },
            { getChatCompletionModel: () => 'gemini-3.7-flash' },
        ),
    );
    assert.equal(gemini.temperature, 0.8);
    assert.equal(gemini.top_p, 0.9);
    assert.equal(gemini.seed, 7);
    assert.equal(gemini.reasoning_effort, undefined);
    assert.deepEqual(gemini.thinking, { type: 'enabled' });
    assert.deepEqual(gemini.thinking_config, { thinking_level: 'high' });

    const gpt = applyReasoningOverrideToBody(
        presetBody,
        innerReasoningOverride(
            { reasoningLevel: 'high', connectionSource: 'default' },
            { getChatCompletionModel: () => 'gpt-5.6-sol' },
        ),
    );
    assert.equal(gpt.reasoning_effort, 'high');
    assert.equal(gpt.thinking, undefined);
    assert.equal(gpt.thinking_config, undefined);
    assert.equal(gpt.seed, 7);
    assert.equal(gpt.temperature, 0.8);
    assert.equal(gpt.top_p, 0.9);
});

test('Gemini excludes reasoning_effort; non-Gemini excludes thinking and thinking_config', () => {
    const gemini = innerReasoningOverride(
        { reasoningLevel: 'high', connectionSource: 'default' },
        { getChatCompletionModel: () => 'gemini-3.7-flash' },
    );
    assert.deepEqual(JSON.parse(gemini.custom_exclude_body), ['reasoning_effort']);

    const gpt = innerReasoningOverride(
        { reasoningLevel: 'high', connectionSource: 'default' },
        { getChatCompletionModel: () => 'gpt-5.6-sol' },
    );
    assert.deepEqual(JSON.parse(gpt.custom_exclude_body), ['thinking', 'thinking_config']);
});

test('model compatibility exclusions preserve existing preset exclusions', () => {
    assert.equal(
        mergeExcludedFields('["seed","temperature"]', ['thinking', 'temperature']),
        '["seed","temperature","thinking"]',
    );
    assert.equal(
        mergeExcludedFields('- seed\n- top_k', ['thinking']),
        '["seed","top_k","thinking"]',
    );
});

test('existing preset exclusions survive on the computed override', () => {
    const preset = Object.freeze({
        custom_include_body: '{"thinking":{"type":"enabled"}}',
        custom_exclude_body: '["seed"]',
        temperature: 0.7,
    });
    const settings = Object.freeze({
        reasoningLevel: 'high',
        connectionSource: 'profile',
        connectionProfileId: 'inner',
    });
    const context = {
        extensionSettings: {
            connectionManager: {
                profiles: [{ id: 'inner', model: 'gpt-5.6-sol', preset: 'Active RP' }],
            },
        },
        getPresetManager: () => ({
            getCompletionPresetByName: (name) => (name === 'Active RP' ? preset : undefined),
        }),
    };

    const override = innerReasoningOverride(settings, context);
    assert.equal(preset.custom_include_body, '{"thinking":{"type":"enabled"}}');
    assert.equal(preset.custom_exclude_body, '["seed"]');
    assert.equal(preset.temperature, 0.7);
    assert.deepEqual(JSON.parse(override.custom_include_body), { reasoning_effort: 'high' });
    assert.match(override.custom_exclude_body, /"thinking"/u);
    assert.match(override.custom_exclude_body, /"seed"/u);
    assert.equal(settings.reasoningLevel, 'high');
});

test('Custom Endpoint uses customModel; Specific Profile uses the profile model', () => {
    const custom = innerReasoningOverride(
        { reasoningLevel: 'off', connectionSource: 'custom', customModel: 'gemini-3.7-flash' },
        { getChatCompletionModel: () => 'gpt-5.6-sol' },
    );
    assert.equal(custom.custom_include_body, GEMINI_OFF_BODY);

    const profile = innerReasoningOverride(
        { reasoningLevel: 'max', connectionSource: 'profile', connectionProfileId: 'p1' },
        {
            getChatCompletionModel: () => 'gemini-3.7-flash',
            extensionSettings: {
                connectionManager: { profiles: [{ id: 'p1', name: 'Inner', model: 'gpt-5.6-sol' }] },
            },
        },
    );
    assert.deepEqual(JSON.parse(profile.custom_include_body), { reasoning_effort: 'max' });
});

test('applying the override to a custom body drops carrier fields', () => {
    const override = innerReasoningOverride(
        { reasoningLevel: 'off', connectionSource: 'custom', customModel: 'grok-4.6' },
        {},
    );
    const body = applyReasoningOverrideToBody(
        {
            model: 'grok-4.6',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 16,
            stream: false,
            thinking: { type: 'enabled' },
            thinking_config: { thinking_budget: 2048 },
        },
        override,
    );
    assert.equal(body.reasoning_effort, 'none');
    assert.equal(body.thinking, undefined);
    assert.equal(body.thinking_config, undefined);
    assert.equal(body.custom_include_body, undefined);
    assert.equal(body.custom_exclude_body, undefined);
    assert.equal(body.model, 'grok-4.6');
});

test('Unset apply leaves the custom body unchanged', () => {
    const payload = Object.freeze({
        model: 'grok-4.6',
        messages: Object.freeze([{ role: 'user', content: 'hi' }]),
        max_tokens: 16,
        stream: false,
    });
    assert.equal(
        applyReasoningOverrideToBody(payload, innerReasoningOverride({ reasoningLevel: 'unset' }, {})),
        payload,
    );
});
