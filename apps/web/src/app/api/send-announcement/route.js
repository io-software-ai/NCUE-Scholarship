import { siteConfig, getAnnouncementUrl } from '@/lib/siteConfig';
import { renderEmailShell, renderEmailButton, renderInfoRow, absolutizeHtmlUrls, EMAIL_COLORS } from '@/lib/emailTemplate';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseServer } from '@/lib/supabase/server'; 
import { verifyUserAuth, checkRateLimit, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';

// --- Helper Functions ---

const parseUrls = (urlsString) => {
    if (!urlsString) return [];
    try {
        const parsed = JSON.parse(urlsString);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => item.url && typeof item.url === 'string');
        }
    } catch (e) {
        // Fallback for a single URL string that isn't JSON
        if (typeof urlsString === 'string' && urlsString.startsWith('http')) {
            return [{ url: urlsString }];
        }
    }
    return [];
};

// --- Email Template Generator ---

const generateAnnouncementEmailHtml = (announcement) => {
    const announcementUrl = getAnnouncementUrl(announcement.id);
    const deadline = announcement.application_deadline
        ? new Date(announcement.application_deadline).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
        : '未指定';
    const externalUrls = parseUrls(announcement.external_urls);
    const richTextContent = absolutizeHtmlUrls(announcement.summary || '<p>請至平台查看詳細內容。</p>');

    const infoRows = [
        announcement.category ? renderInfoRow('類別', announcement.category) : '',
        announcement.application_deadline ? renderInfoRow('申請截止', `<strong style="color:#B42318;">${deadline}</strong>`) : '',
        announcement.target_audience ? renderInfoRow('適用對象', announcement.target_audience) : '',
        announcement.submission_method ? renderInfoRow('送件方式', announcement.submission_method) : '',
    ].join('');

    const linksHtml = externalUrls.length === 0 ? '' : `
        <h3 style="font-size:15px;font-weight:700;color:${EMAIL_COLORS.ink};margin:28px 0 10px;">相關連結</h3>
        <ul style="list-style:none;padding:0;margin:0;">${externalUrls.map(item =>
            `<li style="margin-bottom:8px;"><a href="${item.url}" target="_blank" style="color:${EMAIL_COLORS.primary};word-break:break-all;">${item.url}</a></li>`).join('')}
        </ul>`;

    const bodyHtml = `
        ${infoRows ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">${infoRows}</table>` : ''}
        ${richTextContent}
        ${linksHtml}
        ${renderEmailButton('前往平台查看完整資訊', announcementUrl)}`;

    return renderEmailShell({
        heading: announcement.title,
        bodyHtml,
        preheader: `【獎學金公告】${announcement.title}`,
    });
};

// --- UPDATED: Nodemailer Transporter to match the first example ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_PORT === '465', // Use true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
    },
});

// --- API POST Handler ---
export async function POST(request) {
    try {
        const rateLimitCheck = checkRateLimit(request, 'send-announcement', 5, 300000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: true,
            endpoint: '/api/send-announcement'
        });
        if (!authCheck.success) return authCheck.error;

        const body = await request.json();
        const { announcementId } = body;

        if (typeof announcementId !== 'string' || announcementId.trim().length === 0) {
            return NextResponse.json({ error: '無效的公告 ID' }, { status: 400 });
        }

        const { data: announcement, error: annError } = await supabaseServer
            .from('announcements')
            .select('*')
            .eq('id', announcementId)
            .single();
        if (annError || !announcement) {
            return NextResponse.json({ error: '無法取得公告資料', details: annError?.message }, { status: 500 });
        }

        // 取得所有使用者 Email (處理分頁)
        let allEmails = [];
        let page = 1;
        const perPage = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: authData, error: authError } = await supabaseServer.auth.admin.listUsers({
                page: page,
                perPage: perPage
            });
            
            if (authError) throw authError;

            if (authData?.users && authData.users.length > 0) {
                const pageEmails = authData.users
                    .map(u => u.email)
                    .filter(email => email);
                
                allEmails = [...allEmails, ...pageEmails];

                if (authData.users.length < perPage) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
        }

        if (allEmails.length === 0) {
            return NextResponse.json({ error: '沒有可寄送的 Email' }, { status: 400 });
        }

        const finalHtmlContent = generateAnnouncementEmailHtml(announcement);
        const plainTextContent = (announcement.summary || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

        // --- 分批寄送邏輯 (Batching) ---
        const BATCH_SIZE = 90; 
        const batches = [];
        for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
            batches.push(allEmails.slice(i, i + BATCH_SIZE));
        }

        console.log(`[ANNOUNCEMENT-EMAIL] Total recipients: ${allEmails.length}, splitting into ${batches.length} batches.`);

        const sendResults = [];
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const mailOptions = {
                from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
                bcc: batch,
                subject: `【獎學金公告通知】${announcement.title}`,
                text: plainTextContent,
                html: finalHtmlContent
            };

            const result = await transporter.sendMail(mailOptions);
            sendResults.push(result.messageId);
            console.log(`[ANNOUNCEMENT-EMAIL] Batch ${i + 1}/${batches.length} sent. MessageId: ${result.messageId}`);
        }
        
        logSuccessAction('ANNOUNCEMENT_SENT', '/api/send-announcement', {
            adminId: authCheck.user.id,
            announcementId,
            recipientCount: allEmails.length,
            batchCount: batches.length,
            messageIds: sendResults
        });

        return NextResponse.json({
            success: true,
            message: `公告已成功發送給 ${allEmails.length} 位使用者 (分為 ${batches.length} 批次寄出)`,
            messageIds: sendResults,
            recipientCount: allEmails.length
        });

    } catch (err) {
        return handleApiError(err, '/api/send-announcement');
    }
}
