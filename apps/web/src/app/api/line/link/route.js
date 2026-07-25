import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';

/**
 * LINE 帳號綁定（使用者自助）
 * GET    /api/line/link  查詢自己的綁定狀態（含 OAuth 是否可用）
 * DELETE /api/line/link  解除綁定
 * 綁定後：LINE 對話與網頁版 AI 獎學金助理雙向共享上下文。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/line/link' });
        if (!authCheck.success) return authCheck.error;

        const { data } = await supabaseServer
            .from('line_users')
            .select('line_user_id, display_name, picture_url')
            .eq('bound_user_id', authCheck.user.id)
            .maybeSingle();

        return NextResponse.json({
            success: true,
            binding: data ? { displayName: data.display_name, pictureUrl: data.picture_url } : null,
            oauthAvailable: Boolean(process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET),
        });
    } catch (error) {
        return handleApiError(error, '/api/line/link');
    }
}

export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/line/link' });
        if (!authCheck.success) return authCheck.error;

        const { error } = await supabaseServer
            .from('line_users')
            .update({ bound_user_id: null, updated_at: new Date().toISOString() })
            .eq('bound_user_id', authCheck.user.id);
        if (error) throw error;

        logSuccessAction('LINE_SELF_UNBIND', '/api/line/link', { userId: authCheck.user.id });
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/line/link');
    }
}
