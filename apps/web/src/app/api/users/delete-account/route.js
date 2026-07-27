import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(request) {
    const res = NextResponse.next();

    // 1. 建立管理員 Client (使用 Service Role Key)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    // 2. 驗證當前用戶身分：
    //    - 網頁版帶 cookie（Supabase SSR session）
    //    - App（Expo）沒有 cookie，改帶 Authorization: Bearer <access_token>
    //    兩種來源都支援，App 才能在站內完成刪除帳號而不必跳網頁版。
    let user = null;
    const authHeader = request.headers.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
        const { data } = await supabaseAdmin.auth.getUser(authHeader.slice(7).trim());
        user = data?.user ?? null;
    } else {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll: () => request.cookies.getAll(),
                    setAll: (cookies) => {
                        cookies.forEach(({ name, value, options }) => {
                            res.cookies.set({ name, value, ...options });
                        });
                    },
                },
            }
        );
        const { data } = await supabase.auth.getUser();
        user = data?.user ?? null;
    }

    if (!user) {
        return NextResponse.json({ error: '未授權的操作' }, { status: 401 });
    }

    try {
        // 先解除／清理跨表關聯（多個外鍵缺 ON DELETE 規則，避免被 FK 擋下）
        const cleanups = [
            supabaseAdmin.from('line_users').update({ bound_user_id: null }).eq('bound_user_id', user.id),
            supabaseAdmin.from('announcement_subscriptions').delete().eq('user_id', user.id),
            supabaseAdmin.from('chat_history').delete().eq('user_id', user.id),
            supabaseAdmin.from('login_history').delete().eq('user_id', user.id),
            supabaseAdmin.from('system_settings').update({ updated_by: null }).eq('updated_by', user.id),
        ];
        for (const query of cleanups) {
            const { error: cleanupErr } = await query;
            if (cleanupErr) console.warn('[delete-account] cleanup failed:', cleanupErr.message);
        }

        // A. 刪除用戶在 public.profiles 中的資料 (這通常會觸發關聯資料的刪除)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', user.id);

        if (profileError) throw profileError;

        // B. 刪除 auth.users 中的帳號
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true, message: '帳戶已成功註銷' });
    } catch (err) {
        console.error('Delete account error:', err);
        return NextResponse.json({ error: err.message || '註銷過程中發生錯誤' }, { status: 500 });
    }
}
