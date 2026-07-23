'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '@/lib/authFetch';
import useModalLock from '@/hooks/useModalLock';
import { X, BookOpen, Copy, Check, RefreshCw, Loader2, Clock } from 'lucide-react';

/**
 * 知識庫內容檢視器：顯示公告同步至 AI 知識庫的純文字/Markdown 內容
 * 供管理員確認 AI 實際「讀到」的內容；可單筆重新同步。
 */
export default function KnowledgeViewerModal({ announcement, onClose }) {
    useModalLock(true);
    const [knowledge, setKnowledge] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const fetchKnowledge = useCallback(async () => {
        setIsLoading(true); setError('');
        try {
            const res = await authFetch(`/api/admin/announcements/sync-knowledge?id=${announcement.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '載入失敗');
            setKnowledge(data.knowledge);
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [announcement.id]);

    useEffect(() => { fetchKnowledge(); }, [fetchKnowledge]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSync = async () => {
        setIsSyncing(true); setError('');
        try {
            const res = await authFetch('/api/admin/announcements/sync-knowledge', {
                method: 'POST',
                body: JSON.stringify({ id: announcement.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '同步失敗');
            await fetchKnowledge();
        } catch (e) {
            setError(e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCopy = async () => {
        if (!knowledge?.content) return;
        try {
            await navigator.clipboard.writeText(knowledge.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (e) { /* ignore */ }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                role="dialog" aria-modal="true" aria-label="知識庫內容檢視"
            >
                <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden"
                >
                    <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line flex-shrink-0">
                        <div className="min-w-0">
                            <h3 className="font-bold text-ink flex items-center gap-2"><BookOpen size={17} className="text-primary" />AI 知識庫內容</h3>
                            <p className="text-xs text-ink-soft mt-1 truncate">{announcement.title}</p>
                        </div>
                        <button onClick={onClose} aria-label="關閉" className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150 flex-shrink-0"><X size={18} /></button>
                    </header>

                    <div className="flex-1 overflow-y-auto p-5">
                        {isLoading ? (
                            <div className="py-16 text-center text-ink-soft"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />載入中...</div>
                        ) : knowledge ? (
                            <>
                                <div className="flex items-center gap-2 text-xs text-ink-soft mb-3">
                                    <Clock size={12} aria-hidden="true" />
                                    最後同步:{new Date(knowledge.updated_at).toLocaleString('zh-TW', { hour12: false })}
                                    <span className="ml-auto tabular-nums">{knowledge.content?.length || 0} 字</span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink bg-page border border-line rounded-xl p-4 select-text">
                                    {knowledge.content}
                                </pre>
                            </>
                        ) : (
                            <div className="py-16 text-center text-ink-soft">
                                <p className="font-semibold text-ink mb-1">此公告尚未同步至知識庫</p>
                                <p className="text-sm">點下方「重新同步」即可建立 AI 易讀內容。</p>
                            </div>
                        )}
                        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                    </div>

                    <footer className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-line flex-shrink-0 bg-page/50">
                        {knowledge?.content && (
                            <button onClick={handleCopy}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150">
                                {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}{copied ? '已複製' : '複製內容'}
                            </button>
                        )}
                        <button onClick={handleSync} disabled={isSyncing}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 disabled:opacity-60">
                            {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}重新同步
                        </button>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
