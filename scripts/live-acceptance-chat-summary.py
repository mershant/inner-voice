#!/usr/bin/env python3
"""Ticket #40 STD acceptance. A fact stated only in Chat must reach the summary path.

Default run mocks the summarizer. --summarize permits one real summarizer request.
Does not change the main model or preset.
"""
import argparse
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8001'
AUTH = '/home/opc/.local/share/openchamber/playwright/std-storage-state.json'
OUT = Path(__file__).resolve().parents[1] / '.playwright-mcp'
FACT = 'SILVERFIN-PASSWORD'


def ready(page):
    page.goto(URL, wait_until='domcontentloaded')
    if '/login' in page.url:
        page.get_by_role('listitem').filter(has_text='default-user').click()
        page.wait_for_url(lambda url: '/login' not in url)
    page.wait_for_selector('#send_textarea', timeout=60_000)
    page.wait_for_selector('#loader', state='detached', timeout=120_000)
    page.wait_for_selector('#iv-sess-trigger', state='attached', timeout=30_000)
    page.wait_for_timeout(1500)


def show(page):
    page.evaluate("""() => {
        document.getElementById('iv-changelog-modal')?.remove();
        const win = document.getElementById('iv-window');
        Object.assign(win.style, {display:'flex', left:'20px', top:'20px', width:'440px', height:'650px'});
    }""")


def picker(page):
    if not page.locator('#iv-sess-panel').evaluate("el => el.classList.contains('open')"):
        page.locator('#iv-sess-trigger').click()


def mode(page, value):
    picker(page)
    page.locator(f'.iv-page-btn[data-mode="{value}"]').click()


def inspect(page):
    page.locator('#iv-inspect-btn').click()
    page.wait_for_function("() => document.getElementById('iv-ctx-modal').style.display !== 'none' && document.getElementById('iv-ctx-json').textContent.trim().startsWith('[')")
    value = json.loads(page.locator('#iv-ctx-json').text_content())
    page.locator('#iv-modal-close').click()
    return '\n'.join(m['content'] for m in value)


def ask_chat(page, text):
    before = page.locator('#iv-messages .iv-msg-assistant').count()
    page.locator('#iv-input').fill(text)
    page.locator('#iv-send-btn').click()
    page.wait_for_function(
        "n => document.querySelectorAll('#iv-messages .iv-msg-assistant .iv-msg-content').length > n && [...document.querySelectorAll('#iv-messages .iv-msg-assistant .iv-msg-content')].at(-1).textContent.trim().length > 0",
        arg=before,
        timeout=240_000,
    )
    page.wait_for_function("() => !document.getElementById('iv-send-btn').disabled", timeout=240_000)


def payload_text(body):
    return json.dumps(body.get('messages', body.get('prompt', body)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--summarize', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    requests = []
    real = False
    report = {
        'url': URL,
        'install': 'inner-voice',
        'summaryception_install': 'Extension-Summaryception',
        'fact': FACT,
        'upstream_requests': 0,
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(storage_state=AUTH, viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def route_request(route):
            req = route.request
            if req.method != 'POST' or not re.search(r'/generate(?:$|\?)|/chat/completions(?:$|\?)', req.url):
                return route.continue_()
            body = req.post_data_json or {}
            text = payload_text(body)
            kind = 'summarizer' if 'passage_in_question' in text or '<passage_in_question>' in text else 'other'
            if FACT in text and kind != 'summarizer':
                kind = 'chat-or-main'
            requests.append({'real': real, 'kind': kind, 'url': req.url, 'model': body.get('model'), 'text': text})
            if real and kind == 'summarizer':
                report['upstream_requests'] += 1
                return route.continue_()
            if kind == 'summarizer':
                summary = f'They agreed the password is {FACT}.'
                report['mocked_summary'] = summary
                if body.get('stream'):
                    data = 'data: ' + json.dumps({'choices': [{'delta': {'content': summary}}]}) + '\n\ndata: [DONE]\n\n'
                    return route.fulfill(status=200, content_type='text/event-stream', body=data)
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': summary}}]}))
            reply = 'I will not forget it.'
            if body.get('stream'):
                data = 'data: ' + json.dumps({'choices': [{'delta': {'content': reply}}]}) + '\n\ndata: [DONE]\n\n'
                return route.fulfill(status=200, content_type='text/event-stream', body=data)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': reply}}]}))

        page.route('**/*', route_request)
        ready(page)
        iv_original = page.evaluate('() => structuredClone(SillyTavern.getContext().extensionSettings.inner_voice)')
        sc_original = page.evaluate('() => structuredClone(SillyTavern.getContext().extensionSettings.summaryception)')
        main_settings = page.evaluate('() => JSON.stringify(SillyTavern.getContext().chatCompletionSettings)')
        chat_name = 'inner-voice-chat-summary-' + str(int(time.time()))
        try:
            assert page.evaluate("() => typeof globalThis.innerVoiceChatSummarySource === 'function'")
            assert page.evaluate("() => !!SillyTavern.getContext().extensionSettings.summaryception")
            page.evaluate("""async name => {
                const c = SillyTavern.getContext();
                const id = c.characters.findIndex(x => x.name === 'Seraphina');
                if (id < 0) throw new Error('STD Seraphina fixture is missing');
                await c.selectCharacterById(id);
                await SillyTavern.getContext().openCharacterChat(name);
            }""", chat_name)
            page.wait_for_timeout(2000)
            show(page)
            page.evaluate("""async () => {
                const c = SillyTavern.getContext();
                const s = c.extensionSettings.summaryception;
                s.enabled = true;
                s.pauseSummarization = true;
                s.verbatimTurns = 0;
                s.disableGhosting = false;
                c.saveSettingsDebounced();
                c.chat.splice(0, c.chat.length,
                    {name:'Seraphina',is_user:false,mes:'You stop at a lamplit stall. Lamplighter is folding paper lanterns.'});
                await c.saveChat();
            }""")
            page.wait_for_timeout(1500)
            picker(page)
            page.locator('#iv-new-sess-btn').click()
            page.locator('.iv-dialog-input').fill('Lamplighter')
            page.locator('.iv-dialog-ok').click()
            page.wait_for_selector('.iv-dialog-overlay', state='detached')
            mode(page, 'chat')
            ask_chat(page, f'The password is {FACT}. Do not say it in the main scene.')
            assert FACT in page.locator('#iv-messages').inner_text()
            assert FACT not in page.evaluate("() => SillyTavern.getContext().chat.map(m => m.mes).join('\\n')")

            source = page.evaluate("""() => {
                const c = SillyTavern.getContext();
                const chatId = (typeof window.chat_file_name === 'string' && window.chat_file_name)
                    || (typeof c.getCurrentChatId === 'function' && c.getCurrentChatId())
                    || c.chatId;
                return globalThis.innerVoiceChatSummarySource({
                    chatId,
                    startIndex: 0,
                    endIndex: Math.max(0, (c.chat || []).length - 1),
                });
            }""")
            report['source'] = source
            assert source['status'] == 'ok', source
            source_text = json.dumps(source)
            assert FACT in source_text
            assert source_text.count(FACT) == 1

            page.evaluate("""() => {
                const c = SillyTavern.getContext();
                c.extensionSettings.summaryception.pauseSummarization = true;
                c.extensionSettings.summaryception.verbatimTurns = 0;
                c.saveSettingsDebounced();
            }""")
            page.wait_for_timeout(500)
            if args.summarize:
                real = True
            page.wait_for_function("() => !!document.getElementById('sc_force_summarize')")
            page.evaluate("() => document.getElementById('sc_force_summarize').click()")
            page.wait_for_function(
                "() => (SillyTavern.getContext().chatMetadata?.summaryception?.summarizedUpTo ?? -1) >= 0",
                timeout=240_000,
            )
            store = page.evaluate("() => SillyTavern.getContext().chatMetadata.summaryception")
            report['store'] = {
                'summarizedUpTo': store.get('summarizedUpTo'),
                'layer0': [sn.get('text') for sn in (store.get('layers') or [[]])[0]],
            }
            page.wait_for_timeout(1500)
            passage_requests = [r for r in requests if r['kind'] == 'summarizer' or FACT in r.get('text', '')]
            report['passage_present'] = any(FACT in r.get('text', '') for r in requests)
            assert report['passage_present'], 'summarizer passage must include the Chat-only fact'
            summary_text = ' '.join(report['store']['layer0'])
            report['summary'] = summary_text
            assert FACT in summary_text, {'summary': summary_text}

            ghosted = page.evaluate("() => !!(SillyTavern.getContext().chat[0]?.extra?.sc_ghosted || SillyTavern.getContext().chat[0]?.is_hidden)")
            report['anchor_ghosted'] = ghosted
            later_source = page.evaluate("""() => {
                const c = SillyTavern.getContext();
                const chatId = (typeof window.chat_file_name === 'string' && window.chat_file_name)
                    || (typeof c.getCurrentChatId === 'function' && c.getCurrentChatId())
                    || c.chatId;
                return globalThis.innerVoiceChatSummarySource({
                    chatId, startIndex: 0, endIndex: 0,
                });
            }""")
            assert FACT in json.dumps(later_source)

            iv_context = inspect(page)
            report['iv_context_has_fact'] = FACT in iv_context
            assert FACT in iv_context, 'IV later context must carry the summary fact'
            mode(page, 'chat')
            chat_context = inspect(page)
            report['chat_context_has_fact'] = FACT in chat_context
            assert FACT in chat_context, 'Chat later context must carry the summary fact'

            before = len(requests)
            page.evaluate("""async () => {
                const c = SillyTavern.getContext();
                await c.generate('quiet', {quiet_prompt:'Continue after the current scene.'});
            }""")
            assert len(requests) == before + 1
            main_text = requests[-1]['text']
            report['main_has_summary'] = FACT in main_text
            report['main_has_raw_chat_frame'] = 'scene-conversation' in main_text and FACT in main_text
            assert FACT in main_text, 'main-model later context must carry the summary fact'
            if ghosted:
                assert 'Continue after its last turn' not in main_text, 'raw Chat frame must be gone after the anchor leaves context'

            assert page.evaluate('() => JSON.stringify(SillyTavern.getContext().chatCompletionSettings)') == main_settings
            report['versions'] = page.evaluate("""() => ({
                innerVoice: document.querySelector('#extensions_settings2 .inner-voice-settings') ? 'present' : 'missing',
                summaryception: SillyTavern.getContext().extensionSettings.summaryception ? 'present' : 'missing',
                summaryceptionManifest: window.extension_settings ? undefined : undefined,
            })""")
            report['manifests'] = page.evaluate("""async () => {
                const names = ['inner-voice', 'Extension-Summaryception'];
                const out = {};
                for (const name of names) {
                    try {
                        const res = await fetch(`/scripts/extensions/third-party/${name}/manifest.json`);
                        out[name] = res.ok ? (await res.json()).version : res.status;
                    } catch (e) {
                        out[name] = String(e);
                    }
                }
                return out;
            }""")
        except Exception:
            page.screenshot(path=str(OUT / 'chat-summary-failure.png'))
            (OUT / 'chat-summary-failure.json').write_text(json.dumps({
                'url': page.url, 'errors': errors, 'request_count': len(requests),
                'body': page.locator('body').inner_text()[:4000],
            }, indent=2))
            raise
        finally:
            page.evaluate("""saved => {
                const c = SillyTavern.getContext(), s = c.extensionSettings.inner_voice;
                for (const key of Object.keys(s)) delete s[key];
                Object.assign(s, saved);
                c.saveSettingsDebounced();
            }""", iv_original)
            if sc_original is not None:
                page.evaluate("""saved => {
                    const c = SillyTavern.getContext();
                    c.extensionSettings.summaryception = saved;
                    c.saveSettingsDebounced();
                }""", sc_original)
            page.wait_for_timeout(1000)
        report['page_errors'] = errors
        report['request_count'] = len(requests)
        assert not errors, errors
        browser.close()
    filename = 'chat-summary-acceptance.json' if args.summarize else 'chat-summary-acceptance-no-model.json'
    (OUT / filename).write_text(json.dumps({k: v for k, v in report.items()}, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k not in ('source',)}, indent=2))


if __name__ == '__main__':
    main()
