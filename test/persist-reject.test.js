import { test } from 'node:test';
import assert from 'node:assert/strict';

const uploads = [];
const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
    querySelector(sel) {
        if (String(sel).includes('avatar-container.selected')) {
            return {
                getAttribute(name) { return name === 'data-avatar-id' ? 'user-default.png' : ''; },
                dataset: { avatarId: 'user-default.png' },
            };
        }
        return null;
    },
    createElement() { return { addEventListener() {}, appendChild() {} }; },
};
globalThis.window = globalThis;
globalThis.window.chat_file_name = 'st-copilot-image-tool';
globalThis.window.user_avatar = undefined;
globalThis.toastr = { error() {}, warning() {}, success() {} };

const chatMetadata = {};
globalThis.SillyTavern = {
    getContext() {
        return {
            name1: 'Eloise',
            name2: 'Seraphina',
            characterId: 0,
            characters: [{ name: 'Seraphina', avatar: 'default_Seraphina.png' }],
            chatId: 'st-copilot-image-tool',
            chatMetadata,
            extensionSettings: {},
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId() { return 'st-copilot-image-tool'; },
            getRequestHeaders({ omitContentType = false } = {}) {
                const headers = { 'Content-Type': 'application/json' };
                if (omitContentType) delete headers['Content-Type'];
                return headers;
            },
            getThumbnailUrl(type, file) { return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`; },
            powerUserSettings: { personas: {}, default_persona: '' },
            user_avatar: null,
            chat: [],
        };
    },
};

globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/api/files/upload')) {
        const body = JSON.parse(options.body || '{}');
        uploads.push({ name: body.name, data: body.data, keepalive: !!options.keepalive });
        return { ok: true, status: 200, async text() { return 'ok'; } };
    }
    if (href.includes('/thumbnail') || href.includes('/characters/')) {
        return {
            ok: true,
            status: 200,
            headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'image/png' : null; } },
            async blob() {
                return {
                    type: 'image/png',
                    async arrayBuffer() { return PNG_1x1.buffer.slice(PNG_1x1.byteOffset, PNG_1x1.byteOffset + PNG_1x1.byteLength); },
                };
            },
        };
    }
    return { ok: false, status: 404, async text() { return ''; }, async json() { return { ok: false }; } };
};

const {
    initChatBucket,
    getCurrentSession,
    persistImageStateTransition,
    saveSessionsToMetadata,
} = await import('../src/session.js');
const {
    persistGeneratedPendingIfAny,
    persistImageTransitionResult,
    applyImageProposal,
    rejectImageProposal,
    runManualGenerate,
    setImageBridgeForTests,
} = await import('../src/features/feature-image-engine.js');
function decodeUpload(entry) {
    return JSON.parse(decodeURIComponent(escape(atob(entry.data))));
}

function proposalEntries(payload) {
    const out = [];
    for (const s of payload.bucket?.sessions || []) {
        for (const m of s.messages || []) {
            for (const p of m.imageProposals || []) out.push({ id: p.pendingId, state: p.state });
        }
    }
    return out;
}

function seedPending(pendingId = 'pend_1') {
    const session = getCurrentSession();
    const binding = { chatId: 'st-copilot-image-tool', charId: '0', sessionId: session.id };
    const proposal = {
        state: 'generated_pending',
        pendingId,
        binding,
        prompt: 'Eloise',
        style: { id: 'anime-tegaki-character-sheet', label: 'Anime — Tegaki Character Sheet' },
        composition: 'character_sheet',
        subjects: [{ name: 'Eloise' }],
        referencesAccepted: [],
    };
    session.messages.push({ id: `msg_${pendingId}`, role: 'assistant', content: 'pending', imageProposals: [proposal] });
    return proposal;
}

await initChatBucket({ forceReset: true });

test('persistImageStateTransition writes now; debounce does not survive close-before-timer', async () => {
    uploads.length = 0;
    await persistImageStateTransition();
    assert.equal(uploads.length, 1);

    uploads.length = 0;
    saveSessionsToMetadata();
    assert.equal(uploads.length, 0, 'debounced save must not write before the timer');
    await new Promise(r => setTimeout(r, 1100));
    assert.equal(uploads.length, 1);
});

test('natural pending helper force-persists only when proposals exist', async () => {
    uploads.length = 0;
    assert.equal(await persistGeneratedPendingIfAny([]), false);
    assert.equal(await persistGeneratedPendingIfAny(null), false);
    assert.equal(uploads.length, 0);

    const session = getCurrentSession();
    session.messages.push({
        id: 'msg_natural',
        role: 'assistant',
        imageProposals: [{ state: 'generated_pending', pendingId: 'pend_natural' }],
        swipes: [{ content: 'x' }],
        swipeIndex: 0,
    });
    uploads.length = 0;
    assert.equal(await persistGeneratedPendingIfAny([{ pendingId: 'pend_natural' }]), true);
    assert.equal(uploads.length, 1);
    assert.equal(proposalEntries(decodeUpload(uploads[0])).some(p => p.id === 'pend_natural' && p.state === 'generated_pending'), true);
});

test('apply/reject helpers force-persist success only, not failed bridge results', async () => {
    uploads.length = 0;
    assert.equal(await persistImageTransitionResult({ ok: false, code: 'apply_failed' }), false);
    assert.equal(await persistImageTransitionResult({ ok: false, code: 'reject_failed' }), false);
    assert.equal(await persistImageTransitionResult(null), false);
    assert.equal(uploads.length, 0);

    uploads.length = 0;
    assert.equal(await persistImageTransitionResult({ ok: true, state: 'applied', warning: 'roleplay_insert_failed' }), true);
    assert.equal(uploads.length, 1);
});

test('applyImageProposal force-persists applied state; failed apply does not; repeat apply stays 0 generate', async () => {
    seedPending('pend_apply');
    setImageBridgeForTests({
        async generate() { throw new Error('generate must not run'); },
        async apply() { return { ok: true, imageId: 'img_apply', imageUrl: '/user/images/img_apply.png' }; },
        async reject() { return { ok: true }; },
    });
    uploads.length = 0;
    const first = await applyImageProposal('pend_apply');
    assert.equal(first.ok, true);
    assert.equal(first.generateCalls, 0);
    assert.equal(uploads.length, 1);
    assert.equal(proposalEntries(decodeUpload(uploads[0])).some(p => p.id === 'pend_apply' && p.state === 'applied'), true);

    uploads.length = 0;
    const second = await applyImageProposal('pend_apply');
    assert.equal(second.ok, true);
    assert.equal(second.generateCalls, 0);
    assert.equal(uploads.length, 1);

    seedPending('pend_apply_fail');
    setImageBridgeForTests({
        async generate() { throw new Error('generate must not run'); },
        async apply() { return { ok: false, error: { code: 'apply_failed' } }; },
        async reject() { return { ok: true }; },
    });
    uploads.length = 0;
    const failed = await applyImageProposal('pend_apply_fail');
    assert.equal(failed.ok, false);
    assert.equal(uploads.length, 0);
});

test('rejectImageProposal force-persists removal; failed reject leaves pending and does not write success', async () => {
    seedPending('pend_rej');
    setImageBridgeForTests({
        async generate() { throw new Error('generate must not run'); },
        async apply() { return { ok: true, imageId: 'x', imageUrl: '/user/images/x.png' }; },
        async reject() { return { ok: true }; },
    });
    uploads.length = 0;
    const ok = await rejectImageProposal('pend_rej');
    assert.equal(ok.ok, true);
    assert.equal(ok.generateCalls, 0);
    assert.equal(uploads.length, 1);
    assert.equal(proposalEntries(decodeUpload(uploads[0])).some(p => p.id === 'pend_rej'), false);

    seedPending('pend_rej_fail');
    setImageBridgeForTests({
        async generate() { throw new Error('generate must not run'); },
        async apply() { return { ok: true, imageId: 'x', imageUrl: '/user/images/x.png' }; },
        async reject() { return { ok: false, error: { code: 'reject_failed' } }; },
    });
    uploads.length = 0;
    const failed = await rejectImageProposal('pend_rej_fail');
    assert.equal(failed.ok, false);
    assert.equal(uploads.length, 0);
    const still = getCurrentSession().messages.find(m => m.id === 'msg_pend_rej_fail');
    assert.equal(still.imageProposals[0].state, 'generated_pending');
});

test('manual generated_pending force-persists before return; failed generate does not fake success', async () => {
    setImageBridgeForTests({
        async generate() {
            return {
                ok: true,
                pendingId: 'pend_manual',
                previewUrl: '/api/plugins/st-copilot-linkapi-image/pending/pend_manual',
                expiresAt: '2099-01-01T00:00:00.000Z',
                format: 'png',
                referencesAccepted: [],
            };
        },
        async apply() { throw new Error('apply must not run'); },
        async reject() { throw new Error('reject must not run'); },
    });
    uploads.length = 0;
    const ok = await runManualGenerate({ prompt: 'Eloise', styleId: 'none', composition: 'portrait', referenceSelection: 'none' });
    assert.equal(ok.ok, true);
    assert.equal(uploads.length, 1);
    assert.equal(proposalEntries(decodeUpload(uploads[0])).some(p => p.state === 'generated_pending'), true);

    setImageBridgeForTests({
        async generate() { return { ok: false, error: { code: 'provider_error', message: 'nope' } }; },
        async apply() { throw new Error('apply must not run'); },
        async reject() { throw new Error('reject must not run'); },
    });
    uploads.length = 0;
    const failed = await runManualGenerate({ prompt: 'Eloise', styleId: 'none', composition: 'portrait', referenceSelection: 'none' });
    assert.equal(failed.ok, false);
    assert.equal(uploads.length, 0);
});
