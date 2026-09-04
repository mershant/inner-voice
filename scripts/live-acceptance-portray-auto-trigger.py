#!/usr/bin/env python3
"""Live STD check: a concluding exchange turn with auto-trigger on drafts, not sends."""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
RESOLVING_TURN = "...yeah, let's just do that."


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
                const ctx = SillyTavern.getContext();
                const s = ctx.extensionSettings.inner_voice || {};
                s.portrayAutoTrigger = true;
                s.portrayImmediateSend = false;
                ctx.extensionSettings.inner_voice = s;
                const ta = document.getElementById('send_textarea');
                if (ta) ta.value = '';
                return { chatLength: (ctx.chat || []).length };
            }"""
        )

        page.fill("#iv-input", RESOLVING_TURN)
        page.evaluate("() => document.getElementById('iv-send-btn').click()")
        page.wait_for_function(
            "() => String(document.getElementById('send_textarea')?.value || '').trim().length > 0",
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
    if after["input"].strip() == RESOLVING_TURN:
        raise SystemExit("input box still has the inner turn, not a portray")

    print(
        f"ok: resolving exchange turn with auto-trigger on drafted a portray "
        f"for {CHARACTER} ({after['chatLength']} main-chat messages unchanged; "
        f"{len(after['input'])} chars; model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
