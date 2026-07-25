"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronsUpDown, ArrowUp, ArrowDown, Award, Loader2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import AnnouncementDetailModal from './AnnouncementDetailModal';
import CategoryBadge from '@/components/ui/CategoryBadge';
import { getDeadlineInfo, localDateString, daysFromNowString } from '@/lib/announcementUi';

// --- Helper Functions & Components ---

const calculateSemester = (endDateStr) => {
    if (!endDateStr) return '長期';
    const endDate = new Date(endDateStr);
    const year = endDate.getFullYear();
    const month = endDate.getMonth() + 1;
    const academicYear = month >= 8 ? year - 1911 : year - 1912;
    const semester = month >= 2 && month <= 7 ? 2 : 1;
    return `${academicYear}-${semester}`;
};

const ApplicationLimitations = ({ limitations }) => {
    if (!limitations) {
        return <span className="text-ink-soft">未指定</span>;
    }
    if (limitations === 'Y') {
        return <span className="inline-flex items-center gap-1.5 text-ink"><span className="w-2 h-2 rounded-full bg-ok-bright" aria-hidden="true" />可兼領</span>;
    }
    return <span className="inline-flex items-center gap-1.5 text-ink"><span className="w-2 h-2 rounded-full bg-danger-bright" aria-hidden="true" />不可兼領</span>;
};

const DateDisplay = ({ item, className }) => {
    const startDate = item.application_start_date;
    const endDate = item.application_end_date;
    const endDateFormatted = endDate ? new Date(endDate).toLocaleDateString('en-CA') : '無期限';

    const dateString = startDate
        ? `${new Date(startDate).toLocaleDateString('en-CA')} ~ ${endDateFormatted}`
        : endDateFormatted;

    return <div className={className}>{dateString}</div>;
};


// --- Main Component ---
function AnnouncementListContent({ filterRequest }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortLoading, setSortLoading] = useState(false);
    const [filter, setFilter] = useState('open');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [sort, setSort] = useState({ column: 'application_end_date', ascending: true });
    const [categoryFilter, setCategoryFilter] = useState('all');

    const [expandedId, setExpandedId] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
    const announcementRefs = useRef({});
    const isInitialLoad = useRef(true);

    const [readIds, setReadIds] = useState(new Set());

    // 外部篩選請求（主頁統計燈號）：open / all / closing
    useEffect(() => {
        if (!filterRequest?.type) return;
        setFilter(filterRequest.type);
        setPage(1);
        if (filterRequest.type === 'closing') {
            setSort({ column: 'application_end_date', ascending: true });
        }
    }, [filterRequest]);

    const handleCategoryChange = (newCategory) => {
        setCategoryFilter(newCategory);
        setPage(1); // 重設頁碼
    };

    const fetchAnnouncementsList = useCallback(async () => {
        setSortLoading(true);
        // Optimization: Select only necessary columns for the list view.
        // We exclude 'attachments', 'summary', 'external_urls' to reduce payload size.
        // These will be fetched on demand when the detail modal is opened.
        let query = supabase.from('announcements')
            .select('id, title, category, application_start_date, application_end_date, target_audience, application_limitations, submission_method, is_active', { count: 'exact' })
            .eq('is_active', true);

        if (search) {
            query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%,target_audience.ilike.%${search}%`);
        }

        const today = localDateString();

        if (filter === 'open') {
            query = query.or(`application_end_date.gte.${today},application_end_date.is.null`);
        } else if (filter === 'expired') {
            query = query.lt('application_end_date', today);
        } else if (filter === 'closing') {
            const in7 = daysFromNowString(7);
            query = query.gte('application_end_date', today).lte('application_end_date', in7);
        }

        if (categoryFilter !== 'all') {
            query = query.eq('category', categoryFilter);
        }

        const orderColumn = sort.column === 'semester' ? 'application_end_date' : sort.column;
        const sortOptions = { ascending: sort.ascending, nullsFirst: false };
        query = query.order(orderColumn, sortOptions);

        const from = (page - 1) * rowsPerPage;
        const to = from + rowsPerPage - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (!error) {
            const dataWithSemester = (data || []).map(item => ({
                ...item,
                semester: calculateSemester(item?.application_end_date)
            }));
            setAnnouncements(dataWithSemester);
            setTotalCount(count || 0);
        } else {
            console.error("Error fetching announcements:", error);
            setAnnouncements([]);
            setTotalCount(0);
        }

        setSortLoading(false);
    }, [search, filter, page, rowsPerPage, sort, categoryFilter]);

    useEffect(() => {
        if (isInitialLoad.current) return;
        fetchAnnouncementsList();
    }, [page, rowsPerPage, sort, filter, search, fetchAnnouncementsList]);

    useEffect(() => {
        const initialFetch = async () => {
            setLoading(true);
            const announcementIdFromUrl = searchParams.get('announcement_id');

            if (announcementIdFromUrl) {
                setFilter('all');
                setExpandedId(announcementIdFromUrl);

                const { data: targetAnnouncement, error } = await supabase
                    .from('announcements')
                    .select('*, attachments(*)')
                    .eq('id', announcementIdFromUrl)
                    .single();

                if (targetAnnouncement && !error) {
                    // Open the modal immediately.
                    handleOpenDetailModal(targetAnnouncement);
                } else {
                    console.error("Could not fetch announcement from URL parameter:", error);
                }
            }
            await fetchAnnouncementsList();
            setLoading(false);
            isInitialLoad.current = false;
        };
        initialFetch();
    }, []);

    useEffect(() => {
        const announcementIdFromUrl = searchParams.get('announcement_id');
        if (announcementIdFromUrl && !isInitialLoad.current && announcements.length > 0) {
            const targetElement = announcementRefs.current[announcementIdFromUrl];
            if (targetElement) {
                setTimeout(() => {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    router.replace('/', { shallow: true });
                }, 300); // 300ms delay to accommodate rendering and animation.
            }
        }
    }, [announcements]);

    const handleSort = (field) => {
        setSort(prev => ({ column: field, ascending: prev.column === field ? !prev.ascending : true }));
        setPage(1);
    };

    const handleOpenDetailModal = (announcement) => {
        setReadIds(prev => new Set(prev).add(announcement.id));
        const announcementWithSemester = { ...announcement, semester: calculateSemester(announcement.application_end_date) };
        setSelectedAnnouncement(announcementWithSemester);
        setIsDetailModalOpen(true);
    };

    const handleModalClose = () => {
        setIsDetailModalOpen(false);
        const announcementIdFromUrl = searchParams.get('announcement_id');
        if (announcementIdFromUrl) {
            router.replace('/', { shallow: true });
        }
    };

    const renderSortIcon = (column) => {
        if (sort.column !== column) return <ChevronsUpDown className="h-4 w-4 ml-1 text-ink-soft/60" />;
        return sort.ascending ? <ArrowUp className="h-4 w-4 ml-1 text-primary" /> : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
    };

    // 截止緊迫度（共用規則：lib/announcementUi.getDeadlineInfo）
    const getDateColorClass = (item) =>
        getDeadlineInfo(item.application_end_date, item.application_start_date).colorClass;

    const totalPages = Math.ceil(totalCount / rowsPerPage);

    // Modal 前後公告導覽（目前載入頁內）
    const selectedIndex = selectedAnnouncement
        ? announcements.findIndex(a => a.id === selectedAnnouncement.id)
        : -1;
    const handleModalNavigate = (dir) => {
        const target = announcements[selectedIndex + dir];
        if (target) handleOpenDetailModal(target);
    };

    return (
        <div className="w-full sm:p-2 lg:p-4 select-none">
            <div className="bg-surface border border-line rounded-xl p-4 sm:p-6 mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-ink mb-4 flex items-center gap-2">
                    <Award size={22} className="text-primary" />獎助學金分類代碼定義
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm sm:text-base text-ink-soft">
                    <p><strong className="font-semibold text-cat-a">A：</strong>各縣市政府獎助學金</p>
                    <p><strong className="font-semibold text-cat-b">B：</strong>縣市政府以外之各級公家機關及公營單位獎助學金</p>
                    <p><strong className="font-semibold text-cat-c">C：</strong>宗教及民間各項指定身分獎助學金</p>
                    <p><strong className="font-semibold text-cat-d">D：</strong>非公家機關或其他無法歸類的獎助學金</p>
                    <p><strong className="font-semibold text-cat-e">E：</strong>本校獲配推薦名額獎助學金</p>
                    <p><strong className="font-semibold text-cat-f">F：</strong>校外獎助學金得獎公告</p>
                    <p><strong className="font-semibold text-cat-g">G：</strong>校內獎助學金</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="relative w-full md:w-auto md:flex-1 md:max-w-md">
                    <Search className="h-5 w-5 text-ink-soft/60 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="搜尋公告標題、摘要、適用對象..." value={search} onChange={e => setSearch(e.target.value)}
                        aria-label="搜尋公告"
                        className="w-full pl-12 pr-4 py-2.5 bg-surface text-ink border border-line-strong rounded-lg transition-colors duration-150
                            focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* 分類篩選下拉選單 */}
                    <div className="relative">
                        <select
                            value={categoryFilter}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            aria-label="依分類篩選"
                            className="appearance-none w-full bg-surface border border-line-strong rounded-lg py-2 pl-4 pr-10 text-sm font-medium text-ink transition-colors duration-150 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                            <option value="all">全部分類</option>
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(cat => (
                                <option key={cat} value={cat}>分類 {cat}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-soft/60">
                            <ChevronsUpDown className="h-4 w-4" />
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-surface border border-line p-1 rounded-lg">
                        <Button variant={filter === 'open' ? 'primary' : 'ghost'} size="sm" onClick={() => { setFilter('open'); setPage(1); }}>未逾期</Button>
                        <Button variant={filter === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => { setFilter('all'); setPage(1); }}>全部公告</Button>
                        <Button variant={filter === 'expired' ? 'primary' : 'ghost'} size="sm" onClick={() => { setFilter('expired'); setPage(1); }}>已逾期</Button>
                    </div>
                    {filter === 'closing' && (
                        <button
                            onClick={() => { setFilter('open'); setPage(1); }}
                            aria-label="移除「7 日內截止」篩選"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warn/10 border border-warn/30 text-warn text-sm font-semibold hover:bg-warn/20 transition-colors duration-150"
                        >
                            7 日內截止
                            <span aria-hidden="true" className="text-warn/70">✕</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="rounded-xl w-full bg-surface overflow-hidden border border-line">
                <div className="hidden md:block relative">
                    {sortLoading && (<div className="absolute inset-0 bg-surface/80 backdrop-blur-sm z-20 flex items-center justify-center"><div className="flex items-center gap-2 text-ink-soft font-semibold"><Loader2 className="animate-spin h-5 w-5" />處理中...</div></div>)}
                    <table className="w-full text-sm table-fixed">
                        <thead className="text-left border-b border-line">
                            <tr>
                                <th scope="col" className="p-4 px-6 font-semibold text-ink-soft cursor-pointer w-[10%] hover:text-primary transition-colors duration-150" onClick={() => handleSort('semester')}><div className="flex items-center">學期 {renderSortIcon('semester')}</div></th>
                                <th scope="col" className="p-4 px-6 font-semibold text-ink-soft w-[25%]">獎助學金資料</th>
                                <th scope="col" className="p-4 px-6 font-semibold text-ink-soft w-[35%]">適用對象</th>
                                <th scope="col" className="p-4 px-6 font-semibold text-ink-soft w-[10%]">兼領限制</th>
                                <th scope="col" className="p-4 px-6 font-semibold text-ink-soft cursor-pointer w-[20%] hover:text-primary transition-colors duration-150" onClick={() => handleSort('application_end_date')}><div className="flex items-center">申請期限 / 送件方式 {renderSortIcon('application_end_date')}</div></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {loading ? (<tr><td colSpan="5" className="text-center p-16 text-ink-soft"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />載入中...</td></tr>) : (announcements || []).filter(item => item && item.id).map(item => {
                                const isRead = readIds.has(item.id);
                                return (
                                    <tr 
                                        key={item.id} 
                                        ref={el => (announcementRefs.current[item.id] = el)} 
                                        onClick={() => handleOpenDetailModal(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleOpenDetailModal(item);
                                            }
                                        }}
                                        tabIndex="0"
                                        role="button"
                                        aria-label={`查看公告詳情：${item.title}`}
                                        className={`table-row-modern cursor-pointer outline-none ${isRead ? 'bg-page text-ink-soft' : 'text-ink'}`}
                                    >
                                        <td className="p-4 px-6 font-medium align-top">{item.semester}</td>
                                        <td className="p-4 px-6 align-top">
                                            <div className="flex items-start gap-3">
                                                <CategoryBadge category={item.category} size="md" dimmed={isRead} className="mt-1" />
                                                <p className={`${isRead ? 'font-normal' : 'font-semibold text-ink'}`}>{item.title}</p>
                                            </div>
                                        </td>
                                        <td className="p-4 px-6 text-sm align-top"><div className="line-clamp-3" dangerouslySetInnerHTML={{ __html: item.target_audience }} /></td>
                                        <td className="p-4 px-6 text-sm font-bold align-top">
                                            <ApplicationLimitations limitations={item.application_limitations} />
                                        </td>
                                        <td className="p-4 px-6 text-sm align-top">
                                            <DateDisplay item={item} className={`font-medium tabular-nums ${getDateColorClass(item)}`} />
                                            <div className={`mt-1 ${isRead ? '' : 'text-ink-soft'}`}>{item.submission_method}</div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="md:hidden flex flex-col gap-3 p-3">
                    {loading ? (<div className="p-10 text-center text-ink-soft"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />載入中...</div>) : (announcements || []).filter(item => item && item.id).map(item => {
                        const isExpanded = expandedId === item.id;
                        const isRead = readIds.has(item.id);
                        return (
                            <motion.div key={item.id} layout ref={el => (announcementRefs.current[item.id] = el)} className={`rounded-xl transition-colors duration-150 border ${isExpanded ? 'border-primary ring-1 ring-primary/40' : 'border-line'} ${isRead ? 'bg-page text-ink-soft' : 'bg-surface'}`}>
                                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full text-left p-4">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <CategoryBadge category={item.category} size="sm" dimmed={isRead} />
                                                <span className="text-xs font-medium">{`學期 ${item.semester}`}</span>
                                            </div>
                                            <h3 className={`font-bold text-base ${isRead ? '' : 'text-ink'} mb-1.5`}>{item.title}</h3>
                                            <div className="flex justify-end items-center">
                                                <div className={`text-xs font-bold flex items-center gap-1 ${getDateColorClass(item)}`}>
                                                    <span>期限:</span>
                                                    <DateDisplay item={item} className="" />
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronDown className={`h-5 w-5 text-ink-soft mt-1 flex-shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                <AnimatePresence>{isExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="overflow-hidden">
                                        <div className="pt-2 pb-4 px-4 border-t border-line space-y-3 text-sm">
                                            <div><div className="font-semibold text-ink-soft mb-1">適用對象</div><div className="line-clamp-3" dangerouslySetInnerHTML={{ __html: item.target_audience }} /></div>
                                            <div>
                                                <div className="font-semibold text-ink-soft mb-1">兼領限制</div>
                                                <div className="font-medium"><ApplicationLimitations limitations={item.application_limitations} /></div>
                                            </div>
                                            <div className="pt-2 flex justify-end"><Button variant="purple" size="sm" onClick={() => handleOpenDetailModal(item)}>查看詳細內容</Button></div>
                                        </div>
                                    </motion.div>
                                )}</AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>

                {announcements.length === 0 && !loading && (
                    <div className="p-16 text-center text-ink-soft">
                        <p className="font-semibold text-ink mb-1">找不到符合條件的公告</p>
                        <p className="text-sm">試著更換關鍵字，或清除分類與狀態篩選。</p>
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
                <div className="text-sm text-ink-soft tabular-nums">共 {totalCount} 筆資料，第 {page} / {totalPages || 1} 頁</div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select 
                            value={rowsPerPage} 
                            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} 
                            aria-label="每頁顯示筆數"
                            className="appearance-none w-full bg-surface text-ink border border-line-strong rounded-lg py-2 pl-4 pr-10 text-sm transition-colors duration-150 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                            {[10, 25, 50].map(v => <option key={v} value={v}>{v} 筆 / 頁</option>)}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-soft/60"><ChevronsUpDown className="h-4 w-4" /></div>
                    </div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="分頁導覽">
                        <button onClick={() => setPage(1)} disabled={page === 1} aria-label="第一頁" className="relative inline-flex items-center rounded-l-md px-2 py-2 text-ink-soft ring-1 ring-inset ring-line hover:bg-surface-hover focus:z-20 disabled:opacity-50 transition-colors duration-150"><ChevronsLeft className="h-5 w-5" /></button>
                        <button onClick={() => setPage(p => p - 1)} disabled={page === 1} aria-label="上一頁" className="relative inline-flex items-center px-2 py-2 text-ink-soft ring-1 ring-inset ring-line hover:bg-surface-hover focus:z-20 disabled:opacity-50 transition-colors duration-150"><ChevronLeft className="h-5 w-5" /></button>
                        <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} aria-label="下一頁" className="relative inline-flex items-center px-2 py-2 text-ink-soft ring-1 ring-inset ring-line hover:bg-surface-hover focus:z-20 disabled:opacity-50 transition-colors duration-150"><ChevronRight className="h-5 w-5" /></button>
                        <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="最後一頁" className="relative inline-flex items-center rounded-r-md px-2 py-2 text-ink-soft ring-1 ring-inset ring-line hover:bg-surface-hover focus:z-20 disabled:opacity-50 transition-colors duration-150"><ChevronsRight className="h-5 w-5" /></button>
                    </nav>
                </div>
            </div>

            <AnnouncementDetailModal
                isOpen={isDetailModalOpen}
                onClose={handleModalClose}
                announcement={selectedAnnouncement}
                onNavigate={handleModalNavigate}
                hasPrev={selectedIndex > 0}
                hasNext={selectedIndex !== -1 && selectedIndex < announcements.length - 1}
            />
        </div>
    );
}

export default function AnnouncementList({ filterRequest }) {
    return (
        <Suspense fallback={
            <div className="w-full flex items-center justify-center py-24">
                <div className="h-12 w-12 border-4 border-line border-t-primary rounded-full animate-spin"></div>
            </div>
        }>
            <AnnouncementListContent filterRequest={filterRequest} />
        </Suspense>
    );
}