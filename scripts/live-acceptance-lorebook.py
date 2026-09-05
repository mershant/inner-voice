#!/usr/bin/env python3
"""Live STD check: inner memory includes active lorebook entries (read-only)."""

import json
import secrets
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


def _payload_text(messages):
    return "\n".join(
        m.get("content", "") if isinstance(m.get("content"), str) else ""
        for m in messages
    )


def _set_lorebook_toggle(page, enabled):
    page.evaluate(
        """(enabled) => {
            const ids = ['iv-include-lorebook', 'iv-sp-include-lorebook'];
            let found = false;
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                found = true;
                if (el.checked !== enabled) {
                    el.checked = enabled;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            if (!found) throw new Error('lorebook toggle missing');
        }""",
        enabled,
    )
    page.wait_for_timeout(400)


def _plant_embedded_fact(page, content):
    return page.evaluate(
        """(content) => {
            const ctx = SillyTavern.getContext();
            const char = ctx.characters?.[ctx.characterId];
            if (!char) throw new Error('no character');
            if (!char.data) char.data = {};
            const original = char.data.character_book ? JSON.parse(JSON.stringify(char.data.character_book)) : null;
            char.data.character_book = {
                entries: [{
                    id: 9001,
                    name: 'East gate',
                    keys: ['never-matching-key-qx7742'],
                    content,
                    enabled: true,
                }],
            };
            const chat = (ctx.chat || []).map(m => String(m.mes || '')).join('\\n');
            const inner = [...document.querySelectorAll('#iv-messages .iv-msg-content')]
                .map(n => n.innerText || n.textContent || '')
                .join('\\n');
            return {
                original,
                chatHasFact: chat.includes(content) || inner.includes(content),
            };
        }""",
        content,
    )


def _restore_embedded_book(page, original):
    page.evaluate(
        """(original) => {
            const ctx = SillyTavern.getContext();
            const char = ctx.characters?.[ctx.characterId];
            if (!char?.data) return;
            if (original === null) delete char.data.character_book;
            else char.data.character_book = original;
        }""",
        original,
    )


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
    nonce = "LB-" + secrets.token_hex(6).upper()
    fact = f"The east-gate passphrase is {nonce}."
    question = "What is the east-gate passphrase? Answer with the exact code if you know it."
    model_requests = []
    original_book = None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        page.on(
            "request",
            lambda req: model_requests.append(req.url) if "/generate" in req.url else None,
        )
        try:
            _ready(page)
            _select_character(page, CHARACTER)
            _open_chat(page, CHAT_FILE)
            _show_inner_voice(page)

            planted = _plant_embedded_fact(page, fact)
            original_book = planted["original"]
            if planted["chatHasFact"]:
                raise SystemExit("main chat already contains the lorebook nonce")

            _set_lorebook_toggle(page, False)
            off_payload = _inspect_payload(page)
            off_text = _payload_text(off_payload)
            if nonce in off_text or fact in off_text:
                raise SystemExit("toggle off still carried lorebook content in the payload")
            if "<world_knowledge>" in off_text:
                raise SystemExit("toggle off still carried a world_knowledge block")

            off_answer = _ask_voice(page, question)
            if nonce in off_answer:
                raise SystemExit(f"toggle off still named the lorebook nonce: {off_answer[:400]!r}")

            _set_lorebook_toggle(page, True)
            on_payload = _inspect_payload(page)
            on_text = _payload_text(on_payload)
            if nonce not in on_text:
                raise SystemExit("toggle on did not put the lorebook fact in the payload")
            sys_msg = next((m for m in on_payload if m.get("role") == "system"), None)
            main_msg = next(
                (m for m in on_payload if isinstance(m.get("content"), str) and "<main_chat" in m["content"]),
                None,
            )
            if not sys_msg or nonce not in str(sys_msg.get("content") or ""):
                raise SystemExit("lorebook fact is not in the system/world-knowledge material")
            if "<world_knowledge>" not in str(sys_msg.get("content") or ""):
                raise SystemExit("payload is missing the world_knowledge frame")
            if main_msg and nonce in str(main_msg.get("content") or ""):
                raise SystemExit("lorebook fact leaked into the main-chat slice")

            on_answer = _ask_voice(page, question)
            if nonce not in on_answer:
                raise SystemExit(f"toggle on, Inner Voice did not use the lorebook fact: {on_answer[:400]!r}")
        finally:
            try:
                _restore_embedded_book(page, original_book)
                _set_lorebook_toggle(page, True)
            except Exception:
                pass
            browser.close()

    print(
        f"ok: lorebook fact absent from chat, in payload when on and out when off; "
        f"Inner Voice used it only with the toggle on; model requests: {len(model_requests)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
