import { I, EXT_DISPLAY } from '../constants.js';
import { state } from '../state.js';
import { getSettings, saveSettings, getChatBucket, getCurrentSession } from '../session.js';
import { _openImageLightbox } from './feature-attachments.js';
import { escHtml } from '../utils/util-dom.js';
import {
    STYLE_PRESETS,
    SHIPPED_STYLE_FRAGMENTS,
    MANUAL_COMPOSITIONS,
    DEFAULT_STYLE_ID,
    getAttachmentSrc,
    galleryRecords,
    sortCatalog,
    restoreShippedFragments,
    getStyleFragment,
    shouldRenderProposalCard,
    shouldShowRoleplayRetry,
} from './image-core.js';
import {
    applyImageProposal,
    rejectImageProposal,
    retryRoleplayDestination,
    runManualGenerate,
    setSelectedStyleId,
    getSelectedStyleId,
    getProposalEligibility,
} from './feature-image-engine.js';


function safeImg(src, className, title) {
    const img = document.createElement('img');
    if (className) img.className = className;
    if (title) img.title = title;
    img.alt = title || '';
    img.src = src || '';
    return img;
}

export function renderImageProposalCard(proposal, msgEl) {
    if (!shouldRenderProposalCard(proposal)) return;
    msgEl.querySelectorAll(`.scp-image-proposal-card[data-pending="${proposal.pendingId}"]`).forEach(el => el.remove());
    const card = document.createElement('div');
    card.className = 'scp-image-proposal-card';
    card.dataset.pending = proposal.pendingId;
    card.dataset.for = msgEl.dataset.id || '';

    const preview = document.createElement('div');
    preview.className = 'scp-image-proposal-preview';
    if (proposal.state === 'applied' && proposal.appliedUrl) {
        const img = safeImg(proposal.appliedUrl, 'scp-image-proposal-img', proposal.style?.label || 'Generated image');
        img.addEventListener('click', () => _openImageLightbox({ url: proposal.appliedUrl, name: 'generated image' }));
        preview.appendChild(img);
    } else if (proposal.previewUrl) {
        const img = safeImg(proposal.previewUrl, 'scp-image-proposal-img', proposal.style?.label || 'Pending image');
        img.addEventListener('click', () => _openImageLightbox({ url: proposal.previewUrl, name: 'pending image' }));
        preview.appendChild(img);
    }
    card.appendChild(preview);

    const meta = document.createElement('div');
    meta.className = 'scp-image-proposal-meta';
    const stateEl = document.createElement('div');
    stateEl.className = 'scp-image-proposal-state';
    stateEl.textContent = proposal.state === 'applied' ? 'Applied' : 'Generated — not saved yet';
    meta.appendChild(stateEl);
    const styleEl = document.createElement('div');
    styleEl.className = 'scp-image-proposal-style';
    styleEl.textContent = proposal.style?.label || '';
    meta.appendChild(styleEl);
    card.appendChild(meta);

    const promptWrap = document.createElement('details');
    promptWrap.className = 'scp-image-proposal-prompt';
    const summary = document.createElement('summary');
    summary.textContent = 'Final prompt';
    promptWrap.appendChild(summary);
    const pre = document.createElement('pre');
    pre.textContent = proposal.prompt || '';
    promptWrap.appendChild(pre);
    card.appendChild(promptWrap);

    const refs = document.createElement('div');
    refs.className = 'scp-image-proposal-refs';
    const accepted = proposal.referencesAccepted || [];
    refs.textContent = accepted.length
        ? `References used: ${accepted.map(r => r.name).join(', ')}`
        : 'No reference image was included.';
    card.appendChild(refs);

    if (proposal.state === 'generated_pending') {
        const dest = document.createElement('div');
        dest.className = 'scp-image-proposal-dest';
        const s = getSettings();
        const rpLabel = document.createElement('label');
        const rpBox = document.createElement('input');
        rpBox.type = 'checkbox';
        rpBox.checked = !!s.imageAddToRoleplayDefault;
        rpBox.className = 'scp-image-dest-roleplay';
        rpLabel.appendChild(rpBox);
        rpLabel.appendChild(document.createTextNode(' Also add to roleplay'));
        dest.appendChild(rpLabel);

        const eligibility = getProposalEligibility(proposal);
        if (eligibility.eligible) {
            const galLabel = document.createElement('label');
            const galBox = document.createElement('input');
            galBox.type = 'checkbox';
            galBox.checked = !!s.imageCharacterGalleryDefault;
            galBox.className = 'scp-image-dest-gallery';
            galLabel.appendChild(galBox);
            galLabel.appendChild(document.createTextNode(' Save to character gallery'));
            dest.appendChild(galLabel);
        }
        card.appendChild(dest);

        const actions = document.createElement('div');
        actions.className = 'scp-image-proposal-actions';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'scp-image-apply';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', async () => {
            applyBtn.disabled = true;
            rejectBtn.disabled = true;
            const result = await applyImageProposal(proposal.pendingId, {
                addToRoleplay: !!card.querySelector('.scp-image-dest-roleplay')?.checked,
                saveToCharacterGallery: !!card.querySelector('.scp-image-dest-gallery')?.checked,
            });
            if (!result.ok) {
                applyBtn.disabled = false;
                rejectBtn.disabled = false;
                if (typeof toastr !== 'undefined') toastr.error(result.code === 'binding_mismatch' ? 'This image belongs to another chat.' : 'Apply failed.', EXT_DISPLAY);
                return;
            }
            if (result.warning && typeof toastr !== 'undefined') {
                toastr.warning('The image was saved, but adding it to the roleplay chat failed.', EXT_DISPLAY);
            }
            const session = getCurrentSession();
            const msg = session.messages.find(m => m.id === (card.dataset.for || msgEl.dataset.id));
            if (msg && msgEl) {
                const chatUi = await import('../ui/ui-chat.js');
                chatUi._renderMsgBodyContent(msgEl, msg);
            }
            renderImageGallery();
        });
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'scp-image-reject';
        rejectBtn.textContent = 'Reject';
        rejectBtn.addEventListener('click', async () => {
            applyBtn.disabled = true;
            rejectBtn.disabled = true;
            const result = await rejectImageProposal(proposal.pendingId);
            if (!result.ok) {
                applyBtn.disabled = false;
                rejectBtn.disabled = false;
                if (typeof toastr !== 'undefined') toastr.error(result.code === 'binding_mismatch' ? 'This image belongs to another chat.' : 'Reject failed.', EXT_DISPLAY);
                return;
            }
            card.remove();
        });
        actions.appendChild(applyBtn);
        actions.appendChild(rejectBtn);
        card.appendChild(actions);
    }

    const body = msgEl.querySelector('.scp-msg-body') || msgEl;
    body.appendChild(card);
}

export function renderRoleplayRetryControl(proposal, msgEl) {
    if (!shouldShowRoleplayRetry(proposal)) return;
    msgEl.querySelectorAll(`.scp-image-roleplay-retry[data-pending="${proposal.pendingId}"]`).forEach(el => el.remove());
    const bar = document.createElement('div');
    bar.className = 'scp-image-roleplay-retry';
    bar.dataset.pending = proposal.pendingId;
    const note = document.createElement('span');
    note.textContent = 'Saved to Copilot, but not yet added to the roleplay chat.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scp-image-roleplay-retry-btn';
    btn.textContent = 'Add to roleplay';
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const result = await retryRoleplayDestination(proposal.pendingId);
        if (!result.ok || result.warning) {
            btn.disabled = false;
            if (typeof toastr !== 'undefined') toastr.warning('Could not add the image to the roleplay chat yet.', EXT_DISPLAY);
            return;
        }
        const session = getCurrentSession();
        const msg = session.messages.find(m => (m.imageProposals || []).some(p => p.pendingId === proposal.pendingId));
        if (msg && msgEl) {
            const chatUi = await import('../ui/ui-chat.js');
            chatUi._renderMsgBodyContent(msgEl, msg);
        }
    });
    bar.appendChild(note);
    bar.appendChild(btn);
    const body = msgEl.querySelector('.scp-msg-body') || msgEl;
    body.appendChild(bar);
}

export function renderMessageImageProposals(msgEl, msg) {
    msgEl.querySelectorAll('.scp-image-proposal-card').forEach(el => el.remove());
    msgEl.querySelectorAll('.scp-image-roleplay-retry').forEach(el => el.remove());
    for (const proposal of msg.imageProposals || []) {
        if (shouldRenderProposalCard(proposal)) renderImageProposalCard(proposal, msgEl);
        else if (shouldShowRoleplayRetry(proposal)) renderRoleplayRetryControl(proposal, msgEl);
    }
}

export function renderAppliedAttachments(container, attachments) {
    if (!attachments?.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'scp-msg-attachments';
    for (const att of attachments) {
        const badge = document.createElement('div');
        badge.className = 'scp-msg-att-badge';
        if (att.isImage) {
            const img = safeImg(getAttachmentSrc(att), 'scp-msg-att-img', att.name);
            const span = document.createElement('span');
            span.textContent = att.name || '';
            badge.appendChild(img);
            badge.appendChild(span);
            badge.addEventListener('click', () => _openImageLightbox({ ...att, dataUrl: getAttachmentSrc(att), url: att.url }));
        } else {
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-file';
            const span = document.createElement('span');
            span.textContent = att.name || '';
            badge.appendChild(icon);
            badge.appendChild(span);
        }
        wrap.appendChild(badge);
    }
    container.insertBefore(wrap, container.firstChild);
}

function fillStyleSelect(sel, selectedId) {
    sel.innerHTML = '';
    for (const preset of STYLE_PRESETS) {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.label;
        sel.appendChild(opt);
    }
    sel.value = selectedId || DEFAULT_STYLE_ID;
}

export function setupManualImageForm() {
    const form = document.getElementById('scp-image-form');
    if (!form) return;
    const styleSel = document.getElementById('scp-image-form-style');
    const compSel = document.getElementById('scp-image-form-composition');
    const refSel = document.getElementById('scp-image-form-reference');
    fillStyleSelect(styleSel, getSelectedStyleId());
    // One-off manual style. Does not write the per-chat default.
    if (compSel && !compSel.options.length) {
        const labels = {
            auto: 'Auto',
            character_sheet: 'Character sheet',
            portrait: 'Portrait',
            scene: 'Scene',
            environment: 'Environment',
            object: 'Object',
            other: 'Other',
        };
        for (const id of MANUAL_COMPOSITIONS) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = labels[id] || id;
            compSel.appendChild(opt);
        }
    }
    if (refSel && !refSel.options.length) {
        for (const [value, label] of [['auto', 'Auto'], ['attachment', 'Current request attachment'], ['card', 'Card avatar'], ['persona', 'Active persona'], ['none', 'None']]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            refSel.appendChild(opt);
        }
    }
    document.getElementById('scp-image-form-generate')?.addEventListener('click', async () => {
        const promptEl = document.getElementById('scp-image-form-prompt');
        const prompt = promptEl?.value ?? '';
        const btn = document.getElementById('scp-image-form-generate');
        if (btn) btn.disabled = true;
        try {
            const result = await runManualGenerate({
                prompt,
                styleId: styleSel?.value,
                composition: compSel?.value || 'auto',
                referenceSelection: refSel?.value || 'auto',
            });
            if (!result.ok) {
                if (typeof toastr !== 'undefined') toastr.error(result.message || 'Image generation failed.', EXT_DISPLAY);
                return;
            }
            if (result.message) {
                const chatUi = await import('../ui/ui-chat.js');
                chatUi.appendMsgEl(result.message);
                chatUi.updateMsgCount(getCurrentSession());
            }
            form.style.display = 'none';
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

export function renderImageGallery() {
    const panel = document.getElementById('scp-image-gallery');
    const grid = document.getElementById('scp-image-gallery-grid');
    if (!panel || !grid) return;
    const sortSel = document.getElementById('scp-image-gallery-sort');
    const direction = sortSel?.value || 'newest';
    const records = sortCatalog(galleryRecords(getChatBucket()), direction);
    grid.textContent = '';
    if (!records.length) {
        const empty = document.createElement('div');
        empty.className = 'scp-image-gallery-empty';
        empty.textContent = 'No applied images in this roleplay chat.';
        grid.appendChild(empty);
        return;
    }
    for (const rec of records) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'scp-image-gallery-item';
        item.appendChild(safeImg(rec.path, 'scp-image-gallery-thumb', rec.style?.label || ''));
        const labels = document.createElement('div');
        labels.className = 'scp-image-gallery-labels';
        const subjects = (rec.subjects || []).map(s => s.name).filter(Boolean).join(', ');
        labels.textContent = [subjects, rec.style?.label].filter(Boolean).join(' · ');
        item.appendChild(labels);
        item.addEventListener('click', () => {
            _openImageLightbox({ url: rec.path, name: rec.style?.label || 'image' });
            const details = document.getElementById('scp-image-gallery-details');
            if (details) {
                details.textContent = '';
                const prompt = document.createElement('pre');
                prompt.textContent = rec.prompt || '';
                const source = document.createElement('div');
                source.textContent = `Session ${rec.sessionId || ''} · message ${rec.messageId || ''}`;
                details.appendChild(source);
                details.appendChild(prompt);
            }
        });
        grid.appendChild(item);
    }
}

export function setupImageGallery() {
    document.getElementById('scp-image-gallery-sort')?.addEventListener('change', () => renderImageGallery());
    document.getElementById('scp-gallery-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('scp-image-gallery');
        if (!panel) return;
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : '';
        if (!open) renderImageGallery();
    });
    document.getElementById('scp-image-gallery-close')?.addEventListener('click', () => {
        const panel = document.getElementById('scp-image-gallery');
        if (panel) panel.style.display = 'none';
    });
}

export function setupStyleEditor() {
    const s = getSettings();
    if (!s.imageStyleFragments) s.imageStyleFragments = { ...SHIPPED_STYLE_FRAGMENTS };
    const list = document.getElementById('scp-image-style-list');
    if (!list) return;
    list.textContent = '';
    for (const preset of STYLE_PRESETS) {
        if (preset.id === 'none') continue;
        const row = document.createElement('div');
        row.className = 'scp-image-style-row';
        const label = document.createElement('label');
        label.textContent = preset.label;
        const input = document.createElement('textarea');
        input.className = 'scp-sp-textarea';
        input.rows = 2;
        input.value = preset.id === 'custom'
            ? (s.imageCustomFragment || '')
            : getStyleFragment(preset.id, s.imageStyleFragments, s.imageCustomFragment);
        input.addEventListener('input', () => {
            if (preset.id === 'custom') s.imageCustomFragment = input.value;
            else s.imageStyleFragments[preset.id] = input.value;
            saveSettings();
        });
        row.appendChild(label);
        row.appendChild(input);
        list.appendChild(row);
    }
    const restore = document.getElementById('scp-image-style-restore');
    if (restore && !restore.dataset.bound) {
        restore.dataset.bound = '1';
        restore.addEventListener('click', () => {
            const settings = getSettings();
            settings.imageStyleFragments = restoreShippedFragments(settings.imageStyleFragments);
            saveSettings();
            setupStyleEditor();
        });
    }
}

export function setupImageSettings() {
    const s = getSettings();
    const model = document.getElementById('scp-image-model');
    if (model) {
        model.value = s.imageModel || 'gpt-image-2-c';
        if (!model.dataset.bound) {
            model.dataset.bound = '1';
            model.addEventListener('input', () => { getSettings().imageModel = model.value; saveSettings(); });
        }
    }
    const rp = document.getElementById('scp-image-rp-default');
    if (rp) {
        rp.checked = !!s.imageAddToRoleplayDefault;
        if (!rp.dataset.bound) {
            rp.dataset.bound = '1';
            rp.addEventListener('change', () => { getSettings().imageAddToRoleplayDefault = rp.checked; saveSettings(); });
        }
    }
    const gal = document.getElementById('scp-image-gallery-default');
    if (gal) {
        gal.checked = !!s.imageCharacterGalleryDefault;
        if (!gal.dataset.bound) {
            gal.dataset.bound = '1';
            gal.addEventListener('change', () => { getSettings().imageCharacterGalleryDefault = gal.checked; saveSettings(); });
        }
    }
    const chatStyle = document.getElementById('scp-image-chat-style');
    if (chatStyle) {
        fillStyleSelect(chatStyle, getSelectedStyleId());
        if (!chatStyle.dataset.bound) {
            chatStyle.dataset.bound = '1';
            chatStyle.addEventListener('change', () => {
                if (chatStyle.value) setSelectedStyleId(chatStyle.value);
            });
        } else {
            chatStyle.value = getSelectedStyleId() || DEFAULT_STYLE_ID;
        }
    }
    setupStyleEditor();
}

export function setupImageUi() {
    setupManualImageForm();
    setupImageGallery();
    setupImageSettings();
    document.getElementById('scp-image-btn')?.addEventListener('click', () => {
        const form = document.getElementById('scp-image-form');
        if (!form) return;
        form.style.display = form.style.display === 'none' ? '' : 'none';
        const styleSel = document.getElementById('scp-image-form-style');
        if (styleSel) fillStyleSelect(styleSel, getSelectedStyleId());
    });
}
