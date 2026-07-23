'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import useModalLock from '@/hooks/useModalLock';
import Toast from '@/components/ui/Toast';
import FaqAnswer from '@/components/FaqAnswer';
import FaqBlockEditor, { emptyBlock } from '@/components/admin/FaqBlockEditor';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles, Loader2, X, TrendingUp, MessageSquareText, CheckCircle2,
    EyeOff, RotateCcw, Wand2, FileCheck2, ChevronDown, ChevronUp, Lightbulb, RefreshCw
} from 'lucide-react';

const STATUS_META = {
    pending: { label: '待處理', cls: 'bg-warn/10 text-warn border-warn/30' },
    drafted: { label: '草稿已生成', cls: 'bg-primary-tint text-primary border-primary/30' },
    published: { label: '已發佈為 FAQ', cls: 'bg-ok/10 text-ok border-ok/30' },
    dismissed: { label: '已忽略', cls: 'bg-ink-soft/10 text-ink-soft border-line-strong' },
};

/** 缺口卡片 */
const GapCard = ({ gap, onDraft, onDismiss, onRestore, onReview, busyId }) => {
    const [open, setOpen] = useState(false);
    const meta = STATUS_META[gap.status] || STATUS_META.pending;
    const samples = Array.isArray(gap.sample_questions) ? gap.sample_questions : [];
    const isBusy = busyId === gap.id;

    return (
        <div className="bg-surface border border-line rounded-xl p-4 sm:p-5">
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-tint text-primary flex items-center justify-center mt-0.5">
                    <Lightbulb size={17} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-ink text-[15px] leading-snug">{gap.topic}</h3>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-sm text-ink-soft flex items-center gap-1.5 mb-2">
                        <TrendingUp size={13} className="text-primary flex-shrink-0" aria-hidden="true" />
                        近期約 <span className="font-bold text-ink tabular-nums">{gap.frequency}</span> 位學生詢問相關問題
                    </p>
                    {gap.representative_question && (
                        <p className="text-sm text-ink bg-page/60 border border-line rounded-lg px-3 py-2 mb-2">
                            <MessageSquareText size={13} className="inline mr-1.5 text-ink-soft/60" aria-hidden="true" />
                            {gap.representative_question}
                        </p>
                    )}
                    {gap.rationale && <p className="text-[13px] text-ink-soft/90 italic mb-2">{gap.rationale}</p>}

                    {samples.length > 0 && (
                        <div className="mb-2">
                            <button onClick={() => setOpen(o => !o)}
                                className="text-[12px] font-medium text-primary hover:underline flex items-center gap-1">
                                {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                學生實際提問樣本（{samples.length}）
                            </button>
                            {open && (
                                <ul className="mt-1.5 space-y-1 list-none p-0">
                                    {samples.map((s, i) => (
                                        <li key={i} className="text-[13px] text-ink-soft pl-3 border-l-2 border-line">{s}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 動作列 */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        {gap.status === 'published' ? (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok">
                                <CheckCircle2 size={15} aria-hidden="true" /> 已新增至前台 FAQ
                            </span>
                        ) : gap.status === 'dismissed' ? (
                            <button onClick={() => onRestore(gap)} disabled={isBusy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line-strong text-[13px] font-medium text-ink hover:bg-surface-hover transition-colors disabled:opacity-50">
                                <RotateCcw size={14} /> 還原
                            </button>
                        ) : (
                            <>
                                {gap.suggested_answer ? (
                                    <button onClick={() => onReview(gap)} disabled={isBusy}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white dark:text-[#10151B] text-[13px] font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
                                        <FileCheck2 size={14} /> 檢視草稿並發佈
                                    </button>
                                ) : (
                                    <button onClick={() => onDraft(gap)} disabled={isBusy}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white dark:text-[#10151B] text-[13px] font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
                                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                        AI 生成 FAQ 草稿
                                    </button>
                                )}
                                <button onClick={() => onDismiss(gap)} disabled={isBusy}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line-strong text-[13px] font-medium text-ink-soft hover:text-danger hover:border-danger/40 transition-colors disabled:opacity-50">
                                    <EyeOff size={14} /> 忽略
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * 知識缺口儀表板：AI 品質閉環
 * 夜間評估歸納「很多學生在問、FAQ 未涵蓋」的主題；管理員一鍵生成 FAQ 草稿，
 * 審核後才發佈為正式 FAQ（AI 僅產生草稿，務必人工批准）。
 */
export default function KnowledgeGapTab() {
    const confirm = useConfirm();
    const [gaps, setGaps] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [showDismissed, setShowDismissed] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
    const showToast = (message, type = 'info') => setToast({ show: true, message, type });

    // 審核發佈 Modal 狀態
    const [review, setReview] = useState(null); // { gap, question, answer }
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRedrafting, setIsRedrafting] = useState(false);
    useModalLock(!!review);

    const fetchGaps = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await authFetch(`/api/admin/knowledge-gaps${showDismissed ? '?all=1' : ''}`);
            const data = await res.json();
            if (data.success) setGaps(data.gaps || []);
        } catch (e) {
            showToast('無法載入知識缺口', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showDismissed]);

    useEffect(() => { fetchGaps(); }, [fetchGaps]);

    const handleEvaluate = async () => {
        setIsEvaluating(true);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'evaluate' }),
            });
            const data = await res.json();
            if (!res.ok || data.success === false) throw new Error(data.error || '評估失敗');
            showToast(data.note || `評估完成：分析 ${data.analyzedQuestions ?? 0} 則提問，更新 ${data.upserted ?? 0} 個缺口`, 'success');
            await fetchGaps();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsEvaluating(false);
        }
    };

    const handleDraft = async (gap) => {
        setBusyId(gap.id);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'draft', id: gap.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '草稿生成失敗');
            setGaps(prev => prev.map(g => g.id === gap.id ? data.gap : g));
            openReview(data.gap);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleDismiss = async (gap) => {
        if (!(await confirm({ title: '忽略此缺口', message: `「${gap.topic}」將不再出現於待處理清單。`, confirmLabel: '忽略' }))) return;
        setBusyId(gap.id);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss', id: gap.id }),
            });
            if (!res.ok) throw new Error('操作失敗');
            await fetchGaps();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleRestore = async (gap) => {
        setBusyId(gap.id);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'restore', id: gap.id }),
            });
            if (!res.ok) throw new Error('操作失敗');
            await fetchGaps();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const openReview = (gap) => {
        setReview({
            gap,
            question: gap.suggested_question || gap.topic || '',
            answer: Array.isArray(gap.suggested_answer) && gap.suggested_answer.length ? structuredClone(gap.suggested_answer) : [emptyBlock('paragraph')],
        });
    };

    const handleRedraft = async () => {
        if (!review) return;
        setIsRedrafting(true);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'draft', id: review.gap.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '重新生成失敗');
            setGaps(prev => prev.map(g => g.id === review.gap.id ? data.gap : g));
            setReview(r => ({
                ...r,
                question: data.gap.suggested_question || r.question,
                answer: Array.isArray(data.gap.suggested_answer) ? structuredClone(data.gap.suggested_answer) : r.answer,
            }));
            showToast('已重新生成草稿', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsRedrafting(false);
        }
    };

    const handlePublish = async () => {
        if (!review?.question?.trim()) { showToast('請填寫問題', 'error'); return; }
        setIsPublishing(true);
        try {
            const res = await authFetch('/api/admin/knowledge-gaps', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'publish', id: review.gap.id, question: review.question, answer: review.answer }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '發佈失敗');
            showToast('已審核發佈為正式 FAQ', 'success');
            setReview(null);
            await fetchGaps();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    const pendingCount = gaps.filter(g => g.status === 'pending' || g.status === 'drafted').length;

    return (
        <div className="space-y-4">
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(p => ({ ...p, show: false }))} />

            {/* 說明 + 動作列 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-ink-soft flex items-start gap-2">
                    <Sparkles size={15} className="text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                    系統每晚分析學生提問，找出重複詢問但 FAQ 未涵蓋的主題。AI 僅產生草稿，<span className="font-semibold text-ink">須經您審核後才會發佈</span>。
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="flex items-center gap-1.5 text-[13px] text-ink-soft cursor-pointer select-none">
                        <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)}
                            className="h-4 w-4 rounded border-line-strong text-primary focus:ring-primary/40" />
                        顯示已忽略
                    </label>
                    <button onClick={handleEvaluate} disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 disabled:opacity-60">
                        {isEvaluating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        立即評估
                    </button>
                </div>
            </div>

            {/* 列表 */}
            {isLoading ? (
                <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-soft"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />載入中...</div>
            ) : gaps.length === 0 ? (
                <div className="bg-surface border border-line rounded-xl p-12 text-center text-ink-soft">
                    <Lightbulb size={28} className="mx-auto mb-3 text-ink-soft/40" aria-hidden="true" />
                    <p className="font-semibold text-ink mb-1">目前沒有待處理的知識缺口</p>
                    <p className="text-sm">系統會於每晚自動分析；也可點「立即評估」手動觸發一次分析。</p>
                </div>
            ) : (
                <>
                    {pendingCount > 0 && (
                        <p className="text-[13px] text-ink-soft">共 <span className="font-bold text-ink">{pendingCount}</span> 個待處理缺口</p>
                    )}
                    <div className="space-y-3">
                        {gaps.map(gap => (
                            <GapCard key={gap.id} gap={gap} busyId={busyId}
                                onDraft={handleDraft} onDismiss={handleDismiss} onRestore={handleRestore} onReview={openReview} />
                        ))}
                    </div>
                </>
            )}

            {/* 審核發佈 Modal */}
            <AnimatePresence>
                {review && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
                        onClick={(e) => { if (e.target === e.currentTarget && !isPublishing) setReview(null); }}>
                        <motion.div initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden">

                            <header className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
                                <div>
                                    <h3 className="font-bold text-ink">審核 FAQ 草稿</h3>
                                    <p className="text-[12px] text-ink-soft mt-0.5">AI 依知識庫生成，發佈前請務必檢查內容正確性</p>
                                </div>
                                <button onClick={() => setReview(null)} disabled={isPublishing} aria-label="關閉"
                                    className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150"><X size={18} /></button>
                            </header>

                            <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-0 lg:divide-x divide-line">
                                {/* 左：編輯 */}
                                <div className="p-5 space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">問題 <span className="text-danger">*</span></label>
                                        <input value={review.question} onChange={e => setReview(r => ({ ...r, question: e.target.value }))}
                                            className="w-full bg-surface text-ink border border-line-strong rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150" />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-semibold tracking-wide text-ink-soft">答案內容區塊</span>
                                            <span className="text-[11px] text-ink-soft">標記：**粗體**、==重點==、[文字](網址)</span>
                                        </div>
                                        <FaqBlockEditor blocks={review.answer} onChange={(answer) => setReview(r => ({ ...r, answer }))} />
                                    </div>
                                </div>

                                {/* 右：即時預覽 */}
                                <div className="p-5 bg-page/40 border-t lg:border-t-0 border-line">
                                    <p className="text-xs font-semibold tracking-wide text-ink-soft mb-3">前台預覽</p>
                                    <div className="bg-surface border border-line rounded-xl p-4">
                                        <p className="text-lg font-semibold text-ink mb-2">{review.question || '（問題）'}</p>
                                        <FaqAnswer blocks={review.answer} />
                                    </div>
                                </div>
                            </div>

                            <footer className="flex items-center justify-between px-5 py-3.5 border-t border-line flex-shrink-0 bg-page/50">
                                <button onClick={handleRedraft} disabled={isRedrafting || isPublishing}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">
                                    {isRedrafting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}重新生成
                                </button>
                                <div className="flex gap-2.5">
                                    <button onClick={() => setReview(null)} disabled={isPublishing}
                                        className="px-4 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">取消</button>
                                    <button onClick={handlePublish} disabled={isPublishing || !review.question?.trim()}
                                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
                                        {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}審核發佈
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
