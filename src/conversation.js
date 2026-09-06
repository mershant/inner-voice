import {
    EXT_NAME,
    EXT_DISPLAY,
    DEFAULT_SYSTEM_PROMPT,
    LEGACY_SYSTEM_PROMPTS,
    DEFAULT_MEMORY_PROMPT,
    LEGACY_MEMORY_PROMPTS,
    LEGACY_TOOLS_PROMPTS,
    DEFAULT_PORTRAY_PROMPT,
    LEGACY_PORTRAY_PROMPTS,
    THEME_PRESETS
} from './constants.js';
import { _dbgAdd, _dbgDiffSettings } from './utils/util-debug.js';
import { _repairJSON } from './utils/util-text.js';

// ─── The exchange spine ──────────────────────────────────────────────────────
// One continuous inner conversation per main chat. Every turn is anchored to a
// main-chat message (its anchorIndex). The set of turns sharing one anchor is
// an exchange; a main-chat message holds at most one exchange. New turns are
// only ever created at the live edge — the latest main-chat message. Older
// exchanges stay readable but never grow.

function emptyConversation() {
    return { messages: [], overrides: {}, pickedChatIndices: [], hiddenAnchors: [] };
}

function normalizeConversation(conv) {
    const next = conv && typeof conv === 'object' ? conv : emptyConversation();
    if (!Array.isArray(next.messages)) next.messages = [];
    if (!next.overrides || typeof next.overrides !== 'object') next.overrides = {};
    if (!Array.isArray(next.pickedChatIndices)) next.pickedChatIndices = [];
    if (!Array.isArray(next.hiddenAnchors)) next.hiddenAnchors = [];
    for (const m of next.messages) {
        if (m.anchorIndex === undefined) m.anchorIndex = null;
    }
    return next;
}

// A legacy multi-session bucket ({ activeSessionId, sessions: [...] }) folds
// into the single conversation: the active session's turns are kept as one
// pre-spine segment (anchorIndex null), along with its overrides and picks.
function migrateLegacyBucket(bucket) {
    const conv = emptyConversation();
    if (!bucket || !Array.isArray(bucket.sessions) || !bucket.sessions.length) return conv;
    const active = bucket.sessions.find(s => s.id === bucket.activeSessionId)
        || bucket.sessions[bucket.sessions.length - 1];
    if (!active) return conv;
    conv.messages = Array.isArray(active.messages) ? active.messages : [];
    conv.overrides = active.overrides && typeof active.overrides === 'object' ? active.overrides : {};
    conv.pickedChatIndices = Array.isArray(active.pickedChatIndices) ? active.pickedChatIndices : [];
    return normalizeConversation(conv);
}

// ─── Settings ───────────────────────────────────────────────────────────────
export function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[EXT_NAME]) extensionSettings[EXT_NAME] = {};
    const s = extensionSettings[EXT_NAME];
    const defaults = {
        enabled: true,
        performanceMode: false,
        windowVisible: false,
        minimized: false,
        windowX: null, windowY: null,
        iconX: null, iconY: null,
        windowW: 440, windowH: 600,
        opacity: 95,
        hotkey: 'Alt+Shift+C',
        hotkeyEnabled: true,
        searchHotkey: 'Ctrl+F',
        searchHotkeyEnabled: true,
        contextDepth: 15,
        exchangeDepth: 1,
        localHistoryLimit: 50,
        connectionSource: 'default',
        connectionProfileId: '',
        customUrl: 'http://localhost:5000/v1',
        customKey: '',
        customModel: '',
        maxTokens: 8048,
        includeSystemPrompt: false,
        includeUserPersonality: true,
        includeAlternateSwipes: false,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        memoryManagePrompt: DEFAULT_MEMORY_PROMPT,
        profiles: {},
        activeProfile: '',
        profileBindings: {},
        customTheme: { ...THEME_PRESETS.default },
        savedThemes: {},
        activeThemeProfile: '',
        floatingIconPersistent: false,
        reasoningTrimStrings: '',
        ghostModeOpacity: 15,
        ghostModeHotkey: 'Alt+Shift+G',
        ghostModeHotkeyEnabled: true,
        quickPromptsVisible: false,
        quickPrompts: [
            { id: 'qp_d1', label: 'Analyze', icon: '🔍', text: 'Analyze the current scene and character motivations in detail.' },
            { id: 'qp_d2', label: 'Ideas', icon: '💡', text: 'Give me 3 creative plot twist ideas for the current scene.' },
            { id: 'qp_d3', label: 'Summary', icon: '📋', text: 'Summarize everything that has happened in the simulation so far.' },
            { id: 'qp_d4', label: 'Feelings', icon: '💭', text: 'What is {{char}} likely feeling right now and why?' },
            { id: 'qp_d5', label: 'Next?', icon: '🎯', text: 'What are the most interesting directions the story could go next?' },
        ],
        quickPromptSets: {},
        activeQuickPromptSet: '',
        promptPresets: {},
        changelogAutoShow: true,
        lastSeenVersion: '',
        forceStreaming: 'auto',
        applyRegexToContext: true,
        completionSound: 'none',
        completionSoundVolume: 80,
        completionSoundOnlyWhenUnfocused: false,
        wobbleWindow: false,
        windowBgUrl: '',
        windowBgDim: 50,
        windowBgType: 'none',
        pickerPreviewLines: 1,
        pickerPreviewLastLines: 0,
        memoryEnabled: true,
        memoryInject: true,
        memoryScope: 'global',
        memoryTag: 'memory-update',
        memoryNotify: true,
        memories: {},
        toolsEnabled: true,
        toolsSystemPrompt: '',
        toolsThinking: false,
        toolsMaxRounds: 5,
        toolsEnabled_search_chat: true,
        toolsEnabled_ask_user: true,
        toolsEnabled_get_chat_stats: true,
        toolsEnabled_get_recent_messages: true,
        includeSummaryception: true,
        lorebookAutoKeyword: true,
        lorebookSelectedBooks: [],
        lorebookEntryOverrides: {},
        lorebookSTScanDepth: 5,
        lorebookCopilotScanDepth: 6,
        lorebookExcludedBooks: [],
        includeCharacterCard: true,
        charEditFields: {
            tags: true, description: true, personality: true,
            scenario: true, first_mes: true, mes_example: true,
            alternate_greetings: false, authors_note: true,
            system_prompt: true, post_history_instructions: true, name: false,
        },
        altGreetingIndices: [],
        useAspectEvolutia: true,
        autoExpandMacros: false,
        includeHiddenMessages: false,
        portrayStyle: 'rp',
        portrayPerson: 'first',
        portrayImmediateSend: false,
        portrayAutoTrigger: false,
        portrayPrompt: DEFAULT_PORTRAY_PROMPT,
        postHistoryText: '',
        postHistoryRole: 'user',
    };
    for (const [k, v] of Object.entries(defaults)) {
        if (s[k] === undefined) s[k] = v;
    }
    if (Array.isArray(s.altGreetingIndices)) s.altGreetingIndices = {};
    if (!s.altGreetingIndices) s.altGreetingIndices = {};
    // A stored prompt that matches a superseded default is the old default,
    // not a user customization — carry it forward to the current one.
    const _normPrompt = t => t.replace(/\r\n/g, '\n').trim();
    const upgradeLegacyPrompt = (holder, key, legacyList, currentDefault) => {
        const v = holder ? holder[key] : undefined;
        if (typeof v === 'string' && v
            && legacyList.some(p => _normPrompt(p) === _normPrompt(v))) {
            holder[key] = currentDefault;
        }
    };
    upgradeLegacyPrompt(s, 'systemPrompt', LEGACY_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT);
    // Profiles carry their own systemPrompt copies; the same rule applies.
    for (const p of Object.values(s.profiles || {})) {
        upgradeLegacyPrompt(p, 'systemPrompt', LEGACY_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT);
    }
    upgradeLegacyPrompt(s, 'memoryManagePrompt', LEGACY_MEMORY_PROMPTS, DEFAULT_MEMORY_PROMPT);
    // An empty toolsSystemPrompt already means "use the current default", so a
    // stored old default simply empties back to that.
    upgradeLegacyPrompt(s, 'toolsSystemPrompt', LEGACY_TOOLS_PROMPTS, '');
    upgradeLegacyPrompt(s, 'portrayPrompt', LEGACY_PORTRAY_PROMPTS, DEFAULT_PORTRAY_PROMPT);
    for (const p of Object.values(s.profiles || {})) {
        upgradeLegacyPrompt(p, 'portrayPrompt', LEGACY_PORTRAY_PROMPTS, DEFAULT_PORTRAY_PROMPT);
    }
    delete s.sessions; // legacy multi-session store; the conversation file owns state now
    return s;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
    _dbgDiffSettings();
}

// ─── ST Context Helpers ─────────────────────────────────────────────────────
export function getBindingKey() {
    const ctx = SillyTavern.getContext();
    let charId = 'global';
    if (ctx.characterId !== undefined && ctx.characterId !== null) {
        charId = String(ctx.characterId);
    } else if (typeof window.this_chid !== 'undefined' && window.this_chid !== null) {
        charId = String(window.this_chid);
    }

    let chatId = 'default';
    try {
        if (typeof window.chat_file_name === 'string' && window.chat_file_name) {
            chatId = String(window.chat_file_name);
        } else if (typeof ctx.getCurrentChatId === 'function') {
            const r = ctx.getCurrentChatId(); if (r) chatId = String(r);
        }

        if (chatId === 'default' || !chatId) {
            if (ctx.chatId) chatId = String(ctx.chatId);
            else if (typeof window.chat_id !== 'undefined' && window.chat_id !== null) chatId = String(window.chat_id);
        }
    } catch (_) {}

    return { charId, chatId };
}

// ─── Per-Chat Setting Overrides ─────────────────────────────────────────────
// Overrides ride on this chat's inner conversation and persist with it.

export function getConversationOverrides() {
    try { return getConversation().overrides || {}; } catch (_) { return {}; }
}

export function getEffectiveSettings() {
    return { ...getSettings(), ...getConversationOverrides() };
}

export function setConversationOverride(key, value) {
    try {
        const conv = getConversation();
        if (!conv.overrides) conv.overrides = {};
        if (value === undefined || value === null) delete conv.overrides[key];
        else conv.overrides[key] = value;
        saveConversation();
        import('./ui/ui-settings.js').then(m => m.updateConversationOverrideIndicator());
    } catch (_) {}
}

export function clearAllConversationOverrides() {
    try {
        const conv = getConversation();
        conv.overrides = {};
        saveConversation();
        import('./ui/ui-settings.js').then(m => m.updateConversationOverrideIndicator());
    } catch (_) {}
}

export function hasConversationOverrides() {
    try { const o = getConversation().overrides; return !!(o && Object.keys(o).length > 0); }
    catch (_) { return false; }
}

// ─── Storage Subsystem ──────────────────────────────────────────────────────

let _conversation = emptyConversation();
let _currentFileId = null;
const _saveQueue = new Map();

function freshFileId() {
    return `inner_voice_conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
}

export async function saveConversationFile(file_id, payload, useKeepalive = false) {
    const ctx = SillyTavern.getContext();
    try {
        const jsonStr = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file_id, data: b64 }),
            keepalive: useKeepalive
        });
        return res.ok;
    } catch (e) {
        _dbgAdd('STORAGE_WRITE_FAILED', { file_id, error: e.message });
        console.error(`[${EXT_DISPLAY}] saveConversationFile error:`, e);
        return false;
    }
}

window.addEventListener('beforeunload', () => {
    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        saveConversationFile(fileId, item.payload, true);
    }
});

function _decodeBase64Utf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

function _tryParsePayload(text) {
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(_decodeBase64Utf8(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(_decodeBase64Utf8(text))); } catch (_) {}
    return undefined;
}

export async function loadConversationFile(file_id) {
    try {
        const res = await fetch(`/user/files/${file_id}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
            _dbgAdd('STORAGE_LOAD_HTML_REDIRECT', { file_id });
            return null;
        }

        const parsed = _tryParsePayload(trimmed);
        if (parsed === undefined) throw new Error('Unrecoverable payload after base64/repair fallback');
        return parsed;
    } catch (e) {
        _dbgAdd('STORAGE_LOAD_ERROR', { file_id, error: e.message });
        console.error(`[${EXT_DISPLAY}] loadConversationFile error:`, e);
        return false;
    }
}

function conversationFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.conversation) return normalizeConversation(payload.conversation);
    if (payload.bucket) return migrateLegacyBucket(payload.bucket);
    return null;
}

export async function initConversation({ forceReset = false } = {}) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chatMetadata) ctx.chatMetadata = {};
    const { charId, chatId } = getBindingKey();

    if (forceReset) {
        const prevMeta = ctx.chatMetadata.inner_voice || null;
        const freshId = freshFileId();
        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: freshId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        _currentFileId = freshId;
        _conversation = emptyConversation();
        await commitConversation(true);
        _dbgAdd('CONVERSATION_FORCE_RESET', { charId, chatId, prevFileId: prevMeta?.file_id || null, newFileId: freshId });
        refreshSimulationView();
        return;
    }

    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        _saveQueue.delete(fileId);
        saveConversationFile(fileId, item.payload);
    }

    const meta = ctx.chatMetadata.inner_voice;
    const knownFormat = meta && meta.file_id && (meta.format === 'v5' || meta.format === 'v4');
    let targetFileId = null;
    let payload = null;

    if (knownFormat) {
        if (meta.chat_id === chatId) {
            targetFileId = meta.file_id;
            payload = await loadConversationFile(targetFileId);
            if (meta.format !== 'v5') {
                ctx.chatMetadata.inner_voice = { ...meta, format: 'v5' };
                if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
            }
        } else {
            _dbgAdd('STORAGE_CHAT_BRANCH_DETECTED', { oldChatId: meta.chat_id, newChatId: chatId });
            payload = await loadConversationFile(meta.file_id);
            targetFileId = freshFileId();

            if (payload && payload !== false) {
                await saveConversationFile(targetFileId, payload);
            }

            ctx.chatMetadata.inner_voice = { format: 'v5', file_id: targetFileId, chat_id: chatId };
            if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        }
    } else {
        targetFileId = freshFileId();
        _dbgAdd('STORAGE_INIT_V5', { targetFileId });

        if (meta && meta.file_id) {
            payload = await loadConversationFile(meta.file_id);
        }

        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: targetFileId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
    }

    _currentFileId = targetFileId;

    if (payload === false) {
        _dbgAdd('STORAGE_LOAD_CORRUPTED_RECOVERY', { brokenFileId: targetFileId, charId, chatId });
        const recoveryFileId = freshFileId();
        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: recoveryFileId, chat_id: chatId, recoveredFrom: targetFileId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();

        _currentFileId = recoveryFileId;
        _conversation = emptyConversation();
        await commitConversation(true);

        toastr.error('The inner conversation file was corrupted and could not be recovered. Started fresh storage for this chat; the broken file was kept on disk for manual recovery.', EXT_DISPLAY, { timeOut: 15000 });
        refreshSimulationView();
        return;
    }

    const loaded = conversationFromPayload(payload);
    if (loaded) {
        _conversation = loaded;
        _dbgAdd('STORAGE_CONVERSATION_LOADED', { charId, chatId, fileId: targetFileId, turnCount: _conversation.messages.length, migratedFromBucket: !payload.conversation });
    } else {
        _conversation = emptyConversation();
        _dbgAdd('STORAGE_CONVERSATION_EMPTY_INIT', { charId, chatId, fileId: targetFileId, hadPayload: !!payload });
    }

    if (!payload || !payload.conversation || meta?.format !== 'v5' || meta?.chat_id !== chatId) {
        await commitConversation(true);
    }
    refreshSimulationView();
}

export async function commitConversation(force = false) {
    const fileName = _currentFileId;
    if (!fileName) return;

    const { chatId } = getBindingKey();
    const snapshot = JSON.parse(JSON.stringify(_conversation));

    const payloadToSave = {
        _version: 5,
        chat_id_reference: chatId,
        updated_at: Date.now(),
        conversation: snapshot
    };

    if (force) {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);
        _saveQueue.delete(fileName);

        const success = await saveConversationFile(fileName, payloadToSave);
        if (!success) _dbgAdd('STORAGE_WRITE_FAILED', { fileName });
    } else {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);

        const timer = setTimeout(() => {
            _saveQueue.delete(fileName);
            saveConversationFile(fileName, payloadToSave);
        }, 1000);

        _saveQueue.set(fileName, { timer, payload: payloadToSave });
    }
}

export function saveConversation() {
    commitConversation();
}

export function getConversation() {
    _conversation = normalizeConversation(_conversation);
    return _conversation;
}

// ─── Exchange Spine Helpers ─────────────────────────────────────────────────

export function genId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// The live edge: index of the latest main-chat message, or null before the
// story has any messages.
export function getLiveEdgeIndex() {
    try {
        const chat = SillyTavern.getContext().chat;
        if (!Array.isArray(chat) || !chat.length) return null;
        return chat.length - 1;
    } catch (_) {
        return null;
    }
}

// Adds a turn at the live edge. Every new turn anchors there — thinking always
// happens in the present.
function refreshSimulationView() {
    import('./simulation-view.js').then(m => m.syncSimulationView()).catch(() => {});
}

export function addTurn(conversation, role, content, extra = {}) {
    const msg = { id: genId('msg'), role, content, timestamp: Date.now(), anchorIndex: getLiveEdgeIndex(), ...extra };
    conversation.messages.push(msg);
    if (conversation.messages.length > 400) conversation.messages = conversation.messages.slice(-400);
    saveConversation();
    refreshSimulationView();
    return msg;
}

// Adds a turn only if the requested anchor is the live edge; old exchanges
// reject new turns. Returns the turn, or null when rejected.
export function addTurnAt(conversation, anchorIndex, role, content, extra = {}) {
    if (anchorIndex !== getLiveEdgeIndex()) return null;
    return addTurn(conversation, role, content, extra);
}

// Groups the conversation's turns into exchanges — one per anchor, in order.
export function getExchanges(conversation) {
    const groups = new Map();
    for (const m of conversation.messages) {
        const anchor = m.anchorIndex === undefined ? null : m.anchorIndex;
        if (!groups.has(anchor)) groups.set(anchor, { anchorIndex: anchor, turns: [] });
        groups.get(anchor).turns.push(m);
    }
    return [...groups.values()];
}

export function getExchangeAt(conversation, anchorIndex) {
    return getExchanges(conversation).find(e => e.anchorIndex === anchorIndex) || null;
}

// The exchange at the live edge — the only one that can still grow.
export function getLiveExchange(conversation) {
    const edge = getLiveEdgeIndex();
    if (edge === null) return null;
    return getExchangeAt(conversation, edge);
}

// ─── Hide ───────────────────────────────────────────────────────────────────
// Hide is a reversible flag on an exchange (keyed by its anchor), never
// deletion: the turns stay in the conversation and remain readable in the UI.
// Inner memory and the simulation view both skip hidden exchanges; hidden
// exchanges also do not count toward exchange depth.
//
// The flag is the player's hide toggle. An exchange whose anchor message is
// hidden in the main chat is hidden with it automatically — that host state
// is observed, not copied onto the flag, so unhiding the message restores
// the exchange unless the player had already hidden it themselves.

function isMainChatMessageHidden(message) {
    if (!message) return false;
    return !!(message.is_system || message.is_hidden || message.extra?.is_hidden || message.extra?.sc_ghosted);
}

export function isAnchorHiddenInMainChat(anchorIndex) {
    if (anchorIndex === null || anchorIndex === undefined) return false;
    try {
        const chat = SillyTavern.getContext().chat;
        return isMainChatMessageHidden(chat?.[anchorIndex]);
    } catch (_) {
        return false;
    }
}

export function isExchangeManuallyHidden(conversation, anchorIndex) {
    const anchor = anchorIndex === undefined ? null : anchorIndex;
    return conversation.hiddenAnchors.includes(anchor);
}

export function isExchangeHidden(conversation, anchorIndex) {
    return isExchangeManuallyHidden(conversation, anchorIndex) || isAnchorHiddenInMainChat(anchorIndex);
}

export function setExchangeHidden(conversation, anchorIndex, hidden) {
    const has = isExchangeManuallyHidden(conversation, anchorIndex);
    if (hidden && !has) conversation.hiddenAnchors.push(anchorIndex);
    if (!hidden && has) conversation.hiddenAnchors = conversation.hiddenAnchors.filter(a => a !== anchorIndex);
    saveConversation();
    refreshSimulationView();
}

// The turns the Inner Voice remembers: every turn whose exchange is not hidden.
export function getVisibleTurns(conversation) {
    return conversation.messages.filter(m => !isExchangeHidden(conversation, m.anchorIndex));
}

// ─── Turn Editing Helpers ───────────────────────────────────────────────────

export function truncateAfter(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx + 1); saveConversation(); refreshSimulationView(); }
}

export function deleteMsg(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx, 1); saveConversation(); refreshSimulationView(); }
}

export function truncateFrom(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx); saveConversation(); refreshSimulationView(); }
}

// ─── Macro Expansion Helper ────────────────────────────────────────────────

export function expandMacros(text) {
    if (!text) return text;
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.substituteParams === 'function') {
            return ctx.substituteParams(text);
        }
        if (typeof window.substituteParams === 'function') {
            return window.substituteParams(text, ctx.name1, ctx.name2);
        }
    } catch (e) {
        console.warn(`[${EXT_DISPLAY}] Macro expansion error:`, e);
    }
    try {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        const d = char?.data || {};
        const now = new Date();
        return text
            .replace(/\{\{user\}\}/gi, ctx.name1 || 'User')
            .replace(/\{\{char\}\}/gi, char?.name || ctx.name2 || 'Character')
            .replace(/\{\{time\}\}/gi, now.toLocaleTimeString())
            .replace(/\{\{date\}\}/gi, now.toLocaleDateString())
            .replace(/\{\{isodate\}\}/gi, now.toISOString().split('T')[0])
            .replace(/\{\{isotime\}\}/gi, now.toTimeString().slice(0, 5))
            .replace(/\{\{lastMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                return msgs?.[msgs.length - 1]?.mes || '';
            })
            .replace(/\{\{lastUserMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                if (!msgs) return '';
                for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].is_user) return msgs[i].mes || '';
                }
                return '';
            })
            .replace(/\{\{lastCharMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                if (!msgs) return '';
                for (let i = msgs.length - 1; i >= 0; i--) {
                    if (!msgs[i].is_user) return msgs[i].mes || '';
                }
                return '';
            })
            .replace(/\{\{description\}\}/gi, d.description || char?.description || '')
            .replace(/\{\{personality\}\}/gi, d.personality || char?.personality || '')
            .replace(/\{\{scenario\}\}/gi, d.scenario || char?.scenario || '');
    } catch (_) {
        return text;
    }
}
