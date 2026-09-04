export const state = {
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
    userScrolledUp: false,
    savedScrollTop: 0,
    abortController: null,
    htmlBlockCounter: 0,
    htmlBlockRegistry: new Map(),
    tokenCountCache: new Map(),
    tokenCountPromises: new Map()
};

export const DBG_STATE = {
    log: [],
    MAX: 3000,
    sessionStart: new Date().toISOString(),
    snapshot: null,
    diffTid: null
};

export const DBG_SKIP = new Set([
    'customTheme','savedThemes','sessions',
    'quickPromptSets','customSounds','completionSoundData',
    'quickPrompts','profiles','promptPresets',
    'windowBgUrl','customBackgrounds','memories'
]);