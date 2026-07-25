/**
 * FAQ 受控區塊：共用驗證與淨化
 *
 * FAQ 答案為固定五種樣式的區塊陣列，內容一律純文字（行內標記由前端渲染器解析）。
 * 後台 FAQ 維護與「知識缺口 → FAQ 草稿發佈」皆共用此模組，確保規則一致。
 */

export const ALLOWED_FAQ_TYPES = new Set(['paragraph', 'list', 'steps', 'note', 'warn']);

/** 回傳錯誤字串；通過則回傳 null */
export function validateFaqBlocks(answer) {
    if (!Array.isArray(answer) || answer.length === 0) return '答案至少需要一個內容區塊';
    if (answer.length > 30) return '內容區塊過多（上限 30）';
    for (const block of answer) {
        if (!block || !ALLOWED_FAQ_TYPES.has(block.type)) return `不支援的區塊類型：${block?.type}`;
        if (block.type === 'list' || block.type === 'steps') {
            if (!Array.isArray(block.items) || block.items.length === 0) return '清單區塊至少需要一個項目';
            if (block.items.some(item => typeof item !== 'string' || item.length > 1000)) return '清單項目格式錯誤或過長';
        } else {
            if (typeof block.text !== 'string' || !block.text.trim()) return '文字區塊內容不可為空';
            if (block.text.length > 3000) return '文字區塊過長（上限 3000 字）';
        }
    }
    return null;
}

export const sanitizeFaqBlocks = (answer) => answer.map(block =>
    (block.type === 'list' || block.type === 'steps')
        ? { type: block.type, items: block.items.map(item => item.trim()).filter(Boolean) }
        : { type: block.type, text: block.text.trim() }
);
