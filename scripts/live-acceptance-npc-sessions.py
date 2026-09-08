#!/usr/bin/env python3
"""Live STD acceptance: create, use, isolate, hide, and switch an NPC voice session."""

import json
import re
import secrets
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"


def _ready(page):
    page.goto(URL, wait_until="domcontentloaded")
    authenticated = False
    if "/login" in page.url:
        page.get_by_role("listitem").filter(has_text="default-user").click()
        page.wait_for_url(lambda url: "/login" not in url, timeout=30_000)
        authenticated = True
    page.wait_for_selector("#send_textarea", timeout=60_000)
    try:
        page.wait_for_selector("#loader", state="detached", timeout=15_000)
    except Exception:
        pass
    if authenticated:
        page.context.storage_state(path=STORAGE_STATE)
    page.wait_for_timeout(2_000)


def _select_character(page, name):
    page.wait_for_function(
        "name => (SillyTavern.getContext().characters || []).some(c => c.name === name)",
        arg=name,
        timeout=30_000,
    )
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
    page.wait_for_timeout(2_500)


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
    page.wait_for_timeout(2_500)


def _show_inner_voice(page):
    page.evaluate(
        """() => {
            const changelog = document.getElementById('iv-changelog-modal');
            if (changelog) changelog.style.display = 'none';
            const win = document.getElementById('iv-window');
            if (!win) throw new Error('Inner Voice window missing');
            win.style.display = 'flex';
            const ctx = SillyTavern.getContext();
            const settings = ctx.extensionSettings.inner_voice || {};
            window._ivNpcAcceptanceSettings = {
                toolsEnabled: settings.toolsEnabled,
                forceStreaming: settings.forceStreaming,
                portrayAutoTrigger: settings.portrayAutoTrigger,
                includeCharacterCard: settings.includeCharacterCard,
                hadSystemPrompt: Object.prototype.hasOwnProperty.call(settings, 'systemPrompt'),
                systemPrompt: settings.systemPrompt,
            };
            settings.toolsEnabled = false;
            settings.forceStreaming = 'off';
            settings.portrayAutoTrigger = false;
            settings.includeCharacterCard = true;
            delete settings.systemPrompt;
            ctx.extensionSettings.inner_voice = settings;
        }"""
    )
    page.wait_for_selector("#iv-sess-trigger", timeout=15_000)
    page.wait_for_timeout(500)


def _open_picker(page):
    panel = page.locator("#iv-sess-panel")
    if not panel.evaluate("el => el.classList.contains('open')"):
        page.locator("#iv-sess-trigger").click()
    page.wait_for_function(
        "() => document.getElementById('iv-sess-panel')?.classList.contains('open')"
    )


def _switch_voice(page, owner_voice):
    _open_picker(page)
    item = page.locator(f'.iv-sess-item[data-owner-voice="{owner_voice}"]')
    if item.count() != 1:
        raise SystemExit(f"voice session not found in picker: {owner_voice!r}")
    item.click()
    page.wait_for_function(
        "voice => document.getElementById('iv-sess-name')?.textContent?.trim() === voice",
        arg=(page.evaluate("() => SillyTavern.getContext().name1") if owner_voice == "{{user}}" else owner_voice),
    )


def _delete_existing_npc_session(page):
    _open_picker(page)
    item = page.locator(f'.iv-sess-item[data-owner-voice="{CHARACTER}"]')
    if not item.count():
        page.locator("#iv-sess-trigger").click()
        return
    item.click()
    page.locator("#iv-del-sess-btn").click()
    page.wait_for_selector(".iv-dialog-overlay.visible")
    page.locator(".iv-dialog-ok").click()
    page.wait_for_function(
        "() => !document.querySelector('.iv-sess-item[data-owner-voice=\"Seraphina\"]')"
    )


def _create_npc_session(page):
    _open_picker(page)
    page.locator("#iv-new-sess-btn").click()
    choice = page.locator(".iv-sess-cast-item", has_text=CHARACTER)
    if choice.count() != 1:
        raise SystemExit(f"new-session cast picker did not offer {CHARACTER}")
    choice.click()
    page.wait_for_function(
        "name => document.getElementById('iv-sess-name')?.textContent?.trim() === name",
        arg=CHARACTER,
    )


def _wait_until_idle(page):
    page.wait_for_function(
        "() => !document.getElementById('iv-send-btn')?.disabled",
        timeout=180_000,
    )
    page.wait_for_timeout(500)


def _plant_aborted_turn(page, text):
    page.locator("#iv-input").fill(text)
    with page.expect_request(
        lambda req: req.method == "POST" and ("/generate" in req.url or "/chat/completions" in req.url),
        timeout=60_000,
    ):
        page.locator("#iv-send-btn").click()
    page.locator("#iv-stop-btn").click(force=True)
    _wait_until_idle(page)
    if not page.locator("#iv-messages .iv-msg", has_text=text).count():
        raise SystemExit("the default voice turn did not remain after the acceptance abort")


def _ask_voice(page, text):
    before = page.locator("#iv-messages .iv-msg-assistant").count()
    page.locator("#iv-input").fill(text)
    page.locator("#iv-send-btn").click()
    page.wait_for_function(
        "count => document.querySelectorAll('#iv-messages .iv-msg-assistant').length > count && !document.getElementById('iv-send-btn')?.disabled",
        arg=before,
        timeout=180_000,
    )
    page.wait_for_timeout(800)
    return page.locator("#iv-messages .iv-msg-assistant .iv-msg-content").last.inner_text().strip()


def _inspect_payload(page):
    page.locator("#iv-inspect-btn").click(force=True)
    page.wait_for_function(
        """() => {
            const el = document.getElementById('iv-ctx-json');
            return el && (el.textContent || '').trim().startsWith('[');
        }""",
        timeout=15_000,
    )
    raw = page.locator("#iv-ctx-json").text_content() or ""
    page.evaluate("() => { const el = document.getElementById('iv-ctx-modal'); if (el) el.style.display = 'none'; }")
    return json.loads(raw)


def _payload_text(messages):
    return "\n".join(
        message.get("content", "")
        for message in messages
        if isinstance(message.get("content"), str)
    )


def _visible_exchange_text(page):
    return "\n".join(
        text.strip()
        for text in page.locator("#iv-messages .iv-msg-content").all_inner_texts()
        if text.strip()
    )


def _cleanup(page, default_marker):
    try:
        if page.locator(f'.iv-sess-item[data-owner-voice="{CHARACTER}"]').count():
            _switch_voice(page, CHARACTER)
            hidden = page.locator("#iv-messages .iv-segment.iv-segment-hidden .iv-hide-toggle")
            if hidden.count():
                hidden.last.click()
            page.locator("#iv-del-sess-btn").click()
            page.wait_for_selector(".iv-dialog-overlay.visible")
            page.locator(".iv-dialog-ok").click()
            page.wait_for_timeout(400)
        _switch_voice(page, "{{user}}")
        marker_message = page.locator("#iv-messages .iv-msg", has_text=default_marker)
        if marker_message.count():
            marker_message.last.locator(".iv-msg-btn-danger").click(force=True)
            page.wait_for_selector(".iv-dialog-overlay.visible")
            page.locator(".iv-dialog-ok").click()
            page.wait_for_timeout(400)
    except Exception:
        pass
    try:
        page.evaluate(
            """() => {
                const ctx = SillyTavern.getContext();
                const settings = ctx.extensionSettings.inner_voice || {};
                const saved = window._ivNpcAcceptanceSettings;
                if (!saved) return;
                settings.toolsEnabled = saved.toolsEnabled;
                settings.forceStreaming = saved.forceStreaming;
                settings.portrayAutoTrigger = saved.portrayAutoTrigger;
                settings.includeCharacterCard = saved.includeCharacterCard;
                if (saved.hadSystemPrompt) settings.systemPrompt = saved.systemPrompt;
                else delete settings.systemPrompt;
                delete window._ivNpcAcceptanceSettings;
                if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
            }"""
        )
    except Exception:
        pass


def main():
    nonce = secrets.token_hex(5).upper()
    default_marker = f"DEFAULT-MIND-{nonce}"
    npc_marker = f"NPC-DOUBT-{nonce}: Mira may have hidden the key from me. What do I really think?"
    model_requests = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        page.on(
            "request",
            lambda req: model_requests.append(req.url)
            if "/generate" in req.url or "/chat/completions" in req.url
            else None,
        )
        try:
            _ready(page)
            _select_character(page, CHARACTER)
            _open_chat(page, CHAT_FILE)
            _show_inner_voice(page)
            _delete_existing_npc_session(page)

            persona = page.evaluate("() => SillyTavern.getContext().name1")
            if page.locator("#iv-sess-name").inner_text().strip() != persona:
                raise SystemExit("Inner Voice did not open in the default {{user}} session")
            if not page.locator("#iv-del-sess-btn").is_disabled():
                raise SystemExit("the default {{user}} session can be deleted")
            if f"Mind: {persona}" not in page.locator("#iv-char-badge").inner_text():
                raise SystemExit("the active default voice is not visibly indicated")

            _plant_aborted_turn(page, default_marker)
            _create_npc_session(page)
            if page.locator("#iv-char-badge").inner_text().strip() != f"Mind: {CHARACTER}":
                raise SystemExit("the active NPC voice is not visibly indicated")
            if page.locator("#iv-del-sess-btn").is_disabled():
                raise SystemExit("the NPC voice session cannot be deleted")
            if default_marker in _visible_exchange_text(page):
                raise SystemExit("the default mind leaked into the NPC chat view")

            npc_payload_before = _inspect_payload(page)
            npc_text_before = _payload_text(npc_payload_before)
            if default_marker in npc_text_before:
                raise SystemExit("the default mind leaked into the NPC inner memory")
            if f'<character name="{CHARACTER}">' not in npc_text_before:
                raise SystemExit("the NPC session did not include its bound character card")
            if not re.search(rf"{re.escape(CHARACTER)}:\s*you\b", npc_text_before, re.I):
                raise SystemExit("the NPC system prompt does not cast the model as that character")
            if not re.search(r"first person", npc_text_before, re.I):
                raise SystemExit("the NPC system prompt does not require first person")

            answer = _ask_voice(page, npc_marker)
            if not answer:
                raise SystemExit("the NPC session returned an empty answer")
            if not re.search(r"\b(I|I'm|I've|I'd|me|my|mine)\b", answer, re.I):
                raise SystemExit(f"NPC answer was not recognizably first-person: {answer[:400]!r}")
            npc_view = _visible_exchange_text(page)
            if npc_marker not in npc_view or answer not in npc_view:
                raise SystemExit("the NPC exchange did not land under the active voice")

            page.locator("#iv-messages .iv-hide-toggle").last.click()
            if not page.locator("#iv-messages .iv-segment.iv-segment-hidden").count():
                raise SystemExit("the NPC exchange did not show its hidden state")

            _switch_voice(page, "{{user}}")
            user_view = _visible_exchange_text(page)
            if default_marker not in user_view:
                raise SystemExit("switching away altered the default session exchange")
            if npc_marker in user_view or answer in user_view:
                raise SystemExit("the NPC exchange leaked into the default chat view")
            default_segment_hidden = page.locator("#iv-messages .iv-msg", has_text=default_marker).last.evaluate(
                "el => el.closest('.iv-segment')?.classList.contains('iv-segment-hidden')"
            )
            if default_segment_hidden:
                raise SystemExit("hiding the NPC exchange hid the default exchange at the same anchor")
            user_payload = _payload_text(_inspect_payload(page))
            if default_marker not in user_payload:
                raise SystemExit("the default exchange vanished from its own inner memory")

            _switch_voice(page, CHARACTER)
            npc_payload_hidden = _payload_text(_inspect_payload(page))
            if npc_marker in npc_payload_hidden or answer in npc_payload_hidden:
                raise SystemExit("the hidden NPC exchange remained in NPC inner memory")
            if _visible_exchange_text(page) != npc_view:
                raise SystemExit("switching sessions modified the NPC exchange")
        finally:
            _cleanup(page, default_marker)
            browser.close()

    if len(model_requests) < 2:
        raise SystemExit(f"expected an aborted default request and an NPC request, got {len(model_requests)}")
    print(
        f"ok: created cast-bound {CHARACTER} session; active marker, scoped view/memory/card, "
        f"first-person answer, per-voice hide, and stable switching passed; model requests: {len(model_requests)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
