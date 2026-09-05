const COMMANDS = ['dp', 'pa', 'p'];

function commandText(raw, command) {
    const forms = [`${command}:`, `${command} `, `/${command}:`, `/${command} `];
    const prefix = forms.find(form => raw.startsWith(form));
    if (prefix) return raw.slice(prefix.length).trim();
    if (raw === command || raw === `/${command}`) return '';
    return null;
}

export function parseThinkCommand(value) {
    const raw = typeof value === 'string' ? value : '';
    for (const command of COMMANDS) {
        const text = commandText(raw, command);
        if (text !== null) return { command, text };
    }
    return null;
}

export function syncThinkCommandHint(inputEl, hintEl) {
    const visible = !!parseThinkCommand(inputEl?.value);
    if (hintEl) hintEl.hidden = !visible;
    return visible;
}

export async function executeThinkSubmission(rawValue, {
    consumeInput,
    expandExchangeText,
    sendExchange,
    suppressAutoTrigger,
    portray,
    portrayForm,
}) {
    const raw = typeof rawValue === 'string' ? rawValue : '';
    const parsed = parseThinkCommand(raw);

    if (!parsed) {
        const text = raw.trim();
        if (!text) return { kind: 'empty' };
        const expanded = expandExchangeText(text);
        consumeInput();
        return { kind: 'exchange', exchangeResult: await sendExchange(expanded) };
    }

    if (parsed.command === 'dp' && parsed.text) {
        const exchangeText = expandExchangeText(parsed.text);
        consumeInput();
        const exchangeResult = await suppressAutoTrigger(() => sendExchange(exchangeText));
        const portrayResult = exchangeResult
            ? await portray(portrayForm, {
                seedText: '',
                consumeSeed: false,
                forceSend: false,
            })
            : null;

        return { kind: 'delayed-portray', exchangeResult, portrayResult };
    }

    const forceSend = parsed.command === 'pa';
    const portrayResult = await portray(portrayForm, {
        seedText: parsed.text,
        consumeSeed: true,
        forceSend,
    });
    return {
        kind: forceSend ? 'portray-and-send' : 'portray',
        portrayResult,
    };
}
