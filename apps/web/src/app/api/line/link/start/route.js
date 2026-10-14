import { NextResponse } from 'next/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';
import { signLinkState, createLinkNonce, LINK_NONCE_COOKIE } from '@/lib/lineLinkState';

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
        const nonce = createLinkNonce();
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: channelId,
            redirect_uri: `${origin}/api/line/link/callback`,
            state: signLinkState(authCheck.user.id, nonce),
            scope: 'profile openid',
        });

        const res = NextResponse.json({ success: true, url: `https://access.line.me/oauth2/v2.1/authorize?${params}` });
        // 只有發起綁定的這個瀏覽器拿得到 nonce；LINE 導回 callback 屬頂層導覽，SameSite=Lax 會帶上
        res.cookies.set(LINK_NONCE_COOKIE, nonce, {
            httpOnly: true, secure: true, sameSite: 'lax', path: '/api/line/link/callback', maxAge: 10 * 60,
        });
        return res;
    } catch (error) {
        return handleApiError(error, '/api/line/link/start');
    }
}
