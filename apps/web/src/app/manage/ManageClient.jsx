'use client';

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/authFetch';
import SettingsTab from '@/components/admin/SettingsTab';
import AnnouncementsTab from '@/components/admin/AnnouncementsTab';
import UsersTab from '@/components/admin/UsersTab';
import ExportAndStatisticsTab from '@/components/admin/ExportAndStatisticsTab';
import LineTab from '@/components/admin/LineTab';
import FaqTab from '@/components/admin/FaqTab';
import KnowledgeGapTab from '@/components/admin/KnowledgeGapTab';
import Toast from '@/components/ui/Toast';
import { Users, FileText, Loader2, Shield, BarChart, MessageCircle, HelpCircle, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 管理後台殼層 — 現代 dashboard 佈局
 * 桌機：左側固定側欄導覽；行動：頂部橫捲膠囊列。
 * 各分頁內容元件（admin/*Tab）維持獨立模組。
 */
const TABS = [
    { id: 'announcements', label: '公告管理', description: '建立、編輯與封存獎助學金公告', icon: FileText, component: <AnnouncementsTab /> },
    { id: 'users', label: '使用者管理', description: '平台帳號、權限與通知管理', icon: Users, component: <UsersTab /> },
    { id: 'export-stats', label: '匯出與統計', description: '瀏覽數據、報表匯出與過期公告清理', icon: BarChart, component: <ExportAndStatisticsTab /> },
    { id: 'line', label: 'LINE 管理', description: '官方帳號對話、AI 自動回覆與帳號綁定', icon: MessageCircle, customHeader: true, component: <LineTab /> },
    { id: 'faqs', label: '常見問題', description: '前台 FAQ 內容維護（受控樣式）', icon: HelpCircle, component: <FaqTab /> },
    { id: 'knowledge-gaps', label: 'AI 品質', description: '知識缺口分析與 FAQ 草稿審核', icon: Lightbulb, component: <KnowledgeGapTab /> },
    { id: 'settings', label: '系統設定', description: '金鑰、郵件與系統參數', icon: Shield, component: <SettingsTab /> },
];

const NavItem = ({ tab, isActive, onClick, compact = false }) => (
    <button
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={compact
            ? `flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-sm font-medium border transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                ${isActive
                    ? 'bg-primary-tint text-primary border-primary/40 font-semibold'
                    : 'bg-surface text-ink-soft border-line hover:text-ink hover:bg-surface-hover'}`
            : `relative flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-sm font-medium text-left transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                ${isActive
                    ? 'bg-primary-tint text-primary font-semibold'
                    : 'text-ink-soft hover:text-ink hover:bg-surface-hover'}`
        }
    >
        {!compact && isActive && (
            <motion.span layoutId="admin-nav-indicator" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
        )}
        <tab.icon size={compact ? 15 : 17} className="flex-shrink-0" aria-hidden="true" />
        {tab.label}
    </button>
);

function ManagePageContent() {
    const { isAuthenticated, isAdmin, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'announcements');
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
    const showToast = (message, type) => setToast({ show: true, message, type });
    const hideToast = () => setToast(prev => ({ ...prev, show: false }));

    useEffect(() => {
        if (!loading && (!isAuthenticated || !isAdmin)) {
            router.push('/login?redirect=/manage');
        }
    }, [isAuthenticated, isAdmin, loading, router]);

    // 過期公告提醒（超過 2 年）
    useEffect(() => {
        const checkOverdue = async () => {
            if (!isAuthenticated || !isAdmin) return;
            try {
                const res = await authFetch('/api/admin/announcements/stats');
                const data = await res.json();
                if (data.overdueCount > 0) {
                    showToast(`系統偵測到有 ${data.overdueCount} 筆公告已過期 (超過 2 年)，建議前往「匯出與統計」進行匯出並刪除。`, 'error');
                }
            } catch (e) { console.error('Failed to check overdue', e); }
        };
        checkOverdue();
    }, [isAuthenticated, isAdmin]);

    const handleTabClick = (tabId) => {
        setActiveTab(tabId);
        router.push(`/manage?tab=${tabId}`, { scroll: false });
    };

    if (loading || !isAuthenticated || !isAdmin) {
        return <div className="w-full flex items-center justify-center py-24"><Loader2 className="h-12 w-12 text-primary animate-spin" /></div>;
    }

    const active = TABS.find(tab => tab.id === activeTab) || TABS[0];

    return (
        // 注意：根元素不可加 min-h-screen——上方尚有 header 偏移與麵包屑，會使文件總高必然超出視窗而產生外層滾動
        <div className="w-full bg-page">
            <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
                <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">

                    {/* 桌機側欄 */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-24 select-none">
                            <div className="px-3.5 mb-5">
                                <h1 className="text-lg font-bold text-ink tracking-tight">管理後台</h1>
                                <p className="text-[11px] text-ink-soft tracking-widest mt-0.5">ADMIN DASHBOARD</p>
                            </div>
                            <nav className="space-y-1" aria-label="後台導覽">
                                {TABS.map(tab => (
                                    <NavItem key={tab.id} tab={tab} isActive={activeTab === tab.id} onClick={() => handleTabClick(tab.id)} />
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* 行動版頂部膠囊列 */}
                    <div className="lg:hidden mb-5 select-none">
                        <h1 className="text-xl font-bold text-ink tracking-tight mb-3">管理後台</h1>
                        <nav className="flex gap-2 overflow-x-auto pb-1.5 -mx-4 px-4" aria-label="後台導覽">
                            {TABS.map(tab => (
                                <NavItem key={tab.id} tab={tab} isActive={activeTab === tab.id} onClick={() => handleTabClick(tab.id)} compact />
                            ))}
                        </nav>
                    </div>

                    {/* 內容區 */}
                    <main className="min-w-0">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={active.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {!active.customHeader && (
                                    <header className="mb-5 select-none hidden lg:block">
                                        <h2 className="text-2xl font-bold text-ink tracking-tight flex items-center gap-2.5">
                                            <active.icon size={22} className="text-primary" aria-hidden="true" />{active.label}
                                        </h2>
                                        <p className="text-sm text-ink-soft mt-1">{active.description}</p>
                                    </header>
                                )}
                                {active.component}
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={hideToast} />
        </div>
    );
}

export default function ManagePage() {
    return (
        <Suspense fallback={
            <div className="w-full flex items-center justify-center py-24">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
        }>
            <ManagePageContent />
        </Suspense>
    );
}
