import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { getLineConfig } from '@/lib/line';
import { siteConfig } from '@/lib/siteConfig';

const MAX_SIZE = 1024 * 1024; // LINE 限制 1MB
const SITE = siteConfig.url;

/** 依圖片尺寸決定選單格局（LINE 僅接受固定尺寸） */
function buildMenuDefinition(width, height) {
    if (width === 2500 && height === 1686) {
        return {
            size: { width, height },
            selected: true,
            name: 'scholarship-main-menu',
            chatBarText: '快速選單',
            areas: [
                { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: siteConfig.shortName, uri: SITE } },
                { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', label: '獎助學金 LINE 社群', uri: siteConfig.links.lineCommunity } },
                { bounds: { x: 0, y: 843, width: 1250, height: 843 }, action: { type: 'uri', label: '學務處生輔組', uri: siteConfig.links.studentAffairs } },
                { bounds: { x: 1250, y: 843, width: 1250, height: 843 }, action: { type: 'message', label: '帳號綁定', text: '帳號綁定' } },
            ],
        };
    }
    if (width === 2500 && height === 843) {
        return {
            size: { width, height },
            selected: true,
            name: 'scholarship-slim-menu',
            chatBarText: '快速選單',
            areas: [
                { bounds: { x: 0, y: 0, width: 834, height: 843 }, action: { type: 'uri', label: siteConfig.shortName, uri: SITE } },
                { bounds: { x: 834, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: '獎助學金 LINE 社群', uri: siteConfig.links.lineCommunity } },
                { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: '學務處生輔組', uri: siteConfig.links.studentAffairs } },
            ],
        };
    }
    return null;
}

async function lineFetch(url, token, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`LINE API ${res.status}: ${text.slice(0, 200)}`);
    }
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('json') ? res.json() : {};
}

/** GET：目前 Rich Menu 狀態 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/richmenu' });
        if (!authCheck.success) return authCheck.error;

        const { channelAccessToken: accessToken } = await getLineConfig();
        if (!accessToken) return NextResponse.json({ success: true, applied: false, configured: false });

        const { richmenus = [] } = await lineFetch('https://api.line.me/v2/bot/richmenu/list', accessToken);
        return NextResponse.json({
            success: true,
            configured: true,
            applied: richmenus.length > 0,
            menus: richmenus.map(m => ({ id: m.richMenuId, name: m.name, width: m.size?.width, height: m.size?.height })),
        });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/richmenu');
    }
}

/** POST：上傳圖片並套用為聊天室底部選單（自動汰換舊選單） */
export async function POST(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/richmenu' });
        if (!authCheck.success) return authCheck.error;

        const { channelAccessToken: accessToken } = await getLineConfig();
        if (!accessToken) return NextResponse.json({ error: '請先完成 LINE 官方帳號憑證設定' }, { status: 400 });

        const formData = await request.formData();
        const file = formData.get('image');
        if (!file || typeof file === 'string') return NextResponse.json({ error: '缺少圖片檔案' }, { status: 400 });
        if (!['image/png', 'image/jpeg'].includes(file.type)) return NextResponse.json({ error: '僅支援 PNG / JPEG' }, { status: 400 });
        if (file.size > MAX_SIZE) return NextResponse.json({ error: '圖片需小於 1MB' }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const meta = await sharp(buffer).metadata();
        const menuDef = buildMenuDefinition(meta.width, meta.height);
        if (!menuDef) {
            return NextResponse.json({ error: `圖片尺寸需為 2500×1686（四格）或 2500×843（三格），目前為 ${meta.width}×${meta.height}` }, { status: 400 });
        }

        // 1. 汰換舊選單
        const { richmenus = [] } = await lineFetch('https://api.line.me/v2/bot/richmenu/list', accessToken);
        for (const menu of richmenus) {
            await lineFetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, accessToken, { method: 'DELETE' });
        }

        // 2. 建立選單 → 上傳圖片 → 設為預設
        const { richMenuId } = await lineFetch('https://api.line.me/v2/bot/richmenu', accessToken, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(menuDef),
        });
        await lineFetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, accessToken, {
            method: 'POST',
            headers: { 'Content-Type': file.type },
            body: buffer,
        });
        await lineFetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, accessToken, { method: 'POST' });

        logSuccessAction('LINE_RICHMENU_APPLY', '/api/admin/line/richmenu', {
            adminId: authCheck.user.id, richMenuId, size: `${meta.width}x${meta.height}`,
        });
        return NextResponse.json({ success: true, richMenuId, layout: menuDef.name });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/richmenu');
    }
}

/** DELETE：移除所有 Rich Menu */
export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/richmenu' });
        if (!authCheck.success) return authCheck.error;

        const { channelAccessToken: accessToken } = await getLineConfig();
        if (!accessToken) return NextResponse.json({ error: '請先完成 LINE 官方帳號憑證設定' }, { status: 400 });

        const { richmenus = [] } = await lineFetch('https://api.line.me/v2/bot/richmenu/list', accessToken);
        for (const menu of richmenus) {
            await lineFetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, accessToken, { method: 'DELETE' });
        }

        logSuccessAction('LINE_RICHMENU_REMOVE', '/api/admin/line/richmenu', { adminId: authCheck.user.id, removed: richmenus.length });
        return NextResponse.json({ success: true, removed: richmenus.length });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/richmenu');
    }
}
