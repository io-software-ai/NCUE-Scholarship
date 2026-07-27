"use client";

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ExternalLink } from 'lucide-react';
import useModalLock from '@/hooks/useModalLock';
import { siteConfig } from '@/lib/siteConfig';

const { testerGroupUrl, becomeTesterUrl, storeUrl } = siteConfig.android;

const STEPS = [
    {
        title: '加入 Google 群組取得測試資格',
        href: testerGroupUrl,
        linkLabel: 'groups.google.com/g/iosoftware-testing',
    },
    {
        title: '在網頁中點選「成為測試人員 (Become a tester)」',
        href: becomeTesterUrl,
        linkLabel: 'play.google.com/apps/testing',
        warning: '請確保瀏覽器登入的 Google 帳號，與手機 Google Play 商店登入的帳號是同一個！',
    },
    {
        title: '前往商店下載 App',
        desc: '畫面顯示「您已成為測試人員」後，點擊下方連結即會跳轉 Play 商店安裝頁面。',
        href: storeUrl,
        linkLabel: 'play.google.com/store/apps',
    },
];

/**
 * Google Play 徽章（品牌素材不可變形，僅等比縮放）
 * onClick 傳入時作為按鈕開啟安裝指引，未傳入則直接連往商店頁。
 */
export function GooglePlayBadge({
    onClick,
    className = 'h-11',
    label = '從 Google Play 下載 App',
    ringClass = 'focus-visible:ring-primary/50 focus-visible:ring-offset-surface',
}) {
    const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src="/google-play-badge-en.svg"
            alt="Get it on Google Play"
            draggable={false}
            className={`${className} w-auto`}
        />
    );

    const shared = `inline-flex rounded-lg outline-none transition-opacity duration-200 opacity-90 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 ${ringClass}`;

    if (onClick) {
        return (
            <button type="button" onClick={onClick} aria-label={label} className={`${shared} cursor-pointer`}>
                {img}
            </button>
        );
    }

    return (
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" aria-label={label} className={shared}>
            {img}
        </a>
    );
}

/**
 * Android App 安裝指引：App 目前以 Google Play 封閉測試釋出，
 * 未加入測試群組的帳號打開商店頁會顯示「找不到項目」，因此三步驟需依序完成。
 */
export default function PlayStoreGuideModal({ isOpen, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    useModalLock(isOpen);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                    role="dialog" aria-modal="true" aria-labelledby="play-guide-title"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-surface border border-line rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
                    >
                        <header className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4">
                            <div>
                                <h2 id="play-guide-title" className="text-base sm:text-lg font-bold text-ink">安裝 Android App</h2>
                                <p className="text-[13px] text-ink-soft mt-1">
                                    App 目前為 Google Play 封閉測試，請依序完成三個步驟。
                                </p>
                            </div>
                            <button onClick={onClose} aria-label="關閉安裝指引"
                                className="p-2 -m-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors duration-150">
                                <X size={18} />
                            </button>
                        </header>

                        <ol className="px-5 sm:px-6 pb-2 overflow-y-auto space-y-3">
                            {STEPS.map((step, i) => (
                                <li key={step.href} className="flex gap-3 border border-line rounded-xl p-3.5">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-tint text-primary text-xs font-bold flex items-center justify-center">
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-ink leading-relaxed">{step.title}</p>
                                        {step.desc && (
                                            <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">{step.desc}</p>
                                        )}
                                        <a href={step.href} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 mt-2 text-[13px] text-primary hover:text-primary-hover hover:underline break-all">
                                            {step.linkLabel}
                                            <ExternalLink size={13} className="flex-shrink-0" />
                                        </a>
                                        {step.warning && (
                                            <p className="flex gap-2 mt-2.5 text-[12.5px] text-warn leading-relaxed">
                                                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                                <span>{step.warning}</span>
                                            </p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <footer className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-2.5 px-5 sm:px-6 py-4 border-t border-line mt-3">
                            <button onClick={onClose}
                                className="px-4 py-2 rounded-lg border border-line-strong text-sm text-ink hover:bg-surface-hover transition-colors duration-150">
                                稍後再說
                            </button>
                            <a href={storeUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors duration-150 active:scale-[0.98]">
                                前往 Play 商店
                                <ExternalLink size={15} />
                            </a>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
