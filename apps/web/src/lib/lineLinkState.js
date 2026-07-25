import crypto from 'crypto';

/**
 * LINE Login OAuth 的 state 簽章（防 CSRF + 攜帶 userId 過橋）
 * 格式：base64url(userId|expiresAt|hmac)
 */
const getSecret = () => process.env.LINE_LOGIN_CHANNEL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'line-link-state';

export function signLinkState(userId, ttlMs = 10 * 60 * 1000) {
    const expiresAt = Date.now() + ttlMs;
    const payload = `${userId}|${expiresAt}`;
    const hmac = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32);
    return Buffer.from(`${payload}|${hmac}`).toString('base64url');
}

export function verifyLinkState(state) {
    try {
        const [userId, expiresAt, hmac] = Buffer.from(state, 'base64url').toString().split('|');
        if (!userId || !expiresAt || !hmac) return null;
        if (Date.now() > parseInt(expiresAt, 10)) return null;
        const expected = crypto.createHmac('sha256', getSecret()).update(`${userId}|${expiresAt}`).digest('hex').slice(0, 32);
        if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
        return userId;
    } catch {
        return null;
    }
}

/** 完成綁定：一位使用者僅能綁一個 LINE 帳號（清除舊綁定），LINE 帳號亦僅屬於一位使用者 */
export async function bindLineAccount(supabaseServer, userId, lineUserId, profile = {}) {
    // 清除此使用者既有綁定 + 此 LINE 帳號的舊歸屬
    await supabaseServer.from('line_users').update({ bound_user_id: null }).eq('bound_user_id', userId);

    const { error } = await supabaseServer
        .from('line_users')
        .upsert({
            line_user_id: lineUserId,
            bound_user_id: userId,
            ...(profile.displayName ? { display_name: profile.displayName } : {}),
            ...(profile.pictureUrl ? { picture_url: profile.pictureUrl } : {}),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'line_user_id' });
    if (error) throw error;
}
