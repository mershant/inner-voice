import { EXT_DISPLAY, CHANGELOG, I, WIN_ID, ICON_ID, MODAL_ID, ICON_STORAGE_KEY } from './constants.js';
import { state } from './state.js';
import { getSettings, saveSettings, getConversation } from './conversation.js';
import { _dbgSetupGlobalErrorHandlers, _dbgSnapshotSettings } from './utils/util-debug.js';
import { autoResize, copyText } from './utils/util-dom.js';

import { restoreWindowState, hideWindow, minimize, toggleVisibility, makeDraggable, makeResizable, makeIconDraggable, updateIconVisibility, toggleGhostMode, setupGhostHotkey, setupHotkey, bringWindowToFront } from './ui/ui-window.js';
import { setupSettingsPanelListeners, setupSettingsHandlers, updateSettingsUI, updateProfilesList, updateSPConnProfileList, _takeProfileSnapshot, openSettingsPanel, syncOverlayUI } from './ui/ui-settings.js';
import { updateMemoryDot } from './features/feature-memory.js';
import { setupChatPickerListeners, onChatChanged, updateDepthSlidersMax, renderConversation, openSearch, navigateSearch, performSearch, closeSearch, openChatPicker, toggleSearchWholeWord, setupDepthClickEdit, updateMsgCount, setupSearchHotkey, setupMessagesScrollTracking, setupMainChatHideListener, syncExchangeHiddenUi } from './ui/ui-chat.js';
import { checkChangelogAutoShow, setupChangelogListeners, openInspector, renderQuickPromptsBar } from './ui/ui-widgets.js';

import * as apiMod from './api.js';
import { syncSimulationView } from './simulation-view.js';

export let extVersion = '?';
export let __extPath = null;

{
    const match = new URL(import.meta.url).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
    if (match) __extPath = decodeURIComponent(match[1]);
}

async function loadManifestVersion() {
    try {
        const res = await fetch(`/scripts/extensions/${__extPath}/manifest.json`);
        if (res.ok) {
            const manifest = await res.json();
            extVersion = manifest.version || CHANGELOG[0]?.version || '?';
        } else {
            extVersion = CHANGELOG[0]?.version || '?';
        }
    } catch (_) {
        extVersion = CHANGELOG[0]?.version || '?';
    }
}

async function injectUI() {
    const ctx = SillyTavern.getContext();
    const parseTemplate = (html) => {
        if (!html) return '';
        return html.replace(/\$\{I\.([a-zA-Z0-9_]+)\}/g, (_, iconName) => I[iconName] || '');
    };
    const loadAndInject = async (templateName) => {
        const html = await ctx.renderExtensionTemplateAsync(__extPath, templateName);
        if (html) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = parseTemplate(html);
            while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
        } else {
            console.error(`[${EXT_DISPLAY}] Couldn't load HTML: ${templateName}.html`);
        }
    };
    const templates = ['window', 'settings_overlay', 'chat_picker'];
    await Promise.all(templates.map(loadAndInject));

    const iconEl = document.getElementById(ICON_ID);
    if (iconEl && iconEl.parentElement !== document.body) {
        document.body.appendChild(iconEl);
    }
}

function addWandButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('iv-wand-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'iv-wand-btn';
    btn.classList.add('list-group-item', 'flex-container', 'flexGap5');
    btn.innerHTML = `<div class="fa-solid fa-comment-dots extensionsMenuExtensionButton"></div><span>${EXT_DISPLAY}</span>`;
    btn.style.display = getSettings().enabled ? '' : 'none';
    btn.addEventListener('click', () => toggleVisibility());
    menu.appendChild(btn);
}

function attachWindowListeners() {
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById(ICON_ID);
    const modalEl = document.getElementById(MODAL_ID);

    if (windowEl) {
        makeDraggable(document.getElementById('iv-drag-handle'), windowEl);
        makeResizable(windowEl);
    }

    document.addEventListener('pointerdown', e => {
        const win = document.getElementById(WIN_ID);
        if (!win || win.style.display === 'none') {
            state.windowActive = false;
            return;
        }
        const clickedInside = win.contains(e.target) ||
                              e.target.closest('.iv-dialog-overlay') ||
                              document.getElementById('iv-settings-overlay')?.contains(e.target) ||
                              document.getElementById('iv-picker-overlay')?.contains(e.target);
        state.windowActive = !!clickedInside;
    }, true);

    window.addEventListener('resize', () => {
        if (windowEl && windowEl.style.display !== 'none') {
            try {
                const saved = localStorage.getItem('iv-win-pos');
                if (saved) {
                    const { x, y } = JSON.parse(saved);
                    if (x != null) {
                        const r = windowEl.getBoundingClientRect();
                        const maxLeft = Math.max(0, window.innerWidth - r.width);
                        const maxTop = Math.max(0, window.innerHeight - r.height);
                        windowEl.style.left = `${Math.max(0, Math.min(x, maxLeft))}px`;
                        windowEl.style.top = `${Math.max(0, Math.min(y, maxTop))}px`;
                    }
                }
            } catch(e) {}
        }
        if (iconEl && iconEl.style.display !== 'none') {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const iconSize = 46;
            const savedIconPos = localStorage.getItem(ICON_STORAGE_KEY);
            if (savedIconPos) {
                try {
                    const pos = JSON.parse(savedIconPos);
                    const left = parseFloat(pos.left);
                    const top = parseFloat(pos.top);
                    if (!isNaN(left) && !isNaN(top)) {
                        let newLeft = Math.max(0, Math.min(left, vw - iconSize));
                        let newTop = Math.max(0, Math.min(top, vh - iconSize));
                        iconEl.style.left = `${newLeft}px`;
                        iconEl.style.top = `${newTop}px`;
                    }
                } catch(e) {}
            }
        }
    });

    document.getElementById('iv-min-btn')?.addEventListener('click', () => minimize());
    document.getElementById('iv-close-btn')?.addEventListener('click', () => hideWindow());
    document.getElementById('iv-ext-settings-btn')?.addEventListener('click', () => openSettingsPanel());
    if (iconEl) makeIconDraggable(iconEl);

    document.getElementById('iv-ghost-btn')?.addEventListener('click', () => toggleGhostMode());

    // Toolbar actions
    document.getElementById('iv-regen-btn')?.addEventListener('click', () => {
        const conv = getConversation();
        if (!conv.messages.length || state.generating) return;
        let lastUserIdx = -1;
        for (let i = conv.messages.length - 1; i >= 0; i--) { if (conv.messages[i].role === 'user') { lastUserIdx = i; break; } }
        if (lastUserIdx === -1) return;
        const userMsg = conv.messages[lastUserIdx];
        import('./conversation.js').then(m => m.truncateAfter(conv, userMsg.id));
        import('./ui/ui-chat.js').then(m => m.removeMsgElAfter(userMsg.id));
        apiMod.runGenerate(conv, userMsg.content, false);
    });

    document.getElementById('iv-search-btn')?.addEventListener('click', () => { state.searchOpen ? closeSearch() : openSearch(); });
    document.getElementById('iv-pick-btn')?.addEventListener('click', () => openChatPicker());

    document.getElementById('iv-qp-toggle-btn')?.addEventListener('click', () => {
        const s = getSettings(); s.quickPromptsVisible = !s.quickPromptsVisible; saveSettings();
        import('./ui/ui-widgets.js').then(m => m.renderQuickPromptsBar());
    });

    document.getElementById('iv-inspect-btn')?.addEventListener('click', () => openInspector());

    const qpBar = document.getElementById('iv-qp-bar');
    if (qpBar) {
        qpBar.addEventListener('wheel', e => {
            if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
            e.preventDefault();
            const delta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaMode === 2 ? e.deltaY * 200 : e.deltaY;
            qpBar.scrollLeft += delta;
        }, { passive: false });
    }

    document.getElementById('iv-search-close')?.addEventListener('click', () => closeSearch());
    document.getElementById('iv-search-prev')?.addEventListener('click', () => navigateSearch(-1));
    document.getElementById('iv-search-next')?.addEventListener('click', () => navigateSearch(1));
    document.getElementById('iv-search-word')?.addEventListener('click', () => toggleSearchWholeWord());

    const searchInputEl = document.getElementById('iv-search-input');
    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => {
            state.searchQuery = searchInputEl.value;
            clearTimeout(state.searchDebounceId);
            state.searchDebounceId = setTimeout(performSearch, 220);
        });
        searchInputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); navigateSearch(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
        });
    }

    document.getElementById('iv-stop-btn')?.addEventListener('click', () => {
        state.abortController?.abort();
        const { stopGeneration } = SillyTavern.getContext();
        if (typeof stopGeneration === 'function') stopGeneration();
    });

    const inputEl = document.getElementById('iv-input');
    if (inputEl) {
        inputEl.addEventListener('input', () => {
            autoResize(inputEl);
            updateMsgCount(getConversation());
        });
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const isMobile = window.innerWidth <= 900 || ('ontouchstart' in window);
                if (!isMobile) {
                    e.preventDefault();
                    document.getElementById('iv-send-btn')?.click();
                }
            }
        });
    }
    document.getElementById('iv-send-btn')?.addEventListener('click', async () => {
        const rawText = inputEl?.value.trim();
        if (!rawText || state.generating) return;

        const { expandMacros, getEffectiveSettings } = await import('./conversation.js');
        const _s = getEffectiveSettings();
        const text = _s.autoExpandMacros ? expandMacros(rawText || '') : (rawText || '');
        if (inputEl) { inputEl.value = ''; autoResize(inputEl); }

        apiMod.runGenerate(getConversation(), text, true).catch(console.error);
    });

    // Modals
    document.getElementById('iv-modal-close')?.addEventListener('click', () => { if (modalEl) modalEl.style.display = 'none'; });
    let _modalMouseDown = null;
    modalEl?.addEventListener('mousedown', e => { _modalMouseDown = e.target; });
    modalEl?.addEventListener('click', e => { if (e.target === modalEl && _modalMouseDown === modalEl) modalEl.style.display = 'none'; });

    document.querySelectorAll('.iv-modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.iv-modal-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const isFormatted = tab.dataset.tab === 'formatted';
            const isJson = tab.dataset.tab === 'json';

            const fmtEl = document.getElementById('iv-ctx-formatted');
            const jsonEl = document.getElementById('iv-ctx-json');

            if (fmtEl) fmtEl.style.display = isFormatted ? '' : 'none';
            if (jsonEl) jsonEl.style.display = isJson ? '' : 'none';

            setTimeout(() => {
                const targetEl = isJson ? jsonEl : document.getElementById('iv-ctx-body');
                if (targetEl) {
                    const prevBehavior = targetEl.style.scrollBehavior;
                    targetEl.style.scrollBehavior = 'auto';
                    targetEl.scrollTop = targetEl.scrollHeight;
                    targetEl.style.scrollBehavior = prevBehavior;
                }
            }, 0);
        });
    });

    document.getElementById('iv-ctx-copy-btn')?.addEventListener('click', () => {
        const activeTab = document.querySelector('.iv-modal-tab.active');
        if (activeTab?.dataset.tab === 'json') {
            copyText(document.getElementById('iv-ctx-json')?.textContent || '');
        } else {
            import('./ui/ui-widgets.js').then(m => copyText(apiMod.formatPayloadAsText(m._lastInspectorMessages || [])));
        }
    });

    const depthSlider = document.getElementById('iv-depth-slider');
    if (depthSlider) {
        depthSlider.value = getSettings().contextDepth;
        const dv = document.getElementById('iv-depth-val');
        if(dv) dv.textContent = depthSlider.value;

        depthSlider.addEventListener('input', () => {
            const dv = document.getElementById('iv-depth-val');
            if(dv) dv.textContent = depthSlider.value;
        });

        depthSlider.addEventListener('change', () => {
            const val = parseInt(depthSlider.value);
            getSettings().contextDepth = val;
            saveSettings();
            syncOverlayUI('contextDepth', val);
            updateMsgCount(getConversation());
        });
    }
    setupDepthClickEdit();
}

async function init() {
    _dbgSetupGlobalErrorHandlers();

    await loadManifestVersion();

    getSettings();
    _dbgSnapshotSettings();
    await injectUI();

    const ctx = SillyTavern.getContext();
    const container = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (container) {
        try {
            const html = await ctx.renderExtensionTemplateAsync(__extPath, 'settings');
            if (html) container.insertAdjacentHTML('beforeend', html);
        } catch (e) {}
    }

    restoreWindowState(document.getElementById(WIN_ID), document.getElementById(ICON_ID));
    attachWindowListeners();
    setupSettingsHandlers();
    updateSettingsUI();
    setupSettingsPanelListeners();
    setupChatPickerListeners();
    setupChangelogListeners();
    setupSearchHotkey();
    setupGhostHotkey();
    setupHotkey();
    setupMessagesScrollTracking();
    setupMainChatHideListener();

    const s = getSettings();
    const windowEl = document.getElementById(WIN_ID);

    if (s.windowVisible && !s.minimized && windowEl) {
        windowEl.style.display = 'flex';
        state.windowActive = true;
    } else if (windowEl) {
        windowEl.style.display = 'none';
        state.windowActive = false;
    }

    updateIconVisibility(document.getElementById(ICON_ID));
    bringWindowToFront();

    await onChatChanged();
    syncSimulationView();

    const es = ctx.eventSource || window.eventSource;
    const et = ctx.event_types || window.event_types || {};

    if (es) {
        es.on(et.CHAT_CHANGED || 'chat_changed', async () => {
            await onChatChanged();
            renderConversation(getConversation());
            syncSimulationView();
        });
        es.on(et.CHARACTER_SELECTED || 'character_selected', async () => {
            await onChatChanged();
            renderConversation(getConversation());
            syncSimulationView();
        });
        es.on(et.APP_READY || 'app_ready', () => {
            updateProfilesList();
            updateSPConnProfileList();
        });

        const cmEvents = [
            et.CONNECTION_PROFILE_CREATED || 'connection_profile_created',
            et.CONNECTION_PROFILE_UPDATED || 'connection_profile_updated',
            et.CONNECTION_PROFILE_DELETED || 'connection_profile_deleted',
            et.CONNECTION_PROFILE_LOADED || 'connection_profile_loaded'
        ];
        cmEvents.forEach(evt => {
            es.on(evt, () => {
                updateProfilesList();
                updateSPConnProfileList();
            });
        });

        const dynEvents =[
            et.MESSAGE_RECEIVED || 'message_received',
            et.MESSAGE_SENT || 'message_sent',
            et.MESSAGE_DELETED || 'message_deleted',
            et.MESSAGE_UPDATED || 'message_updated',
            et.MESSAGE_SWIPED || 'message_swiped'
        ];

        dynEvents.forEach(e => {
            if (e) es.on(e, () => {
                updateDepthSlidersMax();
                syncSimulationView();
                syncExchangeHiddenUi();
            });
        });

        es.on(et.GENERATION_AFTER_COMMANDS || 'generation_after_commands', () => {
            syncSimulationView();
        });
    }

    addWandButton();
    checkChangelogAutoShow();
    _takeProfileSnapshot();
    updateMemoryDot();

    window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'iv-iframe-h') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try { if (f.contentWindow === e.source) f.style.height = `${Math.max(40, Math.min(1200, e.data.h + 16))}px`; } catch(_) {}
            });
        } else if (e.data.type === 'iv-iframe-bg') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try { if (f.contentWindow === e.source) f.style.background = e.data.hasBg ? 'transparent' : '#ffffff'; } catch(_) {}
            });
        } else if (e.data.type === 'iv-iframe-err') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try {
                    if (f.contentWindow === e.source) {
                        const errEl = f.closest('.iv-html-block')?.querySelector('.iv-html-block-error');
                        if (errEl) { errEl.textContent = `⚠ ${e.data.msg}`; errEl.style.display = ''; }
                    }
                } catch(_) {}
            });
        }
    });

    const preventSpinBug = e => { if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') e.stopPropagation(); };
    [
        windowEl,
        document.getElementById('iv-settings-overlay'),
        document.getElementById('iv-picker-overlay')
    ].filter(Boolean).forEach(el => {
        el.addEventListener('mousedown', preventSpinBug);
        el.addEventListener('pointerdown', preventSpinBug);
    });

    console.log(`[${EXT_DISPLAY}] Initialized.`);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 0);
}
