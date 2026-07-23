/**
 * LINE Messaging API 工具庫（官方帳號整合）
 *
 * 憑證來源：system_settings（後台「LINE 管理」分頁可設定）→ 環境變數 fallback。
 * 廣播、Webhook 自動回覆、後台親自回覆皆共用同一組官方帳號憑證。
 */

import crypto from 'crypto';
import { getSystemConfig } from './config';
import { siteConfig } from './siteConfig';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

/**
 * 取得 LINE 官方帳號憑證（DB 設定優先，env fallback）。
 */
export async function getLineConfig() {
    const channelAccessToken = await getSystemConfig('LINE_CHANNEL_ACCESS_TOKEN');
    const channelSecret = await getSystemConfig('LINE_CHANNEL_SECRET');
    return { channelAccessToken, channelSecret };
}

/**
 * 驗證 LINE Webhook 簽章 (X-Line-Signature)。
 * @param {string} rawBody  原始 request body 字串
 * @param {string} signature  X-Line-Signature header
 * @param {string} channelSecret
 */
export function verifyLineSignature(rawBody, signature, channelSecret) {
    if (!signature || !channelSecret) return false;
    const expected = crypto
        .createHmac('SHA256', channelSecret)
        .update(rawBody)
        .digest('base64');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch (e) {
        return false;
    }
}

async function lineApiFetch(path, { method = 'POST', body, channelAccessToken } = {}) {
    const token = channelAccessToken || (await getLineConfig()).channelAccessToken;
    if (!token) throw new Error('缺少 LINE Channel Access Token 設定');

    const response = await fetch(`${LINE_API_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errJson = await response.json();
            detail = errJson.message || JSON.stringify(errJson);
        } catch (e) { /* ignore */ }
        throw new Error(`LINE API ${path} 錯誤 (${response.status}): ${detail}`);
    }
    return response.status === 200 ? response.json().catch(() => ({})) : {};
}

/**
 * 統一訊息正規化：字串 → text 訊息；已是訊息物件（flex/image 等，含 type）則原樣傳遞。
 */
function normalizeMessages(input) {
    return (Array.isArray(input) ? input : [input])
        .filter(Boolean)
        .slice(0, 5)
        .map(item => (item && typeof item === 'object' && item.type)
            ? item
            : { type: 'text', text: String(item).slice(0, 4900) });
}

/**
 * 以 reply token 回覆訊息（webhook 事件 60 秒內有效）。
 * texts 可為字串、字串陣列，或 LINE 訊息物件（如 Flex）。
 */
export async function replyMessage(replyToken, texts, opts = {}) {
    const messages = normalizeMessages(texts);
    if (messages.length === 0) return;
    return lineApiFetch('/message/reply', { body: { replyToken, messages }, ...opts });
}

/**
 * 主動推播訊息給特定使用者（後台親自回覆 / reply token 過期時的備援）。
 * texts 可為字串、字串陣列，或 LINE 訊息物件（如 Flex）。
 */
export async function pushMessage(lineUserId, texts, opts = {}) {
    const messages = normalizeMessages(texts);
    if (messages.length === 0) return;
    return lineApiFetch('/message/push', { body: { to: lineUserId, messages }, ...opts });
}

/**
 * 取得使用者公開資料（顯示名稱、頭像）。取不到時回傳 null。
 */
export async function getLineProfile(lineUserId, opts = {}) {
    try {
        return await lineApiFetch(`/profile/${lineUserId}`, { method: 'GET', ...opts });
    } catch (e) {
        console.warn('[LINE] Failed to fetch profile:', e.message);
        return null;
    }
}

/**
 * 下載訊息附件內容（圖片等，走 api-data domain）。
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function downloadLineContent(messageId) {
    const { channelAccessToken } = await getLineConfig();
    if (!channelAccessToken) throw new Error('缺少 LINE Channel Access Token 設定');

    const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
        headers: { 'Authorization': `Bearer ${channelAccessToken}` },
    });
    if (!response.ok) {
        throw new Error(`LINE 內容下載失敗 (${response.status})`);
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
}

/**
 * 將 LINE userId 淨化為安全的資料夾名稱。
 */
export function sanitizeLineUserId(lineUserId) {
    return String(lineUserId || '').replace(/[^A-Za-z0-9_-]/g, '');
}

/** HTML → LINE 純文字 */
export function htmlToLineText(html) {
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

/**
 * 公告 → LINE 訊息文字（廣播與單一好友寄送共用同一格式）
 */
export function buildAnnouncementLineText(announcement, announcementId, siteUrl) {
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

/** 分類 → 卡片頁首底色（與平台品牌一致，預設主色 #005A9C） */
const LINE_CATEGORY_COLORS = {
    A: '#005A9C', B: '#0F766E', C: '#7C3AED', D: '#475569',
    E: '#B45309', F: '#0369A1', G: '#BE185D',
};

/** Flex 資訊列（label + 值，值自動換行） */
function flexInfoRow(label, value, valueColor = '#1C2B3A') {
    return {
        type: 'box', layout: 'baseline', spacing: 'sm',
        contents: [
            { type: 'text', text: label, color: '#8A94A0', size: 'sm', flex: 2 },
            { type: 'text', text: String(value || '未指定').slice(0, 120), wrap: true, color: valueColor, size: 'sm', flex: 5 },
        ],
    };
}

/**
 * 公告 → LINE Flex Message（圖文卡片＋按鈕），廣播與單一好友寄送共用。
 * 回傳完整訊息物件（含 altText），可直接交給 pushMessage / replyMessage / broadcast。
 */
export function buildAnnouncementFlex(announcement, announcementId, siteUrl) {
    const startDate = announcement.application_start_date ? new Date(announcement.application_start_date).toLocaleDateString('en-CA') : null;
    const endDate = announcement.application_end_date ? new Date(announcement.application_end_date).toLocaleDateString('en-CA') : '無期限';
    const dateString = startDate ? `${startDate} ~ ${endDate}` : endDate;
    const base = siteUrl || siteConfig.url;
    const headerColor = LINE_CATEGORY_COLORS[announcement.category] || '#005A9C';
    const title = announcement.title || '無標題';
    const detailUrl = `${base}/announcement/${announcementId}`;

    // 截止緊迫度上色（≤7 天橙、≤3 天紅）
    let dateColor = '#1C2B3A';
    if (announcement.application_end_date) {
        const days = Math.ceil((new Date(announcement.application_end_date) - new Date(new Date().toDateString())) / 86400000);
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
