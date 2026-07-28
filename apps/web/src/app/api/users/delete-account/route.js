import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { deleteUserAccount } from '@/lib/accountDeletion';

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
        // 清理關聯資料 + 刪除 profiles / auth.users（與清除自備金鑰時共用同一實作）
        await deleteUserAccount(user.id);

        return NextResponse.json({ success: true, message: '帳戶已成功註銷' });
    } catch (err) {
        // 唯一管理員不得註銷（非系統錯誤，回 409 讓前端直接顯示原因）
        if (err.code === 'LAST_ADMIN') {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        console.error('Delete account error:', err);
        return NextResponse.json({ error: err.message || '註銷過程中發生錯誤' }, { status: 500 });
    }
}
