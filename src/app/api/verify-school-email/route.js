import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { deriveStudentIdFromEmail } from '@/lib/studentId';
import { renderEmailShell } from '@/lib/emailTemplate';
import { siteConfig } from '@/lib/siteConfig';

/**
 * 校信箱驗證（以非校內信箱登入者，綁定學號用）
 *
 * POST body:
 *   { action: 'send',    email }  → 寄送 6 位數驗證碼至 @mail.ncue.edu.tw 信箱（10 分鐘有效）
 *   { action: 'confirm', code }   → 驗證成功後將學號寫入 profiles.student_id
 *
 * 資料表：school_email_codes（user_id PK, email, code, expires_at）
 */
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'verify-school-email', 6, 10 * 60 * 1000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true, endpoint: '/api/verify-school-email' });
        if (!authCheck.success) return authCheck.error;
        const userId = authCheck.user.id;

        const { action, email, code } = await request.json();

        if (action === 'send') {
            const normalized = String(email || '').trim().toLowerCase();
            const studentId = deriveStudentIdFromEmail(normalized);
            if (!studentId) {
                return NextResponse.json({ error: '請輸入正確的學校信箱（帳號@mail.ncue.edu.tw 或 @gm.ncue.edu.tw）' }, { status: 400 });
            }

            // 該學號不得已被其他帳號綁定
            const { data: taken } = await supabaseServer
                .from('profiles').select('id').eq('student_id', studentId).neq('id', userId).maybeSingle();
            if (taken) {
                return NextResponse.json({ error: '此學號已被其他帳號綁定，若有疑問請聯繫平台維護團隊' }, { status: 409 });
            }

            const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
            const { error: upsertErr } = await supabaseServer.from('school_email_codes').upsert({
                user_id: userId,
                email: normalized,
                code: verifyCode,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }, { onConflict: 'user_id' });
            if (upsertErr) {
                return NextResponse.json({ error: '驗證碼建立失敗，請確認資料庫 migration 已套用' }, { status: 500 });
            }

            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT, 10),
                secure: process.env.SMTP_PORT === '465',
                auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
            });
            await transporter.sendMail({
                from: `"${process.env.SENDER_NAME || siteConfig.shortName}" <${process.env.SENDER_EMAIL}>`,
                to: normalized,
                subject: '【學號驗證】您的驗證碼',
                html: renderEmailShell({
                    heading: '學號驗證',
                    preheader: `驗證碼 ${verifyCode}（10 分鐘內有效）`,
                    bodyHtml: `
                        <p>您好：</p>
                        <p>您正在「${siteConfig.name}」綁定學號 <strong translate="no">${studentId}</strong>，驗證碼為：</p>
                        <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#005A9C;text-align:center;margin:24px 0;" translate="no">${verifyCode}</p>
                        <p>請於 <strong>10 分鐘內</strong>回到平台「個資管理」頁面輸入此驗證碼。若這不是您本人的操作，請忽略此信。</p>
                    `,
                }),
            });

            logSuccessAction('SCHOOL_EMAIL_CODE_SENT', '/api/verify-school-email', { userId, studentId });
            return NextResponse.json({ success: true, message: `驗證碼已寄至 ${normalized}` });
        }

        if (action === 'confirm') {
            const normalized = String(code || '').trim();
            if (!/^\d{6}$/.test(normalized)) {
                return NextResponse.json({ error: '驗證碼格式錯誤（6 位數字）' }, { status: 400 });
            }
            const { data: row } = await supabaseServer
                .from('school_email_codes').select('email, code, expires_at').eq('user_id', userId).maybeSingle();
            if (!row || row.code !== normalized || new Date(row.expires_at) < new Date()) {
                return NextResponse.json({ error: '驗證碼錯誤或已過期，請重新寄送' }, { status: 400 });
            }

            const studentId = deriveStudentIdFromEmail(row.email);
            const { error: updateErr } = await supabaseServer
                .from('profiles').update({ student_id: studentId }).eq('id', userId);
            if (updateErr) throw updateErr;
            await supabaseServer.from('school_email_codes').delete().eq('user_id', userId);

            logSuccessAction('SCHOOL_EMAIL_VERIFIED', '/api/verify-school-email', { userId, studentId });
            return NextResponse.json({ success: true, studentId, message: `學號 ${studentId} 綁定成功` });
        }

        return NextResponse.json({ error: '未知的 action' }, { status: 400 });
    } catch (error) {
        return handleApiError(error, '/api/verify-school-email');
    }
}
