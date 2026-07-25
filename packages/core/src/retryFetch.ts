/**
 * 具備自動重試與退避的 fetch 封裝。
 * 主要吸收 Cloudflare↔origin 的暫時性錯誤（523「origin 無法連線」、429 限流等），
 * 避免這些非 JSON 錯誤回應直接冒泡（例如 supabase-js 對 auth 回應 JSON.parse 失敗）。
 */

// 這些狀態代表「請求被拒或未達 origin」→ 任何方法重試都安全
const RETRIABLE_ANY_METHOD = new Set([429, 520, 521, 522, 523, 524, 525, 527, 530]);
// 這些可能已達 origin → 僅對讀取型（GET/HEAD）重試
const RETRIABLE_READ_ONLY = new Set([408, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function methodOf(input: any, init?: RequestInit) {
    return String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
}

function isReadOnly(method: string) {
    return method === 'GET' || method === 'HEAD';
}

/** 若伺服器帶 Retry-After（秒數或 HTTP 日期）則優先採用 */
function retryAfterMs(res: Response): number | undefined {
    const h = res?.headers?.get?.('retry-after');
    if (!h) return undefined;
    const secs = Number(h);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 10000);
    const date = Date.parse(h);
    return Number.isNaN(date) ? undefined : Math.max(0, Math.min(date - Date.now(), 10000));
}

function backoff(attempt: number, override?: number) {
    if (override && override > 0) return override;
    const exp = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
    return exp + Math.floor(Math.random() * 150); // jitter 避免同時重試
}

export function createRetryFetch(baseFetch?: typeof fetch) {
    const doFetch = baseFetch || ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

    return async function retryFetch(input: any, init?: RequestInit): Promise<Response> {
        const method = methodOf(input, init);
        const readOnly = isReadOnly(method);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const res = await doFetch(input, init);
                const canRetryStatus =
                    RETRIABLE_ANY_METHOD.has(res.status) || (readOnly && RETRIABLE_READ_ONLY.has(res.status));

                if (canRetryStatus && attempt < MAX_ATTEMPTS && !init?.signal?.aborted) {
                    await sleep(backoff(attempt, retryAfterMs(res)));
                    continue;
                }
                return res;
            } catch (err: any) {
                // 網路層錯誤（連線中斷等）：非中止就重試
                if (err?.name === 'AbortError' || init?.signal?.aborted) throw err;
                if (attempt >= MAX_ATTEMPTS) throw err;
                await sleep(backoff(attempt));
            }
        }
        return doFetch(input, init);
    };
}
