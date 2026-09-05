#!/usr/bin/env python3
"""Live STD check: portray prompt is editable, reset restores default, and a
portray against a real exchange answers the scene instead of restaging it."""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
EDITED = "EDITED-PORTRAY-SEAM: write the knock at the door, not the private argument."
SCENE_MARKER = "answers the present scene"
OLD_SOURCE = "the turn comes from its feelings, plans, and conclusions"


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
                return;
            }
            if (typeof window.openCharacterChat === 'function') {
                await window.openCharacterChat(fileName);
            }
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


def _open_inner_voice_drawer(page):
    page.evaluate(
        """() => {
            const btn = document.getElementById('extensions-settings-button');
            (btn?.querySelector('.drawer-toggle') || btn)?.click();
        }"""
    )
    page.wait_for_function(
        """() => {
            const el = document.querySelector('.inner-voice-settings');
            return !!el && el.getClientRects().length > 0;
        }""",
        timeout=15_000,
    )
    page.evaluate(
        """() => {
            const root = document.querySelector('.inner-voice-settings');
            const outer = root?.querySelector('.inline-drawer-toggle');
            const outerContent = root?.querySelector('.inline-drawer-content');
            if (outer && outerContent && !outerContent.getClientRects().length) outer.click();
        }"""
    )
    page.wait_for_timeout(400)


def _confirm_dialog(page):
    page.wait_for_selector(".iv-dialog-ok", timeout=10_000)
    page.locator(".iv-dialog-ok").click()
    page.wait_for_timeout(400)


def _ui_exchange_texts(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('#iv-messages .iv-msg-content')]
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(Boolean)"""
    )


def _leak_snippets(texts, min_len=48):
    snippets = []
    for text in texts:
        compact = " ".join((text or "").split())
        if len(compact) >= min_len:
            snippets.append(compact[:min_len])
        for part in compact.replace("?", ".").replace("!", ".").split("."):
            part = part.strip()
            if len(part) >= min_len:
                snippets.append(part[:min_len])
    # Keep the longest distinctive pieces; drop duplicates.
    uniq = []
    for snippet in snippets:
        if snippet not in uniq:
            uniq.append(snippet)
    return uniq


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
        _open_inner_voice_drawer(page)

        drawer = page.evaluate(
            """() => {
                const ta = document.getElementById('iv-portray-prompt');
                const reset = document.getElementById('iv-reset-portray-prompt');
                const s = SillyTavern.getContext().extensionSettings.inner_voice || {};
                return {
                    hasText: !!ta,
                    hasReset: !!reset,
                    value: ta ? String(ta.value || '') : '',
                    stored: typeof s.portrayPrompt === 'string' ? s.portrayPrompt : '',
                };
            }"""
        )
        if not drawer["hasText"] or not drawer["hasReset"]:
            raise SystemExit(f"portray prompt controls missing in the drawer: {drawer}")
        if SCENE_MARKER not in drawer["value"]:
            raise SystemExit("drawer portray prompt is not the scene-response default")
        if OLD_SOURCE in drawer["value"]:
            raise SystemExit("drawer still ships the old source-from-thinking portray prompt")

        page.evaluate(
            """(text) => {
                const ta = document.getElementById('iv-portray-prompt');
                ta.value = text;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            }""",
            EDITED,
        )
        page.wait_for_timeout(300)
        stored = page.evaluate(
            "() => (SillyTavern.getContext().extensionSettings.inner_voice || {}).portrayPrompt || ''"
        )
        if stored != EDITED:
            raise SystemExit(f"edited portray prompt did not persist: {stored!r}")

        page.locator("#iv-reset-portray-prompt").click()
        _confirm_dialog(page)
        restored = page.evaluate(
            """() => {
                const ta = document.getElementById('iv-portray-prompt');
                const s = SillyTavern.getContext().extensionSettings.inner_voice || {};
                return {
                    value: ta ? String(ta.value || '') : '',
                    stored: typeof s.portrayPrompt === 'string' ? s.portrayPrompt : '',
                };
            }"""
        )
        if SCENE_MARKER not in restored["value"] or SCENE_MARKER not in restored["stored"]:
            raise SystemExit(f"reset did not restore the default portray prompt: {restored}")
        if EDITED in restored["value"] or EDITED in restored["stored"]:
            raise SystemExit("reset left the edited portray prompt in place")

        page.evaluate("() => document.getElementById('iv-ext-settings-btn')?.click()")
        page.wait_for_function(
            "() => document.getElementById('iv-settings-overlay')?.style.display === 'flex'",
            timeout=10_000,
        )
        overlay = page.evaluate(
            """() => {
                const ta = document.getElementById('iv-sp-portray-prompt');
                const reset = document.getElementById('iv-sp-reset-portray-prompt');
                return {
                    hasText: !!ta,
                    hasReset: !!reset,
                    value: ta ? String(ta.value || '') : '',
                };
            }"""
        )
        if not overlay["hasText"] or not overlay["hasReset"]:
            raise SystemExit(f"portray prompt controls missing in the overlay: {overlay}")
        if SCENE_MARKER not in overlay["value"]:
            raise SystemExit("overlay portray prompt is not the scene-response default")
        page.evaluate(
            "() => { const el = document.getElementById('iv-settings-overlay'); if (el) el.style.display = 'none'; }"
        )

        before = page.evaluate(
            """() => {
                const ta = document.getElementById('send_textarea');
                const ctx = SillyTavern.getContext();
                const s = ctx.extensionSettings.inner_voice || {};
                s.portrayImmediateSend = false;
                return {
                    input: ta ? ta.value : '',
                    chatLength: (ctx.chat || []).length,
                };
            }"""
        )
        exchange = _ui_exchange_texts(page)
        if not exchange:
            raise SystemExit("no inner exchange is present to portray from")
        snippets = _leak_snippets(exchange)
        if not snippets:
            raise SystemExit(f"exchange has no distinctive phrasing to check against: {exchange!r}")

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

    leaked = [s for s in snippets if s.lower() in after["input"].lower()]
    if leaked:
        raise SystemExit(
            "portray restaged exchange phrasing in the turn: "
            + repr(leaked[:3])
            + f" | turn={after['input']!r}"
        )

    print(
        f"ok: portray prompt editable/reset; scene-response default in drawer and overlay; "
        f"portray after an exchange filled the input without restaging "
        f"({after['chatLength']} main-chat messages unchanged; "
        f"{len(after['input'])} chars; {len(snippets)} leak snippets; "
        f"model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
