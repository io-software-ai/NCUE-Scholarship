/**
 * LINE 訊息格式化工具 (純邏輯)
 */

import { siteConfig } from './siteConfig';

export function htmlToLineText(html: string) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<li.*?>/gi, '\n✅ ')
        .replace(/<[^>]*>?/gm, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

export function buildAnnouncementLineText(announcement: any, announcementId: string | number, siteUrl?: string) {
    const startDate = announcement.application_start_date ? new Date(announcement.application_start_date).toLocaleDateString('en-CA') : null;
    const endDate = announcement.application_end_date ? new Date(announcement.application_end_date).toLocaleDateString('en-CA') : '無期限';
    const dateString = startDate ? `${startDate} ~ ${endDate}` : endDate;
    const base = siteUrl || siteConfig.url;

    return [
        `🎓【分類 ${announcement.category || '未分類'}】 ${announcement.title || '無標題'}`,
        `\n\n⚠️ 申請期間：\n${dateString}`,
        `\n\n📦 送件方式：\n${announcement.submission_method || '未指定'}`,
        `\n\n🎯 適用對象：\n${htmlToLineText(announcement.target_audience) || '所有學生'}`,
        `\n\n🔗 查看詳情：\n${base}/?announcement_id=${announcementId}`,
    ].join('');
}

const LINE_CATEGORY_COLORS: Record<string, string> = {
    A: '#005A9C', B: '#0F766E', C: '#7C3AED', D: '#475569',
    E: '#B45309', F: '#0369A1', G: '#BE185D',
};

function flexInfoRow(label: string, value: string, valueColor = '#1C2B3A') {
    return {
        type: 'box', layout: 'baseline', spacing: 'sm',
        contents: [
            { type: 'text', text: label, color: '#8A94A0', size: 'sm', flex: 2 },
            { type: 'text', text: String(value || '未指定').slice(0, 120), wrap: true, color: valueColor, size: 'sm', flex: 5 },
        ],
    };
}

export function buildAnnouncementFlex(announcement: any, announcementId: string | number, siteUrl?: string) {
    const startDate = announcement.application_start_date ? new Date(announcement.application_start_date).toLocaleDateString('en-CA') : null;
    const endDate = announcement.application_end_date ? new Date(announcement.application_end_date).toLocaleDateString('en-CA') : '無期限';
    const dateString = startDate ? `${startDate} ~ ${endDate}` : endDate;
    const base = siteUrl || siteConfig.url;
    const headerColor = LINE_CATEGORY_COLORS[announcement.category] || '#005A9C';
    const title = announcement.title || '無標題';
    const detailUrl = `${base}/announcement/${announcementId}`;

    let dateColor = '#1C2B3A';
    if (announcement.application_end_date) {
        const days = Math.ceil((new Date(announcement.application_end_date).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
        if (days >= 0 && days <= 3) dateColor = '#B42318';
        else if (days <= 7) dateColor = '#B45309';
    }

    const bubble = {
        type: 'bubble',
        header: {
            type: 'box', layout: 'vertical', backgroundColor: headerColor, paddingAll: '16px', spacing: 'sm',
            contents: [
                { type: 'text', text: `分類 ${announcement.category || '未分類'} ｜ ${siteConfig.shortName}`, color: '#FFFFFFCC', size: 'xxs', weight: 'bold' },
                { type: 'text', text: title, color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true },
            ],
        },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
            contents: [
                flexInfoRow('申請期間', dateString, dateColor),
                flexInfoRow('送件方式', announcement.submission_method),
                flexInfoRow('適用對象', htmlToLineText(announcement.target_audience) || '所有學生'),
            ],
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
            contents: [
                {
                    type: 'button', style: 'primary', color: headerColor, height: 'sm',
                    action: { type: 'uri', label: '查看公告詳情', uri: detailUrl },
                },
            ],
        },
    };

    return {
        type: 'flex',
        altText: `🎓【分類 ${announcement.category || '未分類'}】${title}`.slice(0, 400),
        contents: bubble,
    };
}
