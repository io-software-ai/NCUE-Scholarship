import { supabaseServer } from '@/lib/supabase/server';
import { messaging } from '@/lib/firebase-admin';
import { siteConfig } from '@/lib/siteConfig';

/**
 * FCM 推播共用層（新公告廣播、截止提醒共用）
 *
 * - 同時涵蓋 Web（device_type='web'）與 App（'android' / 'ios'）：三者都存在同一張 fcm_tokens。
 * - 每次 multicast 上限 500 個 token，超過自動分批。
 * - 失效 token（未註冊／格式錯誤）自動從資料表清掉，避免失敗率愈積愈高。
 * - Android 指定 channelId 'default'，對應 App 端 setNotificationChannelAsync('default')。
 */

const FCM_BATCH = 500;

const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
]);

/** data payload 只能是字串；順手濾掉 undefined/null */
function normalizeData(data = {}) {
    return Object.fromEntries(
        Object.entries(data)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)]),
    );
}

/**
 * 對指定的 FCM token 清單發送推播。
 * @returns {Promise<{successCount:number,failureCount:number,removed:number}>}
 */
export async function sendPushToTokens({ tokens, title, body, data = {}, link }) {
    const list = [...new Set((tokens || []).filter(Boolean))];
    if (list.length === 0) return { successCount: 0, failureCount: 0, removed: 0 };

    const payloadData = normalizeData(data);
    const targetLink = link || payloadData.url || siteConfig.url;

    let successCount = 0;
    let failureCount = 0;
    const invalid = [];

    for (let i = 0; i < list.length; i += FCM_BATCH) {
        const batch = list.slice(i, i + FCM_BATCH);
        const res = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            data: payloadData,
            android: { priority: 'high', notification: { channelId: 'default' } },
            apns: { payload: { aps: { sound: 'default' } } },
            webpush: { fcmOptions: { link: targetLink } },
        });

        successCount += res.successCount;
        failureCount += res.failureCount;
        res.responses.forEach((r, idx) => {
            if (!r.success && INVALID_TOKEN_CODES.has(r.error?.code)) invalid.push(batch[idx]);
        });
    }

    if (invalid.length > 0) {
        await supabaseServer.from('fcm_tokens').delete().in('fcm_token', invalid);
    }

    return { successCount, failureCount, removed: invalid.length };
}

/** 對「特定使用者」的所有裝置發送推播（Web + App 一併涵蓋） */
export async function sendPushToUsers({ userIds, title, body, data = {}, link }) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return { successCount: 0, failureCount: 0, removed: 0 };

    const { data: rows, error } = await supabaseServer
        .from('fcm_tokens')
        .select('fcm_token')
        .in('user_id', ids);
    if (error) throw error;

    return sendPushToTokens({ tokens: (rows || []).map((r) => r.fcm_token), title, body, data, link });
}

/** 對所有已註冊裝置發送推播（新公告廣播用） */
export async function sendPushToAll({ title, body, data = {}, link }) {
    const { data: rows, error } = await supabaseServer.from('fcm_tokens').select('fcm_token');
    if (error) throw error;
    return sendPushToTokens({ tokens: (rows || []).map((r) => r.fcm_token), title, body, data, link });
}
