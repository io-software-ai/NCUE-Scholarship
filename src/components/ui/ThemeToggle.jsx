"use client";

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * 深淺主題切換
 * 規則：預設一律淺色；深色僅在使用者主動切換後生效（記錄於 localStorage.theme），
 * 由 layout 的 inline script 在 hydration 前套用，避免 FOUC。
 */
export default function ThemeToggle({ className = '' }) {
    const [theme, setTheme] = useState('light');
    const [mounted, setMounted] = useState(false);

    // 以 <html data-theme> 為唯一準源，MutationObserver 讓多個實例（桌機/手機）保持同步
    useEffect(() => {
        const read = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
        read();
        setMounted(true);
        const observer = new MutationObserver(read);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        // 讀 DOM 現值而非元件 state，避免多實例 stale state
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        if (next === 'dark') {
            document.documentElement.dataset.theme = 'dark';
        } else {
            delete document.documentElement.dataset.theme;
        }
        try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
            title={theme === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
            className={`flex items-center justify-center w-9 h-9 rounded-full border border-line bg-surface text-ink-soft
                hover:text-primary hover:border-line-strong transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
        >
            {/* mounted 前固定顯示太陽，避免 SSR/CSR 不一致 */}
            {mounted && theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
    );
}
