"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ImagePlus, Loader2, CheckCircle2, Send, Trash2 } from 'lucide-react';
import useModalLock from '@/hooks/useModalLock';
import { useAuth } from '@/hooks/useAuth';

const FEEDBACK_TYPES = ['介面顯示問題', '公告資料錯誤', '功能建議', '其他'];
const MAX_FILES = 3;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 問題回報彈出卡片（取代跳轉 Google 表單）
 * 支援附加圖片，送出後由 /api/send-feedback 寄信至平台維護信箱
 */
export default function FeedbackModal({ isOpen, onClose }) {
    const { user } = useAuth();
    const [type, setType] = useState(FEEDBACK_TYPES[0]);
    const [description, setDescription] = useState('');
    const [email, setEmail] = useState('');
    const [files, setFiles] = useState([]); // { file, url }
    const [status, setStatus] = useState('idle'); // idle | sending | done
    const [error, setError] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const [pageUrl, setPageUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            setStatus('idle'); setError('');
            setPageUrl(window.location.href); // 開啟當下記錄所在頁面
        } else {
            // 關閉時釋放預覽 URL
            setFiles(prev => { prev.forEach(f => URL.revokeObjectURL(f.url)); return []; });
            setDescription(''); setEmail(''); setType(FEEDBACK_TYPES[0]);
        }
    }, [isOpen]);

    // 聯絡 Email 自動帶入登入者的 Google 帳號信箱（仍可自行修改）
    useEffect(() => {
        if (isOpen) setEmail(user?.email || '');
    }, [isOpen, user?.email]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && status !== 'sending') onClose(); };
        if (isOpen) document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, status]);

    // 鎖定背景捲動並隱藏 Header（計數式共用 hook，支援疊層）
    useModalLock(isOpen);

    const addFiles = (list) => {
        // FileList 是 live 集合：input.value 清空後內容會跟著消失，
        // 且 setState updater 為延後執行，必須先同步快照再驗證。
        const incoming = Array.from(list || []);
        if (incoming.length === 0) return;

        let err = '';
        const additions = [];
        for (const file of incoming) {
            if (files.length + additions.length >= MAX_FILES) { err = `最多附加 ${MAX_FILES} 張圖片`; break; }
            if (!file.type.startsWith('image/')) { err = '僅支援圖片檔案'; continue; }
            if (file.size > MAX_SIZE) { err = `圖片需小於 5MB：${file.name}`; continue; }
            additions.push({ file, url: URL.createObjectURL(file) });
        }
        setError(err);
        if (additions.length > 0) setFiles(prev => [...prev, ...additions]);
    };

    const removeFile = (index) => {
        setFiles(prev => {
            URL.revokeObjectURL(prev[index].url);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async () => {
        if (!description.trim()) { setError('請填寫問題描述'); return; }
        setStatus('sending'); setError('');
        try {
            const fd = new FormData();
            fd.append('type', type);
            fd.append('description', description.trim());
            fd.append('email', email.trim());
            fd.append('page', pageUrl || window.location.href);
            files.forEach(f => fd.append('images', f.file));

            const res = await fetch('/api/send-feedback', { method: 'POST', body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '送出失敗，請稍後再試');

            setStatus('done');
            setTimeout(onClose, 2000);
        } catch (e) {
            setStatus('idle');
            setError(e.message);
        }
    };

    const inputCls = "w-full bg-surface text-ink border border-line-strong rounded-lg px-3.5 py-2.5 text-sm transition-colors duration-150 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && status !== 'sending') onClose(); }}
                    role="dialog" aria-modal="true" aria-labelledby="feedback-title"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
                    >
                        {status === 'done' ? (
                            <div className="py-14 px-6 text-center" role="status">
                                <div className="w-14 h-14 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-7 h-7" />
                                </div>
                                <p className="font-bold text-ink text-base mb-1">回報已送出</p>
                                <p className="text-sm text-ink-soft">已寄送至平台維護信箱，感謝你的協助！</p>
                            </div>
                        ) : (
                            <>
                                <header className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4">
                                    <div>
                                        <h2 id="feedback-title" className="text-base sm:text-lg font-bold text-ink">問題回報</h2>
                                    </div>
                                    <button onClick={onClose} disabled={status === 'sending'} aria-label="關閉回報視窗"
                                        className="p-2 -m-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150">
                                        <X size={18} />
                                    </button>
                                </header>

                                <div className="px-5 sm:px-6 pb-2 overflow-y-auto space-y-4">
                                    {pageUrl && (
                                        <p className="flex items-center gap-2 text-[11.5px] text-ink-soft bg-page border border-line rounded-lg px-3 py-2">
                                            <span className="font-semibold flex-shrink-0">回報頁面</span>
                                            <span className="truncate" title={pageUrl}>{pageUrl}</span>
                                        </p>
                                    )}
                                    <div>
                                        <label htmlFor="fb-type" className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">問題類型</label>
                                        <select id="fb-type" value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                                            {FEEDBACK_TYPES.map(t => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="fb-desc" className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">問題描述 <span className="text-danger">*</span></label>
                                        <textarea id="fb-desc" rows={4} value={description} onChange={e => setDescription(e.target.value)}
                                            placeholder="請描述遇到的狀況、發生的頁面與操作步驟"
                                            className={`${inputCls} resize-y min-h-24 leading-relaxed`} />
                                    </div>
                                    <div>
                                        <span className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">附加圖片（選填，最多 {MAX_FILES} 張、各 5MB 內）</span>
                                        <label
                                            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                            onDragLeave={() => setIsDragOver(false)}
                                            onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                                            className={`flex items-center justify-center gap-2 border-[1.5px] border-dashed rounded-xl px-4 py-5 text-[13px] cursor-pointer transition-colors duration-150
                                                focus-within:ring-2 focus-within:ring-primary/40 ${isDragOver ? 'border-primary bg-primary-tint text-primary' : 'border-line-strong text-ink-soft hover:border-primary hover:text-primary hover:bg-primary-tint/60'}`}
                                        >
                                            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                                            <ImagePlus size={16} /> 點擊或拖曳圖片到此處
                                        </label>
                                        {files.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2.5">
                                                {files.map((f, i) => (
                                                    <span key={f.url} className="flex items-center gap-2 border border-line rounded-lg pl-1.5 pr-2 py-1.5 text-xs text-ink">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={f.url} alt="" className="w-8 h-8 object-cover rounded-md" />
                                                        <span className="max-w-32 truncate">{f.file.name}</span>
                                                        <span className="text-ink-soft">{(f.file.size / 1024).toFixed(0)} KB</span>
                                                        <button onClick={() => removeFile(i)} aria-label={`移除圖片 ${f.file.name}`}
                                                            className="p-2 -m-1 rounded text-ink-soft hover:text-danger transition-colors duration-150">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="fb-email" className="block text-xs font-semibold tracking-wide text-ink-soft mb-1.5">聯絡 Email（選填，方便我們回覆你）</label>
                                        <input id="fb-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                                            placeholder="user@gmail.com" className={inputCls} />
                                    </div>
                                    {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
                                </div>

                                <footer className="flex justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-line mt-3">
                                    <button onClick={onClose} disabled={status === 'sending'}
                                        className="px-4 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">
                                        取消
                                    </button>
                                    <button onClick={handleSubmit} disabled={status === 'sending'}
                                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 active:scale-[0.98] disabled:opacity-60">
                                        {status === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                                        {status === 'sending' ? '送出中…' : '送出回報'}
                                    </button>
                                </footer>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
