import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { pushMessage, buildAnnouncementLineText, buildAnnouncementFlex } from '@/lib/line';

/**
 * POST /api/admin/line/send
 * 管理員親自回覆 LINE 好友（透過同一個官方帳號 push）。
 * Body: { lineUserId, text } 一般文字
 *       { lineUserId, announcementId } 寄送公告（與廣播同格式，聊天室 @ 快捷）
 */
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'admin-line-send', 30, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/line/send' });
        if (!authCheck.success) return authCheck.error;

        const { lineUserId, text, announcementId } = await request.json();
        if (!lineUserId || (!text?.trim() && !announcementId)) {
            return NextResponse.json({ error: '缺少 lineUserId 或訊息內容' }, { status: 400 });
        }

        // 公告寄送：以 Flex 圖文卡片推播（與廣播一致）；聊天室紀錄存可讀文字快照
        let messageText = text?.trim();
        let outgoing = messageText;
        if (announcementId) {
            const { data: announcement, error: annError } = await supabaseServer
                .from('announcements')
                .select('title, category, application_start_date, application_end_date, submission_method, target_audience, is_active')
                .eq('id', announcementId)
                .single();
            if (annError || !announcement) {
                return NextResponse.json({ error: '找不到指定的公告' }, { status: 404 });
            }
            messageText = buildAnnouncementLineText(announcement, announcementId);
            outgoing = buildAnnouncementFlex(announcement, announcementId);
        }

        await pushMessage(lineUserId, outgoing);

        await supabaseServer.from('line_messages').insert({
            line_user_id: lineUserId,
            role: 'admin',
            message_type: 'text',
            content: messageText,
        });
        await supabaseServer
            .from('line_users')
            .update({ last_message_at: new Date().toISOString() })
            .eq('line_user_id', lineUserId);

        logSuccessAction('LINE_ADMIN_REPLY', '/api/admin/line/send', {
            adminId: authCheck.user.id,
            lineUserId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/admin/line/send');
    }
}
