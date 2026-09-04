import { state } from '../state.js';
import {
    getSettings,
    getChatBucket,
    getBindingKey,
    getCurrentSession,
    addMessage,
    saveSessionsToMetadata,
    persistImageStateTransition,
    genId,
} from '../session.js';
import { getActiveCharacterEntities } from './feature-character-engine.js';
import { _dbgAdd } from '../utils/util-debug.js';
import {
    BRIDGE_PREFIX,
    DEFAULT_IMAGE_MODEL,
    IMAGE_TOOL_NAME,
    MODEL_VISIBLE_PENDING_RESULT,
    MODEL_VISIBLE_REFUSAL,
    MODEL_VISIBLE_ALREADY_USED,
    boundModel,
    createImageCallGuard,
    executeGenerateImage,
    executeReject,
    generateOperationId,
    hasExplicitImageIntent,
    applyDestinationsWithRoleplay,
    migrateBucket,
    sanitizeProposalForSession,
    sanitizeToolCallsForSave,
    isCharacterGalleryEligible,
    resolveActivePersona,
    selectedPersonaAvatarId,
    personaThumbnailUrl,
} from './image-core.js';

let _runContext = null;
let _bridgeOverride = null;

export function setImageBridgeForTests(bridge) {
    _bridgeOverride = bridge;
}

export function beginImageRun({ userTurn, attachments, binding, sessionId, mode = 'natural', manualSelection = 'auto', styleOverride, authorized = false } = {}) {
    _runContext = {
        userTurn: userTurn || '',
        attachments: attachments || [],
        binding,
        sessionId,
        mode,
        manualSelection,
        styleOverride,
        authorized: authorized === true || mode === 'manual',
        guard: createImageCallGuard(),
        operationId: generateOperationId(),
        pendingProposals: [],
    };
    return _runContext;
}

export function endImageRun() {
    _runContext = null;
}

export function getImageRunContext() {
    return _runContext;
}

export function takePendingImageProposals() {
    const list = _runContext?.pendingProposals || [];
    if (_runContext) _runContext.pendingProposals = [];
    return list.map(sanitizeProposalForSession);
}

function requestHeaders(options) {
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.getRequestHeaders === 'function') {
            return ctx.getRequestHeaders(options || {});
        }
    } catch (_) {
        // Fall through.
    }
    if (options?.omitContentType) return {};
    return { 'Content-Type': 'application/json' };
}

async function defaultFetch(url, options) {
    return fetch(url, options);
}

export function createDefaultBridge({ fetchImpl = defaultFetch } = {}) {
    const headers = () => ({ ...requestHeaders(), 'Content-Type': 'application/json' });
    return {
        async generate(payload) {
            const res = await fetchImpl(`${BRIDGE_PREFIX}/generate`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload),
            });
            return res.json();
        },
        async apply(payload) {
            const res = await fetchImpl(`${BRIDGE_PREFIX}/apply`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload),
            });
            return res.json();
        },
        async reject(payload) {
            const res = await fetchImpl(`${BRIDGE_PREFIX}/reject`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload),
            });
            return res.json();
        },
    };
}

function getBridge() {
    return _bridgeOverride || createDefaultBridge();
}

function currentBinding(sessionId) {
    const { chatId, charId } = getBindingKey();
    return {
        chatId: String(chatId || ''),
        charId: String(charId || ''),
        sessionId: String(sessionId || getCurrentSession()?.id || ''),
    };
}

function styleStateFromSettings(styleOverride) {
    const s = getSettings();
    const bucket = migrateBucket(getChatBucket());
    return {
        selectedStyleId: bucket.imageSettings.selectedStyleId,
        fragments: s.imageStyleFragments || {},
        customFragment: s.imageCustomFragment || '',
        styleOverride,
        model: boundModel(s.imageModel || DEFAULT_IMAGE_MODEL),
    };
}

async function blobToDataUrl(blob, mimeType) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const mime = mimeType || blob.type || 'image/png';
    return `data:${mime};base64,${btoa(binary)}`;
}

async function fetchImageDataUrl(url) {
    if (!url) return null;
    if (String(url).startsWith('data:image/')) return url;
    try {
        const res = await fetch(url, { headers: requestHeaders({ omitContentType: true }) });
        if (!res.ok) return null;
        const blob = await res.blob();
        const mime = blob.type || res.headers.get('content-type') || 'image/png';
        if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mime)) return null;
        return await blobToDataUrl(blob, mime);
    } catch (err) {
        _dbgAdd('IMAGE_REF_FETCH_FAILED', { outcome: 'error' });
        return null;
    }
}

export function personaEntity() {
    try {
        const ctx = SillyTavern.getContext();
        const pu = ctx.powerUserSettings || {};
        let windowAvatar = '';
        try { windowAvatar = typeof window !== 'undefined' ? window.user_avatar : ''; } catch (_) { windowAvatar = ''; }
        const persona = resolveActivePersona({
            name1: ctx.name1 || '',
            selectedAvatarId: selectedPersonaAvatarId(),
            windowAvatar,
            contextAvatar: ctx.user_avatar || ctx.userAvatar || ctx.personaId || ctx.activePersonaId || '',
            chatPersona: ctx.chatMetadata?.persona || '',
            defaultPersona: pu.default_persona || '',
        });
        return persona.avatar ? persona : null;
    } catch (_) {
        return null;
    }
}

function cardUrl(entity) {
    try {
        const ctx = SillyTavern.getContext();
        if (entity.isPersona) {
            return personaThumbnailUrl(entity.avatar, ctx.getThumbnailUrl);
        }
        return `/characters/${entity.avatar}`;
    } catch (_) {
        return entity?.avatar ? `/characters/${entity.avatar}` : '';
    }
}

export async function collectReferenceSources() {
    const cards = [];
    for (const entity of getActiveCharacterEntities()) {
        const dataUrl = await fetchImageDataUrl(cardUrl(entity));
        cards.push({
            id: entity.id,
            name: entity.name,
            avatar: entity.avatar,
            cardId: entity.avatar,
            dataUrl,
        });
    }
    const personaInfo = personaEntity();
    let persona = null;
    if (personaInfo?.avatar) {
        const ctx = SillyTavern.getContext();
        const dataUrl = await fetchImageDataUrl(personaThumbnailUrl(personaInfo.avatar, ctx.getThumbnailUrl));
        persona = { ...personaInfo, dataUrl };
    }
    return { cards, persona };
}

export async function executeGenerateImageTool(toolInput) {
    const ctx = _runContext;
    if (!ctx || (ctx.mode === 'natural' && ctx.authorized !== true)) {
        return { __imagePending: false, sentinel: { ...MODEL_VISIBLE_REFUSAL }, proposal: null, result: { ...MODEL_VISIBLE_REFUSAL } };
    }
    if (ctx.mode === 'natural' && !hasExplicitImageIntent(ctx.userTurn, toolInput?.subjects)) {
        return { __imagePending: false, sentinel: { ...MODEL_VISIBLE_REFUSAL }, proposal: null, result: { ...MODEL_VISIBLE_REFUSAL } };
    }
    if (ctx.guard && ctx.guard.wasConsumed()) {
        return { __imagePending: false, sentinel: { ...MODEL_VISIBLE_ALREADY_USED }, proposal: null, result: { ...MODEL_VISIBLE_ALREADY_USED } };
    }
    const sources = await collectReferenceSources();
    const result = await executeGenerateImage({
        toolInput,
        runContext: ctx,
        styleState: styleStateFromSettings(ctx.styleOverride),
        referenceSources: sources,
        bridge: getBridge(),
        model: styleStateFromSettings().model,
    });
    if (result.proposal) ctx.pendingProposals.push(result.proposal);
    _dbgAdd('IMAGE_TOOL', {
        requestId: ctx.operationId,
        model: styleStateFromSettings().model,
        route: (result.request?.references || []).length ? 'edits' : 'generations',
        outcome: result.proposal ? 'generated_pending' : (result.visible?.state || 'error'),
    });
    return {
        __imagePending: !!result.proposal,
        sentinel: result.visible,
        proposal: result.proposal,
        result: result.visible,
    };
}

export function attachProposalsToMessage(msg, proposals) {
    if (!msg || !proposals?.length) return msg;
    if (!msg.imageProposals) msg.imageProposals = [];
    for (const proposal of proposals) {
        if (!msg.imageProposals.some(p => p.pendingId === proposal.pendingId)) {
            msg.imageProposals.push(sanitizeProposalForSession(proposal));
        }
    }
    if (msg.toolCalls) msg.toolCalls = sanitizeToolCallsForSave(msg.toolCalls);
    return msg;
}

export async function persistGeneratedPendingIfAny(proposals) {
    if (!proposals?.length) return false;
    await persistImageStateTransition();
    return true;
}

export async function persistImageTransitionResult(result) {
    if (!result || result.ok !== true) return false;
    await persistImageStateTransition();
    return true;
}

export async function applyImageProposal(pendingId, destinations = {}) {
    const bucket = migrateBucket(getChatBucket());
    const session = getCurrentSession();
    const binding = currentBinding(session.id);
    let found = null;
    let message = null;
    for (const sess of bucket.sessions || []) {
        for (const msg of sess.messages || []) {
            const proposal = (msg.imageProposals || []).find(p => p.pendingId === pendingId);
            if (proposal) {
                found = proposal;
                message = msg;
            }
        }
    }
    if (!found || !message) return { ok: false, code: 'missing' };
    const sources = await collectReferenceSources();
    const result = await applyDestinationsWithRoleplay({
        proposal: found,
        currentBinding: binding,
        messageId: message.id,
        destinations,
        bridge: getBridge(),
        bucket,
        message,
        cards: sources.cards,
    });
    if (result.warning === 'roleplay_insert_failed') {
        _dbgAdd('IMAGE_RP_DEST_FAILED', { outcome: 'error' });
    }
    await persistImageTransitionResult(result);
    return result;
}

export async function retryRoleplayDestination(pendingId) {
    return applyImageProposal(pendingId, { addToRoleplay: true });
}

export async function rejectImageProposal(pendingId) {
    const bucket = migrateBucket(getChatBucket());
    const session = getCurrentSession();
    const binding = currentBinding(session.id);
    let found = null;
    let message = null;
    for (const sess of bucket.sessions || []) {
        for (const msg of sess.messages || []) {
            const proposal = (msg.imageProposals || []).find(p => p.pendingId === pendingId);
            if (proposal) {
                found = proposal;
                message = msg;
            }
        }
    }
    if (!found) return { ok: true, state: 'rejected', generateCalls: 0 };
    const result = await executeReject({
        proposal: found,
        currentBinding: binding,
        bridge: getBridge(),
        bucket,
        message,
    });
    await persistImageTransitionResult(result);
    return result;
}

export async function runManualGenerate({ prompt, styleId, composition, referenceSelection, subjects = [] }) {
    if (state.imageManualLocked) {
        return { ok: false, code: 'locked' };
    }
    state.imageManualLocked = true;
    try {
        const session = getCurrentSession();
        const binding = currentBinding(session.id);
        const run = beginImageRun({
            userTurn: '',
            attachments: state.pendingAttachments || [],
            binding,
            sessionId: session.id,
            mode: 'manual',
            manualSelection: referenceSelection || 'auto',
            styleOverride: styleId,
            authorized: true,
        });
        const sources = await collectReferenceSources();
        const result = await executeGenerateImage({
            toolInput: { prompt, composition, subjects },
            runContext: run,
            styleState: styleStateFromSettings(styleId),
            referenceSources: sources,
            bridge: getBridge(),
            model: styleStateFromSettings().model,
        });
        if (!result.proposal) {
            endImageRun();
            return { ok: false, message: result.visible?.message || 'Image generation failed.' };
        }
        const pending = [sanitizeProposalForSession(result.proposal)];
        const msg = addMessage(session, 'assistant', 'One image was generated and awaits Apply or Reject.', {
            imageProposals: pending,
            toolCalls: [{
                id: genId('tc'),
                name: IMAGE_TOOL_NAME,
                input: { prompt, composition, subjects },
                status: 'done',
                result: { ...MODEL_VISIBLE_PENDING_RESULT },
            }],
        });
        endImageRun();
        await persistGeneratedPendingIfAny(pending);
        return { ok: true, message: msg, proposal: result.proposal };
    } finally {
        state.imageManualLocked = false;
    }
}

export function setSelectedStyleId(styleId) {
    const bucket = migrateBucket(getChatBucket());
    bucket.imageSettings.selectedStyleId = styleId;
    saveSessionsToMetadata();
}

export function getSelectedStyleId() {
    return migrateBucket(getChatBucket()).imageSettings.selectedStyleId;
}

export function getProposalEligibility(proposal) {
    return isCharacterGalleryEligible({
        subjects: proposal?.subjects,
        composition: proposal?.composition,
        cards: getActiveCharacterEntities(),
        references: proposal?.referencesAccepted,
    });
}

export { IMAGE_TOOL_NAME };
