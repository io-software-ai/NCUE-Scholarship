"use client";

import { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';

// 客戶端快取：同 URL 只抓一次（跨 Modal 開合共用）
const previewCache = new Map();

/** URL 的可讀後備顯示：解碼百分比編碼、去掉協定 */
function readableUrl(url) {
    try {
        return decodeURIComponent(url).replace(/^https?:\/\//, '');
    } catch {
        return url.replace(/^https?:\/\//, '');
    }
}

/**
 * 外部連結列：顯示網站標題（如 LINE 連結預覽），標題抓取中/失敗時退回可讀網址
 */
export default function ExternalLinkRow({ url }) {
    const [title, setTitle] = useState(previewCache.get(url) ?? null);

    useEffect(() => {
        if (previewCache.has(url)) { setTitle(previewCache.get(url)); return; }
        let cancelled = false;
        fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
            .then(res => res.json())
            .then(data => {
                const value = data.success ? (data.title || null) : null;
                previewCache.set(url, value);
                if (!cancelled) setTitle(value);
            })
            .catch(() => { previewCache.set(url, null); });
        return () => { cancelled = true; };
    }, [url]);

    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { /* ignore */ }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
            className="group flex items-start gap-3 border border-line rounded-xl px-3.5 py-3
                hover:bg-surface-hover hover:border-line-strong hover:-translate-y-px
                transition-[background-color,border-color,transform] duration-150
                focus-visible:ring-2 focus-visible:ring-primary/40 outline-none">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-tint text-primary flex-shrink-0">
                <Globe size={16} aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-150">
                    {title || readableUrl(url)}
                </span>
                {title && hostname && (
                    <span className="block text-[11.5px] text-ink-soft mt-0.5 truncate">{hostname}</span>
                )}
            </span>
            <ExternalLink size={14} className="text-ink-soft group-hover:text-primary transition-colors duration-150 flex-shrink-0 mt-0.5" aria-hidden="true" />
        </a>
    );
}
