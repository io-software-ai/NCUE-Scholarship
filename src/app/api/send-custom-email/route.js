import { siteConfig } from '@/lib/siteConfig';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyUserAuth, checkRateLimit, validateRequestData, logSuccessAction } from '@/lib/apiMiddleware';

// --- CORS 處理 ---
const allowedOrigin = siteConfig.url;

const newCorsResponse = (body, status) => {
    return new NextResponse(JSON.stringify(body), {
        status,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        },
    });
};

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        },
    });
}

// --- 郵件範本（共用模板：lib/emailTemplate）---
const generateEmailHtml = (subject, htmlBody) =>
    renderEmailShell({ heading: subject, bodyHtml: absolutizeHtmlUrls(htmlBody), preheader: subject });

// --- 郵件傳輸器設定 ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    },
});

export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'send-custom-email', 10, 60000);
        if (!rateLimitCheck.success) return newCorsResponse(rateLimitCheck.error, 429);

        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: true,
            endpoint: '/api/send-custom-email'
        });
        if (!authCheck.success) return newCorsResponse({ error: '未授權' }, 401);

        const body = await request.json();
        const dataValidation = validateRequestData(body, ['email', 'subject', 'body'], []);
        if (!dataValidation.success) return newCorsResponse(dataValidation.error, 400);

        const { email, subject, body: htmlBody } = dataValidation.data;

        const finalHtmlContent = generateEmailHtml(subject, htmlBody);
        
        const plainTextVersion = htmlBody.replace(/<[^>]*>?/gm, '');

        const mailOptions = {
            from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
            to: email,
            subject: `${subject}`,
            html: finalHtmlContent,
            text: plainTextVersion
        };

        const result = await transporter.sendMail(mailOptions);

        logSuccessAction('CUSTOM_EMAIL_SENT', '/api/send-custom-email', {
            adminId: authCheck.user.id,
            recipientEmail: email,
            subject: subject,
            messageId: result.messageId
        });

        return newCorsResponse({
            success: true,
            message: `通知已成功發送至 ${email}`,
        }, 200);

    } catch (err) {
        console.error(`[API ERROR: /api/send-custom-email]`, err.message);
        return newCorsResponse({ error: err.message || '伺服器發生內部錯誤' }, 500);
    }
}
