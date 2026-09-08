export const USER_VOICE = '{{user}}';

export function resolveVoiceName(ownerVoice = USER_VOICE) {
    if (!ownerVoice || ownerVoice === USER_VOICE) {
        try {
            return SillyTavern.getContext().name1 || 'User';
        } catch (_) {
            return 'User';
        }
    }
    return ownerVoice;
}

export function resolveVoiceMacroForInnerChat(text, ownerVoice = USER_VOICE) {
    if (!text) return text;
    return String(text).replace(/\{\{voice\}\}/gi, resolveVoiceName(ownerVoice));
}

// Templates keep {{voice}} for the thinking mind. In the {{user}} session that
// fills back to {{user}} so assembled prompt text is unchanged; other owners
// fill to the character name.
export function prepareVoiceMacroForHostPrompt(text, ownerVoice = USER_VOICE) {
    if (!text) return text;
    const filled = !ownerVoice || ownerVoice === USER_VOICE
        ? USER_VOICE
        : resolveVoiceName(ownerVoice);
    return String(text).replace(/\{\{voice\}\}/gi, filled);
}
