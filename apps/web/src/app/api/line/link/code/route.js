import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, checkRateLimit, logSuccessAction } from '@/lib/apiMiddleware';
import { bindLineAccount } from '@/lib/lineLinkState';

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

        const { data: bindCode } = await supabaseServer
            .from('line_bind_codes')
            .select('code, line_user_id, expires_at')
            .eq('code', normalized)
            .maybeSingle();

        if (!bindCode || new Date(bindCode.expires_at) < new Date()) {
            return NextResponse.json({ error: '驗證碼無效或已過期，請重新於 LINE 輸入「帳號綁定」取得' }, { status: 400 });
        }

        await bindLineAccount(supabaseServer, authCheck.user.id, bindCode.line_user_id);
        await supabaseServer.from('line_bind_codes').delete().eq('code', normalized);

        logSuccessAction('LINE_SELF_BIND_CODE', '/api/line/link/code', {
            userId: authCheck.user.id, lineUserId: bindCode.line_user_id,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/line/link/code');
    }
}
