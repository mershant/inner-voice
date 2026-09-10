import { EXT_DISPLAY } from '../constants.js';
import { state } from '../state.js';
import {
    createVoiceSession,
    deleteVoiceSession,
    getActiveVoice,
    getActiveMode,
    setActiveMode,
    getConversation,
    getVoiceSessions,
    getVoiceTurns,
    setActiveVoice,
} from '../conversation.js';
import { resolveVoiceName, USER_VOICE } from '../voice.js';
import { showCustomDialog } from '../utils/util-dom.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { renderConversation } from './ui-chat.js';
import { syncThinkCommandHint } from '../think-command.js';

function closePicker() {
    document.getElementById('iv-sess-panel')?.classList.remove('open');
    document.getElementById('iv-sess-trigger')?.classList.remove('open');
    document.getElementById('iv-sess-trigger')?.setAttribute('aria-expanded', 'false');
}

function switchToVoice(ownerVoice) {
    if (state.generating) {
        toastr.warning('Please wait for generation to finish.', EXT_DISPLAY);
        return false;
    }
    const conversation = getConversation();
    if (!setActiveVoice(conversation, ownerVoice)) return false;
    renderConversation(conversation);
    refreshVoiceSessionPicker();
    closePicker();
    document.getElementById('iv-input')?.focus({ preventScroll: true });
    _dbgAdd('VOICE_SESSION_SWITCHED', { ownerVoice });
    return true;
}

function renderSessionList(conversation) {
    const list = document.getElementById('iv-sess-list');
    if (!list) return;
    const activeVoice = getActiveVoice();
    list.innerHTML = '';

    for (const session of getVoiceSessions(conversation)) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `iv-sess-item${session.ownerVoice === activeVoice ? ' active' : ''}`;
        item.dataset.ownerVoice = session.ownerVoice;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-current', session.ownerVoice === activeVoice ? 'true' : 'false');

        const dot = document.createElement('span');
        dot.className = 'iv-sess-item-dot';
        const name = document.createElement('span');
        name.className = 'iv-sess-item-name';
        name.textContent = resolveVoiceName(session.ownerVoice);
        const count = document.createElement('span');
        count.className = 'iv-sess-item-count';
        count.textContent = String(getVoiceTurns(conversation, session.ownerVoice).length);

        item.append(dot, name);
        if (session.ownerVoice === USER_VOICE) {
            const kind = document.createElement('span');
            kind.className = 'iv-sess-item-kind';
            kind.textContent = 'You';
            item.append(kind);
        }
        item.append(count);
        item.addEventListener('click', () => switchToVoice(session.ownerVoice));
        list.appendChild(item);
    }
}

async function createTypedVoiceSession() {
    if (state.generating) {
        toastr.warning('Please wait for generation to finish.', EXT_DISPLAY);
        return;
    }
    closePicker();
    const typed = await showCustomDialog({
        type: 'prompt',
        title: 'New Voice Session',
        message: "Type the character's name.",
        placeholder: 'Character name',
    });
    const name = typeof typed === 'string' ? typed.trim() : '';
    if (!name) return;
    if (name === USER_VOICE) {
        toastr.warning('The default session already exists.', EXT_DISPLAY);
        return;
    }
    const conversation = getConversation();
    const session = createVoiceSession(conversation, name);
    if (!session) return;
    setActiveVoice(conversation, session.ownerVoice);
    renderConversation(conversation);
    refreshVoiceSessionPicker();
    document.getElementById('iv-input')?.focus({ preventScroll: true });
    _dbgAdd('VOICE_SESSION_CREATED', { ownerVoice: session.ownerVoice });
}

export function refreshVoiceSessionPicker() {
    const conversation = getConversation();
    const activeVoice = getActiveVoice();
    const label = resolveVoiceName(activeVoice);
    const mode = getActiveMode(conversation);
    const name = document.getElementById('iv-sess-name');
    if (name) name.textContent = activeVoice === USER_VOICE ? label : `${label} · ${mode === 'chat' ? 'Chat' : 'IV'}`;
    const pageSwitch = document.getElementById('iv-page-switch');
    if (pageSwitch) pageSwitch.hidden = activeVoice === USER_VOICE;
    document.querySelectorAll('.iv-page-btn').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    const input = document.getElementById('iv-input');
    if (input) input.placeholder = mode === 'chat' ? `Talk to ${label}…` : 'Think to yourself…';
    syncThinkCommandHint(input, document.getElementById('iv-think-command-hint'), mode);
    document.getElementById('iv-window')?.classList.toggle('iv-chat-page', mode === 'chat');

    const trigger = document.getElementById('iv-sess-trigger');
    if (trigger) {
        trigger.title = `Active voice: ${label}`;
        trigger.setAttribute('aria-label', `Active voice: ${label}`);
    }

    const badge = document.getElementById('iv-char-badge');
    if (badge) {
        badge.textContent = `${mode === 'chat' ? 'Chat' : 'Mind'}: ${label}`;
        badge.title = `Active voice session: ${label}`;
        badge.style.display = '';
    }

    const deleteButton = document.getElementById('iv-del-sess-btn');
    if (deleteButton) {
        const isDefault = activeVoice === USER_VOICE;
        deleteButton.disabled = isDefault;
        deleteButton.title = isDefault ? 'The default voice session cannot be deleted' : `Delete ${label}'s voice session`;
    }

    renderSessionList(conversation);
}

export function setupVoiceSessionPicker() {
    document.querySelectorAll('.iv-page-btn').forEach(button => button.addEventListener('click', () => {
        if (state.generating) return;
        const conversation = getConversation();
        if (!setActiveMode(conversation, button.dataset.mode)) return;
        renderConversation(conversation);
        refreshVoiceSessionPicker();
        closePicker();
        document.getElementById('iv-input')?.focus({ preventScroll: true });
    }));
    const trigger = document.getElementById('iv-sess-trigger');
    trigger?.addEventListener('click', event => {
        event.stopPropagation();
        if (state.generating) {
            toastr.warning('Please wait for generation to finish.', EXT_DISPLAY);
            return;
        }
        const panel = document.getElementById('iv-sess-panel');
        const opening = !panel?.classList.contains('open');
        panel?.classList.toggle('open', opening);
        trigger.classList.toggle('open', opening);
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) refreshVoiceSessionPicker();
    });

    document.getElementById('iv-new-sess-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        createTypedVoiceSession();
    });

    document.getElementById('iv-del-sess-btn')?.addEventListener('click', async () => {
        const ownerVoice = getActiveVoice();
        if (ownerVoice === USER_VOICE || state.generating) return;
        const label = resolveVoiceName(ownerVoice);
        const confirmed = await showCustomDialog({
            type: 'confirm',
            title: 'Delete Voice Session',
            message: `Delete ${label}'s voice session and all of its exchanges? This cannot be undone.`,
        });
        if (!confirmed) return;
        const conversation = getConversation();
        if (!deleteVoiceSession(conversation, ownerVoice)) return;
        renderConversation(conversation);
        refreshVoiceSessionPicker();
        closePicker();
        _dbgAdd('VOICE_SESSION_DELETED', { ownerVoice });
    });

    document.addEventListener('click', event => {
        const dropdown = document.getElementById('iv-sess-dropdown');
        if (dropdown && !dropdown.contains(event.target)) closePicker();
    });

    refreshVoiceSessionPicker();
}
