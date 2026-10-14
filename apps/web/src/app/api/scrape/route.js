import { NextResponse } from 'next/server';
import { load } from 'cheerio';
import { verifyUserAuth, checkRateLimit } from '@/lib/apiMiddleware';
import { safeFetch, UnsafeUrlError } from '@/lib/safeFetch';

/**
 * POST /api/scrape  { url }
 * 管理員建立公告時抓取外部網頁文字供 AI 摘要。
 * 僅限管理員；對外請求一律走 safeFetch（擋內網 / 本機 / 重新導向繞過）。
 */
export async function POST(request) {
    const rateLimitCheck = checkRateLimit(request, 'scrape', 20, 60000);
    if (!rateLimitCheck.success) return rateLimitCheck.error;

    const authCheck = await verifyUserAuth(request, { requireAuth: true, requireAdmin: true, endpoint: '/api/scrape' });
    if (!authCheck.success) return authCheck.error;

    try {
        const { url } = await request.json();
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            return NextResponse.json({ error: '請提供一個有效的 URL。' }, { status: 400 });
        }

        const response = await safeFetch(url, {
            timeoutMs: 15000,
            maxBytes: 3 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: `無法抓取網站，狀態碼: ${response.status}` }, { status: 502 });
        }

        const $ = load(response.text());
        $('script, style, noscript, iframe, header, footer, nav, aside').remove();

        let text = $('body').text();
        text = text.replace(/(\s*[\r\n]\s*)+/g, '\n');
        text = text.replace(/[ \t]+/g, ' ');
        text = text.trim();

        if (!text) {
            return NextResponse.json({ scrapedText: null, message: '無法從此網址提取有效文字內容。' });
        }
        return NextResponse.json({ scrapedText: text });
    } catch (error) {
        if (error instanceof UnsafeUrlError) {
            return NextResponse.json({ error: '不允許的網址（僅能抓取公開網站）。' }, { status: 400 });
        }
        console.error('Scraping Error:', error);
        return NextResponse.json({ error: '伺服器端爬取失敗' }, { status: 500 });
    }
}
