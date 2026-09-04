#!/usr/bin/env python3
"""Live STD check: the outgoing prompt carries the exchange block below its anchor."""

import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"


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
        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector("#send_textarea", timeout=60_000)
        try:
            page.wait_for_selector("#loader", state="detached", timeout=15_000)
        except Exception:
            pass
        page.wait_for_timeout(2000)

        page.evaluate(
            """async (name) => {
                const ctx = SillyTavern.getContext();
                const idx = (ctx.characters || []).findIndex(c => c.name === name);
                if (idx < 0) throw new Error('character not found: ' + name);
                await ctx.selectCharacterById(idx);
            }""",
            CHARACTER,
        )
        page.wait_for_function(
            "name => SillyTavern.getContext().name2 === name",
            arg=CHARACTER,
            timeout=30_000,
        )
        page.wait_for_timeout(2500)

        snapshot = page.evaluate(
            """async () => {
                const ctx = SillyTavern.getContext();
                const es = ctx.eventSource;
                const et = ctx.eventTypes || ctx.event_types || {};
                let chatReady = null;
                let combined = null;
                es.once(et.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', data => { chatReady = data; });
                es.once(et.GENERATE_AFTER_COMBINE_PROMPTS || 'generate_after_combine_prompts', data => { combined = data; });
                await ctx.generate('normal', {}, true);

                const stChat = ctx.chat || [];
                const lastMes = String((stChat[stChat.length - 1] || {}).mes || '');
                const promptChat = (chatReady && chatReady.chat) || [];
                const combinedPrompt = combined && combined.prompt ? String(combined.prompt) : '';

                const contents = promptChat.length
                    ? promptChat.map(m => String(m.content || ''))
                    : (combinedPrompt ? [combinedPrompt] : []);
                const joined = contents.join('\\n');
                const lastNeedle = lastMes.slice(0, 80);
                const lastIdx = contents.findIndex(c => lastNeedle && c.includes(lastNeedle));
                const blockIdx = contents.findIndex(c => c.includes('<inner-exchange>'));
                return {
                    lastNeedle,
                    lastIdx,
                    blockIdx,
                    joinedHasBlock: joined.includes('<inner-exchange>'),
                    joined,
                    stChatLength: stChat.length,
                    dryRun: !!(chatReady && chatReady.dryRun) || !!(combined && combined.dryRun),
                };
            }"""
        )
        browser.close()

    if model_requests:
        raise SystemExit(f"model requests were sent: {model_requests}")

    if not snapshot.get("joinedHasBlock"):
        raise SystemExit("outgoing prompt has no <inner-exchange> block")

    block_idx = snapshot["blockIdx"]
    last_idx = snapshot["lastIdx"]
    if block_idx < 0:
        raise SystemExit("could not locate the exchange block in the outgoing prompt")
    if last_idx < 0:
        raise SystemExit("could not locate the anchor message in the outgoing prompt")
    if block_idx < last_idx:
        raise SystemExit(
            f"exchange block (prompt index {block_idx}) is not below its anchor "
            f"(prompt index {last_idx})"
        )

    joined = snapshot["joined"]
    if "{{user}}'s private inner exchange" not in joined and "private inner exchange" not in joined:
        raise SystemExit("outgoing prompt is missing the privacy explanation")
    if "NPCs and the World" not in joined:
        raise SystemExit("outgoing prompt does not name NPCs and the World")
    if "one mind talking to itself" not in joined:
        raise SystemExit("outgoing prompt does not describe one mind talking to itself")
    if "IV:" not in joined:
        raise SystemExit("outgoing prompt is missing the IV: speaker label")

    print(
        f"ok: exchange block below its anchor in the {CHARACTER} outgoing prompt "
        f"(chat {snapshot['stChatLength']} msgs, prompt indices {last_idx} then {block_idx}); "
        f"model requests: {len(model_requests)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
