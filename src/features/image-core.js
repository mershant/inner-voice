export const DEFAULT_STYLE_ID = 'anime-tegaki-character-sheet';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2-c';
export const IMAGE_TOOL_NAME = 'generate_image';
export const BRIDGE_PREFIX = '/api/plugins/st-copilot-linkapi-image';
export const MAX_PROMPT_CHARS = 20000;
export const MAX_MODEL_CHARS = 100;
export const MAX_REFERENCE_COUNT = 16;
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_TOTAL_BYTES = 25 * 1024 * 1024;
export const SESSION_MESSAGE_CAP = 400;
export const ROLEPLAY_IMAGE_MARKER = 'copilotGeneratedImageId';

export const TEGAKI_FRAMING = {
    withReference: 'character sheet OC (attached) body measurements',
    withoutReference: 'character sheet OC body measurements',
};

export const SHIPPED_STYLE_FRAGMENTS = {
    'anime-tegaki-character-sheet': 'pixiv tegaki scribble',
    'anime-polished-illustration': 'polished anime illustration, clean lineart, smooth cel shading, vibrant color',
    'anime-visual-novel-cg': 'anime visual novel CG, soft shading, clean digital coloring',
    'manga-monochrome': 'monochrome manga, black and white ink, screentone shading',
    'realistic-photograph': 'realistic photograph, photorealistic, natural color, fine photographic detail',
    'cinematic-realism': 'cinematic film still, photorealistic, film grain, rich color grading',
    'painterly-concept-art': 'painterly concept art, digital painting, visible brushstrokes',
    'watercolor': 'watercolor painting, soft pigment washes, paper texture, gentle color bleed',
    none: '',
    custom: '',
};

export const STYLE_PRESETS = [
    { id: 'anime-tegaki-character-sheet', label: 'Anime — Tegaki Character Sheet' },
    { id: 'anime-polished-illustration', label: 'Anime — Polished Illustration' },
    { id: 'anime-visual-novel-cg', label: 'Anime — Visual Novel CG' },
    { id: 'manga-monochrome', label: 'Manga — Monochrome' },
    { id: 'realistic-photograph', label: 'Realistic Photograph' },
    { id: 'cinematic-realism', label: 'Cinematic Realism' },
    { id: 'painterly-concept-art', label: 'Painterly Concept Art' },
    { id: 'watercolor', label: 'Watercolor' },
    { id: 'none', label: 'None / Follow Request' },
    { id: 'custom', label: 'Custom' },
];

export const NATURAL_COMPOSITIONS = [
    'character_sheet',
    'portrait',
    'single_character_scene',
    'multi_character_scene',
    'environment',
    'object',
    'other',
];

export const MANUAL_COMPOSITIONS = [
    'auto',
    'character_sheet',
    'portrait',
    'scene',
    'environment',
    'object',
    'other',
];

export const MODEL_VISIBLE_PENDING_RESULT = {
    success: true,
    state: 'generated_pending',
    message: 'One image was generated and awaits the user\'s Apply or Reject decision.',
};

export const MODEL_VISIBLE_REFUSAL = {
    success: false,
    state: 'refused',
    message: 'No image was generated. This tool runs only when the current message clearly asks to create or show a generated image now.',
};

export const MODEL_VISIBLE_ALREADY_USED = {
    success: false,
    state: 'refused',
    message: 'No image was generated. Only one image can be requested in this turn.',
};

export const GROUNDED_PROMPT_FIXTURE = {
    identity: 'Eloise',
    clothing: 'rain-soaked cobalt riding coat with a torn silver clasp',
    action: 'braces the chapel door against the wind',
    place: 'candle smoke hanging in the nave',
    copilotPrompt: 'Eloise in a rain-soaked cobalt riding coat with a torn silver clasp, braces the chapel door against the wind, candle smoke hanging in the nave',
    forbiddenIdentity: 'Caius',
};

const NATURAL_COMPOSITION_SET = new Set(NATURAL_COMPOSITIONS);
const DRAW_IDIOMS = /\b(draw|drawing)\s+(a\s+)?(conclusion|distinction|comparison|parallel|breath|from|on|upon|near|nigh)\b/i;
const PROMPT_WRITING = /\b((write|improve|draft|compose|tweak|revise|edit|generat(?:e|ed|ing)|creat(?:e|ed|ing)|make)\b.{0,48}\b(image\s+)?prompts?|\b(image\s+)?prompts?\b.{0,48}\b(write|improve|draft|compose|tweak|revise)|\bimage\s+prompts?\b)\b/i;
const APPEARANCE_FOCUS = /\b(look like|looks like|(?:^|\s)looks(?:\s|$)|appearance|how tall|what color|eye colo(?:u)?r|hair colo(?:u)?r|describe (?:her|him|them|the character)|how \w+ looks)\b/i;
const CREATE_ACT = /\b(generat(?:e|ed|ing)|creat(?:e|ed|ing)|make|making|show|showing|render(?:ed|ing)?|draw(?:n|ing)?|paint(?:ed|ing)?|illustrat(?:e|ed|ing)|produc(?:e|ed|ing)|give me|i want|i need)\b/i;
const GENERATE_RENDER = /\b(generat(?:e|ed|ing)|render(?:ed|ing)?)\b/i;
const SHOW_CREATE_MAKE = /\b(show|showing|creat(?:e|ed|ing)|make|making)\b/i;
const VISUAL_NOUN = /\b(images?|pictures?|photos?|photographs?|portraits?|artworks?|illustrations?|drawings?|visuals?|character sheets?|char sheets?)\b/i;
const INHERENT_VISUAL = /\b(draw|paint|illustrate|sketch|doodle)\b/i;
const TEXT_PRODUCT = /\b(?:summar(?:y|ies|ize)|descriptions?|prompts?|lists?|stor(?:y|ies)|messages?|replies|reply|analy(?:sis|ses|ze)|lorebooks?|extracts?)\b/i;
const CARD_REQUEST = /\b(?:character\s+)?cards?\b/i;
const DEPICTIVE_SCENE = /\b(?:talking|speaking|walking|running|fighting|kissing|dancing|sitting|lying|sleeping|eating|drinking|riding|flying|arguing|embracing|chasing|standing)\b|\b(?:in|at|inside|outside|into|onto|through|across|beside|behind|under|over|near|within|by)\s+(?:the\s+|a\s+|an\s+)?\w+/i;

export function generateOperationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function createImageCallGuard() {
    let consumed = false;
    return {
        tryConsume() {
            if (consumed) return false;
            consumed = true;
            return true;
        },
        wasConsumed() { return consumed; },
    };
}

function subjectNames(subjects = []) {
    return (subjects || []).map(s => typeof s === 'string' ? s : s?.name).map(n => String(n || '').trim()).filter(Boolean);
}

function allSubjectsNamedInTurn(userTurn, subjects = []) {
    const names = subjectNames(subjects);
    if (!names.length) return false;
    return names.every(name => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(userTurn));
}

export function hasExplicitImageIntent(userTurn, subjects = []) {
    const text = String(userTurn || '').trim();
    if (!text) return false;
    if (PROMPT_WRITING.test(text)) return false;
    if (TEXT_PRODUCT.test(text)) return false;
    if (CARD_REQUEST.test(text) && !/\bcharacter sheets?\b|\bchar sheets?\b/i.test(text)) return false;
    if (APPEARANCE_FOCUS.test(text) && !VISUAL_NOUN.test(text) && !INHERENT_VISUAL.test(text)) return false;
    if (DRAW_IDIOMS.test(text) && !VISUAL_NOUN.test(text)) return false;
    if (INHERENT_VISUAL.test(text) && !DRAW_IDIOMS.test(text)) return true;
    if (CREATE_ACT.test(text) && VISUAL_NOUN.test(text)) return true;
    if (!allSubjectsNamedInTurn(text, subjects)) return false;
    if (GENERATE_RENDER.test(text)) return true;
    if (SHOW_CREATE_MAKE.test(text) && DEPICTIVE_SCENE.test(text)) return true;
    return false;
}

export function migrateBucket(bucket) {
    const next = bucket && typeof bucket === 'object' ? bucket : { activeSessionId: null, sessions: [] };
    if (!Array.isArray(next.sessions)) next.sessions = [];
    if (!Array.isArray(next.images)) next.images = [];
    if (!next.imageSettings || typeof next.imageSettings !== 'object') next.imageSettings = {};
    if (!next.imageSettings.selectedStyleId) {
        next.imageSettings.selectedStyleId = DEFAULT_STYLE_ID;
    }
    return next;
}

export function defaultImageSettings() {
    return {
        toolsEnabled_generate_image: true,
        imageModel: DEFAULT_IMAGE_MODEL,
        imageAddToRoleplayDefault: false,
        imageCharacterGalleryDefault: false,
        imageCustomFragment: '',
        imageStyleFragments: { ...SHIPPED_STYLE_FRAGMENTS },
    };
}

export function restoreShippedFragments(current = {}) {
    return {
        ...current,
        ...SHIPPED_STYLE_FRAGMENTS,
        custom: current.custom || '',
    };
}

export function getStyleFragment(styleId, fragments = {}, customFragment = '') {
    if (styleId === 'none') return '';
    if (styleId === 'custom') return String(customFragment || fragments.custom || '');
    if (fragments[styleId] != null) return String(fragments[styleId]);
    return SHIPPED_STYLE_FRAGMENTS[styleId] || '';
}

export function matchStyleOverride(override, presets = STYLE_PRESETS) {
    const raw = String(override || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const byId = presets.find(p => p.id === raw || p.id === lower);
    if (byId) return byId;
    const byLabel = presets.find(p => p.label.toLowerCase() === lower);
    if (byLabel) return byLabel;
    const contained = presets.find(p => p.label.toLowerCase().includes(lower) || p.id.includes(lower));
    if (contained) return contained;
    return null;
}

export function resolveStyle({ selectedStyleId, styleOverride, fragments = {}, customFragment = '' } = {}) {
    const savedId = selectedStyleId || DEFAULT_STYLE_ID;
    let id = savedId;
    let overrideApplied = false;
    const matched = matchStyleOverride(styleOverride);
    if (matched) {
        id = matched.id;
        overrideApplied = true;
    }
    const preset = STYLE_PRESETS.find(p => p.id === id) || STYLE_PRESETS[0];
    return {
        id: preset.id,
        label: preset.label,
        fragment: getStyleFragment(preset.id, fragments, customFragment),
        overrideApplied,
        savedStyleId: savedId,
    };
}

export function usesSheetFraming(composition) {
    return composition === 'character_sheet';
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const USER_SHEET = /\b(?:character sheets?|char sheets?|reference sheets?)\b/i;
const USER_PORTRAIT = /\b(?:portraits?|close[- ]?ups?|headshots?|bust)\b/i;
const USER_PLACE = /\b(?:in|at|inside|outside|into|onto|through|across|beside|behind|under|over|near|within)\s+(?:the\s+|a\s+|an\s+)?\w+/i;
const USER_ACTION = /\b(?:talking|speaking|walking|running|fighting|kissing|dancing|sitting|lying|sleeping|eating|drinking|riding|flying|arguing|embracing|chasing)\b/i;
const USER_ENVIRONMENT = /\b(?:landscape|scenery|environment|location|interior|exterior|background only)\b/i;
const USER_OBJECT = /\b(?:object|item|prop|artifact)\b/i;

function stripUserTurnToFramingResidue(userTurn, subjects = []) {
    let t = String(userTurn || '');
    t = t.replace(CREATE_ACT, ' ');
    t = t.replace(VISUAL_NOUN, ' ');
    t = t.replace(/\b(?:please|can you|could you|would you|i want|i need|now)\b/gi, ' ');
    t = t.replace(/\b(?:of|for|a|an|the|with|using)\b/gi, ' ');
    for (const subject of subjects || []) {
        const name = subject?.name;
        if (name) t = t.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), ' ');
    }
    for (const preset of STYLE_PRESETS) {
        t = t.replace(new RegExp(escapeRegExp(preset.label), 'gi'), ' ');
        t = t.replace(new RegExp(preset.id.replace(/-/g, '[\\s-]+'), 'gi'), ' ');
        const fragment = SHIPPED_STYLE_FRAGMENTS[preset.id];
        if (fragment) t = t.replace(new RegExp(escapeRegExp(fragment), 'gi'), ' ');
    }
    t = t.replace(/\bstyle\b/gi, ' ');
    t = t.replace(/\b(?:tegaki|watercolor|anime|manga|pixiv|scribble|photorealistic|cinematic|painterly|cel)\b/gi, ' ');
    return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveNaturalComposition({ userTurn, subjects = [], toolComposition } = {}) {
    const depicted = (subjects || []).filter(s => s && (typeof s === 'string' ? s : s.name)).length;
    if (depicted >= 2) return 'multi_character_scene';

    const turn = String(userTurn || '');
    if (USER_SHEET.test(turn)) return 'character_sheet';
    if (USER_PORTRAIT.test(turn)) return 'portrait';

    if (depicted === 1) {
        const residue = stripUserTurnToFramingResidue(turn, subjects.map(s => typeof s === 'string' ? { name: s } : s));
        if (USER_PLACE.test(residue) || USER_ACTION.test(residue)) {
            return 'single_character_scene';
        }
        return 'character_sheet';
    }

    if (depicted === 0) {
        if (USER_ENVIRONMENT.test(turn)) return 'environment';
        if (USER_OBJECT.test(turn)) return 'object';
        if (toolComposition === 'environment' || toolComposition === 'object' || toolComposition === 'other') {
            return toolComposition;
        }
        return 'other';
    }

    return 'character_sheet';
}

export function normalizeComposition(composition, subjects = [], mode = 'natural', userTurn = '') {
    if (mode === 'manual') {
        if (!composition || composition === 'auto') {
            return (subjects || []).length >= 2 ? 'multi_character_scene' : 'character_sheet';
        }
        if (composition === 'scene') {
            return (subjects || []).length >= 2 ? 'multi_character_scene' : 'single_character_scene';
        }
        return NATURAL_COMPOSITION_SET.has(composition) ? composition : 'other';
    }
    return resolveNaturalComposition({ userTurn, subjects, toolComposition: composition });
}

export function joinPromptParts(parts) {
    return parts.filter(p => p != null && String(p).length > 0).join(', ');
}

export function composeProviderPrompt({
    content,
    styleFragment,
    composition,
    hasAcceptedReference = false,
    mode = 'natural',
} = {}) {
    const text = content == null ? '' : String(content);
    if (mode === 'manual') {
        const frag = String(styleFragment || '');
        if (!frag) return text;
        if (!text) return frag;
        return `${frag}, ${text}`;
    }
    const parts = [];
    if (usesSheetFraming(composition)) {
        parts.push(hasAcceptedReference ? TEGAKI_FRAMING.withReference : TEGAKI_FRAMING.withoutReference);
    }
    const frag = String(styleFragment || '');
    if (frag) parts.push(frag);
    if (text) parts.push(text);
    return joinPromptParts(parts);
}

export function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

export function namesMatch(a, b) {
    const left = normalizeName(a);
    const right = normalizeName(b);
    return !!left && left === right;
}

export function estimateDataUrlBytes(dataUrl) {
    const raw = String(dataUrl || '');
    const comma = raw.indexOf(',');
    const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
    if (!b64) return 0;
    const padding = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    return Math.floor(b64.length * 0.75) - padding;
}

export function isAllowedReferenceDataUrl(dataUrl) {
    return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(String(dataUrl || ''));
}

export function shouldAuthorizeImageRun({ addUserMsg, allowImageGeneration } = {}) {
    return addUserMsg === true && allowImageGeneration === true;
}

export function shouldRenderProposalCard(proposal) {
    return !!proposal && proposal.state === 'generated_pending';
}

export function readApplyEnvelope(applyResponse = {}) {
    if (!applyResponse || applyResponse.ok !== true) return null;
    if (typeof applyResponse.imageId !== 'string' || !applyResponse.imageId) return null;
    if (typeof applyResponse.imageUrl !== 'string' || !applyResponse.imageUrl) return null;
    return {
        imageId: applyResponse.imageId,
        imageUrl: applyResponse.imageUrl,
        galleryUrl: applyResponse.galleryUrl == null ? null : String(applyResponse.galleryUrl),
    };
}

export function clearAttachmentWrappers(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    const existing = Array.from(root.querySelectorAll('.scp-msg-attachments'));
    for (const el of existing) {
        if (typeof el.remove === 'function') el.remove();
    }
    return existing.length;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

export function selectedPersonaAvatarId(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc || typeof doc.querySelector !== 'function') return '';
    const selected = doc.querySelector('#user_avatar_block .avatar-container.selected, #persona_container .avatar-container.selected, .persona_selected');
    if (!selected) return '';
    return selected.getAttribute?.('data-avatar-id') || selected.dataset?.avatarId || '';
}

export function resolveActivePersona({
    name1 = '',
    selectedAvatarId = '',
    windowAvatar = '',
    contextAvatar = '',
    chatPersona = '',
    defaultPersona = '',
} = {}) {
    const avatar = firstNonEmpty(selectedAvatarId, windowAvatar, contextAvatar, chatPersona, defaultPersona);
    return {
        id: avatar,
        name: name1 || 'User',
        avatar,
    };
}

export function personaThumbnailUrl(avatar, getThumbnailUrl) {
    if (!avatar) return '';
    if (typeof getThumbnailUrl === 'function') {
        try {
            const url = getThumbnailUrl('persona', avatar);
            if (url) return String(url);
        } catch (_) {
            // Fall through to the static persona file path.
        }
    }
    return encodeURI(`/User Avatars/${avatar}`);
}

export function resolveReferences({
    requestAttachments = [],
    subjects = [],
    cards = [],
    persona = null,
    manualSelection = 'auto',
    mode = 'natural',
} = {}) {
    if (manualSelection === 'none') {
        return { references: [], claimedAttached: false };
    }

    const out = [];
    const seen = new Set();
    const addRef = (ref) => {
        if (!ref || !ref.dataUrl) return;
        if (!isAllowedReferenceDataUrl(ref.dataUrl)) return;
        const size = estimateDataUrlBytes(ref.dataUrl);
        if (size <= 0 || size > MAX_REFERENCE_BYTES) return;
        const key = ref.byteKey || ref.dataUrl;
        if (seen.has(key)) return;
        if (out.length >= MAX_REFERENCE_COUNT) return;
        const total = out.reduce((n, r) => n + estimateDataUrlBytes(r.dataUrl), 0) + size;
        if (total > MAX_REFERENCE_TOTAL_BYTES) return;
        seen.add(key);
        out.push({
            name: ref.name,
            source: ref.source,
            sourceId: ref.sourceId || undefined,
            dataUrl: ref.dataUrl,
            byteKey: key,
            subjectName: ref.subjectName,
        });
    };

    const imageAtts = (requestAttachments || []).filter(a => a && a.isImage && a.dataUrl);
    const addAttachments = () => {
        for (const att of imageAtts) {
            const subjectName = att.subjectName || ((subjects || []).length === 1 ? subjects[0].name : null);
            addRef({
                name: att.name || 'request attachment',
                source: 'attachment',
                sourceId: att.id,
                dataUrl: att.dataUrl,
                byteKey: att.byteKey || att.dataUrl,
                subjectName,
            });
        }
    };
    const addCard = (card) => {
        if (!card?.dataUrl) return;
        addRef({
            name: `${card.name} avatar`,
            source: 'card',
            sourceId: card.cardId || card.avatar || card.id,
            dataUrl: card.dataUrl,
            byteKey: card.byteKey || card.dataUrl,
            subjectName: card.name,
        });
    };
    const addPersonaForced = () => {
        if (!persona?.dataUrl) return;
        addRef({
            name: `${persona.name || 'persona'} persona`,
            source: 'persona',
            sourceId: persona.id || persona.avatar,
            dataUrl: persona.dataUrl,
            byteKey: persona.byteKey || persona.dataUrl,
            subjectName: persona.name,
        });
    };

    if (mode === 'manual') {
        if (manualSelection === 'attachment') addAttachments();
        else if (manualSelection === 'card') (cards || []).forEach(addCard);
        else if (manualSelection === 'persona') addPersonaForced();
        else if (manualSelection === 'auto') {
            if (imageAtts.length) addAttachments();
            else if ((cards || []).some(c => c && c.dataUrl)) (cards || []).forEach(addCard);
            else addPersonaForced();
        }
        return { references: out, claimedAttached: out.length > 0 };
    }

    const subjectCovered = new Set();
    const includeAttachments = manualSelection === 'auto' || manualSelection === 'attachment';
    const includeCards = manualSelection === 'auto' || manualSelection === 'card';
    const includePersona = manualSelection === 'auto' || manualSelection === 'persona';

    if (includeAttachments) {
        addAttachments();
        for (const ref of out) {
            if (ref.subjectName) subjectCovered.add(normalizeName(ref.subjectName));
        }
    }

    if (includeCards) {
        for (const subject of subjects || []) {
            if (subject?.kind === 'persona') continue;
            if (subjectCovered.has(normalizeName(subject.name))) continue;
            const card = (cards || []).find(c =>
                namesMatch(c.name, subject.name) || (subject.cardId && (c.cardId === subject.cardId || c.avatar === subject.cardId || c.id === subject.cardId))
            );
            addCard(card);
        }
    }

    if (includePersona && persona && persona.dataUrl) {
        const personaSubject = (subjects || []).find(s =>
            s.kind === 'persona' || namesMatch(s.name, persona.name) || namesMatch(s.name, 'user') || namesMatch(s.name, '{{user}}')
        );
        if (personaSubject && !subjectCovered.has(normalizeName(personaSubject.name)) && !subjectCovered.has(normalizeName(persona.name))) {
            addRef({
                name: `${persona.name || 'persona'} persona`,
                source: 'persona',
                sourceId: persona.id || persona.avatar,
                dataUrl: persona.dataUrl,
                byteKey: persona.byteKey || persona.dataUrl,
                subjectName: personaSubject.name,
            });
        }
    }

    return { references: out, claimedAttached: out.length > 0 };
}

export function inferSubjectsFromReferences(references = [], { cards = [], persona = null } = {}) {
    const subjects = [];
    const cardRefs = (references || []).filter(r => r.source === 'card');
    const personaRefs = (references || []).filter(r => r.source === 'persona');
    const attachmentRefs = (references || []).filter(r => r.source === 'attachment');
    if (cardRefs.length) {
        for (const ref of cardRefs) {
            const card = (cards || []).find(c =>
                c.cardId === ref.sourceId || c.avatar === ref.sourceId || c.id === ref.sourceId || namesMatch(c.name, ref.subjectName)
            );
            if (!card) continue;
            subjects.push({
                name: card.name,
                kind: 'character',
                cardId: card.avatar || card.cardId || card.id,
            });
        }
    } else if (attachmentRefs.length && (cards || []).length === 1) {
        const card = cards[0];
        subjects.push({
            name: card.name,
            kind: 'character',
            cardId: card.avatar || card.cardId || card.id,
        });
    }
    if (personaRefs.length && persona) {
        subjects.push({ name: persona.name || 'User', kind: 'persona' });
    }
    return subjects;
}

export function toBridgeReferences(references) {
    return (references || []).map(r => ({
        name: r.name,
        source: r.source,
        sourceId: r.sourceId,
        dataUrl: r.dataUrl,
    }));
}

export function acceptedReferenceLabels(referencesAccepted = []) {
    return (referencesAccepted || []).map(r => ({
        name: r.name,
        source: r.source,
        sourceId: r.sourceId,
    }));
}

export function boundPrompt(prompt) {
    const text = String(prompt || '');
    if (!text.trim()) return '';
    return text.slice(0, MAX_PROMPT_CHARS);
}

export function boundModel(model) {
    const id = String(model || DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL;
    return id.slice(0, MAX_MODEL_CHARS);
}

export function buildGenerateRequest({
    operationId,
    prompt,
    model,
    composition,
    style,
    subjects,
    references,
    binding,
}) {
    return {
        operationId,
        prompt: boundPrompt(prompt),
        model: boundModel(model),
        composition,
        style: { id: style.id, label: style.label },
        subjects: (subjects || []).map(s => ({
            name: s.name,
            kind: s.kind || 'character',
            cardId: s.cardId || undefined,
        })),
        references: toBridgeReferences(references),
        binding: {
            chatId: String(binding.chatId || ''),
            charId: String(binding.charId || ''),
            sessionId: String(binding.sessionId || ''),
        },
    };
}

export function createPendingProposal({
    pendingId,
    previewUrl,
    expiresAt,
    format,
    prompt,
    style,
    composition,
    subjects,
    referencesAccepted,
    binding,
    operationId,
    source = 'natural',
}) {
    return {
        id: pendingId,
        state: 'generated_pending',
        pendingId,
        previewUrl,
        expiresAt,
        format: format || 'png',
        prompt,
        style: { id: style.id, label: style.label },
        composition,
        subjects: subjects || [],
        referencesAccepted: acceptedReferenceLabels(referencesAccepted),
        binding: { ...binding },
        operationId,
        source,
        addToRoleplay: false,
        saveToCharacterGallery: false,
    };
}

export function bindingsMatch(a = {}, b = {}, { requireMessage = false } = {}) {
    if (!a || !b) return false;
    if (String(a.chatId) !== String(b.chatId)) return false;
    if (String(a.charId) !== String(b.charId)) return false;
    if (String(a.sessionId) !== String(b.sessionId)) return false;
    if (requireMessage && a.messageId && String(a.messageId) !== String(b.messageId)) return false;
    return true;
}

export function isCharacterGalleryEligible({ subjects = [], composition, cards = [], references = [] } = {}) {
    if (composition === 'multi_character_scene' || composition === 'environment' || composition === 'object') {
        return { eligible: false };
    }
    if ((subjects || []).some(s => s && s.kind === 'persona')) return { eligible: false };
    if ((references || []).some(r => r && r.source === 'persona')) return { eligible: false };
    const characterSubjects = (subjects || []).filter(s => s && s.kind !== 'persona');
    if (characterSubjects.length !== 1) return { eligible: false };
    const subject = characterSubjects[0];
    const card = (cards || []).find(c =>
        namesMatch(c.name, subject.name) || (subject.cardId && (c.cardId === subject.cardId || c.avatar === subject.cardId || c.id === subject.cardId))
    );
    if (!card) return { eligible: false };
    return {
        eligible: true,
        avatar: card.avatar || card.cardId || card.id,
        name: card.name,
    };
}

export function getAttachmentSrc(att = {}) {
    return att.url || att.dataUrl || '';
}

export function createGeneratedAttachment({ imageId, url, name, mimeType, format }) {
    const ext = format || 'png';
    return {
        id: imageId,
        name: name || `generated.${ext}`,
        mimeType: mimeType || `image/${ext}`,
        isImage: true,
        url,
        generatedImageId: imageId,
    };
}

export function upsertCatalogRecord(bucket, record) {
    const next = migrateBucket(bucket);
    const idx = next.images.findIndex(r => r.id === record.id);
    if (idx === -1) next.images.push(record);
    else next.images[idx] = { ...next.images[idx], ...record };
    return next.images[idx === -1 ? next.images.length - 1 : idx];
}

export function capSessionMessages(session, cap = SESSION_MESSAGE_CAP) {
    if (!session || !Array.isArray(session.messages)) return session;
    if (session.messages.length > cap) session.messages = session.messages.slice(-cap);
    return session;
}

export function preserveAppliedFieldsOnTextChange(message, { content, reasoning } = {}) {
    if (!message) return message;
    if (content !== undefined) message.content = content;
    if (reasoning !== undefined) message.reasoning = reasoning;
    return message;
}

export function mutateAssistantImageState({
    bucket,
    binding,
    currentBinding,
    sessionId,
    messageId,
    mutator,
}) {
    if (!bindingsMatch(binding, currentBinding)) {
        return { ok: false, code: 'binding_mismatch' };
    }
    const sess = (bucket?.sessions || []).find(s => s.id === sessionId);
    if (!sess) return { ok: false, code: 'session_missing' };
    const msg = (sess.messages || []).find(m => m.id === messageId);
    if (!msg) return { ok: false, code: 'message_missing' };
    mutator(msg, bucket, sess);
    return { ok: true, message: msg, session: sess };
}

export function applyLocalDestinations({
    proposal,
    applyResponse,
    message,
    bucket,
    addToRoleplay = false,
}) {
    const envelope = readApplyEnvelope(applyResponse);
    if (!envelope) return { ok: false, code: 'invalid_apply_envelope', proposal, message };
    const { imageId, imageUrl, galleryUrl } = envelope;
    if (!message.attachments) message.attachments = [];
    if (!message.attachments.some(a => a.generatedImageId === imageId)) {
        message.attachments.push(createGeneratedAttachment({
            imageId,
            url: imageUrl,
            format: proposal.format,
        }));
    }
    proposal.state = 'applied';
    proposal.appliedImageId = imageId;
    proposal.appliedUrl = imageUrl;
    const record = upsertCatalogRecord(bucket, {
        id: imageId,
        path: imageUrl,
        created: proposal.appliedAt || Date.now(),
        sessionId: proposal.binding.sessionId,
        messageId: message.id,
        prompt: proposal.prompt,
        style: proposal.style,
        composition: proposal.composition,
        subjects: proposal.subjects,
        references: proposal.referencesAccepted,
        mainRoleplayMessageId: proposal.mainRoleplayMessageId || null,
        characterGalleryPath: galleryUrl || null,
    });
    const mainRoleplayMessage = addToRoleplay ? buildMainRoleplayMessage({
        url: imageUrl,
        name: record.path,
        imageId,
    }) : null;
    return { ok: true, proposal, message, record, mainRoleplayMessage, envelope };
}

export function rejectLocalDestinations({ proposal, bucket, message }) {
    proposal.state = 'rejected';
    if (message?.imageProposals) {
        message.imageProposals = message.imageProposals.filter(p => p.pendingId !== proposal.pendingId);
    }
    const catalogIds = new Set((bucket?.images || []).map(r => r.id));
    return {
        proposal,
        catalogUnchanged: true,
        catalogHasPending: catalogIds.has(proposal.pendingId),
    };
}

export function buildMainRoleplayMessage({ url, name, imageId } = {}) {
    const extra = {
        media: [{
            type: 'image',
            url,
            name: name || 'generated.png',
        }],
    };
    if (imageId) extra[ROLEPLAY_IMAGE_MARKER] = imageId;
    return {
        is_user: false,
        is_system: true,
        name: 'Copilot Image',
        mes: '',
        extra,
    };
}

export function findExistingRoleplayMessage(chat, imageId) {
    if (!imageId || !Array.isArray(chat)) return -1;
    return chat.findIndex(m => m?.extra?.[ROLEPLAY_IMAGE_MARKER] === imageId);
}

export const ROLEPLAY_DELIVERY_STAGES = ['MESSAGE_RECEIVED', 'addOneMessage', 'CHARACTER_MESSAGE_RENDERED', 'saveChat'];

export function createRoleplayDeliveryState(over = {}) {
    return {
        pushed: false,
        MESSAGE_RECEIVED: false,
        addOneMessage: false,
        CHARACTER_MESSAGE_RENDERED: false,
        saveChat: false,
        ...over,
    };
}

export function isRoleplayDeliveryComplete(delivery) {
    const d = createRoleplayDeliveryState(delivery || {});
    return !!(d.pushed && d.MESSAGE_RECEIVED && d.addOneMessage && d.CHARACTER_MESSAGE_RENDERED && d.saveChat);
}

export function shouldShowRoleplayRetry(proposal) {
    return !!proposal
        && proposal.state === 'applied'
        && proposal.destinationWarning === 'roleplay_insert_failed'
        && !isRoleplayDeliveryComplete(proposal.roleplayDelivery);
}

export function readRoleplayDelivery(message) {
    return createRoleplayDeliveryState(message?.extra?.copilotRoleplayDelivery || {});
}

export function writeRoleplayDelivery(message, delivery) {
    if (!message.extra) message.extra = {};
    message.extra.copilotRoleplayDelivery = createRoleplayDeliveryState(delivery);
    return message.extra.copilotRoleplayDelivery;
}

export async function insertRoleplayMediaMessage({ imageId, url, name, context } = {}) {
    const st = context || (typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null);
    if (!st || !Array.isArray(st.chat)) {
        return { ok: false, code: 'roleplay_insert_failed', delivery: createRoleplayDeliveryState() };
    }

    let index = findExistingRoleplayMessage(st.chat, imageId);
    let message;
    if (index < 0) {
        message = buildMainRoleplayMessage({ url, name, imageId });
        message.send_date = Date.now();
        writeRoleplayDelivery(message, createRoleplayDeliveryState({ pushed: true }));
        st.chat.push(message);
        index = st.chat.length - 1;
    } else {
        message = st.chat[index];
        const delivery = readRoleplayDelivery(message);
        delivery.pushed = true;
        writeRoleplayDelivery(message, delivery);
        if (isRoleplayDeliveryComplete(delivery)) {
            return {
                ok: true,
                already: true,
                messageId: String(index),
                delivery,
                events: [],
                message,
            };
        }
    }

    const delivery = readRoleplayDelivery(message);
    delivery.pushed = true;
    writeRoleplayDelivery(message, delivery);
    const events = [];
    const messageId = index;
    const es = st.eventSource;
    const et = st.eventTypes || st.event_types || {};

    const fail = () => ({
        ok: false,
        code: 'roleplay_insert_failed',
        messageId: String(messageId),
        delivery: { ...delivery },
        events,
        message,
    });

    const runStage = async (stage, fn) => {
        if (delivery[stage]) return true;
        try {
            await fn();
            delivery[stage] = true;
            writeRoleplayDelivery(message, delivery);
            events.push(stage);
            return true;
        } catch (_) {
            writeRoleplayDelivery(message, delivery);
            return false;
        }
    };

    if (!await runStage('MESSAGE_RECEIVED', async () => {
        if (!es || typeof es.emit !== 'function' || !et.MESSAGE_RECEIVED) throw new Error('MESSAGE_RECEIVED unavailable');
        await es.emit(et.MESSAGE_RECEIVED, messageId, 'extension');
    })) return fail();

    if (!await runStage('addOneMessage', async () => {
        if (typeof st.addOneMessage !== 'function') throw new Error('addOneMessage unavailable');
        st.addOneMessage(message);
    })) return fail();

    if (!await runStage('CHARACTER_MESSAGE_RENDERED', async () => {
        if (!es || typeof es.emit !== 'function' || !et.CHARACTER_MESSAGE_RENDERED) throw new Error('CHARACTER_MESSAGE_RENDERED unavailable');
        await es.emit(et.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    })) return fail();

    if (!await runStage('saveChat', async () => {
        if (typeof st.saveChat !== 'function') throw new Error('saveChat unavailable');
        await st.saveChat();
    })) return fail();

    if (typeof st.scrollOnMediaLoad === 'function') {
        st.scrollOnMediaLoad();
        events.push('scrollOnMediaLoad');
    }

    if (!isSafeMainRoleplayMessage(message)) return fail();
    return {
        ok: true,
        already: events.filter(e => e !== 'scrollOnMediaLoad').length === 0,
        messageId: String(messageId),
        delivery: { ...delivery },
        events,
        message,
    };
}

export async function applyDestinationsWithRoleplay({
    proposal,
    currentBinding,
    messageId,
    destinations = {},
    bridge,
    bucket,
    message,
    cards = [],
    context,
} = {}) {
    const applyResult = await executeApply({
        proposal,
        currentBinding,
        messageId,
        destinations: {
            saveToCharacterGallery: destinations.saveToCharacterGallery,
            addToRoleplay: false,
        },
        bridge,
        bucket,
        message,
        cards,
    });
    if (!applyResult.ok) return applyResult;

    const wantRoleplay = !!destinations.addToRoleplay || shouldShowRoleplayRetry(proposal);
    if (!wantRoleplay) {
        return { ...applyResult, warning: proposal.destinationWarning || null, partial: shouldShowRoleplayRetry(proposal), generateCalls: 0 };
    }

    const inserted = await insertRoleplayMediaMessage({
        imageId: proposal.appliedImageId,
        url: proposal.appliedUrl,
        name: 'generated.png',
        context,
    });
    proposal.roleplayDelivery = inserted.delivery || createRoleplayDeliveryState();
    if (!inserted.ok) {
        proposal.destinationWarning = 'roleplay_insert_failed';
        if (message) message.destinationWarning = 'roleplay_insert_failed';
        return {
            ...applyResult,
            warning: 'roleplay_insert_failed',
            partial: true,
            generateCalls: 0,
            delivery: proposal.roleplayDelivery,
        };
    }
    proposal.destinationWarning = null;
    proposal.mainRoleplayMessageId = inserted.messageId;
    proposal.roleplayDelivery = inserted.delivery;
    if (message) message.destinationWarning = null;
    const rec = (bucket.images || []).find(r => r.id === proposal.appliedImageId);
    if (rec) rec.mainRoleplayMessageId = inserted.messageId;
    return {
        ...applyResult,
        warning: null,
        partial: false,
        generateCalls: 0,
        delivery: inserted.delivery,
    };
}

export function isSafeMainRoleplayMessage(msg) {
    if (!msg) return false;
    if (msg.is_user !== false) return false;
    if (msg.is_system !== true) return false;
    if (msg.sc_ghosted) return false;
    if (msg.tool_invocations) return false;
    if (msg.extra?.sc_ghosted) return false;
    if (msg.extra?.tool_invocations) return false;
    const media = msg.extra?.media;
    return Array.isArray(media) && media.length === 1 && media[0].type === 'image' && !!media[0].url;
}

function safeToolMessage(message) {
    const text = String(message || '');
    if (/data:image\/|\/home\/|C:\\\\|Bearer |api_key/i.test(text)) return 'Image generation failed.';
    return text.slice(0, 300);
}

function stripUnsafeToolValue(value) {
    if (value == null) return value;
    const text = JSON.stringify(value);
    if (/data:image\/|\/home\/|C:\\\\|Bearer |api_key/i.test(text)) {
        if (value && typeof value === 'object') {
            const { success, state, message } = value;
            return { success, state, message: safeToolMessage(message) };
        }
        return undefined;
    }
    return value;
}

export function sanitizeToolCallsForSave(toolCalls) {
    return (toolCalls || []).map(tc => {
        const input = tc.name === IMAGE_TOOL_NAME
            ? {
                prompt: tc.input?.prompt,
                composition: tc.input?.composition,
                subjects: tc.input?.subjects,
                style_override: tc.input?.style_override,
            }
            : stripUnsafeToolValue(tc.input);
        if (tc.name !== IMAGE_TOOL_NAME) {
            return { ...tc, input, result: stripUnsafeToolValue(tc.result) };
        }
        const state = tc.result?.state;
        const failed = state === 'refused' || state === 'error' || tc.status === 'error' || tc.result?.success === false;
        const result = failed
            ? {
                success: false,
                state: state === 'error' || tc.status === 'error' ? 'error' : 'refused',
                message: safeToolMessage(tc.result?.message) || 'No image was generated.',
            }
            : { ...MODEL_VISIBLE_PENDING_RESULT };
        return { ...tc, input, result };
    });
}

export function sanitizeProposalForSession(proposal) {
    if (!proposal) return proposal;
    const { dataUrl, bytes, privatePath, ...safe } = proposal;
    return {
        ...safe,
        referencesAccepted: acceptedReferenceLabels(proposal.referencesAccepted),
    };
}

export function sessionJsonContainsSecrets(value) {
    const text = JSON.stringify(value);
    return {
        hasBase64Body: /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{80,}/.test(text),
        hasApiKey: /(?:sk-|api_key_linkapi\s*[:=]\s*['\"]?[A-Za-z0-9])/i.test(text),
        hasPrivatePath: /(?:\/home\/[^\s"]+|C:\\\\|[A-Z]:\\Users\\)/.test(text),
    };
}

export function buildSafeImageLog({ requestId, model, route, outcome, duration } = {}) {
    return { requestId, model, route, outcome, duration };
}

export function visibleToolResultIsSafe(result) {
    const text = JSON.stringify(result || {});
    if (/data:image\//.test(text)) return false;
    if (/\/home\/|C:\\\\|privatePath|api_key|Bearer /i.test(text)) return false;
    if (/pending\/|user\/images\//.test(text) && result !== MODEL_VISIBLE_PENDING_RESULT) {
        if (result?.previewUrl || result?.url || result?.path) return false;
    }
    return result?.state === 'generated_pending' || result?.state === 'refused';
}

export function groundedPromptPreservesFacts(prompt, fixture = GROUNDED_PROMPT_FIXTURE) {
    const text = String(prompt || '');
    const hasIdentity = text.includes(fixture.identity);
    const hasClothing = text.includes(fixture.clothing);
    const hasAction = text.includes(fixture.action);
    const hasPlace = text.includes(fixture.place);
    const swapped = new RegExp(`\\b${fixture.forbiddenIdentity}\\b`).test(text) && !hasIdentity;
    return hasIdentity && hasClothing && hasAction && hasPlace && !swapped;
}

export async function executeGenerateImage({
    toolInput = {},
    runContext,
    styleState = {},
    referenceSources = {},
    bridge,
    model,
} = {}) {
    const mode = runContext?.mode || 'natural';
    const guard = runContext?.guard;
    let subjects = Array.isArray(toolInput.subjects)
        ? toolInput.subjects.map(s => typeof s === 'string' ? { name: s, kind: 'character' } : s)
        : [];
    if (mode === 'natural' && runContext?.authorized !== true) {
        return { visible: { ...MODEL_VISIBLE_REFUSAL }, proposal: null, spent: false, bridgeCalls: 0 };
    }
    if (mode === 'natural' && !hasExplicitImageIntent(runContext?.userTurn, subjects)) {
        return { visible: { ...MODEL_VISIBLE_REFUSAL }, proposal: null, spent: false, bridgeCalls: 0 };
    }
    if (!guard || !guard.tryConsume()) {
        return { visible: { ...MODEL_VISIBLE_ALREADY_USED }, proposal: null, spent: false, bridgeCalls: 0 };
    }
    const composition = normalizeComposition(toolInput.composition, subjects, mode, runContext?.userTurn || '');
    const style = resolveStyle({
        selectedStyleId: styleState.selectedStyleId,
        styleOverride: mode === 'natural' ? toolInput.style_override : styleState.styleOverride,
        fragments: styleState.fragments,
        customFragment: styleState.customFragment,
    });
    const refs = resolveReferences({
        requestAttachments: runContext.attachments || [],
        subjects,
        cards: referenceSources.cards || [],
        persona: referenceSources.persona || null,
        manualSelection: runContext.manualSelection || 'auto',
        mode,
    });
    if (!subjects.length && mode === 'manual') {
        subjects = inferSubjectsFromReferences(refs.references, referenceSources);
    }
    const content = mode === 'manual' ? String(toolInput.prompt ?? '') : String(toolInput.prompt || '');
    const prompt = composeProviderPrompt({
        content,
        styleFragment: style.fragment,
        composition,
        hasAcceptedReference: refs.claimedAttached,
        mode,
    });
    const request = buildGenerateRequest({
        operationId: runContext.operationId,
        prompt,
        model: model || styleState.model || DEFAULT_IMAGE_MODEL,
        composition,
        style,
        subjects,
        references: refs.references,
        binding: runContext.binding,
    });

    let response;
    try {
        response = await bridge.generate(request);
    } catch (err) {
        return {
            visible: { success: false, state: 'error', message: 'Image generation failed.' },
            proposal: null,
            spent: true,
            bridgeCalls: 1,
            error: err,
            style,
        };
    }

    if (!response || response.ok !== true) {
        return {
            visible: { success: false, state: 'error', message: response?.error?.message || 'Image generation failed.' },
            proposal: null,
            spent: true,
            bridgeCalls: 1,
            style,
            savedStyleId: style.savedStyleId,
        };
    }

    const proposal = createPendingProposal({
        pendingId: response.pendingId,
        previewUrl: response.previewUrl,
        expiresAt: response.expiresAt,
        format: response.format,
        prompt,
        style,
        composition,
        subjects,
        referencesAccepted: response.referencesAccepted || (refs.claimedAttached ? refs.references : []),
        binding: runContext.binding,
        operationId: runContext.operationId,
        source: mode,
    });

    return {
        visible: { ...MODEL_VISIBLE_PENDING_RESULT },
        proposal,
        spent: true,
        bridgeCalls: 1,
        request,
        style,
        savedStyleId: style.savedStyleId,
    };
}

export async function executeApply({
    proposal,
    currentBinding,
    messageId,
    destinations = {},
    bridge,
    bucket,
    message,
    cards = [],
} = {}) {
    if (!proposal || (proposal.state !== 'generated_pending' && proposal.state !== 'applied')) {
        return { ok: false, code: 'not_pending', bridgeCalls: 0, generateCalls: 0 };
    }
    if (!bindingsMatch(proposal.binding, currentBinding)) {
        return { ok: false, code: 'binding_mismatch', bridgeCalls: 0, generateCalls: 0 };
    }
    const eligibility = isCharacterGalleryEligible({
        subjects: proposal.subjects,
        composition: proposal.composition,
        cards,
        references: proposal.referencesAccepted,
    });
    const characterGallery = destinations.saveToCharacterGallery && eligibility.eligible
        ? { avatar: eligibility.avatar, name: eligibility.name }
        : null;
    const response = await bridge.apply({
        pendingId: proposal.pendingId,
        binding: {
            chatId: proposal.binding.chatId,
            charId: proposal.binding.charId,
            sessionId: proposal.binding.sessionId,
            messageId,
        },
        characterGallery,
    });
    if (!response || response.ok !== true) {
        return { ok: false, code: response?.error?.code || 'apply_failed', bridgeCalls: 1, generateCalls: 0 };
    }
    const envelope = readApplyEnvelope(response);
    if (!envelope) {
        return { ok: false, code: 'invalid_apply_envelope', bridgeCalls: 1, generateCalls: 0 };
    }
    const local = applyLocalDestinations({
        proposal,
        applyResponse: response,
        message,
        bucket,
        addToRoleplay: !!destinations.addToRoleplay,
    });
    if (!local.ok) {
        return { ok: false, code: local.code || 'invalid_apply_envelope', bridgeCalls: 1, generateCalls: 0 };
    }
    return {
        ok: true,
        state: 'applied',
        generateCalls: 0,
        bridgeCalls: 1,
        ...local,
        characterGalleryEligible: eligibility.eligible,
        characterGallery,
    };
}

export async function executeReject({
    proposal,
    currentBinding,
    bridge,
    bucket,
    message,
} = {}) {
    if (!proposal) return { ok: false, code: 'missing', generateCalls: 0, bridgeCalls: 0 };
    if (!bindingsMatch(proposal.binding, currentBinding)) {
        return { ok: false, code: 'binding_mismatch', generateCalls: 0, bridgeCalls: 0 };
    }
    const response = await bridge.reject({
        pendingId: proposal.pendingId,
        binding: {
            chatId: proposal.binding.chatId,
            charId: proposal.binding.charId,
            sessionId: proposal.binding.sessionId,
        },
    });
    if (!response || response.ok !== true) {
        return { ok: false, code: response?.error?.code || 'reject_failed', generateCalls: 0, bridgeCalls: 1 };
    }
    const local = rejectLocalDestinations({ proposal, bucket, message });
    return { ok: true, state: 'rejected', generateCalls: 0, bridgeCalls: 1, ...local };
}

export function sortCatalog(records, direction = 'newest') {
    const copy = [...(records || [])];
    copy.sort((a, b) => (a.created || 0) - (b.created || 0));
    if (direction === 'newest') copy.reverse();
    return copy;
}

export function galleryRecords(bucket) {
    return (migrateBucket(bucket).images || []).filter(r => r && r.id && r.path);
}
