const EFFORT = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
};

const GEMINI_THINKING_LEVEL = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'high',
    max: 'high',
};

export function isGeminiSource(body) {
    const source = String(body?.chat_completion_source || '');
    return source === 'makersuite' || source === 'vertexai';
}

export function rejectsReasoningFields(body) {
    if (body?.chat_completion_source === 'zai') return true;
    return typeof body?.model === 'string' && body.model.toLowerCase().includes('glm');
}

export function isReasoningLevelSet(level) {
    return Boolean(level) && level !== 'unset';
}

export function sanitizeGenerateBody(reqBody) {
    let changed = false;

    if (reqBody.reasoning_effort === 'auto') { delete reqBody.reasoning_effort; changed = true; }
    else if (reqBody.reasoning_effort === 'min') { reqBody.reasoning_effort = 'low'; changed = true; }
    else if (reqBody.reasoning_effort === 'max') { reqBody.reasoning_effort = 'high'; changed = true; }

    if (reqBody.reasoning && typeof reqBody.reasoning === 'object') {
        if (reqBody.reasoning.effort === 'auto') { delete reqBody.reasoning.effort; changed = true; }
        else if (reqBody.reasoning.effort === 'min') { reqBody.reasoning.effort = 'low'; changed = true; }
        else if (reqBody.reasoning.effort === 'max') { reqBody.reasoning.effort = 'high'; changed = true; }
    }

    if (reqBody.custom_prompt_post_processing === '') { delete reqBody.custom_prompt_post_processing; changed = true; }
    if (reqBody.request_image_resolution === '') { delete reqBody.request_image_resolution; changed = true; }
    if (reqBody.request_image_aspect_ratio === '') { delete reqBody.request_image_aspect_ratio; changed = true; }

    if (rejectsReasoningFields(reqBody)) {
        if (reqBody.reasoning_effort !== undefined) { delete reqBody.reasoning_effort; changed = true; }
        if (reqBody.reasoning !== undefined) { delete reqBody.reasoning; changed = true; }
        if (Array.isArray(reqBody.messages)) {
            reqBody.messages.forEach(m => { if (m.name !== undefined) { delete m.name; changed = true; } });
        }
    }

    return changed;
}

function dropIncompatibleReasoning(reqBody) {
    if (!rejectsReasoningFields(reqBody)) return;
    delete reqBody.reasoning_effort;
    delete reqBody.reasoning;
    delete reqBody.thinking;
    delete reqBody.thinkingConfig;
    delete reqBody.include_reasoning;
    if (reqBody.generationConfig && 'thinkingConfig' in reqBody.generationConfig) {
        delete reqBody.generationConfig.thinkingConfig;
    }
    if (Array.isArray(reqBody.messages)) {
        reqBody.messages.forEach(m => { if (m.name !== undefined) delete m.name; });
    }
}

export function applyReasoningLevel(reqBody, level) {
    if (!isReasoningLevelSet(level)) return reqBody;

    if (level === 'off') {
        reqBody.include_reasoning = false;
        reqBody.thinking = { type: 'disabled' };
        delete reqBody.reasoning_effort;
        if (reqBody.reasoning && typeof reqBody.reasoning === 'object') {
            delete reqBody.reasoning.effort;
            reqBody.reasoning.exclude = true;
        }
        if (isGeminiSource(reqBody)) {
            reqBody.thinkingConfig = { includeThoughts: false, thinkingBudget: 0 };
        }
        return reqBody;
    }

    const effort = EFFORT[level];
    if (!effort) return reqBody;

    reqBody.include_reasoning = true;
    reqBody.reasoning_effort = effort;
    if (reqBody.reasoning && typeof reqBody.reasoning === 'object') {
        reqBody.reasoning.effort = effort;
        reqBody.reasoning.exclude = false;
    }
    if (isGeminiSource(reqBody)) {
        reqBody.thinkingConfig = {
            includeThoughts: true,
            thinkingLevel: GEMINI_THINKING_LEVEL[level],
        };
    }
    return reqBody;
}

export function prepareGenerateBody(reqBody, level) {
    const next = JSON.parse(JSON.stringify(reqBody));
    sanitizeGenerateBody(next);
    if (isReasoningLevelSet(level)) {
        applyReasoningLevel(next, level);
        dropIncompatibleReasoning(next);
    }
    return next;
}
