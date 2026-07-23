import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/apiMiddleware';

export const dynamic = 'force-dynamic';

// 模組層快取（pm2 單實例即可受益），24 小時 TTL
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;

/** SSRF 防護：僅允許公開網段的 http(s) */
function isSafeUrl(raw) {
    try {
        const u = new URL(raw);
        if (!['http:', 'https:'].includes(u.protocol)) return false;
        const h = u.hostname;
        if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
        if (/^(127|10|0)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^\[?::1/.test(h)) return false;
        return true;
    } catch { return false; }
}

const decodeEntities = (str = '') => str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));

function extractTitle(html) {
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (og?.[1]) return decodeEntities(og[1].trim());
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title?.[1]) return decodeEntities(title[1].replace(/\s+/g, ' ').trim());
    return null;
}

/**
 * GET /api/link-preview?url=<https://...>
 * 回傳外部網站標題（供公告外部連結顯示，如 LINE 的連結預覽）。
 */
export async function GET(request) {
    const rateLimitCheck = checkRateLimit(request, 'link-preview', 60, 60 * 1000);
    if (!rateLimitCheck.success) return rateLimitCheck.error;

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url || !isSafeUrl(url)) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const hit = cache.get(url);
    if (hit && Date.now() - hit.ts < TTL) {
        return NextResponse.json({ success: true, title: hit.title, cached: true });
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NCUE-Scholarship-LinkPreview/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-TW,zh;q=0.9',
            },
        });
        clearTimeout(timer);

        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('html')) throw new Error('not html');

        const buffer = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BYTES);

        // 字元編碼：content-type / meta charset，預設 utf-8（台灣老站常見 big5）
        let charset = (contentType.match(/charset=([\w-]+)/i)?.[1] || '').toLowerCase();
        let html = buffer.toString('utf8');
        if (!charset) {
            charset = (html.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || '').toLowerCase();
        }
        if (charset && charset !== 'utf-8' && charset !== 'utf8') {
            try { html = new TextDecoder(charset).decode(buffer); } catch { /* 維持 utf8 解讀 */ }
        }

        const title = extractTitle(html);
        cache.set(url, { title, ts: Date.now() });
        if (cache.size > 2000) cache.delete(cache.keys().next().value);

        return NextResponse.json({ success: true, title });
    } catch (e) {
        cache.set(url, { title: null, ts: Date.now() }); // 失敗也快取，避免重複打
        return NextResponse.json({ success: true, title: null });
    }
}
