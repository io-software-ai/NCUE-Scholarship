import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, validateRequestData, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { getLineConfig, buildAnnouncementFlex } from '@/lib/line';
import { siteConfig } from '@/lib/siteConfig';

const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast';

// --- CORS Handling ---
const allowedOrigin = process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'http://localhost:3000';

const newCorsResponse = (body, status) => {
    return new NextResponse(JSON.stringify(body), {
        status,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        },
    });
};

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        },
    });
}

// --- Main POST Handler ---
export async function POST(request) {
    try {
        // Middleware checks
        const rateLimitCheck = checkRateLimit(request, 'broadcast-line-announcement', 5, 60000);
        if (!rateLimitCheck.success) return newCorsResponse(rateLimitCheck.error, 429);

        const authCheck = await verifyUserAuth(request, { requireAuth: true, requireAdmin: true, endpoint: '/api/broadcast-line-announcement' });
        if (!authCheck.success) return authCheck.error;

        // Data validation
        const body = await request.json();
        const dataValidation = validateRequestData(body, ['announcementId'], []);
        if (!dataValidation.success) return newCorsResponse(dataValidation.error, 400);
        const { announcementId } = dataValidation.data;

        // Fetch announcement from Supabase
        const { data: announcement, error: annError } = await supabaseServer
            .from('announcements')
            .select('title, category, application_start_date, application_end_date, submission_method, target_audience')
            .eq('id', announcementId)
            .single();

        if (annError || !announcement) {
            console.error('Supabase fetch error:', annError);
            return newCorsResponse({ error: '找不到指定的公告' }, 404);
        }

        // 以 Flex Message 圖文卡片廣播（altText 供通知列與不支援 Flex 的裝置備援）
        const siteUrl = process.env.NEXT_PUBLIC_APP_URL || siteConfig.url;
        const lineMessages = [buildAnnouncementFlex(announcement, announcementId, siteUrl)];

        console.log(`[LINE Broadcast] Built Flex Message for announcement ${announcementId}`);

        // Call LINE API（與「LINE 管理」分頁共用同一組官方帳號憑證：DB 設定優先，env fallback）
        const { channelAccessToken } = await getLineConfig();
        if (!channelAccessToken) throw new Error('伺服器設定不完整：缺少 LINE Channel Access Token（請至後台「LINE 管理」設定）');

        const lineResponse = await fetch(LINE_BROADCAST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${channelAccessToken}` },
            body: JSON.stringify({ messages: lineMessages })
        });

        if (!lineResponse.ok) {
            const errorData = await lineResponse.json();
            console.error('[LINE API Error Body]', errorData);
            const details = errorData.details?.map(d => `${d.property}: ${d.message}`).join(', ') || '未知詳情';
            throw new Error(`LINE API 錯誤: ${errorData.message} (詳情: ${details})`);
        }

        // Log success
        logSuccessAction('LINE_BROADCAST_SENT', '/api/broadcast-line-announcement', {
            adminId: authCheck.user.id,
            announcementId,
            messageType: 'flex',
        });

        return newCorsResponse({ success: true, message: '公告已成功透過 LINE 廣播' }, 200);

    } catch (err) {
        console.error(`[API ERROR: /api/broadcast-line-announcement]`, err.message);
        return newCorsResponse({ error: err.message || '伺服器發生內部錯誤' }, 500);
    }
}