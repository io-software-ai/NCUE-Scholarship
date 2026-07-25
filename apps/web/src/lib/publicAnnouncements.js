/**
 * 公開資料層：對外 API / RSS / 嵌入式 Widget 共用
 */

import { supabaseServer } from './supabase/server';
import { CATEGORY_NAMES, toPublicAnnouncementDto } from '@ncue/core';

const MAX_LIMIT = 100;

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

export { toPublicAnnouncementDto };
export { stripHtml } from '@ncue/core';
