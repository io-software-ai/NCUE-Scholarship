import { fetchPublicAnnouncements } from '@/lib/publicAnnouncements';
import { siteConfig } from '@/lib/siteConfig';

export const dynamic = 'force-dynamic';

const esc = (s = '') => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * RSS 2.0 訂閱源：最新上架獎助學金公告
 * GET /rss.xml — 供 RSS 閱讀器、政府開放資料聚合與第三方訂閱使用。
 */
export async function GET() {
    let items = [];
    try {
        ({ items } = await fetchPublicAnnouncements({ limit: 40 }));
    } catch (e) {
        console.error('[RSS] fetch failed:', e.message);
    }

    const now = new Date().toUTCString();
    const feedItems = items.map(a => {
        const pub = a.published_at ? new Date(a.published_at).toUTCString() : now;
        const deadline = a.application_end_date ? `（申請截止：${a.application_end_date}）` : '';
        const desc = `${a.category_name ? `[${a.category_name}] ` : ''}${a.summary || ''}${deadline}`;
        return `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(a.url)}</link>
      <guid isPermaLink="true">${esc(a.url)}</guid>
      <category>${esc(a.category_name || '獎助學金')}</category>
      <pubDate>${pub}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteConfig.name)}</title>
    <link>${esc(siteConfig.url)}</link>
    <atom:link href="${esc(siteConfig.url)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${esc('最新校外獎助學金公告訂閱源')}</description>
    <language>zh-TW</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>60</ttl>
${feedItems}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
    });
}
