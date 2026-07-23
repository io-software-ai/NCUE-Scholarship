import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';
import EmailPreview from './previews/EmailPreview';
import LinePreview from './previews/LinePreview';

export default function AnnouncementPreviewModal({ isOpen, type, announcement, onConfirm, onClose }) {
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => document.body.classList.remove('modal-open');
    }, [isOpen]);

    const handleConfirm = async () => {
        setIsSending(true);
        await onConfirm();
        setIsSending(false);
    };

    if (!announcement) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex justify-center items-center p-0 sm:p-4 cursor-pointer"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.95, y: 20, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[95vh] sm:h-[85vh] max-h-[900px] overflow-hidden border border-line mt-auto sm:mt-0 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 sm:p-5 border-b border-line flex justify-between items-center flex-shrink-0 bg-surface">
                            <h2 className="text-base sm:text-lg font-bold text-ink">
                                {type === 'email' ? 'Email 通知預覽' : 'LINE 通知預覽'}
                            </h2>
                            <button onClick={onClose} className="text-ink-soft/60 hover:text-ink p-2 rounded-full hover:bg-surface-hover transition-colors"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 bg-page/30 p-4 sm:p-8">
                            <div className="h-full">
                                {type === 'email' && <EmailPreview announcement={announcement} />}
                                {type === 'line' && <LinePreview announcement={announcement} />}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:p-5 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 bg-page flex-shrink-0">
                            <p className="text-xs text-ink-soft/60 font-medium hidden sm:block">
                                郵件將以密件副本 (BCC) 方式分批寄送給收件者。
                            </p>
                            <div className="flex w-full sm:w-auto gap-3">
                                <button onClick={onClose} className="sm:hidden flex-1 px-6 py-2.5 text-sm font-bold text-ink-soft hover:text-ink transition-colors border border-line rounded-lg text-center">取消</button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={isSending}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 sm:py-2 text-sm font-semibold rounded-lg border border-primary/40 bg-transparent text-primary transition-colors duration-150 hover:bg-primary-tint disabled:opacity-50"
                                >
                                    {isSending ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Send size={18} />
                                    )}
                                    <span>
                                        {isSending ? '發送中...' : `確認寄送`}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
