/**
 * 早期帳號身分資料回填腳本
 *
 * 用途：部分早期 profiles 的 email 為 null、或以校內信箱註冊卻沒有 student_id
 *   （學號推導規則只認「英文字母 + 6~8 碼數字」，教職員信箱如 juh@gm.ncue.edu.tw 推導不出來）。
 *   本腳本自 auth.users 取回真實信箱後：
 *     1. 補齊 profiles.email
 *     2. 校內信箱（@mail.ncue.edu.tw / @gm.ncue.edu.tw）→ 以信箱前綴（轉大寫）補 student_id
 *        教職員沒有學號，同樣以前綴作為識別碼
 *   非校內信箱（Gmail 等）不自動處理，統一列出供人工判斷。
 *
 * 執行：
 *   node scripts/backfill-profile-identity.js          # 預覽（dry-run，不寫入）
 *   node scripts/backfill-profile-identity.js --apply  # 實際寫入
 *
 * 安全性：student_id 有 UNIQUE 限制，若前綴已被其他帳號使用會列為衝突並跳過，不覆蓋既有值。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

const SCHOOL_DOMAINS = ['mail.ncue.edu.tw', 'gm.ncue.edu.tw'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Backfill] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

/** 校內信箱 → 前綴（轉大寫）；非校內信箱回 null */
function schoolPrefix(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const [local, domain] = normalized.split('@');
    if (!local || !SCHOOL_DOMAINS.includes(domain)) return null;
    return local.toUpperCase();
}

/** 取回所有 auth.users（分頁） */
async function listAuthUsers() {
    const users = [];
    for (let page = 1; page <= 50; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 200) break;
    }
    return users;
}

async function main() {
    console.log(`[Backfill] 模式：${APPLY ? '實際寫入 (--apply)' : '預覽 (dry-run)'}\n`);

    const authUsers = await listAuthUsers();
    const emailById = new Map(authUsers.map(u => [u.id, u.email || '']));

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, username, student_id, role, account_type, created_at')
        .order('created_at', { ascending: true });
    if (error) throw error;

    const plans = [];        // 可自動補齊的
    const conflicts = [];    // 前綴已被其他帳號占用
    const manual = [];       // 非校內信箱，交由人工處理
    const noAuthEmail = [];  // auth.users 也查無信箱

    // 既有 student_id → 帳號，用於偵測 UNIQUE 衝突
    const takenStudentId = new Map();
    for (const p of profiles) {
        if (p.student_id) takenStudentId.set(String(p.student_id).toUpperCase(), p.id);
    }

    for (const p of profiles) {
        const authEmail = emailById.get(p.id) || '';
        const email = authEmail || p.email || '';

        if (!email) {
            noAuthEmail.push(p);
            continue;
        }

        const prefix = schoolPrefix(email);
        const patch = {};

        // 1. profiles.email 缺漏或與 auth.users 不一致 → 以 auth.users 為準
        if (authEmail && p.email !== authEmail) patch.email = authEmail;

        // 2. 校內信箱且沒有學號 → 以前綴補上（教職員亦同）
        if (prefix && !p.student_id) {
            const owner = takenStudentId.get(prefix);
            if (owner && owner !== p.id) {
                conflicts.push({ profile: p, email, prefix, owner });
            } else {
                patch.student_id = prefix;
                takenStudentId.set(prefix, p.id);
            }
        }

        if (!prefix && !p.student_id) manual.push({ profile: p, email });
        if (Object.keys(patch).length > 0) plans.push({ profile: p, email, patch });
    }

    // ── 報表 ──
    console.log(`帳號總數：${profiles.length}`);
    console.log(`可自動補齊：${plans.length}　衝突：${conflicts.length}　需人工處理：${manual.length}　查無信箱：${noAuthEmail.length}\n`);

    if (plans.length > 0) {
        console.log('── 自動補齊清單 ──');
        for (const { profile, email, patch } of plans) {
            const parts = [];
            if (patch.email) parts.push(`email → ${patch.email}`);
            if (patch.student_id) parts.push(`student_id → ${patch.student_id}`);
            console.log(`  ${email.padEnd(34)} ${profile.username || '(無姓名)'}　${parts.join('　')}`);
        }
        console.log('');
    }

    if (conflicts.length > 0) {
        console.log('── 學號衝突（跳過，需人工確認）──');
        for (const c of conflicts) {
            console.log(`  ${c.email}　前綴 ${c.prefix} 已被 ${c.owner} 使用`);
        }
        console.log('');
    }

    if (manual.length > 0) {
        console.log('── 非校內信箱、且無學號（請人工清理）──');
        for (const { profile, email } of manual) {
            console.log(`  ${email.padEnd(34)} ${(profile.username || '(無姓名)').padEnd(12)} role=${profile.role || 'user'}　建立於 ${String(profile.created_at).slice(0, 10)}　id=${profile.id}`);
        }
        console.log('');
    }

    if (noAuthEmail.length > 0) {
        console.log('── auth.users 查無信箱（孤兒 profile）──');
        for (const p of noAuthEmail) console.log(`  id=${p.id}　${p.username || '(無姓名)'}　建立於 ${String(p.created_at).slice(0, 10)}`);
        console.log('');
    }

    if (!APPLY) {
        console.log('（預覽模式，未寫入任何資料。確認無誤後加上 --apply 執行）');
        return;
    }

    let ok = 0;
    let failed = 0;
    for (const { profile, email, patch } of plans) {
        const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', profile.id);
        if (updateError) {
            failed++;
            console.error(`  ✗ ${email}：${updateError.message}`);
        } else {
            ok++;
        }
    }
    console.log(`\n[Backfill] 完成：成功 ${ok} 筆，失敗 ${failed} 筆`);
}

main().catch(err => {
    console.error('[Backfill] 執行失敗：', err.message);
    process.exit(1);
});
