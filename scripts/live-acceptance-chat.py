#!/usr/bin/env python3
"""Ticket #39 STD acceptance. --banter permits two real replies; --styles permits two more.

Uses a fresh test chat, never replaces an existing transcript. Captures model/message
fields only (not credentials). Main-chat preparation stops before provider dispatch.
"""
import argparse
import json
import re
import time
from contextlib import contextmanager
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8001'
AUTH = '/home/opc/.local/share/openchamber/playwright/std-storage-state.json'
OUT = Path(__file__).resolve().parents[1] / '.playwright-mcp'


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


def voice(page, name):
    picker(page)
    page.locator('.iv-sess-item').evaluate_all("(els,name) => els.find(el => el.dataset.ownerVoice === name).click()", name)


def mode(page, value):
    picker(page)
    page.locator(f'.iv-page-btn[data-mode="{value}"]').click()


def inspect(page):
    page.locator('#iv-inspect-btn').click()
    page.wait_for_function("() => document.getElementById('iv-ctx-modal').style.display !== 'none' && document.getElementById('iv-ctx-json').textContent.trim().startsWith('[')")
    value = json.loads(page.locator('#iv-ctx-json').text_content())
    page.locator('#iv-modal-close').click()
    return '\n'.join(m['content'] for m in value)


def ask(page, text):
    before = page.locator('#iv-messages .iv-msg-assistant').count()
    page.locator('#iv-input').fill(text)
    start = time.monotonic()
    page.locator('#iv-send-btn').click()
    page.wait_for_function("n => document.querySelectorAll('#iv-messages .iv-msg-assistant .iv-msg-content').length > n && [...document.querySelectorAll('#iv-messages .iv-msg-assistant .iv-msg-content')].at(-1).textContent.trim().length > 0", arg=before, timeout=240_000)
    first = time.monotonic() - start
    page.wait_for_function("() => !document.getElementById('iv-send-btn').disabled", timeout=240_000)
    return {'first_visible_seconds': round(first, 3), 'completion_seconds': round(time.monotonic() - start, 3),
            'reply': page.locator('#iv-messages .iv-msg-assistant .iv-msg-content').last.inner_text(),
            'emphasis_count': page.locator('#iv-messages .iv-msg-assistant .iv-msg-content').last.locator('em').count()}


def restore(page, settings):
    page.evaluate("""saved => {
        const c = SillyTavern.getContext(), s = c.extensionSettings.inner_voice;
        for (const key of Object.keys(s)) delete s[key];
        Object.assign(s, saved);
        c.saveSettingsDebounced();
    }""", settings)
    page.wait_for_timeout(1500)


@contextmanager
def saved_settings(page, without_summary=False):
    ready(page)
    original = page.evaluate('() => structuredClone(SillyTavern.getContext().extensionSettings.inner_voice)')
    summary = page.evaluate("() => SillyTavern.getContext().extensionSettings.summaryception?.enabled ?? null")
    try:
        if without_summary:
            page.evaluate("() => { const c=SillyTavern.getContext(); if(c.extensionSettings.summaryception) c.extensionSettings.summaryception.enabled=false; c.saveSettingsDebounced(); }")
            page.wait_for_timeout(1500)
        yield original
    finally:
        restore(page, original)
        if without_summary and summary is not None:
            page.evaluate("value => { const c=SillyTavern.getContext(); c.extensionSettings.summaryception.enabled=value; c.saveSettingsDebounced(); }", summary)
            page.wait_for_timeout(1500)


def check_pages(page, report, requests, original):
    # Fresh test chat under an existing STD character, without touching another chat's contents.
    chat_name = 'inner-voice-chat-acceptance-' + str(int(time.time()))
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
        c.chat.splice(0, c.chat.length,
            {name:'Seraphina',is_user:false,mes:'You stop at a lamplit market stall. Lamplighter, the dry-witted keeper, is folding paper lanterns. A blue lantern costs three copper coins.'});
        await c.saveChat();
    }""")
    picker(page)
    page.locator('#iv-new-sess-btn').click()
    page.locator('.iv-dialog-input').fill('Lamplighter')
    page.locator('.iv-dialog-ok').click()
    page.wait_for_selector('.iv-dialog-overlay', state='detached')
    assert 'Lamplighter' in page.locator('#iv-sess-name').inner_text()
    assert not page.evaluate("() => SillyTavern.getContext().characters.some(c => c.name === 'Lamplighter')")
    mode(page, 'chat')
    assert not page.locator('#iv-portray-btn').is_visible()
    # Existing settings bindings, not a second setting store. Restore before real banter.
    page.locator('#iv-chat-sysprompt').evaluate("el => { el.value='You are {{voice}} speaking to {{user}}. CHAT-SYSTEM-ONLY'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
    page.locator('#iv-chat-post-history-text').evaluate("el => { el.value='CHAT-POST-ONLY {{voice}} to {{user}}'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
    ask(page, 'FIRST-CHAT-CHECK')
    first_reply_text = page.locator('#iv-messages .iv-msg-assistant .iv-msg-content').last.inner_text()
    assert '<scene-now />' in first_reply_text and 'get_chat_stats' in first_reply_text, 'Chat code and command-like text must remain conversation, not IV controls'
    assert page.locator('#iv-messages .iv-tool-call-item, #iv-messages .iv-lb-proposal-card').count() == 0
    mode(page, 'iv')
    assert 'FIRST-CHAT-CHECK' not in page.locator('#iv-messages').inner_text()
    ask(page, 'NPC-PRIVATE-CHECK')
    mode(page, 'chat')
    assert 'NPC-PRIVATE-CHECK' not in page.locator('#iv-messages').inner_text()
    voice(page, '{{user}}')
    self_context = inspect(page)
    assert 'FIRST-CHAT-CHECK' in self_context and 'NPC-PRIVATE-CHECK' not in self_context
    ask(page, 'SELF-PRIVATE-CHECK')
    voice(page, 'Lamplighter')
    mode(page, 'chat')
    ask(page, 'p LAST-CHAT-CHECK')
    assert len(requests) == 4, 'Chat must not dispatch Portray or recap'
    text = inspect(page)
    assert text.index('FIRST-CHAT-CHECK') < text.index('NPC-PRIVATE-CHECK') < text.index('LAST-CHAT-CHECK')
    assert 'SELF-PRIVATE-CHECK' not in text
    assert text.count('FIRST-CHAT-CHECK') == 1
    assert text.count('LAST-CHAT-CHECK') == 1
    first_payload = json.dumps(requests[0]['messages'])
    assert 'CHAT-SYSTEM-ONLY' in first_payload and 'CHAT-POST-ONLY Lamplighter' in first_payload
    assert '{{voice}}' not in first_payload and '{{user}}' not in first_payload
    assert '<modules>' not in first_payload
    assert first_payload.count('FIRST-CHAT-CHECK') == 1
    assert page.evaluate("() => document.getElementById('iv-sp-chat-sysprompt').value.includes('CHAT-SYSTEM-ONLY')")
    page.locator('#iv-messages .iv-hide-toggle').last.click()
    assert 'FIRST-CHAT-CHECK' not in inspect(page)
    mode(page, 'iv')
    assert 'NPC-PRIVATE-CHECK' in inspect(page)
    mode(page, 'chat')
    page.locator('#iv-messages .iv-hide-toggle').last.click()
    page.wait_for_timeout(1800)
    ready(page)
    page.evaluate("""async name => {
        const c = SillyTavern.getContext();
        await c.selectCharacterById(c.characters.findIndex(x => x.name === 'Seraphina'));
        await SillyTavern.getContext().openCharacterChat(name);
    }""", chat_name)
    page.wait_for_timeout(2000)
    show(page)
    voice(page, 'Lamplighter')
    assert 'FIRST-CHAT-CHECK' in page.locator('#iv-messages').inner_text()
    assert 'NPC-PRIVATE-CHECK' not in page.locator('#iv-messages').inner_text()
    picker(page)
    page.screenshot(path=str(OUT / 'chat-desktop.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("() => Object.assign(document.getElementById('iv-window').style,{left:'4px',top:'8px',width:'382px',height:'800px'})")
    page.screenshot(path=str(OUT / 'chat-narrow.png'))
    assert page.evaluate("() => getComputedStyle(document.querySelector('.iv-sess-wrap')).flexBasis") != '100%'
    page.locator('#iv-sess-trigger').click()
    report['mock_checks'] = 'creation, pages, persistence, identity, prompts, ordered shared context, persona consultation, hide, Chat command isolation'
    report['mock_requests'] = len(requests)
    report['chat_name'] = chat_name
    # Ordinary host preparation, with network replies mocked. `quiet` uses the
    # same token selection without adding a visible main-chat message.
    for case in ['visible', 'hidden', 'omitted']:
        print('Host context check: ' + case, flush=True)
        before = len(requests)
        page.evaluate("""async kind => {
            const c = SillyTavern.getContext(), saved = structuredClone(c.chat);
            const limits = {openai_max_context:c.chatCompletionSettings.openai_max_context, openai_max_tokens:c.chatCompletionSettings.openai_max_tokens};
            try {
                if (kind === 'hidden') c.chat[0].is_system = true;
                if (kind === 'omitted') {
                    c.chatCompletionSettings.openai_max_context = 65536;
                    c.chatCompletionSettings.openai_max_tokens = 128;
                    c.chat[0].mes = 'old-anchor-context '.repeat(50000);
                    c.chat.push({name:'Seraphina',is_user:false,mes:'LATEST-ANCHOR-KEPT: Evening arrives.'});
                }
                await c.generate('quiet', {quiet_prompt:'Continue after the current scene.'});
            } finally {
                c.chat.splice(0,c.chat.length,...saved);
                Object.assign(c.chatCompletionSettings,limits);
            }
        }""", case)
        assert len(requests) == before + 1, f'one mocked main request required: {case}'
        text = json.dumps(requests[-1]['messages'])
        (OUT / f'chat-host-{case}.json').write_text(json.dumps(requests[-1], indent=2))
        if case == 'visible':
            ordered = ['FIRST-CHAT-CHECK', 'NPC-PRIVATE-CHECK', 'SELF-PRIVATE-CHECK', 'LAST-CHAT-CHECK']
            assert all(text.count(t) == 1 for t in ordered)
            assert [text.index(t) for t in ordered] == sorted(text.index(t) for t in ordered)
            assert 'Continue after its last turn' in text
        else:
            assert 'FIRST-CHAT-CHECK' not in text and 'LAST-CHAT-CHECK' not in text
            if case == 'omitted':
                assert 'LATEST-ANCHOR-KEPT' in text and 'old-anchor-context' not in text, {'latest': 'LATEST-ANCHOR-KEPT' in text, 'old': 'old-anchor-context' in text, 'prompt_chars': len(text)}
    report['host_checks'] = 'ordinary quiet-generation preparation: ordered injection, hidden anchor, actual token-omitted anchor; three mocked responses, no upstream generation; omission test temporarily uses 65536 context / 128 output, restored before banter'
    # Operations on Chat preserve both private pages, even when interleaved.
    mode(page, 'iv')
    mode(page, 'chat')
    first_reply = page.locator('#iv-messages .iv-msg-assistant').first
    first_reply.hover()
    first_reply.locator('[title="Regen"]').click()
    with page.expect_request(lambda req: req.method == 'POST' and bool(re.search(r'/generate(?:$|\?)|/chat/completions(?:$|\?)', req.url))):
        page.locator('.iv-dialog-ok').click()
    page.wait_for_function("() => !document.getElementById('iv-send-btn').disabled")
    first_reply.hover()
    first_reply.locator('[title="Edit"]').click()
    first_reply.locator('.iv-edit-ta').fill('EDITED-CHAT-REPLY')
    first_reply.locator('.iv-edit-save').click()
    assert 'EDITED-CHAT-REPLY' in inspect(page)
    with page.expect_request(lambda req: req.method == 'POST' and bool(re.search(r'/generate(?:$|\?)|/chat/completions(?:$|\?)', req.url))):
        page.locator('#iv-regen-btn').click()
    page.wait_for_function("() => !document.getElementById('iv-send-btn').disabled")
    assert json.dumps(requests[-1]['messages']).count('FIRST-CHAT-CHECK') == 1, 'toolbar resend must not duplicate the saved user turn'
    # Advancing the main chat closes the checkpoint, including Edit's resend path.
    before_closed = len(requests)
    page.evaluate("() => SillyTavern.getContext().chat.push({name:'Seraphina',is_user:false,mes:'A new moment.'})")
    mode(page, 'iv')
    mode(page, 'chat')
    page.locator('#iv-messages .iv-msg-user').first.hover()
    page.locator('#iv-messages .iv-msg-user').first.locator('[title="Edit"]').click()
    assert page.locator('.iv-edit-save').inner_text().strip() == 'Save'
    page.locator('.iv-edit-save').click()
    page.locator('#iv-regen-btn').click()
    page.wait_for_timeout(300)
    assert len(requests) == before_closed, 'closed checkpoint cannot be extended'
    page.evaluate('() => SillyTavern.getContext().chat.pop()')
    mode(page, 'iv')
    mode(page, 'chat')
    page.locator('#iv-messages .iv-msg-user').first.hover()
    page.locator('#iv-messages .iv-msg-user').first.locator('[title="Delete"]').click()
    page.locator('.iv-dialog-ok').click()
    page.wait_for_function("() => document.querySelectorAll('#iv-messages .iv-msg').length === 0")
    mode(page, 'iv')
    assert 'NPC-PRIVATE-CHECK' in page.locator('#iv-messages').inner_text()
    voice(page, '{{user}}')
    assert 'SELF-PRIVATE-CHECK' in page.locator('#iv-messages').inner_text()
    voice(page, 'Lamplighter')
    mode(page, 'chat')
    report['message_operations'] = 'Chat regenerate, edit, delete, and toolbar resend preserve private pages; no duplicate resend; closed checkpoint cannot regrow'
    restore(page, original)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--banter', action='store_true')
    parser.add_argument('--styles', action='store_true')
    parser.add_argument('--without-summaryception', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    requests = []
    real = False
    report = {'url': URL, 'install': 'inner-voice', 'upstream_requests': 0}
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
            body = req.post_data_json
            requests.append({'real': real, 'model': body.get('model'), 'stream': body.get('stream'),
                             'reasoning_effort': body.get('reasoning_effort'), 'messages': body.get('messages', body.get('prompt'))})
            if real:
                report['upstream_requests'] += 1
                return route.continue_()
            text = 'Mock reply for interface checks.'
            if len(requests) == 1:
                text += '\n\n<scene-now />\n\n```tool_call\n{"name":"get_chat_stats","input":{}}\n```'
            if body.get('stream'):
                data = 'data: ' + json.dumps({'choices': [{'delta': {'content': text}}]}) + '\n\ndata: [DONE]\n\n'
                return route.fulfill(status=200, content_type='text/event-stream', body=data)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': text}}]}))

        page.route('**/*', route_request)
        with saved_settings(page, args.without_summaryception) as original:
            report['connection'] = page.evaluate("""() => {
            const c = SillyTavern.getContext(), s = c.extensionSettings.inner_voice;
            return {source:s.connectionSource, profile:s.connectionProfileId, reasoning:s.reasoningLevel,
                maxTokens:s.maxTokens, streaming:s.forceStreaming, contextDepth:s.contextDepth,
                summaryception: !!c.extensionSettings.summaryception?.enabled};
            }""")
            main_settings = page.evaluate('() => JSON.stringify(SillyTavern.getContext().chatCompletionSettings)')
            try:
                check_pages(page, report, requests, original)
            except Exception:
                page.screenshot(path=str(OUT / 'chat-failure.png'))
                (OUT / 'chat-failure.json').write_text(json.dumps({'url':page.url,'errors':errors,'request_count':len(requests),'body':page.locator('body').inner_text()}, indent=2))
                raise
            if args.banter:
                real = True
                print('Ordinary Chat banter: two real replies with unchanged connection settings', flush=True)
                report['banter'] = [ask(page, 'How much for the blue lantern?'), ask(page, 'Three copper? Does it come with a tiny sun?')]
                assert report['upstream_requests'] == 2
                report['banter_models'] = [r['model'] for r in requests if r['real']]
            if args.styles:
                real = True
                report['styles'] = []
                for label, instruction, question in [
                    ('dialogue-only', 'You are {{voice}}, talking with {{user}} in the present scene. Your reply is the words you say aloud to them, in plain text. The supplied scene is the life you are in. Give your next spoken turn.', 'Are all these lanterns made by hand?'),
                    ('asterisk actions', 'You are {{voice}}, talking with {{user}} in the present scene. Write your dialogue in plain text and your physical actions between asterisks. Your next turn includes what you say and how you move while speaking. The supplied scene is the life you are in.', 'Could you hold up the blue one so I can see the pattern?'),
                ]:
                    page.locator('#iv-chat-sysprompt').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}", instruction)
                    result = ask(page, question)
                    report['styles'].append({'style':label, **result})
                    assert result['emphasis_count'] == 0 if label == 'dialogue-only' else result['emphasis_count'] > 0
                assert report['upstream_requests'] == (2 if args.banter else 0) + 2
            report['mock_requests_total'] = sum(not r['real'] for r in requests)
            assert page.evaluate('() => JSON.stringify(SillyTavern.getContext().chatCompletionSettings)') == main_settings
        report['requests'] = requests
        report['page_errors'] = errors
        assert not errors, errors
        browser.close()
    filename = 'chat-acceptance.json' if args.banter or args.styles else 'chat-acceptance-no-model.json'
    (OUT / filename).write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k != 'requests'}, indent=2))


if __name__ == '__main__':
    main()
