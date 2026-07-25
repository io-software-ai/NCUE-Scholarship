'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { authFetch } from '@/lib/authFetch';
import { getAnnouncementUrl } from '@/lib/siteConfig';
import { CalendarDays, ExternalLink, AlertTriangle, ChevronDown, ChevronUp, BellRing, Check, Loader2 } from 'lucide-react';

const AnnouncementCard = ({ id }) => {
    const [announcement, setAnnouncement] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);   // 預設收合，避免多筆推薦時過長
    const [subState, setSubState] = useState('idle');  // idle | loading | done | error

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setError("未提供公告 ID。");
            return;
        }

        const fetchAnnouncement = async () => {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabase
                .from('announcements')
                .select('id, title, summary, application_end_date')
                .eq('id', id)
                .single();

            if (fetchError) {
                console.error('Error fetching announcement:', fetchError);
                setError('無法載入公告資訊。');
            } else {
                setAnnouncement(data);
            }
            setLoading(false);
        };

        fetchAnnouncement();
    }, [id]);

    const handleSubscribe = async () => {
        if (subState === 'loading' || subState === 'done') return;
        setSubState('loading');
        try {
            const res = await authFetch('/api/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ announcementId: id, daysBefore: 3 }),
            });
            if (!res.ok) throw new Error((await res.json())?.error || '訂閱失敗');
            setSubState('done');
        } catch (e) {
            console.error('[AnnouncementCard] subscribe:', e);
            setSubState('error');
        }
    };

    if (loading) {
        return <div className="p-4 border border-line rounded-xl shadow-sm animate-pulse h-24"></div>;
    }

    if (error || !announcement) {
        return (
            <div className="p-3 border border-danger/30 bg-danger/10 rounded-xl text-sm text-danger flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{error || '找不到指定的公告。'}</span>
            </div>
        );
    }

    const deadline = announcement.application_end_date
        ? new Date(announcement.application_end_date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : null;
    const canSubscribe = !!announcement.application_end_date;
    const announcementUrl = getAnnouncementUrl(announcement.id);

    return (
        <div className="border border-line rounded-xl shadow-sm bg-surface overflow-hidden transition-colors duration-200 hover:border-primary/40">
            <div className="p-4">
                <div className="flex justify-between items-start gap-2">
                    <a
                        href={announcementUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex-1 flex items-start justify-between gap-2"
                    >
                        <h4 className="font-bold text-ink transition-colors group-hover:text-primary">
                            {announcement.title}
                        </h4>
                        <ExternalLink size={16} className="text-ink-soft/60 transition-colors group-hover:text-primary flex-shrink-0 mt-1" />
                    </a>
                </div>

                {/* 內文：預設收合 + 底部霧化提示，點擊展開 */}
                <div className="relative">
                    <div
                        className={`mt-3 text-sm text-ink rich-text-content ${expanded ? '' : 'max-h-28 overflow-hidden'}`}
                        dangerouslySetInnerHTML={{ __html: announcement.summary || '' }}
                    />
                    {!expanded && (
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            aria-label="展開完整內容"
                            className="absolute inset-x-0 bottom-0 h-16 flex items-end justify-center pb-1
                                bg-gradient-to-t from-surface via-surface/85 to-transparent
                                text-xs font-medium text-ink-soft hover:text-primary transition-colors"
                        >
                            <span className="flex items-center gap-1"><ChevronDown size={13} aria-hidden="true" />點擊展開完整內容</span>
                        </button>
                    )}
                </div>
                {expanded && (
                    <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-ink-soft hover:text-primary transition-colors"
                    >
                        <ChevronUp size={13} aria-hidden="true" />收合
                    </button>
                )}
            </div>

            <div className="px-4 py-2.5 border-t border-line bg-page/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-ink-soft min-w-0">
                    {deadline && (
                        <>
                            <CalendarDays size={14} className="flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">截止日期：{deadline}</span>
                        </>
                    )}
                </div>
                {canSubscribe && (
                    subState === 'done' ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-ok flex-shrink-0">
                            <Check size={13} aria-hidden="true" /> 已訂閱提醒
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubscribe}
                            disabled={subState === 'loading'}
                            title="截止前 3 天寄送 Email 提醒（可至個資管理調整）"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-primary/40 text-primary hover:bg-primary-tint transition-colors duration-150 disabled:opacity-60 flex-shrink-0"
                        >
                            {subState === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} aria-hidden="true" />}
                            訂閱提醒
                        </button>
                    )
                )}
            </div>
            {subState === 'error' && (
                <p className="px-4 pb-2 text-[11px] text-danger">訂閱失敗，請確認已登入後重試。</p>
            )}
        </div>
    );
};

export default AnnouncementCard;
