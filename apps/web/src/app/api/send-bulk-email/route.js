import { siteConfig } from '@/lib/siteConfig';
import { renderEmailShell, absolutizeHtmlUrls } from '@/lib/emailTemplate';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyUserAuth, checkRateLimit, validateRequestData, logSuccessAction, handleApiError } from '@/lib/apiMiddleware';
import { supabaseServer } from '@/lib/supabase/server';

// --- CORS 處理 ---
const allowedOrigin = siteConfig.url;

const newCorsResponse = (body, status) => {
    return new NextResponse(JSON.stringify(body), {
        status,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
};

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

// --- 郵件範本產生器 (與 send-custom-email 相同) ---
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
    const endpoint = '/api/send-bulk-email';
    try {
        // 速率限制
        const rateLimitCheck = checkRateLimit(request, 'send-bulk-email', 5, 60000); // 1分鐘內最多5次
        if (!rateLimitCheck.success) return newCorsResponse(rateLimitCheck.error.body, { status: rateLimitCheck.error.status });

        // 驗證管理員身份
        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: true,
            endpoint
        });
        if (!authCheck.success) return newCorsResponse(authCheck.error.body, { status: authCheck.error.status });

        const body = await request.json();

        // 驗證請求資料 (subject, body 必填; targetRole 或 bcc 二擇一)
        const dataValidation = validateRequestData(body, ['subject', 'body']);
        if (!dataValidation.success) return newCorsResponse(dataValidation.error.body, { status: dataValidation.error.status });

        const { targetRole, bcc: explicitBcc, subject, body: htmlBody } = body;
        let finalBcc = [];

        if (targetRole) {
            // Server-side fetching of emails based on role
            const supabase = supabaseServer;
            
            // 1. Fetch relevant profile IDs (Paginated to handle > 1000)
            let allProfiles = [];
            let from = 0;
            const step = 1000;
            let profileHasMore = true;

            while (profileHasMore) {
                let profileQuery = supabase.from('profiles').select('id').range(from, from + step - 1);
                if (targetRole !== 'all') {
                    profileQuery = profileQuery.eq('role', targetRole);
                }
                const { data: profiles, error: profileError } = await profileQuery;
                
                if (profileError) throw profileError;
                
                if (profiles && profiles.length > 0) {
                    allProfiles = [...allProfiles, ...profiles];
                    if (profiles.length < step) profileHasMore = false;
                    else from += step;
                } else {
                    profileHasMore = false;
                }
            }
            
            const targetIds = new Set(allProfiles.map(p => p.id));

            // 2. Fetch ALL Auth Users and filter
            let allAuthEmails = [];
            let page = 1;
            const perPage = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
                    page: page,
                    perPage: perPage
                });
                
                if (authError) throw authError;

                if (authData?.users && authData.users.length > 0) {
                    const pageEmails = authData.users
                        .filter(u => targetIds.has(u.id))
                        .map(u => u.email)
                        .filter(email => email); // Ensure email exists
                    
                    allAuthEmails = [...allAuthEmails, ...pageEmails];

                    if (authData.users.length < perPage) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            }
            finalBcc = allAuthEmails;

        } else if (Array.isArray(explicitBcc) && explicitBcc.length > 0) {
            finalBcc = explicitBcc;
        } else {
            return newCorsResponse({ error: '必須提供 targetRole 或 bcc 列表' }, { status: 400 });
        }

        if (finalBcc.length === 0) {
            return newCorsResponse({ error: '找不到符合條件的收件者' }, { status: 400 });
        }

        const finalHtmlContent = generateEmailHtml(subject, htmlBody);
        const plainTextVersion = htmlBody.replace(/<[^>]*>?/gm, '');

        // --- 分批寄送邏輯 (Batching) ---
        const BATCH_SIZE = 90; // 每封郵件收件者上限，建議低於 100 以確保穩定
        const batches = [];
        for (let i = 0; i < finalBcc.length; i += BATCH_SIZE) {
            batches.push(finalBcc.slice(i, i + BATCH_SIZE));
        }

        console.log(`[BULK-EMAIL] Total recipients: ${finalBcc.length}, splitting into ${batches.length} batches.`);

        const sendResults = [];
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const mailOptions = {
                from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
                bcc: batch,
                subject: `${subject}`,
                html: finalHtmlContent,
                text: plainTextVersion
            };

            const result = await transporter.sendMail(mailOptions);
            sendResults.push(result.messageId);
            console.log(`[BULK-EMAIL] Batch ${i + 1}/${batches.length} sent. MessageId: ${result.messageId}`);
        }

        logSuccessAction('BULK_EMAIL_SENT', endpoint, {
            adminId: authCheck.user.id,
            recipientCount: finalBcc.length,
            batchCount: batches.length,
            targetRole: targetRole || 'explicit',
            subject: subject,
            messageIds: sendResults
        });

        return newCorsResponse({
            success: true,
            message: `群發郵件已成功寄送給 ${finalBcc.length} 位使用者 (分為 ${batches.length} 批次寄出)`,
        }, 200);

    } catch (err) {
        return handleApiError(err, endpoint);
    }
}