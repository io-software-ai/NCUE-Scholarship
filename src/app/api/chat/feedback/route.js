import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, handleApiError } from '@/lib/apiMiddleware';

/**
 * AI 回覆逐則回饋（👍 / 👎）
 * body: { messageKey, question, answer, rating: 'up'|'down'|null, sessionId }
 * - rating 為 'up'/'down' → upsert（同一使用者同一訊息只留一筆，可切換）
 * - rating 為 null / 'none' → 取消回饋（刪除）
 */
export async function POST(request) {
    try {
        const rl = checkRateLimit(request, 'chat-feedback', 30, 60000);
        if (!rl.success) return rl.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true });
        if (!authCheck.success) return authCheck.error;
        const userId = authCheck.user.id;

        const { messageKey, question, answer, rating, sessionId } = await request.json();
        if (!messageKey) return NextResponse.json({ error: '缺少 messageKey' }, { status: 400 });

        // 取消回饋
        if (!rating || rating === 'none') {
            await supabaseServer.from('ai_message_feedback')
                .delete().eq('user_id', userId).eq('message_key', String(messageKey));
            return NextResponse.json({ success: true, rating: null });
        }

        if (!['up', 'down'].includes(rating)) {
            return NextResponse.json({ error: '無效的 rating' }, { status: 400 });
        }

        const row = {
            user_id: userId,
            message_key: String(messageKey).slice(0, 200),
            session_id: sessionId || null,
            question: String(question || '').slice(0, 2000) || null,
            answer: String(answer || '').slice(0, 4000) || null,
            rating,
            channel: 'web',
            created_at: new Date().toISOString(),
        };
        const { error } = await supabaseServer
            .from('ai_message_feedback')
            .upsert(row, { onConflict: 'user_id,message_key' });
        if (error) throw error;

        return NextResponse.json({ success: true, rating });
    } catch (error) {
        return handleApiError(error, '/api/chat/feedback');
    }
}
