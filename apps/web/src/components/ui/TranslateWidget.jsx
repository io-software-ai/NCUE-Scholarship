'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Languages, Loader2, Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * 全頁即時翻譯浮鈕（Chrome Translator API — 裝置端模型、免費、無伺服器）
 *
 * 設計原則：
 * - 公告內容僅有繁體中文，不做 i18n 內容雙軌；由本元件於瀏覽器端「就地翻譯」DOM 文字。
 * - 僅在支援 Translator API 的瀏覽器（Chrome/Edge 138+）顯示；其餘瀏覽器隱藏，
 *   使用者仍可用瀏覽器內建的整頁翻譯（版面已做相容處理）。
 * - 切回中文時完整還原原文；SPA 路由切換／動態內容由 MutationObserver 接手翻譯。
 * - 尊重 translate="no"（品牌名、驗證碼、Email、程式碼區塊不翻譯）。
 */

const LANGS = [
    { code: 'en', label: 'English' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'id', label: 'Bahasa Indonesia' },
    { code: 'ja', label: '日本語' },
];

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.nodeValue;
            if (!text || !text.trim() || text.trim().length < 2) return NodeFilter.FILTER_REJECT;
            const el = node.parentElement;
            if (!el) return NodeFilter.FILTER_REJECT;
            if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
            if (el.closest('[translate="no"], .notranslate, [data-translate-widget]')) return NodeFilter.FILTER_REJECT;
            if (!/[一-鿿]/.test(text)) return NodeFilter.FILTER_REJECT; // 只翻譯含中文的節點
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode()) && nodes.length < 2500) nodes.push(n);
    return nodes;
}

export default function TranslateWidget() {
    const [supported, setSupported] = useState(false);
    const [open, setOpen] = useState(false);
    const [activeLang, setActiveLang] = useState(null);   // null = 原文（繁中）
    const [status, setStatus] = useState('idle');          // idle | preparing | translating
    const [progress, setProgress] = useState(0);

    const translatorRef = useRef(null);
    const originalsRef = useRef([]);   // [{ node, original }]
    const observerRef = useRef(null);
    const runIdRef = useRef(0);

    useEffect(() => {
        setSupported(typeof self !== 'undefined' && 'Translator' in self);
    }, []);

    const restoreOriginals = useCallback(() => {
        runIdRef.current++;
        observerRef.current?.disconnect();
        observerRef.current = null;
        for (const { node, original } of originalsRef.current) {
            try { node.nodeValue = original; } catch { /* 節點可能已被移除 */ }
        }
        originalsRef.current = [];
        translatorRef.current = null;
        document.documentElement.lang = 'zh-TW';
        setActiveLang(null);
        setStatus('idle');
        setProgress(0);
    }, []);

    const translateNodes = useCallback(async (nodes, translator, runId) => {
        const CONCURRENCY = 4;
        let done = 0;
        const queue = [...nodes];
        const worker = async () => {
            while (queue.length > 0) {
                if (runIdRef.current !== runId) return;
                const node = queue.shift();
                const original = node.nodeValue;
                try {
                    const translated = await translator.translate(original.trim());
                    if (runIdRef.current !== runId) return;
                    if (translated && node.parentElement) {
                        // 只記錄尚未記錄過的原文（動態節點可能重複進來）
                        if (!originalsRef.current.some(o => o.node === node)) {
                            originalsRef.current.push({ node, original });
                        }
                        node.nodeValue = translated;
                    }
                } catch { /* 單節點失敗略過 */ }
                done++;
                if (done % 25 === 0) setProgress(Math.round((done / nodes.length) * 100));
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }, []);

    const startObserver = useCallback((translator, runId) => {
        observerRef.current?.disconnect();
        let pending = new Set();
        let timer = null;
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const added of m.addedNodes) {
                    if (added.nodeType === Node.ELEMENT_NODE) pending.add(added);
                    else if (added.nodeType === Node.TEXT_NODE && added.parentElement) pending.add(added.parentElement);
                }
            }
            if (pending.size === 0) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (runIdRef.current !== runId) return;
                const roots = [...pending];
                pending = new Set();
                const nodes = roots.flatMap(root => (root.isConnected ? collectTextNodes(root) : []));
                if (nodes.length > 0) translateNodes(nodes, translator, runId);
            }, 350);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        observerRef.current = observer;
    }, [translateNodes]);

    const handleSelect = useCallback(async (lang) => {
        setOpen(false);
        if (activeLang === lang.code) return;
        restoreOriginals();

        const runId = ++runIdRef.current;
        setStatus('preparing');
        setActiveLang(lang.code);
        try {
            // 語言來源優先 zh-Hant，個別語言對不支援時退回 zh
            let source = 'zh-Hant';
            let availability = await self.Translator.availability({ sourceLanguage: source, targetLanguage: lang.code });
            if (availability === 'unavailable') {
                source = 'zh';
                availability = await self.Translator.availability({ sourceLanguage: source, targetLanguage: lang.code });
            }
            if (availability === 'unavailable') throw new Error('此語言不支援');

            const translator = await self.Translator.create({
                sourceLanguage: source,
                targetLanguage: lang.code,
                monitor(m) {
                    m.addEventListener('downloadprogress', e => {
                        if (runIdRef.current === runId) setProgress(Math.round((e.loaded || 0) * 100));
                    });
                },
            });
            if (runIdRef.current !== runId) return;
            translatorRef.current = translator;

            setStatus('translating');
            setProgress(0);
            const nodes = collectTextNodes(document.body);
            await translateNodes(nodes, translator, runId);
            if (runIdRef.current !== runId) return;

            document.documentElement.lang = lang.code;
            startObserver(translator, runId);
            setStatus('idle');
            setProgress(0);
        } catch (e) {
            console.warn('[Translate] failed:', e.message);
            if (runIdRef.current === runId) restoreOriginals();
        }
    }, [activeLang, restoreOriginals, translateNodes, startObserver]);

    useEffect(() => () => { observerRef.current?.disconnect(); }, []);

    if (!supported) return null;

    const busy = status !== 'idle';
    const activeLabel = LANGS.find(l => l.code === activeLang)?.label;

    return (
        <div data-translate-widget className="fixed left-4 bottom-4 z-40 print:hidden select-none">
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-2 left-0 w-48 bg-surface border border-line rounded-xl shadow-xl overflow-hidden"
                    >
                        <p className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-widest text-ink-soft">頁面語言</p>
                        <button
                            onClick={restoreOriginals}
                            className="flex items-center justify-between w-full px-3.5 py-2 text-sm text-ink hover:bg-primary-tint/50 transition-colors duration-100"
                        >
                            中文（原文）
                            {activeLang === null && <Check size={14} className="text-primary" />}
                        </button>
                        {LANGS.map(lang => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelect(lang)}
                                className="flex items-center justify-between w-full px-3.5 py-2 text-sm text-ink hover:bg-primary-tint/50 transition-colors duration-100"
                            >
                                {lang.label}
                                {activeLang === lang.code && <Check size={14} className="text-primary" />}
                            </button>
                        ))}
                        <p className="px-3.5 py-1.5 text-[10px] text-ink-soft/70 border-t border-line leading-relaxed">
                            由瀏覽器裝置端 AI 即時翻譯，僅供參考，請以中文原文為準。
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-label="切換頁面語言"
                title="切換頁面語言"
                className={`flex items-center gap-1.5 h-10 rounded-full border shadow-lg backdrop-blur-sm transition-colors duration-150 px-3
                    ${activeLang
                        ? 'bg-primary text-white dark:text-[#10151B] border-primary'
                        : 'bg-surface/90 text-ink-soft border-line hover:text-primary hover:border-primary/50'}`}
            >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Languages size={17} aria-hidden="true" />}
                {activeLang && !busy && <span className="text-xs font-bold pr-0.5">{activeLabel}</span>}
                {busy && <span className="text-xs font-bold pr-0.5 tabular-nums">{status === 'preparing' ? '準備中' : `${progress}%`}</span>}
                {activeLang && !busy && (
                    <X size={13} className="opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); restoreOriginals(); }} aria-label="還原中文" />
                )}
            </button>
        </div>
    );
}
