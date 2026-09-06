import { getConversation, saveSettings } from '../conversation.js';
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
        const outlet = e.automation_id || e.automationId || e.extensions?.outlet_name || e.outletName || e.outlet_name || e.outlet || '';
        const isOutlet = Boolean(outlet);
        const isForceConstant = e.selective === false;
        const disabled = e.enabled === false || e.disable === true;
        data.entries[uid] = {
            uid,
            key: keys,
            keysecondary: [],
            content: e.content || '',
            comment: e.comment || e.name || '',
            disable: disabled,
            selective: true,
            constant: !isOutlet && (e.constant === true || isForceConstant),
            position: isOutlet ? 7 : (e.position ?? 0),
            displayIndex: uid,
            automation_id: outlet,
            outletName: outlet,
            outlet: e.outlet || e.outlet_name || e.outletName || '',
            group: e.group || (isOutlet ? outlet : ''),
            role: null,
            extensions: { outlet_name: outlet },
            order: e.order ?? 100,
            probability: e.probability ?? 100,
            groupWeight: e.groupWeight ?? 100,
            depth: 4,
            useProbability: true,
            addMemo: true,
            groupOverride: false,
            sticky: 0,
            cooldown: 0,
            delay: 0,
            excludeRecursion: false,
            preventRecursion: false,
            delayUntilRecursion: false,
            ignoreBudget: false,
            vectorized: false,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false,
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

export function keywordMatchEntry(keys, text) {
    if (!keys?.length || !text) return false;
    const lower = text.toLowerCase();
    return keys.some(k => {
        if (!k) return false;
        try {
            const m = k.match(/^\/(.+)\/([gimsuy]*)$/);
            if (m) return new RegExp(m[1], m[2]).test(text);
        } catch (_) {}
        return lower.includes(k.toLowerCase());
    });
}

export function getKeywordTriggeredEntries(allBooksData, text1, text2) {
    const scanText = [text1, text2].filter(Boolean).join('\n');
    const results = {};
    for (const [bookName, data] of Object.entries(allBooksData)) {
        const entries = wiEntriesToArray(data);
        const matched = entries.filter(e => !e.disable && (keywordMatchEntry(e.key, scanText) || keywordMatchEntry(e.keysecondary, scanText)));
        if (matched.length) results[bookName] = matched;
    }
    return results;
}

export function getEntryOverrideKey(bookName, entry) {
    let entryName = String(entry.comment || entry.name || '').trim();
    if (!entryName && entry.key && entry.key.length) {
        entryName = entry.key.join('_').slice(0, 40);
    }
    entryName = String(entryName).replace(/[\r\n]+/g, ' ').trim();
    return entryName ? `${bookName}_${entryName}` : `${bookName}_${entry.uid}`;
}

export async function buildLorebookContextBlock(settings) {
    const selectedBooks = settings.lorebookSelectedBooks || [];
    const excludedBooks = new Set(settings.lorebookExcludedBooks || []);
    const overrides = settings.lorebookEntryOverrides || {};
    const loadedBooks = {};
    const _activeNamesSet = new Set(await getActiveLorebookNames());

    if (!_activeNamesSet.size) return '';

    await Promise.all([..._activeNamesSet].map(async name => {
        if (excludedBooks.has(name)) return;
        const data = await fetchWorldInfoBook(name);
        if (data) loadedBooks[name] = data;
    }));

    if (!Object.keys(loadedBooks).length) return '';

    let keywordEntries = {};
    if (settings.lorebookAutoKeyword) {
        const ctx = SillyTavern.getContext();
        const msgs = ctx.chat || [];
        let lastUser = '', lastChar = '';

        try {
            const conv = getConversation();
            const picked = conv.pickedChatIndices;
            if (picked && picked.length > 0) {
                const pickedMsgs = picked.filter(i => i >= 0 && i < msgs.length).map(i => msgs[i]);
                lastUser = pickedMsgs.filter(m => m.is_user).map(m => m.mes).join('\n');
                lastChar = pickedMsgs.filter(m => !m.is_user).map(m => m.mes).join('\n');
            } else {
                const stDepth = Math.max(1, settings.lorebookSTScanDepth ?? 5);
                const recentMsgs = msgs.slice(-stDepth);
                lastUser = recentMsgs.filter(m => m.is_user).map(m => m.mes).join('\n');
                lastChar = recentMsgs.filter(m => !m.is_user).map(m => m.mes).join('\n');
            }
        } catch (_) {
            const stDepth = Math.max(1, settings.lorebookSTScanDepth ?? 5);
            const recentMsgs = msgs.slice(-stDepth);
            lastUser = recentMsgs.filter(m => m.is_user).map(m => m.mes).join('\n');
            lastChar = recentMsgs.filter(m => !m.is_user).map(m => m.mes).join('\n');
        }

        let copilotScanText = '';
        try {
            const conv = getConversation();
            const copilotDepth = settings.lorebookCopilotScanDepth ?? 6;
            copilotScanText = conv.messages
                .filter(m => !m.isLBHistory)
                .slice(-copilotDepth)
                .map(m => m.content)
                .join('\n');
        } catch (_) {}

        keywordEntries = getKeywordTriggeredEntries(loadedBooks, lastUser + '\n' + lastChar, copilotScanText);
    }

    const toInject = {};
    const outletLines = [];
    let overridesChanged = false;

    for (const [bookName, data] of Object.entries(loadedBooks)) {
        for (const entry of wiEntriesToArray(data)) {
            if (!entry.content) continue;

            const oldKey = `${bookName}_${entry.uid}`;
            const newKey = getEntryOverrideKey(bookName, entry);

            if (oldKey !== newKey && overrides[oldKey] !== undefined) {
                overrides[newKey] = overrides[oldKey];
                delete overrides[oldKey];
                overridesChanged = true;
            }

            const override = overrides[newKey];
            if (override === false) continue;

            const isConstant = !!entry.constant && !entry.disable;
            const manualInclude = selectedBooks.includes(bookName);
            const keywordInclude = keywordEntries[bookName]?.some(e => e.uid === entry.uid);

            if (override === true || isConstant || manualInclude || keywordInclude) {
                const outletField = (entry.outlet || entry.outlet_name || entry.outletName || entry.automation_id || entry.automationId || '').trim();
                const isOutletPos = String(entry.position).toLowerCase() === 'outlet' || String(entry.position) === '7';
                const finalOutletName = outletField || (isOutletPos ? (entry.group || '').trim() : '');
                const isOutlet = isOutletPos || finalOutletName !== '';

                if (isOutlet) {
                    if (!entry.disable) {
                        outletLines.push(`### ${entry.comment || `Entry #${entry.uid}`} (uid: ${entry.uid}, book: "${getDisplayName(bookName)}") [outlet name: ${finalOutletName}]\n${entry.content}`);
                    }
                    continue;
                }

                if (!toInject[bookName]) toInject[bookName] = [];
                toInject[bookName].push(entry);
            }
        }
    }

    if (overridesChanged) saveSettings();

    if (!Object.keys(toInject).length && !outletLines.length) return '';

    let block = '\n\n<lorebook_context>\n';
    for (const [bookName, entries] of Object.entries(toInject)) {
        let hasValidEntries = false;
        let bookBlock = `## ${getDisplayName(bookName)}\n`;

        for (const e of entries) {
            hasValidEntries = true;
            bookBlock += `### ${e.comment || `Entry #${e.uid}`} (uid: ${e.uid})`;
            if (e.key?.length) bookBlock += ` [keys: ${e.key.slice(0, 5).join(', ')}]`;
            bookBlock += `\n${e.content}\n\n`;
        }
        if (hasValidEntries) block += bookBlock;
    }

    if (outletLines.length) {
        block += `## Outlet Entries (injected only where an outlet::<name> macro is manually placed elsewhere, not directly)\n${outletLines.join('\n\n')}\n\n`;
    }

    if (block === '\n\n<lorebook_context>\n') return '';

    block += '</lorebook_context>';
    return block;
}
