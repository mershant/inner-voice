#!/usr/bin/env python3
"""Ticket #9 visual inspection: segments, markers, jump nav, actions bar.

Drives the installed extension in STD, seeds a multi-exchange conversation
through the extension's own spine, and screenshots desktop + mobile widths.
Never sends a model request.
"""

import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
OUT = "/home/opc/projects/st-extensions/inner-voice/.playwright-mcp"


EXT = "/scripts/extensions/third-party/inner-voice"


def open_window(page):
    page.evaluate("""() => {
        const s = SillyTavern.getContext().extensionSettings.inner_voice;
        s.enabled = true; s.windowVisible = true; s.minimized = false;
        document.getElementById('iv-window').style.display = 'flex';
    }""")
    page.wait_for_timeout(400)


def seed(page, ext):
    """Three exchanges under three main-chat messages, via the real spine."""
    return page.evaluate("""async (ext) => {
        const m = await import(`${ext}/src/conversation.js`);
        const ctx = SillyTavern.getContext();
        ctx.chat.length = 0;
        ctx.chat.push(
            { mes: 'The ferryman poles away from the dock, leaving you on the near bank.', is_user: false, name: 'Seraphina', extra: {} },
            { mes: 'I walk the stream margin toward the old bridge.', is_user: true, extra: {} },
            { mes: 'The bridge planks give differently under each foot. Something has crossed recently.', is_user: false, name: 'Seraphina', extra: {} },
        );
        m.initConversation({ forceReset: true });
        const conv = m.getConversation();
        m.addTurn(conv, 'user', 'what should we do...?');
        m.addTurn(conv, 'assistant', 'Set the cup down and take the key. She gave us every scrap she had, and the thing out north is waiting.');
        ctx.chat.push({ mes: 'You are tired to the bone; your left side feels like ice.', is_user: false, name: 'Seraphina', extra: {} });
        m.addTurn(conv, 'user', '...how are you feeling?');
        m.addTurn(conv, 'assistant', 'Tired to the bone, and my left side feels like ice and hot wire stitched together. Having a direction is better than staring at dying flowers.');
        return conv.messages.length;
    }""", ext)


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}")


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

        count = seed(page, EXT)
        print(f"seeded turns: {count}")
        open_window(page)

        page.evaluate("""async (ext) => {
            const [ui, conv] = await Promise.all([
                import(`${ext}/src/ui/ui-chat.js`),
                import(`${ext}/src/conversation.js`),
            ]);
            ui.renderConversation(conv.getConversation());
        }""", EXT)
        page.wait_for_timeout(600)

        # Desktop width, full window
        page.set_viewport_size({"width": 1440, "height": 900})
        page.evaluate("""() => {
            const w = document.getElementById('iv-window');
            w.style.left = '500px'; w.style.top = '80px';
            w.style.width = '440px'; w.style.height = '640px';
        }""")
        page.wait_for_timeout(300)
        shot(page, "ticket9-desktop-window.png")

        # Anchor marker detail
        page.locator("#iv-messages").screenshot(path=f"{OUT}/ticket9-desktop-messages.png")

        # Mobile width
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("""() => {
            const w = document.getElementById('iv-window');
            w.style.left = '8px'; w.style.top = '40px';
            w.style.width = '360px'; w.style.height = '620px';
        }""")
        page.wait_for_timeout(300)
        shot(page, "ticket9-mobile-window.png")
        page.locator("#iv-messages").screenshot(path=f"{OUT}/ticket9-mobile-messages.png")

        # Actions bar detail (the crush zone from the maintainer screenshots)
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator(".iv-actions-bar").screenshot(path=f"{OUT}/ticket9-actions-bar.png")

        # Jump nav sanity: click first segment header, confirm scroll moved
        page.evaluate("""() => {
            const c = document.getElementById('iv-messages');
            c.scrollTop = c.scrollHeight;
        }""")
        page.wait_for_timeout(200)
        before = page.evaluate("() => document.getElementById('iv-messages').scrollTop")
        page.evaluate("""() => {
            document.querySelector('.iv-anchor').click();
        }""")
        page.wait_for_timeout(700)
        after = page.evaluate("() => document.getElementById('iv-messages').scrollTop")
        print(f"jump scroll: {before} -> {after}")

        # Console errors?
        browser.close()
        print("done")


if __name__ == "__main__":
    sys.exit(main())
