'use client';

import { FAQ_BLOCK_TYPES } from '@/components/FaqAnswer';
import { Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

const emptyBlock = (type) =>
    (type === 'list' || type === 'steps') ? { type, items: [''] } : { type, text: '' };

/**
 * FAQ 受控區塊編輯器（可重用）
 * props: blocks（區塊陣列）, onChange（回傳新的區塊陣列）
 * 樣式與 FaqTab 一致；渲染規則由 FaqAnswer 集中供應。
 */
export default function FaqBlockEditor({ blocks = [], onChange }) {
    const updateBlock = (i, patch) => onChange(blocks.map((b, idx) => idx === i ? { ...b, ...patch } : b));
    const moveBlock = (i, dir) => {
        const next = [...blocks];
        const t = i + dir;
        if (t < 0 || t >= next.length) return;
        [next[i], next[t]] = [next[t], next[i]];
        onChange(next);
    };
    const removeBlock = (i) => onChange(blocks.filter((_, idx) => idx !== i));
    const addBlock = (type) => onChange([...blocks, emptyBlock(type)]);

    return (
        <div>
            <div className="space-y-2.5">
                {blocks.map((block, i) => {
                    const meta = FAQ_BLOCK_TYPES.find(t => t.type === block.type);
                    const isListy = block.type === 'list' || block.type === 'steps';
                    return (
                        <div key={i} className="border border-line rounded-xl p-3 bg-page/50">
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-tint text-primary">{meta?.label || block.type}</span>
                                <span className="text-[11px] text-ink-soft">{meta?.hint}</span>
                                <span className="flex-1" />
                                <button onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label="區塊上移" className="p-1 rounded text-ink-soft/60 hover:text-primary disabled:opacity-30"><ChevronUp size={13} /></button>
                                <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} aria-label="區塊下移" className="p-1 rounded text-ink-soft/60 hover:text-primary disabled:opacity-30"><ChevronDown size={13} /></button>
                                <button onClick={() => removeBlock(i)} aria-label="刪除區塊" className="p-1 rounded text-ink-soft/60 hover:text-danger"><Trash2 size={13} /></button>
                            </div>
                            {isListy ? (
                                <textarea rows={Math.max(4, (block.items || []).length + 1)} value={(block.items || []).join('\n')}
                                    onChange={e => updateBlock(i, { items: e.target.value.split('\n') })}
                                    placeholder={'一行一個項目'}
                                    className="w-full bg-surface text-ink border border-line rounded-lg px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-primary transition-colors duration-150 resize-y min-h-28 [field-sizing:content]" />
                            ) : (
                                <textarea rows={4} value={block.text || ''}
                                    onChange={e => updateBlock(i, { text: e.target.value })}
                                    placeholder="輸入文字內容"
                                    className="w-full bg-surface text-ink border border-line rounded-lg px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-primary transition-colors duration-150 resize-y min-h-24 [field-sizing:content]" />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
                {FAQ_BLOCK_TYPES.map(t => (
                    <button key={t.type} onClick={() => addBlock(t.type)} title={t.hint}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-line-strong text-xs font-medium text-ink-soft hover:border-primary hover:text-primary hover:bg-primary-tint/50 transition-colors duration-150">
                        <Plus size={12} />{t.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export { emptyBlock };
