import { getSettings } from '../conversation.js';
import { escHtml } from '../utils/util-dom.js';
import { getTagsForCharacter, getAuthorsNote } from '../utils/util-st.js';
import { _getAspectEvolutiaCharFields } from '../integrations/integ-evolutia.js';

export function getEffectiveCharField(settings, k) {
    const ovKey = 'charField_' + k;
    if (settings[ovKey] !== undefined) return settings[ovKey];
    return !!(settings.charEditFields || {})[k];
}

export function isCharacterExcluded(settings, charId) {
    return (settings.charMgrExcluded || []).includes(charId);
}

export function setCharacterExcluded(settings, charId, excluded) {
    if (!Array.isArray(settings.charMgrExcluded)) settings.charMgrExcluded = [];
    const idx = settings.charMgrExcluded.indexOf(charId);
    if (excluded && idx === -1) settings.charMgrExcluded.push(charId);
    else if (!excluded && idx !== -1) settings.charMgrExcluded.splice(idx, 1);
}

export function getCharFieldOverride(settings, charId, field) {
    return (settings.charMgrFieldOverrides || {})[charId]?.[field];
}

export function setCharFieldOverride(settings, charId, field, value) {
    if (!settings.charMgrFieldOverrides) settings.charMgrFieldOverrides = {};
    if (!settings.charMgrFieldOverrides[charId]) settings.charMgrFieldOverrides[charId] = {};
    if (value === undefined) delete settings.charMgrFieldOverrides[charId][field];
    else settings.charMgrFieldOverrides[charId][field] = value;
}

export function getEffectiveCharFieldForChar(settings, charId, field) {
    const ov = getCharFieldOverride(settings, charId, field);
    return ov !== undefined ? ov : getEffectiveCharField(settings, field);
}

export function getActiveCharacterEntities() {
    const ctx = SillyTavern.getContext();
    const entities = [];
    const seen = new Set();
    const pushChar = char => {
        if (char && !seen.has(char.avatar)) {
            seen.add(char.avatar);
            entities.push({ id: char.avatar, name: char.name, avatar: char.avatar, char, isPersona: false });
        }
    };

    if (ctx.groupId) {
        const group = (ctx.groups || []).find(g => g.id === ctx.groupId);
        (group?.members || []).forEach(m => {
            const avatarId = typeof m === 'string' ? m : (m?.avatar || m?.id);
            pushChar((ctx.characters || []).find(c => c.avatar === avatarId));
        });
    } else {
        pushChar(ctx.characters?.[ctx.characterId]);
    }
    return entities;
}

function buildSingleCharacterBlock(settings, entity) {
    const ctx = SillyTavern.getContext();
    const { char, id: charId } = entity;
    const d = char.data || {};
    const parts = [];
    const eff = field => getEffectiveCharFieldForChar(settings, charId, field);

    const charTags = getTagsForCharacter(char);
    if (eff('tags') && charTags.length) parts.push(`<tags>\n${charTags.join(', ')}\n</tags>`);

    const sysPrompt = d.system_prompt || char.system_prompt;
    if (eff('system_prompt') && sysPrompt) parts.push(`<character_system_prompt_override>\n${sysPrompt}\n</character_system_prompt_override>`);

    const postHist = d.post_history_instructions || char.post_history_instructions;
    if (eff('post_history_instructions') && postHist) parts.push(`<post_history_instructions>\n${postHist}\n</post_history_instructions>`);

    const simple = {
        description: d.description || char.description,
        personality: d.personality || char.personality,
        scenario: d.scenario || char.scenario,
        first_mes: d.first_mes || char.first_mes,
        mes_example: d.mes_example || char.mes_example,
    };

    const isMainChar = char.avatar === ctx.characters?.[ctx.characterId]?.avatar;
    if (isMainChar && getSettings().useAspectEvolutia) {
        const aeFields = _getAspectEvolutiaCharFields();
        if (aeFields && aeFields.length) {
            delete simple.description;
            aeFields.forEach(f => parts.push(`<evolutia_char_field name="${escHtml(f.name)}">\n${f.content}\n</evolutia_char_field>`));
        }
    }

    for (const [key, val] of Object.entries(simple)) {
        if (eff(key) && val) parts.push(`<${key}>\n${val}\n</${key}>`);
    }

    if (eff('alternate_greetings') && Array.isArray(d.alternate_greetings) && d.alternate_greetings.length) {
        const agMap = settings.altGreetingIndices || {};
        const indices = Array.isArray(agMap[charId]) ? agMap[charId] : d.alternate_greetings.map((_, i) => i);
        const filtered = indices.filter(i => i >= 0 && i < d.alternate_greetings.length);
        if (filtered.length) {
            const gs = filtered.map(i => `  <greeting id="${i+1}">\n${d.alternate_greetings[i]}\n  </greeting>`).join('\n');
            parts.push(`<alternate_greetings>\n${gs}\n</alternate_greetings>`);
        }
    }

    if (eff('authors_note')) {
        const an = getAuthorsNote();
        if (an) parts.push(`<authors_note>\n${an}\n</authors_note>`);
    }

    if (!parts.length) return '';
    return `<character name="${escHtml(char.name)}">\n${parts.join('\n\n')}\n</character>`;
}

export function buildCharacterContextBlock(settings) {
    const entities = getActiveCharacterEntities();
    if (!entities.length) return '';
    const excluded = new Set(settings.charMgrExcluded || []);
    const blocks = entities
        .filter(ent => !excluded.has(ent.id))
        .map(ent => buildSingleCharacterBlock(settings, ent))
        .filter(Boolean);
    if (!blocks.length) return '';
    return `<characters>\n${blocks.join('\n\n')}\n</characters>`;
}
