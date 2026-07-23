import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';
import { sanitizeLineUserId } from '@/lib/line';

/**
 * GET /api/admin/line/messages?userId=<line_user_id>&limit=100
 * 取得單一好友的對話紀錄（舊到新），並標記為已讀。
 *
 * DELETE /api/admin/line/messages?userId=<line_user_id>
 * 刪除該好友的整段對話紀錄。
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/messages' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

        if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });

        const { data: messages, error } = await supabaseServer
            .from('line_messages')
            .select('id, role, message_type, content, created_at, is_read')
            .eq('line_user_id', userId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;

        // 標記為已讀
        await supabaseServer
            .from('line_messages')
            .update({ is_read: true })
            .eq('line_user_id', userId)
            .eq('is_read', false);

        return NextResponse.json({ success: true, messages: messages || [] });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/messages');
    }
}

export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/messages' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });

        // 1. 一併刪除暫存的附件（圖片等，存於 public/storage/line/<userId>/）
        const safeUser = sanitizeLineUserId(userId);
        if (safeUser) {
            const dir = path.join(process.cwd(), 'public', 'storage', 'line', safeUser);
            await fs.rm(dir, { recursive: true, force: true }).catch(e => {
                console.warn('[LINE] Failed to remove attachment dir:', e.message);
            });
        }

        // 2. 刪除對話紀錄
        const { error } = await supabaseServer
            .from('line_messages')
            .delete()
            .eq('line_user_id', userId);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/messages');
    }
}
