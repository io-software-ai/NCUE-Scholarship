import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // 獲取正確的域名 (支援反向代理)
  const getOrigin = () => {
    // 檢查 X-Forwarded-Host 或 Host headers
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host');
    
    console.log(`[AUTH-CALLBACK] Headers: host=${host}, x-forwarded-host=${forwardedHost}, x-forwarded-proto=${forwardedProto}`);
    
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
    
    // 如果有 host header 且不是 localhost，優先使用 host header 並補上協定
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `https://${host}`;
    }
    
    // 從環境變數取得
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return process.env.NEXT_PUBLIC_APP_URL;
    }
    
    // fallback 到 request origin
    return requestUrl.origin;
  };

  const origin = getOrigin();
  console.log(`[AUTH-CALLBACK] Request URL: ${requestUrl.href}`);
  console.log(`[AUTH-CALLBACK] Detected Origin: ${origin}`);
  console.log(`[AUTH-CALLBACK] Code: ${code ? 'present' : 'missing'}`);

  if (code) {
    const cookieStore = await cookies()
    
    // 使用與前端一致的配置
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    console.log(`[AUTH-CALLBACK] Using Supabase URL: ${supabaseUrl}`);
    
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (newCookies) => {
            newCookies.forEach(({ name, value, options }) => {
              cookieStore.set({ name, value, ...options })
            })
          }
        }
      }
    )
    
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('[AUTH-CALLBACK] 驗證錯誤:', error)
        // PKCE code_verifier 找不到 / flow state 失效：多半是在不同裝置或瀏覽器完成登入、
        // 儲存被清除、或重複開啟同一組回呼連結所致。給使用者可行的下一步，不外洩原始錯誤字串。
        const friendly = /code verifier|flow state|code challenge/i.test(error.message || '')
          ? '登入連結已失效，或是在與開始登入時不同的裝置／瀏覽器開啟。請回到登入頁重新登入一次。'
          : '登入驗證失敗，請重新登入。'
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(friendly)}`)
      }

      // 驗證成功，重定向到 profile 頁面。
      // 登入紀錄改由前端於 session 建立後呼叫 /api/users/login-log 寫入（見 AuthContext），
      // 不再於此以 anon client 寫入 —— 伺服器端 PKCE 交換偶發不穩時才不會漏記。
      // profile 記錄由資料庫 trigger 自動建立，無需在此手動建立。
      return NextResponse.redirect(`${origin}/profile`)
    } catch (err) {
      console.error('[AUTH-CALLBACK] 處理驗證回調時發生錯誤:', err)
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('驗證過程中發生錯誤，請重新登入。')}`)
    }
  }

  // 沒有驗證碼，重定向到登入頁面
  return NextResponse.redirect(`${origin}/login`)
}
