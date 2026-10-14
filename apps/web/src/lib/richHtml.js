'use client';
/**
 * 公告富文字（TinyMCE / AI 產生的 HTML）渲染前的消毒 —— 瀏覽器端版本（DOMPurify）。
 * 伺服器端渲染請用 richHtml.server.js（同一份白名單精神，sanitize-html 實作）。
 *
 * 任何要塞進 dangerouslySetInnerHTML 的公告內容都必須先經過 sanitizeRichHtml()。
 */
import DOMPurify from 'dompurify';

const FORBID_TAGS = ['style', 'script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button',
    'textarea', 'select', 'option', 'link', 'meta', 'base', 'svg', 'math', 'template'];

let hooked = false;
function ensureHooks() {
    if (hooked || typeof window === 'undefined') return;
    hooked = true;
    // 外部連結一律加 noopener，避免 reverse tabnabbing
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
}

export function sanitizeRichHtml(html) {
    if (!html) return '';
    // SSR 階段沒有 DOM：DOMPurify 會原樣回傳，因此改為輸出純文字，水合後再由瀏覽器渲染消毒後的 HTML
    if (typeof window === 'undefined') return String(html).replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '');
    ensureHooks();
    return DOMPurify.sanitize(String(html), {
        FORBID_TAGS,
        FORBID_ATTR: ['srcset', 'formaction', 'action', 'xlink:href'],
        ADD_ATTR: ['target'],
        ALLOW_DATA_ATTR: false,
    });
}
