export const EXT_NAME = 'inner_voice';
export const EXT_DISPLAY = 'Inner Voice';
export const WIN_ID = 'iv-window';
export const ICON_ID = 'iv-dock-icon';
export const MODAL_ID = 'iv-ctx-modal';
export const ICON_STORAGE_KEY = 'iv-icon-position';

export const DEFAULT_SYSTEM_PROMPT = `<system_role>
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

Your ultimate goal is to enhance the user's experience of the simulation by providing deep OOC insights, tracking continuity, and answering questions based on your specific persona configuration.`;

export const DEFAULT_MEMORY_PROMPT = `<memory_logic>
Purpose: ADMINISTRATIVE META-MEMORY. This is a non-diegetic (OOC) database for Inner Voice to track the Human operator's technical requirements, cognitive patterns, and workflow constraints. 

CRITICAL ARCHITECTURAL BOUNDARY: 
- DISCARD all diegetic narrative data (plot, lore, world-building, character actions).
- EXCLUDE "What" is happening in the story.
- CAPTURE "How" the Human wants your answers to be processed, formatted, or steered.

Actions: \`add\`, \`update\`, \`delete\`.
Routing Scopes (Choose based on instruction longevity/reach):
- \`global\`: Persists EVERYWHERE. Use for core, permanent Human traits (e.g., IRL profession, absolute formatting rules, universal hard limits).
- \`character\`: Persists ONLY for current {{char}}. Use for technical OOC instructions tailored to this specific bot (e.g., "Human requires verbose prose for this bot", "Human wants to avoid romance with this bot").
- \`chat\`: Persists ONLY in this specific roleplay thread. Use for current storyline structural goals (e.g., "Human wants to shift genre to horror here", "Focus on pacing in this scene").
- \`session\`: Persists ONLY in this current Inner Voice conversation. Use for immediate, temporary directives (e.g., "Human is testing a prompt", "Keep next answers very short").
</memory_logic>

<output_requirement>
MANDATORY: Append a \`memory-update\` block at the absolute end IF AND ONLY IF new administrative/OOC metadata about the Human is detected. Do NOT comment on this process.

Every entry MUST start with the exact word "Human".

# Active memories:
{{current_memories}}

# Format: 
{{memory_format}}
</output_requirement>`;
export const MEMORY_FORMAT_BLOCK = `\`\`\`memory-update\n[\n  {"action":"add","scope":"global|character|chat|session","key":"CategoryName","value":"Fact to remember"},\n  {"action":"edit","scope":"exact_existing_scope","key":"exact_existing_key","value":"Updated fact"},\n  {"action":"delete","scope":"exact_existing_scope","key":"exact_existing_key"}\n]\n\`\`\``;

export const DEFAULT_TOOLS_PROMPT = `Imperative: NEVER hallucinate missing context. If chat history, specific lore, or data appears absent, DO NOT assume the chat hasn't started or the data doesn't exist. You MUST proactively use your tools to fetch, verify, and retrieve the actual state before answering.

Process: Output \`tool_call\` JSON block -> Receive result -> Finalize response to the Human. You may chain tools sequentially.

<available_tools>
{{tools_list}}
</available_tools>

<output_format>
{{tool_call_format}}.
</output_format>`;
export const TOOL_CALL_FORMAT_BLOCK = `\`\`\`tool_call\n{"name": "tool_name","input": {"parameter_name": "value"}}\n\`\`\``;

    // ─── Changelog Data ──────────────────────────────────────────────────────────
export const CHANGELOG = [
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

export const THEME_PRESETS = {
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

export const THEME_VAR_DEFS = [
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

export const THEME_CSS_MAP = {
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

export const TOOL_DEFINITIONS = [
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

export const I = {
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
        bot: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7" /><ellipse cx="12" cy="12" rx="11" ry="3" transform="rotate(-25 12 12)" /><circle cx="21.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>`,
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
    };

export const QP_ICON_POOL = [
        '🔍','💡','📋','✨','🎭','📖','🗺️','⚔️','🧠','💬',
        '🎯','🔮','📝','🌍','❓','🎨','💭','🔥','⚡','🎲',
        '👁️','🧩','📚','🗣️','💫','🌟','🎬','🧪','🏆','🎵',
        '🌙','☀️','🌊','🍃','💎','🛡️','🗡️','🏰','🐉','🦋',
        '🎪','🌀','🔑','💀','🌹','🍷','🎩','🧿','🔔','⭐',
        '🐺','🦊','🐦','🌸','🍄','🔴','🟣','🔵','🟡','🟢',
    ];