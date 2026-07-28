import { NextResponse } from 'next/server';
import { verifyUserAuth, checkRateLimit, handleApiError } from '@/lib/apiMiddleware';
import { mergeIntoBackground } from '@/lib/ai/memory';
import { resolveGeminiKeyForUser } from '@/lib/ai/userKey';

/**
 * 記憶庫增補（AI 助理提議 → 使用者按下同意）
 * POST { items: string[] } → 整理後併入 profiles.ai_background（不覆蓋既有內容）
 *
 * 與 PUT /api/users/background（個資頁手動整段覆寫）分開：
 * 此端點只做「增補」，且僅在使用者明確同意時由前端呼叫。
 */
export async function POST(request) {
    try {
        // 每次呼叫都可能觸發一次模型整理，限制頻率
        const rateLimitCheck = checkRateLimit(request, 'user-background-merge', 10, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/background/merge' });
        if (!authCheck.success) return authCheck.error;

        const { items } = await request.json();
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: '請提供要加入記憶庫的項目' }, { status: 400 });
        }

        // 整理記憶庫也會呼叫模型：校外使用者用自己的金鑰（拿不到就退回不經模型的保底合併）
        const keyResult = await resolveGeminiKeyForUser({ userId: authCheck.user.id, request });
        const result = await mergeIntoBackground({
            userId: authCheck.user.id,
            items,
            apiKey: keyResult.ok ? keyResult.apiKey : null,
            allowPlatformKey: !keyResult.status?.isExternal,
        });
        if (!result.success) return NextResponse.json({ error: result.message }, { status: 400 });

        return NextResponse.json({
            success: true,
            background: result.background,
            added: result.added,
            skipped: result.skipped,
            message: result.message,
        });
    } catch (error) {
        return handleApiError(error, 'POST /api/users/background/merge');
    }
}
