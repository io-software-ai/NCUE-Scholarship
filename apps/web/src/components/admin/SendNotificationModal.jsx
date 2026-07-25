'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TinyMCE from '../TinyMCE';
import { X, Send, Loader2, Edit3, Eye } from 'lucide-react';
import Button from '../ui/Button';
import { siteConfig } from '@/lib/siteConfig';
import { renderEmailShell } from '@/lib/emailTemplate';

export default function SendNotificationModal({ isOpen, onClose, user, onConfirm, isSending, targetCount, targetLabel = '所有使用者' }) {
    const [emailData, setEmailData] = useState({ subject: '', body: '' });
    const [activeTab, setActiveTab] = useState('edit'); // 'edit' or 'preview'
    const isBulkSend = !user;

    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('modal-open');
            setActiveTab('edit'); // 重置分頁
        } else {
            document.body.classList.remove('modal-open');
        }
        return () => document.body.classList.remove('modal-open');
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (isBulkSend) {
                setEmailData({
                    subject: `[校外獎助學金平台] 重要公告`,
                    body: `<p>親愛的同學，您好：</p><p>這是一封來自「${siteConfig.name}」的系統通知信。</p><p>...</p><p>若有任何疑問，歡迎隨時與我們聯繫。<br>${siteConfig.signature}</p>`
                });
            }
            else if (user) {
                setEmailData({
                    subject: `[重要通知] 主旨`,
                    body: `<p>親愛的 ${user.name || 'User'} 同學，您好：</p><p>...</p><p>若有任何疑問，歡迎隨時與我們聯繫。<br>${siteConfig.signature}</p>`
                });
            }
        }
    }, [isOpen, user, isBulkSend]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEmailData(prev => ({ ...prev, [name]: value }));
    };

    const handleBodyChange = useCallback((content) => {
        setEmailData(prev => ({ ...prev, body: content }));
    }, []);

    const handleConfirmClick = () => {
        onConfirm({
            subject: emailData.subject,
            htmlContent: emailData.body
        });
    };

    // 即時預覽與實際寄出（send-custom-email）共用同一個模板，所見即所得
    const emailPreviewHtml = renderEmailShell({
        heading: emailData.subject || '(預覽標題)',
        bodyHtml: emailData.body || '(預覽內文)',
    });

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
                        className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col h-[95vh] sm:h-[85vh] max-h-[900px] overflow-hidden border border-line mt-auto sm:mt-0 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 sm:p-5 border-b border-line flex justify-between items-center flex-shrink-0 bg-surface">
                             <h2 className="text-base sm:text-lg font-bold text-ink truncate pr-2">
                                {isBulkSend
                                    ? `寄送群體通知 (${targetCount} 人)`
                                    : `寄送通知給 ${user?.name}`
                                }
                            </h2>
                            <button onClick={onClose} className="text-ink-soft/60 hover:text-ink p-2 rounded-full hover:bg-surface-hover transition-colors"><X size={20} /></button>
                        </div>

                        {/* Mobile Tabs */}
                        <div className="flex lg:hidden border-b border-line bg-page/50">
                            <button 
                                onClick={() => setActiveTab('edit')}
                                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'edit' ? 'border-primary text-primary bg-surface' : 'border-transparent text-ink-soft'}`}
                            >
                                <Edit3 size={16} /> 編輯內容
                            </button>
                            <button 
                                onClick={() => setActiveTab('preview')}
                                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'preview' ? 'border-primary text-primary bg-surface' : 'border-transparent text-ink-soft'}`}
                            >
                                <Eye size={16} /> 預覽效果
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 bg-surface p-4 sm:p-6">
                            <div className={`flex flex-col h-full gap-6 ${activeTab === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
                                {/* Subject Input */}
                                <div className="flex-shrink-0">
                                    <label htmlFor="subject" className="block text-xs font-bold text-ink-soft/60 uppercase tracking-wider mb-1.5">郵件主旨</label>
                                    <input id="subject" type="text" name="subject" value={emailData.subject} onChange={handleChange}
                                        className="w-full px-4 py-3 bg-page border border-line rounded-xl shadow-sm transition-all duration-300
                                            focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10 font-medium" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                                    {/* Editor Section */}
                                    <div className={`flex flex-col flex-1 min-h-0 ${activeTab === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
                                        <label htmlFor="body" className="block text-xs font-bold text-ink-soft/60 uppercase tracking-wider mb-1.5 flex-shrink-0">郵件內文</label>
                                        <div className="relative flex-grow min-h-[400px] lg:min-h-0 h-full overflow-hidden">
                                            <TinyMCE
                                                value={emailData.body}
                                                onChange={handleBodyChange}
                                                disabled={isSending}
                                                init={{
                                                    height: "100%",
                                                    plugins: 'lists link image table code help wordcount',
                                                    toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image | code',
                                                    content_style: 'body { font-family: "Noto Sans TC", sans-serif; font-size: 14px; }',
                                                    statusbar: true,
                                                    branding: false,
                                                    resize: false,
                                                    autoresize_bottom_margin: 0 // Ensure no extra margin
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Preview Section (Desktop) */}
                                    <div className="hidden lg:flex flex-col flex-1 min-h-0">
                                        <label className="block text-xs font-bold text-ink-soft/60 uppercase tracking-wider mb-1.5 flex-shrink-0">即時預覽</label>
                                        <div className="flex-grow bg-page rounded-xl overflow-hidden border border-line">
                                            <iframe
                                                srcDoc={emailPreviewHtml}
                                                className="w-full h-full border-0"
                                                title="Email Preview"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Preview View */}
                            <div className={`h-full flex flex-col ${activeTab === 'preview' ? 'flex lg:hidden' : 'hidden'}`}>
                                <label className="block text-xs font-bold text-ink-soft/60 uppercase tracking-wider mb-1.5 flex-shrink-0">預覽效果</label>
                                <div className="flex-grow bg-page rounded-xl overflow-hidden border border-line min-h-[400px]">
                                    <iframe
                                        srcDoc={emailPreviewHtml}
                                        className="w-full h-full border-0"
                                        title="Email Preview Mobile"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:p-5 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 bg-page flex-shrink-0">
                            <p className="text-xs text-ink-soft/60 font-medium hidden sm:block">
                                郵件將以密件副本 (BCC) 方式分批寄送給收件者。
                            </p>
                            <div className="flex w-full sm:w-auto gap-3">
                                <button onClick={onClose} className="sm:hidden flex-1 px-6 py-2.5 text-sm font-bold text-ink-soft hover:text-ink transition-colors border border-line rounded-lg">取消</button>
                                <button
                                    onClick={handleConfirmClick}
                                    disabled={isSending || !emailData.subject || !emailData.body}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 sm:py-2 text-sm font-semibold rounded-lg border border-primary/40 bg-transparent text-primary transition-colors duration-150 hover:bg-primary-tint disabled:opacity-50"
                                >
                                    {isSending ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Send size={18} />
                                    )}
                                    <span>{isSending ? '郵件寄送中...' : '確認寄送'}</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
