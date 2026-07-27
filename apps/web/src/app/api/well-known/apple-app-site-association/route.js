import { NextResponse } from 'next/server';

// iOS Universal Links 的宣告檔（Apple App Site Association）。
//
// 為什麼用 route handler 而不是丟在 public/：
//   1. 這個檔案「不能有副檔名」，放在 public/ 會被以 application/octet-stream 送出，
//      而 Apple 要求 application/json。
//   2. appID 需要 Apple Team ID，屬於環境設定而非原始碼常數。
//
// 未設定 APPLE_TEAM_ID 時刻意回 404：寧可讓 iOS 視為「尚未設定」，
// 也不要送出一份 Team ID 錯誤的檔案 —— Apple 的 CDN 會快取它。
//
// Team ID 取得方式：developer.apple.com → Membership → Team ID（10 碼英數）
// 也可用 `npx eas credentials`（選 iOS）查看。

export const dynamic = 'force-dynamic';

// 與 apps/mobile/app.json 的 ios.bundleIdentifier 一致
const BUNDLE_ID = 'org.ncuesa.scholarship';

// 與 apps/mobile/app.json 的 android.intentFilters 涵蓋範圍保持一致
// /profile：LINE 綁定驗證碼訊息附的連結，導到 App 的「設定」分頁完成綁定
const PATHS = ['/announcement/*', '/profile', '/profile/*'];

export async function GET() {
    const teamId = process.env.APPLE_TEAM_ID;

    if (!teamId) {
        return NextResponse.json(
            { error: 'APPLE_TEAM_ID is not configured' },
            { status: 404 }
        );
    }

    const appID = `${teamId}.${BUNDLE_ID}`;

    const body = {
        applinks: {
            apps: [],
            details: [
                {
                    appID,
                    // paths：iOS 12 以前的舊格式
                    paths: PATHS,
                    // components：iOS 13+ 的新格式，兩者並存以涵蓋所有版本
                    components: PATHS.map((p) => ({ '/': p, comment: 'universal link' })),
                },
            ],
        },
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            // Apple 的 CDN 會抓這個檔；給一個溫和的快取時間便於修正
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
