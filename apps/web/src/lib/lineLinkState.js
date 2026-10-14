import crypto from 'crypto';

/**
 * LINE Login OAuth 的 state 簽章（防 CSRF + 攜帶 userId 過橋）
 * 格式：base64url(userId|expiresAt|nonceHash|hmac)
 *
 * nonce 存在發起者瀏覽器的 HttpOnly cookie（LINK_NONCE_COOKIE），callback 必須帶著同一個 cookie
 * 才能通過 —— 避免攻擊者把自己產生的授權網址丟給受害者點，讓受害者的 LINE 被綁到攻擊者帳號。
 */
export const LINK_NONCE_COOKIE = 'line_link_nonce';

const getSecret = () => process.env.LINE_LOGIN_CHANNEL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const hashNonce = (nonce) => crypto.createHash('sha256').update(String(nonce)).digest('hex').slice(0, 32);

export function createLinkNonce() {
    return crypto.randomBytes(24).toString('base64url');
}

export function signLinkState(userId, nonce, ttlMs = 10 * 60 * 1000) {
    const secret = getSecret();
    if (!secret) throw new Error('LINE link state secret not configured');
    const expiresAt = Date.now() + ttlMs;
    const payload = `${userId}|${expiresAt}|${hashNonce(nonce)}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
    return Buffer.from(`${payload}|${hmac}`).toString('base64url');
}

export function verifyLinkState(state, nonce) {
    try {
        const secret = getSecret();
        if (!secret || !nonce) return null;
        const [userId, expiresAt, nonceHash, hmac] = Buffer.from(state, 'base64url').toString().split('|');
        if (!userId || !expiresAt || !nonceHash || !hmac) return null;
        if (Date.now() > parseInt(expiresAt, 10)) return null;
        const expected = crypto.createHmac('sha256', secret).update(`${userId}|${expiresAt}|${nonceHash}`).digest('hex').slice(0, 32);
        if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
        if (!crypto.timingSafeEqual(Buffer.from(nonceHash), Buffer.from(hashNonce(nonce)))) return null;
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
