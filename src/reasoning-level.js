export const REASONING_LEVELS = Object.freeze(['unset', 'off', 'low', 'medium', 'high', 'xhigh', 'max']);

function isGeminiModel(model) {
    return /gemini/iu.test(String(model));
}

function normalizeReasoningLevel(value) {
    return REASONING_LEVELS.includes(value) ? value : 'unset';
}

function reasoningIncludeBody(model, level) {
    if (isGeminiModel(model)) {
        if (level === 'off') {
            return '{"thinking":{"type":"disabled"},"thinking_config":{"thinking_budget":0}}';
        }
        return JSON.stringify({
            thinking: { type: 'enabled' },
            thinking_config: { thinking_level: level },
        });
    }
    if (level === 'off') {
        return JSON.stringify({
            thinking: { type: 'disabled' },
            reasoning_effort: 'none',
        });
    }
    return JSON.stringify({ reasoning_effort: level });
}

export function mergeExcludedFields(value, addedFields) {
    const fields = new Set();
    const source = String(value ?? '').trim();
    if (source) {
        try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) parsed.forEach((field) => fields.add(String(field)));
            else if (parsed && typeof parsed === 'object') Object.keys(parsed).forEach((field) => fields.add(field));
            else if (typeof parsed === 'string') fields.add(parsed);
        } catch {
            for (const line of source.split(/\r?\n/u)) {
                const match = /^\s*(?:-\s*)?([^:#]+?)(?:\s*:.*)?\s*$/u.exec(line);
                if (match) fields.add(match[1].trim());
            }
        }
    }
    for (const field of addedFields) fields.add(field);
    return JSON.stringify([...fields]);
}

function connectionProfiles(ctx) {
    return ctx?.ConnectionManagerRequestService?.getSupportedProfiles?.()
        ?? ctx?.extensionSettings?.connectionManager?.profiles
        ?? [];
}

function findProfile(settings, ctx) {
    const profiles = connectionProfiles(ctx);
    const id = settings?.connectionProfileId;
    return profiles.find((p) => p.id === id || p.name === id);
}

function resolveInnerModel(settings, ctx) {
    if (settings?.connectionSource === 'custom') return settings.customModel;
    if (settings?.connectionSource === 'profile') return findProfile(settings, ctx)?.model || '';
    return ctx?.getChatCompletionModel?.() || '';
}

function lookupExistingExclusions(settings, ctx) {
    if (settings?.connectionSource === 'custom') return undefined;
    if (settings?.connectionSource === 'profile') {
        const profile = findProfile(settings, ctx);
        const presetName = profile?.preset;
        const preset = ctx?.getPresetManager?.('openai')?.getCompletionPresetByName?.(presetName);
        return preset?.custom_exclude_body ?? ctx?.chatCompletionSettings?.custom_exclude_body;
    }
    const selectedProfileId = ctx?.extensionSettings?.connectionManager?.selectedProfile;
    const selectedProfile = connectionProfiles(ctx).find((p) => p?.id === selectedProfileId);
    const presetName = selectedProfile?.preset
        || ctx?.getPresetManager?.('openai')?.getSelectedPresetName?.();
    const preset = ctx?.getPresetManager?.('openai')?.getCompletionPresetByName?.(presetName);
    return preset?.custom_exclude_body ?? ctx?.chatCompletionSettings?.custom_exclude_body;
}

export function innerReasoningOverride(settings, ctx) {
    const level = normalizeReasoningLevel(settings?.reasoningLevel);
    if (level === 'unset') return undefined;
    const model = resolveInnerModel(settings, ctx);
    return {
        custom_include_body: reasoningIncludeBody(model, level),
        custom_exclude_body: mergeExcludedFields(
            lookupExistingExclusions(settings, ctx),
            isGeminiModel(model) ? ['reasoning_effort'] : ['thinking', 'thinking_config'],
        ),
    };
}

export function applyReasoningOverrideToBody(body, override) {
    if (!override) return body;
    const next = { ...body };
    const include = String(override.custom_include_body ?? '').trim();
    if (include) Object.assign(next, JSON.parse(include));
    const exclude = String(override.custom_exclude_body ?? '').trim();
    if (exclude) {
        for (const key of JSON.parse(exclude)) delete next[key];
    }
    delete next.custom_include_body;
    delete next.custom_exclude_body;
    return next;
}
