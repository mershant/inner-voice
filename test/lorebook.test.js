import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: inner-memory.test.js) ──────────────────

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
    createElement() {
        return {
            style: {}, dataset: {},
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener() {}, appendChild() {}, setAttribute() {},
        };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {} },
};
globalThis.window = globalThis;
globalThis.toastr = { error() {}, warning() {}, success() {}, info() {} };

const files = new Map();
const fetchCalls = [];
globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (url === '/api/files/upload') {
        const body = JSON.parse(opts.body);
        files.set(body.name, body.data);
        return { ok: true, status: 200 };
    }
    const m = String(url).match(/^\/user\/files\/(.+)$/);
    if (m) {
        if (!files.has(m[1])) return { ok: false, status: 404 };
        return {
            ok: true,
            status: 200,
            text: async () => decodeURIComponent(escape(atob(files.get(m[1])))),
        };
    }
    return { ok: false, status: 500 };
};

const stub = {
    chat: [],
    chatId: 'chat-a',
    chatMetadata: {},
    extensionSettings: {},
    characters: [{ name: 'Kyrine', avatar: 'kyrine.png', data: {} }],
    books: {},
    worldWrites: [],
};

globalThis.selected_world_info = [];
globalThis.world_info = { charLore: [] };

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: 0,
            characters: stub.characters,
            name1: 'User',
            name2: 'Kyrine',
            extensionSettings: stub.extensionSettings,
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadata; },
            set chatMetadata(v) { stub.chatMetadata = v; },
            loadWorldInfo: async (name) => stub.books[name] || null,
            saveWorldInfo: async (name, data) => { stub.worldWrites.push({ name, data }); },
        };
    },
};

const { initConversation, getConversation, getEffectiveSettings, addTurn } = await import('../src/conversation.js');
const { assembleMessages } = await import('../src/api.js');

function mainMsg(text, isUser = false) {
    return { mes: text, is_user: isUser };
}

function payloadText(messages) {
    return messages.map(m => m.content).join('\n');
}

function bookEntry(uid, content, extra = {}) {
    return { uid, comment: extra.comment || `Entry ${uid}`, content, disable: extra.disable === true, key: extra.key || ['never-matching-key'], ...extra };
}

async function reset() {
    files.clear();
    fetchCalls.length = 0;
    stub.worldWrites = [];
    stub.books = {};
    stub.characters = [{ name: 'Kyrine', avatar: 'kyrine.png', data: {} }];
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = {};
    stub.extensionSettings = {};
    globalThis.selected_world_info = [];
    globalThis.world_info = { charLore: [] };
    await initConversation({ forceReset: true });
}

beforeEach(reset);

test('lorebook selection defaults match upstream', async () => {
    const settings = getEffectiveSettings();
    assert.equal(settings.lorebookAutoKeyword, true);
    assert.equal(settings.lorebookSTScanDepth, 5);
    assert.equal(settings.lorebookCopilotScanDepth, 6);
    assert.deepEqual(settings.lorebookSelectedBooks, []);
    assert.deepEqual(settings.lorebookExcludedBooks, []);
    assert.deepEqual(settings.lorebookEntryOverrides, {});
});

test('excluded books contribute nothing', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', constant: true }),
        },
    };
    stub.books['Kept Atlas'] = {
        entries: {
            1: bookEntry(1, 'The east-gate passphrase is QX-7742-VEL.', { comment: 'Passphrase', constant: true }),
        },
    };
    globalThis.selected_world_info = ['Town Lore', 'Kept Atlas'];
    const settings = getEffectiveSettings();
    settings.lorebookExcludedBooks = ['Town Lore'];

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(!text.includes('The chapel heist set the town on edge.'));
    assert.ok(text.includes('The east-gate passphrase is QX-7742-VEL.'));
});

test('a selected active book force-includes entries even when keywords do not match', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', key: ['chapel'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookAutoKeyword = true;
    settings.lorebookSelectedBooks = ['Town Lore'];

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
});

test('a selected book that is not host-active does not appear', async () => {
    stub.books['Idle Atlas'] = {
        entries: {
            1: bookEntry(1, 'INACTIVE-BOOK-MUST-NOT-APPEAR', { comment: 'Idle', constant: true }),
        },
    };
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', constant: true }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookSelectedBooks = ['Idle Atlas'];

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
    assert.ok(!text.includes('INACTIVE-BOOK-MUST-NOT-APPEAR'));
});

test('selected books do not load when no host-active names exist', async () => {
    stub.books['Idle Atlas'] = {
        entries: {
            1: bookEntry(1, 'SELECTED-INACTIVE-WITH-NO-ACTIVE-MUST-NOT-APPEAR', { comment: 'Idle', constant: true }),
        },
    };
    const settings = getEffectiveSettings();
    settings.lorebookSelectedBooks = ['Idle Atlas'];

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(!text.includes('SELECTED-INACTIVE-WITH-NO-ACTIVE-MUST-NOT-APPEAR'));
    assert.ok(!text.includes('<lorebook_context>'));
});

test('per-entry override true includes a disabled non-matching entry', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'DISABLED-OVERRIDE-MUST-APPEAR', { comment: 'Secret', disable: true, key: ['chapel'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookEntryOverrides = { 'Town Lore_Secret': true };

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(text.includes('DISABLED-OVERRIDE-MUST-APPEAR'));
});

test('per-entry override false drops an otherwise-included constant', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'CONSTANT-OVERRIDE-OFF-MUST-NOT-APPEAR', { comment: 'Chapel heist', constant: true }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookEntryOverrides = { 'Town Lore_Chapel heist': false };

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(!text.includes('CONSTANT-OVERRIDE-OFF-MUST-NOT-APPEAR'));
    assert.ok(!text.includes('<lorebook_context>'));
});

test('keyword scanning on includes matching keys and constants only', async () => {
    stub.chat = [mainMsg('They still talk about the chapel.', true)];
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', key: ['chapel'] }),
            2: bookEntry(2, 'KEYWORD-MISS-MUST-NOT-APPEAR', { comment: 'Idle fact', key: ['never-matching-key'] }),
            3: bookEntry(3, 'The river-stone of Vellith glows when a promise is kept.', { comment: 'River stone', constant: true, key: ['never-matching-key'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookAutoKeyword = true;

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
    assert.ok(text.includes('The river-stone of Vellith glows when a promise is kept.'));
    assert.ok(!text.includes('KEYWORD-MISS-MUST-NOT-APPEAR'));
});

test('keyword scanning off ignores matching keys and still includes constants', async () => {
    stub.chat = [mainMsg('They still talk about the chapel.', true)];
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'KEYWORD-HIT-MUST-NOT-APPEAR-WHEN-OFF', { comment: 'Chapel heist', key: ['chapel'] }),
            2: bookEntry(2, 'The river-stone of Vellith glows when a promise is kept.', { comment: 'River stone', constant: true, key: ['never-matching-key'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    const settings = getEffectiveSettings();
    settings.lorebookAutoKeyword = false;

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(!text.includes('KEYWORD-HIT-MUST-NOT-APPEAR-WHEN-OFF'));
    assert.ok(text.includes('The river-stone of Vellith glows when a promise is kept.'));
});

test('output uses lorebook_context with upstream heading, uid, and keys', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', constant: true, key: ['chapel', 'heist'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const messages = await assembleMessages(getConversation(), getEffectiveSettings(), null);
    const sys = messages.find(m => m.role === 'system');
    const mainIdx = messages.findIndex(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    assert.ok(sys, 'payload has a system message');
    assert.ok(mainIdx > 0, 'main-chat slice is not the first message');
    assert.match(sys.content, /<lorebook_context>/);
    assert.ok(!sys.content.includes('<world_knowledge>'));
    assert.ok(!sys.content.includes('Established facts about the world'));
    assert.ok(sys.content.includes('## Town Lore'));
    assert.ok(sys.content.includes('### Chapel heist (uid: 1) [keys: chapel, heist]'));
    assert.ok(sys.content.includes('The chapel heist set the town on edge.'));
    assert.ok(!messages[mainIdx].content.includes('The chapel heist set the town on edge.'));
});

test('the extension never writes lorebook entries or books', async () => {
    stub.books['Town Lore'] = {
        entries: { 1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', constant: true }) },
    };
    globalThis.selected_world_info = ['Town Lore'];

    await assembleMessages(getConversation(), getEffectiveSettings(), null);

    assert.equal(stub.worldWrites.length, 0);
    const writeCalls = fetchCalls.filter(c => /\/api\/worldinfo\/(edit|create|delete|import)/.test(c.url));
    assert.equal(writeCalls.length, 0);
});

test('active global book entries appear in the extension payload', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', constant: true }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
});

test('the character embedded book appears in the payload', async () => {
    stub.chat = [mainMsg('The river-stone is warm tonight.', true)];
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            character_book: {
                entries: [
                    {
                        id: 7,
                        name: 'River stone',
                        keys: ['river-stone'],
                        content: 'The river-stone of Vellith glows when a promise is kept.',
                        enabled: true,
                    },
                    {
                        id: 8,
                        name: 'Disabled embedded',
                        keys: ['river-stone'],
                        content: 'EMBEDDED-DISABLED-MUST-NOT-APPEAR',
                        enabled: false,
                    },
                ],
            },
        },
    }];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('The river-stone of Vellith glows when a promise is kept.'));
    assert.ok(!text.includes('EMBEDDED-DISABLED-MUST-NOT-APPEAR'));
});

test('an embedded always-on entry appears without a keyword match', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            character_book: {
                entries: [
                    {
                        id: 9,
                        name: 'Always on constant',
                        keys: ['never-matching-key'],
                        content: 'EMBEDDED-CONSTANT-MUST-APPEAR',
                        constant: true,
                        enabled: true,
                    },
                    {
                        id: 10,
                        name: 'Always on selective false',
                        keys: ['never-matching-key'],
                        content: 'EMBEDDED-SELECTIVE-FALSE-MUST-APPEAR',
                        selective: false,
                        enabled: true,
                    },
                    {
                        id: 11,
                        name: 'Disabled always on',
                        keys: ['never-matching-key'],
                        content: 'EMBEDDED-DISABLED-ALWAYS-ON-MUST-NOT-APPEAR',
                        constant: true,
                        enabled: false,
                    },
                ],
            },
        },
    }];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('<lorebook_context>'));
    assert.ok(text.includes('EMBEDDED-CONSTANT-MUST-APPEAR'));
    assert.ok(text.includes('EMBEDDED-SELECTIVE-FALSE-MUST-APPEAR'));
    assert.ok(!text.includes('EMBEDDED-DISABLED-ALWAYS-ON-MUST-NOT-APPEAR'));
});

test('character lore extra books appear in the payload', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: { extensions: { world: 'Kyrine Primary' } },
    }];
    stub.books['Kyrine Primary'] = {
        entries: { 1: bookEntry(1, 'Kyrine keeps a silver coin from the first raid.', { comment: 'Coin', constant: true }) },
    };
    stub.books['Secret Orders'] = {
        entries: { 1: bookEntry(1, 'The east-gate passphrase is QX-7742-VEL.', { comment: 'Passphrase', constant: true }) },
    };
    globalThis.world_info = { charLore: [{ name: 'kyrine', extraBooks: ['Secret Orders'] }] };

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('Kyrine keeps a silver coin from the first raid.'));
    assert.ok(text.includes('The east-gate passphrase is QX-7742-VEL.'));
});

test('inner conversation scan can keyword-trigger an entry', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist', key: ['chapel'] }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];
    addTurn(getConversation(), 'user', 'I keep thinking about the chapel.');
    const settings = getEffectiveSettings();
    settings.lorebookAutoKeyword = true;

    const text = payloadText(await assembleMessages(getConversation(), settings, null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
});
