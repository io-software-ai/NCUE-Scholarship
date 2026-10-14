/** @type {import('next').NextConfig} */
const SECURITY_HEADERS = [
    // 防點擊劫持：只允許本站把頁面嵌入 iframe
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // HSTS 由 Cloudflare 統一送出，這裡不重複（重複的 HSTS 標頭瀏覽器只採用第一個）
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig = {
    poweredByHeader: false,

    // 允許開發時外部網域存取
    allowedDevOrigins: [
        '10.21.44.243',
        'localhost',
        '127.0.0.1',
        'scholarship.ncuesa.org.tw',
        'www.scholarship.ncuesa.org.tw'
    ],

    // 設置 CORS headers 與 Cache Control
    async headers() {
        return [
            {
                // 為靜態資源設置長效快取 (1年)
                source: '/(logo.png|banner.jpg|favicon.ico|fonts/.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                // API 的 CORS：嵌入式 widget（/api/public/*）與行動 App 需要跨來源呼叫。
                // 驗證一律走 Authorization 標頭（不用 cookie），因此 * 不會讓他站帶著使用者身分呼叫。
                source: '/api/:path*',
                headers: [
                    {
                        key: 'Access-Control-Allow-Origin',
                        value: '*',
                    },
                    {
                        key: 'Access-Control-Allow-Methods',
                        value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                    },
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Content-Type, Authorization, X-Requested-With, apikey, prefer, x-client-info, x-supabase-api-version',
                    },
                    {
                        key: 'Access-Control-Expose-Headers',
                        value: 'content-range, x-supabase-api-version',
                    },
                    {
                        key: 'Access-Control-Max-Age',
                        value: '86400',
                    },
                ],
            },
            {
                // 全站安全標頭（原本頁面路由的 CORS * 沒有任何用途，已移除）
                source: '/:path*',
                headers: SECURITY_HEADERS,
            },
        ];
    },

    async rewrites() {
        return [
            {
                // iOS Universal Links 必須從這個固定且無副檔名的路徑提供，
                // 交由 route handler 處理才能送出正確的 application/json。
                // （Android 的 assetlinks.json 有副檔名，直接放 public/ 即可。）
                source: '/.well-known/apple-app-site-association',
                destination: '/api/well-known/apple-app-site-association',
            },
        ];
    },
};

export default nextConfig;
