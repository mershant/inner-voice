import { DEFAULT_TOOLS_PROMPT, TOOL_DEFINITIONS } from '../constants.js';
import { escHtml } from '../utils/util-dom.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { getSettings, saveSettings } from '../session.js';
import { openSettingsPanel } from '../ui/ui-settings.js';

export function createToolCallEl(tc) {
    const item = document.createElement('div');
    item.className = 'iv-tool-call-item iv-inline-tool-call';
    item.dataset.toolId = tc.id;
    const def = TOOL_DEFINITIONS.find(d => d.name === tc.name);
    const iconClass = def?.icon || 'fa-screwdriver-wrench';
    
    const isWarning = tc.status === 'warning';
    const statusClass = tc.status === 'running' ? 'running' : tc.status === 'error' ? 'error' : isWarning ? 'warning' : 'done';
    const statusLabel = tc.status === 'running' ? 'Running' : tc.status === 'error' ? 'Error' : isWarning ? 'Unavailable' : 'Done';
    const colorStyle = isWarning ? 'color: var(--iv-warning, #ffb432);' : '';

    const spinnerHtml = tc.status === 'running' ? '<span class="iv-tool-spin">⟳</span> ' : '';
    const iconHtml = tc.status === 'running'
        ? '<span class="iv-tool-spin" style="font-size:11px">⟳</span>'
        : `<i class="fa-solid ${iconClass}" style="font-size:11px"></i>`;

    item.innerHTML = `<div class="iv-tool-call-header">
<div class="iv-tool-call-icon ${statusClass}" ${isWarning ? `style="${colorStyle}"` : ''}>${iconHtml}</div>
<div class="iv-tool-call-name">${escHtml(def?.label || tc.name)}</div>
<div class="iv-tool-call-status ${statusClass}" ${isWarning ? `style="${colorStyle}"` : ''}>${spinnerHtml}${escHtml(statusLabel)}</div>
<div class="iv-tool-call-chevron">▶</div>
</div>
<div class="iv-tool-call-body">
<div class="iv-tool-call-section-label">Input</div>
<pre class="iv-tool-call-args">${escHtml(JSON.stringify(tc.input, null, 2))}</pre>
${tc.result !== undefined ? `<div class="iv-tool-call-section-label" style="margin-top:8px">Result</div><pre class="iv-tool-call-result${tc.status === 'error' ? ' error-result' : ''}" ${isWarning ? `style="${colorStyle}"` : ''}>${escHtml(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2))}</pre>` : ''}
</div>`;
    item.querySelector('.iv-tool-call-header').addEventListener('click', () => {
        const isOpen = !item.classList.contains('open');
        _dbgAdd('TOOL_CALL_HEADER_TOGGLE', { toolId: tc.id, open: isOpen });
        item.classList.toggle('open');
    });
    return item;
}

export function postProcessToolCalls(containerEl, toolCalls) {
    if (!toolCalls || !toolCalls.length) return;
    containerEl.querySelectorAll('.iv-tool-call-ph').forEach((ph) => {
        const idx = parseInt(ph.dataset.tcid, 10);
        const tc = toolCalls[idx];
        if (tc) ph.replaceWith(createToolCallEl(tc));
    });

    const allTCs = [...containerEl.querySelectorAll('.iv-inline-tool-call')];
    allTCs.forEach(tc => tc.classList.remove('iv-tc-chain-start','iv-tc-chain-mid','iv-tc-chain-end'));
    
    let i = 0;
    while (i < allTCs.length) {
        let end = i;
        while (end + 1 < allTCs.length) {
            let sib = allTCs[end].nextSibling;
            while (sib && ((sib.nodeType === Node.TEXT_NODE && !sib.textContent.trim()) || sib.tagName === 'BR')) {
                sib = sib.nextSibling;
            }
            if (sib === allTCs[end + 1]) end++; else break;
        }
        if (end > i) {
            for (let j = i; j <= end; j++) {
                if (j === i) allTCs[j].classList.add('iv-tc-chain-start');
                else if (j === end) allTCs[j].classList.add('iv-tc-chain-end');
                else allTCs[j].classList.add('iv-tc-chain-mid');
            }
        } else {
            allTCs[i].classList.add('iv-tc-chain-start', 'iv-tc-chain-end');
        }
        i = end + 1;
    }
}

export function setupToolsSettingsUI() {
    const s = getSettings();
    const listEl = document.getElementById('iv-sp-tools-list');
    if (!listEl) return;
    
    const ta = document.getElementById('iv-sp-tools-prompt');
    if (ta) {
        ta.value = s.toolsSystemPrompt || ''; 
        ta.addEventListener('input', () => { getSettings().toolsSystemPrompt = ta.value; saveSettings(); });
    }
    
    document.getElementById('iv-sp-tools-reset')?.addEventListener('click', () => {
        getSettings().toolsSystemPrompt = DEFAULT_TOOLS_PROMPT; saveSettings();
        if (ta) ta.value = DEFAULT_TOOLS_PROMPT;
    });

    const setC = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setC('iv-sp-tools-enabled', s.toolsEnabled);
    setV('iv-sp-tools-max-rounds', s.toolsMaxRounds ?? 5);

    document.getElementById('iv-sp-tools-enabled')?.addEventListener('change', e => {
        getSettings().toolsEnabled = e.target.checked; saveSettings();
        const stEl = document.getElementById('iv-tools-enabled'); if (stEl) stEl.checked = e.target.checked;
    });
    document.getElementById('iv-sp-tools-max-rounds')?.addEventListener('input', e => {
        getSettings().toolsMaxRounds = parseInt(e.target.value) || 5; saveSettings();
    });

    const streamingOff = s.forceStreaming === 'off';

    listEl.innerHTML = '';
    for (const tool of TOOL_DEFINITIONS) {
        const row = document.createElement('div');
        row.className = 'iv-tool-toggle-row';
        const isEnabled = s[tool.settingKey] !== false;
        const isAskUser = tool.id === 'ask_user';
        const isDisabledByStream = isAskUser && streamingOff;
        const iconHtml = `<i class="fa-solid ${tool.icon}" style="width:13px;text-align:center;margin-right:4px;opacity:.7"></i>`;
        row.innerHTML = `<label class="iv-sp-check" style="flex:1${isDisabledByStream ? ';opacity:.45;pointer-events:none' : ''}"><input type="checkbox" id="iv-sp-tool-${tool.id}" ${isEnabled && !isDisabledByStream ? 'checked' : ''} ${isDisabledByStream ? 'disabled' : ''}><span class="iv-tool-toggle-name">${iconHtml}${escHtml(tool.label)}</span></label>`;
        const descEl = document.createElement('div');
        descEl.className = 'iv-tool-toggle-desc';
        descEl.style.cssText = 'font-size:10px;color:var(--iv-text-muted);margin-top:2px;padding-left:20px';
        descEl.textContent = isDisabledByStream ? '⚠ Unavailable — requires streaming to be enabled (not "Force Off")' : tool.description;
        if (isDisabledByStream) descEl.style.color = 'var(--iv-danger)';
        row.appendChild(descEl);
        if (!isDisabledByStream) {
            row.querySelector(`#iv-sp-tool-${tool.id}`)?.addEventListener('change', e => {
                getSettings()[tool.settingKey] = e.target.checked; saveSettings();
            });
        }
        listEl.appendChild(row);
    }

    document.getElementById('iv-open-tools-settings')?.addEventListener('click', () => {
        openSettingsPanel();
        setTimeout(() => {
            const tab = document.querySelector('[data-sptab="tools"]');
            if (tab) tab.click();
        }, 80);
    });
}

let askUserResolve = null;

export async function executeAskUser(input, msgEl) {
    const question = input.question || 'Do you have any additional information?';
    const context = input.context || '';
    return new Promise(resolve => {
        askUserResolve = resolve;
        const wrap = document.createElement('div');
        wrap.className = 'iv-tool-ask-wrap';
        if (context) {
            const ctx = document.createElement('div');
            ctx.style.cssText = 'font-size:10px;color:var(--iv-text-muted);margin-bottom:6px;font-style:italic';
            ctx.textContent = context;
            wrap.appendChild(ctx);
        }
        const q = document.createElement('div');
        q.className = 'iv-tool-ask-question';
        q.textContent = question;
        wrap.appendChild(q);
        const inp = document.createElement('textarea');
        inp.className = 'iv-tool-ask-input';
        inp.placeholder = 'Your answer…';
        inp.rows = 2;
        wrap.appendChild(inp);
        const btn = document.createElement('button');
        btn.className = 'iv-tool-ask-submit';
        btn.textContent = 'Submit Answer';
        btn.addEventListener('click', () => {
            const answer = inp.value.trim();
            if (!answer) return;

            _dbgAdd('ASK_USER_SUBMIT', { question, answer });

            wrap.remove();
            resolve(answer);
            askUserResolve = null;
        });
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); }
        });
        wrap.appendChild(btn);
        const body = msgEl?.querySelector('.iv-msg-body');
        if (body) body.appendChild(wrap);
        inp.focus();
    });
}