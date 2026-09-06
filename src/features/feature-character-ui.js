import { getSettings, saveSettings, getConversation, saveConversation } from '../conversation.js';

export function buildAltGreetingsPicker(container, isOverride = false) {
    if (!container) return;
    container.innerHTML = '';

    const s = getSettings();
    if (!s.charEditFields) s.charEditFields = {};
    if (Array.isArray(s.altGreetingIndices)) s.altGreetingIndices = {};
    if (!s.altGreetingIndices) s.altGreetingIndices = {};

    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    const charId = char?.avatar || 'unknown';
    const greetings = char?.data?.alternate_greetings || [];

    let isEnabled = false;
    if (isOverride) {
        const conv = getConversation();
        if (conv && conv.overrides && conv.overrides.charField_alternate_greetings !== undefined) {
            isEnabled = conv.overrides.charField_alternate_greetings;
        } else {
            isEnabled = !!s.charEditFields.alternate_greetings;
        }
    } else {
        isEnabled = !!s.charEditFields.alternate_greetings;
    }

    if (!isEnabled) { container.style.display = 'none'; return; }

    if (!greetings.length) {
        container.innerHTML = '<div style="font-size:11px;color:var(--iv-text-muted);font-style:italic;padding:4px">No alternate greetings found for current character.</div>';
        container.style.display = '';
        return;
    }

    let targetArray = [];
    if (isOverride) {
        const conv = getConversation();
        if (conv?.overrides?.altGreetingIndices && conv.overrides.altGreetingIndices[charId]) {
            targetArray = conv.overrides.altGreetingIndices[charId];
        } else {
            targetArray = s.altGreetingIndices[charId] || [];
        }
    } else {
        targetArray = s.altGreetingIndices[charId] || [];
    }

    const label = document.createElement('div');
    label.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--iv-text-muted,#72728a);margin-bottom:5px';
    label.textContent = 'Which greetings to include:';
    container.appendChild(label);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:120px;overflow-y:auto;padding:4px;background:rgba(0,0,0,.15);border-radius:6px;border:1px solid rgba(255,255,255,.06)';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.style.cssText = 'font-size:10px;cursor:pointer;background:none;border:1px solid rgba(255,255,255,.1);border-radius:4px;color:var(--iv-text-muted,#888);padding:2px 8px;align-self:flex-start;margin-bottom:3px;font-family:inherit';
    allBtn.textContent = targetArray.length === greetings.length ? 'Deselect All' : 'Select All';

    allBtn.addEventListener('click', () => {
        const isAll = targetArray.length === greetings.length;
        const newArray = isAll ? [] : greetings.map((_, i) => i);
        if (isOverride) {
            const conv = getConversation();
            if (!conv.overrides) conv.overrides = {};
            if (!conv.overrides.altGreetingIndices) conv.overrides.altGreetingIndices = {};
            conv.overrides.altGreetingIndices[charId] = newArray;
            saveConversation();
        } else {
            getSettings().altGreetingIndices[charId] = newArray;
            saveSettings();
        }
        buildAltGreetingsPicker(container, isOverride);
    });
    wrap.appendChild(allBtn);

    greetings.forEach((greeting, idx) => {
        const isSelected = targetArray.includes(idx);
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:6px;cursor:pointer;padding:3px 4px;border-radius:4px;transition:background .12s';

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = isSelected; cb.style.cssText = 'flex-shrink:0;margin-top:2px;accent-color:var(--iv-accent,#7c6dfa)';
        cb.addEventListener('change', () => {
            let currentArr = [...targetArray];
            if (cb.checked) { if (!currentArr.includes(idx)) currentArr.push(idx); }
            else currentArr = currentArr.filter(i => i !== idx);
            currentArr.sort((a, b) => a - b);

            if (isOverride) {
                const conv = getConversation();
                if (!conv.overrides) conv.overrides = {};
                if (!conv.overrides.altGreetingIndices) conv.overrides.altGreetingIndices = {};
                conv.overrides.altGreetingIndices[charId] = currentArr;
                saveConversation();
            } else {
                getSettings().altGreetingIndices[charId] = currentArr;
                saveSettings();
            }

            allBtn.textContent = currentArr.length === greetings.length ? 'Deselect All' : 'Select All';
            targetArray = currentArr;
        });

        const text = document.createElement('span');
        text.style.cssText = 'font-size:11px;color:var(--iv-text,#e2e2e6);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical';
        text.textContent = `#${idx + 1}: ${(greeting || '').slice(0, 80)}${greeting?.length > 80 ? '…' : ''}`;

        row.appendChild(cb); row.appendChild(text); wrap.appendChild(row);
    });
    container.appendChild(wrap); container.style.display = '';
}

export function refreshAltGreetingsPickers() {
    buildAltGreetingsPicker(document.getElementById('iv-ce-alt-greetings-picker'), false);
    buildAltGreetingsPicker(document.getElementById('iv-sp-ce-alt-greetings-picker'), false);
    buildAltGreetingsPicker(document.getElementById('iv-sp-ov-ce-alt-greetings-picker'), true);
}
