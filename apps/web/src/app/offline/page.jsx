'use client';

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { siteConfig } from '@/lib/siteConfig';

export default function OfflinePage() {
    const handleRetry = () => {
        window.location.href = '/';
    };

    return (
        <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-primary-tint rounded-full flex items-center justify-center mb-8 animate-pulse">
                <WifiOff size={48} className="text-primary" />
            </div>
            
            <h1 className="text-3xl font-bold text-ink mb-4">哎呀！網路連線中斷</h1>
            <p className="text-ink-soft mb-8 max-w-md">
                目前無法連接到伺服器。別擔心，您可以嘗試重新整理頁面，或者等網路恢復後再試一次。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
                <button 
                    onClick={handleRetry}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-hover transition-all shadow-lg shadow-indigo-200"
                >
                    <RefreshCw size={18} /> 重新嘗試
                </button>
                <Link 
                    href="/"
                    className="flex-1 flex items-center justify-center gap-2 bg-surface text-ink border border-line px-6 py-3 rounded-xl font-bold hover:bg-surface-hover transition-all"
                >
                    <Home size={18} /> 回首頁
                </Link>
            </div>

            <div className="mt-12 text-sm text-ink-soft/60">
                {siteConfig.shortName} • 離線模式
            </div>
        </div>
    );
}
