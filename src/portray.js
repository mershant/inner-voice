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

function portrayPromptText(settings) {
    const stored = settings?.portrayPrompt;
    return (typeof stored === 'string' && stored.trim()) ? stored : DEFAULT_PORTRAY_PROMPT;
}

function portrayRequestSettings(settings) {
    return {
        ...settings,
        systemPrompt: portrayPromptText(settings),
        memoryEnabled: false,
    };
}

function withoutToolModules(messages) {
    return messages.map(m => {
        if (m.role !== 'system' || typeof m.content !== 'string') return m;
        return { ...m, content: m.content.replace(/\n*<modules>[\s\S]*?<\/modules>/g, '') };
    });
}

function readSendBoxText() {
    const ta = document.getElementById('send_textarea');
    return typeof ta?.value === 'string' ? ta.value.trim() : '';
}

function buildAuthoredConductBlock(text) {
    return `<authored-conduct>
{{user}} has already decided this conduct. The coming turn is that conduct performed in the scene — the same acts, in the same order, at the same size, in {{user}}'s established voice. Every word realizes this. Quoted words are spoken as written. An instruction to speak becomes speech, meaning kept, plain wording kept plain. A blocked or unfinished attempt stays an attempt. Private thinking only colors the manner of doing this.

${text}
</authored-conduct>`;
}

export async function assemblePortrayMessages(conversation, settings, formOverride) {
    const form = resolvePortrayForm(settings, formOverride);
    const messages = withoutToolModules(await assembleMessages(
        conversation,
        portrayRequestSettings(settings),
        buildPortrayInstruction(form),
    ));
    const sendBox = readSendBoxText();
    if (!sendBox) return messages;
    const block = { role: 'user', content: buildAuthoredConductBlock(sendBox) };
    const insertAt = Math.max(0, messages.length - 1);
    return [...messages.slice(0, insertAt), block, ...messages.slice(insertAt)];
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

function sendMainChatInput() {
    document.getElementById('send_but')?.click();
}

export function routePortrayResult(text, settings) {
    routePortrayToInput(text);
    if (settings?.portrayImmediateSend) sendMainChatInput();
}

let pendingAutoPortray = false;
let pendingAutoPortrayOpts = null;

function clearPendingAutoPortray() {
    pendingAutoPortray = false;
    pendingAutoPortrayOpts = null;
}

// A conclusion cue is a turn that settles on acting in the scene now:
// directing {{user}} to do or say something, or resolving to do it.
function isPortrayConclusionCue(text) {
    if (typeof text !== 'string' || !text.trim()) return false;
    const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (/\blet'?s just do that\b/.test(t)) return true;
    if (/\byou should(?:\s+\w+){0,3}\s+(?:tell|say|ask|do|talk)\b/.test(t)) return true;
    if (/\b(?:alright|okay|ok)[,.]?\s+(?:tell|say)\s+(?:her|him|them)\b/.test(t)) return true;
    if (/\b(?:yeah|yes|yep|alright|okay|ok|fine)\b.{0,60}\b(?:let'?s|i(?:'ll| will| am going| am gonna|'m going|'m gonna))\b/.test(t)) return true;
    return false;
}

export async function considerAutoTriggerPortray(turn, opts = {}) {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (isPortrayConclusionCue(turn?.content)) {
        pendingAutoPortray = true;
        pendingAutoPortrayOpts = opts;
    }
    return flushPendingAutoPortray(opts);
}

export async function flushPendingAutoPortray(opts = {}) {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (!pendingAutoPortray || state.generating) return null;
    const runOpts = pendingAutoPortrayOpts || opts;
    clearPendingAutoPortray();
    return runPortray(runOpts.formOverride || {}, runOpts);
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
        if (text) routePortrayResult(text, getSettings());
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
