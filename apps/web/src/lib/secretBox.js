/**
 * 敏感字串加密（AES-256-GCM）— 目前用於使用者自備的 Gemini 金鑰。
 *
 * 使用者選擇「存於雲端」時，金鑰不以明文落庫：以伺服器端密鑰派生的 AES-256-GCM
 * 加密後存入 user_ai_keys.cipher（RLS 無 policy，僅 service role 可存取），
 * 僅在實際呼叫 Gemini 時於記憶體中解密。
 *
 * 加密密鑰來源（依序）：
 *   1. API_KEY_ENCRYPTION_SECRET（建議設定，可獨立輪替）
 *   2. SUPABASE_SERVICE_ROLE_KEY（後備，讓功能不必額外設定即可運作）
 * 注意：使用後備來源時，若輪替 service role key 將無法解密既有密文，
 *       使用者需重新輸入金鑰。正式環境請設定 API_KEY_ENCRYPTION_SECRET。
 */

import crypto from 'crypto';

const VERSION = 'v1';
const SALT = 'ncue-secret-box-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey = null;
let warnedFallback = false;

function getEncryptionKey() {
    if (cachedKey) return cachedKey;

    let secret = process.env.API_KEY_ENCRYPTION_SECRET;
    if (!secret) {
        secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (secret && !warnedFallback) {
            warnedFallback = true;
            console.warn('[SecretBox] API_KEY_ENCRYPTION_SECRET 未設定，暫以 SUPABASE_SERVICE_ROLE_KEY 派生加密密鑰。');
        }
    }
    if (!secret) return null;

    cachedKey = crypto.scryptSync(secret, SALT, 32);
    return cachedKey;
}

/** 伺服器是否具備加密能力（決定要不要開放「存於雲端」選項） */
export function isSecretBoxReady() {
    return getEncryptionKey() !== null;
}

/**
 * 加密純文字。
 * @returns {string} `v1.<base64(iv|tag|cipher)>`
 */
export function encryptSecret(plainText) {
    const key = getEncryptionKey();
    if (!key) throw new Error('伺服器尚未設定金鑰加密密鑰（API_KEY_ENCRYPTION_SECRET）');

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}.${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

/**
 * 解密；密文損毀、密鑰已輪替或格式不符時回傳 null（呼叫端須引導使用者重新輸入）。
 */
export function decryptSecret(payload) {
    const key = getEncryptionKey();
    if (!key || typeof payload !== 'string') return null;

    const [version, body] = payload.split('.');
    if (version !== VERSION || !body) return null;

    try {
        const raw = Buffer.from(body, 'base64');
        const iv = raw.subarray(0, IV_BYTES);
        const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
        const encrypted = raw.subarray(IV_BYTES + TAG_BYTES);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (e) {
        console.warn('[SecretBox] 解密失敗：', e.message);
        return null;
    }
}
