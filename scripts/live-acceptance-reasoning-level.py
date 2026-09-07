#!/usr/bin/env python3
"""Live STD check: reasoning level sits above streaming and shapes Inner Voice requests."""

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"


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
    page.wait_for_selector("#iv-send-btn", timeout=15_000)
    page.wait_for_timeout(400)


def _set_level(page, level):
    generated = []

    def on_request(req):
        if "/generate" in req.url:
            generated.append(req.url)

    page.on("request", on_request)
    page.evaluate(
        """(level) => {
            const ids = ['iv-reasoning-level', 'iv-sp-reasoning-level'];
            let found = false;
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                found = true;
                el.value = level;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (!found) throw new Error('reasoning level dropdown missing');
        }""",
        level,
    )
    page.wait_for_timeout(400)
    stored = page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            return ctx.extensionSettings?.inner_voice?.reasoningLevel || '';
        }"""
    )
    if stored != level:
        raise SystemExit(f"reasoning level did not persist: wanted {level!r}, got {stored!r}")
    if generated:
        raise SystemExit("saving the reasoning level called a model")


def _capture_send(page, text):
    page.evaluate(
        """(text) => {
            const input = document.getElementById('iv-input');
            if (!input) throw new Error('think box missing');
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }""",
        text,
    )
    with page.expect_request(
        lambda req: "/generate" in req.url or "/caption-image" in req.url,
        timeout=20_000,
    ) as pending:
        page.locator("#iv-send-btn").click(force=True)
    raw = pending.value.post_data or ""
    page.evaluate("() => document.getElementById('iv-stop-btn')?.click()")
    page.wait_for_function(
        "() => !document.getElementById('iv-send-btn')?.disabled",
        timeout=15_000,
    )
    try:
        return json.loads(raw)
    except Exception as exc:
        raise SystemExit(f"Inner Voice generate body was not JSON for {text!r}: {exc}") from exc


def _reasoning_fields(body):
    return {
        "reasoning_effort": body.get("reasoning_effort"),
        "include_reasoning": body.get("include_reasoning"),
        "thinking": body.get("thinking"),
        "thinkingConfig": body.get("thinkingConfig"),
        "reasoning": body.get("reasoning"),
    }


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        _ready(page)
        _select_character(page, CHARACTER)
        _show_inner_voice(page)

        placement = page.evaluate(
            """() => {
                const drawer = document.querySelector('.inner-voice-settings');
                const drawerLevel = document.getElementById('iv-reasoning-level');
                const drawerStream = document.getElementById('iv-st-stream-auto');
                const overlayLevel = document.getElementById('iv-sp-reasoning-level');
                const overlayStream = document.getElementById('iv-sp-stream-auto');
                const ovLevel = document.getElementById('iv-sp-ov-reasoning-level');
                const ovStream = document.getElementById('iv-sp-ov-stream-auto');
                const above = (a, b) => {
                    if (!a || !b) return false;
                    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
                };
                return {
                    drawerPresent: !!(drawer && drawerLevel),
                    defaultValue: drawerLevel ? drawerLevel.value : null,
                    drawerAbove: above(drawerLevel, drawerStream),
                    overlayAbove: above(overlayLevel, overlayStream),
                    overrideAbove: above(ovLevel, ovStream),
                };
            }"""
        )
        if not placement["drawerPresent"]:
            raise SystemExit("reasoning level dropdown missing from Inner connection")
        if placement["defaultValue"] not in (None, "unset"):
            # Fresh default is Unset; a leftover High from a prior run is overwritten below.
            pass
        if not placement["drawerAbove"]:
            raise SystemExit("drawer reasoning level is not above Streaming Mode")
        if not placement["overlayAbove"]:
            raise SystemExit("overlay reasoning level is not above Streaming")
        if not placement["overrideAbove"]:
            raise SystemExit("conversation-override reasoning level is not above Streaming")

        _set_level(page, "unset")
        unset_body = _capture_send(page, "ticket 32 unset probe")
        unset_fields = _reasoning_fields(unset_body)

        _set_level(page, "high")
        high_body = _capture_send(page, "ticket 32 high probe")
        if high_body.get("reasoning_effort") != "high" and not (
            isinstance(high_body.get("thinkingConfig"), dict)
            and high_body["thinkingConfig"].get("thinkingLevel") == "high"
        ):
            raise SystemExit(
                "High send did not carry the chosen level in the request body: "
                + json.dumps(_reasoning_fields(high_body))
            )

        _set_level(page, "unset")
        unset_again = _capture_send(page, "ticket 32 unset again")
        if _reasoning_fields(unset_again) != unset_fields:
            raise SystemExit(
                "second Unset send did not match the first Unset request fields: "
                f"{_reasoning_fields(unset_again)} vs {unset_fields}"
            )

        browser.close()

    print(
        "ok: dropdown above streaming; High visible in captured body "
        f"({json.dumps(_reasoning_fields(high_body))}); "
        "Unset matched itself; saving the level sent no extra generate"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
