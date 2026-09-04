import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAttachmentSrc } from '../src/features/image-core.js';

globalThis.addEventListener = () => {};
globalThis.document = {
    currentScript: null,
    readyState: 'loading',
    getElementsByTagName() { return []; },
    addEventListener() {},
    getElementById() { return null; },
    createElement(tag) {
        return {
            tag,
            className: '',
            children: [],
            src: '',
            textContent: '',
            onclick: null,
            appendChild(child) { this.children.push(child); return child; },
            addEventListener() {},
        };
    },
};
globalThis.window = globalThis;
globalThis.SillyTavern = {
    getContext() {
        return { extensionSettings: {}, saveSettingsDebounced() {}, chat: [], characters: [], name1: 'User', name2: 'Char' };
    },
};

const { renderMessageAttachments, clearAttachmentWrappers, _mergeContent } = await import('../src/features/feature-attachments.js');

test('URL-only generated attachments prefer url', () => {
    const att = { isImage: true, url: '/user/images/saved.png', name: 'saved.png' };
    assert.equal(getAttachmentSrc(att), '/user/images/saved.png');
});

test('uploaded attachments still use dataUrl', () => {
    const att = { isImage: true, dataUrl: 'data:image/png;base64,aaa', name: 'upload.png' };
    assert.equal(getAttachmentSrc(att), 'data:image/png;base64,aaa');
});

test('url wins over dataUrl so session JSON can drop bytes', () => {
    const att = {
        isImage: true,
        url: '/user/images/saved.png',
        dataUrl: 'data:image/png;base64,aaaaaaaaaaaaaaaa',
        name: 'saved.png',
    };
    assert.equal(getAttachmentSrc(att), '/user/images/saved.png');
});

test('renderMessageAttachments assigns src as a property and does not duplicate wrappers', () => {
    const kids = [];
    const stale = {
        className: 'scp-msg-attachments',
        remove() {
            const i = kids.indexOf(this);
            if (i >= 0) kids.splice(i, 1);
        },
    };
    kids.push(stale);
    const body = {
        firstChild: null,
        querySelectorAll(sel) {
            return sel === '.scp-msg-attachments' ? kids.filter(k => k.className === 'scp-msg-attachments') : [];
        },
        insertBefore(el) {
            kids.unshift(el);
            return el;
        },
    };
    const created = [];
    const createElement = (tag) => {
        const el = {
            tag,
            className: '',
            children: [],
            src: '',
            textContent: '',
            appendChild(child) { this.children.push(child); return child; },
            addEventListener() {},
            remove() {
                const i = kids.indexOf(this);
                if (i >= 0) kids.splice(i, 1);
            },
        };
        created.push(el);
        return el;
    };
    const att = { isImage: true, url: '/user/images/saved.png', name: 'saved.png' };
    const first = renderMessageAttachments(body, [att], { createElement });
    assert.equal(first.removed, 1);
    assert.equal(first.rendered, 1);
    assert.equal(kids.filter(k => k.className === 'scp-msg-attachments').length, 1);
    const img = created.find(el => el.tag === 'img');
    assert.equal(img.src, '/user/images/saved.png');
    assert.equal(typeof img.src, 'string');
    const second = renderMessageAttachments(body, [att], { createElement });
    assert.equal(second.removed, 1);
    assert.equal(kids.filter(k => k.className === 'scp-msg-attachments').length, 1);
    assert.equal(clearAttachmentWrappers(body), 1);
    assert.equal(kids.filter(k => k.className === 'scp-msg-attachments').length, 0);
});

test('history merge skips generated url-only images so the text model does not get empty image_url parts', () => {
    const generated = { isImage: true, url: '/user/images/saved.png', name: 'saved.png' };
    const uploaded = { isImage: true, dataUrl: 'data:image/png;base64,aaa', name: 'upload.png' };
    assert.equal(_mergeContent('hello', [generated]), 'hello');
    const mixed = _mergeContent('hello', [generated, uploaded]);
    assert.equal(Array.isArray(mixed), true);
    assert.equal(mixed[0].type, 'image_url');
    assert.equal(mixed[0].image_url.url, 'data:image/png;base64,aaa');
    assert.equal(mixed.some(p => p?.image_url && !p.image_url.url), false);
});
