import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { handleApiError, getClientIp } from '@/lib/apiMiddleware';
import { deriveStudentIdFromEmail } from '@/lib/studentId';

/**
 * 校內信箱 → 自動補寫 profiles.student_id（建檔與既有帳號皆適用）。
 * 學號有 UNIQUE 限制：已被其他帳號占用時跳過不寫，交由人工處理，不能擋登入。
 * 未證明信箱所有權者不推導（同 migration 20260803 的 trigger 條件）：
 * 公開的 /auth/v1/signup 可用未確認的校內信箱註冊，不設限會被搶走他人學號。
 */
function ownsMailbox(user) {
    const provider = user?.app_metadata?.provider || 'email';
    return !!user?.email_confirmed_at || !['email', 'phone'].includes(provider);
}

async function ensureStudentId(profile, user) {
    if (!profile || profile.student_id || !ownsMailbox(user)) return profile;
    const studentId = deriveStudentIdFromEmail(user.email);
    if (!studentId) return profile;

    try {
        const { data: taken } = await supabaseServer
            .from('profiles').select('id').eq('student_id', studentId).neq('id', profile.id).maybeSingle();
        if (taken) {
            console.warn(`[ProfileSync] 學號 ${studentId} 已被 ${taken.id} 綁定，跳過 ${profile.id} 的自動補寫`);
            return profile;
        }

        const { data: updated, error } = await supabaseServer
            .from('profiles')
            .update({ student_id: studentId })
            .eq('id', profile.id)
            .is('student_id', null)
            .select()
            .maybeSingle();
        if (error) throw error;
        return updated || profile;
    } catch (err) {
        // 併發或殘留的 UNIQUE 衝突不應讓整個登入同步失敗
        console.error('[ProfileSync] student_id 自動補寫失敗:', err?.message);
        return profile;
    }
}

export async function POST(request) {
    const endpoint = '/api/auth/profile-sync';
    try {
        // 1. 從 Authorization Header 取得 Token
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
        }
        
        const token = authHeader.replace('Bearer ', '');
        
        // 2. 驗證 Token 並取得 User
        const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
        
        if (authError || !user) {
            console.error('[ProfileSync] Auth error:', authError?.message);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const email = user.email;
        const userAgent = request.headers.get('user-agent') || 'unknown';
        
        // 取得更準確的客戶端 IP
        const ip = getClientIp(request);

        let profile;

        // 3. 檢查 Profile 是否存在 (根據 ID)
        const { data: profileById, error: fetchError } = await supabaseServer
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (profileById) {
            profile = profileById;
        } else {
            // 4.（已移除）舊版會把「同 email 的既有 profile」改綁到目前帳號，連 role / 學號一起繼承。
            // profiles.id 有 FK → auth.users，同 email 的 profile 必定屬於另一個現存帳號，改綁等同搶奪他人資料，
            // 因此一律只為自己建立新 profile。
            {
                // 5. 建立全新 Profile
                const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
                const { data: newProfile, error: createError } = await supabaseServer
                    .from('profiles')
                    .insert({
                        id: user.id,
                        username: name,
                        email: email,
                        role: 'user',
                        has_agreed_to_terms: false
                    })
                    .select()
                    .single();

                if (createError) throw createError;
                profile = newProfile;
            }
        }

        // 6. 校內信箱（@mail / @gm.ncue.edu.tw）→ 自動補寫學號
        // 涵蓋新建檔與既有帳號（早期建檔路徑沒寫 student_id，於下次登入自我修復）
        profile = await ensureStudentId(profile, user);

        // 7. 移除強制寫入登入紀錄的邏輯，改由登入時 (LoginClient 與 OAuth callback) 主動觸發
        // 以避免 Token 刷新或系統重整時產生多餘的登入紀錄

        return NextResponse.json({ success: true, profile });

    } catch (err) {
        return handleApiError(err, endpoint);
    }
}
