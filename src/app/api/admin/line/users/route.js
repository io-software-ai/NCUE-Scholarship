import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';

/**
 * GET /api/admin/line/users
 * 列出 LINE 好友（依最後訊息時間排序），含未讀訊息數。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/users' });
        if (!authCheck.success) return authCheck.error;

        const { data: users, error } = await supabaseServer
            .from('line_users')
            .select('line_user_id, display_name, picture_url, is_followed, followed_at, last_message_at, is_pinned, bound_user_id, bound_profile:bound_user_id(username, student_id)')
            .order('is_pinned', { ascending: false })
            .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) throw error;

        // 未讀數（好友傳來且未讀的訊息）
        const { data: unreadRows } = await supabaseServer
            .from('line_messages')
            .select('line_user_id')
            .eq('role', 'user')
            .eq('is_read', false);

        const unreadMap = {};
        for (const row of unreadRows || []) {
            unreadMap[row.line_user_id] = (unreadMap[row.line_user_id] || 0) + 1;
        }

        return NextResponse.json({
            success: true,
            users: (users || []).map(u => ({ ...u, unread_count: unreadMap[u.line_user_id] || 0 })),
        });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/users');
    }
}

/** PUT /api/admin/line/users — 聊天室置頂切換 Body: { lineUserId, isPinned } */
export async function PUT(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/users' });
        if (!authCheck.success) return authCheck.error;

        const { lineUserId, isPinned } = await request.json();
        if (!lineUserId) return NextResponse.json({ error: '缺少 lineUserId' }, { status: 400 });

        const { error } = await supabaseServer
            .from('line_users')
            .update({ is_pinned: Boolean(isPinned), updated_at: new Date().toISOString() })
            .eq('line_user_id', lineUserId);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/users');
    }
}
