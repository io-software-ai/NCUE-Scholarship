'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Paperclip, Link as LinkIcon, Calendar, CalendarPlus, Users, Send as SendIcon, Download, Info, ExternalLink, Eye, Loader2, BellRing, BellOff, Check, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import DownloadPDFButton from '@/components/admin/DownloadPDFButton';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabase/client';
import Toast from '@/components/ui/Toast';

import CategoryBadge from '@/components/ui/CategoryBadge';
import AttachmentRow from '@/components/ui/AttachmentRow';
import ExternalLinkRow from '@/components/ui/ExternalLinkRow';
import { CATEGORY_NAMES, getDeadlineInfo, buildGoogleCalendarUrl } from '@/lib/announcementUi';

// Helper to wrap tables in a scrollable container
const wrapTables = (htmlContent) => {
    if (!htmlContent) return '';
    return htmlContent.replace(
        /(<table[^>]*>[\s\S]*?<\/table>)/gi, 
        '<div class="table-scroll-wrapper">$1</div>'
    );
};

export default function AnnouncementDetailModal({ isOpen, onClose, announcement, onNavigate = null, hasPrev = false, hasNext = false }) {
    const [viewCount, setViewCount] = useState(null);
    const { user } = useAuth();
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [fullAnnouncement, setFullAnnouncement] = useState(announcement);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const modalRef = useRef(null);

    const showToast = (message, type = 'success') => setToast({ show: true, message, type });

    // 前後公告切換（左右鍵 / 兩側箭頭），navDir 決定滑動動畫方向
    const [navDir, setNavDir] = useState(0);
    const navigate = (dir) => {
        if (!onNavigate) return;
        if (dir < 0 && !hasPrev) return;
        if (dir > 0 && !hasNext) return;
        setNavDir(dir);
        onNavigate(dir);
    };

    useEffect(() => {
        if (isOpen && announcement) {
            setFullAnnouncement(announcement);
            
            if (!announcement.attachments) {
                setIsLoadingDetails(true);
                const fetchDetails = async () => {
                    const { data, error } = await supabase
                        .from('announcements')
                        .select('*, attachments(*)')
                        .eq('id', announcement.id)
                        .single();
                    
                    if (!error && data) {
                         setFullAnnouncement(prev => ({ ...prev, ...data }));
                    } else {
                        console.error("Error fetching announcement details:", error);
                        showToast("無法載入詳細內容", "error");
                    }
                    setIsLoadingDetails(false);
                };
                fetchDetails();
            }

            document.body.classList.add('modal-open');
            
            if (announcement?.id) {
                setViewCount(announcement.view_count || 0);
                fetch('/api/announcements/view', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ announcementId: announcement.id })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.view_count !== undefined) {
                        setViewCount(data.view_count);
                    }
                })
                .catch(console.error);
            }

            // Q19 & Q8: Modal 焦點捕捉 (Focus Trap)
            const handleFocusTrap = (e) => {
                if (!modalRef.current) return;
                
                // 獲取所有可獲取焦點的元素
                const focusableElements = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusableElements.length === 0) return;
                
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.key === 'Tab') {
                    if (e.shiftKey) { // Shift + Tab: 往前循環
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else { // Tab: 往後循環
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                }
                
                // 支援 ESC 鍵關閉
                if (e.key === 'Escape') onClose();

                // 左右鍵切換前後公告
                if (e.key === 'ArrowLeft') navigate(-1);
                if (e.key === 'ArrowRight') navigate(1);
            };

            window.addEventListener('keydown', handleFocusTrap);

            // 自動聚焦到標題區
            setTimeout(() => {
                const titleElement = document.getElementById('modal-title');
                titleElement?.focus();
            }, 100);

            return () => window.removeEventListener('keydown', handleFocusTrap);

        } else {
            document.body.classList.remove('modal-open');
            setViewCount(null);
        }
    }, [isOpen, announcement]);

    // ============ 訂閱截止提醒 ============
    const [subscription, setSubscription] = useState(null);   // null | { days_before }
    const [isSubBusy, setIsSubBusy] = useState(false);
    const [subMenuOpen, setSubMenuOpen] = useState(false);
    const SUB_DAY_OPTIONS = [1, 3, 5, 7];

    const hasFutureDeadline = Boolean(
        fullAnnouncement?.application_end_date &&
        new Date(fullAnnouncement.application_end_date) >= new Date(new Date().toDateString())
    );
    const canSubscribe = Boolean(user && hasFutureDeadline);

    useEffect(() => {
        if (!isOpen || !user || !announcement?.id) { setSubscription(null); setSubMenuOpen(false); return; }
        authFetch(`/api/subscriptions?announcementId=${announcement.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) setSubscription(data.subscriptions?.[0] || null);
            })
            .catch(() => { /* 靜默：訂閱狀態載入失敗不影響閱讀 */ });
    }, [isOpen, user, announcement?.id]);

    const handleSubscribe = async (days) => {
        if (isSubBusy) return;
        setIsSubBusy(true);
        try {
            const res = await authFetch('/api/subscriptions', {
                method: 'POST',
                body: JSON.stringify({ announcementId: fullAnnouncement.id, daysBefore: days })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '訂閱失敗');
            setSubscription(data.subscription);
            setSubMenuOpen(false);
            showToast(`已訂閱：截止前 ${days} 天將寄送提醒至您的信箱`, 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSubBusy(false);
        }
    };

    const handleUnsubscribe = async () => {
        if (isSubBusy) return;
        setIsSubBusy(true);
        try {
            const res = await authFetch(`/api/subscriptions?announcementId=${fullAnnouncement.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('取消訂閱失敗');
            setSubscription(null);
            setSubMenuOpen(false);
            showToast('已取消訂閱提醒', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setIsSubBusy(false);
        }
    };
    // =====================================

    const parsedUrls = useMemo(() => {
        if (!fullAnnouncement?.external_urls) return [];
        try {
            const parsed = JSON.parse(fullAnnouncement.external_urls);
            if (Array.isArray(parsed)) {
                return parsed.filter(item => item.url && typeof item.url === 'string');
            }
        } catch (e) {
            if (typeof fullAnnouncement.external_urls === 'string' && fullAnnouncement.external_urls.startsWith('http')) {
                return [{ url: fullAnnouncement.external_urls }];
            }
        }
        return [];
    }, [fullAnnouncement]);

    // 截止緊迫度（共用規則：lib/announcementUi.getDeadlineInfo）
    const dateInfo = useMemo(() => {
        if (!fullAnnouncement) return { displayString: '未指定', colorClass: 'text-ink-soft', stamp: null, stampClass: '' };

        const deadline = getDeadlineInfo(fullAnnouncement.application_end_date, fullAnnouncement.application_start_date);

        const formattedStartDate = fullAnnouncement.application_start_date
            ? new Date(fullAnnouncement.application_start_date).toLocaleDateString('en-CA')
            : null;
        const formattedEndDate = fullAnnouncement.application_end_date
            ? new Date(fullAnnouncement.application_end_date).toLocaleDateString('en-CA')
            : '無期限';

        const displayString = formattedStartDate
            ? `${formattedStartDate} ~ ${formattedEndDate}`
            : formattedEndDate || '未指定';

        return { displayString, ...deadline };
    }, [fullAnnouncement]);

    const targetAudienceHtml = useMemo(() => {
        if (!fullAnnouncement?.target_audience) return '未指定';
        return wrapTables(fullAnnouncement.target_audience);
    }, [fullAnnouncement]);

    const finalContent = useMemo(() => {
        if (!fullAnnouncement) return '無詳細內容';
        return wrapTables(fullAnnouncement.summary || '無詳細內容');
    }, [fullAnnouncement]);

    const sortedAttachments = useMemo(() => {
        if (!fullAnnouncement?.attachments) return [];
        return [...fullAnnouncement.attachments].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }, [fullAnnouncement]);

    if (!isOpen || !fullAnnouncement) return null;

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="modal-container"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-start sm:items-center overflow-y-auto p-0 sm:p-4"
                        onClick={onClose}
                    >
                        <style>{`
                            .rich-text-content {
                                overflow-x: hidden;
                            }
                            .rich-text-content p {
                                margin-bottom: 1rem;
                            }
                            .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 {
                                font-weight: 700;
                                margin-top: 1.5rem;
                                margin-bottom: 0.75rem;
                                color: var(--color-ink);
                            }
                            .rich-text-content ul {
                                list-style-type: disc;
                                padding-left: 1.5rem;
                                margin-top: 0.5rem;
                                margin-bottom: 1rem;
                            }
                            .table-scroll-wrapper {
                                width: 100%;
                                overflow-x: auto;
                                -webkit-overflow-scrolling: touch;
                                margin-bottom: 1rem;
                                border: 1px solid var(--color-line);
                                border-radius: 0.5rem;
                            }
                            .table-scroll-wrapper table {
                                width: 100% !important;
                            }
                            .table-scroll-wrapper th,
                            .table-scroll-wrapper td {
                                white-space: normal;
                                min-width: 120px;
                            }
                            .hide-scrollbar::-webkit-scrollbar {
                                display: none;
                            }
                            .hide-scrollbar {
                                -ms-overflow-style: none;
                                scrollbar-width: none;
                            }
                            #modal-title:focus {
                                outline: none !important;
                                box-shadow: none !important;
                                border-color: transparent !important;
                            }
                        `}</style>
                        {onNavigate && hasPrev && (
                            <button
                                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                                aria-label="上一則公告（左方向鍵）"
                                className="hidden sm:flex absolute left-3 lg:left-8 top-1/2 -translate-y-1/2 z-10 w-11 h-11 items-center justify-center rounded-full bg-surface border border-line text-ink-soft shadow-lg hover:text-primary hover:border-line-strong active:scale-95 transition-[color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}
                        {onNavigate && hasNext && (
                            <button
                                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                                aria-label="下一則公告（右方向鍵）"
                                className="hidden sm:flex absolute right-3 lg:right-8 top-1/2 -translate-y-1/2 z-10 w-11 h-11 items-center justify-center rounded-full bg-surface border border-line text-ink-soft shadow-lg hover:text-primary hover:border-line-strong active:scale-95 transition-[color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                            >
                                <ChevronRight size={20} />
                            </button>
                        )}
                        <motion.div
                            ref={modalRef}
                            initial={{ scale: 0.95, y: -20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="bg-surface w-full h-full sm:h-auto sm:max-h-[calc(100vh-4rem)] sm:w-full sm:max-w-4xl sm:rounded-2xl sm:shadow-2xl sm:border sm:border-line flex flex-col relative select-none outline-none overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <AnimatePresence mode="popLayout" initial={false}>
                            <motion.div
                                key={fullAnnouncement.id}
                                initial={{ opacity: 0, x: navDir * 36 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: navDir * -36 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col flex-1 min-h-0"
                            >
                            <div className="px-5 sm:px-6 pt-5 pb-4 flex justify-between items-start gap-4 flex-shrink-0">
                                <div className="flex items-start gap-3 min-w-0 outline-none focus:outline-none focus:ring-0 focus:shadow-none" id="modal-title" tabIndex="-1">
                                    <CategoryBadge category={fullAnnouncement.category} size="md" className="mt-0.5" />
                                    <div className="min-w-0">
                                        <h2 className="text-base md:text-lg font-bold text-ink leading-snug">{fullAnnouncement.title}</h2>
                                        <p className="text-xs text-ink-soft mt-1 truncate">
                                            {CATEGORY_NAMES[fullAnnouncement.category] || '獎助學金公告'}
                                        </p>
                                    </div>
                                </div>

                                <button onClick={onClose} aria-label="關閉視窗" className="text-ink-soft hover:text-ink hover:bg-surface-hover p-2 rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none flex-shrink-0"><X size={20} /></button>
                            </div>

                            {/* 捲動區：含期限資訊條與全部內容（手機版資訊列垂直堆疊，固定會壓縮可視空間） */}
                            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
                            {/* 期限資訊條：一眼掃完三個關鍵欄位 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border-y border-line">
                                <div className="bg-page/70 px-5 sm:px-6 py-3">
                                    <p className="text-xs font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><Calendar size={13} aria-hidden="true" />申請期間</p>
                                    <p className={`text-sm font-medium tabular-nums ${dateInfo.colorClass}`}>
                                        {dateInfo.displayString}
                                        {dateInfo.stamp && (
                                            <span className={`ml-2 inline-block border border-current rounded px-1.5 text-[11px] leading-relaxed tracking-wide align-middle ${dateInfo.stampClass}`}>
                                                {dateInfo.stamp}
                                            </span>
                                        )}
                                    </p>
                                    {hasFutureDeadline && (
                                        <a
                                            href={buildGoogleCalendarUrl(fullAnnouncement, typeof window !== 'undefined' ? window.location.origin : '')}
                                            target="_blank" rel="noopener noreferrer"
                                            className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-primary/40 rounded outline-none"
                                        >
                                            <CalendarPlus size={12} aria-hidden="true" /> 加入 Google 日曆
                                        </a>
                                    )}
                                </div>
                                <div className="bg-page/70 px-5 sm:px-6 py-3">
                                    <p className="text-xs font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><SendIcon size={13} aria-hidden="true" />送件方式</p>
                                    <p className="text-sm font-medium text-ink">{fullAnnouncement.submission_method || '未指定'}</p>
                                </div>
                                <div className="bg-page/70 px-5 sm:px-6 py-3">
                                    <p className="text-xs font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><Info size={13} aria-hidden="true" />兼領限制</p>
                                    <p className="text-sm font-medium text-ink">
                                        {fullAnnouncement.application_limitations === 'Y' ? (
                                            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ok-bright" aria-hidden="true" />可兼領</span>
                                        ) : fullAnnouncement.application_limitations === 'N' ? (
                                            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger-bright" aria-hidden="true" />不可兼領</span>
                                        ) : '未指定'}
                                    </p>
                                </div>
                            </div>

                            <div className="px-5 sm:px-6 py-6 space-y-7">
                                <section>
                                    <h3 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><Users size={14} aria-hidden="true" />適用對象</h3>
                                    <div
                                        className="text-ink rich-text-content text-sm leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: targetAudienceHtml }}
                                    />
                                </section>

                                <section>
                                    <h3 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><FileText size={14} aria-hidden="true" />詳細內容</h3>
                                    {isLoadingDetails ? (
                                        <div className="flex items-center gap-2 text-ink-soft py-4">
                                            <Loader2 className="animate-spin h-5 w-5" aria-label="載入詳細內容中" />
                                            載入詳細內容中...
                                        </div>
                                    ) : (
                                        <div className="rich-text-content text-ink"
                                            dangerouslySetInnerHTML={{ __html: finalContent }} />
                                    )}
                                </section>

                                {sortedAttachments.length > 0 && (
                                    <section>
                                        <h3 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><Paperclip size={14} aria-hidden="true" />相關附件（{sortedAttachments.length}）</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            {sortedAttachments.map((att) => (
                                                <AttachmentRow key={att.id} attachment={att} />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {parsedUrls.length > 0 && (
                                    <section>
                                        <h3 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><LinkIcon size={14} aria-hidden="true" />外部連結</h3>
                                        <div className="space-y-2">
                                            {parsedUrls.map((item, index) => (
                                                <ExternalLinkRow key={index} url={item.url} />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* 手機版瀏覽數（頁尾精簡後移入內容底部） */}
                                <p className="sm:hidden flex items-center justify-center gap-1.5 text-xs text-ink-soft pt-1">
                                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span className="tabular-nums">瀏覽數：{viewCount !== null ? viewCount : '...'} 次</span>
                                </p>
                            </div>
                            </div>

                            </motion.div>
                            </AnimatePresence>

                            {/* Footer */}
                            <div className="p-3 sm:p-5 border-t border-line flex flex-row justify-between items-center gap-3 flex-shrink-0 bg-page/60">
                                <div className="hidden sm:flex items-center text-ink-soft text-sm font-medium gap-1.5 px-3">
                                    <Eye className="w-4 h-4" aria-hidden="true" />
                                    <span className="tabular-nums">瀏覽數：{viewCount !== null ? viewCount : '...'} 次</span>
                                </div>
                                <div className="flex items-center justify-center sm:justify-end gap-2.5 flex-wrap w-full sm:w-auto">
                                    {canSubscribe && (
                                        <div className="relative">
                                            <button
                                                onClick={() => setSubMenuOpen(v => !v)}
                                                disabled={isSubBusy}
                                                aria-haspopup="menu"
                                                aria-expanded={subMenuOpen}
                                                title={subscription ? `已訂閱：截止前 ${subscription.days_before} 天提醒` : '訂閱截止提醒'}
                                                className={`flex items-center justify-center gap-1.5 min-w-20 px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-150 border active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/40 outline-none disabled:opacity-60
                                                    ${subscription
                                                        ? 'text-primary bg-primary-tint border-primary/40'
                                                        : 'text-ink bg-surface hover:bg-surface-hover border-line-strong'}`}
                                            >
                                                {isSubBusy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
                                                {subscription ? `截止前 ${subscription.days_before} 天提醒` : '訂閱提醒'}
                                            </button>

                                            {subMenuOpen && (
                                                <div role="menu" aria-label="選擇提醒時間"
                                                    className="absolute bottom-full mb-2 right-0 z-30 w-48 bg-surface border border-line rounded-xl shadow-xl p-1.5">
                                                    <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-widest text-ink-soft">截止日前通知</p>
                                                    {SUB_DAY_OPTIONS.map(d => (
                                                        <button key={d} role="menuitem" onClick={() => handleSubscribe(d)}
                                                            className="flex items-center justify-between w-full px-3 py-2 text-sm text-ink rounded-lg hover:bg-primary-tint hover:text-primary transition-colors duration-150">
                                                            {d} 天前
                                                            {subscription?.days_before === d && <Check size={14} className="text-primary" />}
                                                        </button>
                                                    ))}
                                                    {subscription && (
                                                        <>
                                                            <hr className="my-1 border-line" />
                                                            <button role="menuitem" onClick={handleUnsubscribe}
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger rounded-lg hover:bg-danger/10 transition-colors duration-150">
                                                                <BellOff size={14} /> 取消訂閱
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <DownloadPDFButton
                                        announcement={fullAnnouncement}
                                        className="flex items-center justify-center min-w-20 px-4 py-2 text-sm font-semibold text-ink bg-surface hover:bg-surface-hover rounded-lg transition-colors duration-150 border border-line-strong active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                                    />
                                    {fullAnnouncement.internal_id && (
                                        <a
                                            href={`https://docs.google.com/forms/d/e/1FAIpQLSct6GjpISj20foOtBK4TVcMCpSfULcagZTTN4_YkFTNK1DQbQ/viewform?usp=pp_url&entry.40872308=${fullAnnouncement.internal_id}${user ? `&entry.146368827=${encodeURIComponent(user.profile?.name || user.profile?.username || user.user_metadata?.name || '')}&entry.609200579=${encodeURIComponent((user.profile?.student_id || user.user_metadata?.student_id || '').toUpperCase())}` : ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center min-w-20 px-4 py-2 text-sm font-semibold text-white dark:text-[#10151B] bg-primary hover:bg-primary-hover rounded-lg transition-colors duration-150 border border-primary active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
                                            title="前往 Google 表單進行現場交件資料登記"
                                        >
                                            <span>現場交件登記</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, show: false }))} />
        </>
    );
}
