"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import CategoryBadge from '@/components/ui/CategoryBadge';
import { getDeadlineInfo } from '@/lib/announcementUi';
import { BellRing, BellOff, Loader2, ExternalLink } from 'lucide-react';

const DAY_OPTIONS = [1, 3, 5, 7];

/**
 * 訂閱管理：使用者已訂閱截止提醒的公告清單
 * 可就地調整提醒天數或取消訂閱；訂閱入口在公告詳情視窗。
 */
export default function SubscriptionManager({ showToast }) {
    const confirm = useConfirm();
    const [subscriptions, setSubscriptions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const notify = useCallback((message, type) => {
        if (showToast) showToast(message, type);
    }, [showToast]);

    const fetchSubscriptions = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await authFetch('/api/subscriptions');
            const data = await res.json();
            if (data.success) {
                // 只顯示仍存在且上架中的公告
                setSubscriptions((data.subscriptions || []).filter(sub => sub.announcements?.is_active));
            }
        } catch (e) { /* 靜默 */ }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

    const handleChangeDays = async (sub, days) => {
        setBusyId(sub.announcement_id);
        try {
            const res = await authFetch('/api/subscriptions', {
                method: 'POST',
                body: JSON.stringify({ announcementId: sub.announcement_id, daysBefore: days })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '更新失敗');
            setSubscriptions(prev => prev.map(item =>
                item.announcement_id === sub.announcement_id ? { ...item, days_before: days } : item
            ));
            notify(`已改為截止前 ${days} 天提醒`, 'success');
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleUnsubscribe = async (sub) => {
        if (!(await confirm({
            title: '取消訂閱提醒',
            message: `將不再於截止前提醒「${sub.announcements?.title}」。`,
            variant: 'danger',
            confirmLabel: '取消訂閱',
        }))) return;
        setBusyId(sub.announcement_id);
        try {
            const res = await authFetch(`/api/subscriptions?announcementId=${sub.announcement_id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('取消訂閱失敗');
            setSubscriptions(prev => prev.filter(item => item.announcement_id !== sub.announcement_id));
            notify('已取消訂閱', 'success');
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-line flex items-center justify-between select-none">
                <h3 className="text-base font-bold text-ink flex items-center gap-2.5">
                    <span className="p-1.5 bg-primary-tint rounded-lg"><BellRing className="h-4 w-4 text-primary" /></span>
                    截止提醒訂閱
                </h3>
                {subscriptions.length > 0 && (
                    <span className="text-xs text-ink-soft tabular-nums">{subscriptions.length} 筆</span>
                )}
            </div>

            {isLoading ? (
                <div className="p-10 text-center text-ink-soft"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />載入中...</div>
            ) : subscriptions.length === 0 ? (
                <div className="p-10 text-center select-none">
                    <BellOff className="h-10 w-10 mx-auto mb-3 text-ink-soft/40" aria-hidden="true" />
                    <p className="font-semibold text-ink text-sm mb-1">尚未訂閱任何公告提醒</p>
                    <p className="text-[12.5px] text-ink-soft leading-relaxed">
                        在公告詳情視窗點「訂閱提醒」，截止日前就會收到 Email 通知。
                    </p>
                    <Link href="/" className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-primary hover:underline underline-offset-2">
                        前往公告列表 <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                </div>
            ) : (
                <ul className="divide-y divide-line list-none m-0 p-0">
                    {subscriptions.map(sub => {
                        const ann = sub.announcements;
                        const deadline = getDeadlineInfo(ann?.application_end_date);
                        const isBusy = busyId === sub.announcement_id;
                        return (
                            <li key={sub.announcement_id} className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-3">
                                <CategoryBadge category={ann?.category} size="sm" />
                                <div className="flex-1 min-w-0">
                                    <Link href={`/?announcement_id=${sub.announcement_id}`}
                                        className="block text-sm font-medium text-ink truncate hover:text-primary transition-colors duration-150">
                                        {ann?.title}
                                    </Link>
                                    <p className={`text-[11.5px] tabular-nums mt-0.5 ${deadline.colorClass}`}>
                                        截止 {ann?.application_end_date}
                                        {deadline.stamp && <span className="ml-1.5">（{deadline.stamp}）</span>}
                                    </p>
                                </div>
                                <label className="flex items-center gap-1.5 text-xs text-ink-soft select-none">
                                    截止前
                                    <select
                                        value={sub.days_before}
                                        disabled={isBusy}
                                        onChange={e => handleChangeDays(sub, parseInt(e.target.value, 10))}
                                        aria-label={`調整「${ann?.title}」的提醒天數`}
                                        className="bg-surface text-ink border border-line-strong rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary transition-colors duration-150 disabled:opacity-50"
                                    >
                                        {DAY_OPTIONS.map(d => <option key={d} value={d}>{d} 天</option>)}
                                    </select>
                                    提醒
                                </label>
                                <button
                                    onClick={() => handleUnsubscribe(sub)}
                                    disabled={isBusy}
                                    aria-label={`取消訂閱「${ann?.title}」`}
                                    className="p-2 rounded-lg text-ink-soft hover:text-danger hover:bg-danger/10 transition-colors duration-150 disabled:opacity-50"
                                >
                                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <BellOff size={15} />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
