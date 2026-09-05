import { getCharInfo, getAuthorsNote } from '../utils/util-st.js';
import { escHtml } from '../utils/util-dom.js';

function cardFieldXml(info) {
    if (!info) return '';
    const parts = [];
    for (const key of ['description', 'personality', 'scenario', 'mes_example', 'character_note', 'creator_notes']) {
        const val = String(info[key] || '').trim();
        if (val) parts.push(`<${key}>\n${val}\n</${key}>`);
    }
    return parts.join('\n');
}

function authorsNoteXml() {
    const note = String(getAuthorsNote() || '').trim();
    if (!note) return '';
    return `<authors_note>\n${note}\n</authors_note>`;
}

const ESTABLISHED_FRAME = 'Established knowledge about the people in the scene. These are not events from the current scene.';

function getGroupMemberCharacters() {
    const ctx = SillyTavern.getContext();
    const seen = new Set();
    const list = [];
    const push = char => {
        if (!char) return;
        const id = char.avatar || char.name;
        if (seen.has(id)) return;
        seen.add(id);
        list.push(char);
    };

    const group = (ctx.groups || []).find(g => g.id === ctx.groupId);
    for (const member of group?.members || []) {
        const avatarId = typeof member === 'string' ? member : (member?.avatar || member?.id);
        push((ctx.characters || []).find(c => c.avatar === avatarId));
    }
    return list;
}

function joinParts(parts) {
    return parts.filter(Boolean).join('\n');
}

function buildSingleCharacterBlock(char) {
    const info = getCharInfo(char);
    const body = joinParts([cardFieldXml(info), authorsNoteXml()]);
    if (!body) return '';
    const name = escHtml(info?.name || char.name || 'Unknown');
    return `<character name="${name}">\n${body}\n</character>`;
}

export function buildCharacterInformationBlock(settings) {
    const ctx = SillyTavern.getContext();
    const includeCard = !settings || settings.includeCharacterCard !== false;

    if (ctx.groupId) {
        if (!includeCard) return '';
        const blocks = getGroupMemberCharacters().map(buildSingleCharacterBlock).filter(Boolean);
        if (!blocks.length) return '';
        return `\n\n<characters>\n${ESTABLISHED_FRAME}\n${blocks.join('\n\n')}\n</characters>`;
    }

    const charInfo = getCharInfo();
    const name = charInfo ? charInfo.name : (ctx.name2 || 'Character');
    const fields = includeCard ? joinParts([cardFieldXml(charInfo), authorsNoteXml()]) : '';
    let inner = includeCard ? `${ESTABLISHED_FRAME}\nName: ${name}` : `Name: ${name}`;
    if (fields) inner += `\n${fields}`;
    return `\n\n<character_information>\n${inner}\n</character_information>`;
}
