import { supabaseServer as supabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * 儲存裝置 FCM token。
 *
 * 身分來源：
 * - App（Expo）帶 Authorization: Bearer <access_token>
 * - 網頁版 fetch 亦可帶同樣的 header（authFetch 會自動附上）
 * 取不到身分時仍會存下 token（user_id = null），僅供全體廣播使用；
 * 但截止提醒需要對「特定使用者」發送，因此有身分時務必寫入 user_id。
 */
export async function POST(request) {
    try {
        const { token, deviceType } = await request.json();
        if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 });

        // supabaseServer 是 service-role client，沒有使用者 session；
        // 必須拿 Bearer token 去換使用者，否則 user_id 永遠是 null。
        const authHeader = request.headers.get('authorization');
        let user = null;
        if (authHeader?.startsWith('Bearer ')) {
            const { data } = await supabase.auth.getUser(authHeader.slice(7).trim());
            user = data?.user ?? null;
        }

        // 檢查 Token 是否已存在
        const { data: existing } = await supabase
            .from('fcm_tokens')
            .select('id, user_id')
            .eq('fcm_token', token)
            .maybeSingle();

        if (existing) {
            // 已存在：補上／更新 user_id 關聯（同一台裝置換人登入也要跟著換）
            if (user && existing.user_id !== user.id) {
                await supabase
                    .from('fcm_tokens')
                    .update({ user_id: user.id, device_type: deviceType || 'web' })
                    .eq('id', existing.id);
            }
            return NextResponse.json({ message: 'Token already exists', linked: !!user });
        }

        // 插入新 Token
        const { error } = await supabase.from('fcm_tokens').insert({
            fcm_token: token,
            user_id: user?.id || null,
            device_type: deviceType || 'web'
        });

        if (error) throw error;

        return NextResponse.json({ message: 'Token saved successfully', linked: !!user });
    } catch (error) {
        console.error('Error saving token:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
