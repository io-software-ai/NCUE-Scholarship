import { NextResponse } from 'next/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';
import { signLinkState } from '@/lib/lineLinkState';

/**
 * GET /api/line/link/start — 產生 LINE Login 授權網址（需登入）
 * 前端取得後 window.location 導向；LINE Login channel 需與 Messaging API channel
 * 同屬一個 Provider，OAuth 取得的 userId 才會與官方帳號好友一致。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/line/link/start' });
        if (!authCheck.success) return authCheck.error;

        const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
        if (!channelId || !process.env.LINE_LOGIN_CHANNEL_SECRET) {
            return NextResponse.json({ error: '尚未設定 LINE Login，請改用驗證碼綁定' }, { status: 400 });
        }

        const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: channelId,
            redirect_uri: `${origin}/api/line/link/callback`,
            state: signLinkState(authCheck.user.id),
            scope: 'profile openid',
        });

        return NextResponse.json({ success: true, url: `https://access.line.me/oauth2/v2.1/authorize?${params}` });
    } catch (error) {
        return handleApiError(error, '/api/line/link/start');
    }
}
