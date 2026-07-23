import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, handleApiError } from '@/lib/apiMiddleware';

/**
 * AI 背景資料（使用者自填，供每次 AI 對話自動帶入，避免重複自我介紹）
 * GET  → 讀取自己的背景資料
 * PUT  → 更新（空字串 = 清除）
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/background' });
        if (!authCheck.success) return authCheck.error;

        const { data } = await supabaseServer
            .from('profiles').select('ai_background').eq('id', authCheck.user.id).maybeSingle();
        return NextResponse.json({ success: true, background: data?.ai_background || '' });
    } catch (error) {
        return handleApiError(error, 'GET /api/users/background');
    }
}

export async function PUT(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'user-background', 10, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/background' });
        if (!authCheck.success) return authCheck.error;

        const { background } = await request.json();
        const cleaned = String(background || '').trim().slice(0, 1000);

        const { error } = await supabaseServer
            .from('profiles')
            .update({ ai_background: cleaned || null })
            .eq('id', authCheck.user.id);
        if (error) {
            if (error.code === '42703') {
                return NextResponse.json({ error: '資料庫尚未套用 migration（缺少 ai_background 欄位）' }, { status: 500 });
            }
            throw error;
        }
        return NextResponse.json({ success: true, message: cleaned ? '背景資料已儲存' : '背景資料已清除' });
    } catch (error) {
        return handleApiError(error, 'PUT /api/users/background');
    }
}
