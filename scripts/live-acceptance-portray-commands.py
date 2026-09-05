#!/usr/bin/env python3
"""Live STD check: p, dp, and pa use the think box command path."""

import json
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
CHARACTER = "Seraphina"
CHAT_FILE = "ff5-internal-state-toggles-fresh-seraphina"
P_SEED = 'take the brass compass. "North moved."'
DP_TEXT = "Choose one concrete thing I should do next, and commit to it now."
PA_SEED = 'tap the map twice. "Here."'


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
    page.wait_for_selector("#iv-send-btn", timeout=15_000)
    page.wait_for_timeout(500)


def _prepare_settings(page):
    page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const s = ctx.extensionSettings.inner_voice || {};
            s.portrayAutoTrigger = true;
            s.portrayImmediateSend = false;
            s.toolsEnabled = false;
            ctx.extensionSettings.inner_voice = s;
            const mainInput = document.getElementById('send_textarea');
            if (mainInput) {
                mainInput.value = '';
                mainInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }"""
    )


def _snapshot(page):
    return page.evaluate(
        """() => {
            const ctx = SillyTavern.getContext();
            const settings = ctx.extensionSettings.inner_voice || {};
            const mainInput = document.getElementById('send_textarea');
            const thinkInput = document.getElementById('iv-input');
            const hint = document.getElementById('iv-think-command-hint');
            const innerUser = [...document.querySelectorAll('.iv-msg-user .iv-msg-content')]
                .map(el => (el.innerText || el.textContent || '').trim());
            const innerAssistant = [...document.querySelectorAll('.iv-msg-assistant .iv-msg-content')]
                .map(el => (el.innerText || el.textContent || '').trim());
            const mainUser = (ctx.chat || []).filter(msg => msg?.is_user);
            return {
                chatLength: (ctx.chat || []).length,
                mainUserTurns: mainUser.length,
                latestMainUser: String(mainUser.at(-1)?.mes || ''),
                innerUser,
                innerAssistant,
                mainInput: String(mainInput?.value || ''),
                thinkInput: String(thinkInput?.value || ''),
                hintVisible: !!(hint && !hint.hidden && hint.offsetParent),
                autoTrigger: !!settings.portrayAutoTrigger,
                immediateSend: !!settings.portrayImmediateSend,
                generating: !!document.getElementById('iv-stop-btn')?.offsetParent,
            };
        }"""
    )


def _clear_main_input(page):
    page.evaluate(
        """() => {
            const input = document.getElementById('send_textarea');
            if (!input) return;
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }"""
    )


def _enter_command(page, prefix, remainder):
    page.fill("#iv-input", prefix)
    prefix_snapshot = _snapshot(page)
    if not prefix_snapshot["hintVisible"]:
        raise SystemExit(f"command hint did not appear for {prefix!r}")
    page.type("#iv-input", remainder)
    expected = prefix + remainder
    actual = page.input_value("#iv-input")
    if actual != expected:
        raise SystemExit(
            f"command hint changed or blocked typing: expected {expected!r}, saw {actual!r}"
        )
    if not _snapshot(page)["hintVisible"]:
        raise SystemExit(f"command hint disappeared while typing {expected!r}")
    page.evaluate("() => document.getElementById('iv-send-btn').click()")


def _wait_for_draft(page):
    page.wait_for_function(
        """() => {
            const draft = String(document.getElementById('send_textarea')?.value || '').trim();
            const busy = !!document.getElementById('iv-stop-btn')?.offsetParent;
            return draft.length > 0 && !busy;
        }""",
        timeout=180_000,
    )
    page.wait_for_timeout(500)


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
    return "\n".join(chunks)


def _fail_diagnostic(page, model_requests, console_errors, err):
    print(f"diagnostic: {_snapshot(page)}", file=sys.stderr)
    print(f"model requests: {len(model_requests)}", file=sys.stderr)
    for line in console_errors:
        print(line, file=sys.stderr)
    raise err


def main():
    model_requests = []
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()

        def on_request(request):
            if "/generate" in request.url:
                model_requests.append((request.url, request.post_data or ""))

        page.on("request", on_request)
        page.on(
            "console",
            lambda message: console_errors.append(f"{message.type}: {message.text}")
            if message.type == "error"
            else None,
        )

        _ready(page)
        _select_character(page, CHARACTER)
        _open_chat(page, CHAT_FILE)
        _show_inner_voice(page)
        _prepare_settings(page)

        page.fill("#iv-input", "say p later")
        if _snapshot(page)["hintVisible"]:
            raise SystemExit("command hint appeared for mid-message command letters")
        page.fill("#iv-input", "")

        before_p = _snapshot(page)
        requests_before_p = len(model_requests)
        _enter_command(page, "p ", P_SEED)
        try:
            _wait_for_draft(page)
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, console_errors, err)
        after_p = _snapshot(page)
        p_requests = model_requests[requests_before_p:]
        p_payload = "\n".join(_body_text(body) for _, body in p_requests)
        if len(p_requests) != 1:
            raise SystemExit(f"p should make one portray request; saw {len(p_requests)}")
        if P_SEED not in p_payload or "<authored-conduct>" not in p_payload:
            raise SystemExit("p did not carry its text as authored conduct")
        if f"p {P_SEED}" in p_payload:
            raise SystemExit("p command text leaked into the portray seed")
        if after_p["thinkInput"] or after_p["hintVisible"]:
            raise SystemExit("p did not consume the command and hide its hint")
        if len(after_p["innerUser"]) != len(before_p["innerUser"]):
            raise SystemExit("p posted its seed as an exchange turn")
        if after_p["chatLength"] != before_p["chatLength"]:
            raise SystemExit("p sent its draft despite stored draft-only landing")
        if after_p["immediateSend"]:
            raise SystemExit("p changed the stored landing setting")
        _clear_main_input(page)

        before_dp = _snapshot(page)
        requests_before_dp = len(model_requests)
        _enter_command(page, "dp:", DP_TEXT)
        try:
            _wait_for_draft(page)
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, console_errors, err)
        after_dp = _snapshot(page)
        dp_requests = model_requests[requests_before_dp:]
        dp_payloads = [_body_text(body) for _, body in dp_requests]
        if len(dp_requests) != 2:
            raise SystemExit(
                f"dp should make one exchange request and one portray request; saw {len(dp_requests)}"
            )
        if len(after_dp["innerUser"]) != len(before_dp["innerUser"]) + 1:
            raise SystemExit("dp did not post exactly one exchange turn")
        if after_dp["innerUser"][-1] != DP_TEXT:
            raise SystemExit(
                f"dp exchange carried the wrong text: {after_dp['innerUser'][-1]!r}"
            )
        if len(after_dp["innerAssistant"]) != len(before_dp["innerAssistant"]) + 1:
            raise SystemExit("dp did not wait for one fresh {{user}} reply")
        if any("<authored-conduct>" in payload for payload in dp_payloads):
            raise SystemExit("dp used its exchange text as a portray seed")
        if after_dp["chatLength"] != before_dp["chatLength"]:
            raise SystemExit("dp ignored the stored draft-only landing")
        if after_dp["thinkInput"] or after_dp["hintVisible"]:
            raise SystemExit("dp did not consume the command and hide its hint")
        _clear_main_input(page)

        before_pa = _snapshot(page)
        requests_before_pa = len(model_requests)
        _enter_command(page, "/pa ", PA_SEED)
        try:
            page.wait_for_function(
                "count => (SillyTavern.getContext().chat || []).filter(msg => msg?.is_user).length > count",
                arg=before_pa["mainUserTurns"],
                timeout=180_000,
            )
        except PlaywrightTimeoutError as err:
            _fail_diagnostic(page, model_requests, console_errors, err)
        page.wait_for_timeout(500)
        after_pa = _snapshot(page)
        pa_requests = model_requests[requests_before_pa:]
        pa_payloads = [_body_text(body) for _, body in pa_requests]
        authored_pa = [payload for payload in pa_payloads if "<authored-conduct>" in payload]
        if len(authored_pa) != 1 or PA_SEED not in authored_pa[0]:
            raise SystemExit("pa did not make one seeded portray request")
        if f"/pa {PA_SEED}" in authored_pa[0]:
            raise SystemExit("pa command text leaked into the portray seed")
        if after_pa["mainUserTurns"] != before_pa["mainUserTurns"] + 1:
            raise SystemExit("pa did not send exactly one new main-chat input")
        if not after_pa["latestMainUser"].strip():
            raise SystemExit("pa sent an empty main-chat input")
        if after_pa["latestMainUser"].strip() == PA_SEED:
            raise SystemExit("pa sent the unperformed seed instead of the portray result")
        if after_pa["immediateSend"]:
            raise SystemExit("pa changed the stored landing setting")
        if after_pa["thinkInput"] or after_pa["hintVisible"]:
            raise SystemExit("pa did not consume the command and hide its hint")

        page.evaluate(
            """() => {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.stopGeneration === 'function') ctx.stopGeneration();
                else if (typeof window.stopGeneration === 'function') window.stopGeneration();
            }"""
        )
        page.wait_for_timeout(1000)
        browser.close()

    print(
        "ok: p drafted a seeded portray, dp completed one exchange then one "
        f"unseeded portray, and pa sent once without changing landing settings "
        f"for {CHARACTER} (model requests: {len(model_requests)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
