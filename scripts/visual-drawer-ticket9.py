#!/usr/bin/env python3
"""Ticket #9 drawer inspection: ST drawer + settings overlay at both widths."""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
OUT = "/home/opc/projects/st-extensions/inner-voice/.playwright-mcp"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(storage_state=STORAGE_STATE)
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector("#send_textarea", timeout=60_000)
        try:
            page.wait_for_selector("#loader", state="detached", timeout=15_000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        page.evaluate("""async (name) => {
            const ctx = SillyTavern.getContext();
            const idx = (ctx.characters || []).findIndex(c => c.name === name);
            await ctx.selectCharacterById(idx);
        }""", CHARACTER)
        page.wait_for_timeout(2500)
        page.wait_for_function(
            "() => !!document.querySelector('.inner-voice-settings')", timeout=30_000
        )

        # The floating window must not sit over the drawer during inspection.
        page.evaluate("""() => {
            const w = document.getElementById('iv-window');
            if (w) w.style.display = 'none';
        }""")

        # Open the extensions panel.
        page.evaluate("""() => {
            const btn = document.getElementById('extensions-settings-button');
            (btn?.querySelector('.drawer-toggle') || btn)?.click();
        }""")
        page.wait_for_function(
            """() => {
                const el = document.querySelector('.inner-voice-settings');
                return !!el && el.getClientRects().length > 0;
            }""",
            timeout=15_000,
        )
        page.evaluate("""() => {
            const t = document.querySelector('.inner-voice-settings .inline-drawer-toggle');
            const content = document.querySelector('.inner-voice-settings .inline-drawer-content');
            if (t && content && !content.getClientRects().length) t.click();
        }""")
        page.wait_for_timeout(600)

        # Tall viewport so the whole drawer fits in one element shot.
        page.set_viewport_size({"width": 1440, "height": 2800})
        page.wait_for_timeout(400)
        page.locator(".inner-voice-settings").screenshot(path=f"{OUT}/ticket9-drawer-desktop.png")

        page.set_viewport_size({"width": 390, "height": 3200})
        page.wait_for_timeout(400)
        page.locator(".inner-voice-settings").screenshot(path=f"{OUT}/ticket9-drawer-mobile.png")

        # Settings overlay — open via the window gear, then shoot top and bottom.
        page.set_viewport_size({"width": 1440, "height": 900})
        page.evaluate("""() => {
            const w = document.getElementById('iv-window');
            if (w) w.style.display = 'flex';
        }""")
        page.wait_for_timeout(300)
        page.evaluate("""() => document.getElementById('iv-ext-settings-btn')?.click()""")
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/ticket9-overlay-desktop.png")
        page.evaluate("""() => {
            const b = document.querySelector('.iv-sp-body');
            if (b) b.scrollTop = b.scrollHeight;
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/ticket9-overlay-desktop-bottom.png")

        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        page.evaluate("""() => {
            const b = document.querySelector('.iv-sp-body');
            if (b) b.scrollTop = 0;
        }""")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/ticket9-overlay-mobile.png")
        page.evaluate("""() => {
            const b = document.querySelector('.iv-sp-body');
            if (b) b.scrollTop = b.scrollHeight;
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/ticket9-overlay-mobile-bottom.png")

        browser.close()
        print("drawer shots done")


if __name__ == "__main__":
    sys.exit(main())
