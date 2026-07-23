import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/siteConfig';
import {
    CATEGORY_NAMES, getCategoryBadgeClass, getDeadlineInfo,
    getPublicAttachmentUrl, getFileKind, formatFileSize,
} from '@/lib/announcementUi';
import {
    Calendar, Send, Info, Users, FileText, Paperclip, Link as LinkIcon,
    ExternalLink, ArrowRight, ChevronRight, Download,
} from 'lucide-react';

export const revalidate = 1800; // ISR：公告內容變動不頻繁，每 30 分鐘再生

/** 表格加上可捲動容器，避免行動裝置水平溢出 */
function wrapTables(html) {
    if (!html) return '';
    return html.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, '<div class="table-scroll-wrapper">$1</div>');
}

function stripHtml(html, max = 160) {
    const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function getAnnouncement(id) {
    const { data } = await supabaseServer
        .from('announcements')
        .select('*, attachments(*)')
        .eq('id', id)
        .maybeSingle();
    return data;
}

export async function generateMetadata({ params }) {
    const { id } = await params;
    const announcement = await getAnnouncement(id);
    if (!announcement || !announcement.is_active) {
        return { title: '找不到公告', robots: { index: false, follow: false } };
    }
    const description = stripHtml(announcement.summary) || '獎助學金公告詳情';
    const categoryName = CATEGORY_NAMES[announcement.category] || '獎助學金';
    const url = `${siteConfig.url}/announcement/${id}`;

    return {
        title: announcement.title,
        description,
        keywords: [announcement.title, categoryName, '獎學金', '獎助學金', siteConfig.schoolShort, 'NCUE'],
        alternates: { canonical: `/announcement/${id}` },
        openGraph: {
            type: 'article',
            url,
            title: announcement.title,
            description,
            siteName: siteConfig.name,
            locale: 'zh_TW',
            publishedTime: announcement.created_at,
            modifiedTime: announcement.updated_at,
        },
        twitter: { card: 'summary_large_image', title: announcement.title, description },
    };
}

export default async function AnnouncementPage({ params }) {
    const { id } = await params;
    const announcement = await getAnnouncement(id);
    if (!announcement || !announcement.is_active) notFound();

    const categoryName = CATEGORY_NAMES[announcement.category] || '獎助學金公告';
    const deadline = getDeadlineInfo(announcement.application_end_date, announcement.application_start_date);
    const startStr = announcement.application_start_date
        ? new Date(announcement.application_start_date).toLocaleDateString('en-CA') : null;
    const endStr = announcement.application_end_date
        ? new Date(announcement.application_end_date).toLocaleDateString('en-CA') : '無期限';
    const dateRange = startStr ? `${startStr} ~ ${endStr}` : (endStr || '未指定');

    const limitationText = announcement.application_limitations === 'Y' ? '可兼領'
        : announcement.application_limitations === 'N' ? '不可兼領' : '未指定';

    let externalUrls = [];
    try {
        const parsed = JSON.parse(announcement.external_urls);
        if (Array.isArray(parsed)) externalUrls = parsed.filter(u => u?.url);
    } catch {
        if (typeof announcement.external_urls === 'string' && announcement.external_urls.startsWith('http')) {
            externalUrls = [{ url: announcement.external_urls }];
        }
    }

    const attachments = [...(announcement.attachments || [])].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const description = stripHtml(announcement.summary) || '獎助學金公告詳情';
    const pageUrl = `${siteConfig.url}/announcement/${id}`;

    // 結構化資料：獎助學金以 Article + BreadcrumbList 表述（相容且語意明確）
    const articleLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: announcement.title,
        description,
        inLanguage: 'zh-Hant-TW',
        datePublished: announcement.created_at,
        dateModified: announcement.updated_at || announcement.created_at,
        mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
        author: { '@type': 'Organization', name: siteConfig.organization },
        publisher: {
            '@type': 'Organization',
            name: siteConfig.name,
            logo: { '@type': 'ImageObject', url: `${siteConfig.url}/logo.png` },
        },
        about: categoryName,
        ...(announcement.application_end_date ? { expires: announcement.application_end_date } : {}),
    };
    const breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: '首頁', item: siteConfig.url },
            { '@type': 'ListItem', position: 2, name: categoryName },
            { '@type': 'ListItem', position: 3, name: announcement.title, item: pageUrl },
        ],
    };

    return (
        <div className="w-full bg-page min-h-full">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
            <style>{`
                .rich-text-content { overflow-x: hidden; word-break: break-word; }
                .rich-text-content p { margin-bottom: 1rem; }
                .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 { font-weight: 700; margin: 1.5rem 0 0.75rem; color: var(--color-ink); }
                .rich-text-content ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0 1rem; }
                .rich-text-content ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0 1rem; }
                .rich-text-content a { color: var(--color-primary); text-decoration: underline; }
                .table-scroll-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 1rem; border: 1px solid var(--color-line); border-radius: 0.5rem; }
                .table-scroll-wrapper table { width: 100% !important; }
                .table-scroll-wrapper th, .table-scroll-wrapper td { white-space: normal; min-width: 120px; }
            `}</style>

            <article className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
                {/* 麵包屑 */}
                <nav aria-label="麵包屑" className="flex items-center gap-1.5 text-xs text-ink-soft mb-5 flex-wrap">
                    <Link href="/" className="hover:text-primary transition-colors">首頁</Link>
                    <ChevronRight size={12} aria-hidden="true" />
                    <span>{categoryName}</span>
                </nav>

                {/* 標題區 */}
                <header className="mb-6">
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border ${getCategoryBadgeClass(announcement.category)}`}>
                        {categoryName}
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight leading-snug mt-3">
                        {announcement.title}
                    </h1>
                </header>

                {/* 關鍵資訊條 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line rounded-xl overflow-hidden mb-7">
                    <div className="bg-surface px-4 py-3">
                        <p className="text-[11px] font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><Calendar size={13} aria-hidden="true" />申請期間</p>
                        <p className={`text-sm font-medium tabular-nums ${deadline.colorClass || 'text-ink'}`}>
                            {dateRange}
                            {deadline.stamp && <span className={`ml-2 inline-block border border-current rounded px-1.5 text-[11px] align-middle ${deadline.stampClass}`}>{deadline.stamp}</span>}
                        </p>
                    </div>
                    <div className="bg-surface px-4 py-3">
                        <p className="text-[11px] font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><Send size={13} aria-hidden="true" />送件方式</p>
                        <p className="text-sm font-medium text-ink">{announcement.submission_method || '未指定'}</p>
                    </div>
                    <div className="bg-surface px-4 py-3">
                        <p className="text-[11px] font-semibold tracking-widest text-ink-soft mb-1 flex items-center gap-1.5"><Info size={13} aria-hidden="true" />兼領限制</p>
                        <p className="text-sm font-medium text-ink">{limitationText}</p>
                    </div>
                </div>

                {/* 適用對象 */}
                {announcement.target_audience && (
                    <section className="mb-7">
                        <h2 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><Users size={14} aria-hidden="true" />適用對象</h2>
                        <div className="text-ink rich-text-content text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: wrapTables(announcement.target_audience) }} />
                    </section>
                )}

                {/* 詳細內容 */}
                <section className="mb-7">
                    <h2 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><FileText size={14} aria-hidden="true" />詳細內容</h2>
                    <div className="rich-text-content text-ink text-[15px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: wrapTables(announcement.summary || '無詳細內容') }} />
                </section>

                {/* 附件 */}
                {attachments.length > 0 && (
                    <section className="mb-7">
                        <h2 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><Paperclip size={14} aria-hidden="true" />相關附件（{attachments.length}）</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {attachments.map(att => {
                                const kind = getFileKind(att);
                                return (
                                    <a key={att.id} href={getPublicAttachmentUrl(att.stored_file_path)}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-line bg-surface hover:border-line-strong hover:bg-surface-hover transition-colors group">
                                        <span className={`text-[10px] font-bold px-1.5 py-1 rounded ${kind.cls}`}>{kind.label}</span>
                                        <span className="flex-1 min-w-0 text-sm text-ink truncate">{att.file_name}</span>
                                        {att.file_size ? <span className="text-[11px] text-ink-soft tabular-nums">{formatFileSize(att.file_size)}</span> : null}
                                        <Download size={15} className="text-ink-soft/60 group-hover:text-primary transition-colors flex-shrink-0" aria-hidden="true" />
                                    </a>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* 外部連結 */}
                {externalUrls.length > 0 && (
                    <section className="mb-7">
                        <h2 className="text-[13px] font-semibold tracking-widest text-ink-soft mb-2.5 flex items-center gap-1.5"><LinkIcon size={14} aria-hidden="true" />外部連結</h2>
                        <div className="space-y-2">
                            {externalUrls.map((item, i) => (
                                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-line bg-surface hover:border-line-strong transition-colors text-sm text-primary break-all">
                                    <ExternalLink size={14} className="flex-shrink-0" aria-hidden="true" />
                                    {item.title || item.url}
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                {/* CTA：回到平台（訂閱提醒 / 申請登記等互動功能） */}
                <div className="mt-8 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-ink-soft">在平台開啟以訂閱截止提醒、加入日曆或申請登記。</p>
                    <Link href={`/?announcement_id=${id}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white dark:text-[#10151B] text-sm font-semibold hover:bg-primary-hover transition-colors">
                        在平台開啟 <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                </div>
            </article>
        </div>
    );
}
