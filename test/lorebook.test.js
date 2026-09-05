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

const { initConversation, getConversation, getEffectiveSettings } = await import('../src/conversation.js');
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

test('active global book entries appear in the extension payload', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist' }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
});

test('disabled entries and inactive books stay out of the payload', async () => {
    stub.books['Town Lore'] = {
        entries: {
            1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist' }),
            2: bookEntry(2, 'DISABLED-ENTRY-MUST-NOT-APPEAR', { comment: 'Secret', disable: true }),
        },
    };
    stub.books['Idle Atlas'] = {
        entries: {
            1: bookEntry(1, 'INACTIVE-BOOK-MUST-NOT-APPEAR', { comment: 'Idle' }),
        },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('The chapel heist set the town on edge.'));
    assert.ok(!text.includes('DISABLED-ENTRY-MUST-NOT-APPEAR'));
    assert.ok(!text.includes('INACTIVE-BOOK-MUST-NOT-APPEAR'));
});

test('the character embedded book appears in the payload', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            character_book: {
                entries: [
                    {
                        id: 7,
                        name: 'River stone',
                        keys: ['never-matching-key'],
                        content: 'The river-stone of Vellith glows when a promise is kept.',
                        enabled: true,
                    },
                    {
                        id: 8,
                        name: 'Disabled embedded',
                        keys: ['never-matching-key'],
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

test('character lore extra books appear in the payload', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: { extensions: { world: 'Kyrine Primary' } },
    }];
    stub.books['Kyrine Primary'] = {
        entries: { 1: bookEntry(1, 'Kyrine keeps a silver coin from the first raid.', { comment: 'Coin' }) },
    };
    stub.books['Secret Orders'] = {
        entries: { 1: bookEntry(1, 'The east-gate passphrase is QX-7742-VEL.', { comment: 'Passphrase' }) },
    };
    globalThis.world_info = { charLore: [{ name: 'kyrine', extraBooks: ['Secret Orders'] }] };

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('Kyrine keeps a silver coin from the first raid.'));
    assert.ok(text.includes('The east-gate passphrase is QX-7742-VEL.'));
});

test('the lorebook toggle is on by default and off removes the content', async () => {
    stub.books['Town Lore'] = {
        entries: { 1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist' }) },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const settings = getEffectiveSettings();
    assert.equal(settings.includeLorebook, true);

    let messages = await assembleMessages(getConversation(), settings, null);
    assert.ok(payloadText(messages).includes('The chapel heist set the town on edge.'));

    settings.includeLorebook = false;
    messages = await assembleMessages(getConversation(), settings, null);
    const offText = payloadText(messages);
    assert.ok(!offText.includes('The chapel heist set the town on edge.'));
    assert.ok(!offText.includes('<world_knowledge>'));
});

test('the extension never writes lorebook entries or books', async () => {
    stub.books['Town Lore'] = {
        entries: { 1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist' }) },
    };
    globalThis.selected_world_info = ['Town Lore'];

    await assembleMessages(getConversation(), getEffectiveSettings(), null);

    assert.equal(stub.worldWrites.length, 0);
    const writeCalls = fetchCalls.filter(c => /\/api\/worldinfo\/(edit|create|delete|import)/.test(c.url));
    assert.equal(writeCalls.length, 0);
});

test('lorebook content sits with world knowledge ahead of the main-chat slice', async () => {
    stub.books['Town Lore'] = {
        entries: { 1: bookEntry(1, 'The chapel heist set the town on edge.', { comment: 'Chapel heist' }) },
    };
    globalThis.selected_world_info = ['Town Lore'];

    const messages = await assembleMessages(getConversation(), getEffectiveSettings(), null);
    const sys = messages.find(m => m.role === 'system');
    const mainIdx = messages.findIndex(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    assert.ok(sys, 'payload has a system message');
    assert.ok(mainIdx > 0, 'main-chat slice is not the first message');
    assert.match(sys.content, /<world_knowledge>/);
    assert.match(sys.content, /Established facts about the world/);
    assert.match(sys.content, /not events from the current scene/);
    assert.ok(sys.content.includes('The chapel heist set the town on edge.'));
    assert.ok(!messages[mainIdx].content.includes('The chapel heist set the town on edge.'));
});
