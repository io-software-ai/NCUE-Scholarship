/**
 * 公開資料層：對外 API / RSS / 嵌入式 Widget 共用
 *
 * 只輸出「上架公告」的公開欄位，並統一 DTO 形狀（含 SSR 頁面直達連結）。
 * 供政府開放資料介接、第三方站台嵌入與 RSS 訂閱使用。
 */

import { supabaseServer } from './supabase/server';
import { siteConfig } from './siteConfig';
import { CATEGORY_NAMES } from './announcementUi';

const MAX_LIMIT = 100;

function stripHtml(html, max = 400) {
    const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return max && text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 公開 DTO：僅含對外可見欄位 */
export function toPublicAnnouncementDto(a) {
    return {
        id: a.id,
        title: a.title,
        category: a.category || null,
        category_name: CATEGORY_NAMES[a.category] || null,
        summary: stripHtml(a.summary),
        target_audience: stripHtml(a.target_audience, 300),
        application_start_date: a.application_start_date || null,
        application_end_date: a.application_end_date || null,
        submission_method: a.submission_method || null,
        can_concurrent: a.application_limitations === 'Y' ? true : (a.application_limitations === 'N' ? false : null),
        url: `${siteConfig.url}/announcement/${a.id}`,
        published_at: a.created_at,
        updated_at: a.updated_at || a.created_at,
    };
}

/**
 * 取得上架公告（分頁 + 分類過濾）。
 * @returns {{ items, total, limit, offset }}
 */
export async function fetchPublicAnnouncements({ category = null, limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_LIMIT);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    let query = supabaseServer
        .from('announcements')
        .select('id, title, category, summary, target_audience, application_start_date, application_end_date, submission_method, application_limitations, created_at, updated_at', { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(safeOffset, safeOffset + safeLimit - 1);

    if (category && CATEGORY_NAMES[category]) query = query.eq('category', category);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        items: (data || []).map(toPublicAnnouncementDto),
        total: count || 0,
        limit: safeLimit,
        offset: safeOffset,
    };
}

export { stripHtml };
