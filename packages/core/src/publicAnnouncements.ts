/**
 * 公開資料層 DTO 與轉換邏輯
 */

import { siteConfig } from './siteConfig';
import { CATEGORY_NAMES } from './announcementUi';

export function stripHtml(html: string, max = 400) {
    const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return max && text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 公開 DTO 轉換 */
export function toPublicAnnouncementDto(a: any) {
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
