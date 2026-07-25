import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, checkRateLimit } from '@/lib/apiMiddleware';

/**
 * 公告訂閱提醒 API（需登入）
 * GET    /api/subscriptions[?announcementId=]  查詢自己的訂閱（可過濾單一公告）
 * POST   /api/subscriptions                    Body: { announcementId, daysBefore } 建立/更新訂閱
 * DELETE /api/subscriptions?announcementId=    取消訂閱
 */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/subscriptions' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const announcementId = searchParams.get('announcementId');

        let query = supabaseServer
            .from('announcement_subscriptions')
            .select('announcement_id, days_before, created_at, announcements:announcement_id(id, title, category, application_end_date, is_active)')
            .eq('user_id', authCheck.user.id);
        if (announcementId) query = query.eq('announcement_id', announcementId);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ success: true, subscriptions: data || [] });
    } catch (error) {
        return handleApiError(error, '/api/subscriptions');
    }
}

export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'subscriptions', 30, 10 * 60 * 1000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/subscriptions' });
        if (!authCheck.success) return authCheck.error;

        const { announcementId, daysBefore } = await request.json();
        const days = parseInt(daysBefore, 10);
        if (!announcementId || !Number.isInteger(days) || days < 1 || days > 14) {
            return NextResponse.json({ error: '參數錯誤：daysBefore 需為 1–14 的整數' }, { status: 400 });
        }

        // 公告需存在、啟用、且截止日在今天之後才可訂閱
        const { data: announcement, error: annError } = await supabaseServer
            .from('announcements')
            .select('id, application_end_date, is_active')
            .eq('id', announcementId)
            .single();
        if (annError || !announcement) {
            return NextResponse.json({ error: '公告不存在' }, { status: 404 });
        }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        if (!announcement.is_active || !announcement.application_end_date || announcement.application_end_date < today) {
            return NextResponse.json({ error: '此公告已截止或無截止日，無法訂閱提醒' }, { status: 400 });
        }

        // upsert：變更天數時重置 notified_at 重新武裝
        const { data, error } = await supabaseServer
            .from('announcement_subscriptions')
            .upsert({
                user_id: authCheck.user.id,
                announcement_id: announcementId,
                days_before: days,
                notified_at: null,
            }, { onConflict: 'user_id,announcement_id' })
            .select('announcement_id, days_before')
            .single();
        if (error) throw error;

        return NextResponse.json({ success: true, subscription: data });
    } catch (error) {
        return handleApiError(error, '/api/subscriptions');
    }
}

export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: false, endpoint: '/api/subscriptions' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const announcementId = searchParams.get('announcementId');
        if (!announcementId) return NextResponse.json({ error: '缺少 announcementId' }, { status: 400 });

        const { error } = await supabaseServer
            .from('announcement_subscriptions')
            .delete()
            .eq('user_id', authCheck.user.id)
            .eq('announcement_id', announcementId);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/subscriptions');
    }
}
