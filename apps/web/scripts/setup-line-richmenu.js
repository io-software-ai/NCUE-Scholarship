/**
 * 建立 / 更新 LINE 官方帳號 Rich Menu（聊天室底部選單）
 *
 * 版面：public/line/richmenu.png（2500x1686，四格）
 *   左上：獎助學金資訊平台  https://scholarship.ncuesa.org.tw
 *   右上：獎助學金 LINE 社群 https://reurl.cc/L7jGQe
 *   左下：彰師生輔組        https://stuaffweb.ncue.edu.tw
 *   右下：帳號綁定（傳送「帳號綁定」訊息，觸發驗證碼流程）
 *
 * 憑證：優先讀取 system_settings.LINE_CHANNEL_ACCESS_TOKEN（後台「LINE 管理」設定），
 *       其次讀取 .env.local。
 *
 * 執行：node scripts/setup-line-richmenu.js
 *       （會先移除既有的 Rich Menu，再建立並設為預設）
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const IMAGE_PATH = path.resolve(__dirname, '../public/line/richmenu.png');

// 站台網址由環境變數決定（與 src/lib/siteConfig.js 同源；本檔為 CJS 無法直接 import ESM）
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://scholarship.ncuesa.org.tw').replace(/\/$/, '');

const RICH_MENU = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'scholarship-main-menu',
    chatBarText: '快速選單',
    areas: [
        { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: '獎助學金資訊平台', uri: SITE_URL } },
        { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: '獎助學金 LINE 社群', uri: 'https://reurl.cc/L7jGQe' } },
        { bounds: { x: 0, y: 843, width: 1250, height: 843 }, action: { type: 'uri', label: '彰師生輔組', uri: 'https://stuaffweb.ncue.edu.tw' } },
        { bounds: { x: 1250, y: 843, width: 1250, height: 843 }, action: { type: 'message', label: '帳號綁定', text: '帳號綁定' } },
    ],
};

async function getAccessToken() {
    // 1. DB（後台 LINE 管理分頁設定值）
    try {
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            const { data } = await supabase.from('system_settings').select('value').eq('key', 'LINE_CHANNEL_ACCESS_TOKEN').maybeSingle();
            if (data?.value) return data.value;
        }
    } catch (e) { /* fall through */ }
    // 2. env
    return process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

async function lineFetch(url, token, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${options.method || 'GET'} ${url} → ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('json') ? res.json() : {};
}

async function main() {
    const token = await getAccessToken();
    if (!token) {
        console.error('[RichMenu] 找不到 LINE_CHANNEL_ACCESS_TOKEN（請先在後台「LINE 管理」或 .env.local 設定）');
        process.exit(1);
    }
    if (!fs.existsSync(IMAGE_PATH)) {
        console.error(`[RichMenu] 找不到圖片：${IMAGE_PATH}`);
        process.exit(1);
    }

    // 1. 移除既有 rich menus
    const { richmenus = [] } = await lineFetch('https://api.line.me/v2/bot/richmenu/list', token);
    for (const menu of richmenus) {
        await lineFetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, token, { method: 'DELETE' });
        console.log(`[RichMenu] 已刪除舊選單: ${menu.richMenuId}`);
    }

    // 2. 建立 rich menu
    const { richMenuId } = await lineFetch('https://api.line.me/v2/bot/richmenu', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(RICH_MENU),
    });
    console.log(`[RichMenu] 已建立: ${richMenuId}`);

    // 3. 上傳圖片（api-data domain）
    await lineFetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: fs.readFileSync(IMAGE_PATH),
    });
    console.log('[RichMenu] 圖片已上傳');

    // 4. 設為所有使用者的預設選單
    await lineFetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, token, { method: 'POST' });
    console.log('[RichMenu] 已設為預設選單，完成 ✅');
}

main().catch(err => {
    console.error('[RichMenu] 失敗:', err.message);
    process.exit(1);
});
