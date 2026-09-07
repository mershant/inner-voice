import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareGenerateBody } from '../src/reasoning-level.js';

function effortBody(extra = {}) {
    return {
        chat_completion_source: 'openai',
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.8,
        ...extra,
    };
}

function geminiBody(extra = {}) {
    return {
        chat_completion_source: 'makersuite',
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'hello' }],
        safety_settings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }],
        ...extra,
    };
}

test('Unset on an effort-style body matches today: auto effort is dropped, other bytes stay', () => {
    const out = prepareGenerateBody(effortBody({
        reasoning_effort: 'auto',
        custom_prompt_post_processing: '',
    }), 'unset');

    assert.equal(JSON.stringify(out), JSON.stringify({
        chat_completion_source: 'openai',
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.8,
    }));
});

test('Unset remaps min to low and max to high the way today already does', () => {
    assert.equal(prepareGenerateBody(effortBody({ reasoning_effort: 'min' }), 'unset').reasoning_effort, 'low');
    assert.equal(prepareGenerateBody(effortBody({ reasoning_effort: 'max' }), 'unset').reasoning_effort, 'high');
    assert.equal(prepareGenerateBody(effortBody({ reasoning: { effort: 'min' } }), 'unset').reasoning.effort, 'low');
    assert.equal(prepareGenerateBody(effortBody({ reasoning: { effort: 'max' } }), 'unset').reasoning.effort, 'high');
});

test('Off on an effort-style body sends the explicit disable shape', () => {
    const out = prepareGenerateBody(effortBody({ reasoning_effort: 'medium' }), 'off');
    assert.deepEqual(out.thinking, { type: 'disabled' });
    assert.equal(out.include_reasoning, false);
    assert.equal('reasoning_effort' in out, false);
    assert.equal(out.temperature, 0.8);
});

test('each chosen effort level writes that effort on an OpenAI-style body', () => {
    assert.equal(prepareGenerateBody(effortBody(), 'low').reasoning_effort, 'low');
    assert.equal(prepareGenerateBody(effortBody(), 'medium').reasoning_effort, 'medium');
    assert.equal(prepareGenerateBody(effortBody(), 'high').reasoning_effort, 'high');
    assert.equal(prepareGenerateBody(effortBody(), 'xhigh').reasoning_effort, 'xhigh');
    assert.equal(prepareGenerateBody(effortBody(), 'max').reasoning_effort, 'max');
});

test('chosen Max is not remapped to high', () => {
    const out = prepareGenerateBody(effortBody({ reasoning_effort: 'low' }), 'max');
    assert.equal(out.reasoning_effort, 'max');
});

test('Gemini-style High writes Gemini thinking config and leaves the rest of the body', () => {
    const out = prepareGenerateBody(geminiBody({ reasoning_effort: 'auto' }), 'high');
    assert.deepEqual(out.thinkingConfig, { includeThoughts: true, thinkingLevel: 'high' });
    assert.equal(out.reasoning_effort, 'high');
    assert.deepEqual(out.safety_settings, [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }]);
    assert.deepEqual(out.messages, [{ role: 'user', content: 'hello' }]);
});

test('Gemini-style Off disables thoughts with a zero thinking budget', () => {
    const out = prepareGenerateBody(geminiBody({ reasoning_effort: 'high' }), 'off');
    assert.deepEqual(out.thinking, { type: 'disabled' });
    assert.deepEqual(out.thinkingConfig, { includeThoughts: false, thinkingBudget: 0 });
    assert.equal(out.include_reasoning, false);
});

test('Gemini-style xHigh and Max use high, the strongest Gemini thinking level', () => {
    assert.equal(prepareGenerateBody(geminiBody(), 'xhigh').thinkingConfig.thinkingLevel, 'high');
    assert.equal(prepareGenerateBody(geminiBody(), 'max').thinkingConfig.thinkingLevel, 'high');
});

test('zai and glm bodies drop reasoning fields even when a level is chosen, without rewriting the rest', () => {
    const zai = prepareGenerateBody({
        chat_completion_source: 'zai',
        model: 'glm-4',
        messages: [{ role: 'user', content: 'hello', name: 'Alice' }],
        temperature: 0.2,
        reasoning_effort: 'low',
    }, 'high');
    assert.equal('reasoning_effort' in zai, false);
    assert.equal('thinking' in zai, false);
    assert.equal('thinkingConfig' in zai, false);
    assert.equal(zai.temperature, 0.2);
    assert.deepEqual(zai.messages, [{ role: 'user', content: 'hello' }]);

    const glm = prepareGenerateBody({
        chat_completion_source: 'openai',
        model: 'GLM-4.5',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.3,
    }, 'medium');
    assert.equal('reasoning_effort' in glm, false);
    assert.equal(glm.temperature, 0.3);
});

test('preparing a body never mutates the original request or a sibling preset object', () => {
    const preset = { reasoning_effort: 'medium', temperature: 0.7 };
    const body = { ...preset, messages: [{ role: 'user', content: 'hello' }] };
    const frozenPreset = JSON.parse(JSON.stringify(preset));
    const frozenBody = JSON.parse(JSON.stringify(body));
    prepareGenerateBody(body, 'high');
    assert.deepEqual(preset, frozenPreset);
    assert.deepEqual(body, frozenBody);
});
