import { Info, TriangleAlert } from 'lucide-react';

/**
 * FAQ 受控樣式渲染器（唯一的樣式出口）
 * 區塊類型固定五種：paragraph / list / steps / note / warn
 * 行內標記固定三種：**粗體**、==重點標示==、[連結文字](https://...)
 * 內容以純文字 + 標記儲存，一律由本元件轉為 React 節點（無 HTML 注入面）。
 */

const INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const INLINE_MARK = /\*\*([^*]+)\*\*|==([^=]+)==/g;

function renderMarks(text, keyPrefix) {
    const nodes = [];
    let last = 0, m, i = 0;
    INLINE_MARK.lastIndex = 0;
    while ((m = INLINE_MARK.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        if (m[1] !== undefined) {
            nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">{m[1]}</strong>);
        } else {
            nodes.push(<mark key={`${keyPrefix}-h${i}`} className="bg-warn/20 text-ink px-1 py-0.5 rounded">{m[2]}</mark>);
        }
        last = m.index + m[0].length;
        i++;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

export function renderInline(text = '', keyPrefix = 'k') {
    const nodes = [];
    let last = 0, m, i = 0;
    INLINE_LINK.lastIndex = 0;
    while ((m = INLINE_LINK.exec(text)) !== null) {
        if (m.index > last) nodes.push(...renderMarks(text.slice(last, m.index), `${keyPrefix}-${i}t`));
        nodes.push(
            <a key={`${keyPrefix}-a${i}`} href={m[2]} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2 break-words">
                {renderMarks(m[1], `${keyPrefix}-${i}l`)}
            </a>
        );
        last = m.index + m[0].length;
        i++;
    }
    if (last < text.length) nodes.push(...renderMarks(text.slice(last), `${keyPrefix}-${i}e`));
    return nodes;
}

const BLOCK_RENDERERS = {
    paragraph: (block, key) => (
        <p key={key} className="my-2.5 leading-relaxed">{renderInline(block.text, key)}</p>
    ),
    list: (block, key) => (
        <ul key={key} className="list-disc pl-5 space-y-1.5 my-2.5">
            {(block.items || []).map((item, i) => <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>)}
        </ul>
    ),
    steps: (block, key) => (
        <ol key={key} className="list-decimal pl-5 space-y-2 my-2.5">
            {(block.items || []).map((item, i) => <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>)}
        </ol>
    ),
    note: (block, key) => (
        <div key={key} className="flex gap-2.5 items-start bg-primary-tint/70 border border-primary/25 rounded-lg px-4 py-3 my-3 text-sm leading-relaxed">
            <Info size={15} className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{renderInline(block.text, key)}</span>
        </div>
    ),
    warn: (block, key) => (
        <div key={key} className="flex gap-2.5 items-start bg-warn/10 border border-warn/30 rounded-lg px-4 py-3 my-3 text-sm leading-relaxed">
            <TriangleAlert size={15} className="text-warn mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{renderInline(block.text, key)}</span>
        </div>
    ),
};

export const FAQ_BLOCK_TYPES = [
    { type: 'paragraph', label: '段落', hint: '一般文字段落' },
    { type: 'list', label: '項目清單', hint: '圓點列表，一行一項' },
    { type: 'steps', label: '編號步驟', hint: '數字列表，一行一步' },
    { type: 'note', label: '資訊提示框', hint: '藍色重點說明' },
    { type: 'warn', label: '注意事項框', hint: '橘色警示說明' },
];

export default function FaqAnswer({ blocks = [] }) {
    return (
        <div className="text-[15px] text-ink-soft">
            {blocks.map((block, i) => {
                const renderer = BLOCK_RENDERERS[block?.type];
                return renderer ? renderer(block, `blk-${i}`) : null;
            })}
        </div>
    );
}
