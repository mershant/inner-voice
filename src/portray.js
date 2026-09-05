import { DEFAULT_PORTRAY_PROMPT } from './constants.js';
import { assembleMessages, callGenerate } from './api.js';
import { getConversation, getEffectiveSettings, getSettings } from './conversation.js';
import { state } from './state.js';
import { splitPortraySignal } from './portray-signal.js';
export { splitPortraySignal };

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

function readThinkBoxText() {
    const ta = document.getElementById('iv-input');
    return typeof ta?.value === 'string' ? ta.value.trim() : '';
}

function clearThinkBox() {
    const ta = document.getElementById('iv-input');
    if (!ta) return;
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function buildAuthoredConductBlock(text) {
    return `<authored-conduct>
{{user}} has already decided this conduct. The coming turn is that conduct performed in the scene — the same acts, in the same order, at the same size, in {{user}}'s established voice. Every word realizes this. Quoted words are spoken as written. An instruction to speak becomes speech, meaning kept, plain wording kept plain. A blocked or unfinished attempt stays an attempt. Private thinking only colors the manner of doing this.

${text}
</authored-conduct>`;
}

export async function assemblePortrayMessages(conversation, settings, formOverride, seedText) {
    const form = resolvePortrayForm(settings, formOverride);
    const messages = withoutToolModules(await assembleMessages(
        conversation,
        portrayRequestSettings(settings),
        buildPortrayInstruction(form),
    ));
    const seed = seedText === undefined ? readThinkBoxText() : String(seedText || '').trim();
    if (!seed) return messages;
    const block = { role: 'user', content: buildAuthoredConductBlock(seed) };
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

let pendingAutoPortray = null;
let autoPortrayFlushPromise = null;

function clearPendingAutoPortray() {
    pendingAutoPortray = null;
}

function replyCarriesPortraySignal(turn, opts) {
    if (opts.triggered === true) return true;
    if (opts.triggered === false) return false;
    if (turn?.role === 'user') return false;
    return splitPortraySignal(typeof turn?.content === 'string' ? turn.content : '').triggered;
}

async function processPendingAutoPortray() {
    const pending = pendingAutoPortray;
    clearPendingAutoPortray();
    if (!pending || !getSettings().portrayAutoTrigger) return null;
    return runPortray(pending.opts.formOverride || {}, { ...pending.opts, consumeSeed: false });
}

export async function considerAutoTriggerPortray(turn, opts = {}) {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (replyCarriesPortraySignal(turn, opts)) pendingAutoPortray = { opts };
    return flushPendingAutoPortray();
}

export async function flushPendingAutoPortray() {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (state.generating || !pendingAutoPortray) return null;
    if (!autoPortrayFlushPromise) {
        autoPortrayFlushPromise = processPendingAutoPortray().finally(() => {
            autoPortrayFlushPromise = null;
        });
    }
    return autoPortrayFlushPromise;
}

export async function runPortray(formOverride = {}, { generate, consumeSeed = true } = {}) {
    if (state.generating) return null;
    const settings = getEffectiveSettings();
    const conversation = getConversation();
    const seed = consumeSeed ? readThinkBoxText() : '';
    const messages = await assemblePortrayMessages(conversation, settings, formOverride, seed);
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
        if (text) {
            routePortrayResult(text, getSettings());
            if (consumeSeed) clearThinkBox();
        }
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
