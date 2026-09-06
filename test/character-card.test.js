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

const SENTINELS = {
    tags: 'SENTINEL-TAGS-RIVER-STONE',
    description: 'SENTINEL-DESCRIPTION-EAST-GATE',
    personality: 'SENTINEL-PERSONALITY-SILVER-COIN',
    scenario: 'SENTINEL-SCENARIO-RAIN-TAVERN',
    first_mes: 'SENTINEL-FIRST-MES-LANTERN',
    mes_example: 'SENTINEL-MES-EXAMPLE-WARM-STONE',
    authors_note: 'SENTINEL-AUTHORS-NOTE-SHORT-LINES',
    system_prompt: 'SENTINEL-SYSTEM-PROMPT-OVERRIDE',
    post_history_instructions: 'SENTINEL-POST-HISTORY-INSTRUCTIONS',
    greeting0: 'SENTINEL-GREETING-ZERO-DOCK',
    greeting1: 'SENTINEL-GREETING-ONE-HARBOR',
};

const UPSTREAM_CHAR_EDIT_FIELDS = {
    tags: true, description: true, personality: true,
    scenario: true, first_mes: true, mes_example: true,
    alternate_greetings: false, authors_note: true,
    system_prompt: true, post_history_instructions: true, name: false,
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
    tags: [],
    tagMap: {},
};

globalThis.SillyTavern = {
    getContext() {
        return {
            chat: stub.chat,
            characterId: stub.characterId,
            characters: stub.characters,
            groupId: stub.groupId,
            groups: stub.groups,
            tags: stub.tags,
            tagMap: stub.tagMap,
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

function systemContent(messages) {
    const sys = messages.find(m => m.role === 'system');
    assert.ok(sys, 'payload has a system message');
    return sys.content;
}

function charactersXml(sys) {
    const m = sys.match(/<characters>[\s\S]*?<\/characters>/);
    return m ? m[0] : '';
}

function characterBlock(sys, name) {
    const m = sys.match(new RegExp(`<character name="${name}">[\\s\\S]*?</character>`));
    return m ? m[0] : '';
}

function fullCard() {
    return {
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            description: SENTINELS.description,
            personality: SENTINELS.personality,
            scenario: SENTINELS.scenario,
            first_mes: SENTINELS.first_mes,
            mes_example: SENTINELS.mes_example,
            system_prompt: SENTINELS.system_prompt,
            post_history_instructions: SENTINELS.post_history_instructions,
            alternate_greetings: [SENTINELS.greeting0, SENTINELS.greeting1],
        },
    };
}

async function reset() {
    files.clear();
    fetchCalls.length = 0;
    stub.characters = [{ name: 'Kyrine', avatar: 'kyrine.png', data: {} }];
    stub.characterId = 0;
    stub.groupId = null;
    stub.groups = [];
    stub.tags = [{ id: 't1', name: SENTINELS.tags }];
    stub.tagMap = { 'kyrine.png': ['t1'] };
    stub.chat = [mainMsg('The tavern falls silent.')];
    stub.chatId = 'chat-a';
    stub.chatMetadata = { note_prompt: SENTINELS.authors_note };
    stub.extensionSettings = {};
    await initConversation({ forceReset: true });
}

beforeEach(reset);

test('defaults match upstream charEditFields', async () => {
    const settings = getEffectiveSettings();
    assert.deepEqual(settings.charEditFields, UPSTREAM_CHAR_EDIT_FIELDS);
});

test('each field checkbox independently includes or excludes its field from the payload block', async () => {
    stub.characters = [fullCard()];
    const settings = getEffectiveSettings();

    const xml = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
    assert.ok(xml.includes(SENTINELS.tags));
    assert.ok(xml.includes(SENTINELS.description));
    assert.ok(xml.includes(SENTINELS.personality));
    assert.ok(xml.includes(SENTINELS.scenario));
    assert.ok(xml.includes(SENTINELS.first_mes));
    assert.ok(xml.includes(SENTINELS.mes_example));
    assert.ok(xml.includes(SENTINELS.authors_note));
    assert.ok(xml.includes(SENTINELS.system_prompt));
    assert.ok(xml.includes(SENTINELS.post_history_instructions));
    assert.ok(!xml.includes(SENTINELS.greeting0), 'alternate_greetings is off by default');
    assert.ok(!xml.includes(SENTINELS.greeting1));

    const cases = [
        { field: 'tags', sentinel: SENTINELS.tags, tag: 'tags' },
        { field: 'description', sentinel: SENTINELS.description, tag: 'description' },
        { field: 'personality', sentinel: SENTINELS.personality, tag: 'personality' },
        { field: 'scenario', sentinel: SENTINELS.scenario, tag: 'scenario' },
        { field: 'first_mes', sentinel: SENTINELS.first_mes, tag: 'first_mes' },
        { field: 'mes_example', sentinel: SENTINELS.mes_example, tag: 'mes_example' },
        { field: 'authors_note', sentinel: SENTINELS.authors_note, tag: 'authors_note' },
        { field: 'system_prompt', sentinel: SENTINELS.system_prompt, tag: 'character_system_prompt_override' },
        { field: 'post_history_instructions', sentinel: SENTINELS.post_history_instructions, tag: 'post_history_instructions' },
    ];
    for (const { field, sentinel, tag } of cases) {
        settings.charEditFields = { ...UPSTREAM_CHAR_EDIT_FIELDS, [field]: false };
        const off = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
        assert.ok(!off.includes(sentinel), `${field} off must drop its sentinel`);
        assert.ok(!off.includes(`<${tag}>`), `${field} off must drop <${tag}>`);
        for (const other of cases) {
            if (other.field === field) continue;
            assert.ok(off.includes(other.sentinel), `${field} off must keep ${other.field}`);
        }
    }
});

test('group chat: per-character exclusion removes that member; per-character field overrides win', async () => {
    stub.groupId = 'group-1';
    stub.groups = [{ id: 'group-1', members: ['kyrine.png', 'mira.png'] }];
    stub.characters = [
        { name: 'Kyrine', avatar: 'kyrine.png', data: { description: 'Kyrine-keeps-the-river-stone.', personality: 'Kyrine-dry-patience.' } },
        { name: 'Mira', avatar: 'mira.png', data: { description: 'Mira-carries-the-east-gate-key.', personality: 'Mira-quick-temper.' } },
    ];
    stub.tagMap = {};
    stub.chatMetadata = {};

    const settings = getEffectiveSettings();
    settings.charMgrExcluded = ['mira.png'];
    let sys = systemContent(await assembleMessages(getConversation(), settings, null));
    assert.ok(characterBlock(sys, 'Kyrine').includes('Kyrine-keeps-the-river-stone.'));
    assert.equal(characterBlock(sys, 'Mira'), '');
    assert.ok(!sys.includes('Mira-carries-the-east-gate-key.'));

    settings.charMgrExcluded = [];
    settings.charMgrFieldOverrides = { 'mira.png': { description: false } };
    sys = systemContent(await assembleMessages(getConversation(), settings, null));
    const mira = characterBlock(sys, 'Mira');
    const kyrine = characterBlock(sys, 'Kyrine');
    assert.ok(mira.includes('Mira-quick-temper.'));
    assert.ok(!mira.includes('Mira-carries-the-east-gate-key.'));
    assert.ok(!mira.includes('<description>'));
    assert.ok(kyrine.includes('Kyrine-keeps-the-river-stone.'));
});

test('block structure matches upstream XML tags and wrapping', async () => {
    stub.characters = [fullCard()];
    const settings = getEffectiveSettings();
    settings.charEditFields = { ...UPSTREAM_CHAR_EDIT_FIELDS, alternate_greetings: true };

    const sys = systemContent(await assembleMessages(getConversation(), settings, null));
    const xml = charactersXml(sys);
    assert.ok(xml, 'payload uses <characters>');
    assert.ok(!sys.includes('<character_information>'));
    assert.ok(!sys.includes('Established knowledge about the people in the scene'));
    assert.match(xml, /<character name="Kyrine">/);
    assert.match(xml, /<tags>\nSENTINEL-TAGS-RIVER-STONE\n<\/tags>/);
    assert.match(xml, /<character_system_prompt_override>\nSENTINEL-SYSTEM-PROMPT-OVERRIDE\n<\/character_system_prompt_override>/);
    assert.match(xml, /<post_history_instructions>\nSENTINEL-POST-HISTORY-INSTRUCTIONS\n<\/post_history_instructions>/);
    assert.match(xml, /<description>\nSENTINEL-DESCRIPTION-EAST-GATE\n<\/description>/);
    assert.match(xml, /<personality>\nSENTINEL-PERSONALITY-SILVER-COIN\n<\/personality>/);
    assert.match(xml, /<scenario>\nSENTINEL-SCENARIO-RAIN-TAVERN\n<\/scenario>/);
    assert.match(xml, /<first_mes>\nSENTINEL-FIRST-MES-LANTERN\n<\/first_mes>/);
    assert.match(xml, /<mes_example>\nSENTINEL-MES-EXAMPLE-WARM-STONE\n<\/mes_example>/);
    assert.match(xml, /<alternate_greetings>\n {2}<greeting id="1">\nSENTINEL-GREETING-ZERO-DOCK\n {2}<\/greeting>\n {2}<greeting id="2">\nSENTINEL-GREETING-ONE-HARBOR\n {2}<\/greeting>\n<\/alternate_greetings>/);
    assert.match(xml, /<authors_note>\nSENTINEL-AUTHORS-NOTE-SHORT-LINES\n<\/authors_note>/);
    assert.ok(!xml.includes('<character_note>'));
    assert.ok(!xml.includes('<creator_notes>'));
    assert.ok(!xml.includes('Never mention the river-stone'));
});

test('empty or missing field values add no empty tags', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: { description: SENTINELS.description, personality: '', scenario: '' },
    }];
    stub.tagMap = {};
    stub.chatMetadata = {};

    const xml = charactersXml(systemContent(await assembleMessages(getConversation(), getEffectiveSettings(), null)));
    assert.ok(xml.includes(SENTINELS.description));
    assert.ok(!xml.includes('<personality>'));
    assert.ok(!xml.includes('<scenario>'));
    assert.ok(!xml.includes('<tags>'));
    assert.ok(!xml.includes('<authors_note>'));
    assert.ok(!xml.includes('<first_mes>'));
});

test('alternate greetings: off omits all; on with no index list includes all; index list is 0-based stored and 1-based in XML', async () => {
    stub.characters = [fullCard()];
    const settings = getEffectiveSettings();

    let xml = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
    assert.ok(!xml.includes('<alternate_greetings>'));
    assert.ok(!xml.includes(SENTINELS.greeting0));

    settings.charEditFields = { ...UPSTREAM_CHAR_EDIT_FIELDS, alternate_greetings: true };
    xml = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
    assert.ok(xml.includes(SENTINELS.greeting0));
    assert.ok(xml.includes(SENTINELS.greeting1));
    assert.match(xml, /<greeting id="1">/);
    assert.match(xml, /<greeting id="2">/);

    settings.altGreetingIndices = { 'kyrine.png': [1] };
    xml = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
    assert.ok(!xml.includes(SENTINELS.greeting0));
    assert.ok(xml.includes(SENTINELS.greeting1));
    assert.match(xml, /<greeting id="2">\nSENTINEL-GREETING-ONE-HARBOR\n {2}<\/greeting>/);
    assert.ok(!xml.includes('<greeting id="1">'));
});

test('Evolutia dynamic fields replace description for the main character when useAspectEvolutia is on', async () => {
    stub.characters = [{
        name: 'Kyrine',
        avatar: 'kyrine.png',
        data: {
            description: 'CARD-DESCRIPTION-MUST-NOT-APPEAR',
            personality: SENTINELS.personality,
            extensions: {
                'st-description-swap-fields': {
                    swapEnabled: true,
                    activeAlterEgoId: 'base',
                    alterEgos: [{
                        id: 'base',
                        fields: [{ id: 'f1', name: 'Core', content: 'SENTINEL-EVOLUTIA-CORE-FIELD', enabled: true }],
                    }],
                },
            },
        },
    }];
    stub.tagMap = {};
    stub.chatMetadata = {};

    const settings = getEffectiveSettings();
    assert.equal(settings.useAspectEvolutia, true);
    const xml = charactersXml(systemContent(await assembleMessages(getConversation(), settings, null)));
    assert.match(xml, /<evolutia_char_field name="Core">\nSENTINEL-EVOLUTIA-CORE-FIELD\n<\/evolutia_char_field>/);
    assert.ok(!xml.includes('CARD-DESCRIPTION-MUST-NOT-APPEAR'));
    assert.ok(!xml.includes('<description>'));
    assert.ok(xml.includes(SENTINELS.personality));
});

test('assembling the payload does not call character save or write APIs', async () => {
    stub.characters = [fullCard()];
    await assembleMessages(getConversation(), getEffectiveSettings(), null);
    const writes = fetchCalls.filter(c =>
        c.url.includes('/api/characters/') || c.method === 'POST' && /characters/.test(c.url)
    );
    assert.deepEqual(writes, []);
});
