import { DEFAULT_PORTRAY_PROMPT } from './constants.js';
import { assembleMessages, callGenerate } from './api.js';
import { getConversation, getEffectiveSettings, getSettings } from './conversation.js';
import { state } from './state.js';

export const PORTRAY_STYLES = ['rp', 'summary'];
export const PORTRAY_PERSONS = ['first', 'second', 'third'];

function pickAllowed(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

export function resolvePortrayForm(settings, override = {}) {
    const storedStyle = pickAllowed(settings?.portrayStyle, PORTRAY_STYLES, 'rp');
    const storedPerson = pickAllowed(settings?.portrayPerson, PORTRAY_PERSONS, 'first');
    return {
        style: pickAllowed(override.style, PORTRAY_STYLES, storedStyle),
        person: pickAllowed(override.person, PORTRAY_PERSONS, storedPerson),
    };
}

export function buildPortrayInstruction(form) {
    const styleLine = form.style === 'summary'
        ? 'Write the feeling and intent as narration, without quoted speech.'
        : 'Write it as spoken words and bodily action, the way a turn in the simulation is written.';
    const personLine = form.person === 'second'
        ? 'Write in second person, addressing {{user}} as you.'
        : form.person === 'third'
            ? 'Write in third person, {{user}} as they appear in the scene.'
            : 'Write in first person, as {{user}} living it.';
    return `Write {{user}}'s next turn now.\n\n${styleLine}\n\n${personLine}`;
}

function portrayRequestSettings(settings) {
    return {
        ...settings,
        systemPrompt: DEFAULT_PORTRAY_PROMPT,
        memoryEnabled: false,
    };
}

function withoutToolModules(messages) {
    return messages.map(m => {
        if (m.role !== 'system' || typeof m.content !== 'string') return m;
        return { ...m, content: m.content.replace(/\n*<modules>[\s\S]*?<\/modules>/g, '') };
    });
}

export async function assemblePortrayMessages(conversation, settings, formOverride) {
    const form = resolvePortrayForm(settings, formOverride);
    const messages = await assembleMessages(
        conversation,
        portrayRequestSettings(settings),
        buildPortrayInstruction(form),
    );
    return withoutToolModules(messages);
}

export function readFireTimePortrayForm() {
    return {
        style: document.getElementById('iv-fire-portray-style')?.value,
        person: document.getElementById('iv-fire-portray-person')?.value,
    };
}

export function syncFireTimePortrayForm() {
    const form = resolvePortrayForm(getSettings());
    const styleEl = document.getElementById('iv-fire-portray-style');
    const personEl = document.getElementById('iv-fire-portray-person');
    if (styleEl) styleEl.value = form.style;
    if (personEl) personEl.value = form.person;
}

export function routePortrayToInput(text) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function runPortray(formOverride = {}, { generate } = {}) {
    if (state.generating) return null;
    const settings = getEffectiveSettings();
    const conversation = getConversation();
    const messages = await assemblePortrayMessages(conversation, settings, formOverride);
    const generateFn = generate || ((conv, reqSettings, pendingText, payload) =>
        callGenerate(conv, reqSettings, pendingText, undefined, payload));

    state.generating = true;
    try {
        const { setGeneratingState } = await import('./ui/ui-chat.js');
        setGeneratingState(true);
        const thinking = document.getElementById('iv-thinking-text');
        if (thinking) thinking.textContent = 'Portraying…';
        const result = await generateFn(
            conversation,
            portrayRequestSettings(settings),
            buildPortrayInstruction(resolvePortrayForm(settings, formOverride)),
            messages,
        );
        const text = result && typeof result.text === 'string' ? result.text.trim() : '';
        if (text) routePortrayToInput(text);
        return result;
    } catch (err) {
        const { showGenerationError } = await import('./ui/ui-chat.js');
        showGenerationError(err);
        return null;
    } finally {
        state.generating = false;
        try {
            const { setGeneratingState } = await import('./ui/ui-chat.js');
            setGeneratingState(false);
        } catch (_) { /* UI may be absent in unit tests */ }
    }
}
