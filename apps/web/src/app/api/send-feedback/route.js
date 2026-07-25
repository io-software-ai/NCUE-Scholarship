import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { checkRateLimit, handleApiError } from '@/lib/apiMiddleware';
import { siteConfig, getFeedbackRecipient } from '@/lib/siteConfig';
import { renderEmailShell, renderInfoRow } from '@/lib/emailTemplate';
const MAX_FILES = 3;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const escapeHtml = (str = '') =>
    String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * POST /api/send-feedback
 * 站內問題回報（FormData）：type / description / email(選填) / page / images[]（≤3 張圖）
 * 寄送至平台維護信箱，不需登入（rate limit 保護）。
 */
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'send-feedback', 5, 10 * 60 * 1000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const formData = await request.formData();
        const type = String(formData.get('type') || '其他').slice(0, 50);
        const description = String(formData.get('description') || '').trim().slice(0, 5000);
        const email = String(formData.get('email') || '').trim().slice(0, 100);
        const page = String(formData.get('page') || '').slice(0, 300);
        const images = formData.getAll('images');

        if (!description) {
            return NextResponse.json({ error: '請填寫問題描述' }, { status: 400 });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 });
        }

        // 附件驗證（僅圖片、數量與大小上限）
        const attachments = [];
        for (const file of images.slice(0, MAX_FILES)) {
            if (typeof file === 'string') continue;
            if (!file.type?.startsWith('image/')) {
                return NextResponse.json({ error: '僅接受圖片附件' }, { status: 400 });
            }
            if (file.size > MAX_SIZE) {
                return NextResponse.json({ error: '圖片需小於 5MB' }, { status: 400 });
            }
            attachments.push({
                filename: file.name || `image-${attachments.length + 1}.png`,
                content: Buffer.from(await file.arrayBuffer()),
                contentType: file.type,
            });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10),
            secure: process.env.SMTP_PORT === '465',
            auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
        });

        const userAgent = request.headers.get('user-agent') || '未知';
        const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

        await transporter.sendMail({
            from: `"${process.env.SENDER_NAME || siteConfig.shortName}" <${process.env.SENDER_EMAIL}>`,
            to: getFeedbackRecipient(),
            replyTo: email || undefined,
            subject: `【平台問題回報】${type}`,
            html: renderEmailShell({
                heading: '平台問題回報',
                preheader: `【${type}】${description.slice(0, 60)}`,
                bodyHtml: `
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
                        ${renderInfoRow('類型', escapeHtml(type))}
                        ${renderInfoRow('回報時間', escapeHtml(now))}
                        ${renderInfoRow('聯絡 Email', escapeHtml(email) || '（未提供）')}
                        ${renderInfoRow('發生頁面', escapeHtml(page) || '（未提供）')}
                        ${renderInfoRow('瀏覽器', `<span style="font-size:12px;">${escapeHtml(userAgent)}</span>`)}
                    </table>
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7A8899;">問題描述</p>
                    <div style="background:#F6F8FA;border:1px solid #E2E8EF;border-radius:8px;padding:14px 16px;white-space:pre-wrap;font-size:14px;line-height:1.7;">${escapeHtml(description)}</div>
                    ${attachments.length > 0 ? `<p style="margin-top:14px;font-size:13px;color:#7A8899;">附件圖片 ${attachments.length} 張，詳見信件附檔。</p>` : ''}
                `,
            }),
            attachments,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/send-feedback');
    }
}
