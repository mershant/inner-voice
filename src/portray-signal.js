import { _ensureWrapped } from './utils/util-text.js';

export const PORTRAY_SIGNAL_PROMPT = `After the thought, if and only if the completed exchange — the latest Inner Voice line together with this thought — has become one settled course that should be acted in the scene now, append this hidden marker and end the reply:

<scene-now />

That course can be one the Inner Voice directed, or one you committed to in your own thinking, including self-direction. The meaning of the completed exchange decides, regardless of wording.

The thought is ordinary inner speech and is always written. The marker is not part of the thought. Refusal, putting the action off, and an impulse that is still being talked through stay in thought: the reply ends with the thought alone.`;

export function splitPortraySignal(text) {
    if (typeof text !== 'string') return { visible: '', triggered: false };
    return {
        visible: text.replace(/<\s*scene-now\s*\/\s*>/gi, '').trim(),
        triggered: /<\s*scene-now\s*\/\s*>/i.test(text),
    };
}

export function buildPortraySignalBlock(settings) {
    if (!settings?.portrayAutoTrigger) return '';
    return '\n\n' + _ensureWrapped(PORTRAY_SIGNAL_PROMPT, 'scene_now');
}
