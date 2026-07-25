/**
 * 平台信件模板（單一來源）
 *
 * 所有系統信件（自訂通知、群發、公告通知、截止提醒）與後台即時預覽
 * 一律由本模組產生外殼與元件，確保視覺一致且與平台品牌同步。
 * 設計 token：品牌藍 #005A9C、墨色 #1C2B3A、頁面灰 #F6F8FA、線色 #E2E8EF。
 * 注意：Email 客戶端相容性優先 — table 佈局、行內樣式、不依賴外部資源。
 */

import { siteConfig } from './siteConfig';

export const EMAIL_COLORS = {
    primary: '#005A9C',
    primaryDark: '#004A80',
    ink: '#1C2B3A',
    body: '#2A3B4D',
    soft: '#7A8899',
    line: '#E2E8EF',
    page: '#F6F8FA',
    canvas: '#EEF2F6',
    surface: '#FFFFFF',
};

/** 將信件內文中的相對路徑轉為絕對網址（信件中相對路徑無效） */
export function absolutizeHtmlUrls(html = '', base = siteConfig.url) {
    return String(html).replace(/(href|src)\s*=\s*["']([^"']*)["']/g, (match, attr, path) => {
        const trimmedPath = path.trim();
        if (/^(https?:|mailto:|tel:|#)/i.test(trimmedPath)) return match;
        if (trimmedPath.startsWith('//')) return `${attr}="https:${trimmedPath}"`;
        const absolutePath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
        return `${attr}="${base}${absolutePath}"`;
    });
}

/** 品牌主按鈕（CTA）：圓角膠囊外框、無填色、置中、右箭頭 */
export function renderEmailButton(text, url) {
    return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 8px;">
        <tr><td align="center" style="border:0;padding:0;text-align:center;">
            <a href="${url}" target="_blank"
               style="display:inline-block;padding:12px 36px;font-size:15px;font-weight:700;color:${EMAIL_COLORS.primary};text-decoration:none;border:2px solid ${EMAIL_COLORS.primary};border-radius:999px;text-align:center;">
                ${text}&nbsp;&nbsp;&rarr;
            </a>
        </td></tr>
    </table>`;
}

/** 資訊列（label / value 兩欄，用於公告摘要等） */
export function renderInfoRow(label, valueHtml) {
    return `
    <tr>
        <td style="padding:10px 0;border:0;border-bottom:1px solid ${EMAIL_COLORS.line};vertical-align:top;width:96px;
                   font-size:13px;font-weight:700;color:${EMAIL_COLORS.soft};letter-spacing:0.05em;">${label}</td>
        <td style="padding:10px 0 10px 16px;border:0;border-bottom:1px solid ${EMAIL_COLORS.line};vertical-align:top;
                   font-size:14.5px;color:${EMAIL_COLORS.body};line-height:1.65;">${valueHtml}</td>
    </tr>`;
}

/** 信件用 logo */
export const EMAIL_LOGO_URL = `${siteConfig.url}/logo-email.png`;

/**
 * 信件外殼
 * @param {Object} opts
 * @param {string} opts.heading   內文標題（通常為主旨）；空字串則不渲染
 * @param {string} opts.bodyHtml  內文 HTML（已 sanitize / 信任來源）
 * @param {string} [opts.preheader] 收件匣預覽文字（隱藏於信件中）
 */
export function renderEmailShell({ heading = '', bodyHtml = '', preheader = '' }) {
    const year = new Date().getFullYear();
    const C = EMAIL_COLORS;

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${siteConfig.name}</title>
<style>
    body { margin:0; padding:0; background-color:#ffffff; width:100% !important;
           font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif; -webkit-font-smoothing:antialiased; }
    table { border-collapse:collapse; }
    .html-body { font-size:15px; line-height:1.75; color:${C.body}; word-break:break-word; }
    .html-body p { margin:0 0 1em 0; }
    .html-body a { color:${C.primary}; text-decoration:underline; }
    .html-body strong { font-weight:700; color:${C.ink}; }
    .html-body ul, .html-body ol { margin:0 0 1em 0; padding-left:22px; }
    .html-body table { width:100%; border-collapse:collapse; margin-bottom:1em; }
    .html-body th, .html-body td { border:1px solid ${C.line}; padding:9px 12px; text-align:left; font-size:14px; }
    .html-body th { background-color:${C.page}; font-weight:700; color:${C.ink}; }
    .html-body img { max-width:100%; height:auto; }
    @media screen and (max-width:660px) {
        .content { padding:32px 20px 0 !important; }
        .footer { padding:24px 20px !important; }
        .heading { font-size:24px !important; }
    }
</style>
</head>
<body>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;">
<tr><td align="center">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;">
        <!-- 內容區 -->
        <tr><td class="content" style="padding:44px 40px 0;">
            <img src="${EMAIL_LOGO_URL}" alt="${siteConfig.developer.name}" height="44" style="height:44px;width:auto;display:block;border:0;" />
            ${heading ? `
            <h1 class="heading" style="margin:36px 0 24px;font-size:28px;font-weight:600;color:${C.ink};line-height:1.35;">${heading}</h1>` : '<div style="height:28px;"></div>'}
            <div class="html-body">${bodyHtml}</div>
        </td></tr>
        <!-- 法務頁尾（滿版灰色區塊，與內容左緣對齊） -->
        <tr><td style="padding:40px 0 32px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${C.page};">
                <tr><td class="footer" style="padding:24px 40px;">
                    <p style="margin:0 0 12px;font-size:13px;text-align:center;">
                        <a href="${siteConfig.url}/terms-and-privacy" target="_blank" style="color:${C.soft};text-decoration:underline;">隱私權聲明</a>
                        &nbsp;&nbsp;
                        <a href="${siteConfig.url}" target="_blank" style="color:${C.soft};text-decoration:underline;">平台首頁</a>
                    </p>
                    <p style="margin:0 0 8px;font-size:12.5px;color:${C.soft};line-height:1.6;">
                        此信件由「${siteConfig.name}」系統自動發送，請勿直接回覆。
                    </p>
                    <p style="margin:0 0 16px;font-size:12.5px;color:${C.soft};">© ${year} ${siteConfig.name}. All Rights Reserved.</p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
                        <td style="font-size:12px;color:${C.soft};padding-right:8px;vertical-align:middle;line-height:26px;">Powered by</td>
                        <td style="vertical-align:middle;">
                            <img src="${EMAIL_LOGO_URL}" alt="${siteConfig.developer.name}" height="26" style="height:26px;width:auto;display:block;border:0;opacity:0.9;margin-top:-2px;" />
                        </td>
                    </tr></table>
                </td></tr>
            </table>
        </td></tr>
    </table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * 管理員權限授予通知信（角色被調整為 admin 時寄送）
 * @returns {{ subject: string, html: string }}
 */
export function renderAdminPromotionEmail({ username = '' } = {}) {
    const subject = '【權限通知】您已被授予管理員權限';
    const html = renderEmailShell({
        heading: '您已被授予管理員權限',
        preheader: `${siteConfig.name} 管理員權限授予通知`,
        bodyHtml: `
            <p>${username ? `${username} ` : ''}您好：</p>
            <p>您在「<strong>${siteConfig.name}</strong>」的帳號已被授予<strong>管理員權限</strong>，現在可以使用管理後台的完整功能：</p>
            <ul>
                <li>公告的建立、編輯與發布（含 AI 智慧排版）</li>
                <li>使用者與權限管理</li>
                <li>LINE 官方帳號管理與 AI 自動回覆設定</li>
                <li>數據統計、常見問題維護與系統設定</li>
            </ul>
            <p>管理員權限涉及使用者個人資料的存取，請妥善保管您的 Google 帳號並遵循平台的個人資料保護規範。若您認為此變更有誤，請立即聯繫平台維護團隊。</p>
            ${renderEmailButton('前往管理後台', `${siteConfig.url}/manage`)}
        `,
    });
    return { subject, html };
}
