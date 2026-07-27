import { supabase } from '@/lib/supabase/client';

/**
 * 「@」公告選單的共用搜尋（AI 助理輸入框、LINE 後台插入公告）
 *
 * 一律走伺服器端查詢：先前的作法是抓固定筆數到前端做 title.includes()，
 * 沒被抓進來的公告永遠搜不到（例如只載最舊 120 筆時搜不到新公告）。
 *
 * 比對順序：
 * 1. 子字串比對（ilike %kw%）
 * 2. 查無結果 → 逐字模糊（%蘭%馨% 可命中「蘭馨愛‧讓夢想起飛」），容忍中間夾字
 */

const SELECT = 'id, title, category, application_end_date';

/**
 * @param {string|null} query 關鍵字（空字串 = 預設清單）
 * @param {Object} [options]
 * @param {'upcoming'|'recent'} [options.defaultScope] 無關鍵字時的清單：尚未截止 / 最新建立
 * @param {number} [options.limit]
 * @returns {Promise<Array>}
 */
export async function searchAnnouncements(query, { defaultScope = 'upcoming', limit = 12 } = {}) {
    const base = () => supabase.from('announcements').select(SELECT).eq('is_active', true);
    const keyword = String(query || '').replace(/[%_,()*\\]/g, ' ').trim();

    if (!keyword) {
        if (defaultScope === 'recent') {
            const { data } = await base().order('created_at', { ascending: false }).limit(limit);
            return data || [];
        }
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await base()
            .or(`application_end_date.gte.${today},application_end_date.is.null`)
            .order('application_end_date', { ascending: true, nullsFirst: false })
            .limit(limit);
        if (data && data.length > 0) return data;
        // 目前沒有進行中的公告 → 退回顯示最近截止的
        const { data: recent } = await base()
            .order('application_end_date', { ascending: false, nullsFirst: false })
            .limit(limit);
        return recent || [];
    }

    // 搜尋涵蓋已截止公告：使用者常要找的是往年同一個獎項
    const { data } = await base()
        .ilike('title', `%${keyword}%`)
        .order('application_end_date', { ascending: false, nullsFirst: false })
        .limit(limit);
    let rows = data || [];

    if (rows.length === 0 && keyword.length > 1) {
        const loose = `%${Array.from(keyword).filter(c => c.trim()).join('%')}%`;
        const { data: fuzzy } = await base()
            .ilike('title', loose)
            .order('application_end_date', { ascending: false, nullsFirst: false })
            .limit(limit);
        rows = fuzzy || [];
    }

    // 標題開頭命中的排前面
    return [...rows].sort((a, b) => (b.title.startsWith(keyword) ? 1 : 0) - (a.title.startsWith(keyword) ? 1 : 0));
}
