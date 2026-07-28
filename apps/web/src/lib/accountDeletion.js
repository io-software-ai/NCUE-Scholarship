/**
 * 帳號註銷（單一實作，供多個入口共用）
 *
 * 入口：
 * - POST /api/users/delete-account      使用者自行註銷（網頁 / App）
 * - DELETE /api/users/ai-key            校外使用者清除自備金鑰 → 帳號無法再運作，一併註銷
 *
 * 多個外鍵未設定 ON DELETE 規則，因此先手動清理關聯資料再刪 profile 與 auth.users。
 */

import { supabaseServer } from './supabase/server';

const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * 管理員可自助註銷，但平台不能因此失去所有管理員。
 * 註銷前確認至少還有另一位管理員，否則以 LAST_ADMIN 拒絕。
 */
async function assertNotLastAdmin(userId) {
    const { data: profile, error } = await supabaseServer
        .from('profiles').select('role').eq('id', userId).maybeSingle();
    if (error || !ADMIN_ROLES.includes(profile?.role)) return;

    const { count } = await supabaseServer
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('role', ADMIN_ROLES);

    if ((count ?? 0) <= 1) {
        const err = new Error('您是平台目前唯一的管理員，請先指派另一位管理員，再註銷此帳號。');
        err.code = 'LAST_ADMIN';
        throw err;
    }
}

export async function deleteUserAccount(userId) {
    if (!userId) throw new Error('缺少使用者 ID');

    await assertNotLastAdmin(userId);

    const cleanups = [
        // 自備 AI 金鑰密文（FK 已設 CASCADE，仍明確刪除以防資料表被改動）
        supabaseServer.from('user_ai_keys').delete().eq('user_id', userId),
        supabaseServer.from('line_users').update({ bound_user_id: null }).eq('bound_user_id', userId),
        supabaseServer.from('announcement_subscriptions').delete().eq('user_id', userId),
        supabaseServer.from('chat_history').delete().eq('user_id', userId),
        supabaseServer.from('login_history').delete().eq('user_id', userId),
        supabaseServer.from('system_settings').update({ updated_by: null }).eq('updated_by', userId),
    ];
    for (const query of cleanups) {
        const { error } = await query;
        if (error) console.warn('[AccountDeletion] cleanup failed:', error.message);
    }

    const { error: profileError } = await supabaseServer.from('profiles').delete().eq('id', userId);
    if (profileError) throw profileError;

    const { error: authError } = await supabaseServer.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    return { success: true };
}
