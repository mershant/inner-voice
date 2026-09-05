#!/usr/bin/env python3
"""Live STD check: a {{user}} conclusion drafts a portray without sending."""

import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
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

        before = page.evaluate(
            """() => {
                const ctx = SillyTavern.getContext();
                const s = ctx.extensionSettings.inner_voice || {};
                s.portrayAutoTrigger = true;
                s.portrayImmediateSend = false;
                ctx.extensionSettings.inner_voice = s;
                const ta = document.getElementById('send_textarea');
                if (ta) ta.value = '';
                return {
                    chatLength: (ctx.chat || []).length,
                    assistantTurns: document.querySelectorAll('.iv-msg-assistant').length,
                };
            }"""
        )

        page.fill("#iv-input", RESOLUTION_PROMPT)
        page.evaluate("() => document.getElementById('iv-send-btn').click()")
        try:
            page.wait_for_function(
                "() => String(document.getElementById('send_textarea')?.value || '').trim().length > 0",
                timeout=90_000,
            )
        except PlaywrightTimeoutError:
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
            raise
        page.wait_for_timeout(500)

        after = page.evaluate(
            """() => {
                const ta = document.getElementById('send_textarea');
                const ctx = SillyTavern.getContext();
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
        browser.close()

    if not after["autoTrigger"]:
        raise SystemExit("auto-trigger was not on")
    if after["immediateSend"]:
        raise SystemExit("immediate send was on; this check is draft-only")
    if not after["input"].strip():
        raise SystemExit("auto-trigger did not draft a portray into the input box")
    if after["disabled"] or after["readOnly"]:
        raise SystemExit("portray filled the input box but it is not editable")
    if after["chatLength"] != before["chatLength"]:
        raise SystemExit(
            f"auto-trigger sent a main-chat message "
            f"(chat {before['chatLength']} -> {after['chatLength']})"
        )
    if after["assistantTurns"] != before["assistantTurns"] + 1:
        raise SystemExit("the ordinary path did not produce one new {{user}} turn")
    if not after["latestAssistant"].strip():
        raise SystemExit("the new {{user}} turn was empty")
    if after["latestAssistant"].strip().lower() in ISSUE_EXAMPLE_TURNS:
        raise SystemExit("the live resolving turn repeated an issue example")
    if after["input"].strip() == RESOLUTION_PROMPT:
        raise SystemExit("input box still has the inner turn, not a portray")
    if len(model_requests) != 4:
        raise SystemExit(
            f"expected inner reply, two semantic verdicts, and portray; "
            f"saw {len(model_requests)} model requests"
        )

    print(
        f"ok: {{{{user}}}} resolving turn with auto-trigger on drafted a portray "
        f"for {CHARACTER} ({after['chatLength']} main-chat messages unchanged; "
        f"{len(after['input'])} chars; model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
