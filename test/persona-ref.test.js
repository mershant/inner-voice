import { test } from 'node:test';
import assert from 'node:assert/strict';

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

const fetched = [];
const originalFetch = globalThis.fetch;

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
globalThis.window.user_avatar = undefined;

globalThis.SillyTavern = {
    getContext() {
        return {
            name1: 'Eloise',
            name2: 'Seraphina',
            characterId: 0,
            characters: [{ name: 'Seraphina', avatar: 'default_Seraphina.png' }],
            chatMetadata: {},
            powerUserSettings: { personas: { '1733826522608-Eloise.png': 'Eloise' }, default_persona: '1733826522608-Eloise.png' },
            user_avatar: null,
            getThumbnailUrl(type, file) { return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`; },
            getRequestHeaders({ omitContentType = false } = {}) {
                const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 't' };
                if (omitContentType) delete headers['Content-Type'];
                return headers;
            },
            extensionSettings: {},
            saveSettingsDebounced() {},
            chat: [],
        };
    },
};

globalThis.fetch = async (url, options = {}) => {
    fetched.push({ url: String(url), headers: options.headers || {} });
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
};

const { collectReferenceSources, personaEntity } = await import('../src/features/feature-image-engine.js');

test('collectReferenceSources fetches the selected STD persona through getThumbnailUrl, not a name-guessed file', async () => {
    fetched.length = 0;
    const persona = personaEntity();
    assert.equal(persona.avatar, 'user-default.png');
    assert.equal(persona.name, 'Eloise');
    const sources = await collectReferenceSources();
    assert.equal(sources.persona.avatar, 'user-default.png');
    assert.ok(String(sources.persona.dataUrl).startsWith('data:image/png;base64,'));
    const personaFetches = fetched.filter(f => String(f.url).includes('persona') || String(f.url).includes('User Avatars') || String(f.url).includes('Eloise'));
    assert.equal(personaFetches.some(f => f.url === '/thumbnail?type=persona&file=user-default.png'), true);
    assert.equal(personaFetches.some(f => String(f.url).includes('1733826522608-Eloise')), false);
    assert.equal(personaFetches.every(f => !('Content-Type' in (f.headers || {}))), true);
});

test.after(() => {
    globalThis.fetch = originalFetch;
});
