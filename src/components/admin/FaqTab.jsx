'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import useModalLock from '@/hooks/useModalLock';
import Toast from '@/components/ui/Toast';
import FaqAnswer, { FAQ_BLOCK_TYPES } from '@/components/FaqAnswer';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
    HelpCircle, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2,
    X, Eye, EyeOff, Download, GripVertical
} from 'lucide-react';

/** 單列(可拖拉):拖把手觸發 drag,上下鍵保留鍵盤操作 */
const FaqRow = ({ faq, onToggle, onEdit, onDelete, onDragEnd }) => {
    const dragControls = useDragControls();
    return (
        <Reorder.Item
            value={faq}
            dragListener={false}
            dragControls={dragControls}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 bg-surface border-b border-line last:border-b-0 ${!faq.is_active ? 'opacity-50' : ''}`}
            whileDrag={{ scale: 1.01, boxShadow: '0 8px 24px rgba(28,43,58,0.15)', zIndex: 10, position: 'relative' }}
        >
            <button
                onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
                aria-label="拖拉調整排序"
                title="拖拉調整排序"
                className="p-1 -m-1 rounded text-ink-soft/40 hover:text-primary cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            >
                <GripVertical size={15} />
            </button>
            <p className="flex-1 min-w-0 text-sm font-medium text-ink truncate">{faq.question}</p>
            <span className="text-[11px] text-ink-soft tabular-nums hidden sm:inline">{faq.answer?.length || 0} 區塊</span>
            <button onClick={() => onToggle(faq)} title={faq.is_active ? '點擊停用（前台隱藏）' : '點擊啟用'}
                className="p-2 rounded-lg text-ink-soft hover:text-primary hover:bg-surface-hover transition-colors duration-150"
                aria-label={faq.is_active ? '停用' : '啟用'}>
                {faq.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button onClick={() => onEdit(faq)} aria-label="編輯"
                className="p-2 rounded-lg text-ink-soft hover:text-primary hover:bg-surface-hover transition-colors duration-150"><Pencil size={15} /></button>
            <button onClick={() => onDelete(faq)} aria-label="刪除"
                className="p-2 rounded-lg text-ink-soft hover:text-danger hover:bg-danger/10 transition-colors duration-150"><Trash2 size={15} /></button>
        </Reorder.Item>
    );
};

const emptyBlock = (type) =>
    (type === 'list' || type === 'steps') ? { type, items: [''] } : { type, text: '' };

/**
 * 常見問題管理：受控樣式系統
 * 管理員只能組合固定五種區塊（段落/清單/步驟/提示框/警示框）與三種行內標記，
 * 渲染樣式由 FaqAnswer 統一供應，確保前台視覺一致。
 */
export default function FaqTab() {
    const confirm = useConfirm();
    const [faqs, setFaqs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
    const showToast = (message, type = 'info') => setToast({ show: true, message, type });

    // 編輯器狀態（null = 關閉；{} = 新增；{id,...} = 編輯）
    const [editing, setEditing] = useState(null);
    const originalEditRef = useRef(null);
    const serializeEditing = (e) => JSON.stringify({ q: e?.question ?? '', a: e?.answer ?? [], act: e?.is_active !== false });
    const openEditor = (data) => {
        originalEditRef.current = serializeEditing(data);
        setEditing(data);
    };
    const isDirty = editing ? serializeEditing(editing) !== originalEditRef.current : false;
    useModalLock(!!editing);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const fetchFaqs = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await authFetch('/api/admin/faqs');
            const data = await res.json();
            if (data.success) setFaqs(data.faqs || []);
        } catch (e) {
            showToast('無法載入 FAQ 列表', 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

    const handleImportDefaults = async () => {
        if (!(await confirm({ title: '匯入預設 FAQ', message: '將內建的 12 題預設 FAQ 匯入資料庫（僅資料庫為空時可執行）。', confirmLabel: '匯入' }))) return;
        setIsImporting(true);
        try {
            const res = await authFetch('/api/admin/faqs', { method: 'POST', body: JSON.stringify({ action: 'import-defaults' }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '匯入失敗');
            showToast(`已匯入 ${data.imported} 題預設 FAQ`, 'success');
            await fetchFaqs();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleToggleActive = async (faq) => {
        try {
            const res = await authFetch('/api/admin/faqs', { method: 'PUT', body: JSON.stringify({ id: faq.id, isActive: !faq.is_active }) });
            if (!res.ok) throw new Error('更新失敗');
            setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_active: !f.is_active } : f));
        } catch (e) {
            showToast(e.message, 'error');
        }
    };

    // 拖拉放開後:僅更新順序有變的項目,並同步本地 display_order
    const persistOrder = useCallback(() => {
        setFaqs(current => {
            const changed = current
                .map((f, i) => ({ id: f.id, order: (i + 1) * 10, prev: f.display_order }))
                .filter(x => x.prev !== x.order);
            if (changed.length > 0) {
                Promise.all(changed.map(x =>
                    authFetch('/api/admin/faqs', { method: 'PUT', body: JSON.stringify({ id: x.id, displayOrder: x.order }) })
                )).catch(() => { showToast('排序儲存失敗', 'error'); fetchFaqs(); });
            }
            return current.map((f, i) => ({ ...f, display_order: (i + 1) * 10 }));
        });
    }, [fetchFaqs]);

    const handleDelete = async (faq) => {
        if (!(await confirm({ title: '刪除問答', message: `確定刪除「${faq.question}」？此操作無法復原。`, variant: 'danger', confirmLabel: '刪除' }))) return;
        try {
            const res = await authFetch(`/api/admin/faqs?id=${faq.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('刪除失敗');
            setFaqs(prev => prev.filter(f => f.id !== faq.id));
            showToast('已刪除', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        }
    };

    const handleSave = async () => {
        if (!editing.question?.trim()) { showToast('請填寫問題', 'error'); return; }
        setIsSaving(true);
        try {
            const payload = {
                question: editing.question,
                answer: editing.answer,
                isActive: editing.is_active !== false,
                ...(editing.id ? { id: editing.id } : { displayOrder: (faqs.length + 1) * 10 }),
            };
            const res = await authFetch('/api/admin/faqs', {
                method: editing.id ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '儲存失敗');
            showToast(editing.id ? '已更新' : '已新增', 'success');
            setEditing(null);
            await fetchFaqs();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // ===== 區塊編輯操作 =====
    const updateBlock = (i, patch) => setEditing(prev => ({
        ...prev,
        answer: prev.answer.map((b, idx) => idx === i ? { ...b, ...patch } : b),
    }));
    const moveBlock = (i, dir) => setEditing(prev => {
        const next = [...prev.answer];
        const t = i + dir;
        if (t < 0 || t >= next.length) return prev;
        [next[i], next[t]] = [next[t], next[i]];
        return { ...prev, answer: next };
    });
    const removeBlock = (i) => setEditing(prev => ({ ...prev, answer: prev.answer.filter((_, idx) => idx !== i) }));
    const addBlock = (type) => setEditing(prev => ({ ...prev, answer: [...prev.answer, emptyBlock(type)] }));

    return (
        <div className="space-y-4">
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(p => ({ ...p, show: false }))} />

            {/* 動作列（分頁標題由後台殼層提供） */}
            <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex gap-2">
                    {faqs.length === 0 && !isLoading && (
                        <button onClick={handleImportDefaults} disabled={isImporting}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line-strong text-sm font-medium text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">
                            {isImporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}匯入預設 FAQ
                        </button>
                    )}
                    <button onClick={() => openEditor({ question: '', answer: [emptyBlock('paragraph')], is_active: true })}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150">
                        <Plus size={15} />新增問答
                    </button>
                </div>
            </div>

            {/* 列表(可拖拉排序) */}
            {isLoading ? (
                <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-soft"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />載入中...</div>
            ) : faqs.length === 0 ? (
                <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-soft">
                    <p className="font-semibold text-ink mb-1">尚無 FAQ 資料</p>
                    <p className="text-sm">點「匯入預設 FAQ」快速帶入現行 12 題，或「新增問答」從零開始。</p>
                </div>
            ) : (
                <Reorder.Group axis="y" values={faqs} onReorder={setFaqs}
                    className="bg-surface border border-line rounded-xl overflow-hidden list-none m-0 p-0">
                    {faqs.map((faq) => (
                        <FaqRow
                            key={faq.id}
                            faq={faq}
                            onToggle={handleToggleActive}
                            onEdit={(f) => openEditor({ ...f, answer: structuredClone(f.answer) })}
                            onDelete={handleDelete}
                            onDragEnd={persistOrder}
                        />
                    ))}
                </Reorder.Group>
            )}

            {/* 編輯器 Modal */}
            <AnimatePresence>
                {editing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
                        onClick={(e) => { if (e.target === e.currentTarget && !isSaving) setEditing(null); }}>
                        <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden">

                            <header className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
                                <h3 className="font-bold text-ink">{editing.id ? '編輯問答' : '新增問答'}</h3>
                                <button onClick={() => setEditing(null)} disabled={isSaving} aria-label="關閉"
                                    className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150"><X size={18} /></button>
                            </header>

                            <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-0 lg:divide-x divide-line">
                                {/* 左：編輯 */}
                                <div className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">問題 <span className="text-danger">*</span></label>
                                        <input value={editing.question} onChange={e => setEditing(p => ({ ...p, question: e.target.value }))}
                                            placeholder="例：什麼是彰師揚鷹生？"
                                            className="w-full bg-surface text-ink border border-line-strong rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150" />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-semibold tracking-wide text-ink-soft">答案內容區塊</span>
                                            <span className="text-[11px] text-ink-soft">標記：**粗體**、==重點==、[文字](網址)</span>
                                        </div>
                                        <div className="space-y-2.5">
                                            {editing.answer.map((block, i) => {
                                                const meta = FAQ_BLOCK_TYPES.find(t => t.type === block.type);
                                                const isListy = block.type === 'list' || block.type === 'steps';
                                                return (
                                                    <div key={i} className="border border-line rounded-xl p-3 bg-page/50">
                                                        <div className="flex items-center gap-1.5 mb-2">
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary-tint text-primary">{meta?.label || block.type}</span>
                                                            <span className="text-[11px] text-ink-soft">{meta?.hint}</span>
                                                            <span className="flex-1" />
                                                            <button onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label="區塊上移" className="p-1 rounded text-ink-soft/60 hover:text-primary disabled:opacity-30"><ChevronUp size={13} /></button>
                                                            <button onClick={() => moveBlock(i, 1)} disabled={i === editing.answer.length - 1} aria-label="區塊下移" className="p-1 rounded text-ink-soft/60 hover:text-primary disabled:opacity-30"><ChevronDown size={13} /></button>
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
                                </div>

                                {/* 右：即時預覽（與前台同一渲染器） */}
                                <div className="p-5 bg-page/40 border-t lg:border-t-0 border-line">
                                    <p className="text-xs font-semibold tracking-wide text-ink-soft mb-3">前台預覽</p>
                                    <div className="bg-surface border border-line rounded-xl p-4">
                                        <p className="text-lg font-semibold text-ink mb-2">{editing.question || '（問題）'}</p>
                                        <FaqAnswer blocks={editing.answer} />
                                    </div>
                                </div>
                            </div>

                            <footer className="flex items-center justify-between px-5 py-3.5 border-t border-line flex-shrink-0 bg-page/50">
                                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                                    <input type="checkbox" checked={editing.is_active !== false}
                                        onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                                        className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary/40" />
                                    於前台顯示
                                </label>
                                <div className="flex gap-2.5">
                                    <button onClick={() => setEditing(null)} disabled={isSaving}
                                        className="px-4 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">取消</button>
                                    <button onClick={handleSave}
                                        disabled={isSaving || !isDirty || !editing.question?.trim()}
                                        title={!isDirty ? '尚無內容變動' : !editing.question?.trim() ? '請填寫問題' : undefined}
                                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
                                        {isSaving && <Loader2 size={14} className="animate-spin" />}儲存
                                    </button>
                                </div>
                            </footer>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
