import { I, EXT_DISPLAY, THEME_PRESETS, WIN_ID } from '../constants.js';
import { state } from '../state.js';
import { getSettings, saveSettings, getConversation, saveConversation, deleteMsg, truncateAfter, truncateFrom, expandMacros, getEffectiveSettings, getBindingKey, initConversation, getVisibleTurns } from '../conversation.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { escHtml, autoResize, showCustomDialog, copyText } from '../utils/util-dom.js';
import { getCharInfo } from '../utils/util-st.js';

import { normalizeCharNamesInBlock } from '../utils/util-text.js';
import { stripMemoryBlock } from '../features/feature-memory.js';
import { parseToolCallsFromText } from '../features/feature-tools-engine.js';
import { postProcessToolCalls } from '../features/feature-tools-ui.js';

let apiMod = null;
import('../api.js').then(m => apiMod = m);
let uiWinMod = null;
import('./ui-window.js').then(m => uiWinMod = m);
let uiWdgMod = null;
import('./ui-widgets.js').then(m => uiWdgMod = m);
let uiSetMod = null;
import('./ui-settings.js').then(m => uiSetMod = m);

// ─── Text Render and Markdown ────────────────────────────────────────────────

export function renderMarkdown(text) {
    const codeBlocks = [];
    let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        if (lang && lang.toLowerCase() === 'html') {
            const id = `iv-hb-${state.htmlBlockCounter++}`;
            state.htmlBlockRegistry.set(id, code.trim());
            return `\x00H${id}\x00`;
        }
        const i = codeBlocks.length;
        const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(`<pre class="iv-code-block${lang ? ` lang-${lang}` : ''}"><code>${escaped}</code></pre>`);
        return `\x00B${i}\x00`;
    });

    out = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/`([^`\n]+)`/g, '<code class="iv-inline-code">$1</code>');

    const applyInline = (s) => {
        let res = s;
        res = res.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        res = res.replace(/~~(.+?)~~/g, '<del>$1</del>');
        res = res.replace(/\*([^<>\*\n]+)\*/g, '<em>$1</em>');
        return res;
    };

    const lines = out.split('\n');

    const getULIndent = (l) => { const m = l.match(/^(\s*)[*\-+]\s+\S/); return m ? m[1].length : -1; };
    const getOLIndent = (l) => { const m = l.match(/^(\s*)\d+\.\s+\S/); return m ? m[1].length : -1; };
    const isListLine = (l) => getULIndent(l) >= 0 || getOLIndent(l) >= 0;

    const buildNestedList = (listLines) => {
        const stack = [];
        let r = '';
        const closeUntil = (targetIndent, targetType) => {
            while (stack.length) {
                const top = stack[stack.length - 1];
                if (top.indent > targetIndent || (top.indent === targetIndent && top.type !== targetType)) {
                    r += `</li></${top.type}>`;
                    stack.pop();
                } else {
                    break;
                }
            }
        };
        for (let line of listLines) {
            if (!line.trim()) continue;
            if (!isListLine(line)) {
                r += `<br>${applyInline(line.trim())}`;
                continue;
            }
            const ulI = getULIndent(line);
            const olI = getOLIndent(line);
            const indent = ulI >= 0 ? ulI : olI;
            const type = ulI >= 0 ? 'ul' : 'ol';
            const cls = `iv-list${type === 'ol' ? ' iv-list-ol' : ''}`;
            
            let content = type === 'ul'
                ? line.replace(/^\s*[*\-+]\s+/, '')
                : line.replace(/^\s*\d+\.\s+/, '');
            
            content = applyInline(content);
            closeUntil(indent, type);
            
            if (stack.length && stack[stack.length - 1].indent === indent && stack[stack.length - 1].type === type) {
                r += `</li><li>${content}`;
            } else {
                r += `<${type} class="${cls}"><li>${content}`;
                stack.push({ indent, type });
            }
        }
        while (stack.length) r += `</li></${stack.pop().type}>`;
        return r;
    };

    const segs = [];
    const pushBlock = (h) => segs.push({ t: 'block', h });
    const pushInline = (h) => segs.push({ t: 'inline', h });

    let listBuf = [];
    let tableRows = [];
    let bqLines = [];

    const flushList = () => {
        if (!listBuf.length) return;
        pushBlock(buildNestedList(listBuf));
        listBuf = [];
    };
    const flushTable = () => {
        if (!tableRows.length) return;
        pushBlock(`<div class="iv-table-wrap"><table class="iv-table"><tbody>${tableRows.join('')}</tbody></table></div>`);
        tableRows = [];
    };
    const flushBq = () => {
        if (!bqLines.length) return;
        pushBlock(`<blockquote class="iv-blockquote">${bqLines.join('<br>')}</blockquote>`);
        bqLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimLine = line.trim();

        if (/^(---+|\*\*\*+|___+)$/.test(trimLine)) {
            flushList(); flushTable(); flushBq();
            pushBlock('<hr class="iv-hr">');
            continue;
        }

        const hm = line.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
            flushList(); flushTable(); flushBq();
            pushBlock(`<span class="iv-h${hm[1].length}">${applyInline(hm[2])}</span>`);
            continue;
        }

        const bq = line.match(/^&gt;\s*(.*)/);
        if (bq) { flushList(); flushTable(); bqLines.push(applyInline(bq[1])); continue; }

        const tm = trimLine.match(/^\|(.*)\|$/);
        if (tm) {
            flushList(); flushBq();
            if (/^[|\s\-:]+$/.test(trimLine)) continue;
            const cells = tm[1].split('|').map(c => applyInline(c.trim()));
            const tag = tableRows.length === 0 ? 'th' : 'td';
            tableRows.push(`<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`);
            continue;
        }

        if (isListLine(line)) {
            flushTable(); flushBq();
            listBuf.push(line);
            continue;
        }

        if (listBuf.length > 0 && trimLine && /^\s+/.test(line)) {
            listBuf.push(line);
            continue;
        }

        if (!trimLine) {
            let nextNonEmpty = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim()) { nextNonEmpty = lines[j]; break; }
            }
            if (nextNonEmpty && isListLine(nextNonEmpty)) {
                listBuf.push('');
            } else {
                flushList(); flushTable(); flushBq();
                pushInline('');
            }
            continue;
        }

        flushList(); flushTable(); flushBq();
        pushInline(applyInline(line));
    }
    flushList(); flushTable(); flushBq();

    let result = '';
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.t === 'inline' && i > 0 && segs[i - 1].t === 'inline') result += '<br>';
        result += seg.h;
    }
    out = result;

    out = out.replace(/\x00H(iv-hb-\d+)\x00/g, (_, id) => `<div class="iv-html-block-ph" data-hbid="${id}"></div>`);
    out = out.replace(/\x00B(\d+)\x00/g, (_, i) => codeBlocks[+i]);
    out = out.replace(/\x00TC_(\d+)\x00/g, (_, i) => `<div class="iv-tool-call-ph" data-tcid="${i}"></div>`);
    out = out.replace(/(<div class="iv-tool-call-ph"[^>]*><\/div>)(?:<br>|\s)*/g, '$1');

    return out;
}

export function prepareHtmlForIframe(code) {
    const cs = `<script>(function(){
function isTransparent(c){return !c||c==='transparent'||c==='rgba(0, 0, 0, 0)'||c==='rgba(0,0,0,0)';}
function hasVisualBg(el){
if(!el) return false;
var cs=window.getComputedStyle(el);
if(!isTransparent(cs.backgroundColor)) return true;
if(cs.backgroundImage&&cs.backgroundImage!=='none') return true;
return false;
}
function applyFallbackTheme(){
var b=document.body,d=document.documentElement;
var hasBg=false;
if(hasVisualBg(d)||hasVisualBg(b)) hasBg=true;
if(!hasBg){
    var styled=document.querySelectorAll('[style]');
    for(var i=0;i<styled.length;i++){if(hasVisualBg(styled[i])){hasBg=true;break;}}
}
if(!hasBg){
    var styleText='';
    var styleEls=document.querySelectorAll('style');
    for(var j=0;j<styleEls.length;j++) styleText+=styleEls[j].textContent;
    if(/(?:body|html|:root)\s*\{[^}]*background/i.test(styleText)) hasBg=true;
}
if(!hasBg){
    b.style.backgroundColor='#ffffff';
    b.style.color='#1a1a1a';
    window.parent.postMessage({type:'iv-iframe-bg',hasBg:false},'*');
} else {
    window.parent.postMessage({type:'iv-iframe-bg',hasBg:true},'*');
}
}
function sh(){var b=document.body,d=document.documentElement;var h=Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0,d.scrollHeight,d.offsetHeight);window.parent.postMessage({type:'iv-iframe-h',h:h},'*');}
window.addEventListener('load',function(){
applyFallbackTheme();
sh();setTimeout(sh,150);setTimeout(sh,500);
if(window.ResizeObserver&&document.body){new ResizeObserver(sh).observe(document.body);}
else{var t;try{new MutationObserver(function(){clearTimeout(t);t=setTimeout(sh,80);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});}catch(e){}}
});
window.onerror=function(m){window.parent.postMessage({type:'iv-iframe-err',msg:String(m)},'*');return true;};
})();<\/script>`;
    const hasHtml = /<html[\s>]/i.test(code);
    if (hasHtml) {
        return /<\/body>/i.test(code) ? code.replace(/<\/body>/i, cs + '</body>') : code + cs;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;padding:8px;font-family:system-ui,sans-serif;background:transparent}</style></head><body>${code}${cs}</body></html>`;
}

export function createHTMLBlockEl(code) {
    const wrap = document.createElement('div');
    wrap.className = 'iv-html-block';

    const toolbar = document.createElement('div');
    toolbar.className = 'iv-html-block-toolbar';
    const label = document.createElement('span');
    label.className = 'iv-html-block-label';
    label.textContent = 'HTML';
    const previewBtn = document.createElement('button');
    previewBtn.className = 'iv-html-block-btn active';
    previewBtn.textContent = 'Preview';
    const codeBtn = document.createElement('button');
    codeBtn.className = 'iv-html-block-btn';
    codeBtn.textContent = 'Code';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'iv-html-block-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', e => { e.stopPropagation(); copyText(code); });
    toolbar.append(label, previewBtn, codeBtn, copyBtn);

    const errorEl = document.createElement('div');
    errorEl.className = 'iv-html-block-error';
    errorEl.style.display = 'none';

    const iframe = document.createElement('iframe');
    iframe.className = 'iv-html-block-iframe';
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock allow-downloads');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = prepareHtmlForIframe(code);

    const codePre = document.createElement('pre');
    codePre.className = 'iv-code-block iv-html-block-code';
    codePre.style.display = 'none';
    codePre.textContent = code;

    previewBtn.addEventListener('click', () => {
        iframe.style.display = '';
        codePre.style.display = 'none';
        previewBtn.classList.add('active');
        codeBtn.classList.remove('active');
    });
    codeBtn.addEventListener('click', () => {
        iframe.style.display = 'none';
        codePre.style.display = '';
        codeBtn.classList.add('active');
        previewBtn.classList.remove('active');
    });

    wrap.append(toolbar, errorEl, iframe, codePre);
    return wrap;
}

export function postProcessHTMLBlocks(el) {
    el.querySelectorAll('.iv-html-block-ph').forEach(ph => {
        const code = state.htmlBlockRegistry.get(ph.dataset.hbid);
        if (code !== undefined) ph.replaceWith(createHTMLBlockEl(code));
    });
}

export function getDisplayContent(rawText, settings) {
    let text = rawText;
    const trimLines = (settings.reasoningTrimStrings || '').split('\n').map(s => s.trim()).filter(Boolean);
    for (const ts of trimLines) text = text.split(ts).join('');
    
    const pats = [/<think>([\s\S]*?)<\/think>/i, /<thinking>([\s\S]*?)<\/thinking>/i];
    let reasoning = null;
    for (const p of pats) {
        const m = text.match(p);
        if (m) { reasoning = m[1].trim() || null; text = text.replace(m[0], '').trim(); break; }
    }
    return { reasoning, content: text };
}

export function extractToolCallPlaceholders(text, startIndex = 0) {
    let tcIndex = startIndex;
    let result = text;
    
    result = result.replace(/```tool_call\n?([\s\S]*?)```/gi, (match, inner) => {
        const blockTcs = parseToolCallsFromText(`\`\`\`tool_call\n${inner}\n\`\`\``);
        let phs = '';
        const count = Math.max(1, blockTcs.length);
        for (let i = 0; i < count; i++) {
            phs += `\x00TC_${tcIndex++}\x00`;
        }
        return phs;
    });
    
    result = result.replace(/```tool_call\n?([\s\S]*)$/gi, (match, inner) => {
        const blockTcs = parseToolCallsFromText(`\`\`\`tool_call\n${inner}\n\`\`\``);
        let phs = '';
        const count = Math.max(1, blockTcs.length);
        for (let i = 0; i < count; i++) {
            phs += `\x00TC_${tcIndex++}\x00`;
        }
        return phs;
    });
    
    return { text: result, nextIndex: tcIndex };
}

// ─── Rendering messages ──────────────────────────────────────────────────────

export function _renderMsgBodyContent(msgEl, msg) {
    const settings = getSettings();
    msgEl.querySelectorAll('.iv-tool-call-item').forEach(c => c.remove());

    const cleanContent = stripMemoryBlock(msg.content);
    let displayText = cleanContent;
    let reasoning = msg.reasoning !== undefined ? (msg.reasoning || null) : null;

    let tcIndex = 0;
    if (reasoning) {
        const resR = extractToolCallPlaceholders(reasoning, tcIndex);
        reasoning = resR.text;
        tcIndex = resR.nextIndex;
    }
    
    const resC = extractToolCallPlaceholders(displayText, tcIndex);
    displayText = resC.text;
    tcIndex = resC.nextIndex;

    if (msg.reasoning === undefined || msg.reasoning === null) {
        const d = getDisplayContent(displayText, settings);
        reasoning = d.reasoning;
        displayText = d.content;
        if (msg.reasoning === undefined) msg.reasoning = reasoning;
    }

    const body = msgEl.querySelector('.iv-msg-body');
    if (!body) return;


    let rBlock = msgEl.querySelector('.iv-reasoning-block');
    if (reasoning) {
        if (!rBlock) {
            rBlock = document.createElement('details');
            rBlock.className = 'iv-reasoning-block';
            rBlock.innerHTML = `<summary class="iv-reasoning-summary">Reasoning</summary><div class="iv-reasoning-content"></div>`;
            body.insertBefore(rBlock, body.firstChild);
        }
        rBlock.style.display = '';
        rBlock.querySelector('.iv-reasoning-content').innerHTML = renderMarkdown(reasoning);
        postProcessHTMLBlocks(rBlock.querySelector('.iv-reasoning-content'));
    } else if (rBlock) {
        rBlock.remove();
    }

    const contentEl = msgEl.querySelector('.iv-msg-content');

    if (contentEl) {
        contentEl.innerHTML = renderMarkdown(getDisplayContent(displayText, settings).content);
        postProcessHTMLBlocks(contentEl);
    }

    _updateMsgTokenCount(msgEl, msg.content, true);

    let liveTCs = msg.toolCalls || [];
    if (!liveTCs.length && tcIndex > 0) {
        liveTCs = parseToolCallsFromText((msg.reasoning || '') + '\n' + msg.content).map((tc, i) => ({
            id: `past_${i}`, name: tc.name, input: tc.input, status: 'done', result: 'Result hidden/expired'
        }));
    }
    if (liveTCs.length) {
        postProcessToolCalls(msgEl, liveTCs);
    }
}

export function _updateMsgTokenCount(msgEl, content, forceRecalc = false) {
    const el = msgEl.querySelector ? msgEl.querySelector('.iv-msg-token-count') : null;
    if (!el) return;
    if (!forceRecalc) {
        const cached = state.tokenCountCache.get(content);
        if (cached !== undefined) { el.textContent = `${cached}t`; return; }
    } else {
        el.textContent = '\u2026';
    }
    if (apiMod) {
        apiMod.estimateTokens(content).then(n => {
            state.tokenCountCache.set(content, n);
            if (el.isConnected) el.textContent = `${n}t`;
        });
    }
}

export function createMsgEl(msg, onCopy, onEdit, onDelete, onRegen) {
    const isUser = msg.role === 'user';
    const wrap = document.createElement('div');
    wrap.className = `iv-msg ${isUser ? 'iv-msg-user' : 'iv-msg-assistant'}`;
    wrap.dataset.id = msg.id;

    const avatarWrap = document.createElement('div');
    avatarWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0';

    const avatar = document.createElement('div');
    avatar.className = 'iv-msg-avatar';
    avatar.innerHTML = isUser ? I.user : I.bot;

    const tokenCountEl = document.createElement('div');
    tokenCountEl.className = 'iv-msg-token-count';
    tokenCountEl.textContent = '…';
    _updateMsgTokenCount({ querySelector: () => tokenCountEl, isConnected: true }, msg.content);

    avatarWrap.appendChild(avatar);
    avatarWrap.appendChild(tokenCountEl);

    const body = document.createElement('div');
    body.className = 'iv-msg-body';

    const content = document.createElement('div');
    content.className = 'iv-msg-content';
    body.appendChild(content);

    const meta = document.createElement('div');
    meta.className = 'iv-msg-meta';
    meta.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const actions = document.createElement('div');
    actions.className = 'iv-msg-actions';

    const makeBtn = (icon, label, cls, cb) => {
        const b = document.createElement('button');
        b.className = `iv-msg-btn${cls ? ' ' + cls : ''}`;
        b.innerHTML = icon; b.title = label;
        b.addEventListener('click', cb);
        return b;
    };

    actions.appendChild(makeBtn(I.copy, 'Copy', '', () => onCopy(msg)));
    actions.appendChild(makeBtn(I.edit, 'Edit', '', () => onEdit(wrap, msg)));
    actions.appendChild(makeBtn(I.refresh, 'Regen', '', () => onRegen(wrap, msg)));
    actions.appendChild(makeBtn(I.trash, 'Delete', 'iv-msg-btn-danger', () => onDelete(wrap, msg)));

    if (!isUser) {
        const continueBtn = makeBtn(I.continueArrow, 'Continue response', 'iv-msg-btn-continue', () => {
            if (apiMod) apiMod.runContinue(getConversation(), msg.id);
        });
        actions.appendChild(continueBtn);
    }

    body.appendChild(actions); body.appendChild(meta);

    if (!isUser) {
        const swipeBar = document.createElement('div');
        swipeBar.className = 'iv-swipe-bar';
        swipeBar.style.display = 'none';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'iv-swipe-btn iv-swipe-prev';
        prevBtn.innerHTML = I.chevronLeft;
        prevBtn.title = 'Previous swipe';
        prevBtn.disabled = true;

        const counter = document.createElement('span');
        counter.className = 'iv-swipe-counter';

        const nextBtn = document.createElement('button');
        nextBtn.className = 'iv-swipe-btn iv-swipe-next';
        nextBtn.innerHTML = I.chevronRight;
        nextBtn.title = 'New swipe (regenerate)';

        prevBtn.addEventListener('click', async () => {
            if (prevBtn.disabled || state.generating) return;
            const conversation = getConversation();
            if (!getSwipesForMsg(conversation, msg.id)) return;
            
            const bdy = wrap.querySelector('.iv-msg-body');
            if (bdy) {
                bdy.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
                bdy.classList.add('iv-swipe-anim-out-right'); 
                await new Promise(r => setTimeout(r, 150));
            }
            
            if (navigateSwipe(conversation, msg.id, -1)) {
                if (bdy) {
                    bdy.classList.remove('iv-swipe-anim-out-right');
                    void bdy.offsetWidth;
                    bdy.classList.add('iv-swipe-anim-left'); 
                }
                _renderMsgBodyContent(wrap, conversation.messages.find(m => m.id === msg.id));
                updateSwipeBar(wrap, conversation, msg.id);
            }
        });

        nextBtn.addEventListener('click', async () => {
            if (nextBtn.disabled || state.generating) return;
            const conversation = getConversation();
            const msgData = conversation.messages.find(m => m.id === msg.id);
            if (!msgData) return;
            
            if (msgData.swipeIndex !== undefined && msgData.swipeIndex < (msgData.swipes?.length || 1) - 1) {
                const bdy = wrap.querySelector('.iv-msg-body');
                if (bdy) {
                    bdy.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
                    bdy.classList.add('iv-swipe-anim-out-left'); 
                    await new Promise(r => setTimeout(r, 150));
                }

                if (navigateSwipe(conversation, msg.id, 1)) {
                    if (bdy) {
                        bdy.classList.remove('iv-swipe-anim-out-left');
                        void bdy.offsetWidth;
                        bdy.classList.add('iv-swipe-anim-right'); 
                    }
                    _renderMsgBodyContent(wrap, conversation.messages.find(m => m.id === msg.id));
                    updateSwipeBar(wrap, conversation, msg.id);
                }
            } else {
                _dbgAdd('SWIPE_REGEN_TRIGGERED', { msgId: msg.id });
                _runSwipeRegen(conversation, msg.id, wrap);
            }
        });

        swipeBar.appendChild(prevBtn);
        swipeBar.appendChild(counter);
        swipeBar.appendChild(nextBtn);
        body.appendChild(swipeBar);
    }

    wrap.appendChild(avatarWrap); wrap.appendChild(body);
    _renderMsgBodyContent(wrap, msg);
    
    return wrap;
}

// ─── Swipes and Generation ──────────────────────────────────────────────────────

export function getLastAssistantMsgId(conversation) {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
        const m = conversation.messages[i];
        if (m.role === 'user') return null;
        if (m.role === 'assistant') {
            return m.id;
        }
    }
    return null;
}

export function getSwipesForMsg(conversation, msgId) {
    const msg = conversation.messages.find(m => m.id === msgId);
    if (!msg) return null;
    if (!msg.swipes) msg.swipes = [{ content: msg.content, reasoning: msg.reasoning || null }];
    if (msg.swipeIndex === undefined) msg.swipeIndex = 0;
    return msg;
}

export function addSwipe(conversation, msgId, content, reasoning = null) {
    const msg = getSwipesForMsg(conversation, msgId);
    if (!msg) return;
    msg.swipes.push({ content, reasoning: reasoning || null });
    msg.swipeIndex = msg.swipes.length - 1;
    msg.content = content;
    msg.reasoning = reasoning || null;
    saveConversation();
}

export function navigateSwipe(conversation, msgId, dir) {
    const msg = getSwipesForMsg(conversation, msgId);
    if (!msg || msg.swipes.length < 2) return false;
    const newIdx = msg.swipeIndex + dir;
    if (newIdx < 0 || newIdx >= msg.swipes.length) return false;

    _dbgAdd('SWIPE_NAVIGATE', { msgId, dir, newIdx });

    msg.swipeIndex = newIdx;
    msg.content = msg.swipes[newIdx].content;
    msg.reasoning = msg.swipes[newIdx].reasoning || null;
    saveConversation();
    updateMsgCount(conversation);
    return true;
}

export function updateSwipeBar(msgEl, conversation, msgId) {
    const bar = msgEl.querySelector('.iv-swipe-bar');
    if (!bar) return;
    const msg = conversation.messages.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.swipes) {
        msg.swipes = [{ content: msg.content, reasoning: msg.reasoning || null }];
        msg.swipeIndex = 0;
    }
    const total = msg.swipes.length;
    const cur = (msg.swipeIndex ?? 0) + 1;
    const prevBtn = bar.querySelector('.iv-swipe-prev');
    const nextBtn = bar.querySelector('.iv-swipe-next');
    const counter = bar.querySelector('.iv-swipe-counter');
    if (prevBtn) prevBtn.disabled = cur <= 1 || state.generating;
    if (nextBtn) nextBtn.disabled = state.generating;
    if (counter) counter.innerHTML = `<span>${cur}</span>/${total}`;
    bar.style.display = '';
}

export async function _runSwipeRegen(conversation, msgId, wrapEl) {
    if (state.generating) return;
    const msgData = conversation.messages.find(m => m.id === msgId);
    if (!msgData) return;

    if (!msgData.swipes) {
        msgData.swipes = [{ content: msgData.content, reasoning: msgData.reasoning || null }];
        msgData.swipeIndex = 0;
    }

    state.generating = true;
    state.activeToolCalls = [];
    const settings = getEffectiveSettings();
    setGeneratingState(true);

    const body = wrapEl.querySelector('.iv-msg-body');
    if (body) {
        body.classList.remove('iv-swipe-anim-right', 'iv-swipe-anim-left');
        body.classList.add('iv-swipe-anim-out-left');
        await new Promise(r => setTimeout(r, 150));
    }

    const placeholderContent = '';
    msgData.swipes.push({ content: placeholderContent, reasoning: null });
    msgData.swipeIndex = msgData.swipes.length - 1;
    msgData.content = placeholderContent;
    msgData.reasoning = null;
    saveConversation();

    updateSwipeBar(wrapEl, conversation, msgId);

    let streamContentEl = wrapEl.querySelector('.iv-msg-content');
    if (streamContentEl) streamContentEl.innerHTML = '';
    const rBlock = wrapEl.querySelector('.iv-reasoning-block');
    if (rBlock) rBlock.style.display = 'none';
    
    if (body) {
        body.classList.remove('iv-swipe-anim-out-left');
        void body.offsetWidth;
        body.classList.add('iv-swipe-anim-right');
    }

    let cursorEl = null;
    const cleanupCursor = () => { if (cursorEl?.parentNode) cursorEl.remove(); cursorEl = null; };

    const onChunk = (text, reasoning) => {
        if (!cursorEl) {
            cursorEl = document.createElement('span');
            cursorEl.className = 'iv-stream-cursor';
            const bar = document.getElementById('iv-thinking-bar');
            if (bar) bar.style.display = 'flex';
        }
        if (streamContentEl) {
            let procReasoning = reasoning || '';
            let procText = stripMemoryBlock(text);
            let tcIndex = 0;
            
            if (procReasoning) {
                const resR = extractToolCallPlaceholders(procReasoning, tcIndex);
                procReasoning = resR.text;
                tcIndex = resR.nextIndex;
            }
            const resC = extractToolCallPlaceholders(procText, tcIndex);
            procText = resC.text;

            const { content: disp } = getDisplayContent(procText, settings);
            streamContentEl.innerHTML = renderMarkdown(disp);
            if (procText) streamContentEl.appendChild(cursorEl);
            postProcessHTMLBlocks(streamContentEl);

            if (tcIndex > 0) {
                const liveTCs = parseToolCallsFromText((reasoning || '') + '\n' + text);
                const displayed = liveTCs.map((tc, i) => ({
                    id: `live_${i}`, name: tc.name, input: tc.input, status: 'done', result: undefined
                }));
                postProcessToolCalls(wrapEl, displayed);
            }
        }
        smartScrollToBottom();
    };

    try {
        const tempConversation = { ...conversation, messages: conversation.messages.filter(m => m.id !== msgId) };
        if (!apiMod) throw new Error("API module not loaded");
        
        const builtMessages = await apiMod.assembleMessages(tempConversation, settings, null);
        const fullPromptText = builtMessages.map(m => m.content).join('\n');
        const tokensIn = await apiMod.estimateTokens(fullPromptText);

        const result = await apiMod.callGenerate(tempConversation, settings, null, onChunk);
        cleanupCursor();

        if (result === null) {
            msgData.swipes.pop();
            msgData.swipeIndex = msgData.swipes.length - 1;
            msgData.content = msgData.swipes[msgData.swipeIndex]?.content || '';
            msgData.reasoning = msgData.swipes[msgData.swipeIndex]?.reasoning || null;
            saveConversation();
            _renderMsgBodyContent(wrapEl, msgData);
            updateSwipeBar(wrapEl, conversation, msgId);
            return;
        }

        const { text: rawText, reasoning: fullReasoning } = result;
        const fullText = normalizeCharNamesInBlock(rawText);

        msgData.swipes[msgData.swipeIndex] = { content: fullText, reasoning: fullReasoning || null };
        msgData.content = fullText;
        msgData.reasoning = fullReasoning || null;
        saveConversation();

        _renderMsgBodyContent(wrapEl, msgData);
        updateSwipeBar(wrapEl, conversation, msgId);

        updateMsgCount(conversation);
        if (uiWdgMod) uiWdgMod.playCompletionSound();

    } catch(err) {
        cleanupCursor();
        msgData.swipes.pop();
        msgData.swipeIndex = msgData.swipes.length - 1;
        msgData.content = msgData.swipes[msgData.swipeIndex]?.content || '';
        msgData.reasoning = msgData.swipes[msgData.swipeIndex]?.reasoning || null;
        saveConversation();
        _renderMsgBodyContent(wrapEl, msgData);
        updateSwipeBar(wrapEl, conversation, msgId);

        if (state.abortController?.signal?.aborted || err?.message === 'userStopped') {} 
        else { showGenerationError(err); }
    } finally {
        state.generating = false;
        setGeneratingState(false);
    }
}

export function _refreshSwipeBars(conversation) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelectorAll('.iv-swipe-bar').forEach(bar => { bar.style.display = 'none'; });
    if (state.generating) return;
    const lastId = getLastAssistantMsgId(conversation);
    if (!lastId) return;
    const lastEl = c.querySelector(`.iv-msg[data-id="${lastId}"]`);
    if (!lastEl) return;
    const swipeBar = lastEl.querySelector('.iv-swipe-bar');
    if (!swipeBar) return;
    updateSwipeBar(lastEl, conversation, lastId);
    swipeBar.style.display = '';
}

export function _refreshContinueBtns() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelectorAll('.iv-msg-last-assistant').forEach(el => el.classList.remove('iv-msg-last-assistant'));
    if (state.generating) return;
    const all = [...c.querySelectorAll('.iv-msg-assistant')];
    if (all.length) all[all.length - 1].classList.add('iv-msg-last-assistant');
}

// ─── Scroll ──────────────────────────────────────────────────────────────────

export function scrollToBottom() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    state.userScrolledUp = false;
    
    // Делаем несколько попыток скролла, если окно еще не отрендерилось (например, при загрузке страницы)
    const tryScroll = (attempts = 0) => {
        if (c.offsetHeight > 0) {
            c.scrollTop = c.scrollHeight;
        } else if (attempts < 5) {
            setTimeout(() => tryScroll(attempts + 1), 50);
        }
    };
    tryScroll();
}

export function saveScrollPosition() {
    const c = document.getElementById('iv-messages');
    // Сохраняем позицию ТОЛЬКО если окно сейчас открыто и отрендерено
    if (c && c.offsetHeight > 0) {
        state.savedScrollTop = c.scrollTop;
    }
}

export function restoreScrollPosition() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    
    const tryRestore = (attempts = 0) => {
        if (c.offsetHeight > 0) {
            if (state.userScrolledUp && state.savedScrollTop !== undefined) {
                c.scrollTop = state.savedScrollTop;
            } else {
                c.scrollTop = c.scrollHeight;
            }
        } else if (attempts < 5) {
            setTimeout(() => tryRestore(attempts + 1), 50);
        }
    };
    tryRestore();
}

export function smartScrollToBottom() {
    if (state.userScrolledUp) return;
    const c = document.getElementById('iv-messages');
    if (c) c.scrollTop = c.scrollHeight;
}

export function setupMessagesScrollTracking() {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.addEventListener('scroll', () => {
        state.userScrolledUp = c.scrollHeight - c.scrollTop - c.clientHeight > 80;
    }, { passive: true });
}

// ─── Message List and Handlers ──────────────────────────────────────────

export function handleCopy(msg) { copyText(msg.content); }

export function handleEdit(wrapEl, msg) {
    if (wrapEl.classList.contains('is-editing')) return;
    wrapEl.classList.add('is-editing');
    const { charId, chatId } = getBindingKey();
    const conversation = getConversation();
    const contentEl = wrapEl.querySelector('.iv-msg-content');
    const original = msg.content;

    const ta = document.createElement('textarea');
    ta.className = 'iv-edit-ta';
    ta.value = original;

    const row = document.createElement('div');
    row.className = 'iv-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'iv-edit-btn iv-edit-save';
    saveBtn.innerHTML = msg.role === 'user'
        ? `${I.check}<span>Save & Resend</span>`
        : `${I.check}<span>Save</span>`;

    const saveOnlyBtn = msg.role === 'user' ? document.createElement('button') : null;
    if (saveOnlyBtn) {
        saveOnlyBtn.className = 'iv-edit-btn iv-edit-cancel';
        saveOnlyBtn.innerHTML = `${I.check}<span>Save</span>`;
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'iv-edit-btn iv-edit-cancel';
    cancelBtn.innerHTML = `${I.x}<span>Cancel</span>`;

    row.appendChild(saveBtn);
    if (saveOnlyBtn) row.appendChild(saveOnlyBtn);
    row.appendChild(cancelBtn);
    contentEl.replaceWith(ta);
    wrapEl.querySelector('.iv-msg-actions').after(row);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    autoResize(ta); ta.addEventListener('input', () => autoResize(ta));

    const restoreMessageDOM = (textToRender) => {
        const nc = document.createElement('div');
        nc.className = 'iv-msg-content';

        let tcIndex = 0;
        const resR = extractToolCallPlaceholders(textToRender, tcIndex);
        const displayString = getDisplayContent(resR.text, getSettings()).content;

        nc.innerHTML = renderMarkdown(displayString);
        postProcessHTMLBlocks(nc);
        ta.replaceWith(nc);
        row.remove();
        wrapEl.classList.remove('is-editing');
        if (msg.toolCalls?.length) postProcessToolCalls(wrapEl, msg.toolCalls);
    };

    cancelBtn.addEventListener('click', () => {
        restoreMessageDOM(original);
    });

    if (saveOnlyBtn) {
        saveOnlyBtn.addEventListener('click', () => {
            const rawText = ta.value.trim();
            if (!rawText) return;
            const newText = expandMacros(rawText);
            
            const msgObj = conversation.messages.find(m => m.id === msg.id);
            if (msgObj) { msgObj.content = newText; saveConversation(); }
            
            msg.content = newText;
            if (msg.swipes && msg.swipeIndex !== undefined) {
                msg.swipes[msg.swipeIndex] = { content: newText, reasoning: msg.reasoning || null };
                saveConversation();
            }
            restoreMessageDOM(newText);
            _updateMsgTokenCount(wrapEl, newText, true);
        });
    }

    saveBtn.addEventListener('click', async () => {
        const rawText = ta.value.trim();
        if (!rawText) return;
        const newText = expandMacros(rawText);
        
        const msgObj = conversation.messages.find(m => m.id === msg.id);
        if (msgObj) { msgObj.content = newText; saveConversation(); }

        msg.content = newText;
        if (msg.swipes && msg.swipeIndex !== undefined) {
            msg.swipes[msg.swipeIndex] = { content: newText, reasoning: msg.reasoning || null };
            saveConversation();
        }
        restoreMessageDOM(newText);
        _updateMsgTokenCount(wrapEl, newText, true);
        
        truncateAfter(conversation, msg.id);
        removeMsgElAfter(msg.id);
        if (msg.role === 'user' && apiMod) await apiMod.runGenerate(conversation, newText, false);
    });
}

export async function handleMessageRegen(wrapEl, msg) {
    if (state.generating) return;
    const conversation = getConversation();
    const idx = conversation.messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;

    const isUser = msg.role === 'user';
    const actualMsgsAfter = conversation.messages.slice(idx + 1);
    const msgsAfterCount = actualMsgsAfter.length;

    let needsConfirm = false;
    if (isUser) {
        if (msgsAfterCount > 1 || (msgsAfterCount === 1 && actualMsgsAfter[0].role !== 'assistant')) {
            needsConfirm = true;
        }
    } else {
        if (msgsAfterCount > 0) {
            needsConfirm = true;
        }
    }

    if (needsConfirm) {
        const ok = await showCustomDialog({
            type: 'confirm',
            title: 'Regenerate Message',
            message: 'Regenerating will delete all subsequent messages. Continue?'
        });
        if (!ok) return;
    }

    if (isUser) {
        truncateAfter(conversation, msg.id);
        removeMsgElAfter(msg.id);
        updateMsgCount(conversation);
        if (apiMod) apiMod.runGenerate(conversation, null, false);
    } else {
        if (msgsAfterCount > 0) {
            truncateAfter(conversation, msg.id);
            removeMsgElAfter(msg.id);
            updateMsgCount(conversation);
        }
        _runSwipeRegen(conversation, msg.id, wrapEl);
    }
}

export async function handleDelete(wrapEl, msg) {
    const isUser = msg.role === 'user';
    const confirmed = await showCustomDialog({
        type: 'confirm',
        title: 'Delete Message',
        message: isUser
            ? 'Delete this message and all subsequent messages?'
            : 'Delete this assistant message?',
    });
    if (!confirmed) return;
    const conversation = getConversation();
    if (isUser) {
        truncateFrom(conversation, msg.id);
        removeMsgElAndBelow(msg.id);
    } else {
        deleteMsg(conversation, msg.id);
        removeMsgEl(msg.id);
    }
    updateMsgCount(conversation);
    if (!conversation.messages.length) renderConversation(conversation);
}

export function renderConversation(conversation) {
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    updateSearchCount();
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.innerHTML = '';
    if (!conversation.messages.length) {
        c.innerHTML = `
            <div class="iv-empty-state">
                <div class="iv-empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7" /><ellipse cx="12" cy="12" rx="11" ry="3" transform="rotate(-25 12 12)" /><circle cx="21.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>
                </div>
                <div class="iv-empty-title">Inner Voice</div>
                <div class="iv-empty-sub">A private space to think, plan, and talk with yourself. Nothing here enters the scene.</div>
            </div>`;
        updateMsgCount(conversation);
        return;
    }
    for (const msg of conversation.messages) {
        const el = createMsgEl(msg, handleCopy, handleEdit, handleDelete, handleMessageRegen);
        c.appendChild(el);
    }
    updateMsgCount(conversation);
    _refreshContinueBtns();
    _refreshSwipeBars(conversation);
    requestAnimationFrame(() => scrollToBottom());
}

export function appendMsgEl(msg, isStreamInit = false) {
    const c = document.getElementById('iv-messages');
    if (!c) return;
    c.querySelector('.iv-empty-state')?.remove();

    const el = createMsgEl(msg, handleCopy, handleEdit, handleDelete, handleMessageRegen);
    c.appendChild(el);
    
    if (!isStreamInit) {
        const conversation = getConversation();
        updateMsgCount(conversation);
        _refreshContinueBtns();
        _refreshSwipeBars(conversation);
        requestAnimationFrame(() => scrollToBottom());

        if (state.searchOpen && state.searchQuery.trim()) {
            const newMarks = _applyHighlightsInRoot(el);
            if (newMarks.length) {
                state.searchMatches.push(...newMarks);
                updateSearchCount();
            }
        }
    }
}

export function removeMsgEl(msgId) {
    const el = document.querySelector(`.iv-msg[data-id="${msgId}"]`);
    if (!el) return;
    el.remove();
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

export function removeMsgElAndBelow(msgId) {
    const c = document.getElementById('iv-messages'); if (!c) return;
    let found = false;
    for (const el of [...c.querySelectorAll('.iv-msg')]) {
        if (el.dataset.id === msgId) found = true;
        if (found) el.remove();
    }
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

export function removeMsgElAfter(msgId) {
    const c = document.getElementById('iv-messages'); if (!c) return;
    let found = false;
    for (const el of [...c.querySelectorAll('.iv-msg')]) {
        if (found) el.remove();
        if (el.dataset.id === msgId) found = true;
    }
    _refreshContinueBtns();
    _refreshSwipeBars(getConversation());
}

let _tokenCalcTid = null;
let _isTokenCalculating = false;
let _pendingTokenCalc = false;

export function updateMsgCount(conversation) {
    const el = document.getElementById('iv-msg-count');
    if (el && conversation) el.textContent = `${conversation.messages.length} msgs`;

    const tel = document.getElementById('iv-token-count');
    if (!tel || !conversation) return;

    clearTimeout(_tokenCalcTid);
    _tokenCalcTid = setTimeout(() => {
        if (_isTokenCalculating) { _pendingTokenCalc = true; return; }

        const runCalc = async () => {
            _isTokenCalculating = true;
            try {
                const settings = getEffectiveSettings();
                const currentInput = document.getElementById('iv-input')?.value || '';
                
                if (apiMod && apiMod.assembleMessages && apiMod.estimateTokens) {
                    try {
                        const tempConv = { ...conversation, messages: [...conversation.messages] };
                        if (currentInput.trim()) {
                            tempConv.messages.push({ 
                                id: 'tmp', 
                                role: 'user', 
                                content: currentInput, 
                                timestamp: Date.now()
                            });
                        }
                        const builtMsgs = await apiMod.assembleMessages(tempConv, settings, null);
                        const fullText = builtMsgs.map(m => m.content).join('\n');
                        const tokens = await apiMod.estimateTokens(fullText);
                        const node = document.getElementById('iv-token-count');
                        if (node) node.textContent = `~${tokens} tkns`;
                        return;
                    } catch (e) {
                        console.warn(`[${EXT_DISPLAY}] Exact token calculation failed, falling back`, e);
                    }
                }

                const ctx = SillyTavern.getContext();
                const incHidden = !!settings.includeHiddenMessages;

                let totalChars = (settings.systemPrompt || '').length;

                const depth = Math.max(0, parseInt(settings.contextDepth) || 0);
                const chat = ctx.chat || [];
                let chatSlice = [];
                try {
                    const conv = getConversation();
                    const picked = conv?.pickedChatIndices;
                    if (picked && picked.length > 0) {
                        chatSlice = picked.filter(i => i >= 0 && i < chat.length).map(i => chat[i]);
                    } else if (depth > 0) {
                        chatSlice = chat.slice(-depth);
                    }
                } catch(_) {
                    if (depth > 0) chatSlice = chat.slice(-depth);
                }

                for (const m of chatSlice) {
                    if (!incHidden && (m.is_system || m.is_hidden || m.extra?.is_hidden || m.extra?.sc_ghosted)) continue;
                    totalChars += (m.mes || '').length;
                }

                const limit = Math.max(1, parseInt(settings.localHistoryLimit) || 50);
                for (const m of getVisibleTurns(conversation).slice(-limit)) {
                    totalChars += (m.content || '').length;
                }

                totalChars += currentInput.length;
                const count = Math.ceil(totalChars / 3.5);
                const node = document.getElementById('iv-token-count');
                if (node) node.textContent = `~${count} tkns`;
            } finally {
                _isTokenCalculating = false;
                if (_pendingTokenCalc) { _pendingTokenCalc = false; runCalc(); }
            }
        };
        runCalc();
    }, 400);
}

export function updateDepthSlidersMax() {
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || window.chat ||[];
    const maxVal = Math.max(1, chat.length);
    
    if (state.lastChatLen === -1) {
        state.lastChatLen = maxVal;
    }

    const s = getSettings();
    const conv = getConversation();
    let settingsChanged = false;

    const globalDepth = parseInt(s.contextDepth) || 0;
    if (globalDepth >= state.lastChatLen && maxVal > state.lastChatLen) {
        s.contextDepth = maxVal;
        settingsChanged = true;
    }

    if (conv && conv.overrides && conv.overrides.contextDepth !== undefined) {
        const ovDepth = parseInt(conv.overrides.contextDepth) || 0;
        if (ovDepth >= state.lastChatLen && maxVal > state.lastChatLen) {
            conv.overrides.contextDepth = maxVal;
            settingsChanged = true;
        }
    }

    if (settingsChanged) {
        saveSettings();
    }

    state.lastChatLen = maxVal;
    const eff = getEffectiveSettings();

    const sliders =[
        { id: 'iv-depth-slider', valId: 'iv-depth-val', setting: s.contextDepth },
        { id: 'iv-sp-depth-slider', valId: 'iv-sp-depth-val', setting: s.contextDepth },
        { id: 'iv-sp-ov-depth-slider', valId: 'iv-sp-ov-depth-val', setting: eff.contextDepth }
    ];

    sliders.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            if (parseInt(el.max) !== maxVal) el.max = maxVal;
            const renderVal = Math.min(maxVal, parseInt(item.setting ?? 15));
            el.value = renderVal;
            const valEl = document.getElementById(item.valId);
            if (valEl) valEl.textContent = renderVal;
        }
    });
}

// ─── Chat search ───────────────────────────────────────────────────────────

export function openSearch() {
    _dbgAdd('SEARCH_TOGGLE', { state: 'open' });
    state.searchOpen = true;
    const bar = document.getElementById('iv-search-bar');
    if (bar) {
        bar.classList.add('iv-search-open');
        requestAnimationFrame(() => {
            const inp = document.getElementById('iv-search-input');
            if (inp) { inp.focus(); inp.select(); }
        });
    }
    document.getElementById('iv-search-btn')?.classList.add('active');
}

export function closeSearch() {
    _dbgAdd('SEARCH_TOGGLE', { state: 'close' });
    state.searchOpen = false;
    state.searchWholeWord = false;
    document.getElementById('iv-search-bar')?.classList.remove('iv-search-open');
    document.getElementById('iv-search-btn')?.classList.remove('active');
    document.getElementById('iv-search-word')?.classList.remove('active');
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    const inp = document.getElementById('iv-search-input');
    if (inp) inp.value = '';
    state.searchQuery = '';
    updateSearchCount();
}

export function clearSearchHighlights() {
    const marks = document.querySelectorAll('#iv-messages mark.iv-search-hl');
    if (!marks.length) return;
    const parents = new Set();
    marks.forEach(m => {
        const p = m.parentNode;
        if (!p) return;
        p.replaceChild(document.createTextNode(m.textContent), m);
        parents.add(p);
    });
    parents.forEach(p => p.normalize());
}

export function updateSearchCount() {
    const el = document.getElementById('iv-search-count');
    if (!el) return;
    el.textContent = (state.searchMatches.length && state.searchQuery)
        ? `${state.searchIdx + 1}/${state.searchMatches.length}`
        : '';
}

export function _applyHighlightsInRoot(root) {
    const lq = state.searchQuery.toLowerCase();
    let regex = null;
    if (state.searchWholeWord) {
        try { regex = new RegExp(`\\b${lq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'); } catch(_) {}
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.closest('.iv-msg-actions,.iv-msg-meta,.iv-msg-avatar,.iv-reasoning-summary,.iv-search-hl'))
                return NodeFilter.FILTER_REJECT;
            if (!p.closest('.iv-msg-body')) return NodeFilter.FILTER_REJECT;
            if (regex) {
                regex.lastIndex = 0;
                const hit = regex.test(node.nodeValue);
                regex.lastIndex = 0;
                return hit ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
            return node.nodeValue.toLowerCase().includes(lq)
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    const newMarks = [];
    
    try {
        for (const node of textNodes) {
            const text = node.nodeValue;
            const frag = document.createDocumentFragment();
            let lastIndex = 0;

            if (regex) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                    const mark = document.createElement('mark');
                    mark.className = 'iv-search-hl';
                    mark.textContent = match[0];
                    frag.appendChild(mark);
                    newMarks.push(mark);
                    lastIndex = match.index + match[0].length;
                }
            } else {
                const lower = text.toLowerCase();
                let idx = lower.indexOf(lq, 0);
                if (idx === -1) continue;
                while (idx !== -1) {
                    if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
                    const mark = document.createElement('mark');
                    mark.className = 'iv-search-hl';
                    mark.textContent = text.slice(idx, idx + state.searchQuery.length);
                    frag.appendChild(mark);
                    newMarks.push(mark);
                    lastIndex = idx + state.searchQuery.length;
                    idx = lower.indexOf(lq, lastIndex);
                }
            }

            if (lastIndex === 0) continue;
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            node.parentNode.replaceChild(frag, node);
        }
    } catch (e) {
        _dbgAdd('SEARCH_HIGHLIGHT_DOM_CORRUPTION', { error: e.message });
    }

    return newMarks;
}

export function performSearch() {
    clearSearchHighlights();
    state.searchMatches = [];
    state.searchIdx = -1;
    const q = state.searchQuery.trim();
    if (!q) { updateSearchCount(); return; }
    const container = document.getElementById('iv-messages');
    if (!container) return;
    state.searchMatches = _applyHighlightsInRoot(container);

    _dbgAdd('SEARCH_QUERY_EXECUTE', { query: state.searchQuery, wholeWord: state.searchWholeWord, matches: state.searchMatches.length });

    if (state.searchMatches.length) {
        state.searchIdx = 0;
        state.searchMatches[0].classList.add('iv-search-current');
        state.searchMatches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    updateSearchCount();
}

export function navigateSearch(dir) {
    if (!state.searchMatches.length) return;
    state.searchMatches[state.searchIdx]?.classList.remove('iv-search-current');
    state.searchIdx = (state.searchIdx + dir + state.searchMatches.length) % state.searchMatches.length;
    const cur = state.searchMatches[state.searchIdx];
    cur.classList.add('iv-search-current');
    cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateSearchCount();
}

// ─── Chat Picker ───────────────────────────────────────────────

export function getPickedChatIndices() {
    try { return getConversation().pickedChatIndices || []; } catch(_) { return []; }
}

export function setPickedChatIndices(indices) {
    try {
        const conv = getConversation();
        conv.pickedChatIndices = [...indices].sort((a, b) => a - b);
        saveConversation();
        updatePickBtnState();
        updateMsgCount(conv);
    } catch(_) {}
}

export function updatePickBtnState() {
    const picked = getPickedChatIndices();
    const btn = document.getElementById('iv-pick-btn');
    const badge = document.getElementById('iv-pick-badge');
    const isActive = picked.length > 0;
    btn?.classList.toggle('active', isActive);
    if (badge) { badge.style.display = isActive ? '' : 'none'; badge.textContent = picked.length; }
    const depthSlider = document.getElementById('iv-depth-slider');
    const depthVal = document.getElementById('iv-depth-val');
    depthSlider?.classList.toggle('iv-slider-overridden', isActive);
    depthVal?.classList.toggle('iv-depth-val-overridden', isActive);
}

let _pickerLastIdx = -1;

export function openChatPicker() {
    const overlay = document.getElementById('iv-picker-overlay');
    if (!overlay) return;
    _dbgAdd('PICKER_OPEN');
    if (uiWinMod) uiWinMod.applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default);
    _pickerLastIdx = -1;
    renderPickerMessages();
    overlay.style.display = 'flex';
    if (uiWinMod) uiWinMod.bringWindowToFront();
}

export function closeChatPicker() {
    _dbgAdd('PICKER_CLOSE');
    const overlay = document.getElementById('iv-picker-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function renderPickerMessages() {
    const body = document.getElementById('iv-picker-body');
    if (!body) return;
    const ctx = SillyTavern.getContext();
    const msgs = ctx.chat || [];
    const pickedSet = new Set(getPickedChatIndices());
    const charInfo = getCharInfo();

    body.innerHTML = '';
    if (!msgs.length) {
        body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--iv-text-muted)">No messages in current chat</div>';
        _updatePickerCountEl(0);
        return;
    }

    const frag = document.createDocumentFragment();
    msgs.forEach((msg, idx) => {
        const isUser = msg.is_user;
        const name = isUser ? (ctx.name1 || 'User') : (msg.name || charInfo?.name || 'Character');
        const isSelected = pickedSet.has(idx);
        const row = document.createElement('div');
        row.className = `iv-picker-row${isSelected ? ' selected' : ''}${isUser ? ' user' : ''}`;
        row.dataset.idx = idx;

        const cb = document.createElement('div');
        cb.className = `iv-picker-cb${isSelected ? ' checked' : ''}`;

        const meta = document.createElement('div');
        meta.className = 'iv-picker-meta';

        const idxEl = document.createElement('span');
        idxEl.className = 'iv-picker-idx';
        idxEl.textContent = `#${idx}`;

        const nameEl = document.createElement('span');
        nameEl.className = 'iv-picker-name';
        nameEl.textContent = name;

        meta.appendChild(idxEl);
        meta.appendChild(nameEl);

        const textEl = document.createElement('div');
        textEl.className = 'iv-picker-text';
        const raw = (msg.mes || '').replace(/<[^>]+>/g, '').trim();
        const s2 = getSettings();
        const firstLines = Math.max(1, parseInt(s2.pickerPreviewLines) || 1);
        const lastLines = Math.max(0, parseInt(s2.pickerPreviewLastLines) || 0);
        let preview = '';
        if (lastLines > 0) {
            const allLines = raw.split('\n');
            const head = allLines.slice(0, firstLines).join('\n');
            const tail = allLines.length > firstLines
                ? allLines.slice(-lastLines).join('\n')
                : '';
            preview = tail && tail !== head ? head + '\n…\n' + tail : head;
        } else {
            preview = raw.split('\n').slice(0, firstLines).join('\n');
            if (preview.length < raw.length) preview += ' …';
        }
        textEl.textContent = preview;

        const infoCol = document.createElement('div');
        infoCol.className = 'iv-picker-info-col';
        infoCol.appendChild(meta);
        infoCol.appendChild(textEl);

        row.appendChild(cb);
        row.appendChild(infoCol);

        row.addEventListener('click', e => {
            const curIdx = parseInt(row.dataset.idx);
            const curMsg = msgs[curIdx];

            if (e.ctrlKey || e.metaKey) {
                _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'ctrl' });
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    const rm = msgs[ri];
                    if (rm && rm.is_user === curMsg.is_user && rm.name === curMsg.name) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else if (e.altKey) {
                 _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'alt' });
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    const rm = msgs[ri];
                    if (rm && !(rm.is_user === curMsg.is_user && rm.name === curMsg.name)) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else if (e.shiftKey && _pickerLastIdx >= 0) {
                _dbgAdd('PICKER_SHORTCUT_TRIGGERED', { type: 'shift' });
                const lo = Math.min(_pickerLastIdx, curIdx);
                const hi = Math.max(_pickerLastIdx, curIdx);
                const targetState = !row.classList.contains('selected');
                body.querySelectorAll('.iv-picker-row').forEach(r => {
                    const ri = parseInt(r.dataset.idx);
                    if (ri >= lo && ri <= hi) {
                        r.classList.toggle('selected', targetState);
                        r.querySelector('.iv-picker-cb')?.classList.toggle('checked', targetState);
                    }
                });
            } else {
                const sel = row.classList.toggle('selected');
                _dbgAdd('PICKER_TOGGLE_SINGLE', { idx: curIdx, state: sel });
                cb.classList.toggle('checked', sel);
                _pickerLastIdx = curIdx;
            }
            _updatePickerCountEl();
        });

        frag.appendChild(row);
    });
    body.appendChild(frag);
    _updatePickerCountEl(pickedSet.size);
    const firstSel = body.querySelector('.iv-picker-row.selected');
    if (firstSel) setTimeout(() => firstSel.scrollIntoView({ block: 'center' }), 50);
}

export function _updatePickerCountEl(count) {
    const el = document.getElementById('iv-picker-count');
    if (!el) return;
    const n = count !== undefined ? count : document.querySelectorAll('#iv-picker-body .iv-picker-row.selected').length;
    el.textContent = `${n} selected`;
}

export function setupChatPickerListeners() {
    const overlay = document.getElementById('iv-picker-overlay');
    if (!overlay) return;

    let _mouseDownTarget = null;
    overlay.addEventListener('mousedown', e => { _mouseDownTarget = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mouseDownTarget === overlay) closeChatPicker(); });

    document.getElementById('iv-picker-close')?.addEventListener('click', closeChatPicker);

    document.getElementById('iv-picker-all')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            r.classList.add('selected');
            r.querySelector('.iv-picker-cb')?.classList.add('checked');
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-invert')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            const s = r.classList.toggle('selected');
            r.querySelector('.iv-picker-cb')?.classList.toggle('checked', s);
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-clear')?.addEventListener('click', () => {
        document.querySelectorAll('#iv-picker-body .iv-picker-row').forEach(r => {
            r.classList.remove('selected');
            r.querySelector('.iv-picker-cb')?.classList.remove('checked');
        });
        _updatePickerCountEl();
    });

    document.getElementById('iv-picker-apply')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#iv-picker-body .iv-picker-row');
        const indices = [];
        rows.forEach(r => { if (r.classList.contains('selected')) indices.push(parseInt(r.dataset.idx)); });
        _dbgAdd('PICKER_APPLY', { count: indices.length });
        setPickedChatIndices(indices);
        closeChatPicker();
    });
}

// ─── Generation state ─────────────────────────────────────────────────────

export function setGeneratingState(on) {
    const bar = document.getElementById('iv-thinking-bar'), sendBtn = document.getElementById('iv-send-btn'),
          input = document.getElementById('iv-input'), regenBtn = document.getElementById('iv-regen-btn');
    if (bar) {
        bar.style.display = on ? 'flex' : 'none';
        if (on) {
            const t = document.getElementById('iv-thinking-text');
            if (t) t.textContent = 'Thinking…';
        }
    }
    if (sendBtn) sendBtn.disabled = on;
    if (input) input.disabled = on;
    if (regenBtn) regenBtn.disabled = on;
    if (!on) {
        _refreshContinueBtns();
        _refreshSwipeBars(getConversation());
    }
}

export function showGenerationError(err) {
    let errorSummary = err?.message || String(err);
    let fullError = '';

    if (err instanceof Error) {
        fullError = err.stack || err.message;
        if (err.cause) {
            fullError += '\n\n--- CAUSE ---\n' + (err.cause.stack || err.cause.message || JSON.stringify(err.cause, null, 2));
        }
    } else if (typeof err === 'object') {
        try {
            errorSummary = "API or Network Error";
            fullError = JSON.stringify(err, null, 2);
        } catch(e) {
            fullError = String(err);
        }
    } else {
        fullError = String(err);
    }

    if (window.last_api_error && errorSummary.includes('userStopped') === false) {
        fullError += '\n\n--- ST LAST API ERROR ---\n' + (typeof window.last_api_error === 'object' ? JSON.stringify(window.last_api_error, null, 2) : String(window.last_api_error));
    }

    showCustomDialog({
        type: 'alert',
        title: 'Generation Error',
        htmlMessage: `
            <div style="color:var(--iv-danger); margin-bottom: 10px; font-weight: 600; font-size: 14px; word-break: break-word; line-height: 1.4;">
                ${escHtml(errorSummary)}
            </div>
            <div style="font-size: 12px; margin-bottom: 8px; color: var(--iv-text-muted);">
                Please copy the technical details below and download Debug Log (from settings) to report the issue:
            </div>
            <textarea style="width:100%; height:160px; background:rgba(0,0,0,0.4); color:var(--iv-text-muted); border:1px solid rgba(255,255,255,0.15); padding:8px; border-radius:6px; font-family:var(--iv-font-mono, monospace); resize:vertical; font-size:11px; white-space:pre; word-wrap:normal; overflow-x:auto;" readonly onclick="this.select()">${escHtml(fullError)}</textarea>
        `
    });
}

// ─── Chat Events (SillyTavern) ──────────────────────────────────────────────

export async function onChatChanged() {
    if (state.generating) {
        state.abortController?.abort();
        state.generating = false;
        setGeneratingState(false);
    }
    state.lastChatLen = -1;
    
    const badge = document.getElementById('iv-char-badge');
    if (badge) {
        const ctx = SillyTavern.getContext(); const char = ctx.characters?.[ctx.characterId];
        if (char) { badge.textContent = char.name; badge.style.display = ''; }
        else { badge.style.display = 'none'; }
    }
    
    await initConversation();
    
    if (uiSetMod) {
        uiSetMod.autoLoadBoundProfile();
        uiSetMod.updateConversationOverrideIndicator();
    }
    if (uiWdgMod) {
        uiWdgMod.renderQuickPromptsBar();
    }
    
    updateDepthSlidersMax();
    updatePickBtnState();
}

export function toggleSearchWholeWord() {
    state.searchWholeWord = !state.searchWholeWord;
    document.getElementById('iv-search-word')?.classList.toggle('active', state.searchWholeWord);
    if (state.searchQuery.trim()) performSearch();
}

export function setupDepthClickEdit() {
    const valEl = document.getElementById('iv-depth-val'); if (!valEl) return;
    
    const newEl = valEl.cloneNode(true);
    valEl.replaceWith(newEl);
    
    newEl.addEventListener('click', () => {
        const cur = getSettings().contextDepth;
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'iv-depth-input';
        input.value = cur; input.min = 0;
        
        newEl.replaceWith(input); 
        input.focus(); input.select();
        
        let isCommitted = false;
        const commit = () => {
            if (isCommitted || !input.parentNode) return;
            isCommitted = true;

            const val = Math.max(0, parseInt(input.value) || 0);
            getSettings().contextDepth = val; saveSettings();
            
            updateDepthSlidersMax();
            import('./ui-settings.js').then(m => m.syncOverlayUI('contextDepth', val));
            
            const span = document.createElement('span');
            span.className = 'iv-depth-val iv-depth-clickable'; span.id = 'iv-depth-val';
            span.title = 'Click to enter exact value'; span.textContent = val;
            
            input.parentNode.replaceChild(span, input);
            setupDepthClickEdit();
            
            const slider = document.getElementById('iv-depth-slider');
            if (slider) { slider.value = val; }
            updateMsgCount(getConversation());
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', e => { 
            if (e.key === 'Enter') { e.preventDefault(); commit(); } 
            if (e.key === 'Escape') { e.preventDefault(); commit(); } 
        });
    });
}

let _searchHotkeyHandler = null;

export function setupSearchHotkey() {
    if (_searchHotkeyHandler) document.removeEventListener('keydown', _searchHotkeyHandler, true);
    _searchHotkeyHandler = null;
    const s = getSettings();
    if (!s.enabled || !s.searchHotkeyEnabled || !s.searchHotkey) return;

    const parts = s.searchHotkey.toLowerCase().split('+').map(p => p.trim());
    const key = parts[parts.length - 1];
    const needAlt = parts.includes('alt');
    const needCtrl = parts.includes('ctrl') || parts.includes('control');
    const needShift = parts.includes('shift');
    const needMeta = parts.includes('meta') || parts.includes('cmd');

    _searchHotkeyHandler = e => {
        if (e.key.toLowerCase() !== key) return;
        if (needAlt !== e.altKey || needCtrl !== e.ctrlKey || needShift !== e.shiftKey || needMeta !== e.metaKey) return;
        
        if (!state.windowActive) return;
        
        const win = document.getElementById('iv-window');
        if (!win || win.style.display === 'none') return;
        
        const overlays = ['iv-settings-overlay', 'iv-picker-overlay', 'iv-changelog-modal'];
        for (const id of overlays) {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none' && el.style.display !== '') return;
        }
        if (document.querySelector('.iv-dialog-overlay.visible')) return;
        
        e.preventDefault();
        e.stopPropagation();
        if (state.searchOpen) { document.getElementById('iv-search-input')?.focus(); }
        else openSearch();
    };
    document.addEventListener('keydown', _searchHotkeyHandler, true);
}