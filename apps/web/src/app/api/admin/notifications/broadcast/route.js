import { NextResponse } from 'next/server';
import { verifyUserAuth, handleApiError } from '@/lib/apiMiddleware';
import { sendPushToAll } from '@/lib/push';
import { siteConfig } from '@/lib/siteConfig';

/**
 * 全體推播（新增公告時由 CreateAnnouncementModal 自動呼叫）。
 * 涵蓋網頁版與 App 的所有已註冊裝置；分批送出、失效 token 自動清理由 @/lib/push 處理。
 */
export async function POST(request) {
    try {
        // 1. 檢查權限 (確保是管理員)
        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: true,
            endpoint: '/api/admin/notifications/broadcast'
        });

        if (!authCheck.success) {
            return authCheck.error;
        }

        const { title, body, url, announcementId } = await request.json();
        const link = url || (announcementId ? `${siteConfig.url}/?announcement_id=${announcementId}` : siteConfig.url);

        const result = await sendPushToAll({
            title: title || '新公告通知',
            body: body || '您有新的獎助學金資訊',
            data: { url: link, announcementId: announcementId || '' },
            link,
        });

        console.log(
            `[FCM Broadcast] 成功: ${result.successCount}, 失敗: ${result.failureCount}, 清除失效 token: ${result.removed}`
        );

        return NextResponse.json({
            success: true,
            successCount: result.successCount,
            failureCount: result.failureCount
        });

    } catch (error) {
        return handleApiError(error, '/api/admin/notifications/broadcast');
    }
}
