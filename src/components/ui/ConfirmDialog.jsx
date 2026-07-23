'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TriangleAlert, HelpCircle } from 'lucide-react';
import useModalLock from '@/hooks/useModalLock';

/**
 * 全站共用確認對話框（取代瀏覽器原生 confirm）
 *
 * 用法：
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, message, variant: 'danger' }))) return;
 *
 * variant: 'primary'（一般確認）| 'danger'（破壞性操作，預設聚焦「取消」）
 */
const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const resolverRef = useRef(null);

    const confirm = useCallback((options = {}) => new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog({
            title: '請確認',
            message: '',
            confirmLabel: '確定',
            cancelLabel: '取消',
            variant: 'primary',
            ...options,
        });
    }), []);

    const close = useCallback((result) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setDialog(null);
    }, []);

    useEffect(() => {
        if (!dialog) return;
        const onKey = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [dialog, close]);

    useModalLock(!!dialog);
    const isDanger = dialog?.variant === 'danger';

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AnimatePresence>
                {dialog && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
                        role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="p-5 sm:p-6">
                                <div className="flex items-start gap-3.5">
                                    <span className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0
                                        ${isDanger ? 'bg-danger/10 text-danger' : 'bg-primary-tint text-primary'}`}>
                                        {isDanger ? <TriangleAlert size={19} /> : <HelpCircle size={19} />}
                                    </span>
                                    <div className="min-w-0 pt-0.5">
                                        <h2 id="confirm-title" className="text-base font-bold text-ink">{dialog.title}</h2>
                                        {dialog.message && (
                                            <p id="confirm-message" className="mt-1.5 text-sm text-ink-soft leading-relaxed whitespace-pre-line">{dialog.message}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2.5 px-5 sm:px-6 py-3.5 bg-page/60 border-t border-line">
                                <button onClick={() => close(false)} autoFocus={isDanger}
                                    className="px-4 py-2 rounded-lg border border-line-strong text-sm font-medium text-ink hover:bg-surface-hover transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none">
                                    {dialog.cancelLabel}
                                </button>
                                <button onClick={() => close(true)} autoFocus={!isDanger}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold text-white dark:text-[#10151B] transition-colors duration-150 focus-visible:ring-2 outline-none active:scale-[0.98]
                                        ${isDanger
                                            ? 'bg-danger hover:brightness-110 focus-visible:ring-danger/40'
                                            : 'bg-primary hover:bg-primary-hover focus-visible:ring-primary/40'}`}>
                                    {dialog.confirmLabel}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => useContext(ConfirmContext);
