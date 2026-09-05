#!/usr/bin/env python3
"""Live STD check: editable post-history block; default payload omits it."""

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
OUT = "/home/opc/projects/st-extensions/inner-voice/.playwright-mcp"
CAUGHT_UP = "Caught up. I remember all of it."


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
            const input = document.getElementById('iv-input');
            if (input) input.value = '';
        }"""
    )
    page.wait_for_selector("#iv-inspect-btn", timeout=15_000)
    page.wait_for_timeout(500)


def _after_main(messages):
    main_idx = next(
        (i for i, m in enumerate(messages)
         if isinstance(m.get("content"), str) and "<main_chat" in m["content"]),
        None,
    )
    if main_idx is None:
        raise SystemExit("payload has no main-chat slice")
    return messages[main_idx + 1 :]


def _inspect_payload(page):
    page.locator("#iv-inspect-btn").click(force=True)
    page.wait_for_function(
        """() => {
            const el = document.getElementById('iv-ctx-json');
            return el && (el.textContent || '').trim().startsWith('[');
        }""",
        timeout=15_000,
    )
    raw = page.evaluate("() => document.getElementById('iv-ctx-json')?.textContent || ''")
    if not raw.strip():
        raise SystemExit("context inspector JSON was empty")
    return json.loads(raw)


def _close_inspector(page):
    page.evaluate(
        """() => {
            const modal = document.getElementById('iv-ctx-modal');
            if (modal) modal.style.display = 'none';
        }"""
    )


def _set_post_history(page, text, role):
    page.evaluate(
        """({ text, role }) => {
            const ta = document.getElementById('iv-post-history-text');
            const sel = document.getElementById('iv-post-history-role');
            if (!ta || !sel) throw new Error('post-history controls missing');
            ta.value = text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            sel.value = role;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        {"text": text, "role": role},
    )
    page.wait_for_timeout(300)


def _open_payload_drawer(page):
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
            const payload = [...root.querySelectorAll('.iv-settings-drawer')].find(d =>
                (d.querySelector('.inline-drawer-header')?.innerText || '').includes('Inner memory payload')
            );
            if (!payload) throw new Error('Inner memory payload group missing');
            const toggle = payload.querySelector('.inline-drawer-toggle');
            const content = payload.querySelector('.inline-drawer-content');
            if (toggle && content && !content.getClientRects().length) toggle.click();
        }"""
    )
    page.wait_for_timeout(400)


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
        _set_post_history(page, "", "user")

        _open_payload_drawer(page)
        drawer = page.evaluate(
            """() => {
                const ta = document.getElementById('iv-post-history-text');
                const sel = document.getElementById('iv-post-history-role');
                const root = document.querySelector('.inner-voice-settings');
                return {
                    hasText: !!ta,
                    hasRole: !!sel,
                    note: (root?.innerText || '').includes(
                        'If the role is Assistant and this ends up as the last message'
                    ),
                    overlayNote: (document.getElementById('iv-sp-post-history-role')
                        ?.parentElement?.innerText || '').includes(
                        'Not every backend accepts that'
                    ),
                };
            }"""
        )
        if not drawer["hasText"] or not drawer["hasRole"]:
            raise SystemExit(f"post-history controls missing in the drawer: {drawer}")
        if not drawer["note"]:
            raise SystemExit("drawer is missing the assistant-role prefill note")

        payload = _inspect_payload(page)
        if any(isinstance(m.get("content"), str) and m["content"] == CAUGHT_UP for m in payload):
            raise SystemExit("hardcoded Caught up line is still in the default payload")
        after = _after_main(payload)
        if after:
            raise SystemExit(f"default payload still has a post-history message: {after[0]!r}")

        page.locator('.iv-modal-tab[data-tab="json"]').click()
        page.wait_for_timeout(200)
        page.locator("#iv-ctx-modal .iv-modal").screenshot(path=f"{OUT}/ticket16-inspector-default.png")
        _close_inspector(page)

        for role in ("system", "user", "assistant"):
            _set_post_history(page, "Ready when you are.", role)
            custom = _inspect_payload(page)
            _close_inspector(page)
            after_custom = _after_main(custom)
            if len(after_custom) != 1:
                raise SystemExit(f"{role}: expected one post-history message, got {after_custom!r}")
            if after_custom[0].get("role") != role or after_custom[0].get("content") != "Ready when you are.":
                raise SystemExit(f"{role}: wrong post-history message {after_custom[0]!r}")

        _set_post_history(page, "", "assistant")
        cleared = _inspect_payload(page)
        _close_inspector(page)
        if _after_main(cleared):
            raise SystemExit("clearing the text left a post-history message in the payload")

        browser.close()

    if model_requests:
        raise SystemExit(f"unexpected model requests: {model_requests}")

    print(
        f"ok: post-history block default-empty, editable in the drawer, "
        f"roles system/user/assistant, clearing omits; model requests: {len(model_requests)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
