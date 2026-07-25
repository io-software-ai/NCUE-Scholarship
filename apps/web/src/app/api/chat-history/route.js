import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyUserAuth, checkRateLimit, validateRequestData, handleApiError, logSuccessAction } from '@/lib/apiMiddleware'

// 在路由處理器中，建議使用 supabaseServer，它會從 cookie 中自動處理身份驗證
// 而不是手動建立一個新的 client。除非您有特殊理由需要使用 SERVICE_ROLE_KEY。
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET: 獲取用戶的聊天記錄
export async function GET(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'chat-history-get', 60, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/chat-history' });
        if (!authCheck.success) return authCheck.error;

        const targetUserId = authCheck.user.id;

        let query = supabase
            .from('chat_history')
            .select('*')
            .eq('user_id', targetUserId)
            .order('timestamp', { ascending: true });

        const { data, error } = await query;

        if (error) {
            console.error('獲取聊天記錄失敗:', error);
            return NextResponse.json({ error: '獲取聊天記錄失敗' }, { status: 500 });
        }

        // 清除標記：使用者按「清除紀錄」的時間點，LINE 訊息只合併其後的部分
        const clearedAt = (data || [])
            .filter(r => r.role === 'system' && r.message_content === '__HISTORY_CLEARED__')
            .reduce((latest, r) => (!latest || new Date(r.timestamp) > new Date(latest) ? r.timestamp : latest), null);

        // 標記列不對前端輸出
        let merged = (data || []).filter(r => !(r.role === 'system' && r.message_content === '__HISTORY_CLEARED__'));

        // 已綁定 LINE 帳號 → 將 LINE 對話一併合併進時間軸（雙渠道同步檢視）
        try {
            const { data: lineUsers } = await supabase
                .from('line_users')
                .select('line_user_id')
                .eq('bound_user_id', targetUserId);

            if (lineUsers?.length > 0) {
                let lineQuery = supabase
                    .from('line_messages')
                    .select('id, role, content, message_type, created_at')
                    .in('line_user_id', lineUsers.map(u => u.line_user_id))
                    .eq('message_type', 'text')
                    .not('content', 'is', null)
                    .order('created_at', { ascending: true })
                    .limit(300);
                if (clearedAt) lineQuery = lineQuery.gt('created_at', clearedAt);

                const { data: lineMsgs } = await lineQuery;

                const lineRows = (lineMsgs || []).map(msg => ({
                    id: `line-${msg.id}`,
                    role: msg.role === 'user' ? 'user' : 'model',
                    message_content: msg.content,
                    timestamp: msg.created_at,
                    source: 'line',
                }));

                merged = [...merged, ...lineRows].sort(
                    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
                );
            }
        } catch (e) {
            console.warn('[chat-history] merge LINE messages failed:', e.message);
        }

        return NextResponse.json({ success: true, data: merged });

    } catch (error) {
        return handleApiError(error, 'GET /api/chat-history');
    }
}

// POST: 保存新的聊天消息
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'chat-history-post', 100, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/chat-history POST' });
        if (!authCheck.success) return authCheck.error;

        const body = await request.json();
        const { role, messageContent, sessionId } = body;

        if (!role || !messageContent) {
            return NextResponse.json({ error: '缺少必要參數 role 或 messageContent' }, { status: 400 });
        }
        if (!['user', 'model'].includes(role)) {
            return NextResponse.json({ error: '無效的角色值' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('chat_history')
            .insert([{
                user_id: authCheck.user.id,
                session_id: sessionId || crypto.randomUUID(),
                role: role,
                message_content: messageContent,
            }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });

    } catch (error) {
        return handleApiError(error, 'POST /api/chat-history');
    }
}

// DELETE: 清除當前登入用戶的所有聊天記錄
export async function DELETE(request) {
    try {
        // Rate limiting
        const rateLimitCheck = checkRateLimit(request, 'chat-history-delete', 5, 60000); // 1分鐘內最多5次
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        // 2. 身份驗證
        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/chat-history DELETE' });
        if (!authCheck.success) return authCheck.error;

        // 3. 執行刪除操作
        const { error } = await supabase
            .from('chat_history')
            .delete()
            .eq('user_id', authCheck.user.id);

        if (error) {
            throw error;
        }

        // 寫入清除標記：合併顯示的 LINE 對話（line_messages 不會、也不該被刪除）
        // 只呈現此標記時間之後的訊息，讓「清除紀錄」對使用者視角完整生效。
        await supabase.from('chat_history').insert({
            user_id: authCheck.user.id,
            role: 'system',
            message_content: '__HISTORY_CLEARED__',
        });

        logSuccessAction('CHAT_HISTORY_CLEARED', '/api/chat-history', { userId: authCheck.user.id });

        return NextResponse.json({ success: true, message: '對話紀錄已清除' });

    } catch (error) {
        return handleApiError(error, 'DELETE /api/chat-history');
    }
}