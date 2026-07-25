"use client";
import React, { useEffect, useState, useCallback } from 'react';
import AnnouncementList from "@/components/AnnouncementList";
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { localDateString, daysFromNowString } from '@/lib/announcementUi';
import { siteConfig } from '@/lib/siteConfig';

/**
 * 主頁「櫃台立牌」：取代裝飾 banner 的資訊區
 * 即時統計（開放申請中 / 7 日內截止 / 公告總數），數字可點擊捲動至公告列表
 */
function useAnnouncementStats() {
    const [stats, setStats] = useState({ open: null, closing: null, total: null });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const today = localDateString();
                const in7 = daysFromNowString(7);

                const base = () => supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('is_active', true);
                const [openRes, closingRes, totalRes] = await Promise.all([
                    base().or(`application_end_date.gte.${today},application_end_date.is.null`),
                    base().gte('application_end_date', today).lte('application_end_date', in7),
                    base(),
                ]);
                setStats({
                    open: openRes.count ?? 0,
                    closing: closingRes.count ?? 0,
                    total: totalRes.count ?? 0,
                });
            } catch (e) {
                console.error('Failed to fetch stats:', e);
            }
        };
        fetchStats();
    }, []);

    return stats;
}

const StatLight = ({ value, label, dotClass, onClick }) => (
    <button
        onClick={onClick}
        className="text-left px-5 sm:px-6 first:pl-0 border-l first:border-l-0 border-line group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded-sm"
        aria-label={`${label} ${value ?? ''} 筆，點擊查看列表`}
    >
        <span className="block text-xl sm:text-2xl font-bold text-primary tabular-nums group-hover:underline underline-offset-4">
            {value ?? '—'}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft whitespace-nowrap">
            <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
            {label}
        </span>
    </button>
);

export default function HomePageClient() {
    const stats = useAnnouncementStats();
    const [filterRequest, setFilterRequest] = useState(null);

    // 點擊統計燈號：套用對應篩選並捲動至列表
    const applyFilter = useCallback((type) => {
        setFilterRequest({ type, ts: Date.now() });
        document.getElementById('announcement-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <div className="w-full bg-page min-h-screen">
            {/* 櫃台立牌 masthead */}
            <section className="border-b border-line">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12 pb-6 sm:pb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6"
                >
                    <div className="select-none">
                        <p className="text-sm tracking-[0.14em] text-ink-soft mb-2">{siteConfig.organization}</p>
                        <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight text-balance">
                            獎助學金公告一覽表
                        </h1>
                    </div>
                    <div>
                        <div className="flex flex-wrap">
                            <StatLight value={stats.open} label="開放申請中" dotClass="bg-ok-bright" onClick={() => applyFilter('open')} />
                            <StatLight value={stats.closing} label="7 日內截止" dotClass="bg-warn-bright" onClick={() => applyFilter('closing')} />
                            <StatLight value={stats.total} label="公告總數" dotClass="bg-primary" onClick={() => applyFilter('all')} />
                        </div>
                    </div>
                </motion.div>
            </section>

            <main id="announcement-list" className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
                <div className="w-full mt-8 sm:mt-10 mb-16">
                    <AnnouncementList filterRequest={filterRequest} />
                </div>
            </main>
        </div>
    );
}
