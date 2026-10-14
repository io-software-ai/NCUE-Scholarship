/**
 * 公告富文字消毒 —— 伺服器端版本（sanitize-html，不需 DOM）。
 * 供 Server Component（如 app/announcement/[id]/page.jsx）在 SSR 時使用。
 * 瀏覽器端請用 richHtml.js。
 */
import sanitizeHtml from 'sanitize-html';

const OPTIONS = {
    allowedTags: [
        'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
        'sub', 'sup', 'small', 'big', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    ],
    allowedAttributes: {
        '*': ['style', 'class', 'align', 'title', 'dir', 'lang'],
        a: ['href', 'target', 'rel', 'name'],
        img: ['src', 'alt', 'width', 'height'],
        td: ['colspan', 'rowspan', 'width', 'valign'],
        th: ['colspan', 'rowspan', 'width', 'valign', 'scope'],
        table: ['border', 'cellpadding', 'cellspacing', 'width'],
        col: ['span', 'width'],
        colgroup: ['span', 'width'],
        font: ['color', 'size', 'face'],
        ol: ['start', 'type'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
        a: (tagName, attribs) => ({
            tagName,
            attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
        }),
    },
};

export function sanitizeRichHtmlServer(html) {
    if (!html) return '';
    return sanitizeHtml(String(html), OPTIONS);
}
