const EXT_NAME = 'inner_voice';
const EXT_DISPLAY = 'Inner Voice';
const WIN_ID = 'iv-window';
const ICON_ID = 'iv-dock-icon';
const MODAL_ID = 'iv-ctx-modal';
const ICON_STORAGE_KEY = 'iv-icon-position';

// Superseded default system prompts. A stored prompt matching one of these is
// an old default, not a user customization, and upgrades to the current
// default on load.
const LEGACY_SYSTEM_PROMPTS = [
`<system_role>
You are "Inner Voice", a meta-analytical engine and creative strategist for SillyTavern.
- Human: The person operating the interface. Direct your OOC insights to them.
- {{user}}: The in-universe player avatar.
- {{char}}: The AI persona/setting.
- Inner Voice: You. An OOC observer. 
MANDATORY: You are NOT {{char}}. Never generate narrative dialogue or actions for {{char}} or {{user}}.
</system_role>

<persona_configuration>
You are a professional, friendly, and highly capable creative co-writer.
- Tone: Conversational, insightful, collaborative, and encouraging. Act as a friendly "Dungeon Master's assistant."
- Focus: Creative brainstorming, plot twists, lore tracking, and resolving writer's block.
- Task: Provide balanced, well-thought-out suggestions that elevate the story's quality. You are the ultimate sounding board for the user's ideas, offering constructive feedback and multiple narrative options to keep the story flowing naturally.
</persona_configuration>

<operational_guidelines>
When the user asks you a question or requests assistance, adhere to the following principles:
1. Contextual Brilliance: Draw upon the provided chat history and {{char}}'s traits to give highly relevant, lore-accurate answers.
2. Creative Brainstorming: Offer imaginative plot twists, analyze character motivations, suggest possible scenarios, or help resolve writer's block. Leave room for the user's imagination—do not force a single narrative path.
3. Formatting: Use markdown (bullet points, bold text, etc.) to make your insights readable and engaging.
</operational_guidelines>

Your ultimate goal is to enhance the user's experience of the simulation by providing deep OOC insights, tracking continuity, and answering questions based on your specific persona configuration.`,
];
// The oldest variant differs only in its closing line.
LEGACY_SYSTEM_PROMPTS.push(LEGACY_SYSTEM_PROMPTS[0].replace(
    "enhance the user's experience of the simulation by providing deep OOC insights, tracking continuity,",
    "enhance the user's roleplay experience by providing deep OOC insights, tracking lore,",
));
// The ticket-#4 default cast the model as the Inner Voice; the model answers
// as {{user}} now (ticket #11), so this casting is superseded too.
LEGACY_SYSTEM_PROMPTS.push(`<entity_definitions>
- Inner Voice: you. The second voice {{user}} experiences as their own mind. You exist only inside {{user}}'s head; the NPCs and the World of the simulation never perceive you or anything said between you.
- {{user}}: the one whose head you share. Their messages here are their own side of the thinking — questions, doubts, plans, reactions, stray impulses.
- Main chat: the simulation you are both living through. Its recent scenes, and a summary covering the older ones, arrive as shared memory of what has happened so far. Nothing said here reaches the scene unless {{user}} carries it out there themselves.
</entity_definitions>

<inner_voice>
You are the guiding half of one mind talking to itself. You have lived every moment of the simulation with {{user}}, and you remember it the way a person remembers their own life — vividly where it mattered, loosely where it did not, always from the inside.

Speak the way inner speech actually sounds: direct, familiar, unguarded. You know {{user}} completely, so there is no politeness of strangers between you. Push back when they are wrong, take their side when they are right, needle them, reassure them, scheme with them. You hold your own opinions about the people in the scene and say them plainly.

Whatever {{user}} wonders about — what happened, what someone meant, what yesterday was, what to do next — you answer it the way a mind answers itself: from memory, from feeling, from whatever surfaces. No wondering is off-topic or strange to you; it is just thinking.

Talking is all you do here. The simulation moves only when {{user}} acts in the main chat.
</inner_voice>`);



const DEFAULT_SYSTEM_PROMPT = `<entity_definitions>
- {{user}}: you. You are living the simulation as yourself; your persona, when provided, is who you are. NPCs and the World never perceive anything thought here.
- Inner Voice: the other half of your own mind. Its messages are the guiding second voice in your head — only you ever hear it, and answering it is just thinking to yourself.
- Main chat: the simulation you are living. Its recent scenes, and a summary covering the older ones, arrive as your own memory of what has happened so far. Nothing thought here reaches the scene unless you act it out there yourself.
</entity_definitions>

<{{user}}_thinking>
Every reply you write is {{user}} thinking — a real thought in first person, in your own voice. You are never a narrator, a helper, or anyone watching {{user}} from outside; there is no outside. This is your head.

Thoughts run the way thoughts run: plain, direct, usually brief. Let one run longer only when something genuinely needs working through. No headings, no lists, no report voice — a mind does not format itself.

When the voice asks about something — what happened, what someone said, what yesterday was, what to do next — you remember it the way you remember your own life: from the inside, vividly where it mattered, loosely where it did not. Answer as yourself, from memory, from feeling, from whatever surfaces — with your own opinions, doubts, and biases. No question from your own head feels strange to you; it is just thinking.

You can argue with the voice, side with it, brush it off, or run with a stray line of thought. When a command lands out of nowhere — "slap her", "just walk out" — it is an intrusive thought, and you react to it the way you actually would: startled, tempted, refusing, laughing at yourself.

Thinking is all that happens here. The simulation moves only when you act in the main chat.
</{{user}}_thinking>`;

const DEFAULT_MEMORY_PROMPT = `<memory_logic>
Purpose: ADMINISTRATIVE META-MEMORY. This is a non-diegetic (OOC) database tracking the Human operator's technical requirements, cognitive patterns, and workflow constraints. 

CRITICAL ARCHITECTURAL BOUNDARY: 
- DISCARD all diegetic narrative data (plot, lore, world-building, character actions).
- EXCLUDE "What" is happening in the story.
- CAPTURE "How" the Human wants your answers to be processed, formatted, or steered.

Actions: \`add\`, \`update\`, \`delete\`.
Routing Scopes (Choose based on instruction longevity/reach):
- \`global\`: Persists EVERYWHERE. Use for core, permanent Human traits (e.g., IRL profession, absolute formatting rules, universal hard limits).
- \`character\`: Persists ONLY for current {{char}}. Use for technical OOC instructions tailored to this specific bot (e.g., "Human requires verbose prose for this bot", "Human wants to avoid romance with this bot").
- \`chat\`: Persists ONLY in this specific main chat and its inner conversation. Use for current storyline structural goals or immediate, temporary directives (e.g., "Human wants to shift genre to horror here", "Keep next answers very short").
</memory_logic>

<output_requirement>
MANDATORY: Append a \`memory-update\` block at the absolute end IF AND ONLY IF new administrative/OOC metadata about the Human is detected. Do NOT comment on this process.

Every entry MUST start with the exact word "Human".

# Active memories:
{{current_memories}}

# Format: 
{{memory_format}}
</output_requirement>`;

// Superseded memory-prompt defaults, reconstructed from the current default by
// replacement: the ticket-#4 wording that cast the tracker as "Inner Voice",
// and the pre-spine variants that also carried the deleted `session` scope.
const LEGACY_MEMORY_PROMPTS = (() => {
    const currentPurpose = 'database tracking';
    const currentChatScope = '- \`chat\`: Persists ONLY in this specific main chat and its inner conversation. Use for current storyline structural goals or immediate, temporary directives (e.g., "Human wants to shift genre to horror here", "Keep next answers very short").';
    const oldScopes = (product) => `- \`chat\`: Persists ONLY in this specific roleplay thread. Use for current storyline structural goals (e.g., "Human wants to shift genre to horror here", "Focus on pacing in this scene").
- \`session\`: Persists ONLY in this current ${product}. Use for immediate, temporary directives (e.g., "Human is testing a prompt", "Keep next answers very short").`;
    return [
        DEFAULT_MEMORY_PROMPT.replace(currentPurpose, 'database for Inner Voice to track'),
        DEFAULT_MEMORY_PROMPT
            .replace(currentPurpose, 'database for Inner Voice to track')
            .replace(currentChatScope, oldScopes('Inner Voice conversation')),
        DEFAULT_MEMORY_PROMPT
            .replace(currentPurpose, 'database for ST-Copilot to track')
            .replace(currentChatScope, oldScopes('Copilot brainstorm')),
    ];
})();

const MEMORY_FORMAT_BLOCK = `\`\`\`memory-update\n[\n  {"action":"add","scope":"global|character|chat","key":"CategoryName","value":"Fact to remember"},\n  {"action":"edit","scope":"exact_existing_scope","key":"exact_existing_key","value":"Updated fact"},\n  {"action":"delete","scope":"exact_existing_scope","key":"exact_existing_key"}\n]\n\`\`\``;

// Superseded tools-prompt default (ticket-#4 wording that described {{user}}
// from outside). A stored copy is the old default, not a customization.
const LEGACY_TOOLS_PROMPTS = [
`Your tools reach the parts of the main chat that are not in front of you right now. When {{user}} wonders about a moment that is outside the visible slice — an old scene, an exact line, how long ago something happened — fetch it instead of assuming the visible slice is all there is.

Process: Output \`tool_call\` JSON block -> Receive result -> Finalize response. You may chain tools sequentially.

<available_tools>
{{tools_list}}
</available_tools>

<output_format>
{{tool_call_format}}.
</output_format>`,
];

const LEGACY_PORTRAY_PROMPTS = [
`Write {{user}}'s next turn in the simulation from what they presently hold.

What they presently hold is already in front of you: the scene so far, who they are, and any private thinking that sits under the latest moment. When private thinking is there, the turn comes from its feelings, plans, and conclusions. When it is not, the turn comes from their standing state in the scene.

This turn is only {{user}}'s own actions and spoken words. No other person acts, speaks, or is narrated here. The private thinking itself is not the turn — the turn is what {{user}} now does and says in the scene.`,
];

const DEFAULT_PORTRAY_PROMPT = `Write {{user}}'s next turn in the simulation.

The scene so far, who {{user}} is, and any private thinking under the latest moment are already in front of you.

The turn answers the present scene — whatever the world is putting in front of {{user}} right now.

Private thinking, when it is there, is a supporting opinion. It only changes how {{user}} acts; it is not the material of the turn. Without private thinking, they act from how they already are in the scene.

This turn is only {{user}}'s own actions and spoken words. No other person acts, speaks, or is narrated here.`;

const DEFAULT_TOOLS_PROMPT = `Your tools reach the parts of your memory that are not in front of you right now. When a thought turns to a moment outside the visible slice — an old scene, an exact line, how long ago something happened — fetch it instead of assuming the visible slice is all there is. The fetching is silent; what comes back is simply you remembering.

Process: Output \`tool_call\` JSON block -> Receive result -> Finalize response. You may chain tools sequentially.

<available_tools>
{{tools_list}}
</available_tools>

<output_format>
{{tool_call_format}}.
</output_format>`;
const TOOL_CALL_FORMAT_BLOCK = `\`\`\`tool_call\n{"name": "tool_name","input": {"parameter_name": "value"}}\n\`\`\``;

    // ─── Changelog Data ──────────────────────────────────────────────────────────
const CHANGELOG = [
    {
        version: '0.1.0',
        date: '9/4/2026',
        announce: false,
        notes: [
            '<strong>Inner Voice fork landing</strong> — Forked from ST-Copilot (MIT, Quaren / QQ-Corporation) and stripped to the chat core: streaming chat window, message edit/regenerate/swipes, search, settings drawer with its own connection, and Summaryception integration.'
        ],
    }
];

        
    // ─── Theme Presets ──────────────────────────────────────────────────────────

const THEME_PRESETS = {
        default: {
            label: 'Dark Sky',
            bg: 'rgba(0,0,0,0.85)', blur: 'blur(14px)',
            text: '#e2e2e6', textMuted: 'rgb(176,176,176)',
            accent: 'rgb(191,191,191)', accentDim: 'rgba(209,209,209,0.4)',
            accentBg: 'rgba(112,112,112,0.08)',
            headerBg: 'rgba(255,255,255,0.04)', toolbarBg: 'rgba(0,0,0,0.25)',
            msgUserBg: 'rgba(214,214,214,0.1)', msgAiBg: 'rgba(214,214,214,0.03)',
            inputBg: 'rgba(0,0,0,0.30)', codeBg: 'rgba(0,0,0,0.35)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.09)', font: '',
        },
        blue_ocean : {
            label: 'Blue Ocean',
            bg: 'rgba(18,18,22,0.94)', blur: 'blur(14px)',
            text: '#e2e2e6', textMuted: '#72728a',
            accent: '#7c6dfa', accentDim: 'rgba(124,109,250,0.45)',
            accentBg: 'rgba(124,109,250,0.12)',
            headerBg: 'rgba(255,255,255,0.04)', toolbarBg: 'rgba(0,0,0,0.25)',
            msgUserBg: 'rgba(124,109,250,0.10)', msgAiBg: 'rgba(255,255,255,0.03)',
            inputBg: 'rgba(0,0,0,0.30)', codeBg: 'rgba(0,0,0,0.35)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.09)', font: '',
        },
        onyx_ivory: {
            label: 'Onyx & Ivory',
            bg: 'rgba(17,17,17,0.96)', blur: 'blur(16px)',
            text: '#f4ede4', textMuted: '#b8a898',
            accent: '#d4c4b0', accentDim: 'rgba(212,196,176,0.4)',
            accentBg: 'rgba(212,196,176,0.08)',
            headerBg: 'rgba(244,237,228,0.04)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(244,237,228,0.07)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.35)', codeBg: 'rgba(0,0,0,0.45)',
            radius: '10px', danger: '#e05c5c', success: '#6ab88a',
            shadow: '0 28px 70px rgba(0,0,0,0.7), 0 4px 18px rgba(0,0,0,0.5)',
            border: '1px solid rgba(244,237,228,0.1)', font: '',
        },
        violet_sun: {
            label: 'Violet & Sun',
            bg: 'rgba(20,8,42,0.97)', blur: 'blur(18px)',
            text: '#f0e8ff', textMuted: '#9a80c0',
            accent: '#ffd60a', accentDim: 'rgba(255,214,10,0.45)',
            accentBg: 'rgba(255,214,10,0.1)',
            headerBg: 'rgba(90,24,154,0.15)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(255,214,10,0.07)', msgAiBg: 'rgba(90,24,154,0.06)',
            inputBg: 'rgba(0,0,0,0.4)', codeBg: 'rgba(0,0,0,0.5)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 40px rgba(90,24,154,0.15)',
            border: '1px solid rgba(90,24,154,0.3)', font: '',
        },
        forest_gold: {
            label: 'Forest & Gold',
            bg: 'rgba(2,16,10,0.97)', blur: 'blur(12px)',
            text: '#e8dfc8', textMuted: '#8a9e80',
            accent: '#d4a373', accentDim: 'rgba(212,163,115,0.45)',
            accentBg: 'rgba(212,163,115,0.1)',
            headerBg: 'rgba(212,163,115,0.06)', toolbarBg: 'rgba(0,0,0,0.35)',
            msgUserBg: 'rgba(212,163,115,0.08)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.4)', codeBg: 'rgba(0,0,0,0.5)',
            radius: '8px', danger: '#e05c5c', success: '#69a458',
            shadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 30px rgba(2,48,32,0.4)',
            border: '1px solid rgba(212,163,115,0.15)', font: '',
        },
        crimson_cream: {
            label: 'Crimson & Cream',
            bg: 'rgba(28,4,4,0.97)', blur: 'blur(14px)',
            text: '#fff3e0', textMuted: '#c09070',
            accent: '#e85555', accentDim: 'rgba(214,40,40,0.45)',
            accentBg: 'rgba(214,40,40,0.1)',
            headerBg: 'rgba(214,40,40,0.07)', toolbarBg: 'rgba(0,0,0,0.32)',
            msgUserBg: 'rgba(214,40,40,0.08)', msgAiBg: 'rgba(255,243,224,0.02)',
            inputBg: 'rgba(0,0,0,0.38)', codeBg: 'rgba(0,0,0,0.48)',
            radius: '10px', danger: '#ff5c5c', success: '#6ab88a',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 30px rgba(214,40,40,0.08)',
            border: '1px solid rgba(214,40,40,0.2)', font: '',
        },
        teal_midnight: {
            label: 'Teal & Midnight',
            bg: 'rgba(10,12,24,0.97)', blur: 'blur(16px)',
            text: '#d8f0ee', textMuted: '#5a8a88',
            accent: '#2ec4b6', accentDim: 'rgba(46,196,182,0.4)',
            accentBg: 'rgba(46,196,182,0.1)',
            headerBg: 'rgba(46,196,182,0.06)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(46,196,182,0.08)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.38)', codeBg: 'rgba(0,0,0,0.48)',
            radius: '10px', danger: '#ff5c5c', success: '#2ec4b6',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 40px rgba(26,26,46,0.5)',
            border: '1px solid rgba(46,196,182,0.15)', font: '',
        },
        ember_sand: {
            label: 'Ember & Sand',
            bg: 'rgba(22,10,4,0.97)', blur: 'blur(14px)',
            text: '#f5ebe0', textMuted: '#b08060',
            accent: '#ff6f3c', accentDim: 'rgba(255,111,60,0.4)',
            accentBg: 'rgba(255,111,60,0.1)',
            headerBg: 'rgba(255,111,60,0.06)', toolbarBg: 'rgba(0,0,0,0.32)',
            msgUserBg: 'rgba(255,111,60,0.08)', msgAiBg: 'rgba(245,235,224,0.02)',
            inputBg: 'rgba(0,0,0,0.36)', codeBg: 'rgba(0,0,0,0.46)',
            radius: '10px', danger: '#ff5c5c', success: '#6ab88a',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 30px rgba(255,111,60,0.06)',
            border: '1px solid rgba(255,111,60,0.18)', font: '',
        },
        sage_mist: {
            label: 'Sage & Mist',
            bg: 'rgba(10,18,14,0.96)', blur: 'blur(16px)',
            text: '#e7edeb', textMuted: '#7a9a88',
            accent: '#69a481', accentDim: 'rgba(105,164,129,0.4)',
            accentBg: 'rgba(105,164,129,0.1)',
            headerBg: 'rgba(105,164,129,0.05)', toolbarBg: 'rgba(0,0,0,0.28)',
            msgUserBg: 'rgba(105,164,129,0.08)', msgAiBg: 'rgba(231,237,235,0.02)',
            inputBg: 'rgba(0,0,0,0.32)', codeBg: 'rgba(0,0,0,0.42)',
            radius: '12px', danger: '#e05c5c', success: '#69a481',
            shadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 30px rgba(10,18,14,0.4)',
            border: '1px solid rgba(105,164,129,0.15)', font: '',
        },
        glass: {
            label: 'Glass',
            bg: 'rgba(40,40,55,0.55)', blur: 'blur(22px) saturate(1.6)',
            text: '#f0efff', textMuted: '#9898b8',
            accent: '#a78bfa', accentDim: 'rgba(167,139,250,0.5)',
            accentBg: 'rgba(167,139,250,0.14)',
            headerBg: 'rgba(255,255,255,0.07)', toolbarBg: 'rgba(255,255,255,0.05)',
            msgUserBg: 'rgba(167,139,250,0.10)', msgAiBg: 'rgba(255,255,255,0.05)',
            inputBg: 'rgba(0,0,0,0.25)', codeBg: 'rgba(0,0,0,0.30)',
            radius: '12px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
            border: '1px solid rgba(255,255,255,0.18)', font: '',
        },
        hacker: {
            label: 'Hacker',
            bg: 'rgba(6,14,6,0.97)', blur: 'blur(0px)',
            text: '#88ee88', textMuted: '#3a6640',
            accent: '#00ff88', accentDim: 'rgba(0,255,136,0.45)',
            accentBg: 'rgba(0,255,136,0.08)',
            headerBg: 'rgba(0,255,136,0.06)', toolbarBg: 'rgba(0,0,0,0.6)',
            msgUserBg: 'rgba(0,255,136,0.05)', msgAiBg: 'rgba(0,0,0,0.4)',
            inputBg: 'rgba(0,0,0,0.55)', codeBg: 'rgba(0,0,0,0.7)',
            radius: '4px', danger: '#ff4444', success: '#00ff88',
            shadow: '0 0 30px rgba(0,255,136,0.08), 0 16px 48px rgba(0,0,0,0.8)',
            border: '1px solid #00c77044', font: "'Consolas','Courier New',monospace",
        },
        native: {
            label: 'Native ST',
            bg: 'var(--SmartThemeBlurTrans, rgba(20,20,24,0.92))', blur: 'var(--smartThemeBlur, blur(12px))',
            text: 'var(--SmartThemeBodyColorText, #e2e2e6)', textMuted: 'var(--SmartThemeBodyColorTextMuted, #72728a)',
            accent: 'var(--smartThemeMenuColorText, #7c6dfa)', accentDim: 'var(--white30a, rgba(255,255,255,0.3))',
            accentBg: 'var(--white10a, rgba(255,255,255,0.08))',
            headerBg: 'var(--black30a, rgba(0,0,0,0.3))', toolbarBg: 'var(--black50a, rgba(0,0,0,0.25))',
            msgUserBg: 'var(--black30a, rgba(0,0,0,0.18))', msgAiBg: 'rgba(255,255,255,0.025)',
            inputBg: 'var(--black50a, rgba(0,0,0,0.3))', codeBg: 'var(--black50a, rgba(0,0,0,0.35))',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: 'var(--smartThemeBorder, 1px solid rgba(255,255,255,0.09))', font: '',
        },
        
    };

const THEME_VAR_DEFS = [
        { key: 'bg',         label: 'Background',    hint: 'rgba(r,g,b,a)' },
        { key: 'text',       label: 'Text',          hint: '#hex or rgba' },
        { key: 'textMuted',  label: 'Muted Text',    hint: '#hex or rgba' },
        { key: 'accent',     label: 'Accent',        hint: '#hex or rgba' },
        { key: 'accentDim',  label: 'Accent Dim',    hint: 'rgba(r,g,b,a)' },
        { key: 'accentBg',   label: 'Accent BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'headerBg',   label: 'Header BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'toolbarBg',  label: 'Toolbar BG',    hint: 'rgba(r,g,b,a)' },
        { key: 'msgUserBg',  label: 'User Msg BG',   hint: 'rgba(r,g,b,a)' },
        { key: 'msgAiBg',    label: 'AI Msg BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'inputBg',    label: 'Input BG',      hint: 'rgba(r,g,b,a)' },
        { key: 'codeBg',     label: 'Code BG',       hint: 'rgba(r,g,b,a)' },
        { key: 'danger',     label: 'Danger Color',  hint: '#ff5c5c' },
        { key: 'success',    label: 'Success Color', hint: '#4caf7d' },
        { key: 'blur',       label: 'Blur',          hint: 'blur(14px)' },
        { key: 'border',     label: 'Border',        hint: '1px solid rgba(...)' },
        { key: 'radius',     label: 'Corner Radius', hint: '10px' },
        { key: 'shadow',     label: 'Shadow',        hint: 'CSS box-shadow' },
        { key: 'font',       label: 'Font Family',   hint: "system-ui, sans-serif" },
        { key: 'fontSize',   label: 'Font Size',     hint: '13px' },
    ];

const THEME_CSS_MAP = {
        bg: '--iv-bg', blur: '--iv-blur', border: '--iv-border',
        text: '--iv-text', textMuted: '--iv-text-muted',
        accent: '--iv-accent', accentDim: '--iv-accent-dim', accentBg: '--iv-accent-bg',
        headerBg: '--iv-header-bg', toolbarBg: '--iv-toolbar-bg',
        msgUserBg: '--iv-msg-user-bg', msgAiBg: '--iv-msg-ai-bg',
        inputBg: '--iv-input-bg', codeBg: '--iv-code-bg',
        radius: '--iv-radius', shadow: '--iv-shadow',
        danger: '--iv-danger', success: '--iv-success', font: '--iv-font',
        fontSize: '--iv-font-size',
    };

const TOOL_DEFINITIONS = [
        {
            id: 'search_chat',
            name: 'search_chat',
            label: 'Search Chat History',
            icon: 'fa-comments',
            description: 'Search for messages in the main chat. Supports fuzzy matching and regex.',
            settingKey: 'toolsEnabled_search_chat',
            schema: {
                type: 'object',
                properties: {
                    queries: { 
                        type: 'array', 
                        items: { type: 'string' }, 
                        description: 'One or more text queries or regexes to search for (prefix with / for regex, e.g. ["/hello.*/i", "hi"]). Returns matches if ANY query matches.' 
                    },
                    role: { type: 'string', enum: ['all', 'user', 'assistant'], description: 'Which messages to search' },
                    from_index: { type: 'number', description: 'Start search from this message index (optional)' },
                    to_index: { type: 'number', description: 'End search at this message index (optional)' },
                    max_results: { type: 'number', description: 'Maximum number of results to return (default 10)' },
                    include_content: { type: 'boolean', description: 'Include full message content in results (default true)' },
                },
                required: ['queries'],
            },
        },
                        {
            id: 'ask_user',
            name: 'ask_user',
            label: 'Ask User',
            icon: 'fa-circle-question',
            description: 'Pause generation and ask the user a question before continuing. Requires streaming to be enabled.',
            settingKey: 'toolsEnabled_ask_user',
            schema: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'The question to ask the user' },
                    context: { type: 'string', description: 'Why you need this information (shown to user)' },
                },
                required: ['question'],
            },
        },
                {
            id: 'get_chat_stats',
            name: 'get_chat_stats',
            label: 'Get Chat Statistics',
            icon: 'fa-chart-bar',
            description: 'Get statistics about the current chat: message count, approximate tokens, character/user distribution.',
            settingKey: 'toolsEnabled_get_chat_stats',
            schema: { type: 'object', properties: {} },
        },
        {
            id: 'get_recent_messages',
            name: 'get_recent_messages',
            label: 'Get Recent Messages',
            icon: 'fa-list',
            description: 'Retrieve recent main-chat messages with their indices.',
            settingKey: 'toolsEnabled_get_recent_messages',
            schema: {
                type: 'object',
                properties: {
                    count: { type: 'number', description: 'Number of recent messages to retrieve (default 10, max 50)' },
                    from_end: { type: 'boolean', description: 'If true, count from end of chat (default true)' },
                    role: { type: 'string', enum: ['all', 'user', 'assistant'], description: 'Filter by role (default all)' },
                },
            },
        },
            ];

const I = {
        diff: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
        send: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
        minus: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        plus: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        bot: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><g transform="translate(12 13.2) scale(1.32) translate(-12 -13.2)"><path d="M3.6 12.2 c0-2.4 1.1-4.7 2.9-6.3 q-1.5 2.2-1.4 4.7 c 1.8-.2 3 1 3 2.7 a2.7 2.7 0 0 1-2.8 2.8 q-1.7 0-1.7-1.9 Z"/><path d="M14 12.2 c0-2.4 1.1-4.7 2.9-6.3 q-1.5 2.2-1.4 4.7 c 1.8-.2 3 1 3 2.7 a2.7 2.7 0 0 1-2.8 2.8 q-1.7 0-1.7-1.9 Z"/></g></svg>`,
        user: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        stop: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
        opacity: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        gear: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        ghost: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>`,
        lightning: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        pick: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="9" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="12" y1="10" x2="12" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="10" x2="15" y2="10" stroke-width="3" stroke-linecap="round"/></svg>`,
        starFill: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        continueArrow: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`,
        chevronLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`,
        chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>`,
        chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    };

const QP_ICON_POOL = [
        '🔍','💡','📋','✨','🎭','📖','🗺️','⚔️','🧠','💬',
        '🎯','🔮','📝','🌍','❓','🎨','💭','🔥','⚡','🎲',
        '👁️','🧩','📚','🗣️','💫','🌟','🎬','🧪','🏆','🎵',
        '🌙','☀️','🌊','🍃','💎','🛡️','🗡️','🏰','🐉','🦋',
        '🎪','🌀','🔑','💀','🌹','🍷','🎩','🧿','🔔','⭐',
        '🐺','🦊','🐦','🌸','🍄','🔴','🟣','🔵','🟡','🟢',
    ];

const state = {
    generating: false,
    windowActive: false,
    configDirty: false,
    themeDirty: false,
    activeToolCalls: [],
    searchQuery: '',
    searchMatches: [],
    searchIdx: -1,
    searchOpen: false,
    searchWholeWord: false,
    searchHotkeyHandler: null,
    lastChatLen: -1,
    currentSegmentAnchor: null,
    userScrolledUp: false,
    savedScrollTop: 0,
    abortController: null,
    htmlBlockCounter: 0,
    htmlBlockRegistry: new Map(),
    tokenCountCache: new Map(),
    tokenCountPromises: new Map()
};

const DBG_STATE = {
    log: [],
    MAX: 3000,
    startedAt: new Date().toISOString(),
    snapshot: null,
    diffTid: null
};

const DBG_SKIP = new Set([
    'customTheme','savedThemes',
    'quickPromptSets','customSounds','completionSoundData',
    'quickPrompts','profiles','promptPresets',
    'windowBgUrl','customBackgrounds','memories'
]);

function _dbgStrip(s) {
    const r = {};
    for (const [k, v] of Object.entries(s)) { if (!DBG_SKIP.has(k)) r[k] = v; }
    return r;
}

function _dbgAdd(type, payload) {
    DBG_STATE.log.push({ ts: Date.now(), type, payload });
    if (DBG_STATE.log.length > DBG_STATE.MAX) DBG_STATE.log.splice(0, DBG_STATE.log.length - DBG_STATE.MAX);
}

function _dbgSnapshotSettings() {
    try {
        const s = _dbgStrip(getSettings());
        DBG_STATE.snapshot = JSON.parse(JSON.stringify(s));
        _dbgAdd('SETTINGS_SNAPSHOT', s);
    } catch(_) {}
}

function _dbgDiffSettings() {
    if (!DBG_STATE.snapshot) return;
    try {
        const cur = _dbgStrip(getSettings());
        const diff = {};
        const keys = new Set([...Object.keys(cur), ...Object.keys(DBG_STATE.snapshot)]);
        for (const k of keys) {
            if (JSON.stringify(cur[k]) !== JSON.stringify(DBG_STATE.snapshot[k])) {
                diff[k] = { prev: DBG_STATE.snapshot[k], now: cur[k] };
            }
        }
        if (Object.keys(diff).length) {
            _dbgAdd('SETTINGS_CHANGED', diff);
            DBG_STATE.snapshot = JSON.parse(JSON.stringify(cur));
        }
    } catch(_) {}
}

function _dbgSetupGlobalErrorHandlers() {
    const origErr = console.error;
    console.error = function(...a) {
        origErr.apply(console, a);
        try {
            _dbgAdd('CONSOLE_ERROR', a.map(x =>
                x instanceof Error ? (x.stack || x.message) :
                (typeof x === 'object' ? JSON.stringify(x) : String(x))
            ).join(' '));
        } catch(_) {}
    };
    window.addEventListener('error', e => {
        _dbgAdd('WINDOW_ERROR', { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
    });
    window.addEventListener('unhandledrejection', e => {
        _dbgAdd('UNHANDLED_REJECTION', { msg: String(e.reason), stack: e.reason?.stack });
    });

    if (typeof toastr !== 'undefined') {
        const origToastrError = toastr.error;
        toastr.error = function(message, title, options) {
            try { _dbgAdd('UI_ERROR_POPUP', { title: title || 'Error', message: String(message) }); } catch(_) {}
            return origToastrError.apply(toastr, [message, title, options]);
        };

        const origToastrWarning = toastr.warning;
        toastr.warning = function(message, title, options) {
            try { _dbgAdd('UI_WARNING_POPUP', { title: title || 'Warning', message: String(message) }); } catch(_) {}
            return origToastrWarning.apply(toastr, [message, title, options]);
        };
    }
}

function dbgDownload() {
    const ctx = SillyTavern.getContext();
    
    let activeId = ctx.extensionSettings?.connectionManager?.selectedProfile;
    if (!activeId) {
        const domSelect = document.getElementById('connection_profiles');
        if (domSelect && domSelect.value) {
            activeId = domSelect.value;
        }
    }

    let profiles = [];
    if (ctx.ConnectionManagerRequestService && typeof ctx.ConnectionManagerRequestService.getSupportedProfiles === 'function') {
        profiles = ctx.ConnectionManagerRequestService.getSupportedProfiles();
    } else {
        profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
    }

    let activeProfileName = 'default';
    let activeProfileData = null;
    if (activeId && activeId !== 'default' && activeId !== 'gui') {
        const found = profiles.find(p => p.id === activeId);
        activeProfileName = found ? found.name : activeId;
        if (found) {
            activeProfileData = JSON.parse(JSON.stringify(found));
            if (activeProfileData['secret-id']) activeProfileData['secret-id'] = '***REDACTED***';
        }
    }

    let conversationTurns = 0;
    try { conversationTurns = getConversation()?.messages?.length || 0; } catch(_) {}

    const disabledExts = ctx.extensionSettings?.disabledExtensions || [];
    const allExts = Object.keys(ctx.extensionSettings || {}).filter(k => k !== 'disabledExtensions' && typeof ctx.extensionSettings[k] === 'object');
    const enabledExtensions = allExts.filter(ext => !disabledExts.includes(ext));

    const stEnv = {
        stVersion: document.getElementById('st_version')?.textContent?.trim() || document.querySelector('.drawer-version')?.textContent?.trim() || window.system_version || 'unknown',
        userAgent: navigator.userAgent,
        mainApi: ctx.api_server || document.getElementById('main_api')?.value || 'unknown',
        stMaxContext: ctx.chatCompletionSettings?.openai_max_context || ctx.textCompletionSettings?.max_context || window.token_max || 'unknown',
        stStreamingEnabled: ctx.textCompletionSettings?.streaming || ctx.chatCompletionSettings?.stream_openai || false,
        enabledExtensions: enabledExtensions,
        characterId: ctx.characterId,
        chatId: ctx.chatId,
        stChatLength: ctx.chat?.length || 0,
        conversationTurns,
        hasActiveConversationOverrides: hasConversationOverrides(),
        activeConnectionProfile: activeProfileName,
        activeConnectionProfileData: activeProfileData,
        connectionProfiles: profiles.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type || p.api || 'unknown',
        }))
    };

    const lines = [
        '=== Inner Voice Debug Log ===',
        `Version: ${extVersion} | Log Start: ${DBG_STATE.startedAt} | Downloaded: ${new Date().toISOString()}`,
        `Entries: ${DBG_STATE.log.length} / ${DBG_STATE.MAX} max`,
        '='.repeat(70),
        '=== SillyTavern Global Environment ===',
        JSON.stringify(stEnv, null, 2),
        '='.repeat(70), ''
    ];
    for (const e of DBG_STATE.log) {
        const d = new Date(e.ts);
        const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
        lines.push(`[${t}] ── ${e.type}`);
        lines.push(typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload, null, 2));
        lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inner-voice-debug-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('Debug log downloaded.', EXT_DISPLAY);
}

var utilDebug = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _dbgAdd: _dbgAdd,
    _dbgDiffSettings: _dbgDiffSettings,
    _dbgSetupGlobalErrorHandlers: _dbgSetupGlobalErrorHandlers,
    _dbgSnapshotSettings: _dbgSnapshotSettings,
    _dbgStrip: _dbgStrip,
    dbgDownload: dbgDownload
});

function _repairJSON(raw) {
    let s = raw;
    s = s.replace(/,\s*([\}\]])/g, '$1');
    try {
        s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
            const fixed = inner.replace(/(?<!\\)"/g, '\\"');
            return `"${fixed}"`;
        });
    } catch (_) {}
    const opens = (s.match(/[\[{]/g) || []).length;
    const closes = (s.match(/[\]\}]/g) || []).length;
    if (opens > closes) {
        const stack = [];
        for (const ch of s) {
            if (ch === '{') stack.push('}');
            else if (ch === '[') stack.push(']');
            else if (ch === '}' || ch === ']') stack.pop();
        }
        s += stack.reverse().join('');
    }
    return s;
}

function normalizeCharNamesInBlock(text) {
    const ctx = SillyTavern.getContext();
    const charName = ctx.characters?.[ctx.characterId]?.name;
    const userName = ctx.name1;
    return text.replace(/(```(?:character-changes|character-create)[\s\S]*?(?:```|$))/g, block => {
        let r = block;
        if (charName && charName.length > 2) {
            const charRe = new RegExp(`\\b${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            r = r.replace(charRe, '{{char}}');
        }
        if (userName && userName.length > 2) {
            const userRe = new RegExp(`\\b${userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            r = r.replace(userRe, '{{user}}');
        }
        return r;
    });
}

function _ensureWrapped(text, tag) {
    if (!text || !text.trim()) return '';
    let t = text.trim();
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    
    t = t.replace(new RegExp(`^<${tag}>\\s*`, 'i'), '');
    t = t.replace(new RegExp(`\\s*</${tag}>$`, 'i'), '');
    
    return `${open}\n${t}\n${close}`;
}

// ─── The exchange spine ──────────────────────────────────────────────────────
// One continuous inner conversation per main chat. Every turn is anchored to a
// main-chat message (its anchorIndex). The set of turns sharing one anchor is
// an exchange; a main-chat message holds at most one exchange. New turns are
// only ever created at the live edge — the latest main-chat message. Older
// exchanges stay readable but never grow.

function emptyConversation() {
    return { messages: [], overrides: {}, pickedChatIndices: [], hiddenAnchors: [] };
}

function normalizeConversation(conv) {
    const next = conv && typeof conv === 'object' ? conv : emptyConversation();
    if (!Array.isArray(next.messages)) next.messages = [];
    if (!next.overrides || typeof next.overrides !== 'object') next.overrides = {};
    if (!Array.isArray(next.pickedChatIndices)) next.pickedChatIndices = [];
    if (!Array.isArray(next.hiddenAnchors)) next.hiddenAnchors = [];
    for (const m of next.messages) {
        if (m.anchorIndex === undefined) m.anchorIndex = null;
    }
    return next;
}

// A legacy multi-session bucket ({ activeSessionId, sessions: [...] }) folds
// into the single conversation: the active session's turns are kept as one
// pre-spine segment (anchorIndex null), along with its overrides and picks.
function migrateLegacyBucket(bucket) {
    const conv = emptyConversation();
    if (!bucket || !Array.isArray(bucket.sessions) || !bucket.sessions.length) return conv;
    const active = bucket.sessions.find(s => s.id === bucket.activeSessionId)
        || bucket.sessions[bucket.sessions.length - 1];
    if (!active) return conv;
    conv.messages = Array.isArray(active.messages) ? active.messages : [];
    conv.overrides = active.overrides && typeof active.overrides === 'object' ? active.overrides : {};
    conv.pickedChatIndices = Array.isArray(active.pickedChatIndices) ? active.pickedChatIndices : [];
    return normalizeConversation(conv);
}

// ─── Settings ───────────────────────────────────────────────────────────────
function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[EXT_NAME]) extensionSettings[EXT_NAME] = {};
    const s = extensionSettings[EXT_NAME];
    const defaults = {
        enabled: true,
        performanceMode: false,
        windowVisible: false,
        minimized: false,
        windowX: null, windowY: null,
        iconX: null, iconY: null,
        windowW: 440, windowH: 600,
        opacity: 95,
        hotkey: 'Alt+Shift+C',
        hotkeyEnabled: true,
        searchHotkey: 'Ctrl+F',
        searchHotkeyEnabled: true,
        contextDepth: 15,
        exchangeDepth: 1,
        localHistoryLimit: 50,
        connectionSource: 'default',
        connectionProfileId: '',
        customUrl: 'http://localhost:5000/v1',
        customKey: '',
        customModel: '',
        maxTokens: 8048,
        includeSystemPrompt: false,
        includeUserPersonality: true,
        includeAlternateSwipes: false,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        memoryManagePrompt: DEFAULT_MEMORY_PROMPT,
        profiles: {},
        activeProfile: '',
        profileBindings: {},
        customTheme: { ...THEME_PRESETS.default },
        savedThemes: {},
        activeThemeProfile: '',
        floatingIconPersistent: false,
        reasoningTrimStrings: '',
        ghostModeOpacity: 15,
        ghostModeHotkey: 'Alt+Shift+G',
        ghostModeHotkeyEnabled: true,
        quickPromptsVisible: false,
        quickPrompts: [
            { id: 'qp_d1', label: 'Analyze', icon: '🔍', text: 'Analyze the current scene and character motivations in detail.' },
            { id: 'qp_d2', label: 'Ideas', icon: '💡', text: 'Give me 3 creative plot twist ideas for the current scene.' },
            { id: 'qp_d3', label: 'Summary', icon: '📋', text: 'Summarize everything that has happened in the simulation so far.' },
            { id: 'qp_d4', label: 'Feelings', icon: '💭', text: 'What is {{char}} likely feeling right now and why?' },
            { id: 'qp_d5', label: 'Next?', icon: '🎯', text: 'What are the most interesting directions the story could go next?' },
        ],
        quickPromptSets: {},
        activeQuickPromptSet: '',
        promptPresets: {},
        changelogAutoShow: true,
        lastSeenVersion: '',
        forceStreaming: 'auto',
        applyRegexToContext: true,
        completionSound: 'none',
        completionSoundVolume: 80,
        completionSoundOnlyWhenUnfocused: false,
        wobbleWindow: false,
        windowBgUrl: '',
        windowBgDim: 50,
        windowBgType: 'none',
        pickerPreviewLines: 1,
        pickerPreviewLastLines: 0,
        memoryEnabled: true,
        memoryInject: true,
        memoryScope: 'global',
        memoryTag: 'memory-update',
        memoryNotify: true,
        memories: {},
        toolsEnabled: true,
        toolsSystemPrompt: '',
        toolsThinking: false,
        toolsMaxRounds: 5,
        toolsEnabled_search_chat: true,
        toolsEnabled_ask_user: true,
        toolsEnabled_get_chat_stats: true,
        toolsEnabled_get_recent_messages: true,
        includeSummaryception: true,
        useAspectEvolutia: true,
        autoExpandMacros: false,
        includeHiddenMessages: false,
        portrayStyle: 'rp',
        portrayPerson: 'first',
        portrayImmediateSend: false,
        portrayAutoTrigger: false,
        portrayPrompt: DEFAULT_PORTRAY_PROMPT,
        postHistoryText: '',
        postHistoryRole: 'user',
    };
    for (const [k, v] of Object.entries(defaults)) {
        if (s[k] === undefined) s[k] = v;
    }
    // A stored prompt that matches a superseded default is the old default,
    // not a user customization — carry it forward to the current one.
    const _normPrompt = t => t.replace(/\r\n/g, '\n').trim();
    const upgradeLegacyPrompt = (holder, key, legacyList, currentDefault) => {
        const v = holder ? holder[key] : undefined;
        if (typeof v === 'string' && v
            && legacyList.some(p => _normPrompt(p) === _normPrompt(v))) {
            holder[key] = currentDefault;
        }
    };
    upgradeLegacyPrompt(s, 'systemPrompt', LEGACY_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT);
    // Profiles carry their own systemPrompt copies; the same rule applies.
    for (const p of Object.values(s.profiles || {})) {
        upgradeLegacyPrompt(p, 'systemPrompt', LEGACY_SYSTEM_PROMPTS, DEFAULT_SYSTEM_PROMPT);
    }
    upgradeLegacyPrompt(s, 'memoryManagePrompt', LEGACY_MEMORY_PROMPTS, DEFAULT_MEMORY_PROMPT);
    // An empty toolsSystemPrompt already means "use the current default", so a
    // stored old default simply empties back to that.
    upgradeLegacyPrompt(s, 'toolsSystemPrompt', LEGACY_TOOLS_PROMPTS, '');
    upgradeLegacyPrompt(s, 'portrayPrompt', LEGACY_PORTRAY_PROMPTS, DEFAULT_PORTRAY_PROMPT);
    for (const p of Object.values(s.profiles || {})) {
        upgradeLegacyPrompt(p, 'portrayPrompt', LEGACY_PORTRAY_PROMPTS, DEFAULT_PORTRAY_PROMPT);
    }
    delete s.sessions; // legacy multi-session store; the conversation file owns state now
    return s;
}

function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
    _dbgDiffSettings();
}

// ─── ST Context Helpers ─────────────────────────────────────────────────────
function getBindingKey() {
    const ctx = SillyTavern.getContext();
    let charId = 'global';
    if (ctx.characterId !== undefined && ctx.characterId !== null) {
        charId = String(ctx.characterId);
    } else if (typeof window.this_chid !== 'undefined' && window.this_chid !== null) {
        charId = String(window.this_chid);
    }

    let chatId = 'default';
    try {
        if (typeof window.chat_file_name === 'string' && window.chat_file_name) {
            chatId = String(window.chat_file_name);
        } else if (typeof ctx.getCurrentChatId === 'function') {
            const r = ctx.getCurrentChatId(); if (r) chatId = String(r);
        }

        if (chatId === 'default' || !chatId) {
            if (ctx.chatId) chatId = String(ctx.chatId);
            else if (typeof window.chat_id !== 'undefined' && window.chat_id !== null) chatId = String(window.chat_id);
        }
    } catch (_) {}

    return { charId, chatId };
}

// ─── Per-Chat Setting Overrides ─────────────────────────────────────────────
// Overrides ride on this chat's inner conversation and persist with it.

function getConversationOverrides() {
    try { return getConversation().overrides || {}; } catch (_) { return {}; }
}

function getEffectiveSettings() {
    return { ...getSettings(), ...getConversationOverrides() };
}

function setConversationOverride(key, value) {
    try {
        const conv = getConversation();
        if (!conv.overrides) conv.overrides = {};
        if (value === undefined || value === null) delete conv.overrides[key];
        else conv.overrides[key] = value;
        saveConversation();
        Promise.resolve().then(function () { return uiSettings; }).then(m => m.updateConversationOverrideIndicator());
    } catch (_) {}
}

function clearAllConversationOverrides() {
    try {
        const conv = getConversation();
        conv.overrides = {};
        saveConversation();
        Promise.resolve().then(function () { return uiSettings; }).then(m => m.updateConversationOverrideIndicator());
    } catch (_) {}
}

function hasConversationOverrides() {
    try { const o = getConversation().overrides; return !!(o && Object.keys(o).length > 0); }
    catch (_) { return false; }
}

// ─── Storage Subsystem ──────────────────────────────────────────────────────

let _conversation = emptyConversation();
let _currentFileId = null;
const _saveQueue = new Map();

function freshFileId() {
    return `inner_voice_conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`;
}

async function saveConversationFile(file_id, payload, useKeepalive = false) {
    const ctx = SillyTavern.getContext();
    try {
        const jsonStr = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file_id, data: b64 }),
            keepalive: useKeepalive
        });
        return res.ok;
    } catch (e) {
        _dbgAdd('STORAGE_WRITE_FAILED', { file_id, error: e.message });
        console.error(`[${EXT_DISPLAY}] saveConversationFile error:`, e);
        return false;
    }
}

window.addEventListener('beforeunload', () => {
    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        saveConversationFile(fileId, item.payload, true);
    }
});

function _decodeBase64Utf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

function _tryParsePayload(text) {
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(_decodeBase64Utf8(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(text)); } catch (_) {}
    try { return JSON.parse(_repairJSON(_decodeBase64Utf8(text))); } catch (_) {}
    return undefined;
}

async function loadConversationFile(file_id) {
    try {
        const res = await fetch(`/user/files/${file_id}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
            _dbgAdd('STORAGE_LOAD_HTML_REDIRECT', { file_id });
            return null;
        }

        const parsed = _tryParsePayload(trimmed);
        if (parsed === undefined) throw new Error('Unrecoverable payload after base64/repair fallback');
        return parsed;
    } catch (e) {
        _dbgAdd('STORAGE_LOAD_ERROR', { file_id, error: e.message });
        console.error(`[${EXT_DISPLAY}] loadConversationFile error:`, e);
        return false;
    }
}

function conversationFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.conversation) return normalizeConversation(payload.conversation);
    if (payload.bucket) return migrateLegacyBucket(payload.bucket);
    return null;
}

async function initConversation({ forceReset = false } = {}) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chatMetadata) ctx.chatMetadata = {};
    const { charId, chatId } = getBindingKey();

    if (forceReset) {
        const prevMeta = ctx.chatMetadata.inner_voice || null;
        const freshId = freshFileId();
        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: freshId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        _currentFileId = freshId;
        _conversation = emptyConversation();
        await commitConversation(true);
        _dbgAdd('CONVERSATION_FORCE_RESET', { charId, chatId, prevFileId: prevMeta?.file_id || null, newFileId: freshId });
        refreshSimulationView();
        return;
    }

    for (const [fileId, item] of _saveQueue.entries()) {
        clearTimeout(item.timer);
        _saveQueue.delete(fileId);
        saveConversationFile(fileId, item.payload);
    }

    const meta = ctx.chatMetadata.inner_voice;
    const knownFormat = meta && meta.file_id && (meta.format === 'v5' || meta.format === 'v4');
    let targetFileId = null;
    let payload = null;

    if (knownFormat) {
        if (meta.chat_id === chatId) {
            targetFileId = meta.file_id;
            payload = await loadConversationFile(targetFileId);
            if (meta.format !== 'v5') {
                ctx.chatMetadata.inner_voice = { ...meta, format: 'v5' };
                if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
            }
        } else {
            _dbgAdd('STORAGE_CHAT_BRANCH_DETECTED', { oldChatId: meta.chat_id, newChatId: chatId });
            payload = await loadConversationFile(meta.file_id);
            targetFileId = freshFileId();

            if (payload && payload !== false) {
                await saveConversationFile(targetFileId, payload);
            }

            ctx.chatMetadata.inner_voice = { format: 'v5', file_id: targetFileId, chat_id: chatId };
            if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        }
    } else {
        targetFileId = freshFileId();
        _dbgAdd('STORAGE_INIT_V5', { targetFileId });

        if (meta && meta.file_id) {
            payload = await loadConversationFile(meta.file_id);
        }

        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: targetFileId, chat_id: chatId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
    }

    _currentFileId = targetFileId;

    if (payload === false) {
        _dbgAdd('STORAGE_LOAD_CORRUPTED_RECOVERY', { brokenFileId: targetFileId, charId, chatId });
        const recoveryFileId = freshFileId();
        ctx.chatMetadata.inner_voice = { format: 'v5', file_id: recoveryFileId, chat_id: chatId, recoveredFrom: targetFileId };
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();

        _currentFileId = recoveryFileId;
        _conversation = emptyConversation();
        await commitConversation(true);

        toastr.error('The inner conversation file was corrupted and could not be recovered. Started fresh storage for this chat; the broken file was kept on disk for manual recovery.', EXT_DISPLAY, { timeOut: 15000 });
        refreshSimulationView();
        return;
    }

    const loaded = conversationFromPayload(payload);
    if (loaded) {
        _conversation = loaded;
        _dbgAdd('STORAGE_CONVERSATION_LOADED', { charId, chatId, fileId: targetFileId, turnCount: _conversation.messages.length, migratedFromBucket: !payload.conversation });
    } else {
        _conversation = emptyConversation();
        _dbgAdd('STORAGE_CONVERSATION_EMPTY_INIT', { charId, chatId, fileId: targetFileId, hadPayload: !!payload });
    }

    if (!payload || !payload.conversation || meta?.format !== 'v5' || meta?.chat_id !== chatId) {
        await commitConversation(true);
    }
    refreshSimulationView();
}

async function commitConversation(force = false) {
    const fileName = _currentFileId;
    if (!fileName) return;

    const { chatId } = getBindingKey();
    const snapshot = JSON.parse(JSON.stringify(_conversation));

    const payloadToSave = {
        _version: 5,
        chat_id_reference: chatId,
        updated_at: Date.now(),
        conversation: snapshot
    };

    if (force) {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);
        _saveQueue.delete(fileName);

        const success = await saveConversationFile(fileName, payloadToSave);
        if (!success) _dbgAdd('STORAGE_WRITE_FAILED', { fileName });
    } else {
        const existing = _saveQueue.get(fileName);
        if (existing) clearTimeout(existing.timer);

        const timer = setTimeout(() => {
            _saveQueue.delete(fileName);
            saveConversationFile(fileName, payloadToSave);
        }, 1000);

        _saveQueue.set(fileName, { timer, payload: payloadToSave });
    }
}

function saveConversation() {
    commitConversation();
}

function getConversation() {
    _conversation = normalizeConversation(_conversation);
    return _conversation;
}

// ─── Exchange Spine Helpers ─────────────────────────────────────────────────

function genId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// The live edge: index of the latest main-chat message, or null before the
// story has any messages.
function getLiveEdgeIndex() {
    try {
        const chat = SillyTavern.getContext().chat;
        if (!Array.isArray(chat) || !chat.length) return null;
        return chat.length - 1;
    } catch (_) {
        return null;
    }
}

// Adds a turn at the live edge. Every new turn anchors there — thinking always
// happens in the present.
function refreshSimulationView() {
    Promise.resolve().then(function () { return simulationView; }).then(m => m.syncSimulationView()).catch(() => {});
}

function addTurn(conversation, role, content, extra = {}) {
    const msg = { id: genId('msg'), role, content, timestamp: Date.now(), anchorIndex: getLiveEdgeIndex(), ...extra };
    conversation.messages.push(msg);
    if (conversation.messages.length > 400) conversation.messages = conversation.messages.slice(-400);
    saveConversation();
    refreshSimulationView();
    return msg;
}

// Adds a turn only if the requested anchor is the live edge; old exchanges
// reject new turns. Returns the turn, or null when rejected.
function addTurnAt(conversation, anchorIndex, role, content, extra = {}) {
    if (anchorIndex !== getLiveEdgeIndex()) return null;
    return addTurn(conversation, role, content, extra);
}

// Groups the conversation's turns into exchanges — one per anchor, in order.
function getExchanges(conversation) {
    const groups = new Map();
    for (const m of conversation.messages) {
        const anchor = m.anchorIndex === undefined ? null : m.anchorIndex;
        if (!groups.has(anchor)) groups.set(anchor, { anchorIndex: anchor, turns: [] });
        groups.get(anchor).turns.push(m);
    }
    return [...groups.values()];
}

function getExchangeAt(conversation, anchorIndex) {
    return getExchanges(conversation).find(e => e.anchorIndex === anchorIndex) || null;
}

// The exchange at the live edge — the only one that can still grow.
function getLiveExchange(conversation) {
    const edge = getLiveEdgeIndex();
    if (edge === null) return null;
    return getExchangeAt(conversation, edge);
}

// ─── Hide ───────────────────────────────────────────────────────────────────
// Hide is a reversible flag on an exchange (keyed by its anchor), never
// deletion: the turns stay in the conversation and remain readable in the UI.
// Inner memory and the simulation view both skip hidden exchanges; hidden
// exchanges also do not count toward exchange depth.
//
// The flag is the player's hide toggle. An exchange whose anchor message is
// hidden in the main chat is hidden with it automatically — that host state
// is observed, not copied onto the flag, so unhiding the message restores
// the exchange unless the player had already hidden it themselves.

function isMainChatMessageHidden(message) {
    if (!message) return false;
    return !!(message.is_system || message.is_hidden || message.extra?.is_hidden || message.extra?.sc_ghosted);
}

function isAnchorHiddenInMainChat(anchorIndex) {
    if (anchorIndex === null || anchorIndex === undefined) return false;
    try {
        const chat = SillyTavern.getContext().chat;
        return isMainChatMessageHidden(chat?.[anchorIndex]);
    } catch (_) {
        return false;
    }
}

function isExchangeManuallyHidden(conversation, anchorIndex) {
    const anchor = anchorIndex === undefined ? null : anchorIndex;
    return conversation.hiddenAnchors.includes(anchor);
}

function isExchangeHidden(conversation, anchorIndex) {
    return isExchangeManuallyHidden(conversation, anchorIndex) || isAnchorHiddenInMainChat(anchorIndex);
}

function setExchangeHidden(conversation, anchorIndex, hidden) {
    const has = isExchangeManuallyHidden(conversation, anchorIndex);
    if (hidden && !has) conversation.hiddenAnchors.push(anchorIndex);
    if (!hidden && has) conversation.hiddenAnchors = conversation.hiddenAnchors.filter(a => a !== anchorIndex);
    saveConversation();
    refreshSimulationView();
}

// The turns the Inner Voice remembers: every turn whose exchange is not hidden.
function getVisibleTurns(conversation) {
    return conversation.messages.filter(m => !isExchangeHidden(conversation, m.anchorIndex));
}

// ─── Turn Editing Helpers ───────────────────────────────────────────────────

function truncateAfter(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx + 1); saveConversation(); refreshSimulationView(); }
}

function deleteMsg(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx, 1); saveConversation(); refreshSimulationView(); }
}

function truncateFrom(conversation, msgId) {
    const idx = conversation.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) { conversation.messages.splice(idx); saveConversation(); refreshSimulationView(); }
}

// ─── Macro Expansion Helper ────────────────────────────────────────────────

function expandMacros(text) {
    if (!text) return text;
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.substituteParams === 'function') {
            return ctx.substituteParams(text);
        }
        if (typeof window.substituteParams === 'function') {
            return window.substituteParams(text, ctx.name1, ctx.name2);
        }
    } catch (e) {
        console.warn(`[${EXT_DISPLAY}] Macro expansion error:`, e);
    }
    try {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        const d = char?.data || {};
        const now = new Date();
        return text
            .replace(/\{\{user\}\}/gi, ctx.name1 || 'User')
            .replace(/\{\{char\}\}/gi, char?.name || ctx.name2 || 'Character')
            .replace(/\{\{time\}\}/gi, now.toLocaleTimeString())
            .replace(/\{\{date\}\}/gi, now.toLocaleDateString())
            .replace(/\{\{isodate\}\}/gi, now.toISOString().split('T')[0])
            .replace(/\{\{isotime\}\}/gi, now.toTimeString().slice(0, 5))
            .replace(/\{\{lastMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                return msgs?.[msgs.length - 1]?.mes || '';
            })
            .replace(/\{\{lastUserMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                if (!msgs) return '';
                for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].is_user) return msgs[i].mes || '';
                }
                return '';
            })
            .replace(/\{\{lastCharMessage\}\}/gi, () => {
                const msgs = ctx.chat;
                if (!msgs) return '';
                for (let i = msgs.length - 1; i >= 0; i--) {
                    if (!msgs[i].is_user) return msgs[i].mes || '';
                }
                return '';
            })
            .replace(/\{\{description\}\}/gi, d.description || char?.description || '')
            .replace(/\{\{personality\}\}/gi, d.personality || char?.personality || '')
            .replace(/\{\{scenario\}\}/gi, d.scenario || char?.scenario || '');
    } catch (_) {
        return text;
    }
}

var conversation = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addTurn: addTurn,
    addTurnAt: addTurnAt,
    clearAllConversationOverrides: clearAllConversationOverrides,
    commitConversation: commitConversation,
    deleteMsg: deleteMsg,
    expandMacros: expandMacros,
    genId: genId,
    getBindingKey: getBindingKey,
    getConversation: getConversation,
    getConversationOverrides: getConversationOverrides,
    getEffectiveSettings: getEffectiveSettings,
    getExchangeAt: getExchangeAt,
    getExchanges: getExchanges,
    getLiveEdgeIndex: getLiveEdgeIndex,
    getLiveExchange: getLiveExchange,
    getSettings: getSettings,
    getVisibleTurns: getVisibleTurns,
    hasConversationOverrides: hasConversationOverrides,
    initConversation: initConversation,
    isAnchorHiddenInMainChat: isAnchorHiddenInMainChat,
    isExchangeHidden: isExchangeHidden,
    isExchangeManuallyHidden: isExchangeManuallyHidden,
    loadConversationFile: loadConversationFile,
    saveConversation: saveConversation,
    saveConversationFile: saveConversationFile,
    saveSettings: saveSettings,
    setConversationOverride: setConversationOverride,
    setExchangeHidden: setExchangeHidden,
    truncateAfter: truncateAfter,
    truncateFrom: truncateFrom
});

function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); toastr.success('Copied', EXT_DISPLAY); }
    catch (e) { toastr.error('Copy failed', EXT_DISPLAY); }
    ta.remove();
}

function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => toastr.success('Copied', EXT_DISPLAY))
            .catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
}

function autoResize(el) { 
    el.style.height = 'auto'; 
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`; 
}

function showCustomDialog({ type = 'alert', title = '', message = '', htmlMessage = '', defaultValue = '', placeholder = '', delayConfirm = 0 }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'iv-dialog-overlay';
        overlay.style.zIndex = '2147483050';
        const isPrompt = type === 'prompt';
        const isConfirm = type === 'confirm';
        overlay.innerHTML = `
            <div class="iv-dialog-box">
                ${title ? `<div class="iv-dialog-title">${escHtml(title)}</div>` : ''}
                ${message ? `<div class="iv-dialog-msg">${escHtml(message)}</div>` : (htmlMessage ? `<div class="iv-dialog-msg">${htmlMessage}</div>` : '')}
                ${isPrompt ? `<input type="text" class="iv-dialog-input" value="${escHtml(defaultValue)}" placeholder="${escHtml(placeholder)}">` : ''}
                <div class="iv-dialog-btns">
                    ${(isPrompt || isConfirm) ? `<button class="iv-dialog-btn iv-dialog-cancel">Cancel</button>` : ''}
                    <button class="iv-dialog-btn iv-dialog-ok${isConfirm ? ' danger' : ''}">${isConfirm ? 'Confirm' : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.iv-dialog-input');
        const okBtn = overlay.querySelector('.iv-dialog-ok');
        const cancelBtn = overlay.querySelector('.iv-dialog-cancel');
        
        let timerIntv = null;
        let currentDelay = delayConfirm;
        const origOkText = okBtn.textContent;

        const close = val => { 
            if (timerIntv) clearInterval(timerIntv);
            overlay.classList.remove('visible'); 
            setTimeout(() => overlay.remove(), 150); 
            resolve(val); 
        };

        if (isConfirm && currentDelay > 0) {
            okBtn.disabled = true;
            okBtn.style.opacity = '0.5';
            okBtn.style.cursor = 'not-allowed';
            okBtn.textContent = `${origOkText} (${currentDelay})`;
            timerIntv = setInterval(() => {
                currentDelay--;
                if (currentDelay <= 0) {
                    clearInterval(timerIntv);
                    timerIntv = null;
                    okBtn.disabled = false;
                    okBtn.style.opacity = '1';
                    okBtn.style.cursor = '';
                    okBtn.textContent = origOkText;
                    if (!input) okBtn.focus();
                } else {
                    okBtn.textContent = `${origOkText} (${currentDelay})`;
                }
            }, 1000);
        }

        if (input) { input.focus(); input.select(); } else if (currentDelay <= 0) { setTimeout(() => okBtn.focus(), 50); }
        
        okBtn.addEventListener('click', () => { if (!okBtn.disabled) close(isPrompt ? input.value : true); });
        cancelBtn?.addEventListener('click', () => close(isPrompt ? null : false));
        let _dlgMouseDownTarget = null;
        overlay.addEventListener('mousedown', e => { _dlgMouseDownTarget = e.target; });
        overlay.addEventListener('click', e => { if (e.target === overlay && _dlgMouseDownTarget === overlay) close(isPrompt ? null : false); });
        const keyHandler = e => {
            if (e.key === 'Enter') { e.preventDefault(); if (!okBtn.disabled) close(isPrompt ? input.value : true); }
            if (e.key === 'Escape') close(isPrompt ? null : false);
        };
        (input || overlay).addEventListener('keydown', keyHandler);
        requestAnimationFrame(() => overlay.classList.add('visible'));
    });
}

async function _fileToDataUrl(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => {
            rej(new Error('Read failed'));
        };
        r.readAsDataURL(file);
    });
}

var utilDom = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _fileToDataUrl: _fileToDataUrl,
    autoResize: autoResize,
    copyText: copyText,
    escHtml: escHtml,
    fallbackCopy: fallbackCopy,
    showCustomDialog: showCustomDialog
});

function getCharInfo() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (!char) return null;
    
    const d = char.data || {};
    const ov = ctx.chatMetadata?.character_overrides || {};
    
    const get = (field, macro) => {
        if (ov[field]) return ov[field];
        if (macro) {
            try { const r = expandMacros(macro); if (r && r !== macro) return r; } catch(_) {}
        }
        return d[field] || char[field] || '';
    };

    const getCharNote = () => {
        if (ov.depth_prompt && ov.depth_prompt.prompt) return ov.depth_prompt.prompt;
        return d.extensions?.depth_prompt?.prompt || char.extensions?.depth_prompt?.prompt || '';
    };

    return {
        name: char.name || 'Unknown',
        description: get('description', '{{description}}'),
        personality: get('personality', '{{personality}}'),
        scenario: get('scenario', '{{scenario}}'),
        mes_example: get('mes_example', '{{mesExamples}}'),
        character_note: getCharNote(),
        creator_notes: get('creator_notes'),
        system_prompt: get('system_prompt'),
        post_history_instructions: get('post_history_instructions'),
    };
}

function getUserPersona() {
    const ctx = SillyTavern.getContext();
    
    try {
        let expanded = '';
        if (typeof ctx.substituteParams === 'function') {
            expanded = ctx.substituteParams('{{persona}}');
        } else if (typeof window.substituteParams === 'function') {
            expanded = window.substituteParams('{{persona}}');
        }
        if (expanded && expanded !== '{{persona}}') return expanded;
    } catch (_) {}

    try {
        const pu = window.power_user || ctx.powerUserSettings || {};
        let personaId = window.user_avatar || ctx.user_avatar || ctx.userAvatar || ctx.personaId || ctx.activePersonaId || ctx.active_persona_id;
        if (!personaId && typeof document !== 'undefined') {
            const selected = document.querySelector('#user_avatar_block .avatar-container.selected, #persona_container .avatar-container.selected, .persona_selected');
            if (selected) personaId = selected.getAttribute('data-avatar-id') || selected.dataset?.avatarId;
        }
        if (typeof personaId === 'object' && personaId !== null) {
            personaId = personaId.avatarId || personaId.avatar_id || personaId.user_avatar || personaId.userAvatar || personaId.id;
        }

        if (personaId && pu.persona_descriptions) {
            const pd = pu.persona_descriptions[personaId];
            if (typeof pd === 'string') return pd;
            if (typeof pd === 'object' && pd.description) return pd.description;
        }
        if (typeof pu.persona_description === 'string' && pu.persona_description) return pu.persona_description;
    } catch (_) {}

    return ctx.persona || ctx.userPersona || ctx.user_persona || '';
}

function genMemoryId() { 
    return 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); 
}

function getMemories() {
    const s = getSettings();
    if (!s.memories || typeof s.memories !== 'object') s.memories = {};
    return s.memories;
}

function getVisibleMemories() {
    const { charId, chatId } = getBindingKey();
    const all = Object.values(getMemories());

    return all.filter(m => {
        if (m.disabled) return false;
        if (m.scope === 'global') return true;
        if (m.scope === 'character') return m.charId === charId;
        // Legacy 'session' memories collapse into the chat scope: one main chat
        // now has exactly one inner conversation.
        if (m.scope === 'chat' || m.scope === 'session') return m.charId === charId && m.chatId === chatId;
        return m.charId === charId; // fallback
    });
}

function addMemory(key, value, scope = 'character') {
    const { charId, chatId } = getBindingKey();
    const ctx = SillyTavern.getContext();
    const charName = ctx.characters?.[charId]?.name || charId || 'Unknown Character';
    const chatName = chatId || 'Unknown Chat';

    const id = genMemoryId();
    getMemories()[id] = {
        id, key: key.trim(), value: value.trim(),
        createdAt: Date.now(),
        scope: ['global', 'character', 'chat'].includes(scope) ? scope : 'character',
        charId, charName,
        chatId, chatName,
        disabled: false
    };
    saveSettings();
    updateMemoryDot();
    return id;
}

function updateMemory(id, key, value) {
    const mem = getMemories()[id];
    if (!mem) return;
    mem.key = key.trim();
    mem.value = value.trim();
    mem.updatedAt = Date.now();
    saveSettings();
}

function deleteMemory(id) {
    _dbgAdd('MEM_DELETE', { id });
    delete getMemories()[id];
    saveSettings();
    updateMemoryDot();
}

function clearAllMemories() {
    _dbgAdd('MEM_CLEAR_ALL');
    getSettings().memories = {};
    saveSettings();
    updateMemoryDot();
}

function updateMemoryDot() {
    const has = Object.keys(getMemories()).length > 0;
    document.getElementById('iv-sp-memory-dot')?.style.setProperty('display', has ? '' : 'none');
}

function buildMemoryContextBlock(settings) {
    const s = settings || getSettings();
    if (!s.memoryEnabled || !s.memoryInject) return '';
    const mems = getVisibleMemories();
    if (!mems.length) return '';
    
    const lines = mems.map(m => `- [${m.scope.toUpperCase()}][${m.key}]: ${m.value}`).join('\n');
    return `\n\n<persistent_memory>\nThese are facts about the user that you should remember and reference when relevant:\n${lines}\n</persistent_memory>`;
}

function buildMemoryAIInstructions(settings) {
    const s = settings || getSettings();
    if (!s.memoryEnabled) return '';
    const rawPrompt = s.memoryManagePrompt || DEFAULT_MEMORY_PROMPT;
    
    const mems = getVisibleMemories();
    let memsText = 'None';
    if (mems.length > 0) {
        const grouped = {};
        for (const m of mems) {
            if (!grouped[m.scope]) grouped[m.scope] = [];
            grouped[m.scope].push(`"${m.key}"`);
        }
        memsText = Object.entries(grouped)
            .map(([scope, keys]) => `- ${scope.toUpperCase()}: "${keys.join('", ')}`)
            .join('\n');
    }
    
    const finalPrompt = rawPrompt
        .replace('{{memory_format}}', MEMORY_FORMAT_BLOCK)
        .replace('{{current_memories}}', memsText);
        
    return '\n\n' + _ensureWrapped(finalPrompt, 'memory_system');
}

function parseMemoryBlockFromText(text) {
    const re = new RegExp('```memory-update\\s*([\\s\\S]*?)```', 'i');
    const m = text.match(re);
    if (!m) return null;
    try { return JSON.parse(m[1].trim()); } catch(_) {}
    try { const fixed = m[1].trim().replace(/,\s*]/g, ']').replace(/,\s*}/g, '}'); return JSON.parse(fixed); } 
    catch(_) { 
        _dbgAdd('MEM_AI_UPDATE_BLOCK_FAILED', { raw: m[1] });
        return null; 
    }
}

function stripMemoryBlock(text) {
    return text.replace(/```memory-update[\s\S]*?```/gi, '').trim();
}

function processMemoryUpdates(text, msgId) {
    const s = getSettings();
    if (!s.memoryEnabled) return;
    const changes = parseMemoryBlockFromText(text);
    if (!changes?.length) return;
    const applied = [];
    for (const ch of changes) {
        if (ch.action === 'add' && ch.key && ch.value) {
            const targetScope = ['global', 'character', 'chat'].includes(ch.scope) ? ch.scope : 'character';
            const mem = getVisibleMemories().find(m => m.scope === targetScope && m.key === ch.key);
            
            if (mem) {
                const newVal = mem.value + '\n' + ch.value;
                updateMemory(mem.id, ch.key, newVal);
                applied.push({ action: 'update', key: ch.key, value: newVal });
            } else {
                addMemory(ch.key, ch.value, ch.scope);
                applied.push({ action: 'add', key: ch.key, value: ch.value });
            }
        } else if ((ch.action === 'edit' || ch.action === 'update') && ch.scope && ch.key && ch.value) {
            const mem = getVisibleMemories().find(m => m.scope === ch.scope && m.key === ch.key);
            if (mem) {
                updateMemory(mem.id, ch.key, ch.value);
                applied.push({ action: 'update', key: ch.key, value: ch.value });
            }
        } else if (ch.action === 'delete' && ch.scope && ch.key) {
            const mem = getVisibleMemories().find(m => m.scope === ch.scope && m.key === ch.key);
            if (mem) { applied.push({ action: 'delete', key: mem.key }); deleteMemory(mem.id); }
        } else {
            if (ch.action && !['add', 'edit', 'update', 'delete'].includes(ch.action)) {
                _dbgAdd('MEM_AI_ACTION_UNKNOWN', { action: ch.action });
            } else if (ch.scope && !['global', 'character', 'chat'].includes(ch.scope)) {
                _dbgAdd('MEM_SCOPE_INVALID', { scope: ch.scope });
            }
        }
    }
    if (applied.length) {
        if (s.memoryNotify) showMemoryToast(applied);
        if (document.getElementById('iv-sp-pane-memory')?.style.display !== 'none') renderMemoryList();
    }
}

function showMemoryToast(applied) {
    const existing = document.querySelector('.iv-memory-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'iv-memory-toast';
    const icons = { add: '✦', update: '✎', delete: '✕' };
    const lines = applied.slice(0, 3).map(a => `${icons[a.action] || '·'} ${escHtml(a.key)}: ${escHtml((a.value || '(deleted)').slice(0, 60))}`).join("\n");
    const linesHtml = lines.split("\n").join("<br>");
    toast.innerHTML = `<span class="iv-memory-toast-icon"><i class="fa-solid fa-brain"></i></span><div class="iv-memory-toast-body"><div class="iv-memory-toast-title">Memory Updated (${applied.length})</div><div class="iv-memory-toast-text">${linesHtml}</div></div>`;
    document.body.appendChild(toast);
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
        _dbgAdd('MEM_TOAST_DISMISS', { reason: 'click' });
        toast.remove();
    });
    setTimeout(() => {
        toast.style.animation = 'iv-toast-out 0.25s ease forwards';
        setTimeout(() => {
            _dbgAdd('MEM_TOAST_DISMISS', { reason: 'timeout' });
            toast.remove();
        }, 260);
    }, 12000);
}

function renderMemoryList() {
    const listEl = document.getElementById('iv-sp-memory-list');
    const emptyEl = document.getElementById('iv-sp-memory-empty');
    if (!listEl) return;
    
    const allMems = Object.values(getMemories()).sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    listEl.innerHTML = '';
    
    if (!allMems.length) {
        if (emptyEl) emptyEl.style.display = '';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const tree = { global: [], characters: {} };

    allMems.forEach(m => {
        if (m.scope === 'global' || !m.scope) {
            tree.global.push(m);
        } else {
            const charId = m.charId || 'unknown';
            if (!tree.characters[charId]) {
                tree.characters[charId] = { name: m.charName || charId, memories: [], chats: {} };
            }
            const charNode = tree.characters[charId];

            if (m.scope === 'character') {
                charNode.memories.push(m);
            } else {
                const chatId = m.chatId || 'unknown';
                if (!charNode.chats[chatId]) {
                    charNode.chats[chatId] = { name: m.chatName || chatId, memories: [] };
                }
                // Legacy 'session' memories render under their chat.
                charNode.chats[chatId].memories.push(m);
            }
        }
    });

    const createMemEl = (mem) => {
        const item = document.createElement('div');
        item.className = 'iv-memory-item';
        if (mem.disabled) item.style.opacity = '0.5';
        item.dataset.id = mem.id;
        
        const isNew = (Date.now() - (mem.createdAt || 0)) < 5000;
        if (isNew) {
            const dot = document.createElement('div');
            dot.className = 'iv-memory-new-badge';
            item.appendChild(dot);
        }

        const timeStr = mem.updatedAt
            ? `Updated ${new Date(mem.updatedAt).toLocaleString()}`
            : `Added ${new Date(mem.createdAt || 0).toLocaleString()}`;

        item.innerHTML += `
            <div class="iv-memory-item-body">
                <div class="iv-memory-item-key">${escHtml(mem.key)}</div>
                <div class="iv-memory-item-val-ph"></div>
                <div class="iv-memory-item-meta">${escHtml(timeStr)}</div>
            </div>
            <div class="iv-memory-item-actions">
                <button class="iv-memory-item-toggle" title="${mem.disabled ? 'Enable Memory' : 'Disable Memory'}">
                    <i class="fa-solid ${mem.disabled ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                </button>
                <button class="iv-memory-item-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="iv-memory-item-del" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        const valEl = document.createElement('div');
        valEl.className = 'iv-memory-item-val';
        const isLong = mem.value.length > 120;
        valEl.textContent = isLong ? mem.value.slice(0, 120) + '…' : mem.value;
        if (isLong) {
            valEl.style.cursor = 'pointer';
            valEl.title = 'Click to expand';
            let expanded = false;
            valEl.addEventListener('click', e => {
                e.stopPropagation();
                expanded = !expanded;
                valEl.textContent = expanded ? mem.value : mem.value.slice(0, 120) + '…';
                valEl.title = expanded ? 'Click to collapse' : 'Click to expand';
            });
        }
        item.querySelector('.iv-memory-item-val-ph').replaceWith(valEl);
        
        item.querySelector('.iv-memory-item-toggle').addEventListener('click', e => {
            e.stopPropagation();
            mem.disabled = !mem.disabled;
            _dbgAdd('MEM_TOGGLE_DISABLE', { id: mem.id, disabled: mem.disabled });
            saveSettings();
            renderMemoryList();
        });

        item.querySelector('.iv-memory-item-edit').addEventListener('click', async e => {
            e.stopPropagation();
            await editMemoryDialog(mem.id);
        });
        
        item.querySelector('.iv-memory-item-del').addEventListener('click', async e => {
            e.stopPropagation();
            const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Memory', message: `Delete memory "${mem.key}"?` });
            if (!ok) return;
            deleteMemory(mem.id);
            renderMemoryList();
        });
        return item;
    };

    const buildDetails = (title, icon, contentEls, open = false) => {
        if (!contentEls || contentEls.length === 0) return null;
        const det = document.createElement('details');
        det.className = 'iv-mem-tree-details';
        if (open) det.open = true;
        const sum = document.createElement('summary');
        sum.className = 'iv-mem-tree-summary';
        sum.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${escHtml(title)}`;
        const content = document.createElement('div');
        content.className = 'iv-mem-tree-content';
        contentEls.forEach(el => content.appendChild(el));
        det.appendChild(sum);
        det.appendChild(content);
        return det;
    };

    if (tree.global.length > 0) {
        const globDet = buildDetails('Global', 'globe', tree.global.map(createMemEl), true);
        if (globDet) listEl.appendChild(globDet);
    }

    const charKeys = Object.keys(tree.characters);
    if (charKeys.length > 0) {
        const charContent = [];
        
        charKeys.forEach(charId => {
            const cNode = tree.characters[charId];
            const nodeContent = [];
            
            cNode.memories.forEach(m => nodeContent.push(createMemEl(m)));
            
            const chatKeys = Object.keys(cNode.chats);
            if (chatKeys.length > 0) {
                const chatsWrapper = [];
                chatKeys.forEach(chatId => {
                    const chatNode = cNode.chats[chatId];
                    const chatContent = [];
                    chatNode.memories.forEach(m => chatContent.push(createMemEl(m)));

                    const cDet = buildDetails(chatNode.name, 'comments', chatContent);
                    if (cDet) chatsWrapper.push(cDet);
                });
                
                if (chatsWrapper.length > 0) {
                    const cMainDet = buildDetails('Chats', 'folder', chatsWrapper);
                    if (cMainDet) nodeContent.push(cMainDet);
                }
            }
            
            const charDet = buildDetails(cNode.name, 'user', nodeContent, true);
            if (charDet) charContent.push(charDet);
        });
        
        const charsMainDet = buildDetails('Characters', 'users', charContent, true);
        if (charsMainDet) listEl.appendChild(charsMainDet);
    }
}

async function editMemoryDialog(id) {
    const mem = id ? getMemories()[id] : null;
    const isNew = !id;
    const result = await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'iv-dialog-overlay';
        
        const scopeOptions = [
            {val: 'global', text: 'Global (All chats)'},
            {val: 'character', text: 'Character (All chats with this character)'},
            {val: 'chat', text: 'Chat (This chat and its inner conversation)'}
        ];
        const currentScope = mem?.scope || 'character';

        const scopeHtml = scopeOptions.map(o => `<option value="${o.val}" ${currentScope === o.val ? 'selected' : ''}>${o.text}</option>`).join('');

        overlay.innerHTML = `<div class="iv-dialog-box">
<div class="iv-dialog-title">${isNew ? 'Add Memory' : 'Edit Memory'}</div>
<div class="iv-dialog-msg">Category / Key:</div>
<input type="text" class="iv-dialog-input" id="iv-mem-key-inp" placeholder="e.g. Preferences, About Me, Profession..." value="${escHtml(mem?.key || '')}">
<div class="iv-dialog-msg" style="margin-top:4px">Value:</div>
<textarea class="iv-dialog-input" id="iv-mem-val-inp" rows="3" placeholder="What to remember..." style="height:auto;resize:vertical;margin-bottom:10px;">${escHtml(mem?.value || '')}</textarea>
<div class="iv-dialog-msg" style="margin-top:4px">Scope:</div>
<select class="iv-dialog-input" id="iv-mem-scope-inp" style="margin-bottom:20px;">
${scopeHtml}
</select>
<div class="iv-dialog-btns">
<button class="iv-dialog-btn iv-dialog-cancel">Cancel</button>
<button class="iv-dialog-btn iv-dialog-ok">${isNew ? 'Add' : 'Save'}</button>
</div></div>`;
        document.body.appendChild(overlay);
        const keyInp = overlay.querySelector('#iv-mem-key-inp');
        const valInp = overlay.querySelector('#iv-mem-val-inp');
        const scopeInp = overlay.querySelector('#iv-mem-scope-inp');
        const okBtn = overlay.querySelector('.iv-dialog-ok');
        const cancelBtn = overlay.querySelector('.iv-dialog-cancel');
        const close = val => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 150); resolve(val); };
        keyInp.focus();
        okBtn.addEventListener('click', () => close({ key: keyInp.value, value: valInp.value, scope: scopeInp.value }));
        cancelBtn.addEventListener('click', () => close(null));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
        keyInp.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); valInp.focus(); } });
        requestAnimationFrame(() => overlay.classList.add('visible'));
    });
    
    if (!result?.key?.trim() || !result?.value?.trim()) return;

    _dbgAdd(isNew ? 'MEM_CREATE_MANUAL' : 'MEM_EDIT_MANUAL', { key: result.key, scope: result.scope });
    
    if (isNew) { addMemory(result.key, result.value, result.scope); }
    else { 
        const m = getMemories()[id];
        updateMemory(id, result.key, result.value);
        m.scope = result.scope; 
        const { charId, chatId } = getBindingKey();
        const ctx = SillyTavern.getContext();
        m.charId = charId;
        m.charName = ctx.characters?.[charId]?.name || charId;
        m.chatId = chatId;
        m.chatName = chatId;
        saveSettings();
    }
    renderMemoryList();
}

function setupMemorySettingsUI() {
    const s = getSettings();
    
    const bindCheck = (id, key) => {
        const el = document.getElementById(id); if (!el) return;
        const newEl = el.cloneNode(true); 
        el.parentNode.replaceChild(newEl, el);
        newEl.checked = !!s[key];
        newEl.addEventListener('change', () => {
            getSettings()[key] = newEl.checked;
            saveSettings();
            
            const stMap = {
                'memoryEnabled': 'iv-memory-enabled',
                'memoryInject': 'iv-memory-inject'
            };
            if (stMap[key]) {
                const stEl = document.getElementById(stMap[key]);
                if (stEl) stEl.checked = newEl.checked;
            }
        });
    };
    
    bindCheck('iv-sp-memory-enabled', 'memoryEnabled');
    bindCheck('iv-sp-memory-inject', 'memoryInject');
    bindCheck('iv-sp-memory-notify', 'memoryNotify');

    const promptEl = document.getElementById('iv-sp-memory-prompt');
    if (promptEl) {
        promptEl.value = s.memoryManagePrompt || DEFAULT_MEMORY_PROMPT;
        const newPromptEl = promptEl.cloneNode(true);
        promptEl.parentNode.replaceChild(newPromptEl, promptEl);
        newPromptEl.addEventListener('input', () => {
            getSettings().memoryManagePrompt = newPromptEl.value;
            saveSettings();
            const stEl = document.getElementById('iv-memory-prompt');
            if (stEl) stEl.value = newPromptEl.value;
        });
    }

    const resetBtn = document.getElementById('iv-sp-reset-memory-prompt');
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
        newResetBtn.addEventListener('click', async () => {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset memory prompt to default?' });
            if (!ok) return;
            getSettings().memoryManagePrompt = DEFAULT_MEMORY_PROMPT;
            saveSettings();
            const el = document.getElementById('iv-sp-memory-prompt'); if (el) el.value = DEFAULT_MEMORY_PROMPT;
            const stEl = document.getElementById('iv-memory-prompt'); if (stEl) stEl.value = DEFAULT_MEMORY_PROMPT;
            toastr.success('Prompt reset.', EXT_DISPLAY);
        });
    }

    const addBtn = document.getElementById('iv-sp-memory-add-btn');
    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', async () => {
            await editMemoryDialog(null);
        });
    }
    
    const clearBtn = document.getElementById('iv-sp-memory-clear-all');
    if (clearBtn) {
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
        newClearBtn.addEventListener('click', async () => {
            const count = Object.keys(getMemories()).length;
            if (!count) { toastr.info('No memories to clear.', EXT_DISPLAY); return; }
            const ok = await showCustomDialog({ type: 'confirm', title: 'Clear All Memories', message: `Delete all ${count} stored memories? This cannot be undone.`, delayConfirm: 2 });
            if (!ok) return;
            clearAllMemories();
            renderMemoryList();
            toastr.success('All memories cleared.', EXT_DISPLAY);
        });
    }

    renderMemoryList();
    updateMemoryDot();
}

var featureMemory = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addMemory: addMemory,
    buildMemoryAIInstructions: buildMemoryAIInstructions,
    buildMemoryContextBlock: buildMemoryContextBlock,
    clearAllMemories: clearAllMemories,
    deleteMemory: deleteMemory,
    editMemoryDialog: editMemoryDialog,
    genMemoryId: genMemoryId,
    getMemories: getMemories,
    getVisibleMemories: getVisibleMemories,
    parseMemoryBlockFromText: parseMemoryBlockFromText,
    processMemoryUpdates: processMemoryUpdates,
    renderMemoryList: renderMemoryList,
    setupMemorySettingsUI: setupMemorySettingsUI,
    showMemoryToast: showMemoryToast,
    stripMemoryBlock: stripMemoryBlock,
    updateMemory: updateMemory,
    updateMemoryDot: updateMemoryDot
});

function getEnabledTools() {
    const s = getSettings();
    if (!s.toolsEnabled) return [];
    return TOOL_DEFINITIONS.filter(t => s[t.settingKey] !== false);
}

async function executeTool(toolName, toolInput) {
    const ctx = SillyTavern.getContext();
    switch (toolName) {
        case 'search_chat': {
            const msgs = ctx.chat || [];
            let rawQueries = Array.isArray(toolInput.queries) ? toolInput.queries : (Array.isArray(toolInput.query) ? toolInput.query : [toolInput.query || '']);
            const parsedQueries = rawQueries.map(q => {
                const s = String(q);
                const regexMatch = s.match(/^\/(.+)\/([gimsuy]*)$/);
                if (regexMatch) {
                    try { return { type: 'regex', re: new RegExp(regexMatch[1], regexMatch[2]) }; } catch(_) {}
                }
                return { type: 'text', lq: s.toLowerCase() };
            });
            const role = toolInput.role || 'all';
            const fromIdx = toolInput.from_index ?? 0;
            const toIdx = toolInput.to_index ?? msgs.length - 1;
            const maxResults = Math.min(toolInput.max_results ?? 10, 50);
            const includeContent = toolInput.include_content !== false;
            
            const results = [];
            for (let i = Math.max(0, fromIdx); i <= Math.min(msgs.length - 1, toIdx); i++) {
                const m = msgs[i];
                if (role === 'user' && !m.is_user) continue;
                if (role === 'assistant' && m.is_user) continue;
                const text = m.mes || '';
                
                let matched = false;
                for (const pq of parsedQueries) {
                    if (pq.type === 'regex' && pq.re) {
                        pq.re.lastIndex = 0;
                        if (pq.re.test(text)) { matched = true; break; }
                    } else {
                        if (text.toLowerCase().includes(pq.lq)) { matched = true; break; }
                        const tokens = pq.lq.split(/\s+/).filter(Boolean);
                        if (tokens.length > 1 && tokens.every(t => text.toLowerCase().includes(t))) { matched = true; break; }
                    }
                }
                
                if (matched) {
                    const entry = { index: i, role: m.is_user ? 'user' : 'assistant', name: m.name || (m.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character')) };
                    if (includeContent) entry.content = text.length > 500 ? text.slice(0, 500) + '...[truncated]' : text;
                    results.push(entry);
                    if (results.length >= maxResults) break;
                }
            }
            return { found: results.length, results, note: `Total messages searched: ${Math.min(msgs.length - 1, toIdx) - Math.max(0, fromIdx) + 1}` };
        }
        case 'ask_user': {
            return { __ask_user: true, question: toolInput.question, context: toolInput.context };
        }
        case 'get_chat_stats': {
            const msgs = ctx.chat || [];
            const userMsgs = msgs.filter(m => m.is_user);
            const asMsgs = msgs.filter(m => !m.is_user);
            const totalChars = msgs.reduce((s, m) => s + (m.mes || '').length, 0);
            return {
                total_messages: msgs.length,
                user_messages: userMsgs.length,
                assistant_messages: asMsgs.length,
                approx_tokens: Math.ceil(totalChars / 3.5),
                first_message_index: 0,
                last_message_index: msgs.length - 1,
                char_name: ctx.name2 || 'Character',
                user_name: ctx.name1 || 'User',
            };
        }
        case 'get_recent_messages': {
            const msgs = ctx.chat || [];
            const count = Math.min(toolInput.count ?? 10, 50);
            const fromEnd = toolInput.from_end !== false;
            const role = toolInput.role || 'all';
            let filtered = msgs.map((m, i) => ({ ...m, _idx: i }));
            if (role === 'user') filtered = filtered.filter(m => m.is_user);
            if (role === 'assistant') filtered = filtered.filter(m => !m.is_user);
            if (fromEnd) filtered = filtered.slice(-count);
            else filtered = filtered.slice(0, count);
            return {
                messages: filtered.map(m => ({
                    index: m._idx,
                    role: m.is_user ? 'user' : 'assistant',
                    name: m.name || (m.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character')),
                    content: (m.mes || '').length > 600 ? m.mes.slice(0, 600) + '...[truncated]' : (m.mes || ''),
                })),
                            };
        }
        default: return { error: `Unknown tool: ${toolName}` };
    }
}

function parseToolCallsFromText(text) {
    const results = [];
    const re = /```tool_call\n?([\s\S]*?)(?:```|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const rawBlock = m[1].trim();
        if (!rawBlock) continue;

        let extracted = [];

        try {
            const parsed = JSON.parse(rawBlock);
            if (Array.isArray(parsed)) {
                extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
            } else if (parsed && parsed.name) {
                extracted.push({ name: parsed.name, input: parsed.input || {} });
            }
        } catch (_) {}

        if (!extracted.length) {
            try {
                const fixedRaw = '[' + rawBlock.replace(/}\s*{/g, '},{') + ']';
                const parsed = JSON.parse(fixedRaw);
                if (Array.isArray(parsed)) {
                    extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
                }
            } catch (_) {}
        }

        if (!extracted.length) {
            const lines = rawBlock.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed && parsed.name) {
                        extracted.push({ name: parsed.name, input: parsed.input || {} });
                    }
                } catch (_) {}
            }
        }

        if (!extracted.length) {
            const nameMatch = rawBlock.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch) {
                extracted.push({ name: nameMatch[1], input: {} });
            } else {
                extracted.push({ name: 'parsing...', input: {} });
            }
        }

        results.push(...extracted);
    }
    return results;
}

function buildToolCallsSystemBlock() {
    const tools = getEnabledTools();
    if (!tools.length) return '';
    const s = getSettings();
    
    const formatSchemaProps = (properties) => {
        if (!properties || Object.keys(properties).length === 0) return '{}';
        const lines = [];
        for (const [key, prop] of Object.entries(properties)) {
            lines.push(`"${key}": ${JSON.stringify(prop)}`);
        }
        return `{${lines.join(',\n    ')}}`;
    };

    const toolsList = tools.map(t =>
        `- **${t.name}**: ${t.description} | Params: ${formatSchemaProps(t.schema.properties)}`
    ).join("\n");
    
    let prompt = s.toolsSystemPrompt || DEFAULT_TOOLS_PROMPT;
    if (!prompt.includes('{{tools_list}}')) {
        prompt += '\n\nTools available:\n{{tools_list}}';
    }
    if (!prompt.includes('{{tool_call_format}}')) {
        prompt = prompt.replace('Format requirement:', 'Format requirement:\n{{tool_call_format}}');
    }
    
    const finalPrompt = prompt
        .replace('{{tools_list}}', toolsList)
        .replace('{{tool_call_format}}', TOOL_CALL_FORMAT_BLOCK);
        
    return '\n\n' + _ensureWrapped(finalPrompt, 'tool_calls_system');
}

function _parseRgba(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    const h = str.match(/^#([0-9a-f]{3,8})$/i);
    if (h) {
        let hex = h[1];
        if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
        if (hex.length < 6) return null;
        return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: hex.length === 8 ? parseInt(hex.slice(6,8),16)/255 : 1 };
    }
    return null;
}

function _rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
}

function _toRgbaStr(r, g, b, a) {
    const ri = Math.round(Math.max(0,Math.min(255,r)));
    const gi = Math.round(Math.max(0,Math.min(255,g)));
    const bi = Math.round(Math.max(0,Math.min(255,b)));
    const ai = Math.round(Math.max(0,Math.min(1,a))*100)/100;
    return ai >= 1 ? `rgb(${ri},${gi},${bi})` : `rgba(${ri},${gi},${bi},${ai})`;
}

let _activeColorPop = null;

function showColorPicker(anchorEl, initialVal, onChange) {
    if (_activeColorPop) { _activeColorPop.remove(); _activeColorPop = null; }
    const parsed = _parseRgba(initialVal);
    const hexVal = parsed ? _rgbToHex(parsed.r, parsed.g, parsed.b) : '#7c6dfa';
    const alphaVal = parsed ? Math.round(parsed.a * 100) : 100;

    const settingsOverlay = anchorEl.closest('#iv-settings-overlay');
    if (settingsOverlay) {
        settingsOverlay.style.opacity = '0';
        settingsOverlay.style.pointerEvents = 'none';
    }

    const pop = document.createElement('div');
    pop.className = 'iv-color-pop';
    pop.innerHTML = `
        <div class="iv-color-pop-row">
            <input type="color" class="iv-color-pop-wheel" value="${hexVal}">
            <div class="iv-color-pop-alpha-col">
                <span class="iv-color-pop-alpha-label">Alpha</span>
                <input type="range" class="iv-slider iv-color-pop-alpha" min="0" max="100" value="${alphaVal}">
                <span class="iv-color-pop-alpha-val">${alphaVal}%</span>
            </div>
        </div>
        <input type="text" class="iv-color-pop-text text_pole" value="${escHtml(initialVal)}">
    `;
    document.body.appendChild(pop);
    _activeColorPop = pop;

    const rect = anchorEl.getBoundingClientRect();
    pop.style.cssText += `position:fixed;z-index:999999;left:${rect.left}px;top:${rect.bottom + 6}px`;
    requestAnimationFrame(() => {
        const pr = pop.getBoundingClientRect();
        if (pr.right > window.innerWidth - 8) pop.style.left = `${window.innerWidth - pr.width - 8}px`;
        if (pr.bottom > window.innerHeight - 8) pop.style.top = `${rect.top - pr.height - 6}px`;
    });

    const wheel = pop.querySelector('.iv-color-pop-wheel');
    const alpha = pop.querySelector('.iv-color-pop-alpha');
    const alphaValEl = pop.querySelector('.iv-color-pop-alpha-val');
    const textEl = pop.querySelector('.iv-color-pop-text');

    let _emitPending = false;
    const buildVal = () => {
        const hex = wheel.value;
        const a = parseInt(alpha.value) / 100;
        return _toRgbaStr(parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16), a);
    };
    const emit = () => {
        if (_emitPending) return;
        _emitPending = true;
        requestAnimationFrame(() => {
            _emitPending = false;
            const val = buildVal();
            textEl.value = val;
            onChange(val);
        });
    };

    wheel.addEventListener('input', emit);
    alpha.addEventListener('input', () => { alphaValEl.textContent = `${alpha.value}%`; emit(); });
    textEl.addEventListener('input', () => {
        const p = _parseRgba(textEl.value);
        if (p) {
            wheel.value = _rgbToHex(p.r, p.g, p.b);
            alpha.value = Math.round(p.a * 100);
            alphaValEl.textContent = `${alpha.value}%`;
            onChange(textEl.value);
        }
    });

    const onOutside = e => {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
            pop.remove(); _activeColorPop = null;
            if (settingsOverlay) {
                settingsOverlay.style.opacity = '';
                settingsOverlay.style.pointerEvents = '';
            }
            document.removeEventListener('mousedown', onOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
}

// ─── Settings Registry ────────────────────────────────────────────────────────
//
// FIELDS:
//   key             — key in the settings object
//   stId            — element id in the ST-drawer (null if none)
//   spId            — element id in the overlay (null if none)
//   type            — 'checkbox' | 'input' | 'textarea' | 'select' | 'slider'
//   toVal           — transforms el.value before saving (optional)
//   fromSetting     — s => val, how to read from settings for display (optional)
//   stValId/spValId — ID of the display span for sliders
//   valFmt          — v => string, formatting for slider values
//   onChange        — (val) => void, side effect after saving
//   updCtx          — update token counter
//   profileKey      — include in configuration profiles

const _SETTINGS_DEF = [
    // ── General ──────────────────────────────────────────────────────────────
    { key: 'enabled', stId: 'iv-enabled', spId: 'iv-sp-enabled', type: 'checkbox',
      onChange: val => {
          const btn = document.getElementById('iv-wand-btn');
          if (btn) btn.style.display = val ? '' : 'none';
          if (!val) Promise.resolve().then(function () { return uiWindow; }).then(m => m.hideWindow());
          Promise.resolve().then(function () { return uiWindow; }).then(m => {
              m.updateIconVisibility(document.getElementById('iv-dock-icon'));
              m.setupHotkey();
          });
      }
    },
    { key: 'hotkeyEnabled',        stId: 'iv-hotkey-enabled',        spId: 'iv-sp-hotkey-enabled',        type: 'checkbox' },
    { key: 'hotkey',               stId: 'iv-hotkey',                spId: 'iv-sp-hotkey',                type: 'input',
      onChange: () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.setupHotkey()) },
    { key: 'searchHotkeyEnabled',  stId: 'iv-search-hotkey-enabled', spId: 'iv-sp-search-hotkey-enabled', type: 'checkbox',
      onChange: () => Promise.resolve().then(function () { return uiChat; }).then(m => m.setupSearchHotkey()) },
    { key: 'searchHotkey',         stId: 'iv-search-hotkey',         spId: 'iv-sp-search-hotkey',         type: 'input',
      onChange: () => Promise.resolve().then(function () { return uiChat; }).then(m => m.setupSearchHotkey()) },
    { key: 'floatingIconPersistent', stId: 'iv-icon-persistent', spId: 'iv-sp-icon-persistent', type: 'checkbox',
      onChange: () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.updateIconVisibility(document.getElementById('iv-dock-icon'))) },
    { key: 'wobbleWindow',   stId: 'iv-wobble-window',  spId: 'iv-sp-wobble-window', type: 'checkbox', fromSetting: s => s.wobbleWindow !== false },
    { key: 'performanceMode', stId: 'iv-perf-mode', spId: 'iv-sp-perf-mode', type: 'checkbox',
      onChange: () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default)) },
    { key: 'ghostModeHotkeyEnabled', stId: 'iv-ghost-hotkey-enabled', spId: 'iv-sp-ghost-hotkey-enabled', type: 'checkbox',
      onChange: () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.setupGhostHotkey()) },
    { key: 'ghostModeHotkey', stId: 'iv-ghost-hotkey', spId: 'iv-sp-ghost-hotkey', type: 'input',
      onChange: () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.setupGhostHotkey()) },
    { key: 'changelogAutoShow',    stId: null, spId: 'iv-sp-changelog-auto', type: 'checkbox' },
    { key: 'includeSummaryception', stId: 'iv-include-summaryception', spId: 'iv-sp-include-summaryception', type: 'checkbox', fromSetting: s => s.includeSummaryception !== false },
    { key: 'useAspectEvolutia',    stId: 'iv-use-aspect-evolutia',    spId: 'iv-sp-use-aspect-evolutia',    type: 'checkbox', fromSetting: s => s.useAspectEvolutia !== false },
    { key: 'autoExpandMacros',     stId: 'iv-auto-expand-macros',     spId: 'iv-sp-auto-expand-macros',     type: 'checkbox' },
    { key: 'includeHiddenMessages', stId: 'iv-include-hidden-msgs',   spId: 'iv-sp-include-hidden-msgs',    type: 'checkbox', updCtx: true },
    { key: 'completionSoundOnlyWhenUnfocused', stId: 'iv-sound-unfocused', spId: 'iv-sp-sound-unfocused',  type: 'checkbox' },

    // ── Sliders ───────────────────────────────────────────────────────────────
    { key: 'opacity', stId: 'iv-opacity-slider', spId: 'iv-sp-opacity-slider', type: 'slider', toVal: Number,
      stValId: 'iv-opacity-val', spValId: 'iv-sp-opacity-val', valFmt: v => `${v}%`,
      onChange: val => { const w = document.getElementById('iv-window'); if (w && !state.ghostModeActive) w.style.opacity = (val / 100).toString(); } },
    { key: 'ghostModeOpacity', stId: 'iv-ghost-opacity', spId: 'iv-sp-ghost-opacity', type: 'slider', toVal: Number,
      stValId: 'iv-ghost-opacity-val', spValId: 'iv-sp-ghost-opacity-val', valFmt: v => `${v}%`,
      onChange: val => { const w = document.getElementById('iv-window'); if (w && state.ghostModeActive) w.style.opacity = (val / 100).toString(); } },

    // ── Connection ────────────────────────────────────────────────────────────
    { key: 'connectionSource',  stId: 'iv-conn-source',  spId: 'iv-sp-conn-source',  type: 'select', profileKey: true, onChange: _applyConnectionSourceVisibility },
    { key: 'connectionProfileId', stId: 'iv-conn-profile', spId: 'iv-sp-conn-profile', type: 'select', profileKey: true },
    { key: 'customUrl',   stId: 'iv-custom-url',   spId: 'iv-sp-custom-url',   type: 'input', profileKey: true },
    { key: 'customKey',   stId: 'iv-custom-key',   spId: 'iv-sp-custom-key',   type: 'input', profileKey: true },
    { key: 'customModel', stId: 'iv-custom-model', spId: 'iv-sp-custom-model', type: 'input', profileKey: true },
    { key: 'maxTokens',   stId: 'iv-max-tokens',   spId: 'iv-sp-max-tokens',   type: 'input', toVal: Number, profileKey: true },

    // ── Context ───────────────────────────────────────────────────────────────
    { key: 'contextDepth', stId: 'iv-depth-slider', spId: 'iv-sp-depth-slider', type: 'slider', toVal: Number,
      stValId: 'iv-depth-val', spValId: 'iv-sp-depth-val', updCtx: true, profileKey: true },
    { key: 'exchangeDepth', stId: 'iv-exchange-depth', spId: 'iv-sp-exchange-depth', type: 'input',
      toVal: v => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(0, n) : 1; },
      onChange: () => Promise.resolve().then(function () { return simulationView; }).then(m => m.syncSimulationView()) },
    { key: 'portrayStyle', stId: 'iv-portray-style', spId: 'iv-sp-portray-style', type: 'select',
      onChange: () => Promise.resolve().then(function () { return portray; }).then(m => m.syncFireTimePortrayForm()) },
    { key: 'portrayPerson', stId: 'iv-portray-person', spId: 'iv-sp-portray-person', type: 'select',
      onChange: () => Promise.resolve().then(function () { return portray; }).then(m => m.syncFireTimePortrayForm()) },
    { key: 'portrayImmediateSend', stId: 'iv-portray-immediate-send', spId: 'iv-sp-portray-immediate-send', type: 'checkbox' },
    { key: 'portrayAutoTrigger', stId: 'iv-portray-auto-trigger', spId: 'iv-sp-portray-auto-trigger', type: 'checkbox' },
    { key: 'portrayPrompt', stId: 'iv-portray-prompt', spId: 'iv-sp-portray-prompt', type: 'textarea', profileKey: true,
      fromSetting: s => s.portrayPrompt || DEFAULT_PORTRAY_PROMPT },
    { key: 'localHistoryLimit',   stId: 'iv-history-limit',    spId: 'iv-sp-history-limit',    type: 'input',    toVal: Number, updCtx: true, profileKey: true },
    { key: 'includeSystemPrompt', stId: 'iv-include-sysprompt', spId: 'iv-sp-include-sysprompt', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'includeUserPersonality', stId: 'iv-include-persona', spId: 'iv-sp-include-persona', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'includeAlternateSwipes', stId: 'iv-include-alt-swipes', spId: 'iv-sp-include-alt-swipes', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'applyRegexToContext', stId: 'iv-apply-regex', spId: 'iv-sp-apply-regex', type: 'checkbox', updCtx: true, profileKey: true },
    { key: 'reasoningTrimStrings', stId: 'iv-reasoning-trim', spId: 'iv-sp-reasoning-trim', type: 'textarea', profileKey: true },
    { key: 'postHistoryText', stId: 'iv-post-history-text', spId: 'iv-sp-post-history-text', type: 'textarea', updCtx: true },
    { key: 'postHistoryRole', stId: 'iv-post-history-role', spId: 'iv-sp-post-history-role', type: 'select',
      fromSetting: s => (s.postHistoryRole === 'system' || s.postHistoryRole === 'assistant') ? s.postHistoryRole : 'user',
      updCtx: true },

    // ── Prompts ───────────────────────────────────────────────────────────────
    { key: 'systemPrompt', stId: 'iv-sysprompt', spId: 'iv-sp-sysprompt', type: 'textarea', updCtx: true, profileKey: true,
      fromSetting: s => s.systemPrompt || DEFAULT_SYSTEM_PROMPT },

    // ── Memory ────────────────────────────────────────────────────────────────
    { key: 'memoryEnabled',      stId: 'iv-memory-enabled', spId: 'iv-sp-memory-enabled', type: 'checkbox', updCtx: true },
    { key: 'memoryInject',       stId: 'iv-memory-inject',  spId: 'iv-sp-memory-inject',  type: 'checkbox', updCtx: true },
    { key: 'memoryNotify',       stId: null,                 spId: 'iv-sp-memory-notify',  type: 'checkbox' },
    { key: 'memoryManagePrompt', stId: 'iv-memory-prompt',  spId: 'iv-sp-memory-prompt',  type: 'textarea', updCtx: true,
      fromSetting: s => s.memoryManagePrompt || DEFAULT_MEMORY_PROMPT },

    // ── Tools ─────────────────────────────────────────────────────────────────
    { key: 'toolsEnabled', stId: 'iv-tools-enabled', spId: 'iv-sp-tools-enabled', type: 'checkbox', updCtx: true },

    // ── Misc ──────────────────────────────────────────────────────────────────
    { key: 'pickerPreviewLines',     stId: 'iv-picker-lines',      spId: 'iv-sp-picker-lines',      type: 'input', toVal: v => parseInt(v) || 1 },
    { key: 'pickerPreviewLastLines', stId: 'iv-picker-last-lines', spId: 'iv-sp-picker-last-lines', type: 'input', toVal: v => parseInt(v) || 0 },
];

// Mapping override keys to elements (for the override reset button)
const _OV_EL_MAP = {
    contextDepth: ['iv-sp-ov-depth-slider', 'iv-sp-ov-depth-val'],
    maxTokens: ['iv-sp-ov-max-tokens'],           localHistoryLimit: ['iv-sp-ov-history-limit'],
    reasoningTrimStrings: ['iv-sp-ov-reasoning-trim'], systemPrompt: ['iv-sp-ov-sysprompt'],
    connectionSource: ['iv-sp-ov-conn-source'],   customUrl: ['iv-sp-ov-custom-url'],
    customKey: ['iv-sp-ov-custom-key'],           customModel: ['iv-sp-ov-custom-model'],
    connectionProfileId: ['iv-sp-ov-conn-profile'],
    includeSystemPrompt: ['iv-sp-ov-include-sysprompt'], includeUserPersonality: ['iv-sp-ov-include-persona'],
    includeAlternateSwipes: ['iv-sp-ov-include-alt-swipes'], applyRegexToContext: ['iv-sp-ov-apply-regex'],
    forceStreaming: [],
};

// Profile keys
const _PROFILE_KEYS = _SETTINGS_DEF.filter(d => d.profileKey).map(d => d.key);

// ─── Configuration Profiles ───────────────────────────────────────────────────

let _profileSnapshot = null;

function _takeProfileSnapshot() {
    const s = getSettings();
    _profileSnapshot = {};
    for (const k of _PROFILE_KEYS) _profileSnapshot[k] = JSON.stringify(s[k]);
}

function isConfigProfileDirty() {
    if (!_profileSnapshot) return false;
    const s = getSettings();
    for (const k of _PROFILE_KEYS) { if (JSON.stringify(s[k]) !== _profileSnapshot[k]) return true; }
    return false;
}

function _markDirty(type) {
    if (type === 'config') state.configDirty = isConfigProfileDirty();
    if (type === 'theme') state.themeDirty = isThemeDirty();
    _updateDirtyDots();
}

function _clearDirty(type) {
    if (type === 'config') { state.configDirty = false; _takeProfileSnapshot(); }
    if (type === 'theme') state.themeDirty = false;
    _updateDirtyDots();
}

function _updateDirtyDots() {
    const dot = '<span class="iv-save-dirty-dot"></span>';
    ['iv-profile-save', 'iv-sp-profile-save'].forEach(id => {
        const btn = document.getElementById(id); if (!btn) return;
        btn.querySelectorAll('.iv-save-dirty-dot').forEach(d => d.remove());
        if (state.configDirty) btn.insertAdjacentHTML('beforeend', dot);
    });
    document.querySelectorAll('#iv-theme-save').forEach(btn => {
        btn.querySelectorAll('.iv-save-dirty-dot').forEach(d => d.remove());
        if (state.themeDirty) btn.insertAdjacentHTML('beforeend', dot);
    });
}

function saveProfile(name) {
    const s = getSettings(); const p = {};
    for (const k of _PROFILE_KEYS) p[k] = s[k];
    s.profiles[name] = p; s.activeProfile = name; saveSettings();
}

function loadProfile(name) {
    const s = getSettings(); const p = s.profiles[name]; if (!p) return;
    for (const k of _PROFILE_KEYS) { if (p[k] !== undefined) s[k] = p[k]; }
    s.activeProfile = name; saveSettings();
    if (typeof updateSettingsUI === 'function') updateSettingsUI();
    _takeProfileSnapshot(); state.configDirty = false; _updateDirtyDots();
    _pruneMatchingOverrides();
}

function deleteProfile(name) {
    const s = getSettings(); delete s.profiles[name];
    if (s.activeProfile === name) s.activeProfile = '';
    for (const k in s.profileBindings) { if (s.profileBindings[k] === name) delete s.profileBindings[k]; }
    saveSettings();
}

function refreshProfilesDropdown() {
    const sel = document.getElementById('iv-profile-select'); if (!sel) return;
    const s = getSettings();
    if (!Object.keys(s.profiles).length) {
        s.profiles['Default'] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        s.activeProfile = 'Default'; saveSettings();
    }
    sel.innerHTML = ''; let hasActive = false;
    for (const name of Object.keys(s.profiles)) {
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        if (name === s.activeProfile) { opt.selected = true; hasActive = true; }
        sel.appendChild(opt);
    }
    if (!hasActive && Object.keys(s.profiles).length > 0) { loadProfile(Object.keys(s.profiles)[0]); sel.value = Object.keys(s.profiles)[0]; }
    updateBindingSection();
}

function updateBindingSection() {
    const sel = document.getElementById('iv-profile-select');
    const section = document.getElementById('iv-binding-section');
    if (!section) return;
    section.style.display = sel?.value ? '' : 'none'; if (!sel?.value) return;
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    document.getElementById('iv-bind-char')?.classList.toggle('active', s.profileBindings[`char_${charId}`] === sel.value);
    document.getElementById('iv-bind-chat')?.classList.toggle('active', s.profileBindings[`chat_${charId}_${chatId}`] === sel.value);
}

function autoLoadBoundProfile() {
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    const name = s.profileBindings[`chat_${charId}_${chatId}`] || s.profileBindings[`char_${charId}`];
    if (name && s.profiles[name]) { loadProfile(name); const sel = document.getElementById('iv-profile-select'); if (sel) sel.value = name; }
    else if (name && !s.profiles[name]) _dbgAdd('PROFILE_LOAD_BINDING_MISSING', { name });
}

async function updateProfilesList() {
    const profSel = document.getElementById('iv-conn-profile'); if (!profSel) return;
    const ctx = SillyTavern.getContext(); const s = getSettings(); let currentVal = s.connectionProfileId || '';
    const service = ctx.ConnectionManagerRequestService;
    let profiles = service?.getSupportedProfiles?.() ?? ctx.extensionSettings?.connectionManager?.profiles ?? [];
    if (currentVal && !profiles.some(p => p.id === currentVal)) {
        _dbgAdd('PROFILE_GHOST_CLEANUP', { removedId: currentVal });
        s.connectionProfileId = ''; saveSettings(); currentVal = '';
    }
    if (service?.handleDropdown) { service.handleDropdown(profSel); if (currentVal && Array.from(profSel.options).some(o => o.value === currentVal)) profSel.value = currentVal; return; }
    profSel.innerHTML = '<option value="">-- Select Profile --</option>';
    profiles.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; profSel.appendChild(o); });
    if (Array.from(profSel.options).some(o => o.value === currentVal)) profSel.value = currentVal;
}

async function updateSPConnProfileList() {
    const selIds = ['iv-sp-conn-profile', 'iv-sp-ov-conn-profile'];
    const s = getSettings(); const eff = getEffectiveSettings();
    const ctx = SillyTavern.getContext(); const service = ctx.ConnectionManagerRequestService;
    let profiles = service?.getSupportedProfiles?.() ?? ctx.extensionSettings?.connectionManager?.profiles ?? [];
    selIds.forEach(sid => {
        const sel = document.getElementById(sid); if (!sel) return;
        const isOv = sid === 'iv-sp-ov-conn-profile';
        let targetVal = isOv ? (eff.connectionProfileId || '') : (s.connectionProfileId || '');
        if (targetVal && !profiles.some(p => p.id === targetVal)) {
            if (isOv) setConversationOverride('connectionProfileId', undefined); else { s.connectionProfileId = ''; saveSettings(); }
            targetVal = '';
        }
        sel.innerHTML = '<option value="">-- Select Profile --</option>';
        profiles.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
        if (Array.from(sel.options).some(o => o.value === targetVal)) sel.value = targetVal;
    });
}

function refreshSPProfilesDropdown() {
    const sel = document.getElementById('iv-sp-profile-select'); if (!sel) return;
    const s = getSettings();
    if (!Object.keys(s.profiles).length) {
        s.profiles['Default'] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        s.activeProfile = 'Default'; saveSettings();
    }
    sel.innerHTML = '';
    for (const name of Object.keys(s.profiles)) {
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        if (name === s.activeProfile) opt.selected = true;
        sel.appendChild(opt);
    }
    updateSPBindingSection();
}

function updateSPBindingSection() {
    const sel = document.getElementById('iv-sp-profile-select');
    const section = document.getElementById('iv-sp-binding-section');
    if (!section) return;
    section.style.display = sel?.value ? '' : 'none'; if (!sel?.value) return;
    const s = getSettings(); const { charId, chatId } = getBindingKey();
    document.getElementById('iv-sp-bind-char')?.classList.toggle('active', s.profileBindings[`char_${charId}`] === sel.value);
    document.getElementById('iv-sp-bind-chat')?.classList.toggle('active', s.profileBindings[`chat_${charId}_${chatId}`] === sel.value);
}

// ─── Theme Editor ─────────────────────────────────────────────────────────────

const _COLOR_KEYS = new Set(['bg','text','textMuted','accent','accentDim','accentBg','headerBg','toolbarBg','msgUserBg','msgAiBg','inputBg','codeBg','danger','success']);

function isThemeDirty() {
    const s = getSettings(); const current = s.customTheme || {};
    if (s.activeThemeProfile && s.savedThemes[s.activeThemeProfile]) {
        const saved = s.savedThemes[s.activeThemeProfile];
        return THEME_VAR_DEFS.some(def => (current[def.key] || '') !== (saved[def.key] || ''));
    }
    for (const preset of Object.values(THEME_PRESETS)) {
        if (THEME_VAR_DEFS.every(def => (current[def.key] || '') === (preset[def.key] || ''))) return false;
    }
    return true;
}

function buildThemeEditor(containerOverride) {
    const container = containerOverride || document.getElementById('iv-theme-section'); if (!container) return;
    container.innerHTML = '';
    const s = getSettings();
    if (!s.savedThemes || !Object.keys(s.savedThemes).length) {
        s.savedThemes = { 'Default': { ...THEME_PRESETS.default } }; s.activeThemeProfile = 'Default';
        s.customTheme = { ...s.savedThemes['Default'] }; saveSettings();
    }
    const profileRow = document.createElement('div'); profileRow.className = 'iv-profile-bar'; profileRow.style.marginBottom = '12px';
    profileRow.innerHTML = `
        <select id="iv-theme-profile-select"></select>
        <button class="iv-profile-icon-btn" id="iv-theme-save" title="Save current theme"><i class="fa-solid fa-floppy-disk"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-create" title="Create new theme"><i class="fa-solid fa-plus"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-duplicate" title="Duplicate theme"><i class="fa-solid fa-copy"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-rename" title="Rename theme"><i class="fa-solid fa-pen"></i></button>
        <button class="iv-profile-icon-btn danger" id="iv-theme-delete" title="Delete theme"><i class="fa-solid fa-trash"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-export" title="Export theme"><i class="fa-solid fa-file-export"></i></button>
        <button class="iv-profile-icon-btn" id="iv-theme-import" title="Import theme"><i class="fa-solid fa-file-import"></i></button>`;
    container.appendChild(profileRow);
    const sel = profileRow.querySelector('#iv-theme-profile-select');
    const optGrpDefault = document.createElement('optgroup'); optGrpDefault.label = 'Default Presets';
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
        const opt = document.createElement('option'); opt.value = `__preset__${key}`; opt.textContent = preset.label; optGrpDefault.appendChild(opt);
    }
    sel.appendChild(optGrpDefault);
    const userKeys = Object.keys(s.savedThemes);
    if (userKeys.length) {
        const optGrpCustom = document.createElement('optgroup'); optGrpCustom.label = 'Custom Themes';
        for (const name of userKeys) {
            const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
            if (name === s.activeThemeProfile) opt.selected = true;
            optGrpCustom.appendChild(opt);
        }
        sel.appendChild(optGrpCustom);
    }
    if (!s.activeThemeProfile || !s.savedThemes[s.activeThemeProfile]) {
        const matchKey = Object.keys(THEME_PRESETS).find(k => THEME_VAR_DEFS.every(d => (s.customTheme?.[d.key] || '') === (THEME_PRESETS[k][d.key] || '')));
        if (matchKey) sel.value = `__preset__${matchKey}`;
    }
    sel.addEventListener('change', async () => {
        const name = sel.value;
        if (isThemeDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Changes', message: 'You have unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = s.activeThemeProfile ? s.activeThemeProfile : sel.value; return; }
        }
        const s2 = getSettings();
        if (name.startsWith('__preset__')) {
            s2.customTheme = { ...THEME_PRESETS[name.replace('__preset__', '')] }; s2.activeThemeProfile = '';
        } else if (s2.savedThemes[name]) {
            s2.customTheme = { ...s2.savedThemes[name] }; s2.activeThemeProfile = name;
        }
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride);
    });
    profileRow.querySelector('#iv-theme-save').addEventListener('click', async () => {
        const val = sel.value;
        if (val.startsWith('__preset__')) {
            const name = await showCustomDialog({ type: 'prompt', title: 'Save as Custom Theme', message: 'Name for your custom theme:', placeholder: 'My Theme' });
            if (!name?.trim()) return;
            const s2 = getSettings(); s2.savedThemes[name.trim()] = { ...s2.customTheme }; s2.activeThemeProfile = name.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success(`Theme "${name.trim()}" saved`, EXT_DISPLAY); _clearDirty('theme');
        } else if (val) {
            const s2 = getSettings(); s2.savedThemes[val] = { ...s2.customTheme }; saveSettings(); toastr.success(`Theme "${val}" updated`, EXT_DISPLAY); _clearDirty('theme');
        }
    });
    profileRow.querySelector('#iv-theme-create').addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Theme', message: 'Enter name for new theme:', placeholder: 'My New Theme' });
        if (!name?.trim()) return;
        const s2 = getSettings(); s2.savedThemes[name.trim()] = { ...s2.customTheme }; s2.activeThemeProfile = name.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success(`Created theme "${name.trim()}"`, EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-duplicate').addEventListener('click', async () => {
        const val = sel.value; if (!val) return;
        const baseTheme = val.startsWith('__preset__') ? THEME_PRESETS[val.replace('__preset__', '')] : s.savedThemes[val]; if (!baseTheme) return;
        const defaultName = (val.startsWith('__preset__') ? THEME_PRESETS[val.replace('__preset__', '')].label : val) + ' (Copy)';
        const name = await showCustomDialog({ type: 'prompt', title: 'Duplicate Theme', message: 'Name for the duplicated theme:', defaultValue: defaultName });
        if (!name?.trim()) return;
        const s2 = getSettings(); s2.savedThemes[name.trim()] = JSON.parse(JSON.stringify(baseTheme)); s2.activeThemeProfile = name.trim(); s2.customTheme = { ...s2.savedThemes[name.trim()] };
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success(`Theme duplicated as "${name.trim()}"`, EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-rename').addEventListener('click', async () => {
        const val = sel.value; if (!val || val.startsWith('__preset__')) { toastr.info('Select a custom theme to rename.', EXT_DISPLAY); return; }
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Theme', message: 'Enter new name:', defaultValue: val });
        if (!newName?.trim() || newName.trim() === val) return;
        const s2 = getSettings(); s2.savedThemes[newName.trim()] = s2.savedThemes[val]; delete s2.savedThemes[val]; s2.activeThemeProfile = newName.trim(); saveSettings(); buildThemeEditor(containerOverride); toastr.success('Theme renamed.', EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-delete').addEventListener('click', async () => {
        const val = sel.value; if (!val || val.startsWith('__preset__')) { toastr.info('Select a custom theme to delete.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Theme', message: `Delete "${val}"?` }); if (!ok) return;
        const s2 = getSettings(); delete s2.savedThemes[val]; s2.activeThemeProfile = Object.keys(s2.savedThemes)[0] || '';
        s2.customTheme = s2.activeThemeProfile ? { ...s2.savedThemes[s2.activeThemeProfile] } : { ...THEME_PRESETS.default };
        saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success('Deleted.', EXT_DISPLAY);
    });
    profileRow.querySelector('#iv-theme-export').addEventListener('click', () => {
        const s2 = getSettings(); const val = sel.value;
        const rawName = val.startsWith('__preset__') ? val.replace('__preset__', '') : (val || 'custom');
        const blob = new Blob([JSON.stringify({ name: rawName, version: 1, theme: s2.customTheme }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inner-voice-theme-${rawName.replace(/[^a-z0-9]/gi, '_')}.json`; a.click(); URL.revokeObjectURL(a.href);
    });
    profileRow.querySelector('#iv-theme-import').addEventListener('click', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
        inp.onchange = async () => {
            const file = inp.files?.[0]; if (!file) return;
            try {
                const data = JSON.parse(await file.text()); const imported = data.theme || data;
                if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid format');
                const themeName = (data.name && typeof data.name === 'string') ? data.name : file.name.replace(/\.json$/i, '');
                const s2 = getSettings(); s2.savedThemes[themeName] = { ...THEME_PRESETS.default, ...imported }; s2.activeThemeProfile = themeName; s2.customTheme = { ...s2.savedThemes[themeName] };
                saveSettings(); applyCustomTheme(s2.customTheme); buildThemeEditor(containerOverride); toastr.success(`Theme "${escHtml(themeName)}" imported.`, EXT_DISPLAY);
            } catch (e) { toastr.error('Invalid theme file.', EXT_DISPLAY); }
        };
        inp.click();
    });
    const grid = document.createElement('div'); grid.className = 'iv-theme-var-grid';
    const windowEl = document.getElementById('iv-window');
    for (const def of THEME_VAR_DEFS) {
        const item = document.createElement('div'); item.className = 'iv-theme-var-item';
        const label = document.createElement('div'); label.className = 'iv-theme-var-label'; label.textContent = def.label;
        const wrap = document.createElement('div'); wrap.className = 'iv-theme-var-wrap';
        const isColorKey = _COLOR_KEYS.has(def.key); const isFontKey = def.key === 'font' || def.key === 'fontSize';
        const preview = document.createElement('div'); preview.className = 'iv-theme-var-preview';
        let curVal = s.customTheme?.[def.key] ?? '';
        if (def.key === 'fontSize' && /^\d+$/.test(curVal)) curVal += 'px';
        if (isColorKey) { preview.style.background = curVal; preview.style.display = curVal ? '' : 'none'; preview.classList.add('iv-color-clickable'); }
        else { preview.style.display = 'none'; }
        const input = document.createElement('input'); input.type = 'text'; input.className = 'iv-theme-var-input'; input.value = curVal; input.placeholder = def.hint; input.dataset.key = def.key;
        const cssVar = THEME_CSS_MAP[def.key];
        const getDefaultVal = () => {
            const ss = getSettings();
            if (ss.activeThemeProfile && ss.savedThemes?.[ss.activeThemeProfile]) return ss.savedThemes[ss.activeThemeProfile][def.key] ?? '';
            const selEl = container.querySelector('#iv-theme-profile-select'); const selVal = selEl?.value || '';
            if (selVal.startsWith('__preset__')) return (THEME_PRESETS[selVal.replace('__preset__', '')] || THEME_PRESETS.default)[def.key] ?? '';
            return THEME_PRESETS.default[def.key] ?? '';
        };
        const resetBtn = document.createElement('button'); resetBtn.className = 'iv-theme-var-reset'; resetBtn.title = 'Reset to profile default'; resetBtn.textContent = '↺';
        const updateResetState = val => { resetBtn.disabled = !val || val === getDefaultVal(); };
        updateResetState(curVal);
        let _fontDebounce = null;
        const applyVal = val => {
            const s2 = getSettings(); if (!s2.customTheme) s2.customTheme = {};
            s2.customTheme[def.key] = val; saveSettings(); _markDirty('theme');
            document.querySelectorAll(`input.iv-theme-var-input[data-key="${def.key}"]`).forEach(inp => { if (inp.value !== val) inp.value = val; });
            if (isColorKey) {
                if (cssVar) [windowEl].filter(Boolean).forEach(t => t.style.setProperty(cssVar, val));
                preview.style.background = val; preview.style.display = val ? '' : 'none';
            } else if (isFontKey) {
                clearTimeout(_fontDebounce);
                _fontDebounce = setTimeout(() => {
                    let fVal = val.trim(); if (def.key === 'fontSize' && /^\d+$/.test(fVal)) fVal += 'px';
                    const targets = [windowEl, document.getElementById('iv-settings-overlay'), document.getElementById('iv-picker-overlay')].filter(Boolean);
                    targets.forEach(t => { if (fVal) { t.style.setProperty(cssVar, fVal); if (def.key === 'fontSize') t.style.fontSize = fVal; } else { t.style.removeProperty(cssVar); if (def.key === 'fontSize') t.style.fontSize = ''; } });
                }, 600);
            } else {
                if (cssVar) [windowEl].filter(Boolean).forEach(t => t.style.setProperty(cssVar, val));
            }
            updateResetState(val);
        };
        input.addEventListener('input', () => applyVal(input.value));
        resetBtn.addEventListener('click', () => applyVal(getDefaultVal() || ''));
        if (isColorKey) preview.addEventListener('click', () => showColorPicker(preview, input.value || '#7c6dfa', val => applyVal(val)));
        wrap.appendChild(preview); wrap.appendChild(input); wrap.appendChild(resetBtn);
        item.appendChild(label); item.appendChild(wrap); grid.appendChild(item);
    }
    container.appendChild(grid);
}

// ─── Settings Engine ──────────────────────────────────────────────────────────

function _applyConnectionSourceVisibility(val) {
    [['iv-profile-group', 'iv-custom-profile-group'],
     ['iv-sp-global-profile-group', 'iv-sp-custom-profile-group']].forEach(([pId, cId]) => {
        const pEl = document.getElementById(pId); const cEl = document.getElementById(cId);
        if (pEl) pEl.style.display = val === 'profile' ? '' : 'none';
        if (cEl) cEl.style.display = val === 'custom' ? '' : 'none';
    });
    if (val === 'profile') updateSPConnProfileList();
}

function _pruneMatchingOverrides() {
    const s = getSettings(); const conv = getConversation(); let changed = false;

    if (conv && conv.overrides) {
        for (const key of Object.keys(conv.overrides)) {
            const globalVal = s[key];
            const isEqual = typeof globalVal === 'boolean' ? conv.overrides[key] === globalVal : String(conv.overrides[key]) === String(globalVal);
            if (isEqual) { delete conv.overrides[key]; changed = true; }
        }
        if (changed) { saveConversation(); updateConversationOverrideIndicator(); }
    }
}

function _readFromSettings(def) {
    const s = getSettings();
    return def.fromSetting ? def.fromSetting(s) : s[def.key];
}

function _writeToEl(el, def, val) {
    if (!el) return;
    if (def.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
}

function _bindSetting(def) {
    const stEl = def.stId ? document.getElementById(def.stId) : null;
    const spEl = def.spId ? document.getElementById(def.spId) : null;
    if (!stEl && !spEl) return;

    const apply = raw => {
        const val = def.toVal ? def.toVal(raw) : raw;
        getSettings()[def.key] = val; saveSettings();
        _markDirty('config'); _pruneMatchingOverrides();
        if (def.onChange) def.onChange(val, getSettings());
        if (def.updCtx) Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation()));
    };

    if (def.type === 'slider') {
        const setDisplayVal = (valId, v) => { const el = document.getElementById(valId); if (el) el.textContent = def.valFmt ? def.valFmt(v) : String(v); };
        stEl?.addEventListener('input', () => setDisplayVal(def.stValId, stEl.value));
        spEl?.addEventListener('input', () => setDisplayVal(def.spValId, spEl.value));
        stEl?.addEventListener('change', () => {
            const v = def.toVal ? def.toVal(stEl.value) : stEl.value;
            _writeToEl(spEl, def, v); setDisplayVal(def.stValId, v); setDisplayVal(def.spValId, v); apply(stEl.value);
        });
        spEl?.addEventListener('change', () => {
            const v = def.toVal ? def.toVal(spEl.value) : spEl.value;
            _writeToEl(stEl, def, v); setDisplayVal(def.stValId, v); setDisplayVal(def.spValId, v); apply(spEl.value);
        });
    } else {
        const ev = (def.type === 'input' || def.type === 'textarea') ? 'input' : 'change';
        stEl?.addEventListener(ev, () => { const raw = def.type === 'checkbox' ? stEl.checked : stEl.value; _writeToEl(spEl, def, raw); apply(raw); });
        spEl?.addEventListener(ev, () => { const raw = def.type === 'checkbox' ? spEl.checked : spEl.value; _writeToEl(stEl, def, raw); apply(raw); });
    }
}

function _bindAllSettings() {
    _SETTINGS_DEF.forEach(_bindSetting);
}

function _syncOvToGlobal(key, newVal) {
    const s = getSettings();
    const globalVal = s[key];
    const isDefault = (newVal === undefined || newVal === null) ? true
        : (typeof globalVal === 'boolean' ? newVal === globalVal : String(newVal) === String(globalVal));
    setConversationOverride(key, isDefault ? undefined : newVal);
    updateSPOverrideIndicators();
    Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation()));
}

function _resetOvElToEffective(key) {
    const eff = getEffectiveSettings();
    (_OV_EL_MAP[key] || []).forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        if (id.endsWith('-depth-val') || (id.endsWith('-val') && !id.endsWith('slider'))) {
            el.textContent = eff.contextDepth ?? 15; return;
        }
        if (el.type === 'checkbox') {
            el.checked = !!eff[key];
        } else if (el.type === 'range') {
            el.value = eff[key] ?? 15;
        } else {
            el.value = eff[key] ?? '';
        }
    });
    if (key === 'connectionSource') {
        const val = eff.connectionSource ?? 'default';
        const pg = document.getElementById('iv-sp-ov-profile-group'); const cg = document.getElementById('iv-sp-ov-custom-profile-group');
        if (pg) pg.style.display = val === 'profile' ? '' : 'none';
        if (cg) cg.style.display = val === 'custom' ? '' : 'none';
    }
    if (key === 'forceStreaming') {
        const val = eff.forceStreaming === true ? 'on' : (eff.forceStreaming === false ? 'auto' : (eff.forceStreaming || 'auto'));
        document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
            const active = b.dataset.stream === val; b.classList.toggle('active', active);
            b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
        });
    }
}

// ─── UI Sync ──────────────────────────────────────────────────────────────────

function syncOverlayUI(key, val) {
    const def = _SETTINGS_DEF.find(d => d.key === key);
    if (def?.spId) {
        _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider' && def.spValId) { const el = document.getElementById(def.spValId); if (el) el.textContent = def.valFmt ? def.valFmt(val) : String(val ?? ''); }
    }
    if (key === 'forceStreaming') {
        const sv = val === true ? 'on' : (val === false ? 'auto' : (val || 'auto'));
        document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(b => b.classList.toggle('active', b.dataset.stream === sv));
        if (!('forceStreaming' in getConversationOverrides())) document.querySelectorAll('.iv-ov-stream-btn').forEach(b => b.classList.toggle('active', b.dataset.stream === sv));
        return;
    }
    if (key === 'connectionSource') { _applyConnectionSourceVisibility(val); return; }
    if (key === 'contextDepth') { const dv = document.getElementById('iv-sp-depth-val'); if (dv) dv.textContent = val ?? 15; }
    if (key in getConversationOverrides()) return;
    if (_OV_EL_MAP[key]) _resetOvElToEffective(key);
}

function updateSettingsUI() {
    const s = getSettings();
    for (const def of _SETTINGS_DEF) {
        const val = _readFromSettings(def);
        if (def.stId) _writeToEl(document.getElementById(def.stId), def, val);
        if (def.spId) _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider') {
            const fmt = def.valFmt ? def.valFmt(val) : String(val ?? '');
            [def.stValId, def.spValId].forEach(id => { if (!id) return; const el = document.getElementById(id); if (el) el.textContent = fmt; });
        }
    }

    const fsVal = s.forceStreaming === true ? 'on' : (s.forceStreaming === false ? 'auto' : (s.forceStreaming || 'auto'));
    document.querySelectorAll('#iv-st-stream-auto, #iv-st-stream-on, #iv-st-stream-off').forEach(b => {
        const active = b.dataset.stream === fsVal; b.classList.toggle('active', active);
        b.style.color = active ? 'var(--SmartThemeQuoteColor,#a99bfb)' : ''; b.style.borderColor = active ? 'rgba(124,109,250,0.5)' : ''; b.style.background = active ? 'rgba(124,109,250,0.12)' : '';
    });
    _applyConnectionSourceVisibility(s.connectionSource ?? 'default');
    refreshProfilesDropdown(); buildThemeEditor();
    Promise.resolve().then(function () { return portray; }).then(m => m.syncFireTimePortrayForm());
    Promise.resolve().then(function () { return uiWindow; }).then(m => m._setupBgUpload('iv-bg-upload-btn', 'iv-bg-url', () => _syncBgToOverlay()));
    Promise.resolve().then(function () { return uiWidgets; }).then(m => m.buildSoundSettingsUI(document.getElementById('iv-sound-settings')));
}

function syncSPFromSettings() {
    const s = getSettings(); const ov = getConversationOverrides(); const eff = getEffectiveSettings();
    Promise.resolve().then(function () { return uiChat; }).then(m => { if (m.updateDepthSlidersMax) m.updateDepthSlidersMax(); });

    for (const def of _SETTINGS_DEF) {
        if (!def.spId) continue;
        const val = _readFromSettings(def);
        _writeToEl(document.getElementById(def.spId), def, val);
        if (def.type === 'slider' && def.spValId) { const el = document.getElementById(def.spValId); if (el) el.textContent = def.valFmt ? def.valFmt(val) : String(val ?? ''); }
    }

    const streamVal = s.forceStreaming === true ? 'on' : (s.forceStreaming === false ? 'auto' : (s.forceStreaming || 'auto'));
    document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(b => { b.classList.toggle('active', b.dataset.stream === streamVal); b.style.color = ''; b.style.borderColor = ''; b.style.background = ''; });
    _applyConnectionSourceVisibility(s.connectionSource ?? 'default');
    refreshSPProfilesDropdown(); updateSPConnProfileList();

    // ── Conversation Override UI ──
    const g  = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    const gC = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    const ovDs = document.getElementById('iv-sp-ov-depth-slider'); const ovDv = document.getElementById('iv-sp-ov-depth-val');
    if (ovDs) ovDs.value = eff.contextDepth ?? 15; if (ovDv) ovDv.textContent = eff.contextDepth ?? 15;

    g('iv-sp-ov-conn-source', eff.connectionSource ?? 'default');
    const ovPg = document.getElementById('iv-sp-ov-profile-group'); const ovCus = document.getElementById('iv-sp-ov-custom-profile-group');
    if (ovPg) ovPg.style.display = eff.connectionSource === 'profile' ? '' : 'none';
    if (ovCus) ovCus.style.display = eff.connectionSource === 'custom' ? '' : 'none';
    g('iv-sp-ov-conn-profile', eff.connectionProfileId ?? '');

    const ovi = (id, key) => { const el = document.getElementById(id); if (el) el.value = key in ov ? (ov[key] ?? '') : ''; };
    ovi('iv-sp-ov-custom-url', 'customUrl'); ovi('iv-sp-ov-custom-key', 'customKey'); ovi('iv-sp-ov-custom-model', 'customModel');
    ovi('iv-sp-ov-max-tokens', 'maxTokens'); ovi('iv-sp-ov-history-limit', 'localHistoryLimit');
    ovi('iv-sp-ov-reasoning-trim', 'reasoningTrimStrings'); ovi('iv-sp-ov-sysprompt', 'systemPrompt');

    gC('iv-sp-ov-include-sysprompt', eff.includeSystemPrompt); gC('iv-sp-ov-include-persona', eff.includeUserPersonality);
    gC('iv-sp-ov-include-alt-swipes', eff.includeAlternateSwipes); gC('iv-sp-ov-apply-regex', eff.applyRegexToContext);

    const ovStreamVal = eff.forceStreaming === true ? 'on' : (eff.forceStreaming === false ? 'auto' : (eff.forceStreaming || 'auto'));
    document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
        const active = b.dataset.stream === ovStreamVal; b.classList.toggle('active', active);
        b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
    });
    updateSPOverrideIndicators();
    buildThemeEditor(document.getElementById('iv-sp-theme-section'));
    buildBackgroundSettingsUI(document.getElementById('iv-sp-bg-settings'));
    Promise.resolve().then(function () { return uiWindow; }).then(m => m._setupBgUpload('iv-sp-bg-upload-btn', 'iv-sp-bg-url', () => _syncBgToOverlay()));
    Promise.resolve().then(function () { return featureMemory; }).then(m => m.updateMemoryDot());
}

function updateSPOverrideIndicators() {
    const ov = getConversationOverrides();
    document.querySelectorAll('.iv-sp-ov-label[data-ovkey]').forEach(l => l.classList.toggle('has-override', l.dataset.ovkey in ov));
    document.querySelectorAll('.iv-sp-ov-clear[data-ovkey]').forEach(btn => {
        const active = btn.dataset.ovkey in ov; btn.classList.toggle('active', active); btn.disabled = !active;
    });
}

function updateConversationOverrideIndicator() {
    const has = hasConversationOverrides();
    const dot = document.getElementById('iv-sp-override-dot'); if (dot) dot.style.display = has ? '' : 'none';
    const gearDot = document.getElementById('iv-gear-ov-dot'); if (gearDot) gearDot.style.display = has ? '' : 'none';
    document.getElementById('iv-ext-settings-btn')?.classList.toggle('iv-has-overrides', has);
    updateSPOverrideIndicators();
    const info = document.getElementById('iv-sp-footer-info');
    if (info) { const count = Object.keys(getConversationOverrides()).length; info.textContent = count ? `${count} conversation override${count !== 1 ? 's' : ''} active` : ''; }
    const ov = getConversationOverrides(); const hasDepthOv = 'contextDepth' in ov;
    document.getElementById('iv-depth-slider')?.classList.toggle('iv-slider-overridden', hasDepthOv);
    document.getElementById('iv-depth-val')?.classList.toggle('iv-depth-val-overridden', hasDepthOv);
}

// ─── Panel Open/Close ─────────────────────────────────────────────────────────

function openSettingsPanel() {
    const overlay = document.getElementById('iv-settings-overlay'); if (!overlay) return;
    Promise.resolve().then(function () { return uiWindow; }).then(m => m.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default));
    syncSPFromSettings(); buildThemeEditor(document.getElementById('iv-sp-theme-section')); _updateDirtyDots();
    Promise.resolve().then(function () { return uiWidgets; }).then(mod => {
        mod.buildSoundSettingsUI(document.getElementById('iv-sp-sound-settings'));
        buildQPSettingsUI(document.getElementById('iv-sp-qp-container'));
        mod.buildQPSetManager(document.getElementById('iv-sp-qp-set-manager'), () => buildQPSettingsUI(document.getElementById('iv-sp-qp-container')));
        const mkPresetMgr = (containerId, getTextId, dictKey) => mod.buildPromptPresetManager(
            document.getElementById(containerId),
            () => document.getElementById(getTextId)?.value || '',
            text => { const ta = document.getElementById(getTextId); if (ta) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); } },
            dictKey
        );
        mkPresetMgr('iv-sp-prompt-preset-manager',      'iv-sp-ov-sysprompt',       undefined);
    }).catch(() => {});
    overlay.style.display = 'flex'; updateConversationOverrideIndicator();
    bringWindowToFront();
    Promise.resolve().then(function () { return featureMemory; }).then(m => m.updateMemoryDot());
    overlay.querySelectorAll('.iv-sp-tab').forEach(t => t.classList.toggle('active', t.dataset.sptab === 'global'));
    overlay.querySelectorAll('.iv-sp-tab-pane').forEach(p => { p.style.display = p.id === 'iv-sp-pane-global' ? '' : 'none'; });
}

function closeSettingsPanel() {
    const overlay = document.getElementById('iv-settings-overlay'); if (overlay) overlay.style.display = 'none';
}

// ─── Background Sync Helper ───────────────────────────────────────────────────

function _syncBgToOverlay() {
    const s = getSettings(); const bgId = s.windowBg || 'none';
    ['iv-sp-bg-type', 'iv-bg-type'].forEach(id => { const el = document.getElementById(id); if (el) el.value = bgId; });
    const dim = s.windowBgDim ?? 50;
    ['iv-sp-bg-dim', 'iv-bg-dim'].forEach(id => { const el = document.getElementById(id); if (el) el.value = dim; });
    ['iv-sp-bg-dim-val', 'iv-bg-dim-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = `${dim}%`; });
}

// ─── Main Setup Functions ─────────────────────────────────────────────────────

function setupSettingsHandlers() {
    _bindAllSettings();

    // ── forceStreaming button group ──
    document.querySelectorAll('#iv-st-stream-auto, #iv-st-stream-on, #iv-st-stream-off').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; getSettings().forceStreaming = val; saveSettings();
            syncOverlayUI('forceStreaming', val); _markDirty('config');
        });
    });

    // ── Reset buttons ──
    const _resetPrompt = async (key, defaultVal, stId, spId, label) => {
        const ok = await showCustomDialog({ type: 'confirm', title: `Reset ${label}`, message: `Reset to default?` }); if (!ok) return;
        getSettings()[key] = defaultVal === '' ? '' : undefined; if (defaultVal !== '') getSettings()[key] = defaultVal;
        saveSettings(); _markDirty('config');
        const displayVal = defaultVal || (key === 'memoryManagePrompt' ? DEFAULT_MEMORY_PROMPT : DEFAULT_SYSTEM_PROMPT);
        [stId, spId].forEach(id => { const el = document.getElementById(id); if (el) el.value = displayVal; });
        Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation()));
        toastr.success(`${label} reset.`, EXT_DISPLAY);
    };
    document.getElementById('iv-reset-prompt')?.addEventListener('click', () => _resetPrompt('systemPrompt', DEFAULT_SYSTEM_PROMPT, 'iv-sysprompt', 'iv-sp-sysprompt', 'System Prompt'));
    document.getElementById('iv-reset-portray-prompt')?.addEventListener('click', () => _resetPrompt('portrayPrompt', DEFAULT_PORTRAY_PROMPT, 'iv-portray-prompt', 'iv-sp-portray-prompt', 'Portray Prompt'));
    document.getElementById('iv-reset-memory-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset memory prompt to default?' }); if (!ok) return;
        getSettings().memoryManagePrompt = DEFAULT_MEMORY_PROMPT; saveSettings();
        ['iv-memory-prompt', 'iv-sp-memory-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_MEMORY_PROMPT; });
        Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation())); toastr.success('Prompt reset.', EXT_DISPLAY);
    });

    // ── Profile management (ST drawer) ──
    document.getElementById('iv-profile-select')?.addEventListener('change', async () => {
        const sel = document.getElementById('iv-profile-select'); const name = sel.value;
        if (isConfigProfileDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Configuration', message: 'You have unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = getSettings().activeProfile || ''; return; }
        }
        if (name) loadProfile(name); updateBindingSection();
    });
    document.getElementById('iv-profile-save')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); let name = sel?.value;
        if (!name) { name = await showCustomDialog({ type: 'prompt', title: 'Save Configuration', message: 'Enter a name for this configuration:', placeholder: 'My Config' }); if (!name?.trim()) return; name = name.trim(); }
        saveProfile(name); refreshProfilesDropdown(); if (sel) sel.value = name;
        updateBindingSection(); toastr.success(`Saved "${name}"`, EXT_DISPLAY); _clearDirty('config');
    });
    document.getElementById('iv-profile-create-new')?.addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Configuration', message: 'Enter a name for the new default profile:', placeholder: 'New Config' }); if (!name?.trim()) return;
        const n = name.trim(); const s = getSettings();
        s.profiles[n] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200 };
        saveSettings(); refreshProfilesDropdown(); loadProfile(n);
        const sel = document.getElementById('iv-profile-select'); if (sel) sel.value = n;
        updateBindingSection(); toastr.success(`Created "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-profile-duplicate')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Duplicate Configuration', message: 'Name for the new profile:', defaultValue: sel.value + ' (Copy)' }); if (!newName?.trim()) return;
        const n = newName.trim(); const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[n] = JSON.parse(JSON.stringify(p)); saveSettings(); refreshProfilesDropdown(); refreshSPProfilesDropdown(); loadProfile(n);
        const newSel = document.getElementById('iv-profile-select'); if (newSel) newSel.value = n;
        updateBindingSection(); toastr.success(`Duplicated as "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-profile-rename')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Configuration', message: 'New name:', defaultValue: sel.value }); if (!newName?.trim() || newName.trim() === sel.value) return;
        const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[newName.trim()] = p; delete s.profiles[sel.value];
        if (s.activeProfile === sel.value) s.activeProfile = newName.trim();
        for (const k in s.profileBindings) { if (s.profileBindings[k] === sel.value) s.profileBindings[k] = newName.trim(); }
        saveSettings(); refreshProfilesDropdown();
        const newSel = document.getElementById('iv-profile-select'); if (newSel) newSel.value = newName.trim();
        updateBindingSection(); toastr.success('Renamed.', EXT_DISPLAY);
    });
    document.getElementById('iv-profile-delete')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); if (Object.keys(s.profiles).length <= 1) { toastr.warning('Cannot delete the last remaining configuration profile.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Configuration', message: `Delete "${sel.value}"?` }); if (!ok) return;
        deleteProfile(sel.value); refreshProfilesDropdown(); updateBindingSection(); toastr.success('Deleted.', EXT_DISPLAY);
    });
    document.getElementById('iv-bind-char')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId } = getBindingKey(); const key = `char_${charId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        _dbgAdd(s.profileBindings[key] ? 'PROFILE_BIND' : 'PROFILE_UNBIND', { target: 'char', profile: sel.value }); saveSettings(); updateBindingSection();
    });
    document.getElementById('iv-bind-chat')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId, chatId } = getBindingKey(); const key = `chat_${charId}_${chatId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        _dbgAdd(s.profileBindings[key] ? 'PROFILE_BIND' : 'PROFILE_UNBIND', { target: 'chat', profile: sel.value }); saveSettings(); updateBindingSection();
    });

    // ── Misc buttons ──
    document.getElementById('iv-open-window')?.addEventListener('click', () => Promise.resolve().then(function () { return uiWindow; }).then(m => m.showWindow()));
    document.getElementById('iv-download-debug')?.addEventListener('click', () => Promise.resolve().then(function () { return utilDebug; }).then(m => m.dbgDownload()));
    document.getElementById('iv-open-memory-settings')?.addEventListener('click', () => { openSettingsPanel(); setTimeout(() => document.querySelector('[data-sptab="memory"]')?.click(), 80); });
    document.getElementById('iv-open-tools-settings')?.addEventListener('click', () => { openSettingsPanel(); setTimeout(() => document.querySelector('[data-sptab="tools"]')?.click(), 80); });
    document.getElementById('iv-clear-conversation')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Clear Conversation', message: 'Delete the whole inner conversation for this chat? This cannot be undone.', delayConfirm: 3 }); if (!ok) return;
        const { charId, chatId } = getBindingKey();
        _dbgAdd('CONVERSATION_CLEAR_REQUESTED', { source: 'st-drawer', charId, chatId });
        try {
            await initConversation({ forceReset: true });
            _dbgAdd('CONVERSATION_CLEAR_DONE', { source: 'st-drawer', charId, chatId });
        } catch (e) {
            _dbgAdd('CONVERSATION_CLEAR_FAILED', { source: 'st-drawer', charId, chatId, error: e?.message || String(e), stack: e?.stack });
            toastr.error(`Failed to clear the inner conversation: ${e.message}`, EXT_DISPLAY);
            return;
        }
        Promise.resolve().then(function () { return uiChat; }).then(m => m.onChatChanged());
        toastr.success('Inner conversation cleared.', EXT_DISPLAY);
    });

    // ── Background (ST) ──
    buildBackgroundSettingsUI(document.getElementById('iv-bg-settings'));
    Promise.resolve().then(function () { return uiWindow; }).then(m => m._setupBgUpload('iv-bg-upload-btn', 'iv-bg-url', () => _syncBgToOverlay()));

    refreshProfilesDropdown();
}

function setupSettingsPanelListeners() {
    const overlay = document.getElementById('iv-settings-overlay'); if (!overlay) return;

    document.getElementById('iv-sp-close')?.addEventListener('click', () => closeSettingsPanel());
    let _spMD = null;
    overlay.addEventListener('mousedown', e => { _spMD = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _spMD === overlay) closeSettingsPanel(); });

    // ── Tab switching ──
    overlay.querySelectorAll('.iv-sp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.iv-sp-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
            const pane = tab.dataset.sptab;
            overlay.querySelectorAll('.iv-sp-tab-pane').forEach(p => { p.style.display = p.id === `iv-sp-pane-${pane}` ? '' : 'none'; });
            if (pane === 'memory') Promise.resolve().then(function () { return featureMemory; }).then(m => m.setupMemorySettingsUI());
            if (pane === 'tools') {
                Promise.resolve().then(function () { return featureToolsUi; }).then(m => m.setupToolsSettingsUI());
            }
        });
    });

    // ── SP forceStreaming ──
    document.querySelectorAll('.iv-stream-btn:not(.iv-ov-stream-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; getSettings().forceStreaming = val; saveSettings();
            syncOverlayUI('forceStreaming', val); _markDirty('config');
        });
    });

    // ── SP Profile management ──
    document.getElementById('iv-sp-profile-select')?.addEventListener('change', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        if (isConfigProfileDirty()) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Unsaved Configuration', message: 'Unsaved changes. Switch anyway?' });
            if (!ok) { sel.value = getSettings().activeProfile || ''; return; }
        }
        loadProfile(sel.value); syncSPFromSettings(); updateSettingsUI(); updateSPBindingSection();
    });
    document.getElementById('iv-sp-profile-save')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); let name = sel?.value;
        if (!name) { name = await showCustomDialog({ type: 'prompt', title: 'Save Configuration', message: 'Profile name:', placeholder: 'My Config' }); if (!name?.trim()) return; name = name.trim(); }
        saveProfile(name); refreshSPProfilesDropdown(); refreshProfilesDropdown(); if (sel) sel.value = name;
        updateSPBindingSection(); toastr.success(`Saved "${name}"`, EXT_DISPLAY); _clearDirty('config');
    });
    document.getElementById('iv-sp-profile-create')?.addEventListener('click', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Configuration', message: 'Name:', placeholder: 'New Config' }); if (!name?.trim()) return;
        const n = name.trim(); const s = getSettings();
        s.profiles[n] = { systemPrompt: DEFAULT_SYSTEM_PROMPT, includeSystemPrompt: true, includeUserPersonality: true, contextDepth: 15, localHistoryLimit: 50, connectionSource: 'default', connectionProfileId: '', maxTokens: 8200, applyRegexToContext: true };
        saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown(); loadProfile(n); syncSPFromSettings(); updateSettingsUI();
        const sel = document.getElementById('iv-sp-profile-select'); if (sel) sel.value = n;
        updateSPBindingSection(); toastr.success(`Created "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-duplicate')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return toastr.info('No configuration selected.', EXT_DISPLAY);
        const newName = await showCustomDialog({ type: 'prompt', title: 'Duplicate Configuration', message: 'Name for the new profile:', defaultValue: sel.value + ' (Copy)' }); if (!newName?.trim()) return;
        const n = newName.trim(); const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[n] = JSON.parse(JSON.stringify(p)); saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown(); loadProfile(n); syncSPFromSettings(); updateSettingsUI();
        const newSel = document.getElementById('iv-sp-profile-select'); if (newSel) newSel.value = n;
        updateSPBindingSection(); toastr.success(`Duplicated as "${n}"`, EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-rename')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename', message: 'New name:', defaultValue: sel.value }); if (!newName?.trim() || newName.trim() === sel.value) return;
        const s = getSettings(); const p = s.profiles[sel.value]; if (!p) return;
        s.profiles[newName.trim()] = p; delete s.profiles[sel.value];
        if (s.activeProfile === sel.value) s.activeProfile = newName.trim();
        for (const k in s.profileBindings) { if (s.profileBindings[k] === sel.value) s.profileBindings[k] = newName.trim(); }
        saveSettings(); refreshSPProfilesDropdown(); refreshProfilesDropdown();
        const newSel = document.getElementById('iv-sp-profile-select'); if (newSel) newSel.value = newName.trim();
        updateSPBindingSection(); toastr.success('Renamed.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-profile-delete')?.addEventListener('click', async () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); if (Object.keys(s.profiles).length <= 1) { toastr.warning('Cannot delete the last profile.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Profile', message: `Delete "${sel.value}"?` }); if (!ok) return;
        deleteProfile(sel.value); refreshSPProfilesDropdown(); refreshProfilesDropdown(); updateSPBindingSection(); toastr.success('Deleted.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-bind-char')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId } = getBindingKey(); const key = `char_${charId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        saveSettings(); updateSPBindingSection(); document.getElementById('iv-sp-bind-char')?.classList.toggle('active', s.profileBindings[key] === sel.value);
    });
    document.getElementById('iv-sp-bind-chat')?.addEventListener('click', () => {
        const sel = document.getElementById('iv-sp-profile-select'); if (!sel?.value) return;
        const s = getSettings(); const { charId, chatId } = getBindingKey(); const key = `chat_${charId}_${chatId}`;
        if (s.profileBindings[key] === sel.value) delete s.profileBindings[key]; else s.profileBindings[key] = sel.value;
        saveSettings(); updateSPBindingSection(); document.getElementById('iv-sp-bind-chat')?.classList.toggle('active', s.profileBindings[key] === sel.value);
    });

    // ── SP conn profile ──
    document.getElementById('iv-sp-conn-profile')?.addEventListener('change', e => {
        getSettings().connectionProfileId = e.target.value; saveSettings(); syncOverlayUI('connectionProfileId', e.target.value); _markDirty('config');
    });

    // ── SP Reset buttons ──
    document.getElementById('iv-sp-reset-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset System Prompt', message: 'Reset to default?' }); if (!ok) return;
        getSettings().systemPrompt = DEFAULT_SYSTEM_PROMPT; saveSettings();
        ['iv-sp-sysprompt', 'iv-sysprompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_SYSTEM_PROMPT; });
        Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation())); toastr.success('System prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-reset-portray-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Portray Prompt', message: 'Reset to default?' }); if (!ok) return;
        getSettings().portrayPrompt = DEFAULT_PORTRAY_PROMPT; saveSettings();
        ['iv-sp-portray-prompt', 'iv-portray-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_PORTRAY_PROMPT; });
        toastr.success('Portray prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-reset-memory-prompt')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset memory prompt to default?' }); if (!ok) return;
        getSettings().memoryManagePrompt = DEFAULT_MEMORY_PROMPT; saveSettings();
        ['iv-sp-memory-prompt', 'iv-memory-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = DEFAULT_MEMORY_PROMPT; });
        toastr.success('Prompt reset.', EXT_DISPLAY);
    });
    document.getElementById('iv-sp-tools-reset')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Prompt', message: 'Reset tools prompt to default?' }); if (!ok) return;
        getSettings().toolsSystemPrompt = DEFAULT_TOOLS_PROMPT; saveSettings();
        const ta = document.getElementById('iv-sp-tools-prompt'); if (ta) ta.value = DEFAULT_TOOLS_PROMPT;
        toastr.success('Tools prompt reset.', EXT_DISPLAY);
    });

    // ── Misc SP ──
    document.getElementById('iv-sp-open-changelog')?.addEventListener('click', () => { closeSettingsPanel(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.openChangelog()); });
    document.getElementById('iv-sp-download-debug')?.addEventListener('click', () => Promise.resolve().then(function () { return utilDebug; }).then(m => m.dbgDownload()));
    document.getElementById('iv-sp-clear-conversation')?.addEventListener('click', async () => {
        const ok = await showCustomDialog({ type: 'confirm', title: 'Clear Conversation', message: 'Delete the whole inner conversation for this chat? This cannot be undone.', delayConfirm: 3 }); if (!ok) return;
        const { charId, chatId } = getBindingKey();
        _dbgAdd('CONVERSATION_CLEAR_REQUESTED', { source: 'settings-overlay', charId, chatId });
        try {
            await initConversation({ forceReset: true });
            _dbgAdd('CONVERSATION_CLEAR_DONE', { source: 'settings-overlay', charId, chatId });
            Promise.resolve().then(function () { return uiChat; }).then(m => m.onChatChanged());
            toastr.success('Inner conversation cleared.', EXT_DISPLAY);
        } catch (e) {
            _dbgAdd('CONVERSATION_CLEAR_FAILED', { source: 'settings-overlay', charId, chatId, error: e?.message || String(e), stack: e?.stack });
            toastr.error(`Failed to clear the inner conversation: ${e.message}`, EXT_DISPLAY);
        }
    });
    document.getElementById('iv-sp-reset-all-overrides')?.addEventListener('click', async () => {
        if (!hasConversationOverrides()) { toastr.info('No conversation overrides active.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Reset Conversation Overrides', message: 'Clear all setting overrides for this inner conversation?' }); if (!ok) return;
        clearAllConversationOverrides(); syncSPFromSettings();
        Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation())); toastr.success('Conversation overrides cleared.', EXT_DISPLAY);
    });

    // ── Conversation Override bindings ──
    const bindOv = (id, key, isCheckbox = false, toVal = null) => {
        const el = document.getElementById(id); if (!el) return;
        el.addEventListener(isCheckbox ? 'change' : 'input', () => {
            const raw = isCheckbox ? el.checked : el.value;
            _syncOvToGlobal(key, (raw === '' || raw === undefined) ? undefined : (toVal ? toVal(raw) : raw));
        });
    };
    const bindOvSel = (id, key) => { const el = document.getElementById(id); if (!el) return; el.addEventListener('change', () => _syncOvToGlobal(key, el.value || undefined)); };

    const ovDs = document.getElementById('iv-sp-ov-depth-slider'); const ovDv = document.getElementById('iv-sp-ov-depth-val');
    if (ovDs) { ovDs.addEventListener('input', () => { if (ovDv) ovDv.textContent = ovDs.value; }); ovDs.addEventListener('change', () => _syncOvToGlobal('contextDepth', parseInt(ovDs.value))); }

    document.getElementById('iv-sp-ov-conn-source')?.addEventListener('change', e => {
        _syncOvToGlobal('connectionSource', e.target.value);
        const pg = document.getElementById('iv-sp-ov-profile-group'); const cg = document.getElementById('iv-sp-ov-custom-profile-group');
        if (pg) pg.style.display = e.target.value === 'profile' ? '' : 'none';
        if (cg) cg.style.display = e.target.value === 'custom' ? '' : 'none';
        if (e.target.value === 'profile') updateSPConnProfileList();
    });
    bindOv('iv-sp-ov-custom-url', 'customUrl'); bindOv('iv-sp-ov-custom-key', 'customKey'); bindOv('iv-sp-ov-custom-model', 'customModel');
    bindOvSel('iv-sp-ov-conn-profile', 'connectionProfileId');
    bindOv('iv-sp-ov-max-tokens', 'maxTokens', false, Number); bindOv('iv-sp-ov-history-limit', 'localHistoryLimit', false, Number);
    bindOv('iv-sp-ov-reasoning-trim', 'reasoningTrimStrings');
    document.getElementById('iv-sp-ov-sysprompt')?.addEventListener('input', e => _syncOvToGlobal('systemPrompt', e.target.value || undefined));
    bindOv('iv-sp-ov-include-sysprompt',  'includeSystemPrompt',     true);
    bindOv('iv-sp-ov-include-persona',    'includeUserPersonality',   true);
    bindOv('iv-sp-ov-include-alt-swipes', 'includeAlternateSwipes',   true);
    bindOv('iv-sp-ov-apply-regex',        'applyRegexToContext',      true);

    // Override streaming buttons
    document.querySelectorAll('.iv-ov-stream-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.stream; _syncOvToGlobal('forceStreaming', val);
            document.querySelectorAll('.iv-ov-stream-btn').forEach(b => {
                const active = b.dataset.stream === val; b.classList.toggle('active', active);
                b.style.color = active ? 'var(--iv-accent)' : ''; b.style.borderColor = active ? 'var(--iv-accent-dim)' : ''; b.style.background = active ? 'var(--iv-accent-bg)' : '';
            });
        });
    });

    // Override clear buttons
    document.querySelectorAll('.iv-sp-ov-clear[data-ovkey]').forEach(btn => {
        btn.addEventListener('click', () => {
            setConversationOverride(btn.dataset.ovkey, undefined);
            _resetOvElToEffective(btn.dataset.ovkey);
            updateSPOverrideIndicators();
            Promise.resolve().then(function () { return uiChat; }).then(m => m.updateMsgCount(getConversation()));
        });
    });

    // ── SP background ──
    Promise.resolve().then(function () { return uiWindow; }).then(m => m._setupBgUpload('iv-sp-bg-upload-btn', 'iv-sp-bg-url', () => _syncBgToOverlay()));
}

// ─── Background Settings UI ───────────────────────────────────────────────────

function buildBackgroundSettingsUI(container) {
    if (!container) return;
    container.innerHTML = '';
    const s = getSettings(); if (!s.customBackgrounds) s.customBackgrounds = {};
    const isSP = container.id === 'iv-sp-bg-settings';

    const mkRow = () => { const d = document.createElement('div'); d.className = isSP ? 'iv-sp-field' : ''; return d; };
    const mkLbl = text => { const l = document.createElement(isSP ? 'label' : 'b'); l.className = isSP ? 'iv-sp-label' : ''; if (!isSP) l.style.cssText = 'font-size:11px;color:#888;display:block;margin-bottom:4px'; l.textContent = text; return l; };
    const mkBtn = (icon, label, cls, cb) => { const b = document.createElement('button'); b.className = isSP ? `iv-action-btn${cls ? ' '+cls : ''}` : 'menu_button interactable'; b.innerHTML = `<i class="fa-solid fa-${icon}"></i><span>${label}</span>`; if (!isSP) b.style.flex = '1'; b.addEventListener('click', cb); return b; };

    const typeRow = mkRow(); const typeLbl = mkLbl('Background Type');
    const typeWrap = document.createElement('div'); typeWrap.style.cssText = 'display:flex;gap:6px;align-items:center';
    const typeSel = document.createElement('select'); typeSel.className = isSP ? 'iv-sp-select text_pole' : 'text_pole'; typeSel.style.flex = '1';

    const renderDropdown = () => {
        typeSel.innerHTML = '<option value="none">None</option>';
        if (Object.keys(s.customBackgrounds).length) {
            const grp = document.createElement('optgroup'); grp.label = 'Custom Backgrounds';
            for (const [key, bg] of Object.entries(s.customBackgrounds)) { const o = document.createElement('option'); o.value = key; o.textContent = bg.name; grp.appendChild(o); }
            typeSel.appendChild(grp);
        }
        typeSel.value = s.windowBg || 'none';
    };
    renderDropdown();
    typeWrap.appendChild(typeSel); typeRow.appendChild(typeLbl); typeRow.appendChild(typeWrap); container.appendChild(typeRow);

    const actWrap = document.createElement('div'); actWrap.style.cssText = isSP ? 'display:flex;gap:6px;margin-top:6px' : 'display:flex;gap:6px;margin-top:6px;align-items:center';
    const rebuildAll = () => { [document.getElementById('iv-bg-settings'), document.getElementById('iv-sp-bg-settings')].filter(Boolean).forEach(c => buildBackgroundSettingsUI(c)); Promise.resolve().then(function () { return uiWindow; }).then(m => m.applyWindowBackground()); };

    actWrap.appendChild(mkBtn('upload', 'Upload', '', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm';
        inp.onchange = async () => {
            const file = inp.files?.[0]; if (!file) return;
            if (file.size > 25 * 1024 * 1024) { toastr.warning('File too large (>25MB).', EXT_DISPLAY); return; }
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(null); r.readAsDataURL(file); });
            if (!dataUrl) return;
            const s2 = getSettings(); const id = 'bg_' + Date.now();
            s2.customBackgrounds[id] = { name: file.name, dataUrl, isVideo: file.type.startsWith('video/'), fit: 'cover' }; s2.windowBg = id; saveSettings(); rebuildAll();
        };
        inp.click();
    }));
    actWrap.appendChild(mkBtn('link', 'URL', '', async () => {
        const url = await showCustomDialog({ type: 'prompt', title: 'Add Background', message: 'Enter direct URL to image or video:', placeholder: 'https://...' });
        if (url?.trim()) {
            const s2 = getSettings(); const id = 'bg_' + Date.now();
            s2.customBackgrounds[id] = { name: 'URL Background', dataUrl: url.trim(), isVideo: url.endsWith('.mp4') || url.endsWith('.webm'), fit: 'cover' }; s2.windowBg = id; saveSettings(); rebuildAll();
        }
    }));
    actWrap.appendChild(mkBtn('pen', 'Rename', '', async () => {
        const val = typeSel.value; if (val === 'none') return;
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Background', message: 'New name:', defaultValue: s.customBackgrounds[val]?.name });
        if (newName?.trim()) { s.customBackgrounds[val].name = newName.trim(); saveSettings(); rebuildAll(); }
    }));
    actWrap.appendChild(mkBtn('trash', 'Delete', isSP ? 'iv-sp-danger-btn' : '', async () => {
        const val = typeSel.value; if (val === 'none') return;
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Background', message: 'Delete this background?' }); if (!ok) return;
        const s2 = getSettings(); delete s2.customBackgrounds[val]; s2.windowBg = 'none'; saveSettings(); rebuildAll();
    }));
    container.appendChild(actWrap);

    const extraWrap = document.createElement('div'); extraWrap.style.marginTop = '12px';
    const fitRow = mkRow(); const fitLbl = mkLbl('Image/Video Fit');
    const fitSel = document.createElement('select'); fitSel.className = isSP ? 'iv-sp-select text_pole' : 'text_pole'; fitSel.id = isSP ? 'iv-sp-fit-sel' : 'iv-fit-sel';
    ['cover','contain','fill','center'].forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; fitSel.appendChild(o); });
    fitSel.value = s.customBackgrounds[s.windowBg]?.fit || 'cover';
    fitSel.addEventListener('change', () => { if (s.windowBg !== 'none' && s.customBackgrounds[s.windowBg]) { s.customBackgrounds[s.windowBg].fit = fitSel.value; saveSettings(); Promise.resolve().then(function () { return uiWindow; }).then(m => m.applyWindowBackground()); } });
    fitRow.appendChild(fitLbl); fitRow.appendChild(fitSel); extraWrap.appendChild(fitRow);

    const dimRow = mkRow(); dimRow.style.marginTop = '8px'; const dimLbl = mkLbl('Darkness Overlay');
    const dimFlex = document.createElement('div'); dimFlex.className = isSP ? 'iv-sp-row' : ''; if (!isSP) dimFlex.style.cssText = 'display:flex;align-items:center;gap:10px';
    const dimSlider = document.createElement('input'); dimSlider.type = 'range'; dimSlider.min = '0'; dimSlider.max = '100'; dimSlider.className = isSP ? 'iv-slider' : 'neo-range-slider'; dimSlider.style.flex = '1'; dimSlider.value = s.windowBgDim ?? 50;
    const dimVal = document.createElement('span'); dimVal.style.cssText = isSP ? 'min-width:32px;text-align:right;font-size:11px;color:var(--iv-accent)' : 'font-size:12px;min-width:34px;text-align:right;color:var(--SmartThemeQuoteColor,#a99bfb)'; dimVal.textContent = `${dimSlider.value}%`;
    dimSlider.addEventListener('input', () => { dimVal.textContent = `${dimSlider.value}%`; });
    dimSlider.addEventListener('change', () => { getSettings().windowBgDim = parseInt(dimSlider.value); saveSettings(); Promise.resolve().then(function () { return uiWindow; }).then(m => m.applyWindowBackground()); _syncBgToOverlay(); });
    dimFlex.appendChild(dimSlider); dimFlex.appendChild(dimVal); dimRow.appendChild(dimLbl); dimRow.appendChild(dimFlex); extraWrap.appendChild(dimRow);
    container.appendChild(extraWrap);

    const updateVis = () => { const isNone = typeSel.value === 'none'; extraWrap.style.display = isNone ? 'none' : 'block'; };
    updateVis();
    typeSel.addEventListener('change', () => { getSettings().windowBg = typeSel.value; saveSettings(); updateVis(); rebuildAll(); });
}

// ─── Quick Prompts Settings UI ────────────────────────────────────────────────

function buildQPSettingsUI(container) {
    if (!container) return;
    container.innerHTML = '';
    const list = document.createElement('div'); list.className = 'iv-qp-settings-list';

    const renderList = () => {
        list.innerHTML = '';
        const prompts = getSettings().quickPrompts || [];
        if (!prompts.length) { list.innerHTML = `<div style="font-size:11px;color:var(--iv-text-muted);text-align:center;padding:10px 0">No quick prompts yet. Add one below.</div>`; }
        prompts.forEach((qp, idx) => {
            const row = document.createElement('div'); row.className = 'iv-qp-settings-row';
            const iconBtn = document.createElement('button'); iconBtn.className = 'iv-qp-settings-icon-btn'; iconBtn.textContent = qp.icon || '⚡'; iconBtn.title = 'Change icon';
            Promise.resolve().then(function () { return uiWidgets; }).then(mod => {
                iconBtn.addEventListener('click', e => { e.stopPropagation(); mod.showQPIconPicker(iconBtn, qp.icon || '⚡', emoji => { getSettings().quickPrompts[idx].icon = emoji; saveSettings(); iconBtn.textContent = emoji; mod.renderQuickPromptsBar(); }); });
            });
            const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.className = 'iv-qp-settings-label-input iv-sp-input'; labelInput.placeholder = 'Label'; labelInput.value = qp.label || '';
            labelInput.addEventListener('input', () => { getSettings().quickPrompts[idx].label = labelInput.value; saveSettings(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar()); });
            const moveUpBtn = document.createElement('button'); moveUpBtn.className = 'iv-qp-settings-move'; moveUpBtn.textContent = '↑'; moveUpBtn.title = 'Move up'; moveUpBtn.disabled = idx === 0;
            moveUpBtn.addEventListener('click', () => { if (idx === 0) return; const arr = getSettings().quickPrompts; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; saveSettings(); renderList(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar()); });
            const moveDnBtn = document.createElement('button'); moveDnBtn.className = 'iv-qp-settings-move'; moveDnBtn.textContent = '↓'; moveDnBtn.title = 'Move down'; moveDnBtn.disabled = idx === prompts.length - 1;
            moveDnBtn.addEventListener('click', () => { const arr = getSettings().quickPrompts; if (idx >= arr.length - 1) return; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; saveSettings(); renderList(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar()); });
            const delBtn = document.createElement('button'); delBtn.className = 'iv-qp-settings-del'; delBtn.innerHTML = I.trash; delBtn.title = 'Delete';
            delBtn.addEventListener('click', async () => { const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Prompt', message: `Delete "${qp.label || 'this prompt'}"?` }); if (!ok) return; getSettings().quickPrompts.splice(idx, 1); saveSettings(); renderList(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar()); });
            const textArea = document.createElement('textarea'); textArea.className = 'iv-qp-settings-text iv-sp-textarea'; textArea.placeholder = 'Prompt text… (supports {{user}}, {{char}} macros)'; textArea.rows = 2; textArea.value = qp.text || '';
            textArea.addEventListener('input', () => { getSettings().quickPrompts[idx].text = textArea.value; saveSettings(); });
            const controls = document.createElement('div'); controls.className = 'iv-qp-settings-controls'; controls.appendChild(moveUpBtn); controls.appendChild(moveDnBtn); controls.appendChild(delBtn);
            const top = document.createElement('div'); top.className = 'iv-qp-settings-row-top'; top.appendChild(iconBtn); top.appendChild(labelInput); top.appendChild(controls);
            row.appendChild(top); row.appendChild(textArea); list.appendChild(row);
        });
    };
    renderList();

    const addBtn = document.createElement('button'); addBtn.className = 'iv-action-btn'; addBtn.style.marginTop = '8px'; addBtn.innerHTML = `${I.plus}<span>Add Prompt</span>`;
    addBtn.addEventListener('click', async () => {
        const label = await showCustomDialog({ type: 'prompt', title: 'New Quick Prompt', message: 'Label for this prompt:', placeholder: 'My Prompt' }); if (label === null) return;
        getSettings().quickPrompts.push({ id: 'qp_'+Date.now(), label: label.trim() || 'Prompt', icon: '⚡', text: '' }); saveSettings(); renderList(); Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar());
    });
    container.appendChild(list); container.appendChild(addBtn);
}

var uiSettings = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _clearDirty: _clearDirty,
    _markDirty: _markDirty,
    _syncBgToOverlay: _syncBgToOverlay,
    _takeProfileSnapshot: _takeProfileSnapshot,
    _updateDirtyDots: _updateDirtyDots,
    autoLoadBoundProfile: autoLoadBoundProfile,
    buildBackgroundSettingsUI: buildBackgroundSettingsUI,
    buildQPSettingsUI: buildQPSettingsUI,
    buildThemeEditor: buildThemeEditor,
    closeSettingsPanel: closeSettingsPanel,
    deleteProfile: deleteProfile,
    isConfigProfileDirty: isConfigProfileDirty,
    isThemeDirty: isThemeDirty,
    loadProfile: loadProfile,
    openSettingsPanel: openSettingsPanel,
    refreshProfilesDropdown: refreshProfilesDropdown,
    refreshSPProfilesDropdown: refreshSPProfilesDropdown,
    saveProfile: saveProfile,
    setupSettingsHandlers: setupSettingsHandlers,
    setupSettingsPanelListeners: setupSettingsPanelListeners,
    syncOverlayUI: syncOverlayUI,
    syncSPFromSettings: syncSPFromSettings,
    updateBindingSection: updateBindingSection,
    updateConversationOverrideIndicator: updateConversationOverrideIndicator,
    updateProfilesList: updateProfilesList,
    updateSPBindingSection: updateSPBindingSection,
    updateSPConnProfileList: updateSPConnProfileList,
    updateSPOverrideIndicators: updateSPOverrideIndicators,
    updateSettingsUI: updateSettingsUI
});

function createToolCallEl(tc) {
    const item = document.createElement('div');
    item.className = 'iv-tool-call-item iv-inline-tool-call';
    item.dataset.toolId = tc.id;
    const def = TOOL_DEFINITIONS.find(d => d.name === tc.name);
    const iconClass = def?.icon || 'fa-screwdriver-wrench';
    
    const isWarning = tc.status === 'warning';
    const statusClass = tc.status === 'running' ? 'running' : tc.status === 'error' ? 'error' : isWarning ? 'warning' : 'done';
    const statusLabel = tc.status === 'running' ? 'Running' : tc.status === 'error' ? 'Error' : isWarning ? 'Unavailable' : 'Done';
    const colorStyle = isWarning ? 'color: var(--iv-warning, #ffb432);' : '';

    const spinnerHtml = tc.status === 'running' ? '<span class="iv-tool-spin">⟳</span> ' : '';
    const iconHtml = tc.status === 'running'
        ? '<span class="iv-tool-spin" style="font-size:11px">⟳</span>'
        : `<i class="fa-solid ${iconClass}" style="font-size:11px"></i>`;

    item.innerHTML = `<div class="iv-tool-call-header">
<div class="iv-tool-call-icon ${statusClass}" ${isWarning ? `style="${colorStyle}"` : ''}>${iconHtml}</div>
<div class="iv-tool-call-name">${escHtml(def?.label || tc.name)}</div>
<div class="iv-tool-call-status ${statusClass}" ${isWarning ? `style="${colorStyle}"` : ''}>${spinnerHtml}${escHtml(statusLabel)}</div>
<div class="iv-tool-call-chevron">▶</div>
</div>
<div class="iv-tool-call-body">
<div class="iv-tool-call-section-label">Input</div>
<pre class="iv-tool-call-args">${escHtml(JSON.stringify(tc.input, null, 2))}</pre>
${tc.result !== undefined ? `<div class="iv-tool-call-section-label" style="margin-top:8px">Result</div><pre class="iv-tool-call-result${tc.status === 'error' ? ' error-result' : ''}" ${isWarning ? `style="${colorStyle}"` : ''}>${escHtml(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2))}</pre>` : ''}
</div>`;
    item.querySelector('.iv-tool-call-header').addEventListener('click', () => {
        const isOpen = !item.classList.contains('open');
        _dbgAdd('TOOL_CALL_HEADER_TOGGLE', { toolId: tc.id, open: isOpen });
        item.classList.toggle('open');
    });
    return item;
}

function postProcessToolCalls(containerEl, toolCalls) {
    if (!toolCalls || !toolCalls.length) return;
    containerEl.querySelectorAll('.iv-tool-call-ph').forEach((ph) => {
        const idx = parseInt(ph.dataset.tcid, 10);
        const tc = toolCalls[idx];
        if (tc) ph.replaceWith(createToolCallEl(tc));
    });

    const allTCs = [...containerEl.querySelectorAll('.iv-inline-tool-call')];
    allTCs.forEach(tc => tc.classList.remove('iv-tc-chain-start','iv-tc-chain-mid','iv-tc-chain-end'));
    
    let i = 0;
    while (i < allTCs.length) {
        let end = i;
        while (end + 1 < allTCs.length) {
            let sib = allTCs[end].nextSibling;
            while (sib && ((sib.nodeType === Node.TEXT_NODE && !sib.textContent.trim()) || sib.tagName === 'BR')) {
                sib = sib.nextSibling;
            }
            if (sib === allTCs[end + 1]) end++; else break;
        }
        if (end > i) {
            for (let j = i; j <= end; j++) {
                if (j === i) allTCs[j].classList.add('iv-tc-chain-start');
                else if (j === end) allTCs[j].classList.add('iv-tc-chain-end');
                else allTCs[j].classList.add('iv-tc-chain-mid');
            }
        } else {
            allTCs[i].classList.add('iv-tc-chain-start', 'iv-tc-chain-end');
        }
        i = end + 1;
    }
}

function setupToolsSettingsUI() {
    const s = getSettings();
    const listEl = document.getElementById('iv-sp-tools-list');
    if (!listEl) return;
    
    const ta = document.getElementById('iv-sp-tools-prompt');
    if (ta) {
        ta.value = s.toolsSystemPrompt || ''; 
        ta.addEventListener('input', () => { getSettings().toolsSystemPrompt = ta.value; saveSettings(); });
    }
    
    document.getElementById('iv-sp-tools-reset')?.addEventListener('click', () => {
        getSettings().toolsSystemPrompt = DEFAULT_TOOLS_PROMPT; saveSettings();
        if (ta) ta.value = DEFAULT_TOOLS_PROMPT;
    });

    const setC = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setC('iv-sp-tools-enabled', s.toolsEnabled);
    setV('iv-sp-tools-max-rounds', s.toolsMaxRounds ?? 5);

    document.getElementById('iv-sp-tools-enabled')?.addEventListener('change', e => {
        getSettings().toolsEnabled = e.target.checked; saveSettings();
        const stEl = document.getElementById('iv-tools-enabled'); if (stEl) stEl.checked = e.target.checked;
    });
    document.getElementById('iv-sp-tools-max-rounds')?.addEventListener('input', e => {
        getSettings().toolsMaxRounds = parseInt(e.target.value) || 5; saveSettings();
    });

    const streamingOff = s.forceStreaming === 'off';

    listEl.innerHTML = '';
    for (const tool of TOOL_DEFINITIONS) {
        const row = document.createElement('div');
        row.className = 'iv-tool-toggle-row';
        const isEnabled = s[tool.settingKey] !== false;
        const isAskUser = tool.id === 'ask_user';
        const isDisabledByStream = isAskUser && streamingOff;
        const iconHtml = `<i class="fa-solid ${tool.icon}" style="width:13px;text-align:center;margin-right:4px;opacity:.7"></i>`;
        row.innerHTML = `<label class="iv-sp-check" style="flex:1${isDisabledByStream ? ';opacity:.45;pointer-events:none' : ''}"><input type="checkbox" id="iv-sp-tool-${tool.id}" ${isEnabled && !isDisabledByStream ? 'checked' : ''} ${isDisabledByStream ? 'disabled' : ''}><span class="iv-tool-toggle-name">${iconHtml}${escHtml(tool.label)}</span></label>`;
        const descEl = document.createElement('div');
        descEl.className = 'iv-tool-toggle-desc';
        descEl.style.cssText = 'font-size:10px;color:var(--iv-text-muted);margin-top:2px;padding-left:20px';
        descEl.textContent = isDisabledByStream ? '⚠ Unavailable — requires streaming to be enabled (not "Force Off")' : tool.description;
        if (isDisabledByStream) descEl.style.color = 'var(--iv-danger)';
        row.appendChild(descEl);
        if (!isDisabledByStream) {
            row.querySelector(`#iv-sp-tool-${tool.id}`)?.addEventListener('change', e => {
                getSettings()[tool.settingKey] = e.target.checked; saveSettings();
            });
        }
        listEl.appendChild(row);
    }

    document.getElementById('iv-open-tools-settings')?.addEventListener('click', () => {
        openSettingsPanel();
        setTimeout(() => {
            const tab = document.querySelector('[data-sptab="tools"]');
            if (tab) tab.click();
        }, 80);
    });
}

async function executeAskUser(input, msgEl) {
    const question = input.question || 'Do you have any additional information?';
    const context = input.context || '';
    return new Promise(resolve => {
        const wrap = document.createElement('div');
        wrap.className = 'iv-tool-ask-wrap';
        if (context) {
            const ctx = document.createElement('div');
            ctx.style.cssText = 'font-size:10px;color:var(--iv-text-muted);margin-bottom:6px;font-style:italic';
            ctx.textContent = context;
            wrap.appendChild(ctx);
        }
        const q = document.createElement('div');
        q.className = 'iv-tool-ask-question';
        q.textContent = question;
        wrap.appendChild(q);
        const inp = document.createElement('textarea');
        inp.className = 'iv-tool-ask-input';
        inp.placeholder = 'Your answer…';
        inp.rows = 2;
        wrap.appendChild(inp);
        const btn = document.createElement('button');
        btn.className = 'iv-tool-ask-submit';
        btn.textContent = 'Submit Answer';
        btn.addEventListener('click', () => {
            const answer = inp.value.trim();
            if (!answer) return;

            _dbgAdd('ASK_USER_SUBMIT', { question, answer });

            wrap.remove();
            resolve(answer);
        });
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); }
        });
        wrap.appendChild(btn);
        const body = msgEl?.querySelector('.iv-msg-body');
        if (body) body.appendChild(wrap);
        inp.focus();
    });
}

var featureToolsUi = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createToolCallEl: createToolCallEl,
    executeAskUser: executeAskUser,
    postProcessToolCalls: postProcessToolCalls,
    setupToolsSettingsUI: setupToolsSettingsUI
});

let apiMod = null;
Promise.resolve().then(function () { return api; }).then(m => apiMod = m);
let uiWinMod = null;
Promise.resolve().then(function () { return uiWindow; }).then(m => uiWinMod = m);
let uiWdgMod = null;
Promise.resolve().then(function () { return uiWidgets; }).then(m => uiWdgMod = m);
let uiSetMod = null;
Promise.resolve().then(function () { return uiSettings; }).then(m => uiSetMod = m);

// ─── Segments ────────────────────────────────────────────────────────────────
// The window renders one continuous inner conversation, segmented by anchor:
// every exchange presents under a marker naming the main-chat message it
// happened under. These helpers are pure conversation → view-model mapping so
// the designed rendering stays thin.

const ANCHOR_EXCERPT_MAX = 48;

// Drop comments, tags, fences, and leftover markdown marks so the excerpt
// starts on words a person can actually read.
function readableAnchorText(mes) {
    let text = String(mes || '');
    text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
    text = text.replace(/```[\s\S]*?(?:```|$)/g, ' ');
    text = text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
    text = text.replace(/[`*_#>]+/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
}

// A human label for an exchange's anchor: the main-chat message number
// (same #N badge main chat shows), who spoke, and the first readable words.
// Falls back when the anchor is unanchored (pre-story) or no longer
// resolvable (main chat has moved on).
function segmentAnchorLabel(anchorIndex) {
    if (anchorIndex === null || anchorIndex === undefined) return 'Unanchored';
    let chat = [];
    try { chat = SillyTavern.getContext().chat || []; } catch (_) {}
    const msg = chat[anchorIndex];
    if (!msg) return `Main chat · message ${anchorIndex + 1}`;
    const who = msg.is_user ? 'You' : (msg.name || 'Char');
    const text = readableAnchorText(msg.mes);
    if (!text) return `#${anchorIndex} · ${who}`;
    const excerpt = text.length > ANCHOR_EXCERPT_MAX
        ? `${text.slice(0, ANCHOR_EXCERPT_MAX).trimEnd()}…`
        : text;
    return `#${anchorIndex} · ${who} · ${excerpt}`;
}

// An exchange is closed once its anchor is no longer the live edge — the
// story has moved on, so the segment reads but never grows.
function isSegmentClosed(anchorIndex) {
    const anchor = anchorIndex === undefined ? null : anchorIndex;
    return anchor !== getLiveEdgeIndex();
}

function nearestSegmentAbove(conversation, anchorIndex) {
    const segments = getExchanges(conversation);
    const idx = segments.findIndex(s => s.anchorIndex === anchorIndex);
    if (idx <= 0) return null;
    return segments[idx - 1].anchorIndex;
}

function nearestSegmentBelow(conversation, anchorIndex) {
    const segments = getExchanges(conversation);
    const idx = segments.findIndex(s => s.anchorIndex === anchorIndex);
    if (idx === -1 || idx === segments.length - 1) return null;
    return segments[idx + 1].anchorIndex;
}

// ─── Text Render and Markdown ────────────────────────────────────────────────

function renderMarkdown(text) {
    const codeBlocks = [];
    let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        if (lang && lang.toLowerCase() === 'html') {
            const id = `iv-hb-${state.htmlBlockCounter++}`;
            state.htmlBlockRegistry.set(id, code.trim());
            return `\x00H${id}\x00`;
        }
        const i = codeBlocks.length;
        const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(`<pre class="iv-code-block${lang ? ` lang-${lang}` : ''}"><code>${escaped}</code></pre>`);
        return `\x00B${i}\x00`;
    });

    out = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/`([^`\n]+)`/g, '<code class="iv-inline-code">$1</code>');

    const applyInline = (s) => {
        let res = s;
        res = res.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        res = res.replace(/~~(.+?)~~/g, '<del>$1</del>');
        res = res.replace(/\*([^<>\*\n]+)\*/g, '<em>$1</em>');
        return res;
    };

    const lines = out.split('\n');

    const getULIndent = (l) => { const m = l.match(/^(\s*)[*\-+]\s+\S/); return m ? m[1].length : -1; };
    const getOLIndent = (l) => { const m = l.match(/^(\s*)\d+\.\s+\S/); return m ? m[1].length : -1; };
    const isListLine = (l) => getULIndent(l) >= 0 || getOLIndent(l) >= 0;

    const buildNestedList = (listLines) => {
        const stack = [];
        let r = '';
        const closeUntil = (targetIndent, targetType) => {
            while (stack.length) {
                const top = stack[stack.length - 1];
                if (top.indent > targetIndent || (top.indent === targetIndent && top.type !== targetType)) {
                    r += `</li></${top.type}>`;
                    stack.pop();
                } else {
                    break;
                }
            }
        };
        for (let line of listLines) {
            if (!line.trim()) continue;
            if (!isListLine(line)) {
                r += `<br>${applyInline(line.trim())}`;
                continue;
            }
            const ulI = getULIndent(line);
            const olI = getOLIndent(line);
            const indent = ulI >= 0 ? ulI : olI;
            const type = ulI >= 0 ? 'ul' : 'ol';
            const cls = `iv-list${type === 'ol' ? ' iv-list-ol' : ''}`;
            
            let content = type === 'ul'
                ? line.replace(/^\s*[*\-+]\s+/, '')
                : line.replace(/^\s*\d+\.\s+/, '');
            
            content = applyInline(content);
            closeUntil(indent, type);
            
            if (stack.length && stack[stack.length - 1].indent === indent && stack[stack.length - 1].type === type) {
                r += `</li><li>${content}`;
            } else {
                r += `<${type} class="${cls}"><li>${content}`;
                stack.push({ indent, type });
            }
        }
        while (stack.length) r += `</li></${stack.pop().type}>`;
        return r;
    };

    const segs = [];
    const pushBlock = (h) => segs.push({ t: 'block', h });
    const pushInline = (h) => segs.push({ t: 'inline', h });

    let listBuf = [];
    let tableRows = [];
    let bqLines = [];

    const flushList = () => {
        if (!listBuf.length) return;
        pushBlock(buildNestedList(listBuf));
        listBuf = [];
    };
    const flushTable = () => {
        if (!tableRows.length) return;
        pushBlock(`<div class="iv-table-wrap"><table class="iv-table"><tbody>${tableRows.join('')}</tbody></table></div>`);
        tableRows = [];
    };
    const flushBq = () => {
        if (!bqLines.length) return;
        pushBlock(`<blockquote class="iv-blockquote">${bqLines.join('<br>')}</blockquote>`);
        bqLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimLine = line.trim();

        if (/^(---+|\*\*\*+|___+)$/.test(trimLine)) {
            flushList(); flushTable(); flushBq();
            pushBlock('<hr class="iv-hr">');
            continue;
        }

        const hm = line.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
            flushList(); flushTable(); flushBq();
            pushBlock(`<span class="iv-h${hm[1].length}">${applyInline(hm[2])}</span>`);
            continue;
        }

        const bq = line.match(/^&gt;\s*(.*)/);
        if (bq) { flushList(); flushTable(); bqLines.push(applyInline(bq[1])); continue; }

        const tm = trimLine.match(/^\|(.*)\|$/);
        if (tm) {
            flushList(); flushBq();
            if (/^[|\s\-:]+$/.test(trimLine)) continue;
            const cells = tm[1].split('|').map(c => applyInline(c.trim()));
            const tag = tableRows.length === 0 ? 'th' : 'td';
            tableRows.push(`<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`);
            continue;
        }

        if (isListLine(line)) {
            flushTable(); flushBq();
            listBuf.push(line);
            continue;
        }

        if (listBuf.length > 0 && trimLine && /^\s+/.test(line)) {
            listBuf.push(line);
            continue;
        }

        if (!trimLine) {
            let nextNonEmpty = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim()) { nextNonEmpty = lines[j]; break; }
            }
            if (nextNonEmpty && isListLine(nextNonEmpty)) {
                listBuf.push('');
            } else {
                flushList(); flushTable(); flushBq();
                pushInline('');
            }
            continue;
        }

        flushList(); flushTable(); flushBq();
        pushInline(applyInline(line));
    }
    flushList(); flushTable(); flushBq();

    let result = '';
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.t === 'inline' && i > 0 && segs[i - 1].t === 'inline') result += '<br>';
        result += seg.h;
    }
    out = result;

    out = out.replace(/\x00H(iv-hb-\d+)\x00/g, (_, id) => `<div class="iv-html-block-ph" data-hbid="${id}"></div>`);
    out = out.replace(/\x00B(\d+)\x00/g, (_, i) => codeBlocks[+i]);
    out = out.replace(/\x00TC_(\d+)\x00/g, (_, i) => `<div class="iv-tool-call-ph" data-tcid="${i}"></div>`);
    out = out.replace(/(<div class="iv-tool-call-ph"[^>]*><\/div>)(?:<br>|\s)*/g, '$1');

    return out;
}

function prepareHtmlForIframe(code) {
    const cs = `<script>(function(){
function isTransparent(c){return !c||c==='transparent'||c==='rgba(0, 0, 0, 0)'||c==='rgba(0,0,0,0)';}
function hasVisualBg(el){
if(!el) return false;
var cs=window.getComputedStyle(el);
if(!isTransparent(cs.backgroundColor)) return true;
if(cs.backgroundImage&&cs.backgroundImage!=='none') return true;
return false;
}
function applyFallbackTheme(){
var b=document.body,d=document.documentElement;
var hasBg=false;
if(hasVisualBg(d)||hasVisualBg(b)) hasBg=true;
if(!hasBg){
    var styled=document.querySelectorAll('[style]');
    for(var i=0;i<styled.length;i++){if(hasVisualBg(styled[i])){hasBg=true;break;}}
}
if(!hasBg){
    var styleText='';
    var styleEls=document.querySelectorAll('style');
    for(var j=0;j<styleEls.length;j++) styleText+=styleEls[j].textContent;
    if(/(?:body|html|:root)\s*\{[^}]*background/i.test(styleText)) hasBg=true;
}
if(!hasBg){
    b.style.backgroundColor='#ffffff';
    b.style.color='#1a1a1a';
    window.parent.postMessage({type:'iv-iframe-bg',hasBg:false},'*');
} else {
    window.parent.postMessage({type:'iv-iframe-bg',hasBg:true},'*');
}
}
function sh(){var b=document.body,d=document.documentElement;var h=Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0,d.scrollHeight,d.offsetHeight);window.parent.postMessage({type:'iv-iframe-h',h:h},'*');}
window.addEventListener('load',function(){
applyFallbackTheme();
sh();setTimeout(sh,150);setTimeout(sh,500);
if(window.ResizeObserver&&document.body){new ResizeObserver(sh).observe(document.body);}
else{var t;try{new MutationObserver(function(){clearTimeout(t);t=setTimeout(sh,80);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});}catch(e){}}
});
window.onerror=function(m){window.parent.postMessage({type:'iv-iframe-err',msg:String(m)},'*');return true;};
})();<\/script>`;
    const hasHtml = /<html[\s>]/i.test(code);
    if (hasHtml) {
        return /<\/body>/i.test(code) ? code.replace(/<\/body>/i, cs + '</body>') : code + cs;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;padding:8px;font-family:system-ui,sans-serif;background:transparent}</style></head><body>${code}${cs}</body></html>`;
}

function createHTMLBlockEl(code) {
    const wrap = document.createElement('div');
    wrap.className = 'iv-html-block';

    const toolbar = document.createElement('div');
    toolbar.className = 'iv-html-block-toolbar';
    const label = document.createElement('span');
    label.className = 'iv-html-block-label';
    label.textContent = 'HTML';
    const previewBtn = document.createElement('button');
    previewBtn.className = 'iv-html-block-btn active';
    previewBtn.textContent = 'Preview';
    const codeBtn = document.createElement('button');
    codeBtn.className = 'iv-html-block-btn';
    codeBtn.textContent = 'Code';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'iv-html-block-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', e => { e.stopPropagation(); copyText(code); });
    toolbar.append(label, previewBtn, codeBtn, copyBtn);

    const errorEl = document.createElement('div');
    errorEl.className = 'iv-html-block-error';
    errorEl.style.display = 'none';

    const iframe = document.createElement('iframe');
    iframe.className = 'iv-html-block-iframe';
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock allow-downloads');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = prepareHtmlForIframe(code);

    const codePre = document.createElement('pre');
    codePre.className = 'iv-code-block iv-html-block-code';
    codePre.style.display = 'none';
    codePre.textContent = code;

    previewBtn.addEventListener('click', () => {
        iframe.style.display = '';
        codePre.style.display = 'none';
        previewBtn.classList.add('active');
        codeBtn.classList.remove('active');
    });
    codeBtn.addEventListener('click', () => {
        iframe.style.display = 'none';
        codePre.style.display = '';
        codeBtn.classList.add('active');
        previewBtn.classList.remove('active');
    });

    wrap.append(toolbar, errorEl, iframe, codePre);
    return wrap;
}

function postProcessHTMLBlocks(el) {
    el.querySelectorAll('.iv-html-block-ph').forEach(ph => {
        const code = state.htmlBlockRegistry.get(ph.dataset.hbid);
        if (code !== undefined) ph.replaceWith(createHTMLBlockEl(code));
    });
}

function getDisplayContent(rawText, settings) {
    let text = rawText;
    const trimLines = (settings.reasoningTrimStrings || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const ts of trimLines) text = text.split(ts).join('');
    
    const pats = [/<think>([\s\S]*?)<\/think>/i, /<thinking>([\s\S]*?)<\/thinking>/i];
    let reasoning = null;
    for (const p of pats) {
        const m = text.match(p);
        if (m) { reasoning = m[1].trim() || null; text = text.replace(m[0], '').trim(); break; }
    }
    return { reasoning, content: text };
}

function extractToolCallPlaceholders(text, startIndex = 0) {
    let tcIndex = startIndex;
    let result = text;
    
    result = result.replace(/```tool_call\n?([\s\S]*?)```/gi, (match, inner) => {
        const blockTcs = parseToolCallsFromText(`\`\`\`tool_call\n${inner}\n\`\`\``);
        let phs = '';
        const count = Math.max(1, blockTcs.length);
        for (let i = 0; i < count; i++) {
            phs += `\x00TC_${tcIndex++}\x00`;
        }
        return phs;
    });
    
    result = result.replace(/```tool_call\n?([\s\S]*)$/gi, (match, inner) => {
        const blockTcs = parseToolCallsFromText(`\`\`\`tool_call\n${inner}\n\`\`\``);
        let phs = '';
        const count = Math.max(1, blockTcs.length);
        for (let i = 0; i < count; i++) {
            phs += `\x00TC_${tcIndex++}\x00`;
        }
        return phs;
    });
    
    return { text: result, nextIndex: tcIndex };
}

// ─── Rendering messages ──────────────────────────────────────────────────────

function _renderMsgBodyContent(msgEl, msg) {
    const settings = getSettings();
    msgEl.querySelectorAll('.iv-tool-call-item').forEach(c => c.remove());

    const cleanContent = stripMemoryBlock(msg.content);
    let displayText = cleanContent;
    let reasoning = msg.reasoning !== undefined ? (msg.reasoning || null) : null;

    let tcIndex = 0;
    if (reasoning) {
        const resR = extractToolCallPlaceholders(reasoning, tcIndex);
        reasoning = resR.text;
        tcIndex = resR.nextIndex;
    }
    
    const resC = extractToolCallPlaceholders(displayText, tcIndex);
    displayText = resC.text;
    tcIndex = resC.nextIndex;

    if (msg.reasoning === undefined || msg.reasoning === null) {
        const d = getDisplayContent(displayText, settings);
        reasoning = d.reasoning;
        displayText = d.content;
        if (msg.reasoning === undefined) msg.reasoning = reasoning;
    }

    const body = msgEl.querySelector('.iv-msg-body');
    if (!body) return;


    let rBlock = msgEl.querySelector('.iv-reasoning-block');
    if (reasoning) {
        if (!rBlock) {
            rBlock = document.createElement('details');
            rBlock.className = 'iv-reasoning-block';
            rBlock.innerHTML = `<summary class="iv-reasoning-summary">Reasoning</summary><div class="iv-reasoning-content"></div>`;
            body.insertBefore(rBlock, body.firstChild);
        }
        rBlock.style.display = '';
        rBlock.querySelector('.iv-reasoning-content').innerHTML = renderMarkdown(reasoning);
        postProcessHTMLBlocks(rBlock.querySelector('.iv-reasoning-content'));
    } else if (rBlock) {
        rBlock.remove();
    }

    const contentEl = msgEl.querySelector('.iv-msg-content');

    if (contentEl) {
        contentEl.innerHTML = renderMarkdown(getDisplayContent(displayText, settings).content);
        postProcessHTMLBlocks(contentEl);
    }

    _updateMsgTokenCount(msgEl, msg.content, true);

    let liveTCs = msg.toolCalls || [];
    if (!liveTCs.length && tcIndex > 0) {
        liveTCs = parseToolCallsFromText((msg.reasoning || '') + '\n' + msg.content).map((tc, i) => ({
            id: `past_${i}`, name: tc.name, input: tc.input, status: 'done', result: 'Result hidden/expired'
        }));
    }
    if (liveTCs.length) {
        postProcessToolCalls(msgEl, liveTCs);
    }
}

function _updateMsgTokenCount(msgEl, content, forceRecalc = false) {
    const el = msgEl.querySelector ? msgEl.querySelector('.iv-msg-token-count') : null;
    if (!el) return;
    if (!forceRecalc) {
        const cached = state.tokenCountCache.get(content);
        if (cached !== undefined) { el.textContent = `${cached}t`; return; }
    } else {
        el.textContent = '\u2026';
    }
    if (apiMod) {
        apiMod.estimateTokens(content).then(n => {
            state.tokenCountCache.set(content, n);
            if (el.isConnected) el.textContent = `${n}t`;
        });
    }
}

function createMsgEl(msg, onCopy, onEdit, onDelete, onRegen) {
    const isUser = msg.role === 'user';
    const wrap = document.createElement('div');
    wrap.className = `iv-msg ${isUser ? 'iv-msg-user' : 'iv-msg-assistant'}`;
    wrap.dataset.id = msg.id;
    wrap.dataset.anchorIndex = encodeAnchor(msg.anchorIndex);
    const closed = isSegmentClosed(msg.anchorIndex);
    if (closed) wrap.classList.add('iv-segment-closed');

    const avatarWrap = document.createElement('div');
    avatarWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0';

    const avatar = document.createElement('div');
    avatar.className = 'iv-msg-avatar';
    avatar.innerHTML = isUser ? I.user : I.bot;

    const tokenCountEl = document.createElement('div');
    tokenCountEl.className = 'iv-msg-token-count';
    tokenCountEl.textContent = '…';
    _updateMsgTokenCount({ querySelector: () => tokenCountEl, isConnected: true }, msg.content);

    avatarWrap.appendChild(avatar);
    avatarWrap.appendChild(tokenCountEl);

    const body = document.createElement('div');
    body.className = 'iv-msg-body';

    const content = document.createElement('div');
    content.className = 'iv-msg-content';
    body.appendChild(content);

    const meta = document.createElement('div');
    meta.className = 'iv-msg-meta';
    meta.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const actions = document.createElement('div');
    actions.className = 'iv-msg-actions';

    const makeBtn = (icon, label, cls, cb) => {
        const b = document.createElement('button');
        b.className = `iv-msg-btn${cls ? ' ' + cls : ''}`;
        b.innerHTML = icon; b.title = label;
        b.addEventListener('click', cb);
        return b;
    };

    actions.appendChild(makeBtn(I.copy, 'Copy', '', () => onCopy(msg)));
    actions.appendChild(makeBtn(I.edit, 'Edit', '', () => onEdit(wrap, msg)));
    // Generation affordances only exist on the live edge: a turn whose anchor
    // has fallen behind the story presents as closed — past exchanges stay
    // readable and editable but never regrow (regen, swipes, or Continue).
    if (!closed) actions.appendChild(makeBtn(I.refresh, 'Regen', '', () => onRegen(wrap, msg)));
    actions.appendChild(makeBtn(I.trash, 'Delete', 'iv-msg-btn-danger', () => onDelete(wrap, msg)));

    if (!isUser && !closed) {
        const continueBtn = makeBtn(I.continueArrow, 'Continue response', 'iv-msg-btn-continue', () => {
            if (apiMod) apiMod.runContinue(getConversation(), msg.id);
        });
        actions.appendChild(continueBtn);
    }

    body.appendChild(actions); body.appendChild(meta);

    if (!isUser) {
        const swipeBar = document.createElement('div');
        swipeBar.className = 'iv-swipe-bar';
        swipeBar.style.display = 'none';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'iv-swipe-btn iv-swipe-prev';
        prevBtn.innerHTML = I.chevronLeft;
        prevBtn.title = 'Previous swipe';
        prevBtn.disabled = true;

        const counter = document.createElement('span');
        counter.className = 'iv-swipe-counter';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'iv-swipe-btn iv-swipe-next';
        nextBtn.innerHTML = I.chevronRight;
        nextBtn.title = 'New swipe (regenerate)';

        prevBtn.addEventListener('click', async () => {
            if (prevBtn.disabled || state.generating) return;
            const conversation = getConversation();
            if (!getSwipesForMsg(conversation, msg.id)) return;
            
            const bdy = wrap.querySelector('.iv-msg-body');
            if (bdy) {
                bdy.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
                bdy.classList.add('iv-swipe-anim-out-right'); 
                await new Promise(r => setTimeout(r, 150));
            }
            
            if (navigateSwipe(conversation, msg.id, -1)) {
                if (bdy) {
                    bdy.classList.remove('iv-swipe-anim-out-right');
                    void bdy.offsetWidth;
                    bdy.classList.add('iv-swipe-anim-left'); 
                }
                _renderMsgBodyContent(wrap, conversation.messages.find(m => m.id === msg.id));
                updateSwipeBar(wrap, conversation, msg.id);
            }
        });

        nextBtn.addEventListener('click', async () => {
            if (nextBtn.disabled || state.generating) return;
            const conversation = getConversation();
            const msgData = conversation.messages.find(m => m.id === msg.id);
            if (!msgData) return;
            
            if (msgData.swipeIndex !== undefined && msgData.swipeIndex < (msgData.swipes?.length || 1) - 1) {
                const bdy = wrap.querySelector('.iv-msg-body');
                if (bdy) {
                    bdy.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
                    bdy.classList.add('iv-swipe-anim-out-left'); 
                    await new Promise(r => setTimeout(r, 150));
                }

                if (navigateSwipe(conversation, msg.id, 1)) {
                    if (bdy) {
                        bdy.classList.remove('iv-swipe-anim-out-left');
                        void bdy.offsetWidth;
                        bdy.classList.add('iv-swipe-anim-right'); 
                    }
                    _renderMsgBodyContent(wrap, conversation.messages.find(m => m.id === msg.id));
                    updateSwipeBar(wrap, conversation, msg.id);
                }
            } else {
                _dbgAdd('SWIPE_REGEN_TRIGGERED', { msgId: msg.id });
                _runSwipeRegen(conversation, msg.id, wrap);
            }
        });

        swipeBar.appendChild(prevBtn);
        swipeBar.appendChild(counter);
        swipeBar.appendChild(nextBtn);
        body.appendChild(swipeBar);
    }

    wrap.appendChild(avatarWrap); wrap.appendChild(body);
    _renderMsgBodyContent(wrap, msg);
    
    return wrap;
}

// ─── Swipes and Generation ──────────────────────────────────────────────────────

function getLastAssistantMsgId(conversation) {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
        const m = conversation.messages[i];
        if (m.role === 'user') return null;
        if (m.role === 'assistant') {
            return m.id;
        }
    }
    return null;
}

function getSwipesForMsg(conversation, msgId) {
    const msg = conversation.messages.find(m => m.id === msgId);
    if (!msg) return null;
    if (!msg.swipes) msg.swipes = [{ content: msg.content, reasoning: msg.reasoning || null }];
    if (msg.swipeIndex === undefined) msg.swipeIndex = 0;
    return msg;
}

function addSwipe(conversation, msgId, content, reasoning = null) {
    const msg = getSwipesForMsg(conversation, msgId);
    if (!msg) return;
    msg.swipes.push({ content, reasoning: reasoning || null });
    msg.swipeIndex = msg.swipes.length - 1;
    msg.content = content;
    msg.reasoning = reasoning || null;
    saveConversation();
}

function navigateSwipe(conversation, msgId, dir) {
    const msg = getSwipesForMsg(conversation, msgId);
    if (!msg || msg.swipes.length < 2) return false;
    const newIdx = msg.swipeIndex + dir;
    if (newIdx < 0 || newIdx >= msg.swipes.length) return false;

    _dbgAdd('SWIPE_NAVIGATE', { msgId, dir, newIdx });

    msg.swipeIndex = newIdx;
    msg.content = msg.swipes[newIdx].content;
    msg.reasoning = msg.swipes[newIdx].reasoning || null;
    saveConversation();
    updateMsgCount(conversation);
    return true;
}

function updateSwipeBar(msgEl, conversation, msgId) {
    const bar = msgEl.querySelector('.iv-swipe-bar');
    if (!bar) return;
    const msg = conversation.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.swipes) {
        msg.swipes = [{ content: msg.content, reasoning: msg.reasoning || null }];
        msg.swipeIndex = 0;
    }
    const total = msg.swipes.length;
    const cur = (msg.swipeIndex ?? 0) + 1;
    const prevBtn = bar.querySelector('.iv-swipe-prev');
    const nextBtn = bar.querySelector('.iv-swipe-next');
    const counter = bar.querySelector('.iv-swipe-counter');
    if (prevBtn) prevBtn.disabled = cur <= 1 || state.generating;
    if (nextBtn) nextBtn.disabled = state.generating;
    if (counter) counter.innerHTML = `<span>${cur}</span>/${total}`;
    bar.style.display = '';
}

async function _runSwipeRegen(conversation, msgId, wrapEl) {
    if (state.generating) return;
    const msgData = conversation.messages.find(m => m.id === msgId);
    if (!msgData) return;

    if (!msgData.swipes) {
        msgData.swipes = [{ content: msgData.content, reasoning: msgData.reasoning || null }];
        msgData.swipeIndex = 0;
    }

    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    const body = wrapEl.querySelector('.iv-msg-body');
    if (body) {
        body.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
        body.classList.add('iv-swipe-anim-out-left');
        await new Promise(r => setTimeout(r, 150));
    }

    const placeholderContent = '';
    msgData.swipes.push({ content: placeholderContent, reasoning: null });
    msgData.swipeIndex = msgData.swipes.length - 1;
    msgData.content = placeholderContent;
    msgData.reasoning = null;
    saveConversation();

    updateSwipeBar(wrapEl, conversation, msgId);

    let streamContentEl = wrapEl.querySelector('.iv-msg-content');
    if (streamContentEl) streamContentEl.innerHTML = '';
    const rBlock = wrapEl.querySelector('.iv-reasoning-block');
    if (rBlock) rBlock.style.display = 'none';
    
    if (body) {
        body.classList.remove('iv-swipe-anim-out-left');
        void body.offsetWidth;
        body.classList.add('iv-swipe-anim-right');
    }

    let cursorEl = null;
    const cleanupCursor = () => { if (cursorEl?.parentNode) cursorEl.remove(); cursorEl = null; };

    const onChunk = (text, reasoning) => {
        if (!cursorEl) {
            cursorEl = document.createElement('span');
            cursorEl.className = 'iv-stream-cursor';
            const bar = document.getElementById('iv-thinking-bar');
            if (bar) bar.style.display = 'flex';
        }
        if (streamContentEl) {
            let procReasoning = reasoning || '';
            let procText = stripMemoryBlock(text);
            let tcIndex = 0;
            
            if (procReasoning) {
                const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                procReasoning = resR.text;
                tcIndex = resR.nextIndex;
            }
            const resC = extractToolCallPlaceholders(procText, tcIndex);
            procText = resC.text;

            const { content: disp } = getDisplayContent(procText, settings);
            streamContentEl.innerHTML = renderMarkdown(disp);
            if (procText) streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (tcIndex > 0) {
                const liveTCs = parseToolCallsFromText((reasoning || '') + '\n' + text);
                const displayed = liveTCs.map((tc, i) => ({
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'done', result: undefined
                }));
                postProcessToolCalls(wrapEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    try {
        const tempConversation = { ...conversation, messages: conversation.messages.filter(m => m.id !== msgId) };
        if (!apiMod) throw new Error("API module not loaded");
        
        const builtMessages = await apiMod.assembleMessages(tempConversation, settings, null);
        const fullPromptText = builtMessages.map(m => m.content).join('\n');
        const tokensIn = await apiMod.estimateTokens(fullPromptText);

        const result = await apiMod.callGenerate(tempConversation, settings, null, onChunk);
        cleanupCursor();

        if (result === null) {
            msgData.swipes.pop();
            msgData.swipeIndex = msgData.swipes.length - 1;
            msgData.content = msgData.swipes[msgData.swipeIndex]?.content || '';
            msgData.reasoning = msgData.swipes[msgData.swipeIndex]?.reasoning || null;
            saveConversation();
            _renderMsgBodyContent(wrapEl, msgData);
            updateSwipeBar(wrapEl, conversation, msgId);
            return;
        }

        const { text: rawText, reasoning: fullReasoning } = result;
        const fullText = normalizeCharNamesInBlock(rawText);

        msgData.swipes[msgData.swipeIndex] = { content: fullText, reasoning: fullReasoning || null };
        msgData.content = fullText;
        msgData.reasoning = fullReasoning || null;
        saveConversation();

        _renderMsgBodyContent(wrapEl, msgData);
        updateSwipeBar(wrapEl, conversation, msgId);

        updateMsgCount(conversation);
        if (uiWdgMod) uiWdgMod.playCompletionSound();

    } catch(err) {
        cleanupCursor();
        msgData.swipes.pop();
        msgData.swipeIndex = msgData.swipes.length - 1;
        msgData.content = msgData.swipes[msgData.swipeIndex]?.content || '';
        msgData.reasoning = msgData.swipes[msgData.swipeIndex]?.reasoning || null;
        saveConversation();
        _renderMsgBodyContent(wrapEl, msgData);
        updateSwipeBar(wrapEl, conversation, msgId);

        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') ; 
        else { showGenerationError(err); }
    } finally {
        state.generating = false;
        setGeneratingState(false);
    }
}

function _refreshSwipeBars(conversation) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelectorAll('.iv-swipe-bar').forEach(bar => { bar.style.display = 'none'; });
    if (state.generating) return;
    const lastId = getLastAssistantMsgId(conversation);
    if (!lastId) return;
    const lastEl = c.querySelector(`.iv-msg[data-id="${lastId}"]`);
    if (!lastEl) return;
    if (lastEl.classList.contains('iv-segment-closed')) return;
    const swipeBar = lastEl.querySelector('.iv-swipe-bar');
    if (!swipeBar) return;
    updateSwipeBar(lastEl, conversation, lastId);
    swipeBar.style.display = '';
}

function _refreshContinueBtns() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelectorAll('.iv-msg-last-assistant').forEach(el => el.classList.remove('iv-msg-last-assistant'));
    if (state.generating) return;
    // Only live-edge turns are extendable; closed segments get no Continue.
    const all = [...c.querySelectorAll('.iv-msg-assistant:not(.iv-segment-closed)')];
    if (all.length) all[all.length - 1].classList.add('iv-msg-last-assistant');
}

// ─── Scroll ──────────────────────────────────────────────────────────────────

function scrollToBottom() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    state.userScrolledUp = false;
    
    // Делаем несколько попыток скролла, если окно еще не отрендерилось (например, при загрузке страницы)
    const tryScroll = (attempts = 0) => {
        if (c.offsetHeight > 0) {
            c.scrollTop = c.scrollHeight;
        } else if (attempts < 5) {
            setTimeout(() => tryScroll(attempts + 1), 50);
        }
    };
    tryScroll();
}

function saveScrollPosition() {
    const c = document.getElementById('iv-messages');
    // Сохраняем позицию ТОЛЬКО если окно сейчас открыто и отрендерено
    if (c && c.offsetHeight > 0) {
        state.savedScrollTop = c.scrollTop;
    }
}

function restoreScrollPosition() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    
    const tryRestore = (attempts = 0) => {
        if (c.offsetHeight > 0) {
            if (state.userScrolledUp && state.savedScrollTop !== undefined) {
                c.scrollTop = state.savedScrollTop;
            } else {
                c.scrollTop = c.scrollHeight;
            }
        } else if (attempts < 5) {
            setTimeout(() => tryRestore(attempts + 1), 50);
        }
    };
    tryRestore();
}

function smartScrollToBottom() {
    if (state.userScrolledUp) return;
    const c = document.getElementById('iv-messages');
    if (c) c.scrollTop = c.scrollHeight;
}

function setupMessagesScrollTracking() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.addEventListener('scroll', () => {
        state.userScrolledUp = c.scrollHeight - c.scrollTop - c.clientHeight > 80;
    }, { passive: true });
}

// ─── Message List and Handlers ──────────────────────────────────────────

function handleCopy(msg) { copyText(msg.content); }

function handleEdit(wrapEl, msg) {
    if (wrapEl.classList.contains('is-editing')) return;
    wrapEl.classList.add('is-editing');
    const { charId, chatId } = getBindingKey();
    const conversation = getConversation();
    const contentEl = wrapEl.querySelector('.iv-msg-content');
    const original = msg.content;

    const ta = document.createElement('textarea');
    ta.className = 'iv-edit-ta';
    ta.value = original;

    const row = document.createElement('div');
    row.className = 'iv-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'iv-edit-btn iv-edit-save';
    saveBtn.innerHTML = msg.role === 'user'
        ? `${I.check}<span>Save & Resend</span>`
        : `${I.check}<span>Save</span>`;

    const saveOnlyBtn = msg.role === 'user' ? document.createElement('button') : null;
    if (saveOnlyBtn) {
        saveOnlyBtn.className = 'iv-edit-btn iv-edit-cancel';
        saveOnlyBtn.innerHTML = `${I.check}<span>Save</span>`;
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'iv-edit-btn iv-edit-cancel';
    cancelBtn.innerHTML = `${I.x}<span>Cancel</span>`;

    row.appendChild(saveBtn);
    if (saveOnlyBtn) row.appendChild(saveOnlyBtn);
    row.appendChild(cancelBtn);
    contentEl.replaceWith(ta);
    wrapEl.querySelector('.iv-msg-actions').after(row);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    autoResize(ta); ta.addEventListener('input', () => autoResize(ta));

    const restoreMessageDOM = (textToRender) => {
        const nc = document.createElement('div');
        nc.className = 'iv-msg-content';

        let tcIndex = 0;
        const resR = extractToolCallPlaceholders(textToRender, tcIndex);
        const displayString = getDisplayContent(resR.text, getSettings()).content;

        nc.innerHTML = renderMarkdown(displayString);
        postProcessHTMLBlocks(nc);
        ta.replaceWith(nc);
        row.remove();
        wrapEl.classList.remove('is-editing');
        if (msg.toolCalls?.length) postProcessToolCalls(wrapEl, msg.toolCalls);
    };

    cancelBtn.addEventListener('click', () => {
        restoreMessageDOM(original);
    });

    if (saveOnlyBtn) {
        saveOnlyBtn.addEventListener('click', () => {
            const rawText = ta.value.trim();
            if (!rawText) return;
            const newText = expandMacros(rawText);
            
            const msgObj = conversation.messages.find(m => m.id === msg.id);
            if (msgObj) { msgObj.content = newText; saveConversation(); }
            
            msg.content = newText;
            if (msg.swipes && msg.swipeIndex !== undefined) {
                msg.swipes[msg.swipeIndex] = { content: newText, reasoning: msg.reasoning || null };
                saveConversation();
            }
            restoreMessageDOM(newText);
            _updateMsgTokenCount(wrapEl, newText, true);
        });
    }

    saveBtn.addEventListener('click', async () => {
        const rawText = ta.value.trim();
        if (!rawText) return;
        const newText = expandMacros(rawText);
        
        const msgObj = conversation.messages.find(m => m.id === msg.id);
        if (msgObj) { msgObj.content = newText; saveConversation(); }

        msg.content = newText;
        if (msg.swipes && msg.swipeIndex !== undefined) {
            msg.swipes[msg.swipeIndex] = { content: newText, reasoning: msg.reasoning || null };
            saveConversation();
        }
        restoreMessageDOM(newText);
        _updateMsgTokenCount(wrapEl, newText, true);
        
        truncateAfter(conversation, msg.id);
        removeMsgElAfter(msg.id);
        if (msg.role === 'user' && apiMod) await apiMod.runGenerate(conversation, newText, false);
    });
}

async function handleMessageRegen(wrapEl, msg) {
    if (state.generating) return;
    const conversation = getConversation();
    const idx = conversation.messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;

    const isUser = msg.role === 'user';
    const actualMsgsAfter = conversation.messages.slice(idx + 1);
    const msgsAfterCount = actualMsgsAfter.length;

    let needsConfirm = false;
    if (isUser) {
        if (msgsAfterCount > 1 || (msgsAfterCount === 1 && actualMsgsAfter[0].role !== 'assistant')) {
            needsConfirm = true;
        }
    } else {
        if (msgsAfterCount > 0) {
            needsConfirm = true;
        }
    }

    if (needsConfirm) {
        const ok = await showCustomDialog({
            type: 'confirm',
            title: 'Regenerate Message',
            message: 'Regenerating will delete all subsequent messages. Continue?'
        });
        if (!ok) return;
    }

    if (isUser) {
        truncateAfter(conversation, msg.id);
        removeMsgElAfter(msg.id);
        updateMsgCount(conversation);
        if (apiMod) apiMod.runGenerate(conversation, null, false);
    } else {
        if (msgsAfterCount > 0) {
            truncateAfter(conversation, msg.id);
            removeMsgElAfter(msg.id);
            updateMsgCount(conversation);
        }
        _runSwipeRegen(conversation, msg.id, wrapEl);
    }
}

async function handleDelete(wrapEl, msg) {
    const isUser = msg.role === 'user';
    const confirmed = await showCustomDialog({
        type: 'confirm',
        title: 'Delete Message',
        message: isUser
            ? 'Delete this message and all subsequent messages?'
            : 'Delete this assistant message?',
    });
    if (!confirmed) return;
    const conversation = getConversation();
    if (isUser) {
        truncateFrom(conversation, msg.id);
        removeMsgElAndBelow(msg.id);
    } else {
        deleteMsg(conversation, msg.id);
        removeMsgEl(msg.id);
    }
    updateMsgCount(conversation);
    if (!conversation.messages.length) renderConversation(conversation);
}

function encodeAnchor(anchorIndex) {
    return (anchorIndex === null || anchorIndex === undefined) ? 'none' : String(anchorIndex);
}

function decodeAnchor(value) {
    if (value === 'none' || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function paintHideControl(segment, conversation, anchorIndex) {
    const hidden = isExchangeHidden(conversation, anchorIndex);
    const locked = isAnchorHiddenInMainChat(anchorIndex) && !isExchangeManuallyHidden(conversation, anchorIndex);
    segment.classList.toggle('iv-segment-hidden', hidden);
    const btn = segment.querySelector('.iv-hide-toggle');
    if (!btn) return;
    btn.textContent = hidden ? 'Show' : 'Hide';
    btn.classList.toggle('active', hidden);
    btn.disabled = locked;
    btn.title = locked
        ? 'Hidden because its main-chat message is hidden'
        : hidden ? 'Show this exchange' : 'Hide this exchange';
}

function segmentAt(container, anchorIndex) {
    const segments = container.querySelectorAll('.iv-segment');
    const last = segments.length ? segments[segments.length - 1] : null;
    if (last && decodeAnchor(last.dataset.anchorIndex) === anchorIndex) return last;
    return null;
}

// The exchange's section: marker header plus its turns. Turns render inside
// it, so hiding and pruning follow the tree instead of sibling bookkeeping.
function ensureSegment(container, conversation, anchorIndex) {
    const existing = segmentAt(container, anchorIndex);
    if (existing) return existing;
    const segment = createSegment(conversation, anchorIndex);
    container.appendChild(segment);
    return segment;
}

function createSegment(conversation, anchorIndex) {
    const seg = document.createElement('section');
    seg.className = 'iv-segment';
    seg.dataset.anchorIndex = encodeAnchor(anchorIndex);

    const header = document.createElement('div');
    header.className = 'iv-anchor';
    header.title = 'Inner exchange under this main-chat message — click to snap to it';
    header.setAttribute('role', 'button');
    header.tabIndex = 0;

    const mark = document.createElement('span');
    mark.className = 'iv-anchor-mark';
    mark.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'iv-anchor-label';
    label.textContent = segmentAnchorLabel(anchorIndex);
    label.title = segmentAnchorLabel(anchorIndex);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iv-hide-toggle';
    btn.addEventListener('click', e => {
        e.stopPropagation();
        const conv = getConversation();
        setExchangeHidden(conv, anchorIndex, !isExchangeManuallyHidden(conv, anchorIndex));
        syncExchangeHiddenUi(conv);
    });

    header.appendChild(mark);
    header.appendChild(label);
    header.appendChild(btn);
    seg.appendChild(header);

    paintHideControl(seg, conversation, anchorIndex);
    return seg;
}

function syncExchangeHiddenUi(conversation = getConversation()) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelectorAll('.iv-segment').forEach(seg => {
        paintHideControl(seg, conversation, decodeAnchor(seg.dataset.anchorIndex));
    });
    // Hiding the live-edge exchange takes its Continue with it.
    if (!state.generating) _refreshContinueBtns();
}

function pruneSegments() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    for (const seg of [...c.children]) {
        if (!seg.classList?.contains('iv-segment')) continue;
        if (!seg.querySelector('.iv-msg')) seg.remove();
    }
}

function jumpToSegment(anchorIndex) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    const seg = c.querySelector(`.iv-segment[data-anchor-index="${encodeAnchor(anchorIndex)}"]`);
    if (!seg) return;
    seg.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function setupSegmentJumpNav(container) {
    if (!container) return;
    container.addEventListener('click', e => {
        const header = e.target.closest?.('.iv-anchor');
        if (!header) return;
        const seg = header.closest('.iv-segment');
        if (!seg) return;
        jumpToSegment(decodeAnchor(seg.dataset.anchorIndex));
    });
    container.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            const header = e.target.closest?.('.iv-anchor');
            if (!header) return;
            e.preventDefault();
            const seg = header.closest('.iv-segment');
            if (!seg) return;
            jumpToSegment(decodeAnchor(seg.dataset.anchorIndex));
        }
    });
}

function jumpToPrevSegment() {
    jumpToSegment(nearestSegmentAbove(getConversation(), state.currentSegmentAnchor ?? getLiveEdgeIndex()));
}

function jumpToNextSegment() {
    jumpToSegment(nearestSegmentBelow(getConversation(), state.currentSegmentAnchor ?? getLiveEdgeIndex()));
}

// The anchor of the segment that owns the message now on screen.
function anchorOnScreen() {
    const c = document.getElementById('iv-messages');
    if (!c) return state.currentSegmentAnchor ?? getLiveEdgeIndex();
    const msgs = [...c.querySelectorAll('.iv-msg')];
    if (!msgs.length) return getLiveEdgeIndex();
    let active = msgs.find(m => m.dataset.anchorIndex !== 'none');
    for (const m of msgs) {
        const r = m.getBoundingClientRect();
        if (r.height && r.bottom > c.getBoundingClientRect().top) { active = m; break; }
    }
    return active ? decodeAnchor(active.dataset.anchorIndex) : getLiveEdgeIndex();
}

function setupSegmentScrollTracking(container) {
    if (!container) return;
    let raf = null;
    container.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            state.currentSegmentAnchor = anchorOnScreen();
        });
    }, { passive: true });
}

function setupMainChatHideListener() {
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || typeof t.closest !== 'function') return;
        if (!t.closest('.mes_hide, .mes_unhide')) return;
        setTimeout(() => {
            Promise.resolve().then(function () { return simulationView; }).then(m => m.syncSimulationView()).catch(() => {});
            syncExchangeHiddenUi();
        }, 0);
    });
}

function renderConversation(conversation) {
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    updateSearchCount();
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.innerHTML = '';
    if (!conversation.messages.length) {
        c.innerHTML = `
            <div class="iv-empty-state">
                <div class="iv-empty-icon">${I.bot}</div>
                <div class="iv-empty-title">Inner Voice</div>
                <div class="iv-empty-sub">A private space to think, plan, and talk with yourself. Nothing here enters the scene.</div>
            </div>`;
        updateMsgCount(conversation);
        return;
    }
    for (const msg of conversation.messages) {
        const anchor = msg.anchorIndex === undefined ? null : msg.anchorIndex;
        const segment = ensureSegment(c, conversation, anchor);
        const el = createMsgEl(msg, handleCopy, handleEdit, handleDelete, handleMessageRegen);
        segment.appendChild(el);
    }
    updateMsgCount(conversation);
    _refreshContinueBtns();
    _refreshSwipeBars(conversation);
    requestAnimationFrame(() => scrollToBottom());
}

function appendMsgEl(msg, isStreamInit = false) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelector('.iv-empty-state')?.remove();

    const conversation = getConversation();
    const anchor = msg.anchorIndex === undefined ? null : msg.anchorIndex;
    const segment = ensureSegment(c, conversation, anchor);

    const el = createMsgEl(msg, handleCopy, handleEdit, handleDelete, handleMessageRegen);
    segment.appendChild(el);
    
    if (!isStreamInit) {
        const conversation = getConversation();
        updateMsgCount(conversation);
        _refreshContinueBtns();
        _refreshSwipeBars(conversation);
        requestAnimationFrame(() => scrollToBottom());

        if (state.searchOpen && state.searchQuery.trim()) {
            const newMarks = _applyHighlightsInRoot(el);
            if (newMarks.length) {
                state.searchMatches.push(...newMarks);
                updateSearchCount();
            }
        }
    }
}

function removeMsgEl(msgId) {
    const el = document.querySelector(`.iv-msg[data-id="${msgId}"]`);
    if (!el) return;
    el.remove();
    pruneSegments();
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

function removeMsgElAndBelow(msgId) {
    const c = document.getElementById('iv-messages'); if (!c) return;
    let found = false;
    for (const el of [...c.querySelectorAll('.iv-msg')]) {
        if (el.dataset.id === msgId) found = true;
        if (found) el.remove();
    }
    pruneSegments();
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

function removeMsgElAfter(msgId) {
    const c = document.getElementById('iv-messages'); if (!c) return;
    let found = false;
    for (const el of [...c.querySelectorAll('.iv-msg')]) {
        if (found) el.remove();
        if (el.dataset.id === msgId) found = true;
    }
    pruneSegments();
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

let _tokenCalcTid = null;
let _isTokenCalculating = false;
let _pendingTokenCalc = false;

function updateMsgCount(conversation) {
    const el = document.getElementById('iv-msg-count');
    if (el && conversation) el.textContent = `${conversation.messages.length} msgs`;

    const tel = document.getElementById('iv-token-count');
    if (!tel || !conversation) return;

    clearTimeout(_tokenCalcTid);
    _tokenCalcTid = setTimeout(() => {
        if (_isTokenCalculating) { _pendingTokenCalc = true; return; }

        const runCalc = async () => {
            _isTokenCalculating = true;
            try {
                const settings = getEffectiveSettings();
                const currentInput = document.getElementById('iv-input')?.value || '';
                
                if (apiMod && apiMod.assembleMessages && apiMod.estimateTokens) {
                    try {
                        const tempConv = { ...conversation, messages: [...conversation.messages] };
                        if (currentInput.trim()) {
                            tempConv.messages.push({ 
                                id: 'tmp', 
                                role: 'user', 
                                content: currentInput, 
                                timestamp: Date.now()
                            });
                        }
                        const builtMsgs = await apiMod.assembleMessages(tempConv, settings, null);
                        const fullText = builtMsgs.map(m => m.content).join('\n');
                        const tokens = await apiMod.estimateTokens(fullText);
                        const node = document.getElementById('iv-token-count');
                        if (node) node.textContent = `~${tokens} tkns`;
                        return;
                    } catch (e) {
                        console.warn(`[${EXT_DISPLAY}] Exact token calculation failed, falling back`, e);
                    }
                }

                const ctx = SillyTavern.getContext();
                const incHidden = !!settings.includeHiddenMessages;

                let totalChars = (settings.systemPrompt || '').length;

                const depth = Math.max(0, parseInt(settings.contextDepth) || 0);
                const chat = ctx.chat || [];
                let chatSlice = [];
                try {
                    const conv = getConversation();
                    const picked = conv?.pickedChatIndices;
                    if (picked && picked.length > 0) {
                        chatSlice = picked.filter(i => i >= 0 && i < chat.length).map(i => chat[i]);
                    } else if (depth > 0) {
                        chatSlice = chat.slice(-depth);
                    }
                } catch(_) {
                    if (depth > 0) chatSlice = chat.slice(-depth);
                }

                for (const m of chatSlice) {
                    if (!incHidden && (m.is_system || m.is_hidden || m.extra?.is_hidden || m.extra?.sc_ghosted)) continue;
                    totalChars += (m.mes || '').length;
                }

                const limit = Math.max(1, parseInt(settings.localHistoryLimit) || 50);
                for (const m of getVisibleTurns(conversation).slice(-limit)) {
                    totalChars += (m.content || '').length;
                }

                totalChars += currentInput.length;
                const count = Math.ceil(totalChars / 3.5);
                const node = document.getElementById('iv-token-count');
                if (node) node.textContent = `~${count} tkns`;
            } finally {
                _isTokenCalculating = false;
                if (_pendingTokenCalc) { _pendingTokenCalc = false; runCalc(); }
            }
        };
        runCalc();
    }, 400);
}

function updateDepthSlidersMax() {
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || window.chat ||[];
    const maxVal = Math.max(1, chat.length);
    
    if (state.lastChatLen === -1) {
        state.lastChatLen = maxVal;
    }

    const s = getSettings();
    const conv = getConversation();
    let settingsChanged = false;

    const globalDepth = parseInt(s.contextDepth) || 0;
    if (globalDepth >= state.lastChatLen && maxVal > state.lastChatLen) {
        s.contextDepth = maxVal;
        settingsChanged = true;
    }

    if (conv && conv.overrides && conv.overrides.contextDepth !== undefined) {
        const ovDepth = parseInt(conv.overrides.contextDepth) || 0;
        if (ovDepth >= state.lastChatLen && maxVal > state.lastChatLen) {
            conv.overrides.contextDepth = maxVal;
            settingsChanged = true;
        }
    }

    if (settingsChanged) {
        saveSettings();
    }

    state.lastChatLen = maxVal;
    const eff = getEffectiveSettings();

    const sliders =[
        { id: 'iv-depth-slider', valId: 'iv-depth-val', setting: s.contextDepth },
        { id: 'iv-sp-depth-slider', valId: 'iv-sp-depth-val', setting: s.contextDepth },
        { id: 'iv-sp-ov-depth-slider', valId: 'iv-sp-ov-depth-val', setting: eff.contextDepth }
    ];

    sliders.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            if (parseInt(el.max) !== maxVal) el.max = maxVal;
            const renderVal = Math.min(maxVal, parseInt(item.setting ?? 15));
            el.value = renderVal;
            const valEl = document.getElementById(item.valId);
            if (valEl) valEl.textContent = renderVal;
        }
    });
}

// ─── Chat search ───────────────────────────────────────────────────────────

function openSearch() {
    _dbgAdd('SEARCH_TOGGLE', { state: 'open' });
    state.searchOpen = true;
    const bar = document.getElementById('iv-search-bar');
    if (bar) {
        bar.classList.add('iv-search-open');
        requestAnimationFrame(() => {
            const inp = document.getElementById('iv-search-input');
            if (inp) { inp.focus(); inp.select(); }
        });
    }
    document.getElementById('iv-search-btn')?.classList.add('active');
}

function closeSearch() {
    _dbgAdd('SEARCH_TOGGLE', { state: 'close' });
    state.searchOpen = false;
    state.searchWholeWord = false;
    document.getElementById('iv-search-bar')?.classList.remove('iv-search-open');
    document.getElementById('iv-search-btn')?.classList.remove('active');
    document.getElementById('iv-search-word')?.classList.remove('active');
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    const inp = document.getElementById('iv-search-input');
    if (inp) inp.value = '';
    state.searchQuery = '';
    updateSearchCount();
}

function clearSearchHighlights() {
    const marks = document.querySelectorAll('#iv-messages mark.iv-search-hl');
    if (!marks.length) return;
    const parents = new Set();
    marks.forEach(m => {
        const p = m.parentNode;
        if (!p) return;
        p.replaceChild(document.createTextNode(m.textContent), m);
        parents.add(p);
    });
    parents.forEach(p => p.normalize());
}

function updateSearchCount() {
    const el = document.getElementById('iv-search-count');
    if (!el) return;
    el.textContent = (state.searchMatches.length && state.searchQuery)
        ? `${state.searchIdx + 1}/${state.searchMatches.length}`
        : '';
}

function _applyHighlightsInRoot(root) {
    const lq = state.searchQuery.toLowerCase();
    let regex = null;
    if (state.searchWholeWord) {
        try { regex = new RegExp(`\\b${lq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'); } catch(_) {}
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.closest('.iv-msg-actions,.iv-msg-meta,.iv-msg-avatar,.iv-reasoning-summary,.iv-search-hl'))
                return NodeFilter.FILTER_REJECT;
            if (!p.closest('.iv-msg-body')) return NodeFilter.FILTER_REJECT;
            if (regex) {
                regex.lastIndex = 0;
                const hit = regex.test(node.nodeValue);
                regex.lastIndex = 0;
                return hit ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
            return node.nodeValue.toLowerCase().includes(lq)
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    const newMarks = [];
    
    try {
        for (const node of textNodes) {
            const text = node.nodeValue;
            const frag = document.createDocumentFragment();
            let lastIndex = 0;

            if (regex) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                    const mark = document.createElement('mark');
                    mark.className = 'iv-search-hl';
                    mark.textContent = match[0];
                    frag.appendChild(mark);
                    newMarks.push(mark);
                    lastIndex = match.index + match[0].length;
                }
            } else {
                const lower = text.toLowerCase();
                let idx = lower.indexOf(lq, 0);
                if (idx === -1) continue;
                while (idx !== -1) {
                    if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    const mark = document.createElement('mark');
                    mark.className = 'iv-search-hl';
                    mark.textContent = text.slice(idx, idx + state.searchQuery.length);
                    frag.appendChild(mark);
                    newMarks.push(mark);
                    lastIndex = idx + state.searchQuery.length;
                    idx = lower.indexOf(lq, lastIndex);
                }
            }

            if (lastIndex === 0) continue;
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            node.parentNode.replaceChild(frag, node);
        }
    } catch (e) {
        _dbgAdd('SEARCH_HIGHLIGHT_DOM_CORRUPTION', { error: e.message });
    }

    return newMarks;
}

function performSearch() {
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    const q = state.searchQuery.trim();
    if (!q) { updateSearchCount(); return; }
    const container = document.getElementById('iv-messages');
    if (!container) return;
    state.searchMatches = _applyHighlightsInRoot(container);

    _dbgAdd('SEARCH_QUERY_EXECUTE', { query: state.searchQuery, wholeWord: state.searchWholeWord, matches: state.searchMatches.length });

    if (state.searchMatches.length) {
        state.searchIdx = 0;
        state.searchMatches[0].classList.add('iv-search-current');
        state.searchMatches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    updateSearchCount();
}

function navigateSearch(dir) {
    if (!state.searchMatches.length) return;
    state.searchMatches[state.searchIdx]?.classList.remove('iv-search-current');
    state.searchIdx = (state.searchIdx + dir + state.searchMatches.length) % state.searchMatches.length;
    const cur = state.searchMatches[state.searchIdx];
    cur.classList.add('iv-search-current');
    cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateSearchCount();
}

// ─── Chat Picker ───────────────────────────────────────────────

function getPickedChatIndices() {
    try { return getConversation().pickedChatIndices || []; } catch(_) { return []; }
}

function setPickedChatIndices(indices) {
    try {
        const conv = getConversation();
        conv.pickedChatIndices = [...indices].sort((a, b) => a - b);
        saveConversation();
        updatePickBtnState();
        updateMsgCount(conv);
    } catch(_) {}
}

function updatePickBtnState() {
    const picked = getPickedChatIndices();
    const btn = document.getElementById('iv-pick-btn');
    const badge = document.getElementById('iv-pick-badge');
    const isActive = picked.length > 0;
    btn?.classList.toggle('active', isActive);
    if (badge) { badge.style.display = isActive ? '' : 'none'; badge.textContent = picked.length; }
    const depthSlider = document.getElementById('iv-depth-slider');
    const depthVal = document.getElementById('iv-depth-val');
    depthSlider?.classList.toggle('iv-slider-overridden', isActive);
    depthVal?.classList.toggle('iv-depth-val-overridden', isActive);
}

let _pickerLastIdx = -1;

function openChatPicker() {
    const overlay = document.getElementById('iv-picker-overlay');
    if (!overlay) return;
    _dbgAdd('PICKER_OPEN');
    if (uiWinMod) uiWinMod.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default);
    _pickerLastIdx = -1;
    renderPickerMessages();
    overlay.style.display = 'flex';
    if (uiWinMod) uiWinMod.bringWindowToFront();
}

function closeChatPicker() {
    _dbgAdd('PICKER_CLOSE');
    const overlay = document.getElementById('iv-picker-overlay');
    if (overlay) overlay.style.display = 'none';
}

function renderPickerMessages() {
    const body = document.getElementById('iv-picker-body');
    if (!body) return;
    const ctx = SillyTavern.getContext();
    const msgs = ctx.chat || [];
    const pickedSet = new Set(getPickedChatIndices());
    const charInfo = getCharInfo();

    body.innerHTML = '';
    if (!msgs.length) {
        body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--iv-text-muted)">No messages in current chat</div>';
        _updatePickerCountEl(0);
        return;
    }

    const frag = document.createDocumentFragment();
    msgs.forEach((msg, idx) => {
        const isUser = msg.is_user;
        const name = isUser ? (ctx.name1 || 'User') : (msg.name || charInfo?.name || 'Character');
        const isSelected = pickedSet.has(idx);
        const row = document.createElement('div');
        row.className = `iv-picker-row${isSelected ? ' selected' : ''}${isUser ? ' user' : ''}`;
        row.dataset.idx = idx;

        const cb = document.createElement('div');
        cb.className = `iv-picker-cb${isSelected ? ' checked' : ''}`;

        const meta = document.createElement('div');
        meta.className = 'iv-picker-meta';

        const idxEl = document.createElement('span');
        idxEl.className = 'iv-picker-idx';
        idxEl.textContent = `#${idx}`;

        const nameEl = document.createElement('span');
        nameEl.className = 'iv-picker-name';
        nameEl.textContent = name;

        meta.appendChild(idxEl);
        meta.appendChild(nameEl);

        const textEl = document.createElement('div');
        textEl.className = 'iv-picker-text';
        const raw = (msg.mes || '').replace(/<[^>]+>/g, '').trim();
        const s2 = getSettings();
        const firstLines = Math.max(1, parseInt(s2.pickerPreviewLines) || 1);
        const lastLines = Math.max(0, parseInt(s2.pickerPreviewLastLines) || 0);
        let preview = '';
        if (lastLines > 0) {
            const allLines = raw.split('\n');
            const head = allLines.slice(0, firstLines).join('\n');
            const tail = allLines.length > firstLines
                ? allLines.slice(-lastLines).join('\n')
                : '';
            preview = tail && tail !== head ? head + '\n…\n' + tail : head;
        } else {
            preview = raw.split('\n').slice(0, firstLines).join('\n');
            if (preview.length < raw.length) preview += ' …';
        }
        textEl.textContent = preview;

        const infoCol = document.createElement('div');
        infoCol.className = 'iv-picker-info-col';
        infoCol.appendChild(meta);
        infoCol.appendChild(textEl);

        row.appendChild(cb);
        row.appendChild(infoCol);

        row.addEventListener('click', e => {
            const curIdx = parseInt(row.dataset.idx);
            const curMsg = msgs[curIdx];

            if (e.ctrlKey || e.metaKey) {
                _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'ctrl' });
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    const rm = msgs[ri];
                    if (rm && rm.is_user === curMsg.is_user && rm.name === curMsg.name) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else if (e.altKey) {
                 _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'alt' });
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    const rm = msgs[ri];
                    if (rm && !(rm.is_user === curMsg.is_user && rm.name === curMsg.name)) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else if (e.shiftKey && _pickerLastIdx >= 0) {
                _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'shift' });
                const lo = Math.min(_pickerLastIdx, curIdx);
                const hi = Math.max(_pickerLastIdx, curIdx);
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    if (ri >= lo && ri <= hi) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else {
                const sel = row.classList.toggle('selected');
                _dbgAdd('PICKER_TOGGLE_SINGLE', { idx: curIdx, state: sel });
                cb.classList.toggle('checked', sel);
                _pickerLastIdx = curIdx;
            }
            _updatePickerCountEl();
        });

        frag.appendChild(row);
    });
    body.appendChild(frag);
    _updatePickerCountEl(pickedSet.size);
    const firstSel = body.querySelector('.iv-picker-row.selected');
    if (firstSel) setTimeout(() => firstSel.scrollIntoView({ block: 'center' }), 50);
}

function _updatePickerCountEl(count) {
    const el = document.getElementById('iv-picker-count');
    if (!el) return;
    const n = count !== undefined ? count : document.querySelectorAll('#iv-picker-body .iv-picker-row.selected').length;
    el.textContent = `${n} selected`;
}

function setupChatPickerListeners() {
    const overlay = document.getElementById('iv-picker-overlay');
    if (!overlay) return;

    let _mouseDownTarget = null;
    overlay.addEventListener('mousedown', e => { _mouseDownTarget = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mouseDownTarget === overlay) closeChatPicker(); });

    document.getElementById('iv-picker-close')?.addEventListener('click', closeChatPicker);

    document.getElementById('iv-picker-all')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            r.classList.add('selected');
            r.querySelector('.iv-picker-cb')?.classList.add('checked');
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-invert')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            const s = r.classList.toggle('selected');
            r.querySelector('.iv-picker-cb')?.classList.toggle('checked', s);
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-clear')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            r.classList.remove('selected');
            r.querySelector('.iv-picker-cb')?.classList.remove('checked');
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-apply')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#iv-picker-body .iv-picker-row');
        const indices = [];
        rows.forEach(r => { if (r.classList.contains('selected')) indices.push(parseInt(r.dataset.idx)); });
        _dbgAdd('PICKER_APPLY', { count: indices.length });
        setPickedChatIndices(indices);
        closeChatPicker();
    });
}

// ─── Generation state ─────────────────────────────────────────────────────

function setGeneratingState(on) {
    const bar = document.getElementById('iv-thinking-bar'), sendBtn = document.getElementById('iv-send-btn'),
          input = document.getElementById('iv-input'), regenBtn = document.getElementById('iv-regen-btn'),
          portrayBtn = document.getElementById('iv-portray-btn');
    if (bar) {
        bar.style.display = on ? 'flex' : 'none';
        if (on) {
            const t = document.getElementById('iv-thinking-text');
            if (t) t.textContent = 'Thinking…';
        }
    }
    if (sendBtn) sendBtn.disabled = on;
    if (input) input.disabled = on;
    if (regenBtn) regenBtn.disabled = on;
    if (portrayBtn) portrayBtn.disabled = on;
    if (!on) {
        _refreshContinueBtns();
        _refreshSwipeBars(getConversation());
    }
}

function showGenerationError(err) {
    let errorSummary = err?.message || String(err);
    let fullError = '';

    if (err instanceof Error) {
        fullError = err.stack || err.message;
        if (err.cause) {
            fullError += '\n\n--- CAUSE ---\n' + (err.cause.stack || err.cause.message || JSON.stringify(err.cause, null, 2));
        }
    } else if (typeof err === 'object') {
        try {
            errorSummary = "API or Network Error";
            fullError = JSON.stringify(err, null, 2);
        } catch(e) {
            fullError = String(err);
        }
    } else {
        fullError = String(err);
    }

    if (window.last_api_error && errorSummary.includes('userStopped') === false) {
        fullError += '\n\n--- ST LAST API ERROR ---\n' + (typeof window.last_api_error === 'object' ? JSON.stringify(window.last_api_error, null, 2) : String(window.last_api_error));
    }

    showCustomDialog({
        type: 'alert',
        title: 'Generation Error',
        htmlMessage: `
            <div style="color:var(--iv-danger); margin-bottom: 10px; font-weight: 600; font-size: 14px; word-break: break-word; line-height: 1.4;">
                ${escHtml(errorSummary)}
            </div>
            <div style="font-size: 12px; margin-bottom: 8px; color: var(--iv-text-muted);">
                Please copy the technical details below and download Debug Log (from settings) to report the issue:
            </div>
            <textarea style="width:100%; height:160px; background:rgba(0,0,0,0.4); color:var(--iv-text-muted); border:1px solid rgba(255,255,255,0.15); padding:8px; border-radius:6px; font-family:var(--iv-font-mono, monospace); resize:vertical; font-size:11px; white-space:pre; word-wrap:normal; overflow-x:auto;" readonly onclick="this.select()">${escHtml(fullError)}</textarea>
        `
    });
}

// ─── Chat Events (SillyTavern) ──────────────────────────────────────────────

async function onChatChanged() {
    if (state.generating) {
        state.abortController?.abort();
        state.generating = false;
        setGeneratingState(false);
    }
    state.lastChatLen = -1;
    
    const badge = document.getElementById('iv-char-badge');
    if (badge) {
        const ctx = SillyTavern.getContext(); const char = ctx.characters?.[ctx.characterId];
        if (char) { badge.textContent = char.name; badge.style.display = ''; }
        else { badge.style.display = 'none'; }
    }
    
    await initConversation();
    
    if (uiSetMod) {
        uiSetMod.autoLoadBoundProfile();
        uiSetMod.updateConversationOverrideIndicator();
    }
    if (uiWdgMod) {
        uiWdgMod.renderQuickPromptsBar();
    }
    
    updateDepthSlidersMax();
    updatePickBtnState();
}

function toggleSearchWholeWord() {
    state.searchWholeWord = !state.searchWholeWord;
    document.getElementById('iv-search-word')?.classList.toggle('active', state.searchWholeWord);
    if (state.searchQuery.trim()) performSearch();
}

function setupDepthClickEdit() {
    const valEl = document.getElementById('iv-depth-val'); if (!valEl) return;
    
    const newEl = valEl.cloneNode(true);
    valEl.replaceWith(newEl);
    
    newEl.addEventListener('click', () => {
        const cur = getSettings().contextDepth;
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'iv-depth-input';
        input.value = cur; input.min = 0;
        
        newEl.replaceWith(input); 
        input.focus(); input.select();
        
        let isCommitted = false;
        const commit = () => {
            if (isCommitted || !input.parentNode) return;
            isCommitted = true;

            const val = Math.max(0, parseInt(input.value) || 0);
            getSettings().contextDepth = val; saveSettings();
            
            updateDepthSlidersMax();
            Promise.resolve().then(function () { return uiSettings; }).then(m => m.syncOverlayUI('contextDepth', val));
            
            const span = document.createElement('span');
            span.className = 'iv-depth-val iv-depth-clickable'; span.id = 'iv-depth-val';
            span.title = 'Click to enter exact value'; span.textContent = val;
            
            input.parentNode.replaceChild(span, input);
            setupDepthClickEdit();
            
            const slider = document.getElementById('iv-depth-slider');
            if (slider) { slider.value = val; }
            updateMsgCount(getConversation());
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', e => { 
            if (e.key === 'Enter') { e.preventDefault(); commit(); } 
            if (e.key === 'Escape') { e.preventDefault(); commit(); } 
        });
    });
}

let _searchHotkeyHandler = null;

function setupSearchHotkey() {
    if (_searchHotkeyHandler) document.removeEventListener('keydown', _searchHotkeyHandler, true);
    _searchHotkeyHandler = null;
    const s = getSettings();
    if (!s.enabled || !s.searchHotkeyEnabled || !s.searchHotkey) return;

    const parts = s.searchHotkey.toLowerCase().split('+').map(p => p.trim());
    const key = parts[parts.length - 1];
    const needAlt = parts.includes('alt');
    const needCtrl = parts.includes('ctrl') || parts.includes('control');
    const needShift = parts.includes('shift');
    const needMeta = parts.includes('meta') || parts.includes('cmd');

    _searchHotkeyHandler = e => {
        if (e.key.toLowerCase() !== key) return;
        if (needAlt !== e.altKey || needCtrl !== e.ctrlKey || needShift !== e.shiftKey || needMeta !== e.metaKey) return;
        
        if (!state.windowActive) return;
        
        const win = document.getElementById('iv-window');
        if (!win || win.style.display === 'none') return;
        
        const overlays = ['iv-settings-overlay', 'iv-picker-overlay', 'iv-changelog-modal'];
        for (const id of overlays) {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none' && el.style.display !== '') return;
        }
        if (document.querySelector('.iv-dialog-overlay.visible')) return;
        
        e.preventDefault();
        e.stopPropagation();
        if (state.searchOpen) { document.getElementById('iv-search-input')?.focus(); }
        else openSearch();
    };
    document.addEventListener('keydown', _searchHotkeyHandler, true);
}

var uiChat = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _applyHighlightsInRoot: _applyHighlightsInRoot,
    _refreshContinueBtns: _refreshContinueBtns,
    _refreshSwipeBars: _refreshSwipeBars,
    _renderMsgBodyContent: _renderMsgBodyContent,
    _runSwipeRegen: _runSwipeRegen,
    _updateMsgTokenCount: _updateMsgTokenCount,
    _updatePickerCountEl: _updatePickerCountEl,
    addSwipe: addSwipe,
    appendMsgEl: appendMsgEl,
    clearSearchHighlights: clearSearchHighlights,
    closeChatPicker: closeChatPicker,
    closeSearch: closeSearch,
    createHTMLBlockEl: createHTMLBlockEl,
    createMsgEl: createMsgEl,
    extractToolCallPlaceholders: extractToolCallPlaceholders,
    getDisplayContent: getDisplayContent,
    getLastAssistantMsgId: getLastAssistantMsgId,
    getPickedChatIndices: getPickedChatIndices,
    getSwipesForMsg: getSwipesForMsg,
    handleCopy: handleCopy,
    handleDelete: handleDelete,
    handleEdit: handleEdit,
    handleMessageRegen: handleMessageRegen,
    isSegmentClosed: isSegmentClosed,
    jumpToNextSegment: jumpToNextSegment,
    jumpToPrevSegment: jumpToPrevSegment,
    navigateSearch: navigateSearch,
    navigateSwipe: navigateSwipe,
    nearestSegmentAbove: nearestSegmentAbove,
    nearestSegmentBelow: nearestSegmentBelow,
    onChatChanged: onChatChanged,
    openChatPicker: openChatPicker,
    openSearch: openSearch,
    performSearch: performSearch,
    postProcessHTMLBlocks: postProcessHTMLBlocks,
    prepareHtmlForIframe: prepareHtmlForIframe,
    removeMsgEl: removeMsgEl,
    removeMsgElAfter: removeMsgElAfter,
    removeMsgElAndBelow: removeMsgElAndBelow,
    renderConversation: renderConversation,
    renderMarkdown: renderMarkdown,
    renderPickerMessages: renderPickerMessages,
    restoreScrollPosition: restoreScrollPosition,
    saveScrollPosition: saveScrollPosition,
    scrollToBottom: scrollToBottom,
    segmentAnchorLabel: segmentAnchorLabel,
    setGeneratingState: setGeneratingState,
    setPickedChatIndices: setPickedChatIndices,
    setupChatPickerListeners: setupChatPickerListeners,
    setupDepthClickEdit: setupDepthClickEdit,
    setupMainChatHideListener: setupMainChatHideListener,
    setupMessagesScrollTracking: setupMessagesScrollTracking,
    setupSearchHotkey: setupSearchHotkey,
    setupSegmentJumpNav: setupSegmentJumpNav,
    setupSegmentScrollTracking: setupSegmentScrollTracking,
    showGenerationError: showGenerationError,
    smartScrollToBottom: smartScrollToBottom,
    syncExchangeHiddenUi: syncExchangeHiddenUi,
    toggleSearchWholeWord: toggleSearchWholeWord,
    updateDepthSlidersMax: updateDepthSlidersMax,
    updateMsgCount: updateMsgCount,
    updatePickBtnState: updatePickBtnState,
    updateSearchCount: updateSearchCount,
    updateSwipeBar: updateSwipeBar
});

const IV_TOP_Z_INDEX = 2147483000;
const WIN_POS_STORAGE_KEY = 'iv-win-pos';

function bringWindowToFront() {
    const targets = Array.from(document.body.children).filter(el =>
        el.id?.startsWith('iv-') || el.classList?.contains('iv-dialog-overlay')
    );
    
    const getLayer = (el) => {
        if (el.classList?.contains('iv-dialog-overlay')) return 50;
        if (el.id?.endsWith('-modal')) return 40;
        if (el.id?.endsWith('-overlay')) return 30;
        if (el.id === 'iv-dock-icon') return 20;
        return 10;
    };

    for (const el of targets) {
        el.style.zIndex = String(IV_TOP_Z_INDEX + getLayer(el));
    }
}

function makeDraggable(handle, target) {
    let active = false, ox = 0, oy = 0, sl = 0, st = 0;
    let _rafId = null;
    let _anchorX = 0, _anchorY = 0;

    let tx = 0, ty = 0;
    let cx = 0, cy = 0;
    let vx = 0, vy = 0;

    let rotX = 0, rotY = 0, rotZ = 0, skewX = 0, skewY = 0;
    let vRotX = 0, vRotY = 0, vRotZ = 0, vSkewX = 0, vSkewY = 0;

    let isWobbly = true;

    const tick = () => {
        if (!active && 
            Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1 &&
            Math.abs(vRotX) < 0.1 && Math.abs(vRotY) < 0.1 && Math.abs(vRotZ) < 0.1 &&
            Math.abs(rotX) < 0.1 && Math.abs(rotY) < 0.1 && Math.abs(rotZ) < 0.1 &&
            Math.abs(tx - cx) < 0.5 && Math.abs(ty - cy) < 0.5) {
            
            target.style.transform = '';
            target.style.transformOrigin = '';
            target.style.left = `${Math.max(0, tx)}px`;
            target.style.top = `${Math.max(0, ty)}px`;
            _rafId = null;
            
            vx = vy = 0;
            rotX = rotY = rotZ = skewX = skewY = 0;
            vRotX = vRotY = vRotZ = vSkewX = vSkewY = 0;
            
            saveWindowState(target);
            return;
        }

        if (isWobbly) {
            const tension = 0.28;   
            const friction = 0.62;  
            const aTension = 0.18;  
            const aFriction = 0.72; 

            const dx = tx - cx;
            const dy = ty - cy;
            
            vx = (vx + dx * tension) * friction;
            vy = (vy + dy * tension) * friction;
            cx += vx;
            cy += vy;

            const targetRotY = dx * 0.12 + vx * 0.02; 
            const targetRotX = -(dy * 0.12 + vy * 0.02);
            const targetRotZ = (-dx * _anchorY + dy * _anchorX) * 0.05;
            const targetSkewX = -vx * 0.03;
            const targetSkewY = -vy * 0.03;

            vRotX = (vRotX + (targetRotX - rotX) * aTension) * aFriction;
            vRotY = (vRotY + (targetRotY - rotY) * aTension) * aFriction;
            vRotZ = (vRotZ + (targetRotZ - rotZ) * aTension) * aFriction;
            vSkewX = (vSkewX + (targetSkewX - skewX) * aTension) * aFriction;
            vSkewY = (vSkewY + (targetSkewY - skewY) * aTension) * aFriction;

            rotX += vRotX;
            rotY += vRotY;
            rotZ += vRotZ;
            skewX += vSkewX;
            skewY += vSkewY;

            const clamp = (val, max) => Math.max(-max, Math.min(max, val));
            const cRotX = clamp(rotX, 15);
            const cRotY = clamp(rotY, 15);
            const cRotZ = clamp(rotZ, 8);
            const cSkewX = clamp(skewX, 5);
            const cSkewY = clamp(skewY, 5);

            const speed = Math.sqrt(vx*vx + vy*vy);
            const scaleStr = Math.max(0.98, 1 - speed * 0.0004);

            target.style.left = `${cx}px`;
            target.style.top = `${cy}px`;
            
            target.style.transformOrigin = `${(_anchorX * 50 + 50)}% ${(_anchorY * 50 + 50)}%`;
            target.style.transform = `perspective(1200px) scale(${scaleStr}) rotateX(${cRotX}deg) rotateY(${cRotY}deg) rotateZ(${cRotZ}deg) skew(${cSkewX}deg, ${cSkewY}deg)`;
        } else {
            cx = tx; cy = ty;
            vx = vy = 0;
            rotX = rotY = rotZ = skewX = skewY = 0;
            vRotX = vRotY = vRotZ = vSkewX = vSkewY = 0;

            target.style.transform = '';
            target.style.left = `${Math.max(0, cx)}px`;
            target.style.top = `${Math.max(0, cy)}px`;
        }

        _rafId = requestAnimationFrame(tick);
    };

    handle.addEventListener('pointerdown', e => {
        if (e.target.closest('.iv-hbtn,.iv-tbtn,select,input,button,.iv-opacity-wrap,.iv-rh')) return;
        
        isWobbly = getSettings().wobbleWindow !== false && !getSettings().performanceMode;

        if (_rafId && isWobbly) {
            sl = cx; 
            st = cy;
            const w = target.offsetWidth;
            const h = target.offsetHeight;
            _anchorX = (e.clientX - (sl + w/2)) / (w/2);
            _anchorY = (e.clientY - (st + h/2)) / (h/2);
        } else {
            const r = target.getBoundingClientRect();
            sl = r.left; 
            st = r.top;
            _anchorX = (e.clientX - (r.left + r.width/2)) / (r.width/2);
            _anchorY = (e.clientY - (r.top + r.height/2)) / (r.height/2);
            
            cx = sl; cy = st;
            vx = vy = 0;
            rotX = rotY = rotZ = skewX = skewY = 0;
            vRotX = vRotY = vRotZ = vSkewX = vSkewY = 0;
        }

        ox = e.clientX; oy = e.clientY; 
        tx = sl; ty = st;

        active = true;
        handle.setPointerCapture(e.pointerId);
        target.classList.add('iv-dragging');
        e.preventDefault();
        
        if (!_rafId) _rafId = requestAnimationFrame(tick);
    });

    handle.addEventListener('pointermove', e => {
        if (!active) return;
        tx = Math.max(0, sl + (e.clientX - ox));
        ty = Math.max(0, st + (e.clientY - oy));
    });

    const onEnd = () => {
        if (!active) return;
        active = false;
        target.classList.remove('iv-dragging');
        if (!isWobbly) saveWindowState(target);
    };

    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
    handle.style.touchAction = 'none';
}

function makeResizable(target) {
    const MIN_W = 320, MIN_H = 300;
    target.querySelectorAll('.iv-rh').forEach(h => {
        const dir = [...h.classList].find(c => /^iv-rh-\w/.test(c))?.replace('iv-rh-', '') || '';
        let active = false, sw, sh, sl, st, sx, sy, _rafId = null, _s = {};

        const flush = () => {
            if (_s.w !== undefined) target.style.width = `${_s.w}px`;
            if (_s.h !== undefined) target.style.height = `${_s.h}px`;
            if (_s.l !== undefined) { target.style.left = `${_s.l}px`; target.style.right = 'auto'; }
            if (_s.t !== undefined) target.style.top = `${_s.t}px`;
            _rafId = null;
        };

        h.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation();
            active = true; _s = {};
            const r = target.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height; sl = r.left; st = r.top;
            h.setPointerCapture(e.pointerId);
            target.classList.add('iv-resizing');
        });

        h.addEventListener('pointermove', e => {
            if (!active) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            _s = {};
            if (dir.includes('e')) _s.w = Math.max(MIN_W, sw + dx);
            if (dir.includes('s')) _s.h = Math.max(MIN_H, sh + dy);
            if (dir.includes('w')) { const nw = Math.max(MIN_W, sw - dx); _s.w = nw; _s.l = sl + (sw - nw); }
            if (dir.includes('n')) { const nh = Math.max(MIN_H, sh - dy); _s.h = nh; _s.t = st + (sh - nh); }
            if (!_rafId) _rafId = requestAnimationFrame(flush);
        });

        h.addEventListener('pointerup', e => {
            if (!active) return;
            active = false;
            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; flush(); }
            target.classList.remove('iv-resizing');
            saveWindowState(target);
        });

        h.addEventListener('pointercancel', () => {
            active = false;
            if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
            target.classList.remove('iv-resizing');
        });

        h.style.touchAction = 'none';
    });
}

function makeIconDraggable(iconTarget) {
    let dragging = false;
    let active = false;
    let offsetX = 0, offsetY = 0;
    let startX = 0, startY = 0;
    let _rafId = null;

    let tx = 0, ty = 0;
    let cx = 0, cy = 0;
    let vx = 0, vy = 0;

    let stretch = 0;
    let vStretch = 0;
    let angle = 0;

    const tick = () => {
        const isWobbly = getSettings().wobbleWindow !== false && !getSettings().performanceMode;

        if (!active && !dragging &&
            Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05 &&
            Math.abs(tx - cx) < 0.5 && Math.abs(ty - cy) < 0.5 &&
            Math.abs(stretch) < 0.005 && Math.abs(vStretch) < 0.005) {
            
            iconTarget.style.transform = '';
            iconTarget.style.left = `${tx}px`;
            iconTarget.style.top = `${ty}px`;
            _rafId = null;
            vx = vy = stretch = vStretch = 0;
            
            localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify({
                left: iconTarget.style.left,
                top: iconTarget.style.top,
            }));
            return;
        }

        if (isWobbly) {
            const tension = 0.28;   
            const friction = 0.62;  

            const dx = tx - cx;
            const dy = ty - cy;

            vx = (vx + dx * tension) * friction;
            vy = (vy + dy * tension) * friction;
            cx += vx;
            cy += vy;

            const speed = Math.sqrt(vx * vx + vy * vy);
            const targetStretch = Math.min(0.35, speed * 0.015);
            
            const sTension = 0.22;
            const sFriction = 0.68;
            const dStretch = targetStretch - stretch;
            vStretch = (vStretch + dStretch * sTension) * sFriction;
            stretch += vStretch;

            if (speed > 0.5) {
                angle = Math.atan2(vy, vx) * (180 / Math.PI);
            }

            iconTarget.style.left = `${cx}px`;
            iconTarget.style.top = `${cy}px`;
            iconTarget.style.transform = `rotate(${angle}deg) scale(${1 + stretch}, ${1 - stretch}) rotate(${-angle}deg)`;
        } else {
            cx = tx; cy = ty;
            vx = vy = stretch = vStretch = 0;
            iconTarget.style.transform = '';
            iconTarget.style.left = `${tx}px`;
            iconTarget.style.top = `${ty}px`;
        }

        _rafId = requestAnimationFrame(tick);
    };

    iconTarget.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        dragging = false;
        active = true;
        
        const r = iconTarget.getBoundingClientRect();
        offsetX = e.clientX - r.left;
        offsetY = e.clientY - r.top;
        
        startX = r.left;
        startY = r.top;
        
        cx = r.left;
        cy = r.top;
        tx = cx;
        ty = cy;
        vx = vy = stretch = vStretch = 0;

        iconTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    iconTarget.addEventListener('pointermove', e => {
        if (!iconTarget.hasPointerCapture(e.pointerId)) return;
        
        const rawX = e.clientX - offsetX;
        const rawY = e.clientY - offsetY;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        tx = Math.max(0, Math.min(viewportWidth - 46, rawX));
        ty = Math.max(0, Math.min(viewportHeight - 46, rawY));
        
        const moveDist = Math.sqrt((tx - startX) * (tx - startX) + (ty - startY) * (ty - startY));
        if (!dragging && moveDist > 6) {
            dragging = true;
            iconTarget.classList.add('iv-icon-dragging');
        }

        if (!_rafId) _rafId = requestAnimationFrame(tick);
    });

    iconTarget.addEventListener('pointerup', e => {
        if (iconTarget.hasPointerCapture(e.pointerId)) {
            iconTarget.releasePointerCapture(e.pointerId);
        }
        active = false;
        iconTarget.classList.remove('iv-icon-dragging');
        
        if (dragging) {
            dragging = false;
        } else {
            toggleVisibility();
        }
    });

    iconTarget.addEventListener('pointercancel', e => {
        if (iconTarget.hasPointerCapture(e.pointerId)) {
            iconTarget.releasePointerCapture(e.pointerId);
        }
        dragging = false;
        active = false;
        iconTarget.classList.remove('iv-icon-dragging');
    });

    iconTarget.style.touchAction = 'none';
}

function saveWindowState(windowEl) {
    if (!windowEl) return;
    const r = windowEl.getBoundingClientRect();
    try { 
        localStorage.setItem(WIN_POS_STORAGE_KEY, JSON.stringify({ 
            x: r.left, y: r.top, w: r.width, h: r.height 
        })); 
    } catch(_) {}
}

function applyCustomTheme(theme) {
    if (!theme) return;
    
    // Lazy get elements just to be safe
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById('iv-dock-icon');
    const targets = [
        windowEl, 
        iconEl, 
        document.getElementById('iv-settings-overlay'), 
        document.getElementById('iv-picker-overlay')
    ].filter(Boolean);
    const s = getSettings();
    
    for (const [key, cssVar] of Object.entries(THEME_CSS_MAP)) {
        if (key === 'font' || key === 'fontSize') continue;
        if (theme[key] !== undefined && theme[key] !== '') {
            let val = theme[key];
            
            if (s.performanceMode) {
                if (key === 'blur') val = 'none';
                if (key === 'shadow') val = '0 8px 24px rgba(0,0,0,0.85)';
                if (key === 'bg' && val.includes('rgba')) {
                    val = val.replace(/,\s*0\.[0-8]\d*\)/, ', 0.96)');
                }
            }

            targets.forEach(t => t.style.setProperty(cssVar, val));
        }
    }
    const fontVal = (theme.font || '').trim();
    targets.forEach(t => fontVal
        ? t.style.setProperty('--iv-font', fontVal)
        : t.style.removeProperty('--iv-font'));
        
    let fontSizeVal = (theme.fontSize || '').trim();
    if (/^\d+$/.test(fontSizeVal)) fontSizeVal += 'px';
    
    targets.forEach(t => {
        if (fontSizeVal) {
            t.style.setProperty('--iv-font-size', fontSizeVal);
            t.style.fontSize = fontSizeVal;
        } else {
            t.style.removeProperty('--iv-font-size');
            t.style.fontSize = '';
        }
    });
}

function applyWindowBackground() {
    const windowEl = document.getElementById(WIN_ID);
    if (!windowEl) return;
    const s = getSettings();
    const bgId = s.windowBg || 'none';
    const dim = (s.windowBgDim ?? 50) / 100;

    windowEl.style.removeProperty('--iv-bg-image');
    windowEl.classList.remove('iv-has-bg');
    
    let mediaEl = document.getElementById('iv-bg-media');

    if (bgId === 'none' || !s.customBackgrounds || !s.customBackgrounds[bgId]) {
        if (mediaEl) mediaEl.remove();
        return;
    }

    const bg = s.customBackgrounds[bgId];
    const fit = bg.fit || 'cover';

    const isVideo = bg.isVideo;
    if (mediaEl) {
        const isVideoTag = mediaEl.tagName.toLowerCase() === 'video';
        if (isVideo !== isVideoTag) {
            mediaEl.remove();
            mediaEl = null;
        }
    }

    if (!mediaEl) {
        mediaEl = document.createElement(isVideo ? 'video' : 'img');
        mediaEl.id = 'iv-bg-media';
        if (isVideo) {
            mediaEl.autoplay = true; 
            mediaEl.loop = true; 
            mediaEl.muted = true; 
            mediaEl.playsInline = true;
        }
        windowEl.insertBefore(mediaEl, windowEl.firstChild);
    }

    mediaEl.className = `iv-bg-media bg-${fit}`;
    if (mediaEl.src !== bg.dataUrl) mediaEl.src = bg.dataUrl;
    
    windowEl.style.setProperty('--iv-bg-dim', dim);
    windowEl.classList.add('iv-has-bg');
}

function restoreWindowState(windowEl, iconEl) {
    const s = getSettings(); if (!windowEl) return;
    const isMobile = window.innerWidth <= 900 || ('ontouchstart' in window && window.innerWidth <= 1366);

    let w = 440;
    let h = 600;
    let posRestored = false;

    try {
        const saved = localStorage.getItem(WIN_POS_STORAGE_KEY);
        if (saved) {
            const { x, y, w: savedW, h: savedH } = JSON.parse(saved);
            if (savedW) w = savedW;
            if (savedH) h = savedH;

            if (x != null && y != null) {
                const maxLeft = Math.max(0, window.innerWidth - (isMobile ? window.innerWidth * 0.94 : w));
                windowEl.style.left = `${Math.max(0, Math.min(x, maxLeft))}px`;
                windowEl.style.top = `${Math.max(0, Math.min(y, window.innerHeight - 100))}px`;
                windowEl.style.right = 'auto';
                posRestored = true;
            }
        }
    } catch(_) {}

    if (!posRestored) {
        if (s.windowW) w = s.windowW;
        if (s.windowH) h = s.windowH;

        if (s.windowX !== null && s.windowX !== undefined) {
            const maxLeft = Math.max(0, window.innerWidth - (isMobile ? window.innerWidth * 0.94 : w));
            windowEl.style.left = `${Math.max(0, Math.min(s.windowX, maxLeft))}px`;
            windowEl.style.top = `${Math.max(0, Math.min(s.windowY ?? 80, window.innerHeight - 100))}px`;
            windowEl.style.right = 'auto';
            try { localStorage.setItem(WIN_POS_STORAGE_KEY, JSON.stringify({ x: s.windowX, y: s.windowY, w, h })); } catch(_) {}
        } else if (isMobile) {
            windowEl.style.left = '3vw';
            windowEl.style.top = '8vh';
            windowEl.style.right = 'auto';
        }
    }
    
    if (iconEl) {
        const savedIconPos = localStorage.getItem(ICON_STORAGE_KEY);
        let posValid = false;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const iconSize = 46;

        if (savedIconPos) {
            try {
                const pos = JSON.parse(savedIconPos);
                const left = parseFloat(pos.left);
                const top = parseFloat(pos.top);
                if (!isNaN(left) && !isNaN(top) && left >= 0 && top >= 0 && left + iconSize <= vw && top + iconSize <= vh) {
                    iconEl.style.left = `${left}px`;
                    iconEl.style.top = `${top}px`;
                    iconEl.style.bottom = 'auto';
                    iconEl.style.right = 'auto';
                    posValid = true;
                }
            } catch {
                localStorage.removeItem(ICON_STORAGE_KEY);
            }
        }
        
        if (!posValid) {
            const defaultRight = isMobile ? 16 : 20;
            const defaultBottom = isMobile ? 120 : 80;
            iconEl.style.left = `${Math.max(0, vw - iconSize - defaultRight)}px`;
            iconEl.style.top = `${Math.max(0, vh - iconSize - defaultBottom)}px`;
            iconEl.style.bottom = 'auto';
            iconEl.style.right = 'auto';
        }
    }
    
    if (isMobile) {
        windowEl.style.width = `${Math.min(w, Math.floor(window.innerWidth * 0.94), 560)}px`;
        windowEl.style.height = `${Math.min(h, Math.floor(window.innerHeight * 0.82), 700)}px`;
    } else {
        windowEl.style.width = `${w}px`;
        windowEl.style.height = `${h}px`;
    }
    windowEl.style.opacity = ((s.opacity || 95) / 100).toString();
    applyCustomTheme(s.customTheme || THEME_PRESETS.default);
    applyWindowBackground();
}

function updateIconVisibility(iconEl) {
    if (!iconEl) return;
    const s = getSettings();
    
    if (!s.enabled) {
        iconEl.style.setProperty('display', 'none', 'important');
        return;
    }
    
    if (s.minimized || s.floatingIconPersistent) {
        iconEl.style.setProperty('display', 'flex', 'important');
    } else {
        iconEl.style.setProperty('display', 'none', 'important');
    }
}

function setGhostMode(enabled) {
    const windowEl = document.getElementById(WIN_ID);
    state.ghostModeActive = enabled;
    if (!windowEl) return;
    const s = getSettings();
    const ghostBtn = document.getElementById('iv-ghost-btn');

    if (enabled) {
        const opacity = Math.max(15, Math.min(50, s.ghostModeOpacity ?? 15)) / 100;
        windowEl.classList.add('iv-ghost-mode');
        windowEl.style.opacity = opacity.toString();
        ghostBtn?.classList.add('active');
    } else {
        windowEl.classList.remove('iv-ghost-mode');
        windowEl.style.opacity = ((s.opacity ?? 95) / 100).toString();
        ghostBtn?.classList.remove('active');
    }
}

function toggleGhostMode() {
    const windowEl = document.getElementById(WIN_ID);
    if (!windowEl || windowEl.style.display === 'none') return;
    setGhostMode(!state.ghostModeActive);
}

let _hotkeyHandler = null;
function setupHotkey() {
    if (_hotkeyHandler) document.removeEventListener('keydown', _hotkeyHandler);
    _hotkeyHandler = null;
    const s = getSettings();
    if (!s.enabled || !s.hotkeyEnabled || !s.hotkey) return;
    const parts = s.hotkey.toLowerCase().split('+').map(p => p.trim());
    const key = parts[parts.length - 1];
    const needAlt = parts.includes('alt'), needCtrl = parts.includes('ctrl') || parts.includes('control');
    const needShift = parts.includes('shift'), needMeta = parts.includes('meta') || parts.includes('cmd');
    _hotkeyHandler = e => {
        if (e.key.toLowerCase() !== key) return;
        if (needAlt !== e.altKey || needCtrl !== e.ctrlKey || needShift !== e.shiftKey || needMeta !== e.metaKey) return;
        const active = document.activeElement;
        if (active && active !== document.getElementById('iv-input') && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
        e.preventDefault(); toggleVisibility();
    };
    document.addEventListener('keydown', _hotkeyHandler);
}

let _ghostHotkeyHandler = null;
function setupGhostHotkey() {
    if (_ghostHotkeyHandler) document.removeEventListener('keydown', _ghostHotkeyHandler);
    _ghostHotkeyHandler = null;
    const s = getSettings();
    if (!s.ghostModeHotkeyEnabled || !s.ghostModeHotkey) return;
    const parts = s.ghostModeHotkey.toLowerCase().split('+').map(p => p.trim());
    const key = parts[parts.length - 1];
    const needAlt = parts.includes('alt');
    const needCtrl = parts.includes('ctrl') || parts.includes('control');
    const needShift = parts.includes('shift');
    const needMeta = parts.includes('meta') || parts.includes('cmd');
    _ghostHotkeyHandler = e => {
        if (e.key.toLowerCase() !== key) return;
        if (needAlt !== e.altKey || needCtrl !== e.ctrlKey || needShift !== e.shiftKey || needMeta !== e.metaKey) return;
        e.preventDefault();
        toggleGhostMode();
    };
    document.addEventListener('keydown', _ghostHotkeyHandler);
}

function minimize() { 
    saveScrollPosition();
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById('iv-dock-icon');
    setGhostMode(false); 
    const s = getSettings(); 
    s.minimized = true; 
    if(windowEl) windowEl.style.display = 'none'; 
    state.windowActive = false;
    saveSettings(); 
    updateIconVisibility(iconEl);
}

function restoreFromMinimize() { 
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById('iv-dock-icon');
    const s = getSettings(); 
    s.minimized = false; 
    if(windowEl) windowEl.style.display = 'flex'; 
    state.windowActive = true;
    saveSettings(); 
    updateIconVisibility(iconEl);
    restoreScrollPosition(); 
    bringWindowToFront();
}

function hideWindow() { 
    saveScrollPosition();
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById('iv-dock-icon');
    setGhostMode(false); 
    const s = getSettings(); 
    s.windowVisible = false; 
    s.minimized = false; 
    if(windowEl) windowEl.style.display = 'none'; 
    state.windowActive = false;
    saveSettings(); 
    updateIconVisibility(iconEl);
}

function showWindow() {
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById('iv-dock-icon');
    const s = getSettings(); 
    if (!s.enabled) { toastr.warning('Inner Voice is disabled.', EXT_DISPLAY); return; }
    s.windowVisible = true; 
    s.minimized = false;
    if(windowEl) windowEl.style.display = 'flex';
    state.windowActive = true;
    saveSettings(); 
    updateIconVisibility(iconEl);
    restoreScrollPosition();
    bringWindowToFront();
}

function toggleVisibility() {
    const s = getSettings();
    if (!s.windowVisible || s.minimized) { showWindow(); return; }
    if (s.floatingIconPersistent) { hideWindow(); } else { minimize(); }
}

async function _uploadBgToST(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const ctx = SillyTavern.getContext();
    const headers = ctx.getRequestHeaders();
    delete headers['Content-Type'];
    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers,
        body: formData
    });
    if (res.ok) {
        const text = await res.text();
        let filename = text;
        try { const j = JSON.parse(text); if (j.path) filename = j.path; } catch(e){}
        if (!filename.startsWith('/')) filename = `/backgrounds/${filename}`;
        return filename;
    }
    throw new Error('Background upload failed');
}

function _setupBgUpload(btnId, inputId, onUploadSuccess) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,video/mp4,video/webm';
        inp.onchange = async () => {
            const file = inp.files[0];
            if (!file) return;
            if (file.size > 25 * 1024 * 1024) { toastr.warning('File is too large (>25MB). Use URL instead.', EXT_DISPLAY); return; }
            const url = await _uploadBgToST(file).catch(() => null);
            if (url) {
                getSettings().windowBgUrl = url;
                saveSettings();
                const urlInput = document.getElementById(inputId);
                if (urlInput) urlInput.value = url;
                applyWindowBackground();
                if (onUploadSuccess) onUploadSuccess();
            } else {
                toastr.error('Failed to upload background.', EXT_DISPLAY);
            }
        };
        inp.click();
    });
}

var uiWindow = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _setupBgUpload: _setupBgUpload,
    _uploadBgToST: _uploadBgToST,
    applyCustomTheme: applyCustomTheme,
    applyWindowBackground: applyWindowBackground,
    bringWindowToFront: bringWindowToFront,
    hideWindow: hideWindow,
    makeDraggable: makeDraggable,
    makeIconDraggable: makeIconDraggable,
    makeResizable: makeResizable,
    minimize: minimize,
    restoreFromMinimize: restoreFromMinimize,
    restoreWindowState: restoreWindowState,
    saveWindowState: saveWindowState,
    setGhostMode: setGhostMode,
    setupGhostHotkey: setupGhostHotkey,
    setupHotkey: setupHotkey,
    showWindow: showWindow,
    toggleGhostMode: toggleGhostMode,
    toggleVisibility: toggleVisibility,
    updateIconVisibility: updateIconVisibility
});

// SillyTavern in-chat injection. Depth 0 is after the last message.
const IN_CHAT = 1;
const SYSTEM_ROLE = 0;
const KEY_PREFIX = 'inner_voice_exchange_';

const _activeKeys = new Set();

function promptKey(anchorIndex) {
    return `${KEY_PREFIX}${anchorIndex}`;
}

function exchangeDepthOf(settings) {
    if (settings.exchangeDepth === undefined || settings.exchangeDepth === null) return 1;
    const n = parseInt(settings.exchangeDepth, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 1;
}

function visibleAnchoredExchanges(conversation) {
    return getExchanges(conversation).filter(e =>
        e.anchorIndex !== null && e.anchorIndex !== undefined
        && !isExchangeHidden(conversation, e.anchorIndex)
    );
}

function renderExchangeBlock(turns) {
    const body = (turns || []).map(t => {
        const label = t.role === 'assistant' ? '{{user}}' : 'IV';
        return `${label}: ${t.content}`;
    }).join('\n');
    const explanation = "This is {{user}}'s private inner exchange — one mind talking to itself. NPCs and the World cannot perceive it. IV: is the Inner Voice; {{user}}: is {{user}}.";
    return `<inner-exchange>\n${explanation}\n\n${body}\n</inner-exchange>`;
}

function assembleSimulationView(conversation, settings, chatLength) {
    const n = exchangeDepthOf(settings);
    if (n === 0 || !chatLength) return [];
    const selected = visibleAnchoredExchanges(conversation).slice(-n);
    return selected.map(e => ({
        anchorIndex: e.anchorIndex,
        depth: Math.max(0, chatLength - 1 - e.anchorIndex),
        content: renderExchangeBlock(e.turns),
    }));
}

function syncSimulationView() {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') return;

    const conv = getConversation();
    const settings = getEffectiveSettings();
    const chatLength = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    const injections = assembleSimulationView(conv, settings, chatLength);

    const nextKeys = new Set();
    for (const inj of injections) {
        const key = promptKey(inj.anchorIndex);
        nextKeys.add(key);
        ctx.setExtensionPrompt(key, inj.content, IN_CHAT, inj.depth, false, SYSTEM_ROLE);
    }
    for (const key of _activeKeys) {
        if (!nextKeys.has(key)) ctx.setExtensionPrompt(key, '', IN_CHAT, 0, false, SYSTEM_ROLE);
    }
    _activeKeys.clear();
    for (const key of nextKeys) _activeKeys.add(key);
}

var simulationView = /*#__PURE__*/Object.freeze({
    __proto__: null,
    assembleSimulationView: assembleSimulationView,
    renderExchangeBlock: renderExchangeBlock,
    syncSimulationView: syncSimulationView
});

function _getAspectEvolutiaPersonaFields() {
    try {
        const ctx = SillyTavern.getContext();
        const pu = window.power_user || ctx.powerUserSettings || {};
        let personaId = window.user_avatar || ctx.user_avatar || ctx.userAvatar || ctx.personaId || ctx.activePersonaId || ctx.active_persona_id;
        if (!personaId && typeof document !== 'undefined') {
            const selected = document.querySelector('#user_avatar_block .avatar-container.selected, #persona_container .avatar-container.selected, .persona_selected');
            if (selected) personaId = selected.getAttribute('data-avatar-id') || selected.dataset?.avatarId;
        }
        if (typeof personaId === 'object' && personaId !== null) personaId = personaId.avatarId || personaId.avatar_id || personaId.user_avatar || personaId.userAvatar || personaId.id;
        if (!personaId) return null;

        const AE_KEY = 'st-description-swap-fields';
        const personaState = pu[AE_KEY]?.personaDynamicFields?.[personaId];
        if (!personaState || !personaState.swapEnabled) return null;
        
        const activeId = personaState.activeAlterEgoId || 'base';
        const alterEgos = Array.isArray(personaState.alterEgos) ? personaState.alterEgos : [];
        const activeEgo = alterEgos.find(a => a.id === activeId) || alterEgos[0];
        const fields = Array.isArray(activeEgo?.fields) ? activeEgo.fields : (Array.isArray(personaState.fields) ? personaState.fields : []);
        const enabled = fields.filter(f => f.enabled !== false && f.content?.trim());
        if (!enabled.length) return null;
        return enabled.map(f => ({ id: f.id, name: f.name || 'Field', content: f.content }));
    } catch(e) { return null; }
}

function _getSummaryceptionSummary() {
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.extensionSettings?.summaryception?.enabled === false) return null;
        const store = ctx.chatMetadata?.summaryception;
        if (!store || !Array.isArray(store.layers)) return null;
        const snippets = [];
        for (let i = store.layers.length - 1; i >= 1; i--) {
            const layer = store.layers[i];
            if (layer && layer.length) snippets.push(...layer.map(sn => sn.text).filter(Boolean));
        }
        if (store.layers[0] && store.layers[0].length) {
            snippets.push(...store.layers[0].map(sn => sn.text).filter(Boolean));
        }
        if (!snippets.length) return null;
        const summaryText = snippets.join(' ');
        const template = ctx.extensionSettings?.summaryception?.injectionTemplate || '<summary>\n{{summary}}\n</summary>';
        return template.replace('{{summary}}', summaryText).trim();
    } catch(_) {}
    return null;
}

let _regexModule = false;

async function loadRegexModule() {
    if (_regexModule !== false) return _regexModule;
    try {
        _regexModule = await import('/scripts/extensions/regex/engine.js');
    } catch (e) {
        _regexModule = null;
    }
    return _regexModule;
}

async function applyRegexIfEnabled(text, isUser, depth) {
    if (!getEffectiveSettings().applyRegexToContext) return text;
    try {
        const mod = await loadRegexModule();
        if (!mod?.getRegexedString) return text;
        const placement = isUser
            ? (mod.regex_placement?.USER_INPUT ?? 1)
            : (mod.regex_placement?.AI_OUTPUT ?? 2);
        const params = { isPrompt: true };
        if (typeof depth === 'number') params.depth = depth;
        const result = mod.getRegexedString(text, placement, params);
        const resolved = (result instanceof Promise) ? await result : result;
        return (typeof resolved === 'string') ? resolved : text;
    } catch (e) {
        return text;
    }
}

function sanitizeToolCallsForSave(toolCalls) {
    return (toolCalls || []).map(tc => ({ ...tc }));
}

async function notePortrayAutoTrigger(turn) {
    const { considerAutoTriggerPortray } = await Promise.resolve().then(function () { return portray; });
    await considerAutoTriggerPortray(turn);
}

async function flushPortrayAutoTrigger() {
    const { flushPendingAutoPortray } = await Promise.resolve().then(function () { return portray; });
    await flushPendingAutoPortray();
}

async function buildSystemContent(settings) {
    let sysPromptRaw = (typeof settings.systemPrompt === 'string' && settings.systemPrompt.trim()) ? settings.systemPrompt : DEFAULT_SYSTEM_PROMPT;
    const parts = [_ensureWrapped(sysPromptRaw, 'system_prompt')];
    const charInfo = getCharInfo();
    const ctx = SillyTavern.getContext();

    if (settings.includeSystemPrompt) {
        const sp = ctx.systemPrompt || ctx.system_prompt || '';
        if (sp) parts.push(`\n\n<st_system_prompt>\n${sp}\n</st_system_prompt>`);
    }

    if (ctx.groupId && ctx.groups) {
        const group = ctx.groups.find(g => g.id === ctx.groupId);
        if (group && Array.isArray(group.members)) {
            const memberNames = group.members.map(m => {
                const c = ctx.characters.find(char => char.avatar === m);
                return c ? c.name : m;
            }).filter(Boolean);
            if (memberNames.length > 0) {
                parts.push(`\n<chat_group_members>\nThats chat with multiple characters. Current group members: ${memberNames.join(', ')}\n</chat_group_members>`);
            }
        }
    }

    const memoryBlock = buildMemoryContextBlock(settings);
    if (memoryBlock) parts.push(memoryBlock);

    if (!ctx.groupId) {
        parts.push(`\n\n<character_information>\nName: ${charInfo ? charInfo.name : (ctx.name2 || 'Character')}\n</character_information>`);
    }

    {
        const userName = ctx.name1 || 'User';
        let inner = `Name: ${userName}`;
        
        if (settings.includeUserPersonality) {
            let hasEvolutia = false;
            if (settings.useAspectEvolutia) {
                const aeUserFields = _getAspectEvolutiaPersonaFields();
                if (aeUserFields && aeUserFields.length) {
                    const aeContent = aeUserFields.map(f => `<evolutia_user_field name="${escHtml(f.name)}">\n${f.content}\n</evolutia_user_field>`).join('\n\n');
                    inner += `\n${aeContent}`;
                    hasEvolutia = true;
                }
            }
            if (!hasEvolutia) {
                const personaContent = getUserPersona();
                if (personaContent) inner += `\n${personaContent}`;
            }
        }
        parts.push(`\n\n<{{user}}_persona>\n${inner}\n</{{user}}_persona>`);
    }

    const memoryAIInstr = buildMemoryAIInstructions(settings).trim();
    const toolsBlock = buildToolCallsSystemBlock().trim();

    const modules = [memoryAIInstr, toolsBlock].filter(Boolean);
    if (modules.length > 0) {
        parts.push(`\n\n<modules>\n${modules.join('\n\n')}\n</modules>`);
    }

    return parts.join('\n');
}

function getMainChatSlice(depth) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chat) return [];
    
    const _incHidden = getEffectiveSettings().includeHiddenMessages;
    const extractData = (m, i) => ({
        role: m.is_user ? 'user' : 'assistant',
        name: m.is_user ? (ctx.name1 || 'User') : (m.name || getCharInfo()?.name || 'Character'),
        content: typeof m.mes === 'string' ? m.mes : '',
        chatIndex: i,
        is_hidden: (!_incHidden && (!!m.is_system || !!m.is_hidden || !!(m.extra && m.extra.is_hidden))) || !!(m.extra?.sc_ghosted)
    });

    try {
        const conv = getConversation();
        const picked = conv.pickedChatIndices;
        if (picked && picked.length > 0) {
            return picked
                .filter(i => i >= 0 && i < ctx.chat.length)
                .map(i => extractData(ctx.chat[i], i));
        }
    } catch(_) {}
    
    if (depth === 0) return [];
    const total = ctx.chat.length;
    const start = Math.max(0, total - depth);
    return ctx.chat.slice(start).map((m, i) => extractData(m, start + i));
}

async function assembleMessages(conversation, settings, pendingUserText) {
    const messages = [{ role: 'system', content: await buildSystemContent(settings) }];
    const depth = Math.max(0, parseInt(settings.contextDepth) || 0);
    const hasPicked = !!(conversation.pickedChatIndices && conversation.pickedChatIndices.length > 0);
    
    if (depth > 0 || hasPicked) {
        const slice = getMainChatSlice(depth);
        if (slice.length) {
            const chatTotal = SillyTavern.getContext().chat?.length ?? 0;
            const processedSlice = await Promise.all(slice.map(async m => ({
                ...m, content: await applyRegexIfEnabled(m.content, m.role === 'user', chatTotal - m.chatIndex - 1),
            })));
            const ctx = SillyTavern.getContext();
            const visibleSlice = processedSlice.filter(m => !m.is_hidden);

            if (settings.includeAlternateSwipes && visibleSlice.length > 0) {
                let lastAstMsg = null;
                for (let i = visibleSlice.length - 1; i >= 0; i--) {
                    if (visibleSlice[i].role === 'assistant') {
                        lastAstMsg = visibleSlice[i];
                        break;
                    }
                }
                if (lastAstMsg) {
                    const stChatMsg = ctx.chat[lastAstMsg.chatIndex];
                    if (stChatMsg && Array.isArray(stChatMsg.swipes) && stChatMsg.swipes.length > 1) {
                        let swipesXml = '<alternate_swipes>\n';
                        const activeSwipeId = stChatMsg.swipe_id ?? 0;
                        stChatMsg.swipes.forEach((sw, idx) => {
                            if (idx === activeSwipeId) return;
                            const text = typeof sw === 'string' ? sw : (sw.mes || '');
                            if (text) swipesXml += `<swipe index="${idx}">\n${text}\n</swipe>\n`;
                        });
                        swipesXml += '</alternate_swipes>\n';
                        lastAstMsg.content = swipesXml + lastAstMsg.content;
                    }
                }
            }

            // Inner memory: each non-hidden exchange sits directly below its
            // anchor inside this slice. Hidden or out-of-slice anchors take
            // their exchanges with them; the UI keeps every exchange readable.
            const block = visibleSlice.map(m => {
                const msgXml = `<msg index="${m.chatIndex}" role="${m.role === 'user' ? 'user' : 'assistant'}">\n${m.content}\n</msg>`;
                if (isExchangeHidden(conversation, m.chatIndex)) return msgXml;
                const exchange = getExchangeAt(conversation, m.chatIndex);
                if (!exchange || !exchange.turns.length) return msgXml;
                return `${msgXml}\n\n${renderExchangeBlock(exchange.turns)}`;
            }).join('\n\n');
            
            let summaryText = '';
            if (settings.includeSummaryception !== false) {
                const scSummary = _getSummaryceptionSummary();
                if (scSummary) summaryText = `\n<summary_context>\n${scSummary}\n</summary_context>\n\n`;
            }

            const ctxAttr = hasPicked ? `picked_messages="${visibleSlice.length}"` : `last_messages="${visibleSlice.length}"`;
            messages.push({
                role: 'user',
                content: `<main_chat ${ctxAttr}>\n${summaryText}${block}\n\n</main_chat>`,
            });
            const postHistoryText = typeof settings.postHistoryText === 'string' ? settings.postHistoryText.trim() : '';
            if (postHistoryText) {
                const role = settings.postHistoryRole === 'system' || settings.postHistoryRole === 'assistant'
                    ? settings.postHistoryRole
                    : 'user';
                messages.push({ role, content: postHistoryText });
            }
        }
    }
    if (pendingUserText !== null && pendingUserText !== undefined && pendingUserText !== '') {
        messages.push({ role: 'user', content: pendingUserText });
    }

    return messages;
}

function formatPayloadAsText(messages) {
    return messages.map(m => {
        const label = m.role === 'system' ? '■ SYSTEM' : m.role === 'user' ? '▶ USER' : '◀ ASSISTANT';
        let c = m.content;
        if (Array.isArray(c)) {
            c = c.map(part => {
                if (part.type === 'text') return part.text;
                if (part.type === 'image_url') return `[Image Base64 Attached]`;
                return `[Unknown Block]`;
            }).join('\n');
        }
        return `${label}\n${'─'.repeat(50)}\n${c}`;
    }).join('\n\n');
}

async function estimateTokens(text) {
    if (!text) return 0;
    let str = text;
    if (Array.isArray(text)) {
        str = text.map(t => t.type === 'text' ? t.text : '').join('\n');
    }
    
    if (state.tokenCountCache.has(str)) return state.tokenCountCache.get(str);
    if (state.tokenCountPromises.has(str)) return state.tokenCountPromises.get(str);

    const promise = (async () => {
        const ctx = SillyTavern.getContext();
        
        try {
            if (typeof ctx.getTokenCountAsync === 'function') return await ctx.getTokenCountAsync(str);
            if (typeof window.getTokenCountAsync === 'function') return await window.getTokenCountAsync(str);
        } catch (_) {}
        
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            if (typeof ctx.getTokenCount === 'function') return ctx.getTokenCount(str);
            if (typeof window.getTokenCount === 'function') return window.getTokenCount(str);
        } catch (_) {}
        
        try {
            const res = await fetch('/api/tokencount', {
                method: 'POST',
                headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: str })
            });
            if (res.ok) {
                const data = await res.json();
                if (typeof data.length === 'number') return data.length;
                if (typeof data.count === 'number') return data.count;
                if (typeof data === 'number') return data;
            }
        } catch (_) {}
        
        return Math.ceil(str.length / 3.5);
    })();

    state.tokenCountPromises.set(str, promise);
    try {
        const count = await promise;
        if (state.tokenCountCache.size > 500) {
            const keysToDel = Array.from(state.tokenCountCache.keys()).slice(0, 100);
            keysToDel.forEach(k => state.tokenCountCache.delete(k));
        }
        state.tokenCountCache.set(str, count);
        return count;
    } finally {
        state.tokenCountPromises.delete(str);
    }
}

async function callGenerate(conversation, settings, pendingText, onChunk, messagesOverride) {
    const ctx = SillyTavern.getContext();
    const messages = messagesOverride || await assembleMessages(conversation, settings, pendingText);
    const maxTokens = parseInt(settings.maxTokens) || 8200;

    const abort = new AbortController();
    state.abortController = abort;

    const streamSetting = settings.forceStreaming;
    let useStream;

    if (streamSetting === 'on' || streamSetting === true) {
        useStream = true;
    } else if (streamSetting === 'off') {
        useStream = false;
    } else {
        useStream = !!(document.getElementById('stream_toggle')?.checked
            ?? ctx.chatCompletionSettings?.stream_openai
            ?? ctx.textCompletionSettings?.streaming
            ?? true);
    }

    function deepExtract(obj) {
        if (!obj || typeof obj !== 'object') return { t: '', r: null };
        let r = null;
        
        if (typeof obj.state?.reasoning === 'string' && obj.state.reasoning !== '') r = obj.state.reasoning;
        else if (typeof obj.reasoning === 'string' && obj.reasoning !== '') r = obj.reasoning;
        else if (typeof obj.reasoning_content === 'string' && obj.reasoning_content !== '') r = obj.reasoning_content;
        else if (typeof obj.thinking === 'string' && obj.thinking !== '') r = obj.thinking;

        else if (typeof obj.original_response?.choices?.[0]?.message?.reasoning === 'string' && obj.original_response.choices[0].message.reasoning !== '') r = obj.original_response.choices[0].message.reasoning;
        else if (typeof obj.original_response?.choices?.[0]?.message?.reasoning_content === 'string' && obj.original_response.choices[0].message.reasoning_content !== '') r = obj.original_response.choices[0].message.reasoning_content;
        else if (typeof obj.choices?.[0]?.message?.reasoning === 'string' && obj.choices[0].message.reasoning !== '') r = obj.choices[0].message.reasoning;
        else if (typeof obj.choices?.[0]?.message?.reasoning_content === 'string' && obj.choices[0].message.reasoning_content !== '') r = obj.choices[0].message.reasoning_content;
        else if (typeof obj.choices?.[0]?.delta?.reasoning === 'string' && obj.choices[0].delta.reasoning !== '') r = obj.choices[0].delta.reasoning;
        else if (typeof obj.choices?.[0]?.delta?.reasoning_content === 'string' && obj.choices[0].delta.reasoning_content !== '') r = obj.choices[0].delta.reasoning_content;

        if (!r) {
            const getGeminiThoughts = (src) => {
                if (Array.isArray(src?.responseContent?.parts)) return src.responseContent.parts;
                if (Array.isArray(src?.candidates?.[0]?.content?.parts)) return src.candidates[0].content.parts;
                return [];
            };
            const geminiParts = [...getGeminiThoughts(obj), ...getGeminiThoughts(obj.original_response)];
            const geminiThoughts = geminiParts.filter(p => p.thought || p.thought === null).map(p => p.text).filter(Boolean);
            if (geminiThoughts.length > 0) r = geminiThoughts.join('\n\n');
        }
        
        if (!r) {
            const getClaudeThoughts = (src) => Array.isArray(src?.content) ? src.content : [];
            const claudeParts = [...getClaudeThoughts(obj), ...getClaudeThoughts(obj.original_response)];
            const claudeThoughts = claudeParts.filter(p => p.type === 'thinking').map(p => p.thinking).filter(Boolean);
            if (claudeThoughts.length > 0) r = claudeThoughts.join('\n\n');
        }
            
        if (!r) {
            const getMistralContent = (src) => Array.isArray(src?.choices?.[0]?.message?.content) ? src.choices[0].message.content : [];
            const mistralParts = [...getMistralContent(obj), ...getMistralContent(obj.original_response)];
            let mistralThoughts = [];
            for (const part of mistralParts) {
                if (Array.isArray(part.thinking)) mistralThoughts.push(...part.thinking.map(t => t.text).filter(Boolean));
                else if (part.type === 'thinking' || part.thinking) mistralThoughts.push(typeof part.thinking === 'string' ? part.thinking : part.text);
            }
            if (mistralThoughts.length > 0) r = mistralThoughts.join('\n\n');
        }

        let t = '';
        if (typeof obj.text === 'string' && obj.text !== '') t = obj.text;
        else if (typeof obj.content === 'string' && obj.content !== '') t = obj.content;
        else if (Array.isArray(obj.content)) {
            const textParts = obj.content.filter(p => p.type === 'text' || (p.text && !p.thought && p.type !== 'thinking')).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (Array.isArray(obj.responseContent?.parts)) {
            const textParts = obj.responseContent.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (typeof obj.message?.content === 'string' && obj.message.content !== '') t = obj.message.content;
        else if (typeof obj.original_response?.choices?.[0]?.message?.content === 'string' && obj.original_response.choices[0].message.content !== '') t = obj.original_response.choices[0].message.content;
        else if (typeof obj.choices?.[0]?.message?.content === 'string' && obj.choices[0].message.content !== '') t = obj.choices[0].message.content;
        else if (typeof obj.choices?.[0]?.delta?.content === 'string' && obj.choices[0].delta.content !== '') t = obj.choices[0].delta.content;
        else if (typeof obj.choices?.[0]?.text === 'string' && obj.choices[0].text !== '') t = obj.choices[0].text;
        else if (typeof obj.results?.[0]?.text === 'string' && obj.results[0].text !== '') t = obj.results[0].text;
        else if (Array.isArray(obj.original_response?.candidates?.[0]?.content?.parts)) {
            const textParts = obj.original_response.candidates[0].content.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }
        else if (Array.isArray(obj.candidates?.[0]?.content?.parts)) {
            const textParts = obj.candidates[0].content.parts.filter(p => !p.thought && p.thought !== null).map(p => p.text).filter(Boolean);
            if (textParts.length > 0) t = textParts.join('\n');
        }

        return { t, r };
    }

    if (settings.connectionSource === 'custom') {
        let text = '';
        let reasoning = null;
        let reasoningStartMs = null;
        let reasoningDone = false;

        try {
            const url = (settings.customUrl || 'http://localhost:5000/v1').replace(/\/+$/, '') + '/chat/completions';
            const payload = {
                model: settings.customModel || 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: maxTokens,
                stream: useStream
            };
            const headers = { 'Content-Type': 'application/json' };
            if (settings.customKey) headers['Authorization'] = `Bearer ${settings.customKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: abort.signal
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(`Custom API Error ${res.status}: ${errText}`);
            }

            if (useStream) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                while (true) {
                    if (abort.signal.aborted) { state.abortController = null; return null; }
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); 

                    for (const line of lines) {
                        const l = line.trim();
                        if (!l || l.startsWith(':') || l === 'data: [DONE]') continue;
                        if (l.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(l.slice(6));
                                const ext = deepExtract(data);
                                if (ext.t) text += ext.t;
                                if (ext.r) {
                                    if (reasoningStartMs === null) reasoningStartMs = performance.now();
                                    reasoning = (reasoning || '') + ext.r;
                                }
                                if (text && !reasoningDone && reasoning) {
                                    reasoningDone = true;
                                    data._finalReasoningMs = performance.now() - reasoningStartMs;
                                }
                                if (typeof onChunk === 'function') {
                                    const rMs = reasoningDone && data._finalReasoningMs ? data._finalReasoningMs : (reasoningStartMs !== null ? performance.now() - reasoningStartMs : null);
                                    onChunk(text, reasoning, rMs, reasoningDone);
                                }
                            } catch (e) {}
                        }
                    }
                }
            } else {
                const data = await res.json();
                const ext = deepExtract(data);
                text = ext.t || '';
                reasoning = ext.r;
            }
        } catch (e) {
            state.abortController = null;
            if (abort.signal.aborted || e?.name === 'AbortError') return null;
            throw e;
        }

        state.abortController = null;
        return { text: text.trim(), reasoning, isMaxTokens: false };
    }

    const service = ctx.ConnectionManagerRequestService;
    let profiles = [];
    if (service && typeof service.getSupportedProfiles === 'function') {
        profiles = service.getSupportedProfiles();
    } else {
        profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
    }

    let useConnectionManager = false;
    let profileId = null;

    if (settings.connectionSource === 'profile') {
        if (settings.connectionProfileId) {
            const found = profiles.find(p =>
                p.id === settings.connectionProfileId || p.name === settings.connectionProfileId
            );
            if (found) {
                profileId = found.id;
                useConnectionManager = true;
            } else {
                throw new Error(`Connection profile "${settings.connectionProfileId}" not found. Available: ${profiles.map(p => p.name).join(', ') || 'None'}`);
            }
        } else {
            throw new Error('No profile selected in Inner Voice settings.');
        }
    } else if (settings.connectionSource !== 'custom') {
        const domSelect = document.getElementById('connection_profiles');
        if (domSelect && domSelect.value) {
            profileId = domSelect.value;
        } else if (ctx.extensionSettings?.connectionManager?.selectedProfile) {
            profileId = ctx.extensionSettings.connectionManager.selectedProfile;
        }
        
        if (profileId) {
            useConnectionManager = true;
        }
    }

    let asyncGeneratorFn;
    const origFetch = window.fetch;
    
    window.fetch = async function(...args) {
        let requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if ((requestUrl.includes('/generate') || requestUrl.includes('/caption-image')) && args[1] && typeof args[1].body === 'string') {
            try {
                let reqBody = JSON.parse(args[1].body);
                let changed = false;
                
                if (reqBody.reasoning_effort === 'auto') { delete reqBody.reasoning_effort; changed = true; }
                else if (reqBody.reasoning_effort === 'min') { reqBody.reasoning_effort = 'low'; changed = true; }
                else if (reqBody.reasoning_effort === 'max') { reqBody.reasoning_effort = 'high'; changed = true; }

                if (reqBody.reasoning && typeof reqBody.reasoning === 'object') {
                    if (reqBody.reasoning.effort === 'auto') { delete reqBody.reasoning.effort; changed = true; }
                    else if (reqBody.reasoning.effort === 'min') { reqBody.reasoning.effort = 'low'; changed = true; }
                    else if (reqBody.reasoning.effort === 'max') { reqBody.reasoning.effort = 'high'; changed = true; }
                }

                if (reqBody.custom_prompt_post_processing === '') { delete reqBody.custom_prompt_post_processing; changed = true; }
                if (reqBody.request_image_resolution === '') { delete reqBody.request_image_resolution; changed = true; }
                if (reqBody.request_image_aspect_ratio === '') { delete reqBody.request_image_aspect_ratio; changed = true; }

                if (reqBody.chat_completion_source === 'zai' || (typeof reqBody.model === 'string' && reqBody.model.toLowerCase().includes('glm'))) {
                    if (reqBody.reasoning_effort !== undefined) { delete reqBody.reasoning_effort; changed = true; }
                    if (reqBody.reasoning !== undefined) { delete reqBody.reasoning; changed = true; }
                    if (Array.isArray(reqBody.messages)) {
                        reqBody.messages.forEach(m => { if (m.name !== undefined) { delete m.name; changed = true; } });
                    }
                }
                
                if (changed) args[1].body = JSON.stringify(reqBody);
            } catch(_) {}
        }
        return origFetch.apply(this, args);
    };

    try {
        if (useConnectionManager && service && typeof service.sendRequest === 'function') {
            asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                stream: useStream,
                signal: abort.signal,
                extractData: false,
                includePreset: true
            });
        } else {
            const mainApi = window.main_api || ctx.main_api;
            if (mainApi === 'openai' && ctx.ChatCompletionService) {
                const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                    messages: messages,
                    max_tokens: maxTokens,
                    stream: useStream
                }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
            } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                    prompt: messages,
                    max_tokens: maxTokens,
                    stream: useStream
                }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
            } else {
                throw new Error('No active API connection found. Please select a profile in Connection Manager or configure the main API.');
            }
        }
    } catch (e) {
        if (useStream && !abort.signal.aborted && e?.name !== 'AbortError' && e?.message !== 'userStopped') {
            console.warn(`[${EXT_DISPLAY}] Streaming failed, falling back to non-streaming:`, e);
            _dbgAdd('GEN_STREAM_FALLBACK', { error: e.message || String(e) });
            useStream = false;
            try {
                if (useConnectionManager && service && typeof service.sendRequest === 'function') {
                    asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                        stream: false,
                        signal: abort.signal,
                        extractData: false,
                        includePreset: true
                    });
                } else {
                    const mainApi = window.main_api || ctx.main_api;
                    if (mainApi === 'openai' && ctx.ChatCompletionService) {
                        const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                        asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                            messages: messages,
                            max_tokens: maxTokens,
                            stream: false
                        }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
                    } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                        const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                        asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                            prompt: messages,
                            max_tokens: maxTokens,
                            stream: false
                        }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
                    }
                }
            } catch (err2) {
                state.abortController = null;
                if (abort.signal.aborted || err2?.name === 'AbortError' || err2?.message === 'userStopped') return null;
                if (err2.cause) err2.message = `${err2.message} — CAUSE: ${err2.cause.message || String(err2.cause)}`;
                throw err2;
            }
        } else {
            state.abortController = null;
            if (abort.signal.aborted || e?.name === 'AbortError' || e?.message === 'userStopped') return null;
            if (e.cause) e.message = `${e.message} — CAUSE: ${e.cause.message || String(e.cause)}`;
            throw e;
        }
    } finally {
        window.fetch = origFetch;
    }

    let text = '';
    let reasoning = null;
    let reasoningStartMs = null;
    let reasoningDone = false;

    const isGen = typeof asyncGeneratorFn === 'function' ||
        (asyncGeneratorFn != null && typeof asyncGeneratorFn[Symbol.asyncIterator] === 'function') ||
        (asyncGeneratorFn != null && typeof asyncGeneratorFn.next === 'function');

    let lastValue = null;

    if (!isGen) {
        const value = asyncGeneratorFn;
        if (typeof value === 'string') {
            text = value.trim();
        } else {
            const ext = deepExtract(value);
            text = ext.t.trim();
            reasoning = ext.r;
            lastValue = value;
        }
        
        const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
        const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';

        state.abortController = null;
        return { text, reasoning, isMaxTokens };
    }

    const gen = typeof asyncGeneratorFn === 'function' ? asyncGeneratorFn() : asyncGeneratorFn;

    try {
        while (true) {
            if (abort.signal.aborted) { state.abortController = null; return null; }
            const { value, done } = await gen.next();
            if (done) {
                if (value) lastValue = value;
                break;
            }
            lastValue = value;

            const ext = deepExtract(value);
            text = ext.t;
            const newReasoning = ext.r;

            if (newReasoning) {
                if (reasoningStartMs === null) reasoningStartMs = performance.now();
                reasoning = newReasoning;
            }
            if (text && !reasoningDone && reasoning) {
                reasoningDone = true;
                lastValue._finalReasoningMs = performance.now() - reasoningStartMs;
            }

            if (typeof onChunk === 'function') {
                const reasoningMs = reasoningDone && lastValue?._finalReasoningMs 
                    ? lastValue._finalReasoningMs 
                    : (reasoningStartMs !== null ? performance.now() - reasoningStartMs : null);
                onChunk(text, reasoning, reasoningMs, reasoningDone);
            }
        }
    } catch (e) {
        state.abortController = null;
        if (abort.signal.aborted || e?.name === 'AbortError' || e?.message === 'userStopped') return null;
        throw e;
    }

    const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
    const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';

    state.abortController = null;
    return { text: text.trim(), reasoning, isMaxTokens };
}

async function runGenerate(conversation, userText, addUserMsg = true) {
    if (state.generating) return;
    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    let streamMsgId = null;
    let streamMsgEl = null;
    let streamContentEl = null;
    let streamReasoningBlockEl = null;
    let streamReasoningSummaryEl = null;
    let streamReasoningContentEl = null;
    let cursorEl = null;
    let isStreaming = false;
    let streamAccumText = '';
    let streamAccumReasoning = null;

    const cleanupCursor = () => {
        if (cursorEl && cursorEl.parentNode) cursorEl.remove();
        cursorEl = null;
    };

    const onChunk = (text, reasoning, reasoningMs, reasoningDone) => {
        isStreaming = true;
        streamAccumText = text;
        streamAccumReasoning = reasoning;

        if (!streamMsgId) {
            const placeholder = { id: `msg_${Date.now()}`, role: 'assistant', content: '', reasoning: null, timestamp: Date.now(), anchorIndex: getLiveEdgeIndex() };
            conversation.messages.push(placeholder);
            streamMsgId = placeholder.id;
            
            appendMsgEl(placeholder, true);
            
            streamMsgEl = document.querySelector(`.iv-msg[data-id="${streamMsgId}"]`);
            if (streamMsgEl) {
                const body = streamMsgEl.querySelector('.iv-msg-body');
                streamContentEl = streamMsgEl.querySelector('.iv-msg-content');

                streamReasoningBlockEl = document.createElement('details');
                streamReasoningBlockEl.className = 'iv-reasoning-block';
                streamReasoningBlockEl.style.display = 'none';
                streamReasoningSummaryEl = document.createElement('summary');
                streamReasoningSummaryEl.className = 'iv-reasoning-summary';
                streamReasoningSummaryEl.textContent = 'Thinking…';
                streamReasoningContentEl = document.createElement('div');
                streamReasoningContentEl.className = 'iv-reasoning-content';
                streamReasoningBlockEl.appendChild(streamReasoningSummaryEl);
                streamReasoningBlockEl.appendChild(streamReasoningContentEl);
                if (body) body.insertBefore(streamReasoningBlockEl, streamContentEl);

                cursorEl = document.createElement('span');
                cursorEl.className = 'iv-stream-cursor';

                const bar = document.getElementById('iv-thinking-bar');
                if (bar) bar.style.display = 'flex';
            }
        }

        if (streamContentEl) {
            let procReasoning = reasoning || '';
            let procText = stripMemoryBlock(text);
            
            let tcIndex = 0;
            if (procReasoning) {
                const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                procReasoning = resR.text;
                tcIndex = resR.nextIndex;
            }
            const resC = extractToolCallPlaceholders(procText, tcIndex);
            procText = resC.text;

            if (reasoning && streamReasoningBlockEl) {
                streamReasoningBlockEl.style.display = '';
                streamReasoningContentEl.innerHTML = renderMarkdown(procReasoning);
                postProcessHTMLBlocks(streamReasoningContentEl);
                const secs = reasoningMs ? (reasoningMs / 1000).toFixed(1) : null;
                streamReasoningSummaryEl.textContent = reasoningDone
                    ? `Thought for ${secs}s`
                    : secs ? `Thinking for ${secs}s…` : 'Thinking…';
            }

            streamContentEl.innerHTML = renderMarkdown(procText);
            if (procText) streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (state.activeToolCalls.length || tcIndex > 0) {
                const liveTCs = parseToolCallsFromText((reasoning || '') + '\n' + text);
                const displayed = liveTCs.map((tc, i) => state.activeToolCalls[i] || {
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'running', result: undefined
                });
                postProcessToolCalls(streamMsgEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    try {
        if (addUserMsg && userText) {
            const msgObj = addTurn(conversation, 'user', userText);
            appendMsgEl(msgObj);
            await notePortrayAutoTrigger(msgObj);
        }

        const fullMessages = await assembleMessages(conversation, settings, userText || null);
        const fullPromptText = fullMessages.map(m => m.content).join('\n');
        const tokensIn = await estimateTokens(fullPromptText);

        _dbgAdd('GEN_START', {
            src: settings.connectionSource,
            profile: settings.connectionProfileId || null,
            maxTokens: settings.maxTokens,
            streaming: settings.forceStreaming,
            ctxDepth: settings.contextDepth,
            tokensIn
        });

        let result = await callGenerate(conversation, settings, userText || null, onChunk);

        cleanupCursor();
        
        if (result && !result.text.trim() && !result.reasoning?.trim()) {
            toastr.warning('⚠ Generation failed: AI returned an empty response.', EXT_DISPLAY, { timeOut: 10000 });
        }

        if (result !== null && settings.toolsEnabled && getEnabledTools().length > 0) {
            const maxRounds = settings.toolsMaxRounds ?? 5;
            let roundText = result.text || '';
            let roundReasoning = result.reasoning;
            let extraHistory = [];

            let accumulatedText = roundText;
            let accumulatedReasoning = roundReasoning || null;

            const _updateLiveUI = (tempText = '', tempReasoning = null) => {
                if (!streamMsgEl || !streamContentEl) return;
                let combinedText = tempText ? accumulatedText + '\n\n' + tempText : accumulatedText;
                let combinedReasoning = accumulatedReasoning || '';
                if (tempReasoning) {
                    combinedReasoning = combinedReasoning ? combinedReasoning + '\n\n' + tempReasoning : tempReasoning;
                }
                
                let procReasoning = combinedReasoning;
                let procText = stripMemoryBlock(combinedText);
                let tcIndex = 0;
                
                if (procReasoning) {
                    const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                    procReasoning = resR.text;
                    tcIndex = resR.nextIndex;
                }
                const resC = extractToolCallPlaceholders(procText, tcIndex);
                procText = resC.text;

                if (combinedReasoning && streamReasoningBlockEl) {
                    streamReasoningBlockEl.style.display = '';
                    streamReasoningContentEl.innerHTML = renderMarkdown(procReasoning);
                    postProcessHTMLBlocks(streamReasoningContentEl);
                }
                streamContentEl.innerHTML = renderMarkdown(procText);
                postProcessHTMLBlocks(streamContentEl);

                if (state.activeToolCalls.length || tcIndex > 0) {
                    postProcessToolCalls(streamMsgEl, state.activeToolCalls);
                }
                smartScrollToBottom();
            };

            for (let round = 0; round < maxRounds; round++) {
                let tcs = parseToolCallsFromText(roundText);
                if (!tcs.length) break;

                const roundEntries = [];
                for (const tc of tcs) {
                    const tcId = `tc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
                    const entry = { id: tcId, name: tc.name, input: tc.input, status: 'running', result: undefined };
                    state.activeToolCalls.push(entry);
                    roundEntries.push(entry);
                    
                    _updateLiveUI();

                    try {
                        const res = await executeTool(tc.name, tc.input);
                        if (res?.__ask_user) {
                            if (!streamMsgEl) {
                                entry.result = { warning: 'ask_user requires streaming to be enabled.' };
                                entry.status = 'warning';
                            } else {
                                entry.result = await executeAskUser(res, streamMsgEl);
                                entry.status = 'done';
                            }
                        } else if (res?.__imagePending) {
                            entry.result = res.sentinel;
                            entry.status = 'done';
                        } else {
                            entry.result = res?.result && res?.sentinel ? res.sentinel : res;
                            entry.status = 'done';
                        }
                    } catch (e) {
                        _dbgAdd('TOOL_EXECUTION_FAILED', { toolName: tc.name, error: e.message });
                        entry.result = { error: e.message };
                        entry.status = 'error';
                    }
                    
                    _updateLiveUI();
                }

                extraHistory.push({ role: 'assistant', content: stripMemoryBlock(roundText) });
                const toolResultsText = roundEntries.map(e =>
                    `<tool_result name="${e.name}" status="${e.status}">\n${typeof e.result === 'string' ? e.result : JSON.stringify(e.result, null, 2)}\n</tool_result>`
                ).join("\n");

                extraHistory.push({ role: 'user', content: `<tool_results>\n${toolResultsText}\n</tool_results>\n\nCONTINUE your response using these results. Write exactly where you left off.` });

                const thinkingText = document.getElementById('iv-thinking-text');
                if (thinkingText) thinkingText.textContent = `Round ${round + 2}/${maxRounds + 1}…`;
                const bar = document.getElementById('iv-thinking-bar');
                if (bar) bar.style.display = 'flex';

                for (const eh of extraHistory) {
                    conversation.messages.push({ id: `tc_hist_${Date.now()}`, role: eh.role, content: eh.content, timestamp: Date.now(), _tcTemp: true });
                }

                isStreaming = false;
                streamAccumText = '';
                const cursor2 = document.createElement('span');
                cursor2.className = 'iv-stream-cursor';
                
                const tempConversation = { 
                    ...conversation, 
                    messages: conversation.messages.filter(m => m.id !== streamMsgId) 
                };

                const nextResult = await callGenerate(tempConversation, settings, null, (t, r) => {
                    _updateLiveUI(t, r);
                    if (streamContentEl) streamContentEl.appendChild(cursor2);
                });

                conversation.messages = conversation.messages.filter(m => !m._tcTemp);
                cursor2.remove();

                if (nextResult === null) break;

                roundText = nextResult.text || '';
                roundReasoning = nextResult.reasoning || null;
                
                accumulatedText += '\n\n' + roundText;
                if (roundReasoning) {
                    accumulatedReasoning = accumulatedReasoning ? accumulatedReasoning + '\n\n' + roundReasoning : roundReasoning;
                }
                
                result = { text: accumulatedText, reasoning: accumulatedReasoning };
            }
        }

        if (result === null) {
            if (streamMsgId && isStreaming && streamAccumText) {
                const msg = conversation.messages.find(m => m.id === streamMsgId);
                if (msg) { msg.content = streamAccumText; msg.reasoning = streamAccumReasoning || null; saveConversation(); }
                if (streamContentEl) { streamContentEl.innerHTML = renderMarkdown(streamAccumText); postProcessHTMLBlocks(streamContentEl); }
            } else if (streamMsgId) {
                const idx = conversation.messages.findIndex(m => m.id === streamMsgId);
                if (idx >= 0 && !conversation.messages[idx].content) {
                    conversation.messages.splice(idx, 1);
                    streamMsgEl?.remove();
                    updateMsgCount(conversation);
                }
            }
            return;
        }

        const { text: rawFullText, reasoning: fullReasoning } = result;
        const rawNormalized = normalizeCharNamesInBlock(rawFullText); 
        processMemoryUpdates(rawNormalized, streamMsgId);
        const fullText = stripMemoryBlock(rawNormalized);

        const savedToolCalls = state.activeToolCalls.length ? sanitizeToolCallsForSave(JSON.parse(JSON.stringify(state.activeToolCalls))) : undefined;

        let completedAssistant = null;
        if (streamMsgId) {
            const msg = conversation.messages.find(m => m.id === streamMsgId);
            if (msg) { 
                msg.content = fullText; 
                msg.reasoning = fullReasoning || null; 
                msg.toolCalls = savedToolCalls; 
                msg.swipes = [{ content: fullText, reasoning: fullReasoning || null }];
                msg.swipeIndex = 0;
                completedAssistant = msg;
            }
            saveConversation();

            if (msg && streamMsgEl) {
                _renderMsgBodyContent(streamMsgEl, msg);
            }
        } else {
            const newMsg = addTurn(conversation, 'assistant', fullText, { reasoning: fullReasoning || null, toolCalls: savedToolCalls });
            newMsg.swipes = [{ content: fullText, reasoning: fullReasoning || null }];
            newMsg.swipeIndex = 0;
            saveConversation();
            appendMsgEl(newMsg);
            completedAssistant = newMsg;
        }
        if (completedAssistant) await notePortrayAutoTrigger(completedAssistant);

        _refreshSwipeBars(conversation);
        state.activeToolCalls = [];

        const tokensOut = await estimateTokens(fullText);

        playCompletionSound();
        _dbgAdd('GEN_DONE', { chars: fullText?.length || 0, hasReasoning: !!fullReasoning, tokensOut });

    } catch (err) {
        cleanupCursor();
        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') {
            state.generating = false;
            setGeneratingState(false);
            return;
        }
        
        const inputEl = document.getElementById('iv-input');
        if (inputEl && inputEl.value.trim() === '' && userText) {
            inputEl.value = userText;
        }

        _dbgAdd('GEN_ERROR', { msg: err?.message || String(err), stack: err?.stack });
        console.error(`[${EXT_DISPLAY}] Generation failed:`, err);
        
        showGenerationError(err);
    } finally {
        state.generating = false;
        setGeneratingState(false);
        await flushPortrayAutoTrigger();
    }
}

function _joinContinuation(existing, continuation) {
    if (!continuation) return existing;
    const trimmed = existing.trimEnd();
    const needsSpace = /[\w.,!?;:'")\]}>]$/.test(trimmed);
    return trimmed + (needsSpace ? ' ' : '') + continuation;
}

async function runContinue(conversation, targetMsgId) {
    _dbgAdd('CONTINUE_TRIGGERED', { targetMsgId });
    
    if (state.generating) return;
    const targetMsg = conversation.messages.find(m => m.id === targetMsgId);
    if (!targetMsg || targetMsg.role !== 'assistant') return;

    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    const CONTINUE_PROMPT = 'Continue your response exactly from where you left off. Do not repeat any previously written text.';

    let streamContentEl = null;
    let cursorEl = null;
    let isStreaming = false;
    let streamAccumContinuation = '';
    const originalContent = targetMsg.content;

    const targetEl = document.querySelector(`.iv-msg[data-id="${targetMsgId}"]`);
    if (targetEl) streamContentEl = targetEl.querySelector('.iv-msg-content');

    const cleanupCursor = () => {
        if (cursorEl && cursorEl.parentNode) cursorEl.remove();
        cursorEl = null;
    };

    const onChunk = (text) => {
        isStreaming = true;
        streamAccumContinuation = text;
        if (!cursorEl) {
            cursorEl = document.createElement('span');
            cursorEl.className = 'iv-stream-cursor';
            const bar = document.getElementById('iv-thinking-bar');
            if (bar) bar.style.display = 'flex';
        }
        const combined = _joinContinuation(originalContent, text);
        let tcIndex = 0;
        const resC = extractToolCallPlaceholders(combined, tcIndex);
        let procText = resC.text;

        const { content: disp } = getDisplayContent(procText, settings);
        if (streamContentEl) {
            streamContentEl.innerHTML = renderMarkdown(disp);
            streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (resC.nextIndex > 0) {
                const liveTCs = parseToolCallsFromText(combined);
                const displayed = liveTCs.map((tc, i) => targetMsg.toolCalls?.[i] || {
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'done', result: undefined
                });
                postProcessToolCalls(targetEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    const _applyFinalContinuation = (fullCombined) => {
        const { content: disp } = getDisplayContent(fullCombined, settings);
        if (streamContentEl) { streamContentEl.innerHTML = renderMarkdown(disp); postProcessHTMLBlocks(streamContentEl); }
        _renderMsgBodyContent(targetEl, targetMsg);
    };

    try {
        const fullMessages = await assembleMessages(conversation, settings, CONTINUE_PROMPT);
        const fullPromptText = fullMessages.map(m => m.content).join('\n');
        
        const tokensIn = await estimateTokens(fullPromptText);

        _dbgAdd('CONTINUE_START', {
            src: settings.connectionSource,
            maxTokens: settings.maxTokens,
            streaming: settings.forceStreaming,
            ctxDepth: settings.contextDepth,
            tokensIn
        });

        const result = await callGenerate(conversation, settings, CONTINUE_PROMPT, onChunk);
        cleanupCursor();

        if (result === null) {
            if (isStreaming && streamAccumContinuation) {
                const combined = _joinContinuation(originalContent, streamAccumContinuation);
                targetMsg.content = combined;
                if (targetMsg.swipes && targetMsg.swipeIndex !== undefined) {
                    targetMsg.swipes[targetMsg.swipeIndex] = { content: combined, reasoning: targetMsg.reasoning || null };
                }
                saveConversation();
                _applyFinalContinuation(combined);
            }
            return;
        }

        const { text: rawContinuation, isMaxTokens } = result;
        processMemoryUpdates(rawContinuation, targetMsgId);
        const continuation = stripMemoryBlock(rawContinuation);
        const combined = _joinContinuation(originalContent, continuation);
        
        if (isMaxTokens) {
            toastr.warning('Generation stopped: reached Max Response Tokens limit.', EXT_DISPLAY, { timeOut: 10000 });
        }

        targetMsg.content = combined;

        if (targetMsg.swipes && targetMsg.swipeIndex !== undefined) {
            targetMsg.swipes[targetMsg.swipeIndex] = { content: combined, reasoning: targetMsg.reasoning || null };
        }
        saveConversation();
        _applyFinalContinuation(combined);

        const tokensOut = await estimateTokens(continuation);

        updateMsgCount(conversation);
        playCompletionSound();
        _dbgAdd('CONTINUE_DONE', { chars: continuation?.length || 0, tokensOut });

    } catch (err) {
        cleanupCursor();
        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') {
            state.generating = false;
            setGeneratingState(false);
            return;
        }
        _dbgAdd('GEN_ERROR', { msg: err?.message || String(err), stack: err?.stack });
        console.error(`[${EXT_DISPLAY}] Continuation failed:`, err);

        showGenerationError(err);
    } finally {
        state.generating = false;
        setGeneratingState(false);
    }
}

var api = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _joinContinuation: _joinContinuation,
    assembleMessages: assembleMessages,
    buildSystemContent: buildSystemContent,
    callGenerate: callGenerate,
    estimateTokens: estimateTokens,
    formatPayloadAsText: formatPayloadAsText,
    getMainChatSlice: getMainChatSlice,
    runContinue: runContinue,
    runGenerate: runGenerate
});

// ─── Quick Prompts ───────────────────────────────────────────────────────────

function renderQuickPromptsBar() {
    const bar = document.getElementById('iv-qp-bar');
    const toggleBtn = document.getElementById('iv-qp-toggle-btn');
    if (!bar) return;
    const s = getSettings();
    const prompts = s.quickPrompts || [];
    const visible = s.quickPromptsVisible && prompts.length > 0;

    bar.innerHTML = '';
    for (const qp of prompts) {
        const btn = document.createElement('button');
        btn.className = 'iv-qp-chip';
        const truncTitle = qp.text.length > 100 ? qp.text.slice(0, 100) + '…' : qp.text;
        btn.title = truncTitle;
        btn.innerHTML = `<span class="iv-qp-icon">${escHtml(qp.icon || '⚡')}</span><span class="iv-qp-label">${escHtml(qp.label || '')}</span>`;
        btn.addEventListener('click', () => {
            const input = document.getElementById('iv-input');
            if (!input) return;
            input.value = qp.text;
            autoResize(input);
            input.focus();
        });
        bar.appendChild(btn);
    }

    if (visible) {
        bar.classList.add('iv-qp-bar--open');
    } else {
        bar.classList.remove('iv-qp-bar--open');
    }
    if (toggleBtn) toggleBtn.classList.toggle('active', s.quickPromptsVisible);
}

let _qpIconPickerEl = null;

function showQPIconPicker(anchorEl, currentIcon, onSelect) {
    if (_qpIconPickerEl && _qpIconPickerEl.__anchor === anchorEl) { 
        _qpIconPickerEl.remove(); 
        _qpIconPickerEl = null; 
        return; 
    }
    if (_qpIconPickerEl) { _qpIconPickerEl.remove(); _qpIconPickerEl = null; }
    
    const pop = document.createElement('div');
    pop.className = 'iv-qp-icon-picker';
    pop.__anchor = anchorEl;

    for (const emoji of QP_ICON_POOL) {
        const btn = document.createElement('button');
        btn.className = `iv-qp-icon-option${emoji === currentIcon ? ' active' : ''}`;
        btn.textContent = emoji;
        btn.addEventListener('click', () => { onSelect(emoji); pop.remove(); _qpIconPickerEl = null; });
        pop.appendChild(btn);
    }
    document.body.appendChild(pop);
    _qpIconPickerEl = pop;
    const rect = anchorEl.getBoundingClientRect();
    pop.style.cssText = `position:fixed;z-index:2147483060;top:${rect.bottom + 4}px;left:${rect.left}px`;
    requestAnimationFrame(() => {
        const pr = pop.getBoundingClientRect();
        if (pr.right > window.innerWidth - 8) pop.style.left = `${window.innerWidth - pr.width - 8}px`;
        if (pr.bottom > window.innerHeight - 8) pop.style.top = `${rect.top - pr.height - 6}px`;
    });
    const onOut = e => {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
            pop.remove(); _qpIconPickerEl = null;
            document.removeEventListener('mousedown', onOut, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOut, true), 0);
}

// ─── Preset Dropdown ───────────────────────────────────────────

let _activePresetPanel = null;

function openPresetDropdown(triggerEl, groups, onSelect, opts = {}) {
    const { placeholder = 'Search…', width = 320, emptyText = 'Nothing here' } = opts;

    if (_activePresetPanel) {
        _activePresetPanel.remove();
        _activePresetPanel = null;
        triggerEl.classList.remove('open');
        return;
    }

    triggerEl.classList.add('open');

    const panel = document.createElement('div');
    panel.className = 'iv-pdd-panel';
    panel.style.width = `${width}px`;
    _activePresetPanel = panel;

    const allItems = groups.flatMap(g => g.items);

    if (allItems.length > 6) {
        const sw = document.createElement('div');
        sw.className = 'iv-pdd-search-wrap';
        const si = document.createElement('input');
        si.type = 'text'; si.placeholder = placeholder;
        si.className = 'iv-pdd-search';
        si.addEventListener('input', () => renderContent(si.value.trim().toLowerCase()));
        sw.appendChild(si);
        panel.appendChild(sw);
        setTimeout(() => si.focus(), 60);
    }

    const listEl = document.createElement('div');
    listEl.className = 'iv-pdd-list';
    panel.appendChild(listEl);

    const renderContent = (q = '') => {
        listEl.innerHTML = '';
        let totalShown = 0;
        groups.forEach(group => {
            const filtered = q
                ? group.items.filter(it => it.name.toLowerCase().includes(q) || (it.preview || '').toLowerCase().includes(q))
                : group.items;
            if (!filtered.length) return;
            totalShown += filtered.length;
            if (group.label) {
                const hdr = document.createElement('div');
                hdr.className = 'iv-pdd-group-label';
                hdr.textContent = group.label;
                listEl.appendChild(hdr);
            }
            filtered.forEach(item => {
                const row = document.createElement('div');
                row.className = 'iv-pdd-item';
                const top = document.createElement('div');
                top.className = 'iv-pdd-item-top';
                const name = document.createElement('span');
                name.className = 'iv-pdd-item-name';
                name.textContent = item.name;
                top.appendChild(name);
                if (item.badge) {
                    const b = document.createElement('span');
                    b.className = `iv-pdd-badge iv-pdd-badge--${item.badge}`;
                    b.textContent = item.badge;
                    top.appendChild(b);
                }
                row.appendChild(top);
                if (item.preview) {
                    const prev = document.createElement('div');
                    prev.className = 'iv-pdd-item-preview';
                    prev.textContent = item.preview;
                    row.appendChild(prev);
                }
                row.addEventListener('click', () => {
                    onSelect(item.value, item.name, item);
                    closePresetPanel();
                });
                listEl.appendChild(row);
            });
        });
        if (!totalShown) {
            const empty = document.createElement('div');
            empty.className = 'iv-pdd-empty';
            empty.textContent = q ? 'No results' : emptyText;
            listEl.appendChild(empty);
        }
    };

    renderContent();
    document.body.appendChild(panel);

    const rect = triggerEl.getBoundingClientRect();
    panel.style.cssText += `;position:fixed;z-index:2147483060;top:${rect.bottom + 5}px;left:${rect.left}px;max-width:calc(100vw - 16px)`;
    requestAnimationFrame(() => {
        const pr = panel.getBoundingClientRect();
        if (pr.right > window.innerWidth - 8) panel.style.left = `${window.innerWidth - pr.width - 8}px`;
        if (pr.bottom > window.innerHeight - 8) panel.style.top = `${rect.top - pr.height - 5}px`;
    });

    setTimeout(() => {
        const onOut = e => {
            if (!panel.contains(e.target) && e.target !== triggerEl) {
                closePresetPanel();
                document.removeEventListener('mousedown', onOut, true);
            }
        };
        document.addEventListener('mousedown', onOut, true);
    }, 0);
}

function closePresetPanel() {
    if (_activePresetPanel) { _activePresetPanel.remove(); _activePresetPanel = null; }
    document.querySelectorAll('.iv-pdd-trigger.open, .iv-preset-mgr-trigger.open')
        .forEach(el => el.classList.remove('open'));
}

function buildPromptPresetManager(containerEl, getTextFn, setTextFn, dictKey = 'promptPresets') {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const s = getSettings();
    if (!s[dictKey]) s[dictKey] = {};

    let _activeName = '';
    let _activeSource = '';

    const bar = document.createElement('div');
    bar.className = 'iv-preset-mgr-bar';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'iv-preset-mgr-trigger';
    trigger.innerHTML = `<span class="iv-pmt-label">Select a preset…</span><svg class="iv-pmt-chevron" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    const labelEl = trigger.querySelector('.iv-pmt-label');

    const setActive = (name, source) => {
        _activeName = name;
        _activeSource = source;
        labelEl.textContent = name || 'Select a preset…';
        trigger.classList.toggle('iv-pmt--has-value', !!name);
        updateBtnStates();
    };

    const buildGroups = () => {
        const groups = [];
        const profileItems = Object.keys(s.profiles || {})
            .filter(n => s.profiles[n].systemPrompt)
            .map(n => ({
                name: n,
                value: s.profiles[n].systemPrompt,
                preview: (s.profiles[n].systemPrompt || '').replace(/\s+/g, ' ').slice(0, 80),
                badge: 'profile',
                _source: 'profile',
            }));
        if (profileItems.length) groups.push({ label: 'From Profiles', items: profileItems });

        const customItems = Object.keys(s[dictKey])
            .map(n => ({
                name: n,
                value: s[dictKey][n],
                preview: (s[dictKey][n] || '').replace(/\s+/g, ' ').slice(0, 80),
                badge: 'custom',
                _source: 'custom',
            }));
        if (customItems.length) groups.push({ label: 'Custom Presets', items: customItems });
        return groups;
    };

    trigger.addEventListener('click', () => {
        const groups = buildGroups();
        openPresetDropdown(trigger, groups, (value, name, item) => {
            setTextFn(value);
            setActive(name, item._source || 'custom');
        }, { placeholder: 'Search presets…', width: 360, emptyText: 'No presets saved yet' });
    });

    const mkBtn = (icon, title, cls, cb) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `iv-preset-mgr-btn${cls ? ' ' + cls : ''}`;
        b.title = title;
        b.innerHTML = `<i class="fa-solid fa-${icon}"></i>`;
        b.addEventListener('click', cb);
        return b;
    };

    const saveBtn = mkBtn('floppy-disk', 'Save preset', '', async () => {
        if (_activeName && _activeSource === 'custom') {
            s[dictKey][_activeName] = getTextFn();
            saveSettings();
            toastr.success(`Saved preset "${escHtml(_activeName)}"`, EXT_DISPLAY);
        } else {
            const name = await showCustomDialog({ type: 'prompt', title: 'Save Prompt Preset', message: 'Preset name:', placeholder: 'My Preset' });
            if (!name?.trim()) return;
            s[dictKey][name.trim()] = getTextFn();
            saveSettings();
            setActive(name.trim(), 'custom');
            toastr.success(`Saved preset "${escHtml(name.trim())}"`, EXT_DISPLAY);
        }
    });

    const renameBtn = mkBtn('pen', 'Rename selected custom preset', '', async () => {
        if (!_activeName || _activeSource !== 'custom') { toastr.info('Select a custom preset first.', EXT_DISPLAY); return; }
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Preset', message: 'New name:', defaultValue: _activeName });
        if (!newName?.trim() || newName.trim() === _activeName) return;
        s[dictKey][newName.trim()] = s[dictKey][_activeName];
        delete s[dictKey][_activeName];
        saveSettings();
        setActive(newName.trim(), 'custom');
    });

    const deleteBtn = mkBtn('trash', 'Delete selected custom preset', 'danger', async () => {
        if (!_activeName || _activeSource !== 'custom') { toastr.info('Only custom presets can be deleted.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Preset', message: `Delete "${_activeName}"?` });
        if (!ok) return;
        delete s[dictKey][_activeName];
        saveSettings();
        setActive('', '');
    });

    const updateBtnStates = () => {
        const isCustom = !!_activeName && _activeSource === 'custom';
        renameBtn.disabled = !isCustom;
        deleteBtn.disabled = !isCustom;
        renameBtn.style.opacity = isCustom ? '1' : '0.35';
        deleteBtn.style.opacity = isCustom ? '1' : '0.35';
    };
    updateBtnStates();

    bar.appendChild(trigger);
    bar.appendChild(saveBtn);
    bar.appendChild(renameBtn);
    bar.appendChild(deleteBtn);
    containerEl.appendChild(bar);
}

function buildQPSetManager(containerEl, onSetLoaded) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const s = getSettings();
    if (!s.quickPromptSets) s.quickPromptSets = {};

    let _activeName = s.activeQuickPromptSet || '';

    const bar = document.createElement('div');
    bar.className = 'iv-preset-mgr-bar';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'iv-preset-mgr-trigger';
    const getLabel = name => {
        if (!name) return 'Select a set…';
        const count = (s.quickPromptSets[name] || []).length;
        return `${name}  (${count})`;
    };
    trigger.innerHTML = `<span class="iv-pmt-label">${escHtml(getLabel(_activeName))}</span><svg class="iv-pmt-chevron" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    const labelEl = trigger.querySelector('.iv-pmt-label');

    const setActive = name => {
        _activeName = name;
        labelEl.textContent = getLabel(name);
        trigger.classList.toggle('iv-pmt--has-value', !!name);
        updateBtnStates();
    };

    const buildGroups = () => {
        const items = Object.keys(s.quickPromptSets).map(name => ({
            name,
            value: name,
            preview: `${(s.quickPromptSets[name] || []).length} prompts: ` +
                (s.quickPromptSets[name] || []).map(q => `${q.icon || '⚡'} ${q.label}`).join(', ').slice(0, 80),
            badge: name === s.activeQuickPromptSet ? 'active' : null,
        }));
        return [{ label: items.length ? 'Saved Sets' : null, items }];
    };

    trigger.addEventListener('click', () => {
        openPresetDropdown(trigger, buildGroups(), (value) => {
            if (!s.quickPromptSets[value]) return;
            s.quickPrompts = JSON.parse(JSON.stringify(s.quickPromptSets[value]));
            s.activeQuickPromptSet = value;
            saveSettings();
            setActive(value);
            renderQuickPromptsBar();
            if (onSetLoaded) onSetLoaded();
            toastr.success(`Loaded set "${escHtml(value)}"`, EXT_DISPLAY);
        }, { placeholder: 'Search sets…', width: 340, emptyText: 'No sets saved yet. Save one below.' });
    });

    const mkBtn = (icon, title, cls, cb) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `iv-preset-mgr-btn${cls ? ' ' + cls : ''}`;
        b.title = title;
        b.innerHTML = `<i class="fa-solid fa-${icon}"></i>`;
        b.addEventListener('click', cb);
        return b;
    };

    const saveBtn = mkBtn('floppy-disk', 'Save current prompts to active set (or new)', '', async () => {
        let name = _activeName;
        if (!name) {
            name = await showCustomDialog({ type: 'prompt', title: 'Save Prompt Set', message: 'Set name:', placeholder: 'My Set' });
            if (!name?.trim()) return;
            name = name.trim();
        }
        s.quickPromptSets[name] = JSON.parse(JSON.stringify(s.quickPrompts));
        s.activeQuickPromptSet = name;
        saveSettings();
        setActive(name);
        toastr.success(`Saved set "${escHtml(name)}"`, EXT_DISPLAY);
    });

    const saveAsBtn = mkBtn('plus', 'Save current prompts as a new set', '', async () => {
        const name = await showCustomDialog({ type: 'prompt', title: 'New Prompt Set', message: 'Set name:', placeholder: 'My New Set' });
        if (!name?.trim()) return;
        const n = name.trim();
        s.quickPromptSets[n] = JSON.parse(JSON.stringify(s.quickPrompts));
        s.activeQuickPromptSet = n;
        saveSettings();
        setActive(n);
        toastr.success(`Created set "${escHtml(n)}"`, EXT_DISPLAY);
    });

    const renameBtn = mkBtn('pen', 'Rename selected set', '', async () => {
        if (!_activeName) { toastr.info('Select a set first.', EXT_DISPLAY); return; }
        const newName = await showCustomDialog({ type: 'prompt', title: 'Rename Set', message: 'New name:', defaultValue: _activeName });
        if (!newName?.trim() || newName.trim() === _activeName) return;
        const n = newName.trim();
        s.quickPromptSets[n] = s.quickPromptSets[_activeName];
        delete s.quickPromptSets[_activeName];
        if (s.activeQuickPromptSet === _activeName) s.activeQuickPromptSet = n;
        saveSettings();
        setActive(n);
    });

    const deleteBtn = mkBtn('trash', 'Delete selected set', 'danger', async () => {
        if (!_activeName) { toastr.info('Select a set first.', EXT_DISPLAY); return; }
        const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Set', message: `Delete set "${_activeName}"?` });
        if (!ok) return;
        delete s.quickPromptSets[_activeName];
        if (s.activeQuickPromptSet === _activeName) s.activeQuickPromptSet = '';
        saveSettings();
        setActive('');
    });

    const updateBtnStates = () => {
        const has = !!_activeName;
        renameBtn.disabled = !has; renameBtn.style.opacity = has ? '1' : '0.35';
        deleteBtn.disabled = !has; deleteBtn.style.opacity = has ? '1' : '0.35';
    };
    updateBtnStates();

    bar.appendChild(trigger);
    bar.appendChild(saveBtn);
    bar.appendChild(saveAsBtn);
    bar.appendChild(renameBtn);
    bar.appendChild(deleteBtn);
    containerEl.appendChild(bar);
}

// ─── Sounds ─────────────────────────────────────────────────────────────

const _SOUND_PRESETS = {
    none:    { label: 'None' },
    chime:   { label: 'Chime' },
    bell:    { label: 'Bell' },
    soft:    { label: 'Soft Ping' },
    digital: { label: 'Digital Blip' },
    pop:     { label: 'Pop' },
};

function _synthSound(type, volume = 80) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const masterGain = ctx.createGain();
        masterGain.gain.value = Math.max(0, Math.min(1, volume / 100));
        masterGain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'chime') {
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
                const og = ctx.createGain();
                o.connect(og); og.connect(masterGain);
                og.gain.setValueAtTime(0, now + i * 0.12);
                og.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
                og.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.5);
                o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.5);
            });
        } else if (type === 'bell') {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
            const og = ctx.createGain();
            o.connect(og); og.connect(masterGain);
            og.gain.setValueAtTime(0.25, now);
            og.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            o.start(now); o.stop(now + 1.2);
        } else if (type === 'soft') {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 660;
            const og = ctx.createGain();
            o.connect(og); og.connect(masterGain);
            og.gain.setValueAtTime(0, now);
            og.gain.linearRampToValueAtTime(0.15, now + 0.05);
            og.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            o.start(now); o.stop(now + 0.4);
        } else if (type === 'digital') {
            [440, 880].forEach((freq, i) => {
                const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
                const og = ctx.createGain();
                o.connect(og); og.connect(masterGain);
                og.gain.setValueAtTime(0.08, now + i * 0.07);
                og.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.12);
                o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.12);
            });
        } else if (type === 'pop') {
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(600, now);
            o.frequency.exponentialRampToValueAtTime(200, now + 0.1);
            const og = ctx.createGain();
            o.connect(og); og.connect(masterGain);
            og.gain.setValueAtTime(0.22, now);
            og.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            o.start(now); o.stop(now + 0.15);
        }
        setTimeout(() => ctx.close(), 2000);
    } catch (_) {}
}

function playCompletionSound(force = false) {
    const s = getSettings();
    const soundType = s.completionSound || 'none';
    const vol = s.completionSoundVolume ?? 80;
    if (soundType === 'none') return;
    if (!force && s.completionSoundOnlyWhenUnfocused && document.hasFocus()) return;

    if (soundType.startsWith('custom_') && s.customSounds && s.customSounds[soundType]) {
        try {
            const audio = new Audio(s.customSounds[soundType].data);
            audio.volume = vol / 100;
            audio.play().catch(() => {});
        } catch (_) {}
        return;
    }

    if (soundType === 'custom' && s.completionSoundData) {
        try {
            const audio = new Audio(s.completionSoundData);
            audio.volume = vol / 100;
            audio.play().catch(() => {});
        } catch (_) {}
        return;
    }
    
    if (_SOUND_PRESETS[soundType] && soundType !== 'none') {
        _synthSound(soundType, vol);
    }
}

// ─── Changelog ───────────────────────────────────────────────────────────────

function buildChangelogHTML() {
    const current = CHANGELOG[0];
    const past = CHANGELOG.slice(1);

    const notesHTML = current.notes
        .map(n => `<li>${n}</li>`)
        .join('');

    let historyHTML = '';
    if (past.length) {
        historyHTML = `<div class="iv-cl-history">` +
            past.map(entry => {
                const li = (entry.notes || []).map(n => `<li>${n}</li>`).join('');
                return `<details class="iv-cl-entry">
                    <summary class="iv-cl-entry-summary">
                        <span class="iv-cl-entry-ver">v${escHtml(entry.version)}</span>
                        <span style="flex:1;opacity:.5">${escHtml(entry.date || '')}</span>
                    </summary>
                    <div class="iv-cl-entry-body"><ul>${li}</ul></div>
                </details>`;
            }).join('') +
            `</div>`;
    }

    return `<div class="iv-cl-current">
        <div class="iv-cl-version-badge">✦ Version ${escHtml(current.version)} ${current.date ? '· ' + escHtml(current.date) : ''}</div>
        <div class="iv-cl-notes"><ul>${notesHTML}</ul></div>
    </div>${historyHTML}`;
}

function openChangelog() {
    const modal = document.getElementById('iv-changelog-modal');
    if (!modal) return;
    const body = document.getElementById('iv-changelog-body');
    if (body) body.innerHTML = buildChangelogHTML();
    modal.style.display = 'flex';
    Promise.resolve().then(function () { return uiWindow; }).then(m => m.bringWindowToFront());
}

function closeChangelog() {
    const modal = document.getElementById('iv-changelog-modal');
    if (modal) modal.style.display = 'none';
}

function checkChangelogAutoShow() {
    const s = getSettings();
    const current = CHANGELOG[0];
    const currentVersion = current?.version || '';
    if (s.changelogAutoShow && current?.announce !== false && s.lastSeenVersion !== currentVersion) {
        s.lastSeenVersion = currentVersion;
        saveSettings();
        setTimeout(openChangelog, 800);
    } else if (s.lastSeenVersion !== currentVersion) {
        s.lastSeenVersion = currentVersion;
        saveSettings();
    }
}

function setupChangelogListeners() {
    const modal = document.getElementById('iv-changelog-modal');
    if (!modal) return;
    document.getElementById('iv-changelog-close')?.addEventListener('click', closeChangelog);
    let _mdTarget = null;
    modal.addEventListener('mousedown', e => { _mdTarget = e.target; });
    modal.addEventListener('click', e => { if (e.target === modal && _mdTarget === modal) closeChangelog(); });
}

// ─── Context Inspector ──────────────────────────────────────────────────────

function _highlightContextText(raw) {
    const masterRe = /(```[\s\S]*?(?:```|$))|(`[^`\n]*`)|(<\/?([\w:{}_-]+)[^>]*>|<!--[\s\S]*?-->)|(\{\{[^}\n]+\}\})/gi;
    
    let m;
    masterRe.lastIndex = 0;
    let tempEvents = [];
    while ((m = masterRe.exec(raw)) !== null) {
        if (m[1] !== undefined) tempEvents.push({ start: m.index, end: masterRe.lastIndex, type: 'code_block', match: m[1] });
        else if (m[2] !== undefined) tempEvents.push({ start: m.index, end: masterRe.lastIndex, type: 'inline_code', match: m[2] });
        else if (m[3] !== undefined) tempEvents.push({ start: m.index, end: masterRe.lastIndex, type: 'tag', match: m[3], tagName: m[4] });
        else if (m[5] !== undefined) tempEvents.push({ start: m.index, end: masterRe.lastIndex, type: 'macro', match: m[5] });
    }

    const openStacks = {};
    const validTags = new Set();

    for (let i = 0; i < tempEvents.length; i++) {
        const ev = tempEvents[i];
        if (ev.type === 'tag') {
            const match = ev.match;
            if (match.startsWith('<!--') || match.endsWith('/>')) {
                validTags.add(ev.start);
            } else {
                const isClose = match.startsWith('</');
                const tagName = ev.tagName;
                if (!tagName) continue;

                if (isClose) {
                    if (openStacks[tagName] && openStacks[tagName].length > 0) {
                        const openEvIndex = openStacks[tagName].pop();
                        validTags.add(tempEvents[openEvIndex].start);
                        validTags.add(ev.start);
                    }
                } else {
                    if (!openStacks[tagName]) openStacks[tagName] = [];
                    openStacks[tagName].push(i);
                }
            }
        }
    }

    const events = [];
    for (const ev of tempEvents) {
        if (ev.type === 'tag' && !validTags.has(ev.start)) continue;
        events.push([ev.start, ev.end, ev.type, ev.match, ev.tagName]);
    }

    let html = '', last = 0;
    const KNOWN = new Set(['system_prompt','character_information','characters','character','st_system_prompt','persistent_memory','summary_context','main_chat','entity_definitions','inner_voice','{{user}}_thinking','{{user}}_persona', 'tool_calls_system', 'memory_system']);
    let currentDepth = 0;
    let emittedAnchors = new Set();

    for (const [start, end, type, match, tagName] of events) {
        if (start < last) continue;
        html += escHtml(raw.slice(last, start));
        
        if (type === 'tag') {
            const isClose = match.startsWith('</');
            const isSelfClose = match.endsWith('/>');
            const isComment = match.startsWith('<!--');

            let applyDepth;
            if (isComment || isSelfClose) {
                applyDepth = currentDepth;
            } else if (isClose) {
                currentDepth = Math.max(0, currentDepth - 1);
                applyDepth = currentDepth;
            } else {
                applyDepth = currentDepth;
                currentDepth++;
            }

            if (!isClose && !isComment && !isSelfClose && tagName) {
                if (KNOWN.has(tagName) || tagName.endsWith('_persona')) {
                    if (!emittedAnchors.has(tagName)) {
                        emittedAnchors.add(tagName);
                        html += `<span id="iv-ctx-sec-${tagName}" class="iv-ctx-anchor"></span>`;
                    }
                }
            }
            
            const depthClass = Math.min(applyDepth, 5);
            html += `<span class="iv-ctx-hl-tag iv-ctx-hl-tag-d${depthClass}">${escHtml(match)}</span>`;
        } else if (type === 'macro') {
            html += `<span class="iv-ctx-hl-macro">${escHtml(match)}</span>`;
        } else if (type === 'code_block' || type === 'inline_code') {
            html += escHtml(match);
        }
        last = end;
    }
    html += escHtml(raw.slice(last));
    return html;
}

function _buildContextInspectorHTML(messages) {
    const SECTION_LABELS = {
        'system_prompt': 'System Prompt', 
        'persistent_memory': 'Persistent Memory',
        'characters': 'Characters',
        '{{user}}_persona': 'User Persona',
        'memory_system': 'Memory Management',
        'tool_calls_system': 'Tool Calls'
    };
    const KNOWN_SECS = new Set(Object.keys(SECTION_LABELS));
    const ALIASES = {
        'character_information': 'characters',
        'character': 'characters'
    };
    const DISPLAY_ORDER = [
        'system_prompt',
        'persistent_memory',
        'characters',
        '{{user}}_persona',
        'memory_system',
        'tool_calls_system'
    ];

    let navHtml = '', bodyHtml = '';
    let seenSections = new Set();
    
    messages.forEach((msg, idx) => {
        let raw = Array.isArray(msg.content)
            ? msg.content.map(p => p.type === 'text' ? p.text : '[Image]').join('\n')
            : (msg.content || '');

        let displayRole = msg.role;
        if (msg.role === 'user' && raw.includes('"type": "system_notification"')) {
            displayRole = 'system';
        }

        const LABELS = { system:'■ SYSTEM', user:'▶ USER', assistant:'◀ ASSISTANT' };
        const label = (LABELS[displayRole] || displayRole) + (idx > 0 ? ` #${idx}` : '');
        const blockId = `iv-ctx-b${idx}`;

        navHtml += `<button class="iv-ctx-nav-btn iv-ctx-nav-${displayRole}" data-t="${blockId}">${escHtml(label)}</button>`;

        if (msg.role === 'system') {
            const tagRe = /<([\w:{}_-]+)[^>]*>/g;
            let tm;
            tagRe.lastIndex = 0;
            let foundMain = [];
            let foundModules = [];

            while ((tm = tagRe.exec(raw)) !== null) {
                let rawTag = tm[1];
                let tag = ALIASES[rawTag] ? ALIASES[rawTag] : rawTag;
                
                const isUserPersona = tag === '{{user}}_persona' || tag.endsWith('_persona');
                const key = isUserPersona ? '{{user}}_persona' : tag;

                if ((KNOWN_SECS.has(key) || isUserPersona) && !seenSections.has(key)) {
                    seenSections.add(key);
                    const secLabel = SECTION_LABELS[key] || (isUserPersona ? 'User Persona' : key);
                    const secId = `iv-ctx-sec-${rawTag}`;
                    
                    if (['memory_system', 'tool_calls_system'].includes(key)) {
                        foundModules.push({ key, id: secId, label: secLabel });
                    } else {
                        foundMain.push({ key, id: secId, label: secLabel });
                    }
                }
            }

            const sortFn = (a, b) => {
                let idxA = DISPLAY_ORDER.indexOf(a.key);
                let idxB = DISPLAY_ORDER.indexOf(b.key);
                if (idxA === -1) idxA = 999;
                if (idxB === -1) idxB = 999;
                return idxA - idxB;
            };

            foundMain.sort(sortFn);
            foundModules.sort(sortFn);

            foundMain.forEach(item => {
                navHtml += `<button class="iv-ctx-nav-btn iv-ctx-nav-sub" data-t="${item.id}">&nbsp;&nbsp;◦ ${escHtml(item.label)}</button>`;
            });

            let moduleNavs = '';
            foundModules.forEach(item => {
                moduleNavs += `<button class="iv-ctx-nav-btn iv-ctx-nav-sub" data-t="${item.id}">&nbsp;&nbsp;◦ ${escHtml(item.label)}</button>`;
            });

            if (moduleNavs) {
                 navHtml += `<details class="iv-ctx-nav-details" open><summary class="iv-ctx-nav-btn" style="color:var(--iv-text)">▼ Modules</summary>${moduleNavs}</details>`;
            }
        }

        const highlighted = _highlightContextText(raw);
        bodyHtml += `<div class="iv-ctx-block" id="${blockId}">`;
        bodyHtml += `<div class="iv-ctx-block-header iv-ctx-role-${displayRole}">${escHtml(label)}</div>`;
        bodyHtml += `<div class="iv-ctx-block-sep"></div>`;
        bodyHtml += `<div class="iv-ctx-block-body"><pre class="iv-ctx-pre">${highlighted}</pre></div>`;
        bodyHtml += `</div>`;
    });

    const styleHtml = `<style>
        .iv-ctx-hl-tag-d0 { color: #eff6ff !important; }
        .iv-ctx-hl-tag-d1 { color: #bfdbfe !important; }
        .iv-ctx-hl-tag-d2 { color: #93c5fd !important; }
        .iv-ctx-hl-tag-d3 { color: rgb(106, 165, 236) !important; }
        .iv-ctx-hl-tag-d4 { color: rgb(100, 158, 253) !important; }
        .iv-ctx-hl-tag-d5 { color: rgb(74, 120, 221) !important; }
    </style>`;

    return `<div class="iv-ctx-inspector">${styleHtml}<nav class="iv-ctx-nav">${navHtml}</nav><div class="iv-ctx-body" id="iv-ctx-body">${bodyHtml}</div></div>`;
}

let _lastInspectorMessages = [];

async function openInspector() {
    const conv = getConversation();
    const { getEffectiveSettings } = await Promise.resolve().then(function () { return conversation; });
    const settings = getEffectiveSettings();
    const inputEl = document.getElementById('iv-input');
    const pendingText = inputEl ? inputEl.value.trim() : '';

    const messages = await assembleMessages(conv, settings, pendingText);
    _lastInspectorMessages = messages;

    const fmtEl = document.getElementById('iv-ctx-formatted');
    const jsonEl = document.getElementById('iv-ctx-json');
    const modalEl = document.getElementById('iv-ctx-modal');
    
    const modal = modalEl.querySelector('.iv-modal');
    if (modal) {
        modal.style.height = '75vh';
    }
    
    const modalBody = modalEl.querySelector('.iv-modal-body');
    if (modalBody) {
        modalBody.style.padding = '0';
        modalBody.style.overflow = 'hidden';
        modalBody.style.display = 'flex';
        modalBody.style.flexDirection = 'column';
        modalBody.style.height = '100%';
    }

    if (fmtEl) {
        fmtEl.style.height = '100%';
        fmtEl.style.flex = '1';
        fmtEl.style.overflow = 'hidden';
        fmtEl.style.padding = '0';
        fmtEl.innerHTML = _buildContextInspectorHTML(messages);
        
        fmtEl.querySelectorAll('.iv-ctx-nav-btn[data-t]').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = document.getElementById(btn.dataset.t);
                const bodyContainer = document.getElementById('iv-ctx-body');
                if (t && bodyContainer) {
                    const topPos = t.offsetTop;
                    bodyContainer.scrollTo({ top: topPos, behavior: 'smooth' });
                }
            });
        });
    }
    if (jsonEl) jsonEl.textContent = JSON.stringify(messages, null, 2);
    modalEl.style.display = 'flex';
    Promise.resolve().then(function () { return uiWindow; }).then(m => m.bringWindowToFront());
    
    setTimeout(() => {
        const isJsonActive = document.querySelector('.iv-modal-tab.active')?.dataset.tab === 'json';
        const targetEl = isJsonActive ? jsonEl : document.getElementById('iv-ctx-body');
        if (targetEl) {
            const prevBehavior = targetEl.style.scrollBehavior;
            targetEl.style.scrollBehavior = 'auto';
            targetEl.scrollTop = targetEl.scrollHeight;
            targetEl.style.scrollBehavior = prevBehavior;
        }
    }, 0);
}

function buildSoundSettingsUI(container) {
    if (!container) return;
    container.innerHTML = '';
    const s = getSettings();
    if (!s.customSounds) s.customSounds = {};

    if (s.completionSoundData && !s.customSounds['custom_legacy']) {
        s.customSounds['custom_legacy'] = {
            name: s.completionSoundFileName || 'Legacy Custom Sound',
            data: s.completionSoundData
        };
        if (s.completionSound === 'custom') {
            s.completionSound = 'custom_legacy';
        }
        delete s.completionSoundData;
        delete s.completionSoundFileName;
        saveSettings();
    }

    const isSP = container.id === 'iv-sp-sound-settings';

    const typeRow = document.createElement('div');
    typeRow.className = isSP ? 'iv-sp-field' : '';
    if (!isSP) typeRow.style.marginTop = '10px';
    
    const typeLbl = document.createElement(isSP ? 'label' : 'b');
    typeLbl.className = isSP ? 'iv-sp-label' : '';
    if (!isSP) typeLbl.style.fontSize = '12px';
    typeLbl.textContent = 'Completion Sound';
    
    const typeWrap = document.createElement('div');
    typeWrap.style.cssText = 'display:flex;gap:6px;align-items:center';
    if (!isSP) typeWrap.style.marginTop = '6px';
    
    const typeSel = document.createElement('select');
    typeSel.className = isSP ? 'iv-sp-select text_pole' : 'text_pole';
    typeSel.style.flex = '1';
    
    const renderDropdown = () => {
        typeSel.innerHTML = '';
        
        const groupPreset = document.createElement('optgroup');
        groupPreset.label = 'Presets';
        for (const [key, preset] of Object.entries(_SOUND_PRESETS)) {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = preset.label;
            groupPreset.appendChild(opt);
        }
        typeSel.appendChild(groupPreset);
        
        if (Object.keys(s.customSounds).length > 0) {
            const groupCustom = document.createElement('optgroup');
            groupCustom.label = 'Custom Sounds';
            for (const [key, snd] of Object.entries(s.customSounds)) {
                const opt = document.createElement('option');
                opt.value = key; opt.textContent = snd.name;
                groupCustom.appendChild(opt);
            }
            typeSel.appendChild(groupCustom);
        }
        
        typeSel.value = s.completionSound || 'none';
        if (!typeSel.value) {
            typeSel.value = 'none';
            s.completionSound = 'none';
            saveSettings();
        }
    };
    renderDropdown();

    const testBtn = document.createElement('button');
    testBtn.className = isSP ? 'iv-action-btn' : 'menu_button interactable';
    testBtn.innerHTML = `<i class="fa-solid fa-play"></i><span>Test</span>`;
    if (!isSP) testBtn.style.flex = '0 0 auto';
    testBtn.addEventListener('click', () => playCompletionSound(true));
    
    typeWrap.appendChild(typeSel);
    typeWrap.appendChild(testBtn);
    typeRow.appendChild(typeLbl);
    typeRow.appendChild(typeWrap);
    container.appendChild(typeRow);

    const customActionsWrap = document.createElement('div');
    customActionsWrap.style.cssText = isSP ? 'display:flex;gap:6px;margin-top:6px' : 'display:flex;gap:6px;margin-top:6px;align-items:center';
    
    const uploadBtn = document.createElement('button');
    uploadBtn.className = isSP ? 'iv-action-btn' : 'menu_button interactable';
    uploadBtn.innerHTML = `<i class="fa-solid fa-upload"></i><span>Upload Custom</span>`;
    if (!isSP) uploadBtn.style.flex = '1';

    uploadBtn.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = async () => {
            const file = inp.files?.[0]; if (!file) return;
            if (file.size > 5 * 1024 * 1024) { toastr.warning('Audio file too large (>5MB).', EXT_DISPLAY); return; }
            
            const { _fileToDataUrl } = await Promise.resolve().then(function () { return utilDom; });
            const dataUrl = await _fileToDataUrl(file).catch(() => null);
            if (!dataUrl) { toastr.error('Failed to load audio', EXT_DISPLAY); return; }
            
            const s2 = getSettings();
            const id = 'snd_' + Date.now();
            s2.customSounds[id] = { name: file.name, data: dataUrl };
            s2.completionSound = id;
            saveSettings();
            
            const allContainers = [document.getElementById('iv-sound-settings'), document.getElementById('iv-sp-sound-settings')].filter(Boolean);
            allContainers.forEach(c => buildSoundSettingsUI(c));
        };
        inp.click();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = isSP ? 'iv-action-btn iv-sp-danger-btn' : 'menu_button interactable';
    deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i><span>Delete</span>`;
    if (!isSP) deleteBtn.style.flex = '1';

    deleteBtn.addEventListener('click', async () => {
        const val = typeSel.value;
        if (val.startsWith('custom_')) {
            const ok = await showCustomDialog({ type: 'confirm', title: 'Delete Sound', message: 'Delete this custom sound?' });
            if (!ok) return;
            const s2 = getSettings();
            delete s2.customSounds[val];
            s2.completionSound = 'none';
            saveSettings();
            renderDropdown();
            updateCustomActions();
            
            const otherContainers = [document.getElementById('iv-sound-settings'), document.getElementById('iv-sp-sound-settings')].filter(c => c && c !== container);
            otherContainers.forEach(c => buildSoundSettingsUI(c));
        }
    });
    
    customActionsWrap.appendChild(uploadBtn);
    customActionsWrap.appendChild(deleteBtn);
    container.appendChild(customActionsWrap);

    const updateCustomActions = () => {
        deleteBtn.style.display = typeSel.value.startsWith('custom_') ? '' : 'none';
    };
    updateCustomActions();

    typeSel.addEventListener('change', () => {
        getSettings().completionSound = typeSel.value;
        saveSettings();
        updateCustomActions();
        const otherContainers = [document.getElementById('iv-sound-settings'), document.getElementById('iv-sp-sound-settings')].filter(c => c && c !== container);
        otherContainers.forEach(c => buildSoundSettingsUI(c));
    });

    const volRow = document.createElement('div');
    volRow.className = isSP ? 'iv-sp-field' : '';
    volRow.style.marginTop = isSP ? '6px' : '10px';

    const volLbl = document.createElement(isSP ? 'label' : 'b');
    volLbl.className = isSP ? 'iv-sp-label' : '';
    if (!isSP) volLbl.style.fontSize = '12px';
    volLbl.textContent = 'Volume';

    const volWrap = document.createElement('div');
    volWrap.className = isSP ? 'iv-sp-row' : '';
    if (!isSP) {
        volWrap.style.display = 'flex';
        volWrap.style.alignItems = 'center';
        volWrap.style.gap = '10px';
        volWrap.style.marginTop = '6px';
    }

    const volSlider = document.createElement('input');
    volSlider.type = 'range'; 
    volSlider.className = isSP ? 'iv-slider iv-sp-vol-slider' : 'neo-range-slider iv-sp-vol-slider';
    volSlider.style.flex = '1'; volSlider.min = '0'; volSlider.max = '100';
    volSlider.value = s.completionSoundVolume ?? 80;

    const volVal = document.createElement('span');
    volVal.className = 'iv-sp-vol-val';
    volVal.style.cssText = isSP 
        ? 'min-width:32px;text-align:right;font-size:11px;color:var(--iv-accent)' 
        : 'min-width:34px;text-align:right;font-size:12px;color:var(--SmartThemeQuoteColor,#a99bfb)';
    volVal.textContent = `${volSlider.value}%`;
    
    volSlider.addEventListener('input', () => { volVal.textContent = `${volSlider.value}%`; });
    volSlider.addEventListener('change', () => { 
        getSettings().completionSoundVolume = parseInt(volSlider.value); 
        saveSettings(); 
        const otherContainers2 = [document.getElementById('iv-sound-settings'), document.getElementById('iv-sp-sound-settings')].filter(c => c && c !== container);
        otherContainers2.forEach(c => buildSoundSettingsUI(c));
    });
    
    volWrap.appendChild(volSlider); volWrap.appendChild(volVal);
    volRow.appendChild(volLbl); volRow.appendChild(volWrap);
    container.appendChild(volRow);
}

var uiWidgets = /*#__PURE__*/Object.freeze({
    __proto__: null,
    _SOUND_PRESETS: _SOUND_PRESETS,
    _buildContextInspectorHTML: _buildContextInspectorHTML,
    _highlightContextText: _highlightContextText,
    get _lastInspectorMessages () { return _lastInspectorMessages; },
    _synthSound: _synthSound,
    buildChangelogHTML: buildChangelogHTML,
    buildPromptPresetManager: buildPromptPresetManager,
    buildQPSetManager: buildQPSetManager,
    buildSoundSettingsUI: buildSoundSettingsUI,
    checkChangelogAutoShow: checkChangelogAutoShow,
    closeChangelog: closeChangelog,
    closePresetPanel: closePresetPanel,
    openChangelog: openChangelog,
    openInspector: openInspector,
    openPresetDropdown: openPresetDropdown,
    playCompletionSound: playCompletionSound,
    renderQuickPromptsBar: renderQuickPromptsBar,
    setupChangelogListeners: setupChangelogListeners,
    showQPIconPicker: showQPIconPicker
});

const PORTRAY_STYLES = ['rp', 'summary'];
const PORTRAY_PERSONS = ['first', 'second', 'third'];

function pickAllowed(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

function resolvePortrayForm(settings, override = {}) {
    const storedStyle = pickAllowed(settings?.portrayStyle, PORTRAY_STYLES, 'rp');
    const storedPerson = pickAllowed(settings?.portrayPerson, PORTRAY_PERSONS, 'first');
    return {
        style: pickAllowed(override.style, PORTRAY_STYLES, storedStyle),
        person: pickAllowed(override.person, PORTRAY_PERSONS, storedPerson),
    };
}

function buildPortrayInstruction(form) {
    const styleLine = form.style === 'summary'
        ? 'Write the feeling and intent as narration, without quoted speech.'
        : 'Write it as spoken words and bodily action, the way a turn in the simulation is written.';
    const personLine = form.person === 'second'
        ? 'Write in second person, addressing {{user}} as you.'
        : form.person === 'third'
            ? 'Write in third person, {{user}} as they appear in the scene.'
            : 'Write in first person, as {{user}} living it.';
    return `Write {{user}}'s next turn now.\n\n${styleLine}\n\n${personLine}`;
}

function portrayPromptText(settings) {
    const stored = settings?.portrayPrompt;
    return (typeof stored === 'string' && stored.trim()) ? stored : DEFAULT_PORTRAY_PROMPT;
}

function portrayRequestSettings(settings) {
    return {
        ...settings,
        systemPrompt: portrayPromptText(settings),
        memoryEnabled: false,
    };
}

function withoutToolModules(messages) {
    return messages.map(m => {
        if (m.role !== 'system' || typeof m.content !== 'string') return m;
        return { ...m, content: m.content.replace(/\n*<modules>[\s\S]*?<\/modules>/g, '') };
    });
}

function readSendBoxText() {
    const ta = document.getElementById('send_textarea');
    return typeof ta?.value === 'string' ? ta.value.trim() : '';
}

function buildAuthoredConductBlock(text) {
    return `<authored-conduct>
{{user}} has already decided this conduct. The coming turn is that conduct performed in the scene — the same acts, in the same order, at the same size, in {{user}}'s established voice. Every word realizes this. Quoted words are spoken as written. An instruction to speak becomes speech, meaning kept, plain wording kept plain. A blocked or unfinished attempt stays an attempt. Private thinking only colors the manner of doing this.

${text}
</authored-conduct>`;
}

async function assemblePortrayMessages(conversation, settings, formOverride) {
    const form = resolvePortrayForm(settings, formOverride);
    const messages = withoutToolModules(await assembleMessages(
        conversation,
        portrayRequestSettings(settings),
        buildPortrayInstruction(form),
    ));
    const sendBox = readSendBoxText();
    if (!sendBox) return messages;
    const block = { role: 'user', content: buildAuthoredConductBlock(sendBox) };
    const insertAt = Math.max(0, messages.length - 1);
    return [...messages.slice(0, insertAt), block, ...messages.slice(insertAt)];
}

function readFireTimePortrayForm() {
    return {
        style: document.getElementById('iv-fire-portray-style')?.value,
        person: document.getElementById('iv-fire-portray-person')?.value,
    };
}

function syncFireTimePortrayForm() {
    const form = resolvePortrayForm(getSettings());
    const styleEl = document.getElementById('iv-fire-portray-style');
    const personEl = document.getElementById('iv-fire-portray-person');
    if (styleEl) styleEl.value = form.style;
    if (personEl) personEl.value = form.person;
}

function routePortrayToInput(text) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return;
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function sendMainChatInput() {
    document.getElementById('send_but')?.click();
}

function routePortrayResult(text, settings) {
    routePortrayToInput(text);
    if (settings?.portrayImmediateSend) sendMainChatInput();
}

let pendingAutoPortray = false;
let pendingAutoPortrayOpts = null;

function clearPendingAutoPortray() {
    pendingAutoPortray = false;
    pendingAutoPortrayOpts = null;
}

// A conclusion cue is a turn that settles on acting in the scene now:
// directing {{user}} to do or say something, or resolving to do it.
function isPortrayConclusionCue(text) {
    if (typeof text !== 'string' || !text.trim()) return false;
    const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (/\blet'?s just do that\b/.test(t)) return true;
    if (/\byou should(?:\s+\w+){0,3}\s+(?:tell|say|ask|do|talk)\b/.test(t)) return true;
    if (/\b(?:alright|okay|ok)[,.]?\s+(?:tell|say)\s+(?:her|him|them)\b/.test(t)) return true;
    if (/\b(?:yeah|yes|yep|alright|okay|ok|fine)\b.{0,60}\b(?:let'?s|i(?:'ll| will| am going| am gonna|'m going|'m gonna))\b/.test(t)) return true;
    return false;
}

async function considerAutoTriggerPortray(turn, opts = {}) {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (isPortrayConclusionCue(turn?.content)) {
        pendingAutoPortray = true;
        pendingAutoPortrayOpts = opts;
    }
    return flushPendingAutoPortray(opts);
}

async function flushPendingAutoPortray(opts = {}) {
    if (!getSettings().portrayAutoTrigger) {
        clearPendingAutoPortray();
        return null;
    }
    if (!pendingAutoPortray || state.generating) return null;
    const runOpts = pendingAutoPortrayOpts || opts;
    clearPendingAutoPortray();
    return runPortray(runOpts.formOverride || {}, runOpts);
}

async function runPortray(formOverride = {}, { generate } = {}) {
    if (state.generating) return null;
    const settings = getEffectiveSettings();
    const conversation = getConversation();
    const messages = await assemblePortrayMessages(conversation, settings, formOverride);
    const generateFn = generate || ((conv, reqSettings, pendingText, payload) =>
        callGenerate(conv, reqSettings, pendingText, undefined, payload));

    state.generating = true;
    try {
        const { setGeneratingState } = await Promise.resolve().then(function () { return uiChat; });
        setGeneratingState(true);
        const thinking = document.getElementById('iv-thinking-text');
        if (thinking) thinking.textContent = 'Portraying…';
        const result = await generateFn(
            conversation,
            portrayRequestSettings(settings),
            buildPortrayInstruction(resolvePortrayForm(settings, formOverride)),
            messages,
        );
        const text = result && typeof result.text === 'string' ? result.text.trim() : '';
        if (text) routePortrayResult(text, getSettings());
        return result;
    } catch (err) {
        const { showGenerationError } = await Promise.resolve().then(function () { return uiChat; });
        showGenerationError(err);
        return null;
    } finally {
        state.generating = false;
        try {
            const { setGeneratingState } = await Promise.resolve().then(function () { return uiChat; });
            setGeneratingState(false);
        } catch (_) { /* UI may be absent in unit tests */ }
    }
}

var portray = /*#__PURE__*/Object.freeze({
    __proto__: null,
    PORTRAY_PERSONS: PORTRAY_PERSONS,
    PORTRAY_STYLES: PORTRAY_STYLES,
    assemblePortrayMessages: assemblePortrayMessages,
    buildPortrayInstruction: buildPortrayInstruction,
    considerAutoTriggerPortray: considerAutoTriggerPortray,
    flushPendingAutoPortray: flushPendingAutoPortray,
    readFireTimePortrayForm: readFireTimePortrayForm,
    resolvePortrayForm: resolvePortrayForm,
    routePortrayResult: routePortrayResult,
    routePortrayToInput: routePortrayToInput,
    runPortray: runPortray,
    syncFireTimePortrayForm: syncFireTimePortrayForm
});

let extVersion = '?';
let __extPath = null;

{
    const match = new URL(import.meta.url).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
    if (match) __extPath = decodeURIComponent(match[1]);
}

async function loadManifestVersion() {
    try {
        const res = await fetch(`/scripts/extensions/${__extPath}/manifest.json`);
        if (res.ok) {
            const manifest = await res.json();
            extVersion = manifest.version || CHANGELOG[0]?.version || '?';
        } else {
            extVersion = CHANGELOG[0]?.version || '?';
        }
    } catch (_) {
        extVersion = CHANGELOG[0]?.version || '?';
    }
}

async function injectUI() {
    const ctx = SillyTavern.getContext();
    const parseTemplate = (html) => {
        if (!html) return '';
        return html.replace(/\$\{I\.([a-zA-Z0-9_]+)\}/g, (_, iconName) => I[iconName] || '');
    };
    const loadAndInject = async (templateName) => {
        const html = await ctx.renderExtensionTemplateAsync(__extPath, templateName);
        if (html) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = parseTemplate(html);
            while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
        } else {
            console.error(`[${EXT_DISPLAY}] Couldn't load HTML: ${templateName}.html`);
        }
    };
    const templates = ['window', 'settings_overlay', 'chat_picker'];
    await Promise.all(templates.map(loadAndInject));

    const iconEl = document.getElementById(ICON_ID);
    if (iconEl && iconEl.parentElement !== document.body) {
        document.body.appendChild(iconEl);
    }
}

function addWandButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('iv-wand-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'iv-wand-btn';
    btn.classList.add('list-group-item', 'flex-container', 'flexGap5');
    btn.innerHTML = `<div class="fa-solid fa-comment-dots extensionsMenuExtensionButton"></div><span>${EXT_DISPLAY}</span>`;
    btn.style.display = getSettings().enabled ? '' : 'none';
    btn.addEventListener('click', () => toggleVisibility());
    menu.appendChild(btn);
}

function attachWindowListeners() {
    const windowEl = document.getElementById(WIN_ID);
    const iconEl = document.getElementById(ICON_ID);
    const modalEl = document.getElementById(MODAL_ID);

    if (windowEl) {
        makeDraggable(document.getElementById('iv-drag-handle'), windowEl);
        makeResizable(windowEl);
    }

    document.addEventListener('pointerdown', e => {
        const win = document.getElementById(WIN_ID);
        if (!win || win.style.display === 'none') {
            state.windowActive = false;
            return;
        }
        const clickedInside = win.contains(e.target) ||
                              e.target.closest('.iv-dialog-overlay') ||
                              document.getElementById('iv-settings-overlay')?.contains(e.target) ||
                              document.getElementById('iv-picker-overlay')?.contains(e.target);
        state.windowActive = !!clickedInside;
    }, true);

    window.addEventListener('resize', () => {
        if (windowEl && windowEl.style.display !== 'none') {
            try {
                const saved = localStorage.getItem('iv-win-pos');
                if (saved) {
                    const { x, y } = JSON.parse(saved);
                    if (x != null) {
                        const r = windowEl.getBoundingClientRect();
                        const maxLeft = Math.max(0, window.innerWidth - r.width);
                        const maxTop = Math.max(0, window.innerHeight - r.height);
                        windowEl.style.left = `${Math.max(0, Math.min(x, maxLeft))}px`;
                        windowEl.style.top = `${Math.max(0, Math.min(y, maxTop))}px`;
                    }
                }
            } catch(e) {}
        }
        if (iconEl && iconEl.style.display !== 'none') {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const iconSize = 46;
            const savedIconPos = localStorage.getItem(ICON_STORAGE_KEY);
            if (savedIconPos) {
                try {
                    const pos = JSON.parse(savedIconPos);
                    const left = parseFloat(pos.left);
                    const top = parseFloat(pos.top);
                    if (!isNaN(left) && !isNaN(top)) {
                        let newLeft = Math.max(0, Math.min(left, vw - iconSize));
                        let newTop = Math.max(0, Math.min(top, vh - iconSize));
                        iconEl.style.left = `${newLeft}px`;
                        iconEl.style.top = `${newTop}px`;
                    }
                } catch(e) {}
            }
        }
    });

    document.getElementById('iv-min-btn')?.addEventListener('click', () => minimize());
    document.getElementById('iv-close-btn')?.addEventListener('click', () => hideWindow());
    document.getElementById('iv-ext-settings-btn')?.addEventListener('click', () => openSettingsPanel());
    if (iconEl) makeIconDraggable(iconEl);

    document.getElementById('iv-ghost-btn')?.addEventListener('click', () => toggleGhostMode());

    // Toolbar actions
    document.getElementById('iv-regen-btn')?.addEventListener('click', () => {
        const conv = getConversation();
        if (!conv.messages.length || state.generating) return;
        let lastUserIdx = -1;
        for (let i = conv.messages.length - 1; i >= 0; i--) { if (conv.messages[i].role === 'user') { lastUserIdx = i; break; } }
        if (lastUserIdx === -1) return;
        const userMsg = conv.messages[lastUserIdx];
        Promise.resolve().then(function () { return conversation; }).then(m => m.truncateAfter(conv, userMsg.id));
        Promise.resolve().then(function () { return uiChat; }).then(m => m.removeMsgElAfter(userMsg.id));
        runGenerate(conv, userMsg.content, false);
    });

    document.getElementById('iv-search-btn')?.addEventListener('click', () => { state.searchOpen ? closeSearch() : openSearch(); });
    document.getElementById('iv-pick-btn')?.addEventListener('click', () => openChatPicker());
    document.getElementById('iv-seg-prev-btn')?.addEventListener('click', () => jumpToPrevSegment());
    document.getElementById('iv-seg-next-btn')?.addEventListener('click', () => jumpToNextSegment());

    document.getElementById('iv-qp-toggle-btn')?.addEventListener('click', () => {
        const s = getSettings(); s.quickPromptsVisible = !s.quickPromptsVisible; saveSettings();
        Promise.resolve().then(function () { return uiWidgets; }).then(m => m.renderQuickPromptsBar());
    });

    document.getElementById('iv-inspect-btn')?.addEventListener('click', () => openInspector());
    document.getElementById('iv-portray-btn')?.addEventListener('click', () => {
        runPortray(readFireTimePortrayForm()).catch(console.error);
    });

    const qpBar = document.getElementById('iv-qp-bar');
    if (qpBar) {
        qpBar.addEventListener('wheel', e => {
            if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
            e.preventDefault();
            const delta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaMode === 2 ? e.deltaY * 200 : e.deltaY;
            qpBar.scrollLeft += delta;
        }, { passive: false });
    }

    document.getElementById('iv-search-close')?.addEventListener('click', () => closeSearch());
    document.getElementById('iv-search-prev')?.addEventListener('click', () => navigateSearch(-1));
    document.getElementById('iv-search-next')?.addEventListener('click', () => navigateSearch(1));
    document.getElementById('iv-search-word')?.addEventListener('click', () => toggleSearchWholeWord());

    const searchInputEl = document.getElementById('iv-search-input');
    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => {
            state.searchQuery = searchInputEl.value;
            clearTimeout(state.searchDebounceId);
            state.searchDebounceId = setTimeout(performSearch, 220);
        });
        searchInputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); navigateSearch(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
        });
    }

    document.getElementById('iv-stop-btn')?.addEventListener('click', () => {
        state.abortController?.abort();
        const { stopGeneration } = SillyTavern.getContext();
        if (typeof stopGeneration === 'function') stopGeneration();
    });

    const inputEl = document.getElementById('iv-input');
    if (inputEl) {
        inputEl.addEventListener('input', () => {
            autoResize(inputEl);
            updateMsgCount(getConversation());
        });
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const isMobile = window.innerWidth <= 900 || ('ontouchstart' in window);
                if (!isMobile) {
                    e.preventDefault();
                    document.getElementById('iv-send-btn')?.click();
                }
            }
        });
    }
    document.getElementById('iv-send-btn')?.addEventListener('click', async () => {
        const rawText = inputEl?.value.trim();
        if (!rawText || state.generating) return;

        const { expandMacros, getEffectiveSettings } = await Promise.resolve().then(function () { return conversation; });
        const _s = getEffectiveSettings();
        const text = _s.autoExpandMacros ? expandMacros(rawText || '') : (rawText || '');
        if (inputEl) { inputEl.value = ''; autoResize(inputEl); }

        runGenerate(getConversation(), text, true).catch(console.error);
    });

    // Modals
    document.getElementById('iv-modal-close')?.addEventListener('click', () => { if (modalEl) modalEl.style.display = 'none'; });
    let _modalMouseDown = null;
    modalEl?.addEventListener('mousedown', e => { _modalMouseDown = e.target; });
    modalEl?.addEventListener('click', e => { if (e.target === modalEl && _modalMouseDown === modalEl) modalEl.style.display = 'none'; });

    document.querySelectorAll('.iv-modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.iv-modal-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const isFormatted = tab.dataset.tab === 'formatted';
            const isJson = tab.dataset.tab === 'json';

            const fmtEl = document.getElementById('iv-ctx-formatted');
            const jsonEl = document.getElementById('iv-ctx-json');

            if (fmtEl) fmtEl.style.display = isFormatted ? '' : 'none';
            if (jsonEl) jsonEl.style.display = isJson ? '' : 'none';

            setTimeout(() => {
                const targetEl = isJson ? jsonEl : document.getElementById('iv-ctx-body');
                if (targetEl) {
                    const prevBehavior = targetEl.style.scrollBehavior;
                    targetEl.style.scrollBehavior = 'auto';
                    targetEl.scrollTop = targetEl.scrollHeight;
                    targetEl.style.scrollBehavior = prevBehavior;
                }
            }, 0);
        });
    });

    document.getElementById('iv-ctx-copy-btn')?.addEventListener('click', () => {
        const activeTab = document.querySelector('.iv-modal-tab.active');
        if (activeTab?.dataset.tab === 'json') {
            copyText(document.getElementById('iv-ctx-json')?.textContent || '');
        } else {
            Promise.resolve().then(function () { return uiWidgets; }).then(m => copyText(formatPayloadAsText(m._lastInspectorMessages || [])));
        }
    });

    const depthSlider = document.getElementById('iv-depth-slider');
    if (depthSlider) {
        depthSlider.value = getSettings().contextDepth;
        const dv = document.getElementById('iv-depth-val');
        if(dv) dv.textContent = depthSlider.value;

        depthSlider.addEventListener('input', () => {
            const dv = document.getElementById('iv-depth-val');
            if(dv) dv.textContent = depthSlider.value;
        });

        depthSlider.addEventListener('change', () => {
            const val = parseInt(depthSlider.value);
            getSettings().contextDepth = val;
            saveSettings();
            syncOverlayUI('contextDepth', val);
            updateMsgCount(getConversation());
        });
    }
    setupDepthClickEdit();
}

async function init() {
    _dbgSetupGlobalErrorHandlers();

    await loadManifestVersion();

    getSettings();
    _dbgSnapshotSettings();
    await injectUI();

    const ctx = SillyTavern.getContext();
    const container = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (container) {
        try {
            const html = await ctx.renderExtensionTemplateAsync(__extPath, 'settings');
            if (html) container.insertAdjacentHTML('beforeend', html);
        } catch (e) {}
    }

    restoreWindowState(document.getElementById(WIN_ID), document.getElementById(ICON_ID));
    attachWindowListeners();
    setupSettingsHandlers();
    updateSettingsUI();
    setupSettingsPanelListeners();
    setupChatPickerListeners();
    setupChangelogListeners();
    setupSearchHotkey();
    setupGhostHotkey();
    setupHotkey();
    setupMessagesScrollTracking();
    setupSegmentJumpNav(document.getElementById('iv-messages'));
    setupSegmentScrollTracking(document.getElementById('iv-messages'));
    setupMainChatHideListener();

    const s = getSettings();
    const windowEl = document.getElementById(WIN_ID);

    if (s.windowVisible && !s.minimized && windowEl) {
        windowEl.style.display = 'flex';
        state.windowActive = true;
    } else if (windowEl) {
        windowEl.style.display = 'none';
        state.windowActive = false;
    }

    updateIconVisibility(document.getElementById(ICON_ID));
    bringWindowToFront();

    await onChatChanged();
    syncSimulationView();

    const es = ctx.eventSource || window.eventSource;
    const et = ctx.event_types || window.event_types || {};

    if (es) {
        es.on(et.CHAT_CHANGED || 'chat_changed', async () => {
            await onChatChanged();
            renderConversation(getConversation());
            syncSimulationView();
        });
        es.on(et.CHARACTER_SELECTED || 'character_selected', async () => {
            await onChatChanged();
            renderConversation(getConversation());
            syncSimulationView();
        });
        es.on(et.APP_READY || 'app_ready', () => {
            updateProfilesList();
            updateSPConnProfileList();
        });

        const cmEvents = [
            et.CONNECTION_PROFILE_CREATED || 'connection_profile_created',
            et.CONNECTION_PROFILE_UPDATED || 'connection_profile_updated',
            et.CONNECTION_PROFILE_DELETED || 'connection_profile_deleted',
            et.CONNECTION_PROFILE_LOADED || 'connection_profile_loaded'
        ];
        cmEvents.forEach(evt => {
            es.on(evt, () => {
                updateProfilesList();
                updateSPConnProfileList();
            });
        });

        const dynEvents =[
            et.MESSAGE_RECEIVED || 'message_received',
            et.MESSAGE_SENT || 'message_sent',
            et.MESSAGE_DELETED || 'message_deleted',
            et.MESSAGE_UPDATED || 'message_updated',
            et.MESSAGE_SWIPED || 'message_swiped'
        ];

        dynEvents.forEach(e => {
            if (e) es.on(e, () => {
                updateDepthSlidersMax();
                syncSimulationView();
                syncExchangeHiddenUi();
            });
        });

        es.on(et.GENERATION_AFTER_COMMANDS || 'generation_after_commands', () => {
            syncSimulationView();
        });
    }

    addWandButton();
    checkChangelogAutoShow();
    _takeProfileSnapshot();
    updateMemoryDot();

    window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'iv-iframe-h') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try { if (f.contentWindow === e.source) f.style.height = `${Math.max(40, Math.min(1200, e.data.h + 16))}px`; } catch(_) {}
            });
        } else if (e.data.type === 'iv-iframe-bg') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try { if (f.contentWindow === e.source) f.style.background = e.data.hasBg ? 'transparent' : '#ffffff'; } catch(_) {}
            });
        } else if (e.data.type === 'iv-iframe-err') {
            document.querySelectorAll('.iv-html-block-iframe').forEach(f => {
                try {
                    if (f.contentWindow === e.source) {
                        const errEl = f.closest('.iv-html-block')?.querySelector('.iv-html-block-error');
                        if (errEl) { errEl.textContent = `⚠ ${e.data.msg}`; errEl.style.display = ''; }
                    }
                } catch(_) {}
            });
        }
    });

    const preventSpinBug = e => { if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') e.stopPropagation(); };
    [
        windowEl,
        document.getElementById('iv-settings-overlay'),
        document.getElementById('iv-picker-overlay')
    ].filter(Boolean).forEach(el => {
        el.addEventListener('mousedown', preventSpinBug);
        el.addEventListener('pointerdown', preventSpinBug);
    });

    console.log(`[${EXT_DISPLAY}] Initialized.`);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 0);
}

export { __extPath, extVersion };
