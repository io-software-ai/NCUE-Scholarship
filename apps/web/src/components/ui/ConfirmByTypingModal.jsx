'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TriangleAlert, X, Loader2 } from 'lucide-react';
import useModalLock from '@/hooks/useModalLock';

/**
 * Cloudflare 式打字確認（不可逆的破壞性操作專用）
 * 使用者需輸入指定關鍵字（如使用者名稱）才能按下確認；
 * 點擊顯示的關鍵字可自動帶入輸入框。
 */
export default function ConfirmByTypingModal({
    isOpen,
    title = '確認永久刪除',
    description,
    keyword,
    hint = '此操作無法復原',
    confirmLabel = '永久刪除',
    isBusy = false,
    onConfirm,
    onClose,
}) {
    useModalLock(isOpen);
    const [value, setValue] = useState('');
    const inputRef = useRef(null);
    const matched = value.trim() === keyword;

    useEffect(() => {
        if (isOpen) {
            setValue('');
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape' && !isBusy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isBusy, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
                    role="alertdialog" aria-modal="true" aria-labelledby="typed-confirm-title"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <header className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-1">
                            <div className="flex items-start gap-3.5 min-w-0">
                                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-danger/10 text-danger flex-shrink-0">
                                    <TriangleAlert size={19} />
                                </span>
                                <div className="pt-0.5 min-w-0">
                                    <h2 id="typed-confirm-title" className="text-base font-bold text-ink">{title}</h2>
                                    {description && <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{description}</p>}
                                </div>
                            </div>
                            <button onClick={onClose} disabled={isBusy} aria-label="關閉"
                                className="p-2 -m-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150 flex-shrink-0">
                                <X size={17} />
                            </button>
                        </header>

                        <div className="px-5 sm:px-6 py-4">
                            <p className="text-[13px] text-ink-soft mb-2">
                                請輸入
                                <button
                                    type="button"
                                    onClick={() => { setValue(keyword); inputRef.current?.focus(); }}
                                    title="點擊自動帶入"
                                    className="mx-1.5 px-2 py-0.5 rounded-md bg-danger/10 border border-danger/30 text-danger font-semibold font-mono text-[13px] select-all
                                        hover:bg-danger/20 active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer align-middle"
                                >
                                    {keyword}
                                </button>
                                以確認操作
                            </p>
                            <input
                                ref={inputRef}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && matched && !isBusy) onConfirm(); }}
                                placeholder={keyword}
                                aria-label={`輸入 ${keyword} 以確認`}
                                className={`w-full bg-surface text-ink border rounded-lg px-3.5 py-2.5 text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2
                                    ${matched
                                        ? 'border-ok focus:border-ok focus-visible:ring-ok/30'
                                        : 'border-line-strong focus:border-danger focus-visible:ring-danger/30'}`}
                            />
                            <p className="mt-2 text-[11.5px] text-ink-soft flex items-center gap-1">
                                <TriangleAlert size={11} className="text-warn" aria-hidden="true" />{hint}
                            </p>
                        </div>

                        <footer className="flex justify-end gap-2.5 px-5 sm:px-6 py-3.5 bg-page/60 border-t border-line">
                            <button onClick={onClose} disabled={isBusy}
                                className="px-4 py-2 rounded-lg border border-line-strong text-sm font-medium text-ink hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50">
                                取消
                            </button>
                            <button onClick={onConfirm} disabled={!matched || isBusy}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white dark:text-[#10151B] text-sm font-semibold hover:brightness-110 transition-[filter] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                                {isBusy && <Loader2 size={14} className="animate-spin" />}{confirmLabel}
                            </button>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
