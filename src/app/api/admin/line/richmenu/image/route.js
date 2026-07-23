import { NextResponse } from 'next/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';
import { getLineConfig } from '@/lib/line';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/line/richmenu/image?id=<richMenuId>
 * 代理下載目前 Rich Menu 圖片（LINE API 需憑證，前端以 authFetch 取 blob 顯示預覽）。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/richmenu/image' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id || !/^richmenu-[a-f0-9]+$/i.test(id)) {
            return NextResponse.json({ error: '無效的選單 ID' }, { status: 400 });
        }

        const { channelAccessToken } = await getLineConfig();
        if (!channelAccessToken) return NextResponse.json({ error: '尚未設定 LINE 憑證' }, { status: 400 });

        const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
            headers: { Authorization: `Bearer ${channelAccessToken}` },
        });
        if (!res.ok) return NextResponse.json({ error: '無法取得選單圖片' }, { status: 404 });

        const buffer = Buffer.from(await res.arrayBuffer());
        return new Response(buffer, {
            headers: {
                'Content-Type': res.headers.get('content-type') || 'image/png',
                'Cache-Control': 'private, max-age=300',
            },
        });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/richmenu/image');
    }
}
