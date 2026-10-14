import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, checkRateLimit, logSuccessAction } from '@/lib/apiMiddleware';
import { bindLineAccount } from '@/lib/lineLinkState';
import { pushMessage } from '@/lib/line';

// 綁定碼是全站共用的 6 位數（為相容已上架的 App 暫不加長），任何帳號都能嘗試。
// 除了每帳號的速率限制，再加一道「全站失敗次數」上限，讓分散多帳號 / 多 IP 的暴力猜碼不可行。
const GLOBAL_FAIL_LIMIT = 60;
const GLOBAL_FAIL_WINDOW = 10 * 60 * 1000;
const failures = [];
function globalFailuresExceeded() {
    const cutoff = Date.now() - GLOBAL_FAIL_WINDOW;
    while (failures.length && failures[0] < cutoff) failures.shift();
    return failures.length >= GLOBAL_FAIL_LIMIT;
}

/**
 * POST /api/line/link/code — 以驗證碼手動綁定
 * 使用者於 LINE 官方帳號輸入「綁定」取得 6 位數驗證碼（10 分鐘有效），於此提交完成綁定。
 */
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'line-link-code', 10, 10 * 60 * 1000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/line/link/code' });
        if (!authCheck.success) return authCheck.error;

        const { code } = await request.json();
        const normalized = String(code || '').trim();
        if (!/^\d{6}$/.test(normalized)) {
            return NextResponse.json({ error: '驗證碼格式錯誤（6 位數字）' }, { status: 400 });
        }

        if (globalFailuresExceeded()) {
            return NextResponse.json({ error: '驗證嘗試次數過多，請 10 分鐘後再試' }, { status: 429 });
        }

        const { data: bindCode } = await supabaseServer
            .from('line_bind_codes')
            .select('code, line_user_id, expires_at')
            .eq('code', normalized)
            .maybeSingle();

        if (!bindCode || new Date(bindCode.expires_at) < new Date()) {
            failures.push(Date.now());
            return NextResponse.json({ error: '驗證碼無效或已過期，請重新於 LINE 輸入「帳號綁定」取得' }, { status: 400 });
        }

        await bindLineAccount(supabaseServer, authCheck.user.id, bindCode.line_user_id);
        await supabaseServer.from('line_bind_codes').delete().eq('code', normalized);

        // 通知 LINE 端：若非本人操作可立即察覺並解除
        pushMessage(bindCode.line_user_id, `您的 LINE 已綁定至平台帳號${authCheck.user.email ? `（${authCheck.user.email}）` : ''}。若這不是您本人的操作，請立即聯繫平台管理員協助解除。`)
            .catch(() => {});

        logSuccessAction('LINE_SELF_BIND_CODE', '/api/line/link/code', {
            userId: authCheck.user.id, lineUserId: bindCode.line_user_id,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/line/link/code');
    }
}
