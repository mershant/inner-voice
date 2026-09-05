import { _dbgAdd } from '../utils/util-debug.js';

export const EMBEDDED_BOOK_KEY = '__char_embedded__';

let _worldInfoMod = false;
let _utilsMod = false;

async function loadWorldInfoMod() {
    if (_worldInfoMod !== false) return _worldInfoMod;
    try {
        _worldInfoMod = await import('/scripts/world-info.js');
    } catch (_) {
        _worldInfoMod = null;
    }
    return _worldInfoMod;
}

async function loadUtilsMod() {
    if (_utilsMod !== false) return _utilsMod;
    try {
        _utilsMod = await import('/scripts/utils.js');
    } catch (_) {
        _utilsMod = null;
    }
    return _utilsMod;
}

function charaFilename(character) {
    const avatar = character?.avatar;
    if (!avatar) return null;
    return String(avatar).replace(/\.[^/.]+$/, '');
}

export function getEmbeddedCharBook() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    const book = char?.data?.character_book;
    if (!book?.entries?.length) return null;

    const data = { entries: {}, _embedded: true };
    (book.entries || []).forEach((e, idx) => {
        const uid = e.id ?? e.uid ?? idx;
        const keys = Array.isArray(e.keys) ? e.keys : (e.key || []);
        const disabled = e.enabled === false || e.disable === true;
        data.entries[uid] = {
            uid,
            key: keys,
            content: e.content || '',
            comment: e.comment || e.name || '',
            disable: disabled,
        };
    });
    return data;
}

export async function fetchWorldInfoBook(name) {
    if (name === EMBEDDED_BOOK_KEY) return getEmbeddedCharBook();

    const ctx = SillyTavern.getContext();
    try {
        if (typeof ctx.loadWorldInfo === 'function') {
            return await ctx.loadWorldInfo(name);
        }
        const res = await fetch('/api/worldinfo/get', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        _dbgAdd('LB_LOAD_FILE_FAILED', { bookName: name, error: e.message });
        return null;
    }
}

export function wiEntriesToArray(data) {
    if (!data?.entries) return [];
    if (Array.isArray(data.entries)) return data.entries;
    return Object.values(data.entries);
}

function entryDisabled(entry) {
    return entry?.disable === true || entry?.enabled === false;
}

export function getDisplayName(name) {
    if (name === EMBEDDED_BOOK_KEY) {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        return `[${char?.name || 'Character'} Book]`;
    }
    return name;
}

export async function getActiveLorebookNames() {
    const ctx = SillyTavern.getContext();
    const names = new Set();
    const wi = await loadWorldInfoMod();
    const utils = await loadUtilsMod();

    const globalBooks = wi?.selected_world_info
        || (typeof window !== 'undefined' && window.selected_world_info)
        || [];
    if (Array.isArray(globalBooks)) {
        globalBooks.forEach(n => n && names.add(n));
    }

    const charId = ctx.characterId;
    const character = ctx.characters?.[charId];
    if (character) {
        const baseWorldName = character.data?.extensions?.world || character.world;
        if (baseWorldName && typeof baseWorldName === 'string') names.add(baseWorldName);

        let fileName = charaFilename(character);
        if (utils && typeof utils.getCharaFilename === 'function') {
            try { fileName = utils.getCharaFilename(charId) || fileName; } catch (_) {}
        }
        const charLoreList = wi?.world_info?.charLore
            || (typeof window !== 'undefined' && window.world_info?.charLore);
        if (fileName && Array.isArray(charLoreList)) {
            const extraCharLore = charLoreList.find(e => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                extraCharLore.extraBooks.forEach(book => book && names.add(book));
            }
        }

        if (character.data?.character_book?.entries?.length) {
            names.add(EMBEDDED_BOOK_KEY);
        }
    }

    const wiKey = wi?.METADATA_KEY || (typeof window !== 'undefined' && window.WI_METADATA_KEY) || 'world_info';
    const chatWorldName = ctx.chatMetadata?.[wiKey];
    if (chatWorldName && typeof chatWorldName === 'string') names.add(chatWorldName);

    const personaWorldName = ctx.powerUserSettings?.persona_description_lorebook;
    if (personaWorldName && typeof personaWorldName === 'string') names.add(personaWorldName);

    return [...names].filter(Boolean);
}

export async function buildLorebookContextBlock(settings) {
    if (settings && settings.includeLorebook === false) return '';

    const activeNames = await getActiveLorebookNames();
    if (!activeNames.length) return '';

    const loaded = [];
    for (const name of activeNames) {
        const data = await fetchWorldInfoBook(name);
        if (data) loaded.push({ name, data });
    }

    const books = [];
    for (const { name, data } of loaded) {
        const entries = wiEntriesToArray(data).filter(e => e && !entryDisabled(e) && String(e.content || '').trim());
        if (!entries.length) continue;
        books.push({ name, entries });
    }
    if (!books.length) return '';

    let block = '\n\n<world_knowledge>\nEstablished facts about the world. These are not events from the current scene.\n';
    for (const { name, entries } of books) {
        block += `\n## ${getDisplayName(name)}\n`;
        for (const e of entries) {
            const title = e.comment || e.name || `Entry #${e.uid ?? ''}`;
            block += `### ${title}\n${e.content}\n`;
        }
    }
    block += '</world_knowledge>';
    return block;
}
