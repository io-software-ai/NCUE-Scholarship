import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';

/**
 * GET  /api/admin/line/bind?q=<keyword>
 *      搜尋平台使用者（姓名 / 學號 / Email），供綁定選擇。
 *
 * POST /api/admin/line/bind
 *      Body: { lineUserId, userId }  → 綁定（userId 為 null 即解除綁定）
 *      綁定後，該好友在 LINE 詢問時，AI 會一併參考其網頁版對話紀錄。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/bind' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim();
        if (q.length < 1) return NextResponse.json({ success: true, users: [] });

        const escaped = q.replace(/[%_,]/g, '');
        const { data, error } = await supabaseServer
            .from('profiles')
            .select('id, username, student_id, email')
            .or(`username.ilike.%${escaped}%,student_id.ilike.%${escaped}%,email.ilike.%${escaped}%`)
            .limit(8);

        if (error) throw error;
        return NextResponse.json({ success: true, users: data || [] });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/bind');
    }
}

export async function POST(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/bind' });
        if (!authCheck.success) return authCheck.error;

        const { lineUserId, userId } = await request.json();
        if (!lineUserId) return NextResponse.json({ error: '缺少 lineUserId' }, { status: 400 });

        const { error } = await supabaseServer
            .from('line_users')
            .update({ bound_user_id: userId || null, updated_at: new Date().toISOString() })
            .eq('line_user_id', lineUserId);

        if (error) throw error;

        logSuccessAction(userId ? 'LINE_USER_BIND' : 'LINE_USER_UNBIND', '/api/admin/line/bind', {
            adminId: authCheck.user.id, lineUserId, userId: userId || null,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/bind');
    }
}
