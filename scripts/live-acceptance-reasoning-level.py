#!/usr/bin/env python3
"""Live STD check: AGAPE reasoning override on Inner Voice requests."""

import json
import sys

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
GROK_OFF_INCLUDE = '{"thinking":{"type":"disabled"},"reasoning_effort":"none"}'
HIGH_INCLUDE = '{"reasoning_effort":"high"}'


def _ready(page):
    page.goto(URL, wait_until="domcontentloaded")
    if "/login" in page.url:
        page.locator(".userSelect", has_text="default-user").click()
        page.wait_for_url(lambda url: "/login" not in url, timeout=30_000)
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


def _prepare(page):
    page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const s = ctx.extensionSettings.inner_voice || {};
            s.toolsEnabled = false;
            s.forceStreaming = 'off';
            s.connectionSource = 'default';
            s.reasoningLevel = 'unset';
            ctx.extensionSettings.inner_voice = s;
            const ids = ['iv-reasoning-level', 'iv-sp-reasoning-level', 'iv-sp-ov-reasoning-level'];
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) el.value = 'unset';
            }
        }"""
    )


def _use_grok(page, enabled):
    page.evaluate(
        """(enabled) => {
            const ctx = SillyTavern.getContext();
            const oai = ctx.chatCompletionSettings;
            const profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
            const selectedId = ctx.extensionSettings?.connectionManager?.selectedProfile;
            const profile = profiles.find(p => p?.id === selectedId);
            if (enabled) {
                if (window._ivPrevCustomModel === undefined) window._ivPrevCustomModel = oai?.custom_model;
                if (window._ivPrevProfileModel === undefined) window._ivPrevProfileModel = profile?.model;
                if (oai) oai.custom_model = 'grok-4.6';
                if (profile) profile.model = 'grok-4.6';
            } else {
                if (oai && window._ivPrevCustomModel !== undefined) oai.custom_model = window._ivPrevCustomModel;
                if (profile && window._ivPrevProfileModel !== undefined) profile.model = window._ivPrevProfileModel;
                window._ivPrevCustomModel = undefined;
                window._ivPrevProfileModel = undefined;
            }
        }""",
        enabled,
    )


def _restore(page):
    _use_grok(page, False)
    page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const s = ctx.extensionSettings.inner_voice || {};
            s.reasoningLevel = 'unset';
            ctx.extensionSettings.inner_voice = s;
        }"""
    )


def _set_level(page, level):
    generated = []

    def on_request(req):
        if "/generate" in req.url:
            generated.append(req.url)

    page.on("request", on_request)
    page.evaluate(
        """(level) => {
            const ctx = SillyTavern.getContext();
            const s = ctx.extensionSettings.inner_voice || {};
            s.reasoningLevel = level;
            ctx.extensionSettings.inner_voice = s;
            if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
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
    page.remove_listener("request", on_request)
    if stored != level:
        raise SystemExit(f"reasoning level did not persist: wanted {level!r}, got {stored!r}")
    if generated:
        raise SystemExit("saving the reasoning level called a model")


def _capture_send(page, text):
    _use_grok(page, True)
    try:
        return _capture_send_now(page, text)
    finally:
        _use_grok(page, False)


def _capture_send_now(page, text):
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
        lambda req: req.method == "POST" and ("/generate" in req.url or "/chat/completions" in req.url),
        timeout=60_000,
    ) as pending:
        page.locator("#iv-send-btn").click(force=True)
    req = pending.value
    raw = req.post_data or ""
    page.evaluate("() => document.getElementById('iv-stop-btn')?.click()")
    try:
        page.wait_for_function(
            "() => !document.getElementById('iv-send-btn')?.disabled",
            timeout=20_000,
        )
    except Exception:
        pass
    try:
        body = json.loads(raw)
    except Exception as exc:
        raise SystemExit(f"Inner Voice generate body was not JSON for {text!r}: {exc}") from exc
    return {"url": req.url, "body": body}


def _applied(body):
    out = dict(body)
    include = str(out.get("custom_include_body") or "").strip()
    if include:
        parsed = json.loads(include)
        if isinstance(parsed, dict):
            out.update(parsed)
    exclude = str(out.get("custom_exclude_body") or "").strip()
    if exclude:
        keys = json.loads(exclude)
        if isinstance(keys, list):
            for key in keys:
                out.pop(key, None)
    out.pop("custom_include_body", None)
    out.pop("custom_exclude_body", None)
    return out


def _override_fields(body):
    return {
        "custom_include_body": body.get("custom_include_body"),
        "custom_exclude_body": body.get("custom_exclude_body"),
        "reasoning_effort": body.get("reasoning_effort"),
        "thinking": body.get("thinking"),
        "thinking_config": body.get("thinking_config"),
    }


def _exclude_has(body, *fields):
    raw = str(body.get("custom_exclude_body") or "").strip()
    if not raw:
        return False
    try:
        parsed = json.loads(raw)
    except Exception:
        return all(name in raw for name in fields)
    if isinstance(parsed, list):
        have = {str(item) for item in parsed}
        return all(name in have for name in fields)
    if isinstance(parsed, dict):
        have = set(parsed)
        return all(name in have for name in fields)
    return False


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        _ready(page)
        _select_character(page, CHARACTER)
        _show_inner_voice(page)
        _prepare(page)
        try:
            _run_cases(page)
        finally:
            _restore(page)
            browser.close()

    print(
        "ok: Grok 4.6 Off include/exclude matched AGAPE; "
        "applied body had reasoning_effort none and no thinking fields; "
        f"High include was {HIGH_INCLUDE}; Unset matched itself; "
        "saving the level sent no extra generate"
    )
    return 0


def _run_cases(page):
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
        if not placement["drawerAbove"]:
            raise SystemExit("drawer reasoning level is not above Streaming Mode")
        if not placement["overlayAbove"]:
            raise SystemExit("overlay reasoning level is not above Streaming")
        if not placement["overrideAbove"]:
            raise SystemExit("conversation-override reasoning level is not above Streaming")

        _set_level(page, "unset")
        unset_cap = _capture_send(page, "ticket 32 unset probe")
        unset_fields = _override_fields(unset_cap["body"])

        _set_level(page, "off")
        off_cap = _capture_send(page, "ticket 32 off probe")
        off_body = off_cap["body"]
        include = str(off_body.get("custom_include_body") or "")
        if GROK_OFF_INCLUDE not in include and include != GROK_OFF_INCLUDE:
            raise SystemExit(
                "Off custom_include_body did not match AGAPE Grok disable shape: "
                + json.dumps(include)
            )
        if not _exclude_has(off_body, "thinking", "thinking_config"):
            raise SystemExit(
                "Off custom_exclude_body did not drop thinking and thinking_config: "
                + json.dumps(off_body.get("custom_exclude_body"))
            )
        final_off = _applied(off_body)
        if final_off.get("reasoning_effort") != "none":
            raise SystemExit(
                "applied Off body missing reasoning_effort none: "
                + json.dumps(_override_fields(final_off))
            )
        if final_off.get("thinking") is not None or final_off.get("thinking_config") is not None:
            raise SystemExit(
                "applied Off body still has thinking fields: "
                + json.dumps({
                    "thinking": final_off.get("thinking"),
                    "thinking_config": final_off.get("thinking_config"),
                })
            )

        _set_level(page, "high")
        high_cap = _capture_send(page, "ticket 32 high probe")
        high_body = high_cap["body"]
        high_include = str(high_body.get("custom_include_body") or "")
        if HIGH_INCLUDE not in high_include and high_include != HIGH_INCLUDE:
            raise SystemExit(
                "High custom_include_body did not match AGAPE effort shape: "
                + json.dumps(high_include)
            )
        final_high = _applied(high_body)
        if final_high.get("reasoning_effort") != "high":
            raise SystemExit(
                "applied High body missing reasoning_effort high: "
                + json.dumps(_override_fields(final_high))
            )

        _set_level(page, "unset")
        unset_again = _capture_send(page, "ticket 32 unset again")
        again_fields = _override_fields(unset_again["body"])
        if again_fields != unset_fields:
            raise SystemExit(
                "second Unset send did not match the first Unset request fields: "
                f"{again_fields} vs {unset_fields}"
            )

        off_model = str(off_cap["body"].get("model") or "")
        if "grok-4.6" not in off_model.lower():
            raise SystemExit(f"Off generate model was not Grok 4.6: {off_model!r}")


if __name__ == "__main__":
    sys.exit(main())
