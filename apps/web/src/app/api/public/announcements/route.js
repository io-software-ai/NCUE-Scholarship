import { NextResponse } from 'next/server';
import { fetchPublicAnnouncements } from '@/lib/publicAnnouncements';
import { siteConfig } from '@/lib/siteConfig';
import { CATEGORY_NAMES } from '@/lib/announcementUi';

export const dynamic = 'force-dynamic';

/**
 * 公開開放資料 API（免驗證，CORS 已於 next.config 開放 *）
 *
 * GET /api/public/announcements?category=A&limit=20&offset=0
 * 供政府開放資料介接、第三方站台與 App 取用上架獎助學金公告。
 *
 * 回應：{ provider, license, generated_at, categories, count, total, limit, offset, data:[...] }
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const limit = searchParams.get('limit');
        const offset = searchParams.get('offset');

        const { items, total, limit: usedLimit, offset: usedOffset } =
            await fetchPublicAnnouncements({ category, limit, offset });

        return NextResponse.json({
            provider: siteConfig.name,
            homepage: siteConfig.url,
            license: 'CC BY 4.0',
            generated_at: new Date().toISOString(),
            categories: CATEGORY_NAMES,
            count: items.length,
            total,
            limit: usedLimit,
            offset: usedOffset,
            data: items,
        }, {
            headers: {
                // 對外資料可短期快取，降低來源站台負載
                'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
            },
        });
    } catch (error) {
        console.error('[PublicAPI] announcements failed:', error);
        return NextResponse.json({ error: '無法取得公告資料' }, { status: 500 });
    }
}
