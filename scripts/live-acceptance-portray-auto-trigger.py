#!/usr/bin/env python3
"""Live STD check: auto-trigger is one request without a portray, two with one."""

import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
WONDERING_PROMPT = (
    "Don't decide anything yet. Just tell me how the air in here feels on your skin."
)
RESOLUTION_PROMPT = (
    "What have you actually decided to do next? "
    "Answer as a settled decision, not more discussion."
)
ISSUE_EXAMPLE_TURNS = {
    "...yeah, let's just do that.",
    "screw it, i'm doing it.",
    "just say it. take it. walk.",
}


def _ready(page):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector("#send_textarea", timeout=60_000)
    try:
        page.wait_for_selector("#loader", state="detached", timeout=15_000)
    except Exception:
        pass
    page.wait_for_timeout(2000)


def _select_character(page, name):
    page.evaluate(
        """async (name) => {
            const ctx = SillyTavern.getContext();
            const idx = (ctx.characters || []).findIndex(c => c.name === name);
            if (idx < 0) throw new Error('character not found: ' + name);
            await ctx.selectCharacterById(idx);
        }""",
        name,
    )
    page.wait_for_function(
        "name => SillyTavern.getContext().name2 === name",
        arg=name,
        timeout=30_000,
    )
    page.wait_for_timeout(2500)


def _open_chat(page, file_name):
    page.evaluate(
        """async (fileName) => {
            const ctx = SillyTavern.getContext();
            if (typeof ctx.openCharacterChat === 'function') {
                await ctx.openCharacterChat(fileName);
                return 'openCharacterChat';
            }
            if (typeof window.openCharacterChat === 'function') {
                await window.openCharacterChat(fileName);
                return 'window.openCharacterChat';
            }
            return 'missing';
        }""",
        file_name,
    )
    page.wait_for_timeout(2500)


def _show_inner_voice(page):
    page.evaluate(
        """() => {
            const changelog = document.getElementById('iv-changelog-modal');
            if (changelog) changelog.style.display = 'none';
            const win = document.getElementById('iv-window');
            if (!win) throw new Error('Inner Voice window missing');
            win.style.display = 'flex';
        }"""
    )
    page.wait_for_selector("#iv-send-btn", timeout=15_000)
    page.wait_for_timeout(500)


def _snapshot(page):
    return page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const ta = document.getElementById('send_textarea');
            return {
                input: ta ? String(ta.value || '') : '',
                disabled: !!(ta && ta.disabled),
                readOnly: !!(ta && ta.readOnly),
                chatLength: (ctx.chat || []).length,
                assistantTurns: document.querySelectorAll('.iv-msg-assistant').length,
                latestAssistant: [...document.querySelectorAll('.iv-msg-assistant .iv-msg-content')]
                    .at(-1)?.textContent || '',
                autoTrigger: !!(ctx.extensionSettings.inner_voice || {}).portrayAutoTrigger,
                immediateSend: !!(ctx.extensionSettings.inner_voice || {}).portrayImmediateSend,
            };
        }"""
    )


def _prepare_settings(page):
    page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const s = ctx.extensionSettings.inner_voice || {};
            s.portrayAutoTrigger = true;
            s.portrayImmediateSend = false;
            s.toolsEnabled = false;
            ctx.extensionSettings.inner_voice = s;
            const ta = document.getElementById('send_textarea');
            if (ta) ta.value = '';
        }"""
    )


def _send_inner(page, text):
    page.fill("#iv-input", text)
    page.evaluate("() => document.getElementById('iv-send-btn').click()")


def _wait_for_assistant(page, before_count):
    page.wait_for_function(
        """count => {
            const els = document.querySelectorAll('.iv-msg-assistant .iv-msg-content');
            const last = els[els.length - 1];
            return els.length === count + 1 && String(last?.textContent || '').trim().length > 0;
        }""",
        arg=before_count,
        timeout=90_000,
    )


def _wait_until_idle(page):
    page.wait_for_function(
        "() => !document.getElementById('iv-stop-btn')?.offsetParent",
        timeout=90_000,
    )


def _fail_diagnostic(page, model_requests, diagnostic_console, err):
    diagnostic = page.evaluate(
        """() => ({
            generating: !!document.getElementById('iv-stop-btn')?.offsetParent,
            thinking: document.getElementById('iv-thinking-text')?.textContent || '',
            input: document.getElementById('send_textarea')?.value || '',
            innerTurns: document.querySelectorAll('.iv-msg').length,
        })"""
    )
    print(
        f"diagnostic: {diagnostic}; model requests: {len(model_requests)}",
        file=sys.stderr,
    )
    for line in diagnostic_console:
        print(line, file=sys.stderr)
    raise err


def main():
    model_requests = []
    diagnostic_console = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        page.on(
            "request",
            lambda req: model_requests.append(req.url) if "/generate" in req.url else None,
        )
        page.on(
            "console",
            lambda msg: diagnostic_console.append(f"{msg.type}: {msg.text}")
            if msg.type == "error"
            else None,
        )
        _ready(page)
        _select_character(page, CHARACTER)
        _open_chat(page, CHAT_FILE)
        _show_inner_voice(page)
        _prepare_settings(page)

        before_open = _snapshot(page)
        if not before_open["autoTrigger"]:
            raise SystemExit("auto-trigger was not on")
        if before_open["immediateSend"]:
            raise SystemExit("immediate send was on; this check is draft-only")

        requests_before_wonder = len(model_requests)
        _send_inner(page, WONDERING_PROMPT)
        try:
            _wait_for_assistant(page, before_open["assistantTurns"])
            _wait_until_idle(page)
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, diagnostic_console, err)
        page.wait_for_timeout(1000)
        after_wonder = _snapshot(page)
        wonder_requests = len(model_requests) - requests_before_wonder
        if wonder_requests != 1:
            raise SystemExit(
                f"expected one model request with no portray trigger; "
                f"saw {wonder_requests}"
            )
        if after_wonder["input"].strip():
            raise SystemExit("a wondering turn drafted a portray")
        if after_wonder["chatLength"] != before_open["chatLength"]:
            raise SystemExit("a wondering turn sent a main-chat message")
        if after_wonder["assistantTurns"] != before_open["assistantTurns"] + 1:
            raise SystemExit("the wondering turn did not produce one new {{user}} reply")
        if not after_wonder["latestAssistant"].strip():
            raise SystemExit("the wondering reply was empty")
        if "<scene-now" in after_wonder["latestAssistant"].lower():
            raise SystemExit("the hidden portray signal was visible in the reply")

        page.evaluate(
            """() => {
                const ta = document.getElementById('send_textarea');
                if (ta) ta.value = '';
            }"""
        )
        before_resolve = _snapshot(page)
        requests_before_resolve = len(model_requests)
        _send_inner(page, RESOLUTION_PROMPT)
        try:
            _wait_for_assistant(page, before_resolve["assistantTurns"])
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, diagnostic_console, err)
        visible_before_portray = _snapshot(page)
        if visible_before_portray["assistantTurns"] != before_resolve["assistantTurns"] + 1:
            raise SystemExit("the resolving turn did not produce a visible {{user}} reply before portray")
        if not visible_before_portray["latestAssistant"].strip():
            raise SystemExit("the resolving reply was empty")
        if "<scene-now" in visible_before_portray["latestAssistant"].lower():
            raise SystemExit("the hidden portray signal was visible in the reply")
        if visible_before_portray["latestAssistant"].strip().lower() in ISSUE_EXAMPLE_TURNS:
            raise SystemExit("the live resolving turn repeated an issue example")
        try:
            page.wait_for_function(
                "() => String(document.getElementById('send_textarea')?.value || '').trim().length > 0",
                timeout=90_000,
            )
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, diagnostic_console, err)
        page.wait_for_timeout(500)
        after_resolve = _snapshot(page)
        browser.close()

    resolve_requests = len(model_requests) - requests_before_resolve
    if not after_resolve["input"].strip():
        raise SystemExit("auto-trigger did not draft a portray into the input box")
    if after_resolve["disabled"] or after_resolve["readOnly"]:
        raise SystemExit("portray filled the input box but it is not editable")
    if after_resolve["chatLength"] != before_open["chatLength"]:
        raise SystemExit(
            f"auto-trigger sent a main-chat message "
            f"(chat {before_open['chatLength']} -> {after_resolve['chatLength']})"
        )
    if after_resolve["input"].strip() == RESOLUTION_PROMPT:
        raise SystemExit("input box still has the inner turn, not a portray")
    if resolve_requests != 2:
        raise SystemExit(
            f"expected inner reply plus portray; saw {resolve_requests} model requests"
        )

    print(
        f"ok: no-trigger cost {wonder_requests} request and a conclusion cost "
        f"{resolve_requests} for {CHARACTER} "
        f"({after_resolve['chatLength']} main-chat messages unchanged; "
        f"{len(after_resolve['input'])} chars)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
