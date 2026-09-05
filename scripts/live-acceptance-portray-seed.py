#!/usr/bin/env python3
"""Live STD check: send-box text is performed as the portray turn.

Typed send-box text must be in the portray request as already-decided conduct,
and the resulting turn must perform that conduct rather than ignore it or
restage the exchange.
"""

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
SEED = 'take the brass compass. "North moved."'


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
    uniq = []
    for snippet in snippets:
        if snippet not in uniq:
            uniq.append(snippet)
    return uniq


def _body_text(body):
    if not body:
        return ""
    try:
        parsed = json.loads(body)
    except Exception:
        return body
    chunks = []

    def walk(value):
        if isinstance(value, str):
            chunks.append(value)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)

    walk(parsed)
    return "\n".join(chunks) if chunks else body


def main():
    model_requests = []
    request_bodies = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()

        def _on_request(req):
            if req.method != "POST":
                return
            body = req.post_data or ""
            if "/generate" in req.url or "chat/completions" in req.url or "authored-conduct" in body:
                model_requests.append(req.url)
                request_bodies.append(body)

        page.on("request", _on_request)
        _ready(page)
        _select_character(page, CHARACTER)
        _open_chat(page, CHAT_FILE)
        _show_inner_voice(page)

        before = page.evaluate(
            """(seed) => {
                const ta = document.getElementById('send_textarea');
                const ctx = SillyTavern.getContext();
                const s = ctx.extensionSettings.inner_voice || {};
                s.portrayImmediateSend = false;
                if (ta) {
                    ta.value = seed;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return {
                    input: ta ? ta.value : '',
                    chatLength: (ctx.chat || []).length,
                };
            }""",
            SEED,
        )
        if before["input"].strip() != SEED:
            raise SystemExit(f"failed to type the seed into the send box: {before['input']!r}")

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

    payload = "\n".join(_body_text(body) for body in request_bodies)
    if "<authored-conduct>" not in payload:
        raise SystemExit("portray request did not carry an authored-conduct block")
    if SEED not in payload:
        raise SystemExit("portray request did not carry the typed seed")
    if "already decided" not in payload.lower():
        raise SystemExit("authored-conduct block did not present the seed as already-decided conduct")

    turn = after["input"].strip()
    if not turn:
        raise SystemExit("portray left the main-chat input box empty")
    if turn == SEED:
        raise SystemExit("portray left the seed unperformed in the send box")
    if after["disabled"] or after["readOnly"]:
        raise SystemExit("portray filled the input box but it is not editable")
    if after["chatLength"] != before["chatLength"]:
        raise SystemExit(
            f"portray sent a main-chat message "
            f"(chat {before['chatLength']} -> {after['chatLength']})"
        )
    if "```tool_call" in turn:
        raise SystemExit("portray output looks like a tool call, not {{user}} input")

    lower = turn.lower()
    if "north moved" not in lower:
        raise SystemExit(f"portray dropped the quoted speech: {turn!r}")
    if "compass" not in lower and "brass" not in lower:
        raise SystemExit(f"portray dropped the authored action: {turn!r}")

    leaked = [s for s in snippets if s.lower() in turn.lower()]
    if leaked:
        raise SystemExit(
            "portray restaged exchange phrasing in the turn: "
            + repr(leaked[:3])
            + f" | turn={turn!r}"
        )

    print(
        f"ok: seeded portray carried authored conduct and performed the seed "
        f"({after['chatLength']} main-chat messages unchanged; "
        f"{len(turn)} chars; {len(snippets)} leak snippets; "
        f"model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
