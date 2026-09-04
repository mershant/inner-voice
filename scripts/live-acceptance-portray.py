#!/usr/bin/env python3
"""Live STD check: portray after an exchange fills the main-chat input box."""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"


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
    page.wait_for_selector("#iv-portray-btn", timeout=15_000)
    page.wait_for_timeout(500)


def main():
    model_requests = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        page.on(
            "request",
            lambda req: model_requests.append(req.url) if "/generate" in req.url else None,
        )
        _ready(page)
        _select_character(page, CHARACTER)
        _open_chat(page, CHAT_FILE)
        _show_inner_voice(page)

        before = page.evaluate(
            """() => {
                const ta = document.getElementById('send_textarea');
                const ctx = SillyTavern.getContext();
                const ui = [...document.querySelectorAll('#iv-messages .iv-msg-content')]
                    .map(el => (el.innerText || el.textContent || '').trim())
                    .filter(Boolean);
                return {
                    input: ta ? ta.value : '',
                    chatLength: (ctx.chat || []).length,
                    uiCount: ui.length,
                    hasExchangeUi: ui.length > 0,
                };
            }"""
        )
        if not before["hasExchangeUi"]:
            raise SystemExit("no inner exchange is present to portray from")

        page.evaluate("() => document.getElementById('iv-portray-btn').click()")
        page.wait_for_function(
            "() => document.getElementById('iv-thinking-bar')?.style.display === 'flex'",
            timeout=15_000,
        )
        page.wait_for_function(
            "() => document.getElementById('iv-thinking-bar')?.style.display === 'none'",
            timeout=180_000,
        )
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
                };
            }"""
        )
        browser.close()

    if not after["input"].strip():
        raise SystemExit("portray left the main-chat input box empty")
    if after["input"].strip() == before["input"].strip() and before["input"].strip():
        raise SystemExit("portray did not change the main-chat input box")
    if after["disabled"] or after["readOnly"]:
        raise SystemExit("portray filled the input box but it is not editable")
    if after["chatLength"] != before["chatLength"]:
        raise SystemExit(
            f"portray sent a main-chat message "
            f"(chat {before['chatLength']} -> {after['chatLength']})"
        )
    if "```tool_call" in after["input"]:
        raise SystemExit("portray output looks like a tool call, not {{user}} input")

    print(
        f"ok: portray after an exchange filled the input box for {CHARACTER} "
        f"({after['chatLength']} main-chat messages unchanged; "
        f"{len(after['input'])} chars; model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
