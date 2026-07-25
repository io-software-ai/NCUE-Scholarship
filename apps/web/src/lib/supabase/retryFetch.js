/**
 * 具備自動重試的 fetch（供瀏覽器端 Supabase client 使用）
 *
 * 背景：資料庫走公開網域（Cloudflare → nginx → Kong）。並發時偶發 5xx，
 * 尤其是 Cloudflare 52x「源站連不上」，會讓前端出現「資料載入失敗」。
 * 這裡以指數退避自動重試，吸收這類短暫性錯誤。
 *
 * 安全性（避免重複寫入）：
 *  - fetch 直接拋錯（網路層／連線未完成）→ 任何方法都可安全重試。
 *  - Cloudflare 52x（請求根本沒抵達源站）→ 任何方法都可安全重試。
 *  - 其他 5xx（500/502/503/504，可能已抵達源站處理）→ 僅對 GET/HEAD 重試。
 *  - AbortError／已 abort 的請求 → 立即拋出，不重試。
 */

// Cloudflare 源站連線類錯誤：520 未知、521 源站關閉、522 連線逾時、523 源站連不上、524 逾時
const RETRIABLE_ANY_METHOD = new Set([520, 521, 522, 523, 524]);
// 一般 5xx：只在讀取（GET/HEAD）時重試，避免重送寫入請求
const RETRIABLE_READ_ONLY = new Set([500, 502, 503, 504]);

const MAX_ATTEMPTS = 3;      // 首次 + 最多 2 次重試
const BASE_DELAY_MS = 250;   // 250ms → 500ms（再加隨機抖動）

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function methodOf(input, init) {
    return String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
}

function isReadOnly(method) {
    return method === 'GET' || method === 'HEAD';
}

function backoff(attempt) {
    // attempt 從 1 起算：250ms、500ms…，外加 0–120ms 抖動分散重試潮
    return BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 120);
}

/**
 * 建立一個帶重試的 fetch 函式。
 * @param {typeof fetch} [baseFetch] 底層 fetch，預設為全域 fetch（已綁定 globalThis）。
 */
export function createRetryFetch(baseFetch) {
    const doFetch = baseFetch || ((...args) => globalThis.fetch(...args));

    return async function retryFetch(input, init) {
        const method = methodOf(input, init);
        const readOnly = isReadOnly(method);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const res = await doFetch(input, init);

                const canRetryStatus =
                    res.status >= 500 &&
                    (RETRIABLE_ANY_METHOD.has(res.status) ||
                        (readOnly && RETRIABLE_READ_ONLY.has(res.status)));

                if (canRetryStatus && attempt < MAX_ATTEMPTS && !init?.signal?.aborted) {
                    await sleep(backoff(attempt));
                    continue;
                }
                return res;
            } catch (err) {
                // 使用者取消／逾時：不要重試
                if (err?.name === 'AbortError' || init?.signal?.aborted) throw err;
                // 網路層錯誤：最後一次仍失敗才拋出
                if (attempt >= MAX_ATTEMPTS) throw err;
                await sleep(backoff(attempt));
            }
        }
        // 理論上不會抵達（成功 return 或最後一次拋錯）
        return doFetch(input, init);
    };
}
