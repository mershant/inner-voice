#!/usr/bin/env python3
"""Live STD check: the think box is focused again when a reply finishes."""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"


def _ready(page):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector("#send_textarea", timeout=60_000)
    try:
        page.wait_for_selector("#loader", state="detached", timeout=15_000)
    except Exception:
        pass
    page.wait_for_timeout(2000)


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
    page.wait_for_selector("#iv-input", timeout=15_000)
    page.wait_for_timeout(300)


def _toggle_generating(page):
    return page.evaluate(
        """async () => {
            const scripts = [...document.querySelectorAll('script[src]')];
            const script = scripts.find(s => /inner-voice\\/index\\.js/.test(s.src));
            if (!script) throw new Error('Inner Voice script missing');
            const mod = await import(script.src);
            if (typeof mod.setGeneratingState !== 'function') {
                throw new Error('setGeneratingState is not exported');
            }
            const input = document.getElementById('iv-input');
            input.focus();
            const before = document.activeElement && document.activeElement.id;
            mod.setGeneratingState(true);
            const duringId = document.activeElement && document.activeElement.id;
            const disabled = !!input.disabled;
            mod.setGeneratingState(false);
            const after = document.activeElement && document.activeElement.id;
            return {
                before,
                duringId: duringId || '',
                disabled,
                after,
                stillDisabled: !!input.disabled,
            };
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
        _show_inner_voice(page)
        page.locator("#iv-input").click()

        result = _toggle_generating(page)

        page.locator("#send_textarea").click()
        stolen = page.evaluate(
            """async () => {
                const scripts = [...document.querySelectorAll('script[src]')];
                const script = scripts.find(s => /inner-voice\\/index\\.js/.test(s.src));
                const mod = await import(script.src);
                mod.setGeneratingState(true);
                mod.setGeneratingState(false);
                return document.activeElement && document.activeElement.id;
            }"""
        )
        browser.close()

    if result["before"] != "iv-input":
        raise SystemExit(f"think box was not focused before the reply lock ({result['before']!r})")
    if not result["disabled"]:
        raise SystemExit("think box stayed enabled during the reply")
    if result["stillDisabled"]:
        raise SystemExit("think box stayed locked after the reply finished")
    if result["after"] != "iv-input":
        raise SystemExit(f"think box was not focused after the reply finished ({result['after']!r})")
    if stolen != "send_textarea":
        raise SystemExit(f"reply finish stole focus from the main chat box ({stolen!r})")
    if model_requests:
        raise SystemExit(f"unexpected model requests: {model_requests}")

    print(
        "ok: think box is focused again when a reply finishes "
        f"(model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
