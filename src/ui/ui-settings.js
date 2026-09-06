import { THEME_PRESETS, THEME_VAR_DEFS, THEME_CSS_MAP, EXT_DISPLAY, DEFAULT_SYSTEM_PROMPT, DEFAULT_TOOLS_PROMPT, DEFAULT_MEMORY_PROMPT, DEFAULT_PORTRAY_PROMPT, I } from '../constants.js';
import { state } from '../state.js';
import { getSettings, saveSettings, getEffectiveSettings, setConversationOverride, clearAllConversationOverrides, getBindingKey, hasConversationOverrides, saveConversation, getConversation, getConversationOverrides, initConversation } from '../conversation.js';
import { showCustomDialog, escHtml } from '../utils/util-dom.js';
import { applyCustomTheme, bringWindowToFront } from './ui-window.js';
import { showColorPicker } from '../utils/util-colorpicker.js';
import { _dbgAdd } from '../utils/util-debug.js';

// ─── Settings Registry ────────────────────────────────────────────────────────
//
// FIELDS:
//   key             — key in the settings object
//   stId            — element id in the ST-drawer (null if none)
//   spId            — element id in the overlay (null if none)
//   type            — 'checkbox' | 'input' | 'textarea' | 'select' | 'slider'
//   toVal           — transforms el.value before saving (optional)
//   fromSetting     — s => val, how to read from settings for display (optional)
//   stValId/spValId — ID of the display span for sliders
//   valFmt          — v => string, formatting for slider values
//   onChange        — (val) => void, side effect after saving
//   updCtx          — update token counter
//   profileKey      — include in configuration profiles

const _SETTINGS_DEF = [
    // ── General ──────────────────────────────────────────────────────────────
    { key: 'enabled', stId: 'iv-enabled', spId: 'iv-sp-enabled', type: 'checkbox',
      onChange: val => {
          const btn = document.getElementById('iv-wand-btn');
          if (btn) btn.style.display = val ? '' : 'none';
          if (!val) import('./ui-window.js').then(m => m.hideWindow());
          import('./ui-window.js').then(m => {
              m.updateIconVisibility(document.getElementById('iv-dock-icon'));
              m.setupHotkey();
          });
      }
    },
    { key: 'hotkeyEnabled',        stId: 'iv-hotkey-enabled',        spId: 'iv-sp-hotkey-enabled',        type: 'checkbox' },
    { key: 'hotkey',               stId: 'iv-hotkey',                spId: 'iv-sp-hotkey',                type: 'input',
      onChange: () => import('./ui-window.js').then(m => m.setupHotkey()) },
    { key: 'searchHotkeyEnabled',  stId: 'iv-search-hotkey-enabled', spId: 'iv-sp-search-hotkey-enabled', type: 'checkbox',
      onChange: () => import('./ui-chat.js').then(m => m.setupSearchHotkey()) },
    { key: 'searchHotkey',         stId: 'iv-search-hotkey',         spId: 'iv-sp-search-hotkey',         type: 'input',
      onChange: () => import('./ui-chat.js').then(m => m.setupSearchHotkey()) },
    { key: 'floatingIconPersistent', stId: 'iv-icon-persistent', spId: 'iv-sp-icon-persistent', type: 'checkbox',
      onChange: () => import('./ui-window.js').then(m => m.updateIconVisibility(document.getElementById('iv-dock-icon'))) },
    { key: 'wobbleWindow',   stId: 'iv-wobble-window',  spId: 'iv-sp-wobble-window', type: 'checkbox', fromSetting: s => s.wobbleWindow !== false },
    { key: 'performanceMode', stId: 'iv-perf-mode', spId: 'iv-sp-perf-mode', type: 'checkbox',
      onChange: () => import('./ui-window.js').then(m => m.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default)) },
    { key: 'ghostModeHotkeyEnabled', stId: 'iv-ghost-hotkey-enabled', spId: 'iv-sp-ghost-hotkey-enabled', type: 'checkbox',
      onChange: () => import('./ui-window.js').then(m => m.setupGhostHotkey()) },
    { key: 'ghostModeHotkey', stId: 'iv-ghost-hotkey', spId: 'iv-sp-ghost-hotkey', type: 'input',
      onChange: () => import('./ui-window.js').then(m => m.setupGhostHotkey()) },
    { key: 'changelogAutoShow',    stId: null, spId: 'iv-sp-changelog-auto', type: 'checkbox' },
    { key: 'includeSummaryception', stId: 'iv-include-summaryception', spId: 'iv-sp-include-summaryception', type: 'checkbox', fromSetting: s => s.includeSummaryception !== false },
    { key: 'includeLorebook', stId: 'iv-include-lorebook', spId: 'iv-sp-include-lorebook', type: 'checkbox', fromSetting: s => s.includeLorebook !== false, updCtx: true },
    { key: 'useAspectEvolutia',    stId: 'iv-use-aspect-evolutia',    spId: 'iv-sp-use-aspect-evolutia',    type: 'checkbox', fromSetting: s => s.useAspectEvolutia !== false },
    { key: 'autoExpandMacros',     stId: 'iv-auto-expand-macros',     spId: 'iv-sp-auto-expand-macros',     type: 'checkbox' },
    { key: 'includeHiddenMessages', stId: 'iv-include-hidden-msgs',   spId: 'iv-sp-include-hidden-msgs',    type: 'checkbox', updCtx: true },
    { key: 'completionSoundOnlyWhenUnfocused', stId: 'iv-sound-unfocused', spId: 'iv-sp-sound-unfocused',  type: 'checkbox' },

    // ── Sliders ───────────────────────────────────────────────────────────────
    { key: 'opacity', stId: 'iv-opacity-slider', spId: 'iv-sp-opacity-slider', type: 'slider', toVal: Number,
      stValId: 'iv-opacity-val', spValId: 'iv-sp-opacity-val', valFmt: v => `${v}%`,
      onChange: val => { const w = document.getElementById('iv-window'); if (w && !state.ghostModeActive) w.style.opacity = (val / 100).toString(); } },
    { key: 'ghostModeOpacity', stId: 'iv-ghost-opacity', spId: 'iv-sp-ghost-opacity', type: 'slider', toVal: Number,
      stValId: 'iv-ghost-opacity-val', spValId: 'iv-sp-ghost-opacity-val', valFmt: v => `${v}%`,
      onChange: val => { const w = document.getElementById('iv-window'); if (w && state.ghostModeActive) w.style.opacity = (val / 100).toString(); } },

    // ── Connection ────────────────────────────────────────────────────────────
    { key: 'connectionSource',  stId: 'iv-conn-source',  spId: 'iv-sp-conn-source',  type: 'select', profileKey: true, onChange: _applyConnectionSourceVisibility },
    { key: 'connectionProfileId', stId: 'iv-conn-profile', spId: 'iv-sp-conn-profile', type: 'select', profileKey: true },
    { key: 'customUrl',   stId: 'iv-custom-url',   spId: 'iv-sp-custom-url',   type: 'input', profileKey: true },
    { key: 'customKey',   stId: 'iv-custom-key',   spId: 'iv-sp-custom-key',   type: 'input', profileKey: true },
    { key: 'customModel', stId: 'iv-custom-model', spId: 'iv-sp-custom-model', type: 'input', profileKey: true },
    { key: 'maxTokens',   stId: 'iv-max-tokens',   spId: 'iv-sp-max-tokens',   type: 'input', toVal: Number, profileKey: true },

    // ── Context ───────────────────────────────────────────────────────────────
    { key: 'contextDepth', stId: 'iv-depth-slider', spId: 'iv-sp-depth-slider', type: 'slider', toVal: Number,
      stValId: 'iv-depth-val', spValId: 'iv-sp-depth-val', updCtx: true, profileKey: true },
    { key: 'exchangeDepth', stId: 'iv-exchange-depth', spId: 'iv-sp-exchange-depth', type: 'input',
      toVal: v => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(0, n) : 1; },
      onChange: () => import('../simulation-view.js').then(m => m.syncSimulationView()) },
    { key: 'portrayStyle', stId: 'iv-portray-style', spId: 'iv-sp-portray-style', type: 'select',
      onChange: () => import('../portray.js').then(m => m.syncFireTimePortrayForm()) },
    { key: 'portrayPerson', stId: 'iv-portray-person', spId: 'iv-sp-portray-person', type: 'select',
      onChange: () => import('../portray.js').then(m => m.syncFireTimePortrayForm()) },
    { key: 'portrayImmediateSend', stId: 'iv-portray-immediate-send', spId: 'iv-sp-portray-immediate-send', type: 'checkbox' },
    { key: 'portrayAutoTrigger', stId: 'iv-portray-auto-trigger', spId: 'iv-sp-portray-auto-trigger', type: 'checkbox' },
    { key: 'portrayPrompt', stId: 'iv-portray-prompt', spId: 'iv-sp-portray-prompt', type: 'textarea', profileKey: true,
      fromSetting: s => s.portrayPrompt || DEFAULT_PORTRAY_PROMPT },
    { key: 'localHistoryLimit',   stId: 'iv-history-limit',    spId: 'iv-sp-history-limit',    type: 'input',    toVal: Number, updCtx: true, profileKey: true },
    { key: 'includeSystemPrompt', stId: 'iv-include-sysprompt', spId: 'iv-sp-include-sysprompt', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'includeUserPersonality', stId: 'iv-include-persona', spId: 'iv-sp-include-persona', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'includeAlternateSwipes', stId: 'iv-include-alt-swipes', spId: 'iv-sp-include-alt-swipes', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'applyRegexToContext', stId: 'iv-apply-regex', spId: 'iv-sp-apply-regex', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'reasoningTrimStrings', stId: 'iv-reasoning-trim', spId: 'iv-sp-reasoning-trim', type: 'textarea', profileKey: true },
    { key: 'postHistoryText', stId: 'iv-post-history-text', spId: 'iv-sp-post-history-text', type: 'textarea', updCtx: true },
    { key: 'postHistoryRole', stId: 'iv-post-history-role', spId: 'iv-sp-post-history-role', type: 'select',
      fromSetting: s => (s.postHistoryRole === 'system' || s.postHistoryRole === 'assistant') ? s.postHistoryRole : 'user',
      updCtx: true },

    // ── Prompts ───────────────────────────────────────────────────────────────
    { key: 'systemPrompt', stId: 'iv-sysprompt', spId: 'iv-sp-sysprompt', type: 'textarea', updCtx: true, profileKey: true,
      fromSetting: s => s.systemPrompt || DEFAULT_SYSTEM_PROMPT },

    // ── Memory ────────────────────────────────────────────────────────────────
    { key: 'memoryEnabled',      stId: 'iv-memory-enabled', spId: 'iv-sp-memory-enabled', type: 'checkbox', updCtx: true },
    { key: 'memoryInject',       stId: 'iv-memory-inject',  spId: 'iv-sp-memory-inject',  type: 'checkbox', updCtx: true },
    { key: 'memoryNotify',       stId: null,                 spId: 'iv-sp-memory-notify',  type: 'checkbox' },
    { key: 'memoryManagePrompt', stId: 'iv-memory-prompt',  spId: 'iv-sp-memory-prompt',  type: 'textarea', updCtx: true,
      fromSetting: s => s.memoryManagePrompt || DEFAULT_MEMORY_PROMPT },

    // ── Tools ─────────────────────────────────────────────────────────────────
    { key: 'toolsEnabled', stId: 'iv-tools-enabled', spId: 'iv-sp-tools-enabled', type: 'checkbox', updCtx: true },

    // ── Misc ──────────────────────────────────────────────────────────────────
    { key: 'pickerPreviewLines',     stId: 'iv-picker-lines',      spId: 'iv-sp-picker-lines',      type: 'input', toVal: v => parseInt(v) || 1 },
    { key: 'pickerPreviewLastLines', stId: 'iv-picker-last-lines', spId: 'iv-sp-picker-last-lines', type: 'input', toVal: v => parseInt(v) || 0 },
];

const _CE_FIELDS_DEF = [
    { fk: 'tags',                      stId: 'iv-ce-tags',           spId: 'iv-sp-ce-tags',           ovId: 'iv-sp-ov-ce-tags' },
    { fk: 'description',               stId: 'iv-ce-description',    spId: 'iv-sp-ce-description',    ovId: 'iv-sp-ov-ce-description' },
    { fk: 'personality',               stId: 'iv-ce-personality',    spId: 'iv-sp-ce-personality',    ovId: 'iv-sp-ov-ce-personality' },
    { fk: 'scenario',                  stId: 'iv-ce-scenario',       spId: 'iv-sp-ce-scenario',       ovId: 'iv-sp-ov-ce-scenario' },
    { fk: 'first_mes',                 stId: 'iv-ce-first-mes',      spId: 'iv-sp-ce-first-mes',      ovId: 'iv-sp-ov-ce-first-mes' },
    { fk: 'mes_example',               stId: 'iv-ce-mes-example',    spId: 'iv-sp-ce-mes-example',    ovId: 'iv-sp-ov-ce-mes-example' },
    { fk: 'authors_note',              stId: 'iv-ce-authors-note',   spId: 'iv-sp-ce-authors-note',   ovId: 'iv-sp-ov-ce-authors-note' },
    { fk: 'system_prompt',             stId: 'iv-ce-system-prompt',  spId: 'iv-sp-ce-system-prompt',  ovId: 'iv-sp-ov-ce-system-prompt' },
    { fk: 'post_history_instructions', stId: 'iv-ce-post-history',   spId: 'iv-sp-ce-post-history',   ovId: 'iv-sp-ov-ce-post-history' },
    { fk: 'alternate_greetings',       stId: 'iv-ce-alt-greetings',  spId: 'iv-sp-ce-alt-greetings',  ovId: 'iv-sp-ov-ce-alt-greetings', altGreetingPicker: true },
];

// Mapping override keys to elements (for the override reset button)
const _OV_EL_MAP = {
    contextDepth: ['iv-sp-ov-depth-slider', 'iv-sp-ov-depth-val'],
    maxTokens: ['iv-sp-ov-max-tokens'],           localHistoryLimit: ['iv-sp-ov-history-limit'],
    reasoningTrimStrings: ['iv-sp-ov-reasoning-trim'], systemPrompt: ['iv-sp-ov-sysprompt'],
    connectionSource: ['iv-sp-ov-conn-source'],   customUrl: ['iv-sp-ov-custom-url'],
    customKey: ['iv-sp-ov-custom-key'],           customModel: ['iv-sp-ov-custom-model'],
    connectionProfileId: ['iv-sp-ov-conn-profile'],
    includeSystemPrompt: ['iv-sp-ov-include-sysprompt'], includeUserPersonality: ['iv-sp-ov-include-persona'],
    includeAlternateSwipes: ['iv-sp-ov-include-alt-swipes'], applyRegexToContext: ['iv-sp-ov-apply-regex'],
    charField_tags: ['iv-sp-ov-ce-tags'],                 charField_description: ['iv-sp-ov-ce-description'],
    charField_personality: ['iv-sp-ov-ce-personality'],   charField_scenario: ['iv-sp-ov-ce-scenario'],
    charField_first_mes: ['iv-sp-ov-ce-first-mes'],       charField_mes_example: ['iv-sp-ov-ce-mes-example'],
    charField_authors_note: ['iv-sp-ov-ce-authors-note'], charField_system_prompt: ['iv-sp-ov-ce-system-prompt'],
    charField_post_history_instructions: ['iv-sp-ov-ce-post-history'],
    charField_alternate_greetings: ['iv-sp-ov-ce-alt-greetings'],
    forceStreaming: [],
};

// Profile keys
const _PROFILE_KEYS = [
    ..._SETTINGS_DEF.filter(d => d.profileKey).map(d => d.key),
    'includeCharacterCard',
];

// ─── Configuration Profiles ───────────────────────────────────────────────────

let _profileSnapshot = null;

export function _takeProfileSnapshot() {
    const s = getSettings();
    _profileSnapshot = {};
    for (const k of _PROFILE_KEYS) _profileSnapshot[k] = JSON.stringify(s[k]);
    _profileSnapshot._charEditFields = JSON.stringify(s.charEditFields || {});
}

export function isConfigProfileDirty() {
    if (!_profileSnapshot) return false;
    const s = getSettings();
    for (const k of _PROFILE_KEYS) { if (JSON.stringify(s[k]) !== _profileSnapshot[k]) return true; }
    if (JSON.stringify(s.charEditFields || {}) !== _profileSnapshot._charEditFields) return true;
    return false;
}

export function _markDirty(type) {
    if (type === 'config') state.configDirty = isConfigProfileDirty();
    if (type === 'theme') state.themeDirty = isThemeDirty();
    _updateDirtyDots();
}

export function _clearDirty(type) {
    if (type === 'config') { state.configDirty = false; _takeProfileSnapshot(); }
    if (type === 'theme') state.themeDirty = false;
    _updateDirtyDots();
}

export function _updateDirtyDots() {
    const dot = '<span class="iv-save-dirty-dot"></span>';
    ['iv-profile-save', 'iv-sp-profile-save'].forEach(id => {
        const btn = document.getElementById(id); if (!btn) return;
        btn.querySelectorAll('.iv-save-dirty-dot').forEach(d => d.remove());
        if (state.configDirty) btn.insertAdjacentHTML('beforeend', dot);
    });
    document.querySelectorAll('#iv-theme-save').forEach(btn => {
        btn.querySelectorAll('.iv-save-dirty-dot').forEach(d => d.remove());
        if (state.themeDirty) btn.insertAdjacentHTML('beforeend', dot);
    });
}

export function saveProfile(name) {
    const s = getSettings(); const p = {};
    for (const k of _PROFILE_KEYS) p[k] = s[k];
    p.charEditFields = JSON.parse(JSON.stringify(s.charEditFields || {}));
    s.profiles[name] = p; s.activeProfile = name; saveSettings();
}

export function loadProfile(name) {
    const s = getSettings(); const p = s.profiles[name]; if (!p) return;
    for (const k of _PROFILE_KEYS) { if (p[k] !== undefined) s[k] = p[k]; }
    if (p.charEditFields) s.charEditFields = JSON.parse(JSON.stringify(p.charEditFields));
    s.activeProfile = name; saveSettings();
    if (typeof updateSettingsUI === 'function') updateSettingsUI();
    _takeProfileSnapshot(); state.configDirty = false; _updateDirtyDots();
    _pruneMatchingOverrides();
}

export function deleteProfile(name) {
    const s = getSettings(); delete s.profiles[name];
    if (s.activeProfile === name) s.activeProfile = '';
    for (const k in s.profileBindings) { if (s.profileBindings[k] === name) delete s.profileBindings[k]; }
    saveSettings();
}

export function refreshProfilesDropdown() {
    const sel = document.getElementById('iv-profile-select'); if (!sel) return;
    const s = getSettings();
    if (!Object.keys(s.profiles).length) {
        s.profiles['Default'] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        s.activeProfile = 'Default'; saveSettings();
    }
    sel.innerHTML = ''; let hasActive = false;
    for (const name of Object.keys(s.profiles)) {
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        if (name === s.activeProfile) { opt.selected = true; hasActive = true; }
        sel.appendChild(opt);
    }
    if (!hasActive && Object.keys(s.profiles).length > 0) { loadProfile(Object.keys(s.profiles)[0]); sel.value = Object.keys(s.profiles)[0]; }
    updateBindingSection();
}

export function updateBindingSection() {
    const sel = document.getElementById('iv-profile-select');
    const section = document.getElementById('iv-binding-section');
    if (!section) return;
    section.style.display = sel?.value ? '' : 'none'; if (!sel?.value) return;
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    document.getElementById('iv-bind-char')?.classList.toggle('active', s.profileBindings[`char_${charId}`] === sel.value);
    document.getElementById('iv-bind-chat')?.classList.toggle('active', s.profileBindings[`chat_${charId}_${chatId}`] === sel.value);
}

export function autoLoadBoundProfile() {
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    const name = s.profileBindings[`chat_${charId}_${chatId}`] || s.profileBindings[`char_${charId}`];
    if (name && s.profiles[name]) { loadProfile(name); const sel = document.getElementById('iv-profile-select'); if (sel) sel.value = name; }
    else if (name && !s.profiles[name]) _dbgAdd('PROFILE_LOAD_BINDING_MISSING', { name });
}

export async function updateProfilesList() {
    const profSel = document.getElementById('iv-conn-profile'); if (!profSel) return;
    const ctx = SillyTavern.getContext(); const s = getSettings(); let currentVal = s.connectionProfileId || '';
    const service = ctx.ConnectionManagerRequestService;
    let profiles = service?.getSupportedProfiles?.() ?? ctx.extensionSettings?.connectionManager?.profiles ?? [];
    if (currentVal && !profiles.some(p => p.id === currentVal)) {
        _dbgAdd('PROFILE_GHOST_CLEANUP', { removedId: currentVal });
        s.connectionProfileId = ''; saveSettings(); currentVal = '';
    }
    if (service?.handleDropdown) { service.handleDropdown(profSel); if (currentVal && Array.from(profSel.options).some(o => o.value === currentVal)) profSel.value = currentVal; return; }
    profSel.innerHTML = '<option value="">-- Select Profile --</option>';
    profiles.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; profSel.appendChild(o); });
    if (Array.from(profSel.options).some(o => o.value === currentVal)) profSel.value = currentVal;
}

export async function updateSPConnProfileList() {
    const selIds = ['iv-sp-conn-profile', 'iv-sp-ov-conn-profile'];
    const s = getSettings(); const eff = getEffectiveSettings();
    const ctx = SillyTavern.getContext(); const service = ctx.ConnectionManagerRequestService;
    let profiles = service?.getSupportedProfiles?.() ?? ctx.extensionSettings?.connectionManager?.profiles ?? [];
    selIds.forEach(sid => {
        const sel = document.getElementById(sid); if (!sel) return;
        const isOv = sid === 'iv-sp-ov-conn-profile';
        let targetVal = isOv ? (eff.connectionProfileId || '') : (s.connectionProfileId || '');
        if (targetVal && !profiles.some(p => p.id === targetVal)) {
            if (isOv) setConversationOverride('connectionProfileId', undefined); else { s.connectionProfileId = ''; saveSettings(); }
            targetVal = '';
        }
        sel.innerHTML = '<option value="">-- Select Profile --</option>';
        profiles.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
        if (Array.from(sel.options).some(o => o.value === targetVal)) sel.value = targetVal;
    });
}

export function refreshSPProfilesDropdown() {
    const sel = document.getElementById('iv-sp-profile-select'); if (!sel) return;
    const s = getSettings();
    if (!Object.keys(s.profiles).length) {
        s.profiles['Default'] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        s.activeProfile = 'Default'; saveSettings();
    }
    sel.innerHTML = '';
    for (const name of Object.keys(s.profiles)) {
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        if (name === s.activeProfile) opt.selected = true;
        sel.appendChild(opt);
    }
    updateSPBindingSection();
}

export function updateSPBindingSection() {
    const sel = document.getElementById('iv-sp-profile-select');
    const section = document.getElementById('iv-sp-binding-section');
    if (!section) return;
    section.style.display = sel?.value ? '' : 'none'; if (!sel?.value) return;
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    document.getElementById('iv-sp-bind-char')?.classList.toggle('active', s.profileBindings[`char_${charId}`] === sel.value);
    document.getElementById('iv-sp-bind-chat')?.classList.toggle('active', s.profileBindings[`chat_${charId}_${chatId}`] === sel.value);
}

// ─── Theme Editor ─────────────────────────────────────────────────────────────

const _COLOR_KEYS = new Set(['bg','text','textMuted','accent','accentDim','accentBg','headerBg','toolbarBg','msgUserBg','msgAiBg','inputBg','codeBg','danger','success']);

export function isThemeDirty() {
    const s = getSettings(); const current = s.customTheme || {};
    if (s.activeThemeProfile && s.savedThemes[s.activeThemeProfile]) {
        const saved = s.savedThemes[s.activeThemeProfile];
        return THEME_VAR_DEFS.some(def => (current[def.key] || '') !== (saved[def.key] || ''));
    }
    for (const preset of Object.values(THEME_PRESETS)) {
        if (THEME_VAR_DEFS.every(def => (current[def.key] || '') === (preset[def.key] || ''))) return false;
    }
    return true;
}

export function buildThemeEditor(containerOverride) {
    const container = containerOverride || document.getElementById('iv-theme-section'); if (!container) return;
    container.innerHTML = '';
    const s = getSettings();
    if (!s.savedThemes || !Object.keys(s.savedThemes).length) {
        s.savedThemes = { 'Default': { ...THEME_PRESETS.default } }; s.activeThemeProfile = 'Default';
        s.customTheme = { ...s.savedThemes['Default'] }; saveSettings();
    }
    const profileRow = document.createElement('div'); profileRow.className = 'iv-profile-bar'; profileRow.style.marginBottom = '12px';
    profileRow.innerHTML = `
        <select id="iv-theme-profile-select"></select>
        <button class="iv-profile-icon-btn" id="iv-theme-save" title="Save current theme"><i class="fa-solid fa-floppy-disk"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-create" title="Create new theme"><i class="fa-solid fa-plus"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-duplicate" title="Duplicate theme"><i class="fa-solid fa-copy"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-rename" title="Rename theme"><i class="fa-solid fa-pen"></i></button>
        <button class="iv-profile-icon-btn danger" id="iv-theme-delete" title="Delete theme"><i class="fa-solid fa-trash"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-export" title="Export theme"><i class="fa-solid fa-file-export"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-import" title="Import theme"><i class="fa-solid fa-file-import"></i></button>`;
    container.appendChild(profileRow);
    const sel = profileRow.querySelector('#iv-theme-profile-select');
    const optGrpDefault = document.createElement('optgroup'); optGrpDefault.label = 'Default Presets';
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
        const opt = document.createElement('option'); opt.value = `__preset__${key}`; opt.textContent = preset.label; optGrpDefault.appendChild(opt);
    }
    sel.appendChild(optGrpDefault);
    const userKeys = Object.keys(s.savedThemes);
    if (userKeys.length) {
        const optGrpCustom = document.createElement('optgroup'); optGrpCustom.label = 'Custom Themes';
        for (const name of userKeys) {
            const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
            if (name === s.activeThemeProfile) opt.selected = true;
            optGrpCustom.appendChild(opt);
        }
        sel.appendChild(optGrpCustom);
    }
    if (!s.activeThemeProfile || !s.savedThemes[s.activeThemeProfile]) {
        const matchKey = Object.keys(THEME_PRESETS).find(k => THEME_VAR_DEFS.every(d => (s.customTheme?.[d.key] || '') === (THEME_PRESETS[k][d.key] || '')));
        if (matchKey) sel.value = `__preset__${matchKey}`;
    }
    sel.addEventListener('change', async () => {
        const name = sel.value;
        if (isThemeDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Changes', message: 'You have unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = s.activeThemeProfile ? s.activeThemeProfile : sel.value; return; }
        }
        const s2 = getSettings();
        if (name.startsWith('__preset__')) {
            s2.customTheme = { ...THEME_PRESETS[name.replace('__preset__', '')] }; s2.activeThemeProfile = '';
        } else if (s2.savedThemes[name]) {
            s2.customTheme = { ...s2.savedThemes[name] }; s2.activeThemeProfile = name;
        }
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride);
    });
    profileRow.querySelector('#iv-theme-save').addEventListener('click', async () => {
        const val = sel.value;
        if (val.startsWith('__preset__')) {
            const name = await showCustomDialog({ type: 'prompt', title: 'Save as Custom Theme', message: 'Name for your custom theme:', placeholder: 'My Theme' });
            if (!name?.trim()) return;
            const s2 = getSettings(); s2.savedThemes[name.trim()] = { ...s2.customTheme }; s2.activeThemeProfile = name.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success(`Theme "${name.trim()}" saved`, EXT_DISPLAY); _clearDirty('theme');
        } else if (val) {
            const s2 = getSettings(); s2.savedThemes[val] = { ...s2.customTheme }; saveSettings(); toastr.success(`Theme "${val}" updated`, EXT_DISPLAY); _clearDirty('theme');
        }
    });
    profileRow.querySelector('#iv-theme-create').addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Theme', message: 'Enter name for new theme:', placeholder: 'My New Theme' });
        if (!name?.trim()) return;
        const s2 = getSettings(); s2.savedThemes[name.trim()] = { ...s2.customTheme }; s2.activeThemeProfile = name.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success(`Created theme "${name.trim()}"`, EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-duplicate').addEventListener('click', async () => {
        const val = sel.value; if (!val) return;
        const baseTheme = val.startsWith('__preset__') ? THEME_PRESETS[val.replace('__preset__', '')] : s.savedThemes[val]; if (!baseTheme) return;
        const defaultName = (val.startsWith('__preset__') ? THEME_PRESETS[val.replace('__preset__', '')].label : val) + ' (Copy)';
        const name = await showCustomDialog({ type: 'prompt', title: 'Duplicate Theme', message: 'Name for the duplicated theme:', defaultValue: defaultName });
        if (!name?.trim()) return;
        const s2 = getSettings(); s2.savedThemes[name.trim()] = JSON.parse(JSON.stringify(baseTheme)); s2.activeThemeProfile = name.trim(); s2.customTheme = { ...s2.savedThemes[name.trim()] };
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success(`Theme duplicated as "${name.trim()}"`, EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-rename').addEventListener('click', async () => {
        const val = sel.value; if (!val || val.startsWith('__preset__')) { toastr.info('Select a custom theme to rename.', EXT_DISPLAY); return; }
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Theme', message: 'Enter new name:', defaultValue: val });
        if (!newName?.trim() || newName.trim() === val) return;
        const s2 = getSettings(); s2.savedThemes[newName.trim()] = s2.savedThemes[val]; delete s2.savedThemes[val]; s2.activeThemeProfile = newName.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success('Theme renamed.', EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-delete').addEventListener('click', async () => {
        const val = sel.value; if (!val || val.startsWith('__preset__')) { toastr.info('Select a custom theme to delete.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Theme', message: `Delete "${val}"?` }); if (!ok) return;
        const s2 = getSettings(); delete s2.savedThemes[val]; s2.activeThemeProfile = Object.keys(s2.savedThemes)[0] || '';
        s2.customTheme = s2.activeThemeProfile ? { ...s2.savedThemes[s2.activeThemeProfile] } : { ...THEME_PRESETS.default };
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success('Deleted.', EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-export').addEventListener('click', () => {
        const s2 = getSettings(); const val = sel.value;
        const rawName = val.startsWith('__preset__') ? val.replace('__preset__', '') : (val || 'custom');
        const blob = new Blob([JSON.stringify({ name: rawName, version: 1, theme: s2.customTheme }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inner-voice-theme-${rawName.replace(/[^a-z0-9]/gi, '_')}.json`; a.click(); URL.revokeObjectURL(a.href);
    });
    profileRow.querySelector('#iv-theme-import').addEventListener('click', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
        inp.onchange = async () => {
            const file = inp.files?.[0]; if (!file) return;
            try {
                const data = JSON.parse(await file.text()); const imported = data.theme || data;
                if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid format');
                const themeName = (data.name && typeof data.name === 'string') ? data.name : file.name.replace(/\.json$/i, '');
                const s2 = getSettings(); s2.savedThemes[themeName] = { ...THEME_PRESETS.default, ...imported }; s2.activeThemeProfile = themeName; s2.customTheme = { ...s2.savedThemes[themeName] };
                saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success(`Theme "${escHtml(themeName)}" imported.`, EXT_DISPLAY);
            } catch (e) { toastr.error('Invalid theme file.', EXT_DISPLAY); }
        };
        inp.click();
    });
    const grid = document.createElement('div'); grid.className = 'iv-theme-var-grid';
    const windowEl = document.getElementById('iv-window');
    for (const def of THEME_VAR_DEFS) {
        const item = document.createElement('div'); item.className = 'iv-theme-var-item';
        const label = document.createElement('div'); label.className = 'iv-theme-var-label'; label.textContent = def.label;
        const wrap = document.createElement('div'); wrap.className = 'iv-theme-var-wrap';
        const isColorKey = _COLOR_KEYS.has(def.key); const isFontKey = def.key === 'font' || def.key === 'fontSize';
        const preview = document.createElement('div'); preview.className = 'iv-theme-var-preview';
        let curVal = s.customTheme?.[def.key] ?? '';
        if (def.key === 'fontSize' && /^\d+$/.test(curVal)) curVal += 'px';
        if (isColorKey) { preview.style.background = curVal; preview.style.display = curVal ? '' : 'none'; preview.classList.add('iv-color-clickable'); }
        else { preview.style.display = 'none'; }
        const input = document.createElement('input'); input.type = 'text'; input.className = 'iv-theme-var-input'; input.value = curVal; input.placeholder = def.hint; input.dataset.key = def.key;
        const cssVar = THEME_CSS_MAP[def.key];
        const getDefaultVal = () => {
            const ss = getSettings();
            if (ss.activeThemeProfile && ss.savedThemes?.[ss.activeThemeProfile]) return ss.savedThemes[ss.activeThemeProfile][def.key] ?? '';
            const selEl = container.querySelector('#iv-theme-profile-select'); const selVal = selEl?.value || '';
            if (selVal.startsWith('__preset__')) return (THEME_PRESETS[selVal.replace('__preset__', '')] || THEME_PRESETS.default)[def.key] ?? '';
            return THEME_PRESETS.default[def.key] ?? '';
        };
        const resetBtn = document.createElement('button'); resetBtn.className = 'iv-theme-var-reset'; resetBtn.title = 'Reset to profile default'; resetBtn.textContent = '↺';
        const updateResetState = val => { resetBtn.disabled = !val || val === getDefaultVal(); };
        updateResetState(curVal);
        let _fontDebounce = null;
        const applyVal = val => {
            const s2 = getSettings(); if (!s2.customTheme) s2.customTheme = {};
            s2.customTheme[def.key] = val; saveSettings(); _markDirty('theme');
            document.querySelectorAll(`input.iv-theme-var-input[data-key="${def.key}"]`).forEach(inp => { if (inp.value !== val) inp.value = val; });
            if (isColorKey) {
                if (cssVar) [windowEl].filter(Boolean).forEach(t => t.style.setProperty(cssVar, val));
                preview.style.background = val; preview.style.display = val ? '' : 'none';
            } else if (isFontKey) {
                clearTimeout(_fontDebounce);
                _fontDebounce = setTimeout(() => {
                    let fVal = val.trim(); if (def.key === 'fontSize' && /^\d+$/.test(fVal)) fVal += 'px';
                    const targets = [windowEl, document.getElementById('iv-settings-overlay'), document.getElementById('iv-picker-overlay')].filter(Boolean);
                    targets.forEach(t => { if (fVal) { t.style.setProperty(cssVar, fVal); if (def.key === 'fontSize') t.style.fontSize = fVal; } else { t.style.removeProperty(cssVar); if (def.key === 'fontSize') t.style.fontSize = ''; } });
                }, 600);
            } else {
                if (cssVar) [windowEl].filter(Boolean).forEach(t => t.style.setProperty(cssVar, val));
            }
            updateResetState(val);
        };
        input.addEventListener('input', () => applyVal(input.value));
        resetBtn.addEventListener('click', () => applyVal(getDefaultVal() || ''));
        if (isColorKey) preview.addEventListener('click', () => showColorPicker(preview, input.value || '#7c6dfa', val => applyVal(val)));
        wrap.appendChild(preview); wrap.appendChild(input); wrap.appendChild(resetBtn);
        item.appendChild(label); item.appendChild(wrap); grid.appendChild(item);
    }
    container.appendChild(grid);
}

// ─── Settings Engine ──────────────────────────────────────────────────────────

function _applyConnectionSourceVisibility(val) {
    [['iv-profile-group', 'iv-custom-profile-group'],
     ['iv-sp-global-profile-group', 'iv-sp-custom-profile-group']].forEach(([pId, cId]) => {
        const pEl = document.getElementById(pId); const cEl = document.getElementById(cId);
        if (pEl) pEl.style.display = val === 'profile' ? '' : 'none';
        if (cEl) cEl.style.display = val === 'custom' ? '' : 'none';
    });
    if (val === 'profile') updateSPConnProfileList();
}

function _pruneMatchingOverrides() {
    const s = getSettings(); const conv = getConversation(); let changed = false;

    if (conv && conv.overrides) {
        for (const key of Object.keys(conv.overrides)) {
            const globalVal = key.startsWith('charField_') ? (s.charEditFields || {})[key.replace('charField_', '')] !== false : s[key];
            const isEqual = typeof globalVal === 'boolean' ? conv.overrides[key] === globalVal : String(conv.overrides[key]) === String(globalVal);
            if (isEqual) { delete conv.overrides[key]; changed = true; }
        }
        if (changed) { saveConversation(); updateConversationOverrideIndicator(); }
    }

    let charChanged = false;
    if (s.charMgrFieldOverrides) {
        for (const charId of Object.keys(s.charMgrFieldOverrides)) {
            const ovs = s.charMgrFieldOverrides[charId];
            for (const key of Object.keys(ovs)) {
                const globalVal = (s.charEditFields || {})[key] !== false;
                if (ovs[key] === globalVal) {
                    delete ovs[key];
                    charChanged = true;
                }
            }
            if (Object.keys(ovs).length === 0) {
                delete s.charMgrFieldOverrides[charId];
            }
        }
    }
    if (charChanged) saveSettings();
}

function _readFromSettings(def) {
    const s = getSettings();
    return def.fromSetting ? def.fromSetting(s) : s[def.key];
}

function _writeToEl(el, def, val) {
    if (!el) return;
    if (def.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
}

function _bindSetting(def) {
    const stEl = def.stId ? document.getElementById(def.stId) : null;
    const spEl = def.spId ? document.getElementById(def.spId) : null;
    if (!stEl && !spEl) return;

    const apply = raw => {
        const val = def.toVal ? def.toVal(raw) : raw;
        getSettings()[def.key] = val; saveSettings();
        _markDirty('config'); _pruneMatchingOverrides();
        if (def.onChange) def.onChange(val, getSettings());
        if (def.updCtx) import('./ui-chat.js').then(m => m.updateMsgCount(getConversation()));
    };

    if (def.type === 'slider') {
        const setDisplayVal = (valId, v) => { const el = document.getElementById(valId); if (el) el.textContent = def.valFmt ? def.valFmt(v) : String(v); };
        stEl?.addEventListener('input', () => setDisplayVal(def.stValId, stEl.value));
        spEl?.addEventListener('input', () => setDisplayVal(def.spValId, spEl.value));
        stEl?.addEventListener('change', () => {
            const v = def.toVal ? def.toVal(stEl.value) : stEl.value;
            _writeToEl(spEl, def, v); setDisplayVal(def.stValId, v); setDisplayVal(def.spValId, v); apply(stEl.value);
        });
        spEl?.addEventListener('change', () => {
            const v = def.toVal ? def.toVal(spEl.value) : spEl.value;
            _writeToEl(stEl, def, v); setDisplayVal(def.stValId, v); setDisplayVal(def.spValId, v); apply(spEl.value);
        });
    } else {
        const ev = (def.type === 'input' || def.type === 'textarea') ? 'input' : 'change';
        stEl?.addEventListener(ev, () => { const raw = def.type === 'checkbox' ? stEl.checked : stEl.value; _writeToEl(spEl, def, raw); apply(raw); });
        spEl?.addEventListener(ev, () => { const raw = def.type === 'checkbox' ? spEl.checked : spEl.value; _writeToEl(stEl, def, raw); apply(raw); });
    }
}

function _bindCeField(ceDef) {
    const stEl = document.getElementById(ceDef.stId);
    const spEl = document.getElementById(ceDef.spId);
    const apply = val => {
        const s = getSettings(); if (!s.charEditFields) s.charEditFields = {};
        s.charEditFields[ceDef.fk] = val; saveSettings(); _markDirty('config'); _pruneMatchingOverrides();
        import('./ui-chat.js').then(m => m.updateMsgCount(getConversation()));
        if (ceDef.altGreetingPicker) {
            ['iv-ce-alt-greetings-picker', 'iv-sp-ce-alt-greetings-picker'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = val ? '' : 'none'; });
            import('../features/feature-character-ui.js').then(m => m.refreshAltGreetingsPickers());
        }
    };
    stEl?.addEventListener('change', () => { if (spEl) spEl.checked = stEl.checked; apply(stEl.checked); });
    spEl?.addEventListener('change', () => { if (stEl) stEl.checked = spEl.checked; apply(spEl.checked); });
}

function _bindAllSettings() {
    _SETTINGS_DEF.forEach(_bindSetting);
    _CE_FIELDS_DEF.forEach(_bindCeField);
}

function _syncOvToGlobal(key, newVal) {
    const s = getSettings();
    const globalVal = key.startsWith('charField_') ? (s.charEditFields || {})[key.replace('charField_', '')] !== false : s[key];
    const isDefault = (newVal === undefined || newVal === null) ? true
        : (typeof globalVal === 'boolean' ? newVal === globalVal : String(newVal) === String(globalVal));
    setConversationOverride(key, isDefault ? undefined : newVal);
    updateSPOverrideIndicators();
    import('./ui-chat.js').then(m => m.updateMsgCount(getConversation()));
}

function _resetOvElToEffective(key) {
    const eff = getEffectiveSettings();
    (_OV_EL_MAP[key] || []).forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        if (id.endsWith('-depth-val') || (id.endsWith('-val') && !id.endsWith('slider'))) {
            el.textContent = eff.contextDepth ?? 15; return;
        }
        if (el.type === 'checkbox') {
            el.checked = key.startsWith('charField_') ? (getSettings().charEditFields || {})[key.replace('charField_', '')] !== false : !!eff[key];
        } else if (el.type === 'range') {
            el.value = eff[key] ?? 15;
        } else {
            el.value = eff[key] ?? '';
        }
    });
    if (key === 'connectionSource') {
        const val = eff.connectionSource ?? 'default';
        const pg = document.getElementById('iv-sp-ov-profile-group'); const cg = document.getElementById('iv-sp-ov-custom-profile-group');
        if (pg) pg.style.display = val === 'profile' ? '' : 'none';
        if (cg) cg.style.display = val === 'custom' ? '' : 'none';
    }
    if (key === 'forceStreaming') {
        const val = eff.forceStreaming === true ? 'on' : (eff.forceStreaming === false ? 'auto' : (eff.forceStreaming || 'auto'));
        document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
            const active = b.dataset.stream === val; b.classList.toggle('active', active);
            b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
        });
    }
}

// ─── UI Sync ──────────────────────────────────────────────────────────────────

export function syncOverlayUI(key, val) {
    const def = _SETTINGS_DEF.find(d => d.key === key);
    if (def?.spId) {
        _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider' && def.spValId) { const el = document.getElementById(def.spValId); if (el) el.textContent = def.valFmt ? def.valFmt(val) : String(val ?? ''); }
    }
    if (key === 'forceStreaming') {
        const sv = val === true ? 'on' : (val === false ? 'auto' : (val || 'auto'));
        document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(b => b.classList.toggle('active', b.dataset.stream === sv));
        if (!('forceStreaming' in getConversationOverrides())) document.querySelectorAll('.iv-ov-stream-btn').forEach(b => b.classList.toggle('active', b.dataset.stream === sv));
        return;
    }
    if (key === 'connectionSource') { _applyConnectionSourceVisibility(val); return; }
    if (key === 'contextDepth') { const dv = document.getElementById('iv-sp-depth-val'); if (dv) dv.textContent = val ?? 15; }
    if (key in getConversationOverrides()) return;
    if (key.startsWith('charField_')) {
        const ceDef = _CE_FIELDS_DEF.find(d => d.fk === key.replace('charField_', ''));
        if (ceDef) { const el = document.getElementById(ceDef.ovId); if (el) el.checked = !!val; }
        return;
    }
    if (_OV_EL_MAP[key]) _resetOvElToEffective(key);
}

export function updateSettingsUI() {
    const s = getSettings();
    for (const def of _SETTINGS_DEF) {
        const val = _readFromSettings(def);
        if (def.stId) _writeToEl(document.getElementById(def.stId), def, val);
        if (def.spId) _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider') {
            const fmt = def.valFmt ? def.valFmt(val) : String(val ?? '');
            [def.stValId, def.spValId].forEach(id => { if (!id) return; const el = document.getElementById(id); if (el) el.textContent = fmt; });
        }
    }
    for (const ceDef of _CE_FIELDS_DEF) {
        const val = (s.charEditFields || {})[ceDef.fk] !== false;
        if (ceDef.stId) { const el = document.getElementById(ceDef.stId); if (el) el.checked = val; }
        if (ceDef.spId) { const el = document.getElementById(ceDef.spId); if (el) el.checked = val; }
    }

    const fsVal = s.forceStreaming === true ? 'on' : (s.forceStreaming === false ? 'auto' : (s.forceStreaming || 'auto'));
    document.querySelectorAll('#iv-st-stream-auto, #iv-st-stream-on, #iv-st-stream-off').forEach(b => {
        const active = b.dataset.stream === fsVal; b.classList.toggle('active', active);
        b.style.color = active ? 'var(--SmartThemeQuoteColor,#a99bfb)' : ''; b.style.borderColor = active ? 'rgba(124,109,250,0.5)' : ''; b.style.background = active ? 'rgba(124,109,250,0.12)' : '';
    });
    _applyConnectionSourceVisibility(s.connectionSource ?? 'default');
    const agPicker = document.getElementById('iv-ce-alt-greetings-picker');
    if (agPicker) agPicker.style.display = s.charEditFields?.alternate_greetings ? '' : 'none';
    refreshProfilesDropdown(); buildThemeEditor();
    import('../portray.js').then(m => m.syncFireTimePortrayForm());
    import('./ui-window.js').then(m => m._setupBgUpload('iv-bg-upload-btn', 'iv-bg-url', () => _syncBgToOverlay()));
    import('./ui-widgets.js').then(m => m.buildSoundSettingsUI(document.getElementById('iv-sound-settings')));
    import('../features/feature-character-ui.js').then(m => m.refreshAltGreetingsPickers());
}

export function syncSPFromSettings() {
    const s = getSettings(); const ov = getConversationOverrides(); const eff = getEffectiveSettings();
    import('./ui-chat.js').then(m => { if (m.updateDepthSlidersMax) m.updateDepthSlidersMax(); });

    for (const def of _SETTINGS_DEF) {
        if (!def.spId) continue;
        const val = _readFromSettings(def);
        _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider' && def.spValId) { const el = document.getElementById(def.spValId); if (el) el.textContent = def.valFmt ? def.valFmt(val) : String(val ?? ''); }
    }
    for (const ceDef of _CE_FIELDS_DEF) {
        const val = (s.charEditFields || {})[ceDef.fk] !== false;
        const el = document.getElementById(ceDef.spId); if (el) el.checked = val;
    }

    const streamVal = s.forceStreaming === true ? 'on' : (s.forceStreaming === false ? 'auto' : (s.forceStreaming || 'auto'));
    document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(b => { b.classList.toggle('active', b.dataset.stream === streamVal); b.style.color = ''; b.style.borderColor = ''; b.style.background = ''; });
    _applyConnectionSourceVisibility(s.connectionSource ?? 'default');
    refreshSPProfilesDropdown(); updateSPConnProfileList();

    // ── Conversation Override UI ──
    const g  = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    const gC = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    const ovDs = document.getElementById('iv-sp-ov-depth-slider'); const ovDv = document.getElementById('iv-sp-ov-depth-val');
    if (ovDs) ovDs.value = eff.contextDepth ?? 15; if (ovDv) ovDv.textContent = eff.contextDepth ?? 15;

    g('iv-sp-ov-conn-source', eff.connectionSource ?? 'default');
    const ovPg = document.getElementById('iv-sp-ov-profile-group'); const ovCus = document.getElementById('iv-sp-ov-custom-profile-group');
    if (ovPg) ovPg.style.display = eff.connectionSource === 'profile' ? '' : 'none';
    if (ovCus) ovCus.style.display = eff.connectionSource === 'custom' ? '' : 'none';
    g('iv-sp-ov-conn-profile', eff.connectionProfileId ?? '');

    const ovi = (id, key) => { const el = document.getElementById(id); if (el) el.value = key in ov ? (ov[key] ?? '') : ''; };
    ovi('iv-sp-ov-custom-url', 'customUrl'); ovi('iv-sp-ov-custom-key', 'customKey'); ovi('iv-sp-ov-custom-model', 'customModel');
    ovi('iv-sp-ov-max-tokens', 'maxTokens'); ovi('iv-sp-ov-history-limit', 'localHistoryLimit');
    ovi('iv-sp-ov-reasoning-trim', 'reasoningTrimStrings'); ovi('iv-sp-ov-sysprompt', 'systemPrompt');

    gC('iv-sp-ov-include-sysprompt', eff.includeSystemPrompt); gC('iv-sp-ov-include-persona', eff.includeUserPersonality);
    gC('iv-sp-ov-include-alt-swipes', eff.includeAlternateSwipes); gC('iv-sp-ov-apply-regex', eff.applyRegexToContext);

    const ovStreamVal = eff.forceStreaming === true ? 'on' : (eff.forceStreaming === false ? 'auto' : (eff.forceStreaming || 'auto'));
    document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
        const active = b.dataset.stream === ovStreamVal; b.classList.toggle('active', active);
        b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
    });
    for (const ceDef of _CE_FIELDS_DEF) {
        const ovKey = 'charField_' + ceDef.fk;
        const val = ovKey in ov ? !!ov[ovKey] : (s.charEditFields || {})[ceDef.fk] !== false;
        const el = document.getElementById(ceDef.ovId); if (el) el.checked = val;
    }
    const altGrOvEl = document.getElementById('iv-sp-ov-ce-alt-greetings');
    if (altGrOvEl) {
        const picker = document.getElementById('iv-sp-ov-ce-alt-greetings-picker');
        if (picker) picker.style.display = altGrOvEl.checked ? '' : 'none';
        import('../features/feature-character-ui.js').then(m => m.refreshAltGreetingsPickers());
    }
    updateSPOverrideIndicators();
    buildThemeEditor(document.getElementById('iv-sp-theme-section'));
    buildBackgroundSettingsUI(document.getElementById('iv-sp-bg-settings'));
    import('./ui-window.js').then(m => m._setupBgUpload('iv-sp-bg-upload-btn', 'iv-sp-bg-url', () => _syncBgToOverlay()));
    import('../features/feature-memory.js').then(m => m.updateMemoryDot());
}

export function updateSPOverrideIndicators() {
    const ov = getConversationOverrides();
    document.querySelectorAll('.iv-sp-ov-label[data-ovkey]').forEach(l => l.classList.toggle('has-override', l.dataset.ovkey in ov));
    document.querySelectorAll('.iv-sp-ov-clear[data-ovkey]').forEach(btn => {
        const active = btn.dataset.ovkey in ov; btn.classList.toggle('active', active); btn.disabled = !active;
    });
}

export function updateConversationOverrideIndicator() {
    const has = hasConversationOverrides();
    const dot = document.getElementById('iv-sp-override-dot'); if (dot) dot.style.display = has ? '' : 'none';
    const gearDot = document.getElementById('iv-gear-ov-dot'); if (gearDot) gearDot.style.display = has ? '' : 'none';
    document.getElementById('iv-ext-settings-btn')?.classList.toggle('iv-has-overrides', has);
    updateSPOverrideIndicators();
    const info = document.getElementById('iv-sp-footer-info');
    if (info) { const count = Object.keys(getConversationOverrides()).length; info.textContent = count ? `${count} conversation override${count !== 1 ? 's' : ''} active` : ''; }
    const ov = getConversationOverrides(); const hasDepthOv = 'contextDepth' in ov;
    document.getElementById('iv-depth-slider')?.classList.toggle('iv-slider-overridden', hasDepthOv);
    document.getElementById('iv-depth-val')?.classList.toggle('iv-depth-val-overridden', hasDepthOv);
}

// ─── Panel Open/Close ─────────────────────────────────────────────────────────

export function openSettingsPanel() {
    const overlay = document.getElementById('iv-settings-overlay'); if (!overlay) return;
    import('./ui-window.js').then(m => m.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default));
    syncSPFromSettings(); buildThemeEditor(document.getElementById('iv-sp-theme-section')); _updateDirtyDots();
    import('./ui-widgets.js').then(mod => {
        mod.buildSoundSettingsUI(document.getElementById('iv-sp-sound-settings'));
        buildQPSettingsUI(document.getElementById('iv-sp-qp-container'));
        mod.buildQPSetManager(document.getElementById('iv-sp-qp-set-manager'), () => buildQPSettingsUI(document.getElementById('iv-sp-qp-container')));
        const mkPresetMgr = (containerId, getTextId, dictKey) => mod.buildPromptPresetManager(
            document.getElementById(containerId),
            () => document.getElementById(getTextId)?.value || '',
            text => { const ta = document.getElementById(getTextId); if (ta) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); } },
            dictKey
        );
        mkPresetMgr('iv-sp-prompt-preset-manager',      'iv-sp-ov-sysprompt',       undefined);
    }).catch(() => {});
    import('../features/feature-character-ui.js').then(m => m.refreshAltGreetingsPickers());
    overlay.style.display = 'flex'; updateConversationOverrideIndicator();
    bringWindowToFront();
    import('../features/feature-memory.js').then(m => m.updateMemoryDot());
    overlay.querySelectorAll('.iv-sp-tab').forEach(t => t.classList.toggle('active', t.dataset.sptab === 'global'));
    overlay.querySelectorAll('.iv-sp-tab-pane').forEach(p => { p.style.display = p.id === 'iv-sp-pane-global' ? '' : 'none'; });
}

export function closeSettingsPanel() {
    const overlay = document.getElementById('iv-settings-overlay'); if (overlay) overlay.style.display = 'none';
}

// ─── Background Sync Helper ───────────────────────────────────────────────────

export function _syncBgToOverlay() {
    const s = getSettings(); const bgId = s.windowBg || 'none';
    ['iv-sp-bg-type', 'iv-bg-type'].forEach(id => { const el = document.getElementById(id); if (el) el.value = bgId; });
    const dim = s.windowBgDim ?? 50;
    ['iv-sp-bg-dim', 'iv-bg-dim'].forEach(id => { const el = document.getElementById(id); if (el) el.value = dim; });
    ['iv-sp-bg-dim-val', 'iv-bg-dim-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = `${dim}%`; });
}

// ─── Main Setup Functions ─────────────────────────────────────────────────────

export function setupSettingsHandlers() {
    _bindAllSettings();

    // ── forceStreaming button group ──
    document.querySelectorAll('#iv-st-stream-auto, #iv-st-stream-on, #iv-st-stream-off').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; getSettings().forceStreaming = val; saveSettings();
            syncOverlayUI('forceStreaming', val); _markDirty('config');
        });
    });

    // ── Reset buttons ──
    const _resetPrompt = async (key, defaultVal, stId, spId, label) => {
        const ok = await showCustomDialog({ type: 'confirm', title: `Reset ${label}`, message: `Reset to default?` }); if (!ok) return;
        getSettings()[key] = defaultVal === '' ? '' : undefined; if (defaultVal !== '') getSettings()[key] = defaultVal;
        saveSettings(); _markDirty('config');
        const displayVal = defaultVal || (key === 'memoryManagePrompt' ? DEFAULT_MEMORY_PROMPT : DEFAULT_SYSTEM_PROMPT);
        [stId, spId].forEach(id => { const el = document.getElementById(id); if (el) el.value = displayVal; });
        import('./ui-chat.js').then(m => m.updateMsgCount(getConversation()));
        toastr.success(`${label} reset.`, EXT_DISPLAY);
    };
    document.getElementById('iv-reset-prompt')?.addEventListener('click', () => _resetPrompt('systemPrompt', DEFAULT_SYSTEM_PROMPT, 'iv-sysprompt', 'iv-sp-sysprompt', 'System Prompt'));
    document.getElementById('iv-reset-portray-prompt')?.addEventListener('click', () => _resetPrompt('portrayPrompt', DEFAULT_PORTRAY_PROMPT, 'iv-portray-prompt', 'iv-sp-portray-prompt', 'Portray Prompt'));
    document.getElementById('iv-reset-memory-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset memory prompt to default?' }); if (!ok) return;
        getSettings().memoryManagePrompt = DEFAULT_MEMORY_PROMPT; saveSettings();
        ['iv-memory-prompt', 'iv-sp-memory-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_MEMORY_PROMPT; });
        import('./ui-chat.js').then(m => m.updateMsgCount(getConversation())); toastr.success('Prompt reset.', EXT_DISPLAY);
    });

    // ── Profile management (ST drawer) ──
    document.getElementById('iv-profile-select')?.addEventListener('change', async () => {
        const sel = document.getElementById('iv-profile-select'); const name = sel.value;
        if (isConfigProfileDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Configuration', message: 'You have unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = getSettings().activeProfile || ''; return; }
        }
        if (name) loadProfile(name); updateBindingSection();
    });
    document.getElementById('iv-profile-save')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); let name = sel?.value;
        if (!name) { name = await showCustomDialog({ type: 'prompt', title: 'Save Configuration', message: 'Enter a name for this configuration:', placeholder: 'My Config' }); if (!name?.trim()) return; name = name.trim(); }
        saveProfile(name); refreshProfilesDropdown(); if (sel) sel.value = name;
        updateBindingSection(); toastr.success(`Saved "${name}"`, EXT_DISPLAY); _clearDirty('config');
    });
    document.getElementById('iv-profile-create-new')?.addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Configuration', message: 'Enter a name for the new default profile:', placeholder: 'New Config' }); if (!name?.trim()) return;
        const n = name.trim(); const s = getSettings();
        s.profiles[n] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200 };
        saveSettings(); refreshProfilesDropdown(); loadProfile(n);
        const sel = document.getElementById('iv-profile-select'); if (sel) sel.value = n;
        updateBindingSection(); toastr.success(`Created "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-profile-duplicate')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Duplicate Configuration', message: 'Name for the new profile:', defaultValue: sel.value + ' (Copy)' }); if (!newName?.trim()) return;
        const n = newName.trim(); const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[n] = JSON.parse(JSON.stringify(p)); saveSettings(); refreshProfilesDropdown(); refreshSPProfilesDropdown(); loadProfile(n);
        const newSel = document.getElementById('iv-profile-select'); if (newSel) newSel.value = n;
        updateBindingSection(); toastr.success(`Duplicated as "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-profile-rename')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Configuration', message: 'New name:', defaultValue: sel.value }); if (!newName?.trim() || newName.trim() === sel.value) return;
        const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[newName.trim()] = p; delete s.profiles[sel.value];
        if (s.activeProfile === sel.value) s.activeProfile = newName.trim();
        for (const k in s.profileBindings) { if (s.profileBindings[k] === sel.value) s.profileBindings[k] = newName.trim(); }
        saveSettings(); refreshProfilesDropdown();
        const newSel = document.getElementById('iv-profile-select'); if (newSel) newSel.value = newName.trim();
        updateBindingSection(); toastr.success('Renamed.', EXT_DISPLAY);
    });
    document.getElementById('iv-profile-delete')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); if (Object.keys(s.profiles).length <= 1) { toastr.warning('Cannot delete the last remaining configuration profile.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Configuration', message: `Delete "${sel.value}"?` }); if (!ok) return;
        deleteProfile(sel.value); refreshProfilesDropdown(); updateBindingSection(); toastr.success('Deleted.', EXT_DISPLAY);
    });
    document.getElementById('iv-bind-char')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId } = getBindingKey(); const key = `char_${charId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        _dbgAdd(s.profileBindings[key] ? 'PROFILE_BIND' : 'PROFILE_UNBIND', { target: 'char', profile: sel.value }); saveSettings(); updateBindingSection();
    });
    document.getElementById('iv-bind-chat')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId, chatId } = getBindingKey(); const key = `chat_${charId}_${chatId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        _dbgAdd(s.profileBindings[key] ? 'PROFILE_BIND' : 'PROFILE_UNBIND', { target: 'chat', profile: sel.value }); saveSettings(); updateBindingSection();
    });

    // ── Misc buttons ──
    document.getElementById('iv-open-window')?.addEventListener('click', () => import('./ui-window.js').then(m => m.showWindow()));
    document.getElementById('iv-download-debug')?.addEventListener('click', () => import('../utils/util-debug.js').then(m => m.dbgDownload()));
    document.getElementById('iv-open-memory-settings')?.addEventListener('click', () => { openSettingsPanel(); setTimeout(() => document.querySelector('[data-sptab="memory"]')?.click(), 80); });
    document.getElementById('iv-open-tools-settings')?.addEventListener('click', () => { openSettingsPanel(); setTimeout(() => document.querySelector('[data-sptab="tools"]')?.click(), 80); });
    document.getElementById('iv-clear-conversation')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Clear Conversation', message: 'Delete the whole inner conversation for this chat? This cannot be undone.', delayConfirm: 3 }); if (!ok) return;
        const { charId, chatId } = getBindingKey();
        _dbgAdd('CONVERSATION_CLEAR_REQUESTED', { source: 'st-drawer', charId, chatId });
        try {
            await initConversation({ forceReset: true });
            _dbgAdd('CONVERSATION_CLEAR_DONE', { source: 'st-drawer', charId, chatId });
        } catch (e) {
            _dbgAdd('CONVERSATION_CLEAR_FAILED', { source: 'st-drawer', charId, chatId, error: e?.message || String(e), stack: e?.stack });
            toastr.error(`Failed to clear the inner conversation: ${e.message}`, EXT_DISPLAY);
            return;
        }
        import('./ui-chat.js').then(m => m.onChatChanged());
        toastr.success('Inner conversation cleared.', EXT_DISPLAY);
    });

    // ── Background (ST) ──
    buildBackgroundSettingsUI(document.getElementById('iv-bg-settings'));
    import('./ui-window.js').then(m => m._setupBgUpload('iv-bg-upload-btn', 'iv-bg-url', () => _syncBgToOverlay()));

    refreshProfilesDropdown();
}

export function setupSettingsPanelListeners() {
    const overlay = document.getElementById('iv-settings-overlay'); if (!overlay) return;

    document.getElementById('iv-sp-close')?.addEventListener('click', () => closeSettingsPanel());
    let _spMD = null;
    overlay.addEventListener('mousedown', e => { _spMD = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _spMD === overlay) closeSettingsPanel(); });

    // ── Tab switching ──
    overlay.querySelectorAll('.iv-sp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.iv-sp-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
            const pane = tab.dataset.sptab;
            overlay.querySelectorAll('.iv-sp-tab-pane').forEach(p => { p.style.display = p.id === `iv-sp-pane-${pane}` ? '' : 'none'; });
            if (pane === 'memory') import('../features/feature-memory.js').then(m => m.setupMemorySettingsUI());
            if (pane === 'tools') {
                import('../features/feature-tools-ui.js').then(m => m.setupToolsSettingsUI());
            }
        });
    });

    // ── SP forceStreaming ──
    document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; getSettings().forceStreaming = val; saveSettings();
            syncOverlayUI('forceStreaming', val); _markDirty('config');
        });
    });

    // ── SP Profile management ──
    document.getElementById('iv-sp-profile-select')?.addEventListener('change', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        if (isConfigProfileDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Configuration', message: 'Unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = getSettings().activeProfile || ''; return; }
        }
        loadProfile(sel.value); syncSPFromSettings(); updateSettingsUI(); updateSPBindingSection();
    });
    document.getElementById('iv-sp-profile-save')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); let name = sel?.value;
        if (!name) { name = await showCustomDialog({ type: 'prompt', title: 'Save Configuration', message: 'Profile name:', placeholder: 'My Config' }); if (!name?.trim()) return; name = name.trim(); }
        saveProfile(name); refreshSPProfilesDropdown(); refreshProfilesDropdown(); if (sel) sel.value = name;
        updateSPBindingSection(); toastr.success(`Saved "${name}"`, EXT_DISPLAY); _clearDirty('config');
    });
    document.getElementById('iv-sp-profile-create')?.addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Configuration', message: 'Name:', placeholder: 'New Config' }); if (!name?.trim()) return;
        const n = name.trim(); const s = getSettings();
        s.profiles[n] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown(); loadProfile(n); syncSPFromSettings(); updateSettingsUI();
        const sel = document.getElementById('iv-sp-profile-select'); if (sel) sel.value = n;
        updateSPBindingSection(); toastr.success(`Created "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-duplicate')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Duplicate Configuration', message: 'Name for the new profile:', defaultValue: sel.value + ' (Copy)' }); if (!newName?.trim()) return;
        const n = newName.trim(); const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[n] = JSON.parse(JSON.stringify(p)); saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown(); loadProfile(n); syncSPFromSettings(); updateSettingsUI();
        const newSel = document.getElementById('iv-sp-profile-select'); if (newSel) newSel.value = n;
        updateSPBindingSection(); toastr.success(`Duplicated as "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-rename')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename', message: 'New name:', defaultValue: sel.value }); if (!newName?.trim() || newName.trim() === sel.value) return;
        const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[newName.trim()] = p; delete s.profiles[sel.value];
        if (s.activeProfile === sel.value) s.activeProfile = newName.trim();
        for (const k in s.profileBindings) { if (s.profileBindings[k] === sel.value) s.profileBindings[k] = newName.trim(); }
        saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown();
        const newSel = document.getElementById('iv-sp-profile-select'); if (newSel) newSel.value = newName.trim();
        updateSPBindingSection(); toastr.success('Renamed.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-delete')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); if (Object.keys(s.profiles).length <= 1) { toastr.warning('Cannot delete the last profile.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Profile', message: `Delete "${sel.value}"?` }); if (!ok) return;
        deleteProfile(sel.value); refreshSPProfilesDropdown(); refreshProfilesDropdown(); updateSPBindingSection(); toastr.success('Deleted.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-bind-char')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId } = getBindingKey(); const key = `char_${charId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        saveSettings(); updateSPBindingSection(); document.getElementById('iv-sp-bind-char')?.classList.toggle('active', s.profileBindings[key] === sel.value);
    });
    document.getElementById('iv-sp-bind-chat')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId, chatId } = getBindingKey(); const key = `chat_${charId}_${chatId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        saveSettings(); updateSPBindingSection(); document.getElementById('iv-sp-bind-chat')?.classList.toggle('active', s.profileBindings[key] === sel.value);
    });

    // ── SP conn profile ──
    document.getElementById('iv-sp-conn-profile')?.addEventListener('change', e => {
        getSettings().connectionProfileId = e.target.value; saveSettings(); syncOverlayUI('connectionProfileId', e.target.value); _markDirty('config');
    });

    // ── SP Reset buttons ──
    document.getElementById('iv-sp-reset-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset System Prompt', message: 'Reset to default?' }); if (!ok) return;
        getSettings().systemPrompt = DEFAULT_SYSTEM_PROMPT; saveSettings();
        ['iv-sp-sysprompt', 'iv-sysprompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_SYSTEM_PROMPT; });
        import('./ui-chat.js').then(m => m.updateMsgCount(getConversation())); toastr.success('System prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-reset-portray-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Portray Prompt', message: 'Reset to default?' }); if (!ok) return;
        getSettings().portrayPrompt = DEFAULT_PORTRAY_PROMPT; saveSettings();
        ['iv-sp-portray-prompt', 'iv-portray-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_PORTRAY_PROMPT; });
        toastr.success('Portray prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-reset-memory-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset memory prompt to default?' }); if (!ok) return;
        getSettings().memoryManagePrompt = DEFAULT_MEMORY_PROMPT; saveSettings();
        ['iv-sp-memory-prompt', 'iv-memory-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_MEMORY_PROMPT; });
        toastr.success('Prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-tools-reset')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset tools prompt to default?' }); if (!ok) return;
        getSettings().toolsSystemPrompt = DEFAULT_TOOLS_PROMPT; saveSettings();
        const ta = document.getElementById('iv-sp-tools-prompt'); if (ta) ta.value = DEFAULT_TOOLS_PROMPT;
        toastr.success('Tools prompt reset.', EXT_DISPLAY);
    });

    // ── Misc SP ──
    document.getElementById('iv-sp-open-changelog')?.addEventListener('click', () => { closeSettingsPanel(); import('./ui-widgets.js').then(m => m.openChangelog()); });
    document.getElementById('iv-sp-download-debug')?.addEventListener('click', () => import('../utils/util-debug.js').then(m => m.dbgDownload()));
    document.getElementById('iv-sp-clear-conversation')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Clear Conversation', message: 'Delete the whole inner conversation for this chat? This cannot be undone.', delayConfirm: 3 }); if (!ok) return;
        const { charId, chatId } = getBindingKey();
        _dbgAdd('CONVERSATION_CLEAR_REQUESTED', { source: 'settings-overlay', charId, chatId });
        try {
            await initConversation({ forceReset: true });
            _dbgAdd('CONVERSATION_CLEAR_DONE', { source: 'settings-overlay', charId, chatId });
            import('./ui-chat.js').then(m => m.onChatChanged());
            toastr.success('Inner conversation cleared.', EXT_DISPLAY);
        } catch (e) {
            _dbgAdd('CONVERSATION_CLEAR_FAILED', { source: 'settings-overlay', charId, chatId, error: e?.message || String(e), stack: e?.stack });
            toastr.error(`Failed to clear the inner conversation: ${e.message}`, EXT_DISPLAY);
        }
    });
    document.getElementById('iv-sp-reset-all-overrides')?.addEventListener('click', async () => {
        if (!hasConversationOverrides()) { toastr.info('No conversation overrides active.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Conversation Overrides', message: 'Clear all setting overrides for this inner conversation?' }); if (!ok) return;
        clearAllConversationOverrides(); syncSPFromSettings();
        import('./ui-chat.js').then(m => m.updateMsgCount(getConversation())); toastr.success('Conversation overrides cleared.', EXT_DISPLAY);
    });

    // ── Conversation Override bindings ──
    const bindOv = (id, key, isCheckbox = false, toVal = null) => {
        const el = document.getElementById(id); if (!el) return;
        el.addEventListener(isCheckbox ? 'change' : 'input', () => {
            const raw = isCheckbox ? el.checked : el.value;
            _syncOvToGlobal(key, (raw === '' || raw === undefined) ? undefined : (toVal ? toVal(raw) : raw));
        });
    };
    const bindOvSel = (id, key) => { const el = document.getElementById(id); if (!el) return; el.addEventListener('change', () => _syncOvToGlobal(key, el.value || undefined)); };

    const ovDs = document.getElementById('iv-sp-ov-depth-slider'); const ovDv = document.getElementById('iv-sp-ov-depth-val');
    if (ovDs) { ovDs.addEventListener('input', () => { if (ovDv) ovDv.textContent = ovDs.value; }); ovDs.addEventListener('change', () => _syncOvToGlobal('contextDepth', parseInt(ovDs.value))); }

    document.getElementById('iv-sp-ov-conn-source')?.addEventListener('change', e => {
        _syncOvToGlobal('connectionSource', e.target.value);
        const pg = document.getElementById('iv-sp-ov-profile-group'); const cg = document.getElementById('iv-sp-ov-custom-profile-group');
        if (pg) pg.style.display = e.target.value === 'profile' ? '' : 'none';
        if (cg) cg.style.display = e.target.value === 'custom' ? '' : 'none';
        if (e.target.value === 'profile') updateSPConnProfileList();
    });
    bindOv('iv-sp-ov-custom-url', 'customUrl'); bindOv('iv-sp-ov-custom-key', 'customKey'); bindOv('iv-sp-ov-custom-model', 'customModel');
    bindOvSel('iv-sp-ov-conn-profile', 'connectionProfileId');
    bindOv('iv-sp-ov-max-tokens', 'maxTokens', false, Number); bindOv('iv-sp-ov-history-limit', 'localHistoryLimit', false, Number);
    bindOv('iv-sp-ov-reasoning-trim', 'reasoningTrimStrings');
    document.getElementById('iv-sp-ov-sysprompt')?.addEventListener('input', e => _syncOvToGlobal('systemPrompt', e.target.value || undefined));
    bindOv('iv-sp-ov-include-sysprompt',  'includeSystemPrompt',     true);
    bindOv('iv-sp-ov-include-persona',    'includeUserPersonality',   true);
    bindOv('iv-sp-ov-include-alt-swipes', 'includeAlternateSwipes',   true);
    bindOv('iv-sp-ov-apply-regex',        'applyRegexToContext',      true);

    _CE_FIELDS_DEF.forEach(ceDef => {
        bindOv(ceDef.ovId, 'charField_' + ceDef.fk, true);
        if (ceDef.altGreetingPicker) {
            document.getElementById(ceDef.ovId)?.addEventListener('change', e => {
                const picker = document.getElementById('iv-sp-ov-ce-alt-greetings-picker');
                if (picker) picker.style.display = e.target.checked ? '' : 'none';
                import('../features/feature-character-ui.js').then(m => m.refreshAltGreetingsPickers());
            });
        }
    });

    // Override streaming buttons
    document.querySelectorAll('.iv-ov-stream-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; _syncOvToGlobal('forceStreaming', val);
            document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
                const active = b.dataset.stream === val; b.classList.toggle('active', active);
                b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
            });
        });
    });

    // Override clear buttons
    document.querySelectorAll('.iv-sp-ov-clear[data-ovkey]').forEach(btn => {
        btn.addEventListener('click', () => {
            setConversationOverride(btn.dataset.ovkey, undefined);
            _resetOvElToEffective(btn.dataset.ovkey);
            updateSPOverrideIndicators();
            import('./ui-chat.js').then(m => m.updateMsgCount(getConversation()));
        });
    });

    // ── SP background ──
    import('./ui-window.js').then(m => m._setupBgUpload('iv-sp-bg-upload-btn', 'iv-sp-bg-url', () => _syncBgToOverlay()));
}

// ─── Background Settings UI ───────────────────────────────────────────────────

export function buildBackgroundSettingsUI(container) {
    if (!container) return;
    container.innerHTML = '';
    const s = getSettings(); if (!s.customBackgrounds) s.customBackgrounds = {};
    const isSP = container.id === 'iv-sp-bg-settings';

    const mkRow = () => { const d = document.createElement('div'); d.className = isSP ? 'iv-sp-field' : ''; return d; };
    const mkLbl = text => { const l = document.createElement(isSP ? 'label' : 'b'); l.className = isSP ? 'iv-sp-label' : ''; if (!isSP) l.style.cssText = 'font-size:11px;color:#888;display:block;margin-bottom:4px'; l.textContent = text; return l; };
    const mkBtn = (icon, label, cls, cb) => { const b = document.createElement('button'); b.className = isSP ? `iv-action-btn${cls ? ' '+cls : ''}` : 'menu_button interactable'; b.innerHTML = `<i class="fa-solid fa-${icon}"></i><span>${label}</span>`; if (!isSP) b.style.flex = '1'; b.addEventListener('click', cb); return b; };

    const typeRow = mkRow(); const typeLbl = mkLbl('Background Type');
    const typeWrap = document.createElement('div'); typeWrap.style.cssText = 'display:flex;gap:6px;align-items:center';
    const typeSel = document.createElement('select'); typeSel.className = isSP ? 'iv-sp-select text_pole' : 'text_pole'; typeSel.style.flex = '1';

    const renderDropdown = () => {
        typeSel.innerHTML = '<option value="none">None</option>';
        if (Object.keys(s.customBackgrounds).length) {
            const grp = document.createElement('optgroup'); grp.label = 'Custom Backgrounds';
            for (const [key, bg] of Object.entries(s.customBackgrounds)) { const o = document.createElement('option'); o.value = key; o.textContent = bg.name; grp.appendChild(o); }
            typeSel.appendChild(grp);
        }
        typeSel.value = s.windowBg || 'none';
    };
    renderDropdown();
    typeWrap.appendChild(typeSel); typeRow.appendChild(typeLbl); typeRow.appendChild(typeWrap); container.appendChild(typeRow);

    const actWrap = document.createElement('div'); actWrap.style.cssText = isSP ? 'display:flex;gap:6px;margin-top:6px' : 'display:flex;gap:6px;margin-top:6px;align-items:center';
    const rebuildAll = () => { [document.getElementById('iv-bg-settings'), document.getElementById('iv-sp-bg-settings')].filter(Boolean).forEach(c => buildBackgroundSettingsUI(c)); import('./ui-window.js').then(m => m.applyWindowBackground()); };

    actWrap.appendChild(mkBtn('upload', 'Upload', '', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm';
        inp.onchange = async () => {
            const file = inp.files?.[0]; if (!file) return;
            if (file.size > 25 * 1024 * 1024) { toastr.warning('File too large (>25MB).', EXT_DISPLAY); return; }
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(null); r.readAsDataURL(file); });
            if (!dataUrl) return;
            const s2 = getSettings(); const id = 'bg_' + Date.now();
            s2.customBackgrounds[id] = { name: file.name, dataUrl, isVideo: file.type.startsWith('video/'), fit: 'cover' }; s2.windowBg = id; saveSettings(); rebuildAll();
        };
        inp.click();
    }));
    actWrap.appendChild(mkBtn('link', 'URL', '', async () => {
        const url = await showCustomDialog({ type: 'prompt', title: 'Add Background', message: 'Enter direct URL to image or video:', placeholder: 'https://...' });
        if (url?.trim()) {
            const s2 = getSettings(); const id = 'bg_' + Date.now();
            s2.customBackgrounds[id] = { name: 'URL Background', dataUrl: url.trim(), isVideo: url.endsWith('.mp4') || url.endsWith('.webm'), fit: 'cover' }; s2.windowBg = id; saveSettings(); rebuildAll();
        }
    }));
    actWrap.appendChild(mkBtn('pen', 'Rename', '', async () => {
        const val = typeSel.value; if (val === 'none') return;
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Background', message: 'New name:', defaultValue: s.customBackgrounds[val]?.name });
        if (newName?.trim()) { s.customBackgrounds[val].name = newName.trim(); saveSettings(); rebuildAll(); }
    }));
    actWrap.appendChild(mkBtn('trash', 'Delete', isSP ? 'iv-sp-danger-btn' : '', async () => {
        const val = typeSel.value; if (val === 'none') return;
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Background', message: 'Delete this background?' }); if (!ok) return;
        const s2 = getSettings(); delete s2.customBackgrounds[val]; s2.windowBg = 'none'; saveSettings(); rebuildAll();
    }));
    container.appendChild(actWrap);

    const extraWrap = document.createElement('div'); extraWrap.style.marginTop = '12px';
    const fitRow = mkRow(); const fitLbl = mkLbl('Image/Video Fit');
    const fitSel = document.createElement('select'); fitSel.className = isSP ? 'iv-sp-select text_pole' : 'text_pole'; fitSel.id = isSP ? 'iv-sp-fit-sel' : 'iv-fit-sel';
    ['cover','contain','fill','center'].forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; fitSel.appendChild(o); });
    fitSel.value = s.customBackgrounds[s.windowBg]?.fit || 'cover';
    fitSel.addEventListener('change', () => { if (s.windowBg !== 'none' && s.customBackgrounds[s.windowBg]) { s.customBackgrounds[s.windowBg].fit = fitSel.value; saveSettings(); import('./ui-window.js').then(m => m.applyWindowBackground()); } });
    fitRow.appendChild(fitLbl); fitRow.appendChild(fitSel); extraWrap.appendChild(fitRow);

    const dimRow = mkRow(); dimRow.style.marginTop = '8px'; const dimLbl = mkLbl('Darkness Overlay');
    const dimFlex = document.createElement('div'); dimFlex.className = isSP ? 'iv-sp-row' : ''; if (!isSP) dimFlex.style.cssText = 'display:flex;align-items:center;gap:10px';
    const dimSlider = document.createElement('input'); dimSlider.type = 'range'; dimSlider.min = '0'; dimSlider.max = '100'; dimSlider.className = isSP ? 'iv-slider' : 'neo-range-slider'; dimSlider.style.flex = '1'; dimSlider.value = s.windowBgDim ?? 50;
    const dimVal = document.createElement('span'); dimVal.style.cssText = isSP ? 'min-width:32px;text-align:right;font-size:11px;color:var(--iv-accent)' : 'font-size:12px;min-width:34px;text-align:right;color:var(--SmartThemeQuoteColor,#a99bfb)'; dimVal.textContent = `${dimSlider.value}%`;
    dimSlider.addEventListener('input', () => { dimVal.textContent = `${dimSlider.value}%`; });
    dimSlider.addEventListener('change', () => { getSettings().windowBgDim = parseInt(dimSlider.value); saveSettings(); import('./ui-window.js').then(m => m.applyWindowBackground()); _syncBgToOverlay(); });
    dimFlex.appendChild(dimSlider); dimFlex.appendChild(dimVal); dimRow.appendChild(dimLbl); dimRow.appendChild(dimFlex); extraWrap.appendChild(dimRow);
    container.appendChild(extraWrap);

    const updateVis = () => { const isNone = typeSel.value === 'none'; extraWrap.style.display = isNone ? 'none' : 'block'; };
    updateVis();
    typeSel.addEventListener('change', () => { getSettings().windowBg = typeSel.value; saveSettings(); updateVis(); rebuildAll(); });
}

// ─── Quick Prompts Settings UI ────────────────────────────────────────────────

export function buildQPSettingsUI(container) {
    if (!container) return;
    container.innerHTML = '';
    const list = document.createElement('div'); list.className = 'iv-qp-settings-list';

    const renderList = () => {
        list.innerHTML = '';
        const prompts = getSettings().quickPrompts || [];
        if (!prompts.length) { list.innerHTML = `<div style="font-size:11px;color:var(--iv-text-muted);text-align:center;padding:10px 0">No quick prompts yet. Add one below.</div>`; }
        prompts.forEach((qp, idx) => {
            const row = document.createElement('div'); row.className = 'iv-qp-settings-row';
            const iconBtn = document.createElement('button'); iconBtn.className = 'iv-qp-settings-icon-btn'; iconBtn.textContent = qp.icon || '⚡'; iconBtn.title = 'Change icon';
            import('./ui-widgets.js').then(mod => {
                iconBtn.addEventListener('click', e => { e.stopPropagation(); mod.showQPIconPicker(iconBtn, qp.icon || '⚡', emoji => { getSettings().quickPrompts[idx].icon = emoji; saveSettings(); iconBtn.textContent = emoji; mod.renderQuickPromptsBar(); }); });
            });
            const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.className = 'iv-qp-settings-label-input iv-sp-input'; labelInput.placeholder = 'Label'; labelInput.value = qp.label || '';
            labelInput.addEventListener('input', () => { getSettings().quickPrompts[idx].label = labelInput.value; saveSettings(); import('./ui-widgets.js').then(m => m.renderQuickPromptsBar()); });
            const moveUpBtn = document.createElement('button'); moveUpBtn.className = 'iv-qp-settings-move'; moveUpBtn.textContent = '↑'; moveUpBtn.title = 'Move up'; moveUpBtn.disabled = idx === 0;
            moveUpBtn.addEventListener('click', () => { if (idx === 0) return; const arr = getSettings().quickPrompts; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; saveSettings(); renderList(); import('./ui-widgets.js').then(m => m.renderQuickPromptsBar()); });
            const moveDnBtn = document.createElement('button'); moveDnBtn.className = 'iv-qp-settings-move'; moveDnBtn.textContent = '↓'; moveDnBtn.title = 'Move down'; moveDnBtn.disabled = idx === prompts.length - 1;
            moveDnBtn.addEventListener('click', () => { const arr = getSettings().quickPrompts; if (idx >= arr.length - 1) return; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; saveSettings(); renderList(); import('./ui-widgets.js').then(m => m.renderQuickPromptsBar()); });
            const delBtn = document.createElement('button'); delBtn.className = 'iv-qp-settings-del'; delBtn.innerHTML = I.trash; delBtn.title = 'Delete';
            delBtn.addEventListener('click', async () => { const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Prompt', message: `Delete "${qp.label || 'this prompt'}"?` }); if (!ok) return; getSettings().quickPrompts.splice(idx, 1); saveSettings(); renderList(); import('./ui-widgets.js').then(m => m.renderQuickPromptsBar()); });
            const textArea = document.createElement('textarea'); textArea.className = 'iv-qp-settings-text iv-sp-textarea'; textArea.placeholder = 'Prompt text… (supports {{user}}, {{char}} macros)'; textArea.rows = 2; textArea.value = qp.text || '';
            textArea.addEventListener('input', () => { getSettings().quickPrompts[idx].text = textArea.value; saveSettings(); });
            const controls = document.createElement('div'); controls.className = 'iv-qp-settings-controls'; controls.appendChild(moveUpBtn); controls.appendChild(moveDnBtn); controls.appendChild(delBtn);
            const top = document.createElement('div'); top.className = 'iv-qp-settings-row-top'; top.appendChild(iconBtn); top.appendChild(labelInput); top.appendChild(controls);
            row.appendChild(top); row.appendChild(textArea); list.appendChild(row);
        });
    };
    renderList();

    const addBtn = document.createElement('button'); addBtn.className = 'iv-action-btn'; addBtn.style.marginTop = '8px'; addBtn.innerHTML = `${I.plus}<span>Add Prompt</span>`;
    addBtn.addEventListener('click', async () => {
        const label = await showCustomDialog({ type: 'prompt', title: 'New Quick Prompt', message: 'Label for this prompt:', placeholder: 'My Prompt' }); if (label === null) return;
        getSettings().quickPrompts.push({ id: 'qp_'+Date.now(), label: label.trim() || 'Prompt', icon: '⚡', text: '' }); saveSettings(); renderList(); import('./ui-widgets.js').then(m => m.renderQuickPromptsBar());
    });
    container.appendChild(list); container.appendChild(addBtn);
}