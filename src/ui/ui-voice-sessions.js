import { EXT_DISPLAY, I } from '../constants.js';
import { state } from '../state.js';
import {
    createVoiceSession,
    deleteVoiceSession,
    getActiveVoice,
    getConversation,
    getVoiceSessions,
    getVoiceTurns,
    setActiveVoice,
} from '../conversation.js';
import { getActiveCharacterEntities } from '../features/feature-characters.js';
import { resolveVoiceName, USER_VOICE } from '../voice.js';
import { showCustomDialog } from '../utils/util-dom.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { renderConversation } from './ui-chat.js';

let castListOpen = false;

function closePicker() {
    castListOpen = false;
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
        const kind = document.createElement('span');
        kind.className = 'iv-sess-item-kind';
        kind.textContent = session.ownerVoice === USER_VOICE ? 'You' : 'Cast';
        const count = document.createElement('span');
        count.className = 'iv-sess-item-count';
        count.textContent = String(getVoiceTurns(conversation, session.ownerVoice).length);

        item.append(dot, name, kind, count);
        item.addEventListener('click', () => switchToVoice(session.ownerVoice));
        list.appendChild(item);
    }
}

function renderCastList(conversation) {
    const list = document.getElementById('iv-sess-cast-list');
    if (!list) return;
    list.innerHTML = '';
    list.style.display = castListOpen ? '' : 'none';
    if (!castListOpen) return;

    const existing = new Set(getVoiceSessions(conversation).map(session => session.ownerVoice));
    const available = getActiveCharacterEntities().filter(entity => !existing.has(entity.name));
    if (!available.length) {
        const empty = document.createElement('div');
        empty.className = 'iv-sess-empty-label';
        empty.textContent = 'No other cast characters available';
        list.appendChild(empty);
        return;
    }

    for (const character of available) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'iv-sess-cast-item';
        item.innerHTML = `${I.plus}<span></span>`;
        item.querySelector('span').textContent = character.name;
        item.title = `Open ${character.name}'s inner voice`;
        item.addEventListener('click', () => {
            if (state.generating) return;
            const session = createVoiceSession(conversation, character);
            if (!session) return;
            setActiveVoice(conversation, session.ownerVoice);
            renderConversation(conversation);
            refreshVoiceSessionPicker();
            closePicker();
            _dbgAdd('VOICE_SESSION_CREATED', {
                ownerVoice: session.ownerVoice,
                characterId: session.characterId,
            });
        });
        list.appendChild(item);
    }
}

export function refreshVoiceSessionPicker() {
    const conversation = getConversation();
    const activeVoice = getActiveVoice();
    const label = resolveVoiceName(activeVoice);
    const name = document.getElementById('iv-sess-name');
    if (name) name.textContent = label;

    const trigger = document.getElementById('iv-sess-trigger');
    if (trigger) {
        trigger.title = `Active voice: ${label}`;
        trigger.setAttribute('aria-label', `Active voice: ${label}`);
    }

    const badge = document.getElementById('iv-char-badge');
    if (badge) {
        badge.textContent = `Mind: ${label}`;
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
    renderCastList(conversation);
}

export function setupVoiceSessionPicker() {
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
        else castListOpen = false;
    });

    document.getElementById('iv-new-sess-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        castListOpen = !castListOpen;
        refreshVoiceSessionPicker();
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
