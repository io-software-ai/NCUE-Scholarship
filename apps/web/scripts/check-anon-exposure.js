#!/usr/bin/env node
/**
 * 以「未登入訪客」身分（前端公開的 anon 金鑰）探測每張表/view 是否可讀。
 * 只取筆數（limit=0 + count），不讀出任何資料內容；不做任何寫入。
 *
 *   node scripts/check-anon-exposure.js            # 用 SUPABASE_URL（本機 localhost:8000）
 *   node scripts/check-anon-exposure.js --public   # 用 NEXT_PUBLIC_SUPABASE_URL（對外網域）
 *
 * 預期：只有 announcements / attachments 回傳筆數（僅上架公告），其餘皆為 0 或 401/403。
 */
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const usePublic = process.argv.includes('--public');
const base = usePublic ? process.env.NEXT_PUBLIC_SUPABASE_URL : (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !anon) { console.error('缺少 SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(2); }

const PUBLIC_OK = new Set(['announcements', 'attachments']);
const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

(async () => {
    // 從 OpenAPI 取得 anon 看得到的所有 relation（套用修補後應只剩公開表）
    const spec = await fetch(`${base}/rest/v1/`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
    const names = new Set([
        'profiles', 'admin_profiles_view', 'chat_history', 'announcement_views', 'login_history',
        'fcm_tokens', 'line_users', 'line_messages', 'line_bind_codes', 'school_email_codes',
        'user_ai_keys', 'system_settings', 'announcement_subscriptions', 'ai_message_feedback',
        'ai_knowledge', 'ai_knowledge_gaps', 'faqs', 'announcements', 'attachments',
        ...Object.keys(spec?.definitions || {}),
    ]);

    let bad = 0;
    for (const t of [...names].sort()) {
        const res = await fetch(`${base}/rest/v1/${t}?select=*&limit=0`, { headers: { ...headers, Prefer: 'count=exact' } });
        const range = res.headers.get('content-range') || '';
        const count = Number(range.split('/')[1]) || 0;
        const exposed = res.ok && count > 0 && !PUBLIC_OK.has(t);
        if (exposed) bad++;
        console.log(`${exposed ? '❌' : '✅'} ${t.padEnd(28)} HTTP ${res.status}  rows=${res.ok ? count : '-'}`);
    }

    // anon 有 EXECUTE 權限的函式會出現在 OpenAPI 的 /rpc/* 路徑
    // pg_trgm 等擴充套件內建函式不涉及資料，略過
    const EXT_FUNCS = /^\/rpc\/(show_limit|show_trgm|set_limit|similarity|word_similarity|strict_word_similarity|unaccent)/;
    for (const p of Object.keys(spec?.paths || {}).filter(p => p.startsWith('/rpc/') && !EXT_FUNCS.test(p))) {
        bad++;
        console.log(`❌ ${p.padEnd(28)} 訪客可呼叫`);
    }

    console.log(bad ? `\n發現 ${bad} 個對訪客開放的資源` : '\n全部通過：訪客只能讀取公開公告');
    process.exit(bad ? 1 : 0);
})();
