import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TEGAKI_FRAMING,
    SHIPPED_STYLE_FRAGMENTS,
    MODEL_VISIBLE_PENDING_RESULT,
    GROUNDED_PROMPT_FIXTURE,
    hasExplicitImageIntent,
    createImageCallGuard,
    composeProviderPrompt,
    resolveNaturalComposition,
    resolveStyle,
    resolveReferences,
    executeGenerateImage,
    executeApply,
    executeReject,
    migrateBucket,
    capSessionMessages,
    preserveAppliedFieldsOnTextChange,
    getAttachmentSrc,
    isCharacterGalleryEligible,
    buildMainRoleplayMessage,
    isSafeMainRoleplayMessage,
    bindingsMatch,
    sessionJsonContainsSecrets,
    buildSafeImageLog,
    visibleToolResultIsSafe,
    groundedPromptPreservesFacts,
    sanitizeToolCallsForSave,
    sanitizeProposalForSession,
    galleryRecords,
    sortCatalog,
    applyLocalDestinations,
    applyDestinationsWithRoleplay,
    readApplyEnvelope,
    shouldAuthorizeImageRun,
    shouldRenderProposalCard,
    shouldShowRoleplayRetry,
    inferSubjectsFromReferences,
    insertRoleplayMediaMessage,
    findExistingRoleplayMessage,
    ROLEPLAY_IMAGE_MARKER,
    clearAttachmentWrappers,
    createRoleplayDeliveryState,
    isRoleplayDeliveryComplete,
    resolveActivePersona,
    selectedPersonaAvatarId,
    personaThumbnailUrl,
} from '../src/features/image-core.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mockBridge({ failGenerate = false, failOnce = false, applyResult, rejectResult } = {}) {
    const calls = { generate: [], apply: [], reject: [] };
    let generateAttempts = 0;
    return {
        calls,
        async generate(payload) {
            calls.generate.push(payload);
            generateAttempts += 1;
            if (failGenerate || (failOnce && generateAttempts === 1)) {
                return { ok: false, error: { code: 'provider_error', message: 'Provider failed.' } };
            }
            return {
                ok: true,
                state: 'generated_pending',
                pendingId: 'pend_1',
                previewUrl: '/api/plugins/st-copilot-linkapi-image/pending/pend_1',
                expiresAt: '2099-01-01T00:00:00.000Z',
                format: 'png',
                referencesAccepted: (payload.references || []).map(r => ({
                    name: r.name,
                    source: r.source,
                    sourceId: r.sourceId,
                })),
            };
        },
        async apply(payload) {
            calls.apply.push(payload);
            return applyResult || {
                ok: true,
                state: 'applied',
                imageId: 'img_1',
                imageUrl: '/user/images/img_1.png',
                galleryUrl: payload.characterGallery ? '/user/images/gallery/img_1.png' : null,
            };
        },
        async reject(payload) {
            calls.reject.push(payload);
            return rejectResult || { ok: true, state: 'rejected' };
        },
    };
}

function runCtx(over = {}) {
    return {
        userTurn: 'Please generate an image of Eloise.',
        attachments: [],
        binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
        sessionId: 'sess-a',
        mode: 'natural',
        manualSelection: 'auto',
        guard: createImageCallGuard(),
        operationId: 'op-1',
        authorized: true,
        ...over,
    };
}

test('1. explicit generation intent permits one call', async () => {
    assert.equal(hasExplicitImageIntent('Could you render a portrait of the chapel at dusk?'), true);
    assert.equal(hasExplicitImageIntent('Sketch her standing at the iron gate'), true);
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: 'Eloise in the chapel', composition: 'character_sheet', subjects: [{ name: 'Eloise', kind: 'character' }] },
        runContext: runCtx({ userTurn: 'Could you render a portrait of the chapel at dusk?' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet' },
        bridge,
    });
    assert.equal(result.bridgeCalls, 1);
    assert.equal(result.visible.state, 'generated_pending');
    assert.equal(result.proposal.state, 'generated_pending');
});

async function executeSpend(userTurn, subjects, extraTool = {}) {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: 'visual content', composition: 'character_sheet', subjects, ...extraTool },
        runContext: runCtx({ userTurn }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    return { spent: result.spent, calls: result.bridgeCalls, generate: bridge.calls.generate.length, state: result.visible?.state };
}

test('depictive generate/render shorthand and scene show/create/make spend once', async () => {
    const pair = [{ name: 'Eloise' }, { name: 'Caius' }];
    assert.equal(hasExplicitImageIntent('Generate Eloise and Caius talking', pair), true);
    assert.equal(hasExplicitImageIntent('Render Caius in the nave', [{ name: 'Caius' }]), true);
    assert.equal(hasExplicitImageIntent('Create Rook and Ilya arguing', [{ name: 'Rook' }, { name: 'Ilya' }]), true);
    assert.equal(hasExplicitImageIntent('Make Seraphina standing by the gate', [{ name: 'Seraphina' }]), true);
    const plan = await executeSpend('Generate Eloise and Caius talking', pair);
    assert.equal(plan.calls, 1);
    assert.equal(plan.generate, 1);
    assert.equal(plan.state, 'generated_pending');
    const unseen = await executeSpend('Render Ilya at the iron rail', [{ name: 'Ilya' }]);
    assert.equal(unseen.calls, 1);
    const sceneShow = await executeSpend('Show Seraphina and Eloise talking', [{ name: 'Seraphina' }, { name: 'Eloise' }]);
    assert.equal(sceneShow.calls, 1);
    assert.equal(sceneShow.generate, 1);
});

test('prompt-writing and text-product requests spend zero even with names or image words', async () => {
    const eloise = [{ name: 'Eloise' }];
    assert.equal(hasExplicitImageIntent('Generate an image prompt', eloise), false);
    assert.equal(hasExplicitImageIntent('Help me write an image prompt', eloise), false);
    assert.equal(hasExplicitImageIntent('Generate a summary of Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Write a description of Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Make a list of chapel details', eloise), false);
    assert.equal(hasExplicitImageIntent('Create a story for Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Draft a message to Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Give me a reply from Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Run an analysis of Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Show Eloise\'s card', eloise), false);
    assert.equal(hasExplicitImageIntent('Create a lorebook entry for Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Extract this from chat about Eloise', eloise), false);
    const promptSpend = await executeSpend('Generate an image prompt', eloise);
    assert.equal(promptSpend.calls, 0);
    assert.equal(promptSpend.spent, false);
    const writeSpend = await executeSpend('Help me write an image prompt', eloise);
    assert.equal(writeSpend.calls, 0);
    const summarySpend = await executeSpend('Generate a summary of Eloise', eloise);
    assert.equal(summarySpend.calls, 0);
    const storySpend = await executeSpend('Create a story for Eloise', eloise);
    assert.equal(storySpend.calls, 0);
    const cardSpend = await executeSpend('Show Eloise\'s card', eloise);
    assert.equal(cardSpend.calls, 0);
    const loreSpend = await executeSpend('Create a lorebook entry for Eloise', eloise);
    assert.equal(loreSpend.calls, 0);
});

test('appearance asks without a visual output spend zero; an explicit portrait can pass', async () => {
    const eloise = [{ name: 'Eloise' }];
    assert.equal(hasExplicitImageIntent('Show me what Eloise looks like', eloise), false);
    assert.equal(hasExplicitImageIntent('Make me understand Eloise\'s appearance', eloise), false);
    assert.equal(hasExplicitImageIntent('Describe how Eloise looks', eloise), false);
    const showLooks = await executeSpend('Show me what Eloise looks like', eloise);
    assert.equal(showLooks.calls, 0);
    assert.equal(showLooks.spent, false);
    const makeAppear = await executeSpend('Make me understand Eloise\'s appearance', eloise);
    assert.equal(makeAppear.calls, 0);
    const describeLooks = await executeSpend('Describe how Eloise looks', eloise);
    assert.equal(describeLooks.calls, 0);
    const portrait = await executeSpend('Generate a portrait showing what Eloise looks like', eloise);
    assert.equal(portrait.calls, 1);
    assert.equal(portrait.generate, 1);
});

test('ambiguous show/create/make without scene evidence spends zero', async () => {
    const eloise = [{ name: 'Eloise' }];
    assert.equal(hasExplicitImageIntent('Make Eloise dinner', eloise), false);
    assert.equal(hasExplicitImageIntent('Show Eloise', eloise), false);
    assert.equal(hasExplicitImageIntent('Create Eloise', eloise), false);
    const dinner = await executeSpend('Make Eloise dinner', eloise);
    assert.equal(dinner.calls, 0);
    assert.equal(dinner.spent, false);
    const bareShow = await executeSpend('Show Eloise', eloise);
    assert.equal(bareShow.calls, 0);
    const invented = await executeSpend('Make something happen tonight', [{ name: 'Mara' }]);
    assert.equal(invented.calls, 0);
});

test('zero-subject environment and object requests stay environment or object', () => {
    assert.equal(resolveNaturalComposition({
        userTurn: 'Generate an image of the chapel at dusk',
        subjects: [],
        toolComposition: 'environment',
    }), 'environment');
    assert.equal(resolveNaturalComposition({
        userTurn: 'Render a picture of the lantern on the altar',
        subjects: [],
        toolComposition: 'object',
    }), 'object');
    assert.notEqual(resolveNaturalComposition({
        userTurn: 'Generate an image of the chapel at dusk',
        subjects: [],
        toolComposition: 'environment',
    }), 'single_character_scene');
});

test('2. appearance questions, prompt-writing, and accidental calls spend nothing', async () => {
    assert.equal(hasExplicitImageIntent('What color are her eyes in this scene?'), false);
    assert.equal(hasExplicitImageIntent('Help me write a better image prompt for this moment'), false);
    assert.equal(hasExplicitImageIntent('Draw a conclusion from her silence'), false);
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: 'Eloise', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: runCtx({ userTurn: 'What does Eloise look like lately?' }),
        bridge,
    });
    assert.equal(result.spent, false);
    assert.equal(result.bridgeCalls, 0);
    assert.equal(result.visible.state, 'refused');
});

test('3. a second generate_image call in the same turn spends nothing', async () => {
    const bridge = mockBridge();
    const ctx = runCtx();
    const first = await executeGenerateImage({
        toolInput: { prompt: 'Eloise', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: ctx,
        bridge,
    });
    const second = await executeGenerateImage({
        toolInput: { prompt: 'Eloise again', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: ctx,
        bridge,
    });
    assert.equal(first.bridgeCalls, 1);
    assert.equal(second.bridgeCalls, 0);
    assert.equal(second.spent, false);
    assert.equal(bridge.calls.generate.length, 1);
});

test('4. no automatic retry follows a provider error', async () => {
    const bridge = mockBridge({ failGenerate: true });
    const result = await executeGenerateImage({
        toolInput: { prompt: 'Eloise', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: runCtx(),
        bridge,
    });
    assert.equal(bridge.calls.generate.length, 1);
    assert.equal(result.bridgeCalls, 1);
    assert.equal(result.proposal, null);
    const retryGuard = runCtx();
    retryGuard.guard.tryConsume();
    const afterFailure = await executeGenerateImage({
        toolInput: { prompt: 'Eloise', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: retryGuard,
        bridge,
    });
    assert.equal(afterFailure.bridgeCalls, 0);
});

test('5. generic single-character + reference produces the supplied Tegaki starter', async () => {
    const prompt = composeProviderPrompt({
        content: 'Eloise standing, long dark hair, green eyes',
        styleFragment: SHIPPED_STYLE_FRAGMENTS['anime-tegaki-character-sheet'],
        composition: 'character_sheet',
        hasAcceptedReference: true,
        mode: 'natural',
    });
    assert.equal(prompt.startsWith(`${TEGAKI_FRAMING.withReference}, pixiv tegaki scribble, `), true);
    assert.equal(prompt.includes('character sheet OC (attached) body measurements, pixiv tegaki scribble, Eloise standing, long dark hair, green eyes'), true);
});

test('6. generic single-character without reference omits only (attached)', async () => {
    const prompt = composeProviderPrompt({
        content: 'Eloise standing, long dark hair, green eyes',
        styleFragment: SHIPPED_STYLE_FRAGMENTS['anime-tegaki-character-sheet'],
        composition: 'character_sheet',
        hasAcceptedReference: false,
        mode: 'natural',
    });
    assert.equal(prompt.startsWith(`${TEGAKI_FRAMING.withoutReference}, pixiv tegaki scribble, `), true);
    assert.equal(prompt.includes('(attached)'), false);
});

test('7. portrait omits body measurements and sheet wording', async () => {
    const prompt = composeProviderPrompt({
        content: 'close-up of Eloise facing the candlelight',
        styleFragment: SHIPPED_STYLE_FRAGMENTS['anime-tegaki-character-sheet'],
        composition: 'portrait',
        hasAcceptedReference: true,
        mode: 'natural',
    });
    assert.equal(prompt.includes('character sheet'), false);
    assert.equal(prompt.includes('body measurements'), false);
    assert.equal(prompt.startsWith('pixiv tegaki scribble, '), true);
});

test('bare one-character request stays sheet even if Copilot reports a scene, with a reference', async () => {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'Eloise in a chapel nave, candlelight on stone, standing at the door in a riding coat',
            composition: 'single_character_scene',
            subjects: [{ name: 'Eloise', kind: 'character', cardId: 'eloise.png' }],
        },
        runContext: runCtx({ userTurn: 'Generate an image of Eloise' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        referenceSources: {
            cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png', dataUrl: PNG_A }],
        },
        bridge,
    });
    assert.equal(result.request.composition, 'character_sheet');
    assert.equal(result.proposal.composition, 'character_sheet');
    assert.equal(result.request.prompt.startsWith('character sheet OC (attached) body measurements, pixiv tegaki scribble, '), true);
});

test('bare one-character request stays sheet with no reference, omitting only (attached)', async () => {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'Eloise in a chapel nave, candlelight on stone, standing at the door in a riding coat',
            composition: 'single_character_scene',
            subjects: [{ name: 'Eloise', kind: 'character' }],
        },
        runContext: runCtx({ userTurn: 'Generate an image of Eloise' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        referenceSources: { cards: [] },
        bridge,
    });
    assert.equal(result.request.composition, 'character_sheet');
    assert.equal(result.proposal.composition, 'character_sheet');
    assert.equal(result.request.prompt.startsWith('character sheet OC body measurements, pixiv tegaki scribble, '), true);
    assert.equal(result.request.prompt.includes('(attached)'), false);
});

test('optional style wording on a one-person ask still resolves to sheet', async () => {
    const meaning = resolveNaturalComposition({
        userTurn: 'Draw Mara in watercolor',
        subjects: [{ name: 'Mara', kind: 'character' }],
        toolComposition: 'single_character_scene',
    });
    assert.equal(meaning, 'character_sheet');
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'Mara beside a wet street lamp, coat dripping',
            composition: 'single_character_scene',
            subjects: [{ name: 'Mara', kind: 'character' }],
            style_override: 'watercolor',
        },
        runContext: runCtx({ userTurn: 'Draw Mara in watercolor' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.composition, 'character_sheet');
    assert.equal(result.proposal.composition, 'character_sheet');
});

test('explicit portrait from the user turn stays portrait', async () => {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'close view of Ilya facing a window',
            composition: 'single_character_scene',
            subjects: [{ name: 'Ilya', kind: 'character' }],
        },
        runContext: runCtx({ userTurn: 'Make a close-up portrait of Ilya' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.composition, 'portrait');
    assert.equal(result.request.prompt.includes('character sheet'), false);
    assert.equal(result.request.prompt.includes('body measurements'), false);
});

test('explicit one-character action or place from the user turn stays a scene', async () => {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'Rook bracing a chapel door against the wind',
            composition: 'character_sheet',
            subjects: [{ name: 'Rook', kind: 'character' }],
        },
        runContext: runCtx({ userTurn: 'Show a picture of Rook talking in the chapel' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.composition, 'single_character_scene');
    assert.equal(result.request.prompt.includes('character sheet'), false);
    assert.equal(result.request.prompt.includes('body measurements'), false);
    assert.equal(result.request.prompt.startsWith('pixiv tegaki scribble, '), true);
});

test('8. Eloise and Caius talking keeps style but omits sheet/body wording', async () => {
    const prompt = composeProviderPrompt({
        content: 'Eloise and Caius talking in the chapel',
        styleFragment: SHIPPED_STYLE_FRAGMENTS['anime-tegaki-character-sheet'],
        composition: 'multi_character_scene',
        hasAcceptedReference: false,
        mode: 'natural',
    });
    assert.equal(prompt, 'pixiv tegaki scribble, Eloise and Caius talking in the chapel');
    assert.equal(prompt.includes('character sheet'), false);
    assert.equal(prompt.includes('body measurements'), false);
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'Eloise and Caius talking in the chapel',
            composition: 'character_sheet',
            subjects: [{ name: 'Eloise' }, { name: 'Caius' }],
        },
        runContext: runCtx({ userTurn: 'Generate an image of Eloise and Caius talking' }),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.composition, 'multi_character_scene');
    assert.equal(result.request.prompt.includes('character sheet'), false);
    assert.equal(result.request.prompt.includes('body measurements'), false);
});

test('9. a request-level style override does not change the per-chat default', async () => {
    const style = resolveStyle({
        selectedStyleId: 'anime-tegaki-character-sheet',
        styleOverride: 'watercolor',
        fragments: SHIPPED_STYLE_FRAGMENTS,
    });
    assert.equal(style.id, 'watercolor');
    assert.equal(style.savedStyleId, 'anime-tegaki-character-sheet');
    assert.equal(style.overrideApplied, true);
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: {
            prompt: 'wet cobblestones after rain',
            composition: 'environment',
            subjects: [],
            style_override: 'watercolor',
        },
        runContext: runCtx(),
        styleState: { selectedStyleId: 'anime-tegaki-character-sheet', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.savedStyleId, 'anime-tegaki-character-sheet');
    assert.equal(result.request.style.id, 'watercolor');
});

test('10. manual prompt + None reaches the mock provider byte-for-byte', async () => {
    const exact = 'Keep this 1:1 — punctuation; “quotes”; and a newline stays out because this is one line.';
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: exact, composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: runCtx({ mode: 'manual', userTurn: '', styleOverride: 'none' }),
        styleState: { selectedStyleId: 'none', styleOverride: 'none', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.prompt, exact);
});

test('11. manual prompt + selected style adds only the selected deterministic prefix', async () => {
    const exact = 'Eloise at the iron gate, lantern raised';
    const composed = composeProviderPrompt({
        content: exact,
        styleFragment: SHIPPED_STYLE_FRAGMENTS.watercolor,
        composition: 'portrait',
        mode: 'manual',
    });
    assert.equal(composed, `${SHIPPED_STYLE_FRAGMENTS.watercolor}, ${exact}`);
    assert.equal(composed.includes('character sheet'), false);
});

test('12. manual attachment outranks an applicable card/persona reference', async () => {
    const refs = resolveReferences({
        requestAttachments: [{ id: 'att1', name: 'shot.png', isImage: true, dataUrl: PNG_A, subjectName: 'Eloise' }],
        subjects: [{ name: 'Eloise', kind: 'character', cardId: 'eloise.png' }],
        cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png', dataUrl: PNG_B }],
        persona: { name: 'the maintainer', dataUrl: PNG_B },
        manualSelection: 'auto',
    });
    assert.equal(refs.references.length, 1);
    assert.equal(refs.references[0].source, 'attachment');
    assert.equal(refs.references[0].dataUrl, PNG_A);
});

test('13. card and persona references resolve; missing references do not claim (attached)', async () => {
    const withCard = resolveReferences({
        subjects: [{ name: 'Eloise', kind: 'character', cardId: 'eloise.png' }],
        cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png', dataUrl: PNG_A }],
        manualSelection: 'auto',
    });
    assert.equal(withCard.claimedAttached, true);
    assert.equal(withCard.references[0].source, 'card');
    const withPersona = resolveReferences({
        subjects: [{ name: 'the maintainer', kind: 'persona' }],
        persona: { name: 'the maintainer', id: 'persona.png', dataUrl: PNG_A },
        manualSelection: 'auto',
    });
    assert.equal(withPersona.claimedAttached, true);
    const missing = resolveReferences({
        subjects: [{ name: 'Eloise', kind: 'character' }],
        cards: [],
        persona: null,
        manualSelection: 'auto',
    });
    assert.equal(missing.claimedAttached, false);
    const noneClaim = composeProviderPrompt({
        content: 'Eloise',
        styleFragment: 'pixiv tegaki scribble',
        composition: 'character_sheet',
        hasAcceptedReference: missing.claimedAttached,
        mode: 'natural',
    });
    assert.equal(noneClaim.includes('(attached)'), false);
});

test('16. model-visible tool result contains no image bytes, secret, or private path', async () => {
    assert.equal(visibleToolResultIsSafe(MODEL_VISIBLE_PENDING_RESULT), true);
    const saved = sanitizeToolCallsForSave([{
        name: 'generate_image',
        input: { prompt: 'Eloise', dataUrl: PNG_A },
        result: { success: true, state: 'generated_pending', bytes: PNG_A, path: '/home/opc/secret.png', previewUrl: '/tmp/x' },
    }]);
    const text = JSON.stringify(saved);
    assert.equal(text.includes('data:image/'), false);
    assert.equal(text.includes('/home/'), false);
    assert.equal(saved[0].result.state, 'generated_pending');
});

test('17-18. Apply makes no provider generate call and repeated Apply does not duplicate', async () => {
    const bridge = mockBridge();
    const bucket = migrateBucket({ sessions: [] });
    const message = { id: 'msg_1', attachments: [], imageProposals: [] };
    const proposal = {
        state: 'generated_pending',
        pendingId: 'pend_1',
        format: 'png',
        prompt: 'Eloise',
        style: { id: 'anime-tegaki-character-sheet', label: 'Anime — Tegaki Character Sheet' },
        composition: 'character_sheet',
        subjects: [{ name: 'Eloise', kind: 'character', cardId: 'eloise.png' }],
        referencesAccepted: [],
        binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
    };
    const first = await executeApply({
        proposal,
        currentBinding: proposal.binding,
        messageId: 'msg_1',
        destinations: {},
        bridge,
        bucket,
        message,
        cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png' }],
    });
    const second = await executeApply({
        proposal,
        currentBinding: proposal.binding,
        messageId: 'msg_1',
        destinations: {},
        bridge,
        bucket,
        message,
        cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png' }],
    });
    assert.equal(first.generateCalls, 0);
    assert.equal(second.generateCalls, 0);
    assert.equal(bridge.calls.generate.length, 0);
    assert.equal(bridge.calls.apply.length, 2);
    assert.equal(bucket.images.length, 1);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].url, '/user/images/img_1.png');
    assert.equal(first.envelope.imageId, 'img_1');
    assert.equal(first.envelope.imageUrl, '/user/images/img_1.png');
    assert.equal(bucket.images[0].path, first.envelope.imageUrl);
});

test('19. Reject makes no generate call, creates no catalog record', async () => {
    const bridge = mockBridge();
    const bucket = migrateBucket({ sessions: [] });
    const message = { id: 'msg_1', imageProposals: [{ pendingId: 'pend_1' }] };
    const proposal = {
        state: 'generated_pending',
        pendingId: 'pend_1',
        binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
    };
    message.imageProposals = [proposal];
    const result = await executeReject({
        proposal,
        currentBinding: proposal.binding,
        bridge,
        bucket,
        message,
    });
    assert.equal(result.generateCalls, 0);
    assert.equal(bridge.calls.generate.length, 0);
    assert.equal(bridge.calls.reject.length, 1);
    assert.equal((bucket.images || []).length, 0);
    assert.equal((message.imageProposals || []).length, 0);
    const roundtrip = JSON.parse(JSON.stringify({ messages: [message] }));
    const leftover = (roundtrip.messages || []).flatMap(m => m.imageProposals || []).filter(p => p.state === 'generated_pending');
    assert.equal(leftover.length, 0);
    assert.equal(proposal.state, 'rejected');
});

test('21. applied URL attachments render from url || dataUrl after reload', () => {
    const att = { id: 'img_1', name: 'generated.png', mimeType: 'image/png', isImage: true, url: '/user/images/img_1.png', generatedImageId: 'img_1' };
    const roundtrip = JSON.parse(JSON.stringify({ attachments: [att] }));
    assert.equal(getAttachmentSrc(roundtrip.attachments[0]), '/user/images/img_1.png');
    assert.equal(getAttachmentSrc({ dataUrl: PNG_A }), PNG_A);
    assert.equal(getAttachmentSrc({ url: '/user/images/x.png', dataUrl: PNG_A }), '/user/images/x.png');
});

test('22. applied images survive session switching and remain in the chat gallery', () => {
    const bucket = migrateBucket({
        activeSessionId: 'sess-a',
        sessions: [{ id: 'sess-a', messages: [] }, { id: 'sess-b', messages: [] }],
        images: [{ id: 'img_1', path: '/user/images/img_1.png', created: 2, style: { label: 'Watercolor' }, subjects: [{ name: 'Eloise' }] }],
    });
    bucket.activeSessionId = 'sess-b';
    const records = galleryRecords(bucket);
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'img_1');
    assert.equal(sortCatalog(records, 'newest')[0].id, 'img_1');
});

test('23. the 400-message cap does not remove bucket-level gallery records', () => {
    const bucket = migrateBucket({
        sessions: [{ id: 'sess-a', messages: Array.from({ length: 410 }, (_, i) => ({ id: `m${i}`, content: 'x' })) }],
        images: [{ id: 'img_1', path: '/user/images/img_1.png', created: 1 }],
    });
    capSessionMessages(bucket.sessions[0], 400);
    assert.equal(bucket.sessions[0].messages.length, 400);
    assert.equal(bucket.images.length, 1);
});

test('25. multi-character and card-uncertain results cannot be copied to one card gallery', () => {
    const multi = isCharacterGalleryEligible({
        subjects: [{ name: 'Eloise', kind: 'character' }, { name: 'Caius', kind: 'character' }],
        composition: 'multi_character_scene',
        cards: [{ name: 'Eloise', avatar: 'e.png' }, { name: 'Caius', avatar: 'c.png' }],
    });
    const uncertain = isCharacterGalleryEligible({
        subjects: [{ name: 'a stranger', kind: 'character' }],
        composition: 'character_sheet',
        cards: [{ name: 'Eloise', avatar: 'e.png' }],
    });
    const one = isCharacterGalleryEligible({
        subjects: [{ name: 'Eloise', kind: 'character', cardId: 'e.png' }],
        composition: 'character_sheet',
        cards: [{ name: 'Eloise', avatar: 'e.png', cardId: 'e.png' }],
    });
    assert.equal(multi.eligible, false);
    assert.equal(uncertain.eligible, false);
    assert.equal(one.eligible, true);
});

test('26. main-roleplay add reuses the applied file and adds one system media message', () => {
    const msg = buildMainRoleplayMessage({ url: '/user/images/img_1.png', name: 'generated.png' });
    assert.equal(isSafeMainRoleplayMessage(msg), true);
    assert.equal(msg.is_system, true);
    assert.equal(msg.is_user, false);
    assert.equal(msg.extra.media.length, 1);
    assert.equal(msg.extra.media[0].url, '/user/images/img_1.png');
    assert.equal(msg.sc_ghosted, undefined);
    assert.equal(msg.tool_invocations, undefined);
    const bucket = migrateBucket({ sessions: [] });
    const message = { id: 'msg_1', attachments: [] };
    const local = applyLocalDestinations({
        proposal: {
            state: 'generated_pending',
            pendingId: 'pend_1',
            format: 'png',
            prompt: 'Eloise',
            style: { id: 'x', label: 'x' },
            composition: 'character_sheet',
            subjects: [{ name: 'Eloise' }],
            referencesAccepted: [],
            binding: { chatId: 'c', charId: 'h', sessionId: 's' },
        },
        applyResponse: { ok: true, imageId: 'img_1', imageUrl: '/user/images/img_1.png', galleryUrl: null },
        message,
        bucket,
        addToRoleplay: true,
    });
    assert.equal(local.ok, true);
    assert.equal(local.envelope.imageUrl, '/user/images/img_1.png');
    assert.equal(local.mainRoleplayMessage.extra.media[0].url, '/user/images/img_1.png');
    assert.equal(local.mainRoleplayMessage.extra[ROLEPLAY_IMAGE_MARKER], 'img_1');
});

test('27. applying after switching chats is refused', async () => {
    const bridge = mockBridge();
    const result = await executeApply({
        proposal: {
            state: 'generated_pending',
            pendingId: 'pend_1',
            binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
        },
        currentBinding: { chatId: 'chat-b', charId: 'char-a', sessionId: 'sess-a' },
        messageId: 'msg_1',
        bridge,
        bucket: migrateBucket({}),
        message: { id: 'msg_1', attachments: [] },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'binding_mismatch');
    assert.equal(result.generateCalls, 0);
    assert.equal(bridge.calls.apply.length, 0);
    assert.equal(bindingsMatch({ chatId: 'a', charId: '1', sessionId: 's' }, { chatId: 'a', charId: '1', sessionId: 's' }), true);
});

test('28. keys, prompts, and base64 image bodies are absent from logs and saved session JSON', () => {
    const log = buildSafeImageLog({ requestId: 'op-1', model: 'gpt-image-2-c', route: 'edits', outcome: 'ok', duration: 12 });
    assert.equal(JSON.stringify(log).includes('Eloise'), false);
    assert.equal(JSON.stringify(log).includes('data:image'), false);
    const proposal = sanitizeProposalForSession({
        pendingId: 'pend_1',
        prompt: 'Eloise',
        dataUrl: PNG_A,
        bytes: 'SECRET',
        privatePath: '/home/opc/secret.png',
        referencesAccepted: [{ name: 'Eloise avatar', source: 'card', dataUrl: PNG_A }],
        binding: { chatId: 'c', charId: 'h', sessionId: 's' },
    });
    assert.equal(proposal.dataUrl, undefined);
    assert.equal(proposal.bytes, undefined);
    assert.equal(proposal.privatePath, undefined);
    const session = {
        images: [{ id: 'img_1', path: '/user/images/img_1.png', prompt: 'Eloise' }],
        messages: [{ attachments: [{ url: '/user/images/img_1.png', isImage: true }] }],
    };
    const flags = sessionJsonContainsSecrets(session);
    assert.equal(flags.hasBase64Body, false);
    assert.equal(flags.hasApiKey, false);
    assert.equal(flags.hasPrivatePath, false);
});

test('29. grounded-prompt fixture preserves distinctive facts and identity', () => {
    const composed = composeProviderPrompt({
        content: GROUNDED_PROMPT_FIXTURE.copilotPrompt,
        styleFragment: SHIPPED_STYLE_FRAGMENTS['anime-tegaki-character-sheet'],
        composition: 'single_character_scene',
        hasAcceptedReference: true,
        mode: 'natural',
    });
    assert.equal(groundedPromptPreservesFacts(composed), true);
    assert.equal(composed.includes('character sheet'), false);
    assert.equal(composed.includes(GROUNDED_PROMPT_FIXTURE.clothing), true);
});

test('text swipes preserve applied attachments', () => {
    const msg = {
        content: 'old',
        reasoning: null,
        attachments: [{ generatedImageId: 'img_1', url: '/user/images/img_1.png', isImage: true }],
        imageProposals: [{ state: 'applied', appliedImageId: 'img_1' }],
    };
    preserveAppliedFieldsOnTextChange(msg, { content: 'new swipe text', reasoning: 'thoughts' });
    assert.equal(msg.content, 'new swipe text');
    assert.equal(msg.attachments[0].generatedImageId, 'img_1');
    assert.equal(msg.imageProposals[0].state, 'applied');
});

test('Apply envelope uses imageId, imageUrl, galleryUrl and rejects the old mock shape', () => {
    const real = readApplyEnvelope({
        ok: true,
        state: 'applied',
        imageId: 'img_1',
        imageUrl: '/user/images/img_1.png',
        galleryUrl: '/user/images/Eloise/img_1.png',
    });
    assert.equal(real.imageId, 'img_1');
    assert.equal(real.imageUrl, '/user/images/img_1.png');
    assert.equal(real.galleryUrl, '/user/images/Eloise/img_1.png');
    assert.equal(readApplyEnvelope({
        ok: true,
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        characterGalleryUrl: '/user/images/Eloise/img_1.png',
    }), null);
});

test('executeApply fails closed on the old url/characterGalleryUrl mock', async () => {
    const bridge = mockBridge({
        applyResult: { ok: true, state: 'applied', imageId: 'img_1', url: '/user/images/img_1.png', characterGalleryUrl: '/x' },
    });
    const result = await executeApply({
        proposal: {
            state: 'generated_pending',
            pendingId: 'pend_1',
            format: 'png',
            prompt: 'Eloise',
            style: { id: 'x', label: 'x' },
            composition: 'character_sheet',
            subjects: [{ name: 'Eloise', kind: 'character', cardId: 'e.png' }],
            referencesAccepted: [],
            binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
        },
        currentBinding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
        messageId: 'msg_1',
        bridge,
        bucket: migrateBucket({}),
        message: { id: 'msg_1', attachments: [] },
        cards: [{ name: 'Eloise', avatar: 'e.png', cardId: 'e.png' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid_apply_envelope');
    assert.equal(result.generateCalls, 0);
});

test('manual Auto/Card/Persona work with no subject fields; None stays empty', () => {
    const cards = [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png', dataUrl: PNG_A }];
    const persona = { name: 'the maintainer', id: 'persona.png', dataUrl: PNG_B };
    const none = resolveReferences({ cards, persona, manualSelection: 'none', mode: 'manual' });
    assert.equal(none.references.length, 0);
    const cardOnly = resolveReferences({ cards, persona, subjects: [], manualSelection: 'card', mode: 'manual' });
    assert.equal(cardOnly.references.length, 1);
    assert.equal(cardOnly.references[0].source, 'card');
    assert.equal(cardOnly.references[0].dataUrl, PNG_A);
    const personaOnly = resolveReferences({ cards, persona, subjects: [], manualSelection: 'persona', mode: 'manual' });
    assert.equal(personaOnly.references.length, 1);
    assert.equal(personaOnly.references[0].source, 'persona');
    assert.equal(personaOnly.references[0].dataUrl, PNG_B);
    const autoAtt = resolveReferences({
        requestAttachments: [{ id: 'att1', name: 'shot.png', isImage: true, dataUrl: PNG_A }],
        cards,
        persona,
        subjects: [],
        manualSelection: 'auto',
        mode: 'manual',
    });
    assert.equal(autoAtt.references.length, 1);
    assert.equal(autoAtt.references[0].source, 'attachment');
    const autoNoAtt = resolveReferences({
        cards,
        persona,
        subjects: [],
        manualSelection: 'auto',
        mode: 'manual',
    });
    assert.deepEqual(autoNoAtt.references.map(r => r.source), ['card']);
    const autoNoCard = resolveReferences({
        cards: [],
        persona,
        subjects: [],
        manualSelection: 'auto',
        mode: 'manual',
    });
    assert.deepEqual(autoNoCard.references.map(r => r.source), ['persona']);
    const inferred = inferSubjectsFromReferences(cardOnly.references, { cards, persona });
    assert.equal(inferred.length, 1);
    assert.equal(inferred[0].name, 'Eloise');
    assert.equal(inferred[0].cardId, 'eloise.png');
    assert.equal(isCharacterGalleryEligible({
        subjects: inferred,
        composition: 'character_sheet',
        cards,
        references: cardOnly.references,
    }).eligible, true);
});

test('sanitizeToolCallsForSave keeps refused and error states while stripping secrets', () => {
    const refused = sanitizeToolCallsForSave([{
        name: 'generate_image',
        status: 'done',
        input: { prompt: 'Eloise', dataUrl: PNG_A },
        result: { success: false, state: 'refused', message: 'No image was generated.', path: '/home/opc/secret.png' },
    }]);
    assert.equal(refused[0].result.state, 'refused');
    assert.equal(refused[0].result.success, false);
    assert.equal(JSON.stringify(refused).includes('/home/'), false);
    const errored = sanitizeToolCallsForSave([{
        name: 'generate_image',
        status: 'error',
        input: { prompt: 'Eloise' },
        result: { success: false, state: 'error', message: 'Image generation failed.' },
    }]);
    assert.equal(errored[0].result.state, 'error');
    assert.notEqual(errored[0].result.state, 'generated_pending');
});

test('unauthorized natural runs and addUserMsg=false never spend an image call', async () => {
    assert.equal(shouldAuthorizeImageRun({ addUserMsg: true, allowImageGeneration: true }), true);
    assert.equal(shouldAuthorizeImageRun({ addUserMsg: false, allowImageGeneration: true }), false);
    assert.equal(shouldAuthorizeImageRun({ addUserMsg: false }), false);
    assert.equal(shouldAuthorizeImageRun({ addUserMsg: true, allowImageGeneration: false }), false);
    const bridge = mockBridge();
    const denied = await executeGenerateImage({
        toolInput: { prompt: 'Eloise', composition: 'character_sheet', subjects: [{ name: 'Eloise' }] },
        runContext: runCtx({ authorized: false, userTurn: 'Could you render a portrait of the chapel at dusk?' }),
        bridge,
    });
    assert.equal(denied.bridgeCalls, 0);
    assert.equal(denied.spent, false);
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const indexSrc = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
    const chatSrc = fs.readFileSync(path.join(root, 'src/ui/ui-chat.js'), 'utf8');
    const apiSrc = fs.readFileSync(path.join(root, 'src/api.js'), 'utf8');
    assert.match(indexSrc, /runGenerate\(getCurrentSession\(\), text, true, processedAtts, \{ allowImageGeneration: true \}\)/);
    assert.match(indexSrc, /runGenerate\(sess, userMsg\.content, false\)/);
    assert.match(chatSrc, /runGenerate\(session, newText, false\)/);
    assert.match(chatSrc, /runGenerate\(session, null, false\)/);
    assert.equal((indexSrc.match(/allowImageGeneration:\s*true/g) || []).length, 1);
    assert.equal((chatSrc.match(/allowImageGeneration:\s*true/g) || []).length, 0);
    assert.match(apiSrc, /shouldAuthorizeImageRun\(\{\s*addUserMsg,\s*allowImageGeneration: options\.allowImageGeneration,/);
});

test('pending proposal cards render only while generated_pending', () => {
    assert.equal(shouldRenderProposalCard({ state: 'generated_pending', pendingId: 'p' }), true);
    assert.equal(shouldRenderProposalCard({ state: 'applied', pendingId: 'p' }), false);
    assert.equal(shouldRenderProposalCard({ state: 'rejected', pendingId: 'p' }), false);
});

test('clearAttachmentWrappers removes existing wrappers before a new render', () => {
    const kids = [];
    const makeWrap = () => {
        const el = {
            className: 'scp-msg-attachments',
            remove() {
                const i = kids.indexOf(this);
                if (i >= 0) kids.splice(i, 1);
            },
        };
        kids.push(el);
        return el;
    };
    makeWrap();
    makeWrap();
    const root = {
        querySelectorAll(sel) {
            return sel === '.scp-msg-attachments' ? kids.slice() : [];
        },
    };
    assert.equal(clearAttachmentWrappers(root), 2);
    assert.equal(kids.length, 0);
    makeWrap();
    assert.equal(clearAttachmentWrappers(root), 1);
    assert.equal(kids.length, 0);
});

test('roleplay insert uses the ordinary ST message path and is idempotent by image id', async () => {
    const events = [];
    const chat = [];
    const context = {
        chat,
        eventSource: {
            async emit(type, id, source) { events.push([type, id, source]); },
        },
        eventTypes: { MESSAGE_RECEIVED: 'message_received', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered' },
        addOneMessage(msg) { events.push(['addOneMessage', msg.extra[ROLEPLAY_IMAGE_MARKER]]); },
        async saveChat() { events.push(['saveChat']); },
        scrollOnMediaLoad() { events.push(['scrollOnMediaLoad']); },
    };
    const first = await insertRoleplayMediaMessage({
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        name: 'generated.png',
        context,
    });
    assert.equal(first.ok, true);
    assert.equal(first.already, false);
    assert.equal(chat.length, 1);
    assert.equal(chat[0].is_system, true);
    assert.equal(chat[0].is_user, false);
    assert.equal(chat[0].sc_ghosted, undefined);
    assert.equal(chat[0].tool_invocations, undefined);
    assert.equal(chat[0].extra.media[0].url, '/user/images/img_1.png');
    assert.deepEqual(events.map(e => e[0]), ['message_received', 'addOneMessage', 'character_message_rendered', 'saveChat', 'scrollOnMediaLoad']);
    const second = await insertRoleplayMediaMessage({
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        context,
    });
    assert.equal(second.ok, true);
    assert.equal(second.already, true);
    assert.equal(chat.length, 1);
    assert.equal(findExistingRoleplayMessage(chat, 'img_1'), 0);
});

test('manual generate without subjects still sends forced card bytes', async () => {
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: 'Eloise at the chapel door', composition: 'auto' },
        runContext: runCtx({
            mode: 'manual',
            userTurn: '',
            manualSelection: 'card',
            authorized: true,
        }),
        referenceSources: {
            cards: [{ name: 'Eloise', avatar: 'eloise.png', cardId: 'eloise.png', dataUrl: PNG_A }],
            persona: null,
        },
        bridge,
    });
    assert.equal(result.request.references.length, 1);
    assert.equal(result.request.references[0].source, 'card');
    assert.equal(result.request.references[0].dataUrl, PNG_A);
    assert.equal(result.proposal.subjects[0].name, 'Eloise');
    assert.equal(result.proposal.subjects[0].cardId, 'eloise.png');
});

test('roleplay insert failure is a partial warning, not swallowed success', async () => {
    const context = { chat: null };
    const failed = await insertRoleplayMediaMessage({
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        context,
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'roleplay_insert_failed');
});

test('manual None keeps leading and trailing whitespace on the bridge prompt', async () => {
    const exact = '  Eloise at the iron gate  \n';
    const bridge = mockBridge();
    const result = await executeGenerateImage({
        toolInput: { prompt: exact, composition: 'portrait' },
        runContext: runCtx({ mode: 'manual', userTurn: '', styleOverride: 'none' }),
        styleState: { selectedStyleId: 'none', styleOverride: 'none', fragments: SHIPPED_STYLE_FRAGMENTS },
        bridge,
    });
    assert.equal(result.request.prompt, exact);
    assert.equal(result.request.prompt.startsWith('  '), true);
    assert.equal(result.request.prompt.endsWith('  \n'), true);
});

test('compact retry is only for applied roleplay destination failure', () => {
    assert.equal(shouldShowRoleplayRetry({
        state: 'applied',
        destinationWarning: 'roleplay_insert_failed',
        roleplayDelivery: createRoleplayDeliveryState({ pushed: true }),
    }), true);
    assert.equal(shouldShowRoleplayRetry({
        state: 'generated_pending',
        destinationWarning: 'roleplay_insert_failed',
        roleplayDelivery: createRoleplayDeliveryState({ pushed: true }),
    }), false);
    assert.equal(shouldShowRoleplayRetry({
        state: 'applied',
        destinationWarning: null,
        roleplayDelivery: createRoleplayDeliveryState({
            pushed: true,
            MESSAGE_RECEIVED: true,
            addOneMessage: true,
            CHARACTER_MESSAGE_RENDERED: true,
            saveChat: true,
        }),
    }), false);
    assert.equal(shouldRenderProposalCard({
        state: 'applied',
        destinationWarning: 'roleplay_insert_failed',
        pendingId: 'p',
    }), false);
});

test('partial roleplay apply resumes each remaining stage without generating or duplicating', async () => {
    const ctrl = { failAt: 'message_received' };
    const events = [];
    const chat = [];
    const context = {
        chat,
        eventSource: {
            async emit(type) {
                if (ctrl.failAt === type) {
                    ctrl.failAt = null;
                    throw new Error(`fail ${type}`);
                }
                events.push(type);
            },
        },
        eventTypes: { MESSAGE_RECEIVED: 'message_received', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered' },
        addOneMessage() {
            if (ctrl.failAt === 'addOneMessage') {
                ctrl.failAt = null;
                throw new Error('fail addOneMessage');
            }
            events.push('addOneMessage');
        },
        async saveChat() {
            if (ctrl.failAt === 'saveChat') {
                ctrl.failAt = null;
                throw new Error('fail saveChat');
            }
            events.push('saveChat');
        },
        scrollOnMediaLoad() { events.push('scrollOnMediaLoad'); },
    };
    const bridge = mockBridge();
    const bucket = migrateBucket({ sessions: [] });
    const message = { id: 'msg_1', attachments: [], imageProposals: [] };
    const proposal = {
        state: 'generated_pending',
        pendingId: 'pend_1',
        format: 'png',
        prompt: 'Eloise',
        style: { id: 'x', label: 'x' },
        composition: 'character_sheet',
        subjects: [{ name: 'Eloise', kind: 'character', cardId: 'e.png' }],
        referencesAccepted: [],
        binding: { chatId: 'chat-a', charId: 'char-a', sessionId: 'sess-a' },
    };
    const args = {
        proposal,
        currentBinding: proposal.binding,
        messageId: 'msg_1',
        destinations: { addToRoleplay: true },
        bridge,
        bucket,
        message,
        cards: [{ name: 'Eloise', avatar: 'e.png', cardId: 'e.png' }],
        context,
    };

    let result = await applyDestinationsWithRoleplay(args);
    assert.equal(result.ok, true);
    assert.equal(result.warning, 'roleplay_insert_failed');
    assert.equal(result.generateCalls, 0);
    assert.equal(bridge.calls.generate.length, 0);
    assert.equal(chat.length, 1);
    assert.equal(message.attachments.length, 1);
    assert.equal(bucket.images.length, 1);
    assert.equal(shouldShowRoleplayRetry(proposal), true);
    assert.equal(proposal.roleplayDelivery.pushed, true);
    assert.equal(proposal.roleplayDelivery.MESSAGE_RECEIVED, false);

    ctrl.failAt = 'addOneMessage';
    result = await applyDestinationsWithRoleplay(args);
    assert.equal(result.warning, 'roleplay_insert_failed');
    assert.equal(proposal.roleplayDelivery.MESSAGE_RECEIVED, true);
    assert.equal(proposal.roleplayDelivery.addOneMessage, false);
    assert.equal(events.filter(e => e === 'addOneMessage').length, 0);
    assert.equal(chat.length, 1);

    ctrl.failAt = 'character_message_rendered';
    result = await applyDestinationsWithRoleplay(args);
    assert.equal(proposal.roleplayDelivery.addOneMessage, true);
    assert.equal(proposal.roleplayDelivery.CHARACTER_MESSAGE_RENDERED, false);
    assert.equal(events.filter(e => e === 'addOneMessage').length, 1);
    assert.equal(chat.length, 1);

    ctrl.failAt = 'saveChat';
    result = await applyDestinationsWithRoleplay(args);
    assert.equal(proposal.roleplayDelivery.CHARACTER_MESSAGE_RENDERED, true);
    assert.equal(proposal.roleplayDelivery.saveChat, false);
    assert.equal(events.filter(e => e === 'saveChat').length, 0);

    ctrl.failAt = null;
    result = await applyDestinationsWithRoleplay(args);
    assert.equal(result.warning, null);
    assert.equal(result.partial, false);
    assert.equal(isRoleplayDeliveryComplete(proposal.roleplayDelivery), true);
    assert.equal(shouldShowRoleplayRetry(proposal), false);
    assert.equal(proposal.destinationWarning, null);
    assert.equal(chat.length, 1);
    assert.equal(events.filter(e => e === 'addOneMessage').length, 1);
    assert.equal(events.filter(e => e === 'saveChat').length, 1);
    assert.equal(message.attachments.length, 1);
    assert.equal(bucket.images.length, 1);
    assert.equal(bridge.calls.generate.length, 0);

    const savedChat = [chat[0]];
    const savedEvents = [];
    const savedContext = {
        chat: savedChat,
        eventSource: { async emit(type) { savedEvents.push(type); } },
        eventTypes: { MESSAGE_RECEIVED: 'message_received', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered' },
        addOneMessage() { savedEvents.push('addOneMessage'); },
        async saveChat() { savedEvents.push('saveChat'); },
    };
    const recognized = await insertRoleplayMediaMessage({
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        context: savedContext,
    });
    assert.equal(recognized.already, true);
    assert.equal(savedChat.length, 1);
    assert.equal(savedEvents.length, 0);

    const absent = { chat: [], eventSource: { async emit(type) { } }, eventTypes: { MESSAGE_RECEIVED: 'message_received', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered' }, addOneMessage() {}, async saveChat() {} };
    const inserted = await insertRoleplayMediaMessage({
        imageId: 'img_1',
        url: '/user/images/img_1.png',
        context: absent,
    });
    assert.equal(inserted.ok, true);
    assert.equal(absent.chat.length, 1);
    assert.equal(findExistingRoleplayMessage(absent.chat, 'img_1'), 0);
});

test('forced Active persona uses the selected STD persona avatar, not a guessed name file', () => {
    const selected = resolveActivePersona({
        name1: 'Eloise',
        selectedAvatarId: 'user-default.png',
        windowAvatar: '',
        contextAvatar: '',
        chatPersona: '',
        defaultPersona: '1733826522608-Eloise.png',
    });
    assert.equal(selected.avatar, 'user-default.png');
    assert.equal(selected.name, 'Eloise');
    const noDom = resolveActivePersona({
        name1: 'Eloise',
        selectedAvatarId: '',
        windowAvatar: '',
        contextAvatar: '',
        chatPersona: 'locked.png',
        defaultPersona: 'default.png',
    });
    assert.equal(noDom.avatar, 'locked.png');
    const empty = resolveActivePersona({ name1: 'Eloise' });
    assert.equal(empty.avatar, '');
});

test('selectedPersonaAvatarId reads the SillyTavern persona picker selected node', () => {
    const doc = {
        querySelector(sel) {
            if (!String(sel).includes('avatar-container.selected')) return null;
            return { getAttribute(name) { return name === 'data-avatar-id' ? 'user-default.png' : ''; }, dataset: { avatarId: 'user-default.png' } };
        },
    };
    assert.equal(selectedPersonaAvatarId(doc), 'user-default.png');
    assert.equal(selectedPersonaAvatarId({ querySelector() { return null; } }), '');
});

test('persona thumbnail URL uses the SillyTavern getThumbnailUrl persona seam', () => {
    const url = personaThumbnailUrl('user-default.png', (type, file) => `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`);
    assert.equal(url, '/thumbnail?type=persona&file=user-default.png');
    assert.equal(personaThumbnailUrl('', () => '/nope'), '');
    assert.equal(personaThumbnailUrl('user-default.png'), encodeURI('/User Avatars/user-default.png'));
});

