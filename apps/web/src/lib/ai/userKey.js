/**
 * 使用者 AI 金鑰解析（BYOK）
 *
 * 彰師大學生（account_type = 'ncue'）→ 使用平台金鑰（system_settings / 環境變數）。
 * 校外使用者（account_type = 'external'）→ 一律使用其本人的 Gemini 金鑰：
 *   - gemini_key_storage = 'server'：解密 user_ai_keys.cipher
 *   - gemini_key_storage = 'local' ：由前端在請求標頭 x-gemini-api-key 附帶
 * 校外使用者永不落回平台金鑰（避免代付其 AI 費用）。
 */

import { GoogleGenAI } from '@google/genai';
import {
    GEMINI_KEY_HEADER,
    maskGeminiKey,
    normalizeGeminiKey,
    isLikelyGeminiKey,
    resolveAccountStatus,
} from '@ncue/core';
import { supabaseServer } from '../supabase/server';
import { getSystemConfig } from '../config';
import { decryptSecret } from '../secretBox';

/** 驗證金鑰時使用的模型（與助理主要模型一致，確保金鑰真的能跑對話） */
const VALIDATION_MODEL = 'gemini-3.6-flash';

const PROFILE_FIELDS = 'id, email, student_id, account_type, gemini_key_storage, gemini_key_hint, gemini_key_updated_at';

/** 由請求標頭取出前端附帶的自備金鑰（local 儲存模式） */
export function readKeyFromRequest(request) {
    try {
        return normalizeGeminiKey(request?.headers?.get(GEMINI_KEY_HEADER) || '');
    } catch {
        return '';
    }
}

/** 讀取帳號的金鑰設定狀態（含 profile 原始欄位） */
export async function getAiKeyState(userId) {
    const { data, error } = await supabaseServer
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        // 尚未套用 migration（缺欄位）時視為一般彰師帳號，平台維持原行為
        if (error.code === '42703') {
            console.warn('[AIKey] profiles 缺少 BYOK 欄位，請套用 migration 20260728000000。');
            return { profile: null, status: resolveAccountStatus({ profile: null, email: null }) };
        }
        throw error;
    }

    return {
        profile: data || null,
        status: resolveAccountStatus({ profile: data, email: data?.email }),
    };
}

/** 給前端顯示用的金鑰狀態（不含完整金鑰） */
export function describeAiKeyState({ profile, status }) {
    return {
        accountType: status.accountType,
        isExternal: status.isExternal,
        studentId: status.studentId,
        keyStorage: status.keyStorage,
        keyHint: status.keyHint,
        keyUpdatedAt: profile?.gemini_key_updated_at || null,
        verified: status.verified,
    };
}

/**
 * 取得本次請求應使用的 Gemini 金鑰。
 *
 * @param {Object} options
 * @param {string} options.userId
 * @param {Request} [options.request]     由標頭取出自備金鑰（local 模式）
 * @param {string}  [options.requestKey]  已取出的自備金鑰（可直接傳入）
 * @returns {Promise<{ ok: boolean, apiKey?: string, source?: 'platform'|'user-server'|'user-local', status?: Object, code?: string, error?: string }>}
 */
export async function resolveGeminiKeyForUser({ userId, request = null, requestKey = null }) {
    const providedKey = normalizeGeminiKey(requestKey ?? (request ? readKeyFromRequest(request) : ''));
    const { profile, status } = await getAiKeyState(userId);

    if (status.isExternal) {
        if (providedKey) {
            return { ok: true, apiKey: providedKey, source: 'user-local', status };
        }

        if (status.keyStorage === 'server') {
            // 密文存於 user_ai_keys（RLS 無 policy，僅 service role 可讀）
            const { data: keyRow } = await supabaseServer
                .from('user_ai_keys')
                .select('cipher')
                .eq('user_id', userId)
                .maybeSingle();
            const decrypted = normalizeGeminiKey(decryptSecret(keyRow?.cipher));
            if (decrypted) return { ok: true, apiKey: decrypted, source: 'user-server', status };
            return {
                ok: false,
                status,
                code: 'KEY_UNREADABLE',
                error: '無法讀取您儲存的 Gemini 金鑰，請到「個資管理 → 帳號安全」重新輸入金鑰。',
            };
        }

        return {
            ok: false,
            status,
            code: 'KEY_REQUIRED',
            error: status.keyStorage === 'local'
                ? '此裝置找不到您的 Gemini 金鑰（金鑰僅儲存在原本的裝置）。請重新輸入金鑰，或改為儲存到雲端帳號。'
                : '校外使用者需先提供自己的 Gemini 金鑰才能使用 AI 功能。',
        };
    }

    const platformKey = normalizeGeminiKey(await getSystemConfig('GEMINI_API_KEY'));
    if (!platformKey) {
        return { ok: false, status, code: 'PLATFORM_KEY_MISSING', error: '平台尚未設定 GEMINI_API_KEY。' };
    }
    return { ok: true, apiKey: platformKey, source: 'platform', status };
}

/**
 * 實際呼叫 Gemini 驗證金鑰是否可用（額度／權限問題會在此提早發現）。
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function validateGeminiKey(rawKey) {
    const apiKey = normalizeGeminiKey(rawKey);
    if (!isLikelyGeminiKey(apiKey)) {
        return { ok: false, error: '金鑰格式不正確：應為 Google AI Studio 提供的 AIza… 開頭字串。' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
            model: VALIDATION_MODEL,
            contents: '回覆 OK 兩個字即可。',
        });
        if (typeof result?.text !== 'string') {
            return { ok: false, error: 'Gemini 未回應內容，請稍後再試或確認金鑰權限。' };
        }
        return { ok: true };
    } catch (e) {
        const message = String(e?.message || e);
        if (/API[_ ]?key not valid|API_KEY_INVALID|invalid api key/i.test(message)) {
            return { ok: false, error: '金鑰無效或已被撤銷，請回 Google AI Studio 重新產生。' };
        }
        if (/PERMISSION_DENIED|not enabled|SERVICE_DISABLED/i.test(message)) {
            return { ok: false, error: '此金鑰沒有 Gemini API 權限，請確認在 Google AI Studio 已啟用 Gemini API。' };
        }
        if (/RESOURCE_EXHAUSTED|quota|429/i.test(message)) {
            return { ok: false, error: '此金鑰的用量已達上限，請稍後再試或改用其他金鑰。' };
        }
        console.warn('[AIKey] 金鑰驗證失敗：', message);
        return { ok: false, error: `金鑰驗證失敗：${message.slice(0, 160)}` };
    }
}

/** 金鑰遮罩提示（供儲存時記錄） */
export const keyHintOf = maskGeminiKey;
