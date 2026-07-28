import { NextResponse } from 'next/server';
import { normalizeGeminiKey, isLikelyGeminiKey, maskGeminiKey, KEY_STORAGES } from '@ncue/core';
import { verifyUserAuth, checkRateLimit, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { supabaseServer } from '@/lib/supabase/server';
import { encryptSecret, isSecretBoxReady } from '@/lib/secretBox';
import { getAiKeyState, describeAiKeyState, validateGeminiKey } from '@/lib/ai/userKey';
import { deleteUserAccount } from '@/lib/accountDeletion';

/**
 * 校外使用者的自備 Gemini 金鑰（BYOK）
 *
 * GET    → 目前金鑰狀態（身分別、儲存位置、遮罩提示；不回傳完整金鑰）
 * PUT    → 設定／更換金鑰。body: { key, storage: 'local' | 'server' }
 *          - 先實際呼叫 Gemini 驗證金鑰可用，才寫入
 *          - storage='server'：AES-256-GCM 加密存於 user_ai_keys（僅 service role 可存取）
 *          - storage='local' ：僅記錄遮罩提示，完整金鑰留在使用者裝置，由前端每次請求附帶
 *          - 首次設定成功即完成「校外使用者」註冊（account_type='external'），解除驗證閘門
 * DELETE → 清除金鑰。校外帳號沒有金鑰就無法運作，故一併註銷帳號（body: { confirm: true }）
 */

const STORAGE_LABEL = { local: '僅存於本機裝置', server: '加密存於雲端帳號' };

export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/ai-key' });
        if (!authCheck.success) return authCheck.error;

        const state = await getAiKeyState(authCheck.user.id);
        return NextResponse.json({
            success: true,
            status: describeAiKeyState(state),
            serverStorageAvailable: isSecretBoxReady(),
        });
    } catch (error) {
        return handleApiError(error, 'GET /api/users/ai-key');
    }
}

export async function PUT(request) {
    try {
        // 每次設定都會實際呼叫一次 Gemini 驗證，限制頻率避免被當成金鑰試誤工具
        const rateLimitCheck = checkRateLimit(request, 'user-ai-key', 8, 10 * 60 * 1000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/ai-key' });
        if (!authCheck.success) return authCheck.error;
        const userId = authCheck.user.id;

        const body = await request.json().catch(() => ({}));
        const key = normalizeGeminiKey(body?.key);
        const storage = String(body?.storage || '').trim();

        if (!KEY_STORAGES.includes(storage)) {
            return NextResponse.json({ error: '請選擇金鑰儲存位置（本機或雲端）' }, { status: 400 });
        }
        if (!isLikelyGeminiKey(key)) {
            return NextResponse.json({ error: '金鑰格式不正確：請完整複製 Google AI Studio 產生的金鑰，勿含空白或多餘字元' }, { status: 400 });
        }
        if (storage === 'server' && !isSecretBoxReady()) {
            return NextResponse.json({
                error: '伺服器尚未啟用金鑰加密（缺少 API_KEY_ENCRYPTION_SECRET），請改選「僅存於本機裝置」或聯繫平台維護團隊',
            }, { status: 503 });
        }

        // 已有學號者為彰師大學生，AI 由平台金鑰提供，不需要也不應改為自備金鑰帳號
        const { status } = await getAiKeyState(userId);
        if (status.studentId && !status.isExternal) {
            return NextResponse.json({
                error: '您的帳號已完成彰師大學生身分驗證，AI 功能由平台提供，無需自備金鑰',
            }, { status: 409 });
        }

        const validation = await validateGeminiKey(key);
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // 密文存於 user_ai_keys（僅 service role 可存取）；本機模式則不留任何密文
        if (storage === 'server') {
            const { error: keyError } = await supabaseServer
                .from('user_ai_keys')
                .upsert({
                    user_id: userId,
                    provider: 'gemini',
                    cipher: encryptSecret(key),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });
            if (keyError) {
                if (keyError.code === '42P01') {
                    return NextResponse.json({ error: '資料庫尚未套用 migration（缺少 user_ai_keys 資料表），請聯繫平台維護團隊' }, { status: 500 });
                }
                throw keyError;
            }
        } else {
            const { error: deleteError } = await supabaseServer.from('user_ai_keys').delete().eq('user_id', userId);
            if (deleteError && deleteError.code !== '42P01') throw deleteError;
        }

        const { error: updateError } = await supabaseServer
            .from('profiles')
            .update({
                account_type: 'external',
                gemini_key_storage: storage,
                gemini_key_hint: maskGeminiKey(key),
                gemini_key_updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (updateError) {
            if (updateError.code === '42703') {
                return NextResponse.json({ error: '資料庫尚未套用 migration（缺少金鑰欄位），請聯繫平台維護團隊' }, { status: 500 });
            }
            throw updateError;
        }

        logSuccessAction('AI_KEY_SAVED', '/api/users/ai-key', { userId, storage });

        const nextState = await getAiKeyState(userId);
        return NextResponse.json({
            success: true,
            status: describeAiKeyState(nextState),
            message: `金鑰驗證成功，已${STORAGE_LABEL[storage]}`,
        });
    } catch (error) {
        return handleApiError(error, 'PUT /api/users/ai-key');
    }
}

export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/users/ai-key' });
        if (!authCheck.success) return authCheck.error;
        const userId = authCheck.user.id;

        const body = await request.json().catch(() => ({}));
        if (body?.confirm !== true) {
            return NextResponse.json({ error: '需要明確確認才能清除金鑰並註銷帳號' }, { status: 400 });
        }

        const { status } = await getAiKeyState(userId);
        if (!status.isExternal) {
            return NextResponse.json({ error: '此帳號未使用自備金鑰，無金鑰可清除' }, { status: 400 });
        }

        // 校外帳號的一切功能都以自備金鑰為前提，清除金鑰等同放棄帳號 → 同步註銷
        // （唯一管理員的守門在 deleteUserAccount 內，與一般註銷共用同一規則）
        try {
            await deleteUserAccount(userId);
        } catch (err) {
            if (err.code === 'LAST_ADMIN') {
                return NextResponse.json({ error: err.message }, { status: 409 });
            }
            throw err;
        }
        logSuccessAction('AI_KEY_CLEARED_ACCOUNT_DELETED', '/api/users/ai-key', { userId });

        return NextResponse.json({
            success: true,
            deleted: true,
            message: '已清除金鑰並註銷帳號，感謝您的使用',
        });
    } catch (error) {
        return handleApiError(error, 'DELETE /api/users/ai-key');
    }
}
