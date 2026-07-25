import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyLinkState, bindLineAccount } from '@/lib/lineLinkState';

export const dynamic = 'force-dynamic';

/**
 * GET /api/line/link/callback — LINE Login OAuth 回呼
 * 驗證 state → 交換 access token → 取得 LINE profile → 完成綁定 → 導回個資頁
 */
export async function GET(request) {
    const url = new URL(request.url);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
    const fail = (reason) => NextResponse.redirect(`${origin}/profile?line=error&reason=${encodeURIComponent(reason)}`);

    try {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return fail('missing_params');

        const userId = verifyLinkState(state);
        if (!userId) return fail('invalid_state');

        // 交換 access token
        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${origin}/api/line/link/callback`,
                client_id: process.env.LINE_LOGIN_CHANNEL_ID,
                client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
            }),
        });
        if (!tokenRes.ok) {
            console.error('[LINE Link] Token exchange failed:', await tokenRes.text());
            return fail('token_exchange');
        }
        const { access_token } = await tokenRes.json();

        // 取得 LINE profile（同 Provider 下 userId 與 Messaging API 一致）
        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!profileRes.ok) return fail('profile_fetch');
        const profile = await profileRes.json();

        await bindLineAccount(supabaseServer, userId, profile.userId, {
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
        });

        console.log(`[LINE Link] User ${userId} bound via OAuth to ${profile.userId.slice(0, 8)}...`);
        return NextResponse.redirect(`${origin}/profile?line=linked`);
    } catch (error) {
        console.error('[LINE Link] Callback error:', error);
        return fail('unexpected');
    }
}
