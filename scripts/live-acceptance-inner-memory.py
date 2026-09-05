#!/usr/bin/env python3
"""Live STD check: inner memory interleaves exchanges under their anchors."""

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
OLD_THOUGHT = "that thing outside sitting right now"
NEW_THOUGHT = "leaving"


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
    page.wait_for_selector("#iv-inspect-btn", timeout=15_000)
    page.wait_for_timeout(500)


def _ui_texts(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('#iv-messages .iv-msg-content')]
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(Boolean)"""
    )


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
    page.evaluate(
        """() => {
            const modal = document.getElementById('iv-ctx-modal');
            if (modal) modal.style.display = 'none';
        }"""
    )
    if not raw.strip():
        raise SystemExit("context inspector JSON was empty")
    return json.loads(raw)


def _main_chat(messages):
    for message in messages:
        content = message.get("content")
        if isinstance(content, str) and "<main_chat" in content:
            return content
    raise SystemExit("payload has no main-chat slice")


def _set_depth(page, value):
    page.evaluate(
        """(value) => {
            const slider = document.getElementById('iv-depth-slider');
            if (!slider) throw new Error('depth slider missing');
            slider.value = String(value);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        value,
    )
    page.wait_for_timeout(400)


def _ask_voice(page, text):
    page.locator("#iv-input").fill(text)
    page.locator("#iv-send-btn").click()
    page.wait_for_selector("#iv-thinking-bar", timeout=15_000)
    page.wait_for_selector("#iv-thinking-bar", state="hidden", timeout=180_000)
    page.wait_for_timeout(1000)
    return page.evaluate(
        """() => {
            const nodes = [...document.querySelectorAll('#iv-messages .iv-msg-assistant .iv-msg-content')];
            const last = nodes[nodes.length - 1];
            return last ? (last.innerText || last.textContent || '').trim() : '';
        }"""
    )


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

        ui_before = _ui_texts(page)
        ui_joined = "\n".join(ui_before)
        if OLD_THOUGHT not in ui_joined.lower():
            raise SystemExit(f"UI is missing the older exchange; messages={ui_before[:8]!r}")
        if NEW_THOUGHT not in ui_joined.lower():
            raise SystemExit(f"UI is missing the later exchange; messages={ui_before[-4:]!r}")

        original_depth = page.evaluate(
            "() => parseInt(document.getElementById('iv-depth-slider')?.value || '15', 10)"
        )

        payload = _inspect_payload(page)
        main_chat = _main_chat(payload)
        if "<inner-exchange>" not in main_chat:
            raise SystemExit("main-chat slice has no <inner-exchange> block")
        if "{{user}}'s private inner exchange" not in main_chat:
            raise SystemExit("exchange block is missing the privacy explanation")
        if "IV:" not in main_chat:
            raise SystemExit("exchange block is missing the IV: speaker label")

        standalone = [
            m for m in payload
            if isinstance(m.get("content"), str)
            and m["content"] in ui_before
            and "<main_chat" not in m["content"]
        ]
        if any(
            isinstance(m.get("content"), str) and m["content"] == "Caught up. I remember all of it."
            for m in payload
        ):
            raise SystemExit("hardcoded Caught up line is still in the payload")
        if standalone:
            raise SystemExit(f"flat exchange-stream still present: {standalone[0]['content'][:80]!r}")

        old_pos = main_chat.lower().find(OLD_THOUGHT)
        if old_pos < 0:
            raise SystemExit("in-slice older exchange is missing from the payload")
        msg_close = main_chat.rfind("</msg>", 0, old_pos)
        if msg_close < 0:
            raise SystemExit("older exchange is not below an anchor message")

        _set_depth(page, 1)
        shallow = _inspect_payload(page)
        shallow_chat = _main_chat(shallow)
        if OLD_THOUGHT in shallow_chat.lower():
            raise SystemExit("out-of-slice older exchange still appears at depth 1")
        if "<inner-exchange>" not in shallow_chat:
            raise SystemExit("depth-1 payload has no in-slice exchange block")

        ui_after_depth = "\n".join(_ui_texts(page))
        if OLD_THOUGHT not in ui_after_depth.lower():
            raise SystemExit("UI lost the older exchange after shrinking the depth slice")

        _set_depth(page, original_depth)

        answer = _ask_voice(
            page,
            "at the moment we talked about the clay disc, what did we call it and what does it do?",
        )
        browser.close()

    if "ward" not in answer.lower() and "seed" not in answer.lower() and "clay" not in answer.lower():
        raise SystemExit(f"Voice did not recall the in-slice clay-disc exchange: {answer[:400]!r}")

    print(
        f"ok: inner memory interleaved under anchors for {CHARACTER} "
        f"(UI kept {len(ui_before)} turns including the older exchange; "
        f"depth-1 omitted it; Voice recalled the in-slice moment); "
        f"model requests: {len(model_requests)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
