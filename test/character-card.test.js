import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── SillyTavern stub seam (prior art: lorebook.test.js) ──────────────────────

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
globalThis.fetch = async (url, opts = {}) => {
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
    characterId: 0,
    groupId: null,
    groups: [],
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: stub.characterId,
            characters: stub.characters,
            groupId: stub.groupId,
            groups: stub.groups,
            name1: 'User',
            name2: stub.characters[stub.characterId]?.name || 'Kyrine',
            extensionSettings: stub.extensionSettings,
            saveSettingsDebounced() {},
            saveMetadata() {},
            getCurrentChatId: () => stub.chatId,
            getRequestHeaders: () => ({}),
            get chatMetadata() { return stub.chatMetadata; },
            set chatMetadata(v) { stub.chatMetadata = v; },
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

function systemContent(messages) {
    const sys = messages.find(m => m.role === 'system');
    assert.ok(sys, 'payload has a system message');
    return sys.content;
}

async function reset() {
    files.clear();
    stub.characters = [{ name: 'Kyrine', avatar: 'kyrine.png', data: {} }];
    stub.characterId = 0;
    stub.groupId = null;
    stub.groups = [];
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = {};
    stub.extensionSettings = {};
    await initConversation({ forceReset: true });
}

beforeEach(reset);

test('description, personality, scenario, and character note appear in the payload when present on the card', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            description: 'Kyrine keeps a river-stone that glows when a promise is kept.',
            personality: 'Dry, patient, and slow to trust.',
            scenario: 'A rain-soaked tavern on the east road.',
            extensions: { depth_prompt: { prompt: 'Never mention the river-stone unless asked.' } },
        },
    }];

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));
    assert.ok(text.includes('Dry, patient, and slow to trust.'));
    assert.ok(text.includes('A rain-soaked tavern on the east road.'));
    assert.ok(text.includes('Never mention the river-stone unless asked.'));
});

test('empty card fields add nothing to the payload', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            description: 'Kyrine keeps a river-stone that glows when a promise is kept.',
            personality: '',
            scenario: '   ',
        },
    }];

    const sys = systemContent(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(sys.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));
    assert.ok(!sys.includes('<personality>'));
    assert.ok(!sys.includes('<scenario>'));
    assert.ok(!sys.includes('<character_note>'));
});

test('chat-level character overrides win over card fields', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            description: 'CARD-DESCRIPTION-MUST-NOT-APPEAR',
            personality: 'CARD-PERSONALITY-MUST-NOT-APPEAR',
        },
    }];
    stub.chatMetadata = {
        character_overrides: {
            description: 'OVERRIDE-DESCRIPTION-EAST-GATE',
            personality: 'OVERRIDE-PERSONALITY-SILVER-COIN',
        },
    };

    const text = payloadText(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(text.includes('OVERRIDE-DESCRIPTION-EAST-GATE'));
    assert.ok(text.includes('OVERRIDE-PERSONALITY-SILVER-COIN'));
    assert.ok(!text.includes('CARD-DESCRIPTION-MUST-NOT-APPEAR'));
    assert.ok(!text.includes('CARD-PERSONALITY-MUST-NOT-APPEAR'));
});

test('group chat: every present member\'s card fields appear, attributed per character', async () => {
    stub.groupId = 'group-1';
    stub.groups = [{ id: 'group-1', members: ['kyrine.png', 'mira.png'] }];
    stub.characters = [
        {
            name: 'Kyrine',
            avatar: 'kyrine.png',
            data: { description: 'Kyrine-keeps-the-river-stone.' },
        },
        {
            name: 'Mira',
            avatar: 'mira.png',
            data: { description: 'Mira-carries-the-east-gate-key.' },
        },
    ];

    const sys = systemContent(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(sys.includes('Current group members: Kyrine, Mira'));
    const kyrine = sys.match(/<character name="Kyrine">[\s\S]*?<\/character>/)?.[0] || '';
    const mira = sys.match(/<character name="Mira">[\s\S]*?<\/character>/)?.[0] || '';
    assert.ok(kyrine.includes('Kyrine-keeps-the-river-stone.'));
    assert.ok(!kyrine.includes('Mira-carries-the-east-gate-key.'));
    assert.ok(mira.includes('Mira-carries-the-east-gate-key.'));
    assert.ok(!mira.includes('Kyrine-keeps-the-river-stone.'));
});

test('the character-card toggle is on by default and off reduces the block to the name-only form', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: { description: 'Kyrine keeps a river-stone that glows when a promise is kept.' },
    }];

    const settings = getEffectiveSettings();
    assert.equal(settings.includeCharacterCard, true);

    let sys = systemContent(await assembleMessages(getConversation(), settings, null));
    assert.ok(sys.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));

    settings.includeCharacterCard = false;
    sys = systemContent(await assembleMessages(getConversation(), settings, null));
    assert.ok(!sys.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));
    assert.ok(!sys.includes('<description>'));
    assert.match(sys, /<character_information>\s*Name: Kyrine\s*<\/character_information>/);
});

test('a directive present only in the Author\'s Note is in the payload with the toggle on, and absent with it off', async () => {
    stub.characters = [{ name: 'Kyrine', avatar: 'kyrine.png', data: {} }];
    stub.chatMetadata = { note_prompt: 'AN-DIRECTIVE-ONLY-IN-AUTHORS-NOTE: speak in short lines.' };

    const settings = getEffectiveSettings();
    let sys = systemContent(await assembleMessages(getConversation(), settings, null));
    assert.ok(sys.includes('AN-DIRECTIVE-ONLY-IN-AUTHORS-NOTE: speak in short lines.'));
    assert.match(sys, /<authors_note>[\s\S]*AN-DIRECTIVE-ONLY-IN-AUTHORS-NOTE/);

    settings.includeCharacterCard = false;
    sys = systemContent(await assembleMessages(getConversation(), settings, null));
    assert.ok(!sys.includes('AN-DIRECTIVE-ONLY-IN-AUTHORS-NOTE: speak in short lines.'));
    assert.ok(!sys.includes('<authors_note>'));
});

test('example messages and creator notes appear in the payload when present on the card', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            mes_example: '{{user}}: Hello.\n{{char}}: The stone is already warm.',
            creator_notes: 'Kyrine never lies about the river-stone.',
        },
    }];

    const sys = systemContent(await assembleMessages(getConversation(), getEffectiveSettings(), null));
    assert.ok(sys.includes('The stone is already warm.'));
    assert.ok(sys.includes('Kyrine never lies about the river-stone.'));
});

test('character cards sit as established knowledge about the people in the scene, ahead of the main-chat slice', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: { description: 'Kyrine keeps a river-stone that glows when a promise is kept.' },
    }];

    const messages = await assembleMessages(getConversation(), getEffectiveSettings(), null);
    const sys = systemContent(messages);
    const mainIdx = messages.findIndex(m => typeof m.content === 'string' && m.content.includes('<main_chat'));
    assert.ok(mainIdx > 0, 'main-chat slice is not the first message');
    assert.match(sys, /Established knowledge about the people in the scene/);
    assert.match(sys, /not events from the current scene/);
    assert.ok(sys.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));
    assert.ok(!messages[mainIdx].content.includes('Kyrine keeps a river-stone that glows when a promise is kept.'));
});
