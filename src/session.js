import { 
    EXT_NAME, 
    EXT_DISPLAY, 
    DEFAULT_SYSTEM_PROMPT, 
    DEFAULT_MEMORY_PROMPT, 
    THEME_PRESETS 
} from './constants.js';
import { _dbgAdd, _dbgDiffSettings } from './utils/util-debug.js';
import { _repairJSON } from './utils/util-text.js';

function migrateBucket(bucket) {
    const next = bucket && typeof bucket === 'object' ? bucket : { activeSessionId: null, sessions: [] };
    if (!Array.isArray(next.sessions)) next.sessions = [];
    return next;
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
        localHistoryLimit: 50,
        connectionSource: 'default',
        connectionProfileId: '',
        customUrl: 'http://localhost:5000/v1',
        customKey: '',
        customModel: '',
        maxTokens: 8048,
        includeSystemPrompt: false,
        includeAuthorsNote: true,
        includeCharacterCard: true,
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
        sessions: {},
        floatingIconPersistent: false,
        reasoningTrimStrings: '',
        ghostModeOpacity: 15,
        ghostModeHotkey: 'Alt+Shift+G',
        ghostModeHotkeyEnabled: true,
        quickPromptsVisible: false,
        quickPrompts: [
            { id: 'qp_d1', label: 'Analyze', icon: '🔍', text: 'Analyze the current scene and character motivations in detail.' },
            { id: 'qp_d2', label: 'Ideas', icon: '💡', text: 'Give me 3 creative plot twist ideas for the current scene.' },
            { id: 'qp_d3', label: 'Summary', icon: '📋', text: 'Summarize everything that has happened in the roleplay so far.' },
            { id: 'qp_d4', label: 'Feelings', icon: '💭', text: 'What is {{char}} likely feeling right now and why?' },
            { id: 'qp_d5', label: 'Next?', icon: '🎯', text: 'What are the most interesting directions the story could go next?' },
        ],
        quickPromptSets: {},
        activeQuickPromptSet: '',
        promptPresets: {},
        stats: { g:{}, c:{}, ch:{} },
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
        toolsThinking: false,
        toolsMaxRounds: 5,
        toolsEnabled_search_chat: true,
        toolsEnabled_ask_user: true,
        toolsEnabled_get_chat_stats: true,
        toolsEnabled_get_recent_messages: true,
        includeSummaryception: true,
        useAspectEvolutia: true,
        autoExpandMacros: false,
        includeHiddenMessages: false,
    };
    for (const [k, v] of Object.entries(defaults)) {
        if (s[k] === undefined) s[k] = v;
    }
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

// ─── Session Override System ─────────────────────────────────────────────────
export function getSessionOverrides() {
    try { return getActiveSession(false)?.overrides || {}; } catch(_) { return {}; }
}

export function getEffectiveSettings() {
    return { ...getSettings(), ...getSessionOverrides() };
}

export function setSessionOverride(key, value) {
    try {
        const sess = getCurrentSession();
        if (!sess) return;
        if (!sess.overrides) sess.overrides = {};
        if (value === undefined || value === null) delete sess.overrides[key];
        else sess.overrides[key] = value;
        saveSessionsToMetadata();
        import('./ui/ui-settings.js').then(m => m.updateSessionOverrideIndicator());
    } catch(_) {}
}

export function clearAllSessionOverrides() {
    try {
        const sess = getCurrentSession();
        if (!sess) return;
        sess.overrides = {};
        saveSessionsToMetadata();
        import('./ui/ui-settings.js').then(m => m.updateSessionOverrideIndicator());
    } catch(_) {}
}

export function hasSessionOverrides() {
    try { const o = getActiveSession(false)?.overrides; return !!(o && Object.keys(o).length > 0); }
    catch(_) { return false; }
}

// ─── Storage Subsystem ─────────────────────────────

let _inMemoryBucket = { activeSessionId: null, sessions: [] };
let _currentSessionFileId = null;
const _saveQueue = new Map();

export async function saveSessionFile(file_id, payload, useKeepalive = false) {
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
        console.error(`[${EXT_DISPLAY}] saveSessionFile error:`, e);
        return false;
    }
}

window.addEventListener('beforeunload', () => {
    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        saveSessionFile(fileId, item.payload, true);
    }
});

function _decodeBase64Utf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

function _tryParseSessionPayload(text) {
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(_decodeBase64Utf8(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(_decodeBase64Utf8(text))); } catch (_) {}
    return undefined;
}

export async function loadSessionFile(file_id) {
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

        const parsed = _tryParseSessionPayload(trimmed);
        if (parsed === undefined) throw new Error('Unrecoverable payload after base64/repair fallback');
        return parsed;
    } catch (e) {
        _dbgAdd('STORAGE_LOAD_ERROR', { file_id, error: e.message });
        console.error(`[${EXT_DISPLAY}] loadSessionFile error:`, e);
        return false; 
    }
}

export async function initChatBucket({ forceReset = false } = {}) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chatMetadata) ctx.chatMetadata = {};
    const { charId, chatId } = getBindingKey();

    if (forceReset) {
        const prevMeta = ctx.chatMetadata.inner_voice || null;
        const freshId = `inner_voice_sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
        ctx.chatMetadata.inner_voice = { format: 'v4', file_id: freshId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        _currentSessionFileId = freshId;
        _inMemoryBucket = migrateBucket({ activeSessionId: null, sessions: [] });
        await commitBucketChanges(true);
        _dbgAdd('SESSION_FORCE_RESET', { charId, chatId, prevFileId: prevMeta?.file_id || null, newFileId: freshId });
        return;
    }

    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        _saveQueue.delete(fileId);
        saveSessionFile(fileId, item.payload);
    }

    let meta = ctx.chatMetadata.inner_voice;
    let targetFileId = null;
    let payload = null;

    if (meta && meta.file_id && meta.format === 'v4') {
        if (meta.chat_id === chatId) {
            targetFileId = meta.file_id;
            payload = await loadSessionFile(targetFileId);
        } else {
            _dbgAdd('STORAGE_CHAT_BRANCH_DETECTED', { oldChatId: meta.chat_id, newChatId: chatId });
            payload = await loadSessionFile(meta.file_id);
            targetFileId = `inner_voice_sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
            
            if (payload && payload !== false) {
                await saveSessionFile(targetFileId, payload);
            }
            
            ctx.chatMetadata.inner_voice = { format: 'v4', file_id: targetFileId, chat_id: chatId };
            if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        }
    } else {
        targetFileId = `inner_voice_sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
        _dbgAdd('STORAGE_MIGRATION_V4_INIT', { targetFileId });
        
        const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
        payload = await loadSessionFile(`inner_voice_sess_${safeChatId}.json`);

        if (!payload && meta && meta.file_id && meta.format !== 'v4') {
            payload = await loadSessionFile(meta.file_id);
        }

        if (!payload) {
            const s = getSettings();
            if (s.sessions && s.sessions[charId]) {
                if (s.sessions[charId][chatId] && s.sessions[charId][chatId].sessions?.length > 0) {
                    payload = { bucket: { ...s.sessions[charId][chatId] } };
                    delete s.sessions[charId][chatId]; saveSettings();
                } else if (s.sessions[charId]['unified'] && s.sessions[charId]['unified'].sessions?.length > 0) {
                    payload = { bucket: { ...s.sessions[charId]['unified'] } };
                    delete s.sessions[charId]['unified']; saveSettings();
                }
            }
        }

        ctx.chatMetadata.inner_voice = { format: 'v4', file_id: targetFileId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
    }

    _currentSessionFileId = targetFileId;

    if (payload === false) {
        _dbgAdd('STORAGE_LOAD_CORRUPTED_RECOVERY', { brokenFileId: targetFileId, charId, chatId });
        const recoveryFileId = `inner_voice_sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
        ctx.chatMetadata.inner_voice = { format: 'v4', file_id: recoveryFileId, chat_id: chatId, recoveredFrom: targetFileId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();

        targetFileId = recoveryFileId;
        _inMemoryBucket = migrateBucket({ activeSessionId: null, sessions: [] });
        _currentSessionFileId = targetFileId;
        await commitBucketChanges(true);

        toastr.error('The inner conversation file was corrupted and could not be recovered. Started fresh storage for this chat; the broken file was kept on disk for manual recovery.', EXT_DISPLAY, { timeOut: 15000 });
        return;
    }

    if (payload && payload.bucket) {
        _inMemoryBucket = migrateBucket(payload.bucket);
        _dbgAdd('STORAGE_BUCKET_LOADED', { charId, chatId, fileId: targetFileId, sessionCount: _inMemoryBucket.sessions?.length || 0 });
    } else {
        _inMemoryBucket = migrateBucket({ activeSessionId: null, sessions: [] });
        _dbgAdd('STORAGE_BUCKET_EMPTY_INIT', { charId, chatId, fileId: targetFileId, hadPayload: !!payload });
    }
    
    if (!payload || meta?.format !== 'v4') {
        await commitBucketChanges(true);
    }
}

export async function commitBucketChanges(force = false) {
    const fileName = _currentSessionFileId;
    if (!fileName) return;

    const { chatId } = getBindingKey();
    const snapshot = JSON.parse(JSON.stringify(_inMemoryBucket));
    
    const payloadToSave = {
        _version: 4,
        chat_id_reference: chatId,
        updated_at: Date.now(),
        bucket: snapshot
    };

    if (force) {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);
        _saveQueue.delete(fileName);
        
        const success = await saveSessionFile(fileName, payloadToSave);
        if (!success) _dbgAdd('STORAGE_WRITE_FAILED', { fileName });
    } else {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);

        const timer = setTimeout(() => {
            _saveQueue.delete(fileName);
            saveSessionFile(fileName, payloadToSave);
        }, 1000);

        _saveQueue.set(fileName, { timer, payload: payloadToSave });
    }
}

export function saveSessionsToMetadata() {
    commitBucketChanges();
}

export function getChatBucket() {
    _inMemoryBucket = migrateBucket(_inMemoryBucket);
    return _inMemoryBucket;
}

// ─── Session Helpers ─────────────────────────────────────────────────────────

export function genId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

export function createSession(name) {
    const bucket = getChatBucket();
    const id = genId('sess');
    const sess = { id, name: name || `Session ${bucket.sessions.length + 1}`, created: Date.now(), messages: [] };

    bucket.sessions.push(sess);
    bucket.activeSessionId = id;

    saveSessionsToMetadata();
    _dbgAdd('SESSION_CREATED', { id: sess.id, name: sess.name });
    return sess;
}

export function getActiveSession(autoCreate = true) {
    const bucket = getChatBucket();
    if (!bucket.sessions.length || !bucket.activeSessionId) {
        return autoCreate ? createSession() : null;
    }
    const sess = bucket.sessions.find(s => s.id === bucket.activeSessionId);
    if (sess) return sess;
    return autoCreate ? createSession() : null;
}

export function getCurrentSession() {
    return getActiveSession(true);
}

export function addMessage(session, role, content, extra = {}) {
    const msg = { id: genId('msg'), role, content, timestamp: Date.now(), ...extra };
    session.messages.push(msg); 
    if (session.messages.length > 400) session.messages = session.messages.slice(-400);
    saveSessionsToMetadata(); 
    return msg;
}

export function insertMessageAfter(session, afterMsgId, role, content, extra = {}) {
    const msg = { id: genId('msg'), role, content, timestamp: Date.now(), ...extra };
    const idx = afterMsgId ? session.messages.findIndex(m => m.id === afterMsgId) : -1;
    if (idx !== -1) session.messages.splice(idx + 1, 0, msg);
    else session.messages.push(msg);
    if (session.messages.length > 400) session.messages = session.messages.slice(-400);
    saveSessionsToMetadata();
    return msg;
}

export function updateMessage(session, msgId, newContent) {
    const msg = session.messages.find(m => m.id === msgId);
    if (msg) { msg.content = newContent; saveSessionsToMetadata(); }
}

export function truncateAfter(session, msgId) {
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { session.messages.splice(idx + 1); saveSessionsToMetadata(); }
}

export function deleteMsg(session, msgId) {
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { session.messages.splice(idx, 1); saveSessionsToMetadata(); }
}

export function truncateFrom(session, msgId) {
    const idx = session.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { session.messages.splice(idx); saveSessionsToMetadata(); }
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
