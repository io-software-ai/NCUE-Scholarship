import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseServer } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/siteConfig';
import { renderEmailShell, renderEmailButton, EMAIL_COLORS } from '@/lib/emailTemplate';
import { sendPushToUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * 每日排程：公告截止提醒
 * 找出「今天已進入使用者設定的提醒窗口（截止日 - days_before ≤ 今天 ≤ 截止日）」
 * 且尚未寄送過的訂閱，寄送 Email＋FCM 推播（App 與網頁版裝置皆涵蓋）並標記 notified_at。
 *
 * 保護：需帶 Authorization: Bearer ${CRON_SECRET}
 * 建議 crontab（每日 08:00）：
 *   0 8 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/deadline-notify
 */
export async function GET(request) {
    try {
        const auth = request.headers.get('authorization') || '';
        if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

        // 撈出所有未通知的訂閱（含公告與使用者資料），在程式端過濾提醒窗口
        const { data: subs, error } = await supabaseServer
            .from('announcement_subscriptions')
            .select(`
                id, days_before, user_id,
                announcements:announcement_id ( id, title, application_end_date, submission_method, is_active ),
                profiles:user_id ( email, username )
            `)
            .is('notified_at', null);
        if (error) throw error;

        const due = (subs || []).filter(s => {
            const ann = s.announcements;
            if (!ann?.is_active || !ann.application_end_date) return false;
            if (ann.application_end_date < today) return false; // 已截止不再提醒
            const windowStart = new Date(ann.application_end_date);
            windowStart.setDate(windowStart.getDate() - s.days_before);
            return windowStart.toLocaleDateString('en-CA') <= today;
        });

        if (due.length === 0) {
            return NextResponse.json({ success: true, sent: 0 });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10),
            secure: process.env.SMTP_PORT === '465',
            auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
        });

        const siteUrl = siteConfig.url;
        let sent = 0;
        let pushed = 0;
        const failed = [];

        for (const sub of due) {
            const ann = sub.announcements;
            const email = sub.profiles?.email;
            const daysLeft = Math.round((new Date(ann.application_end_date) - new Date(today)) / 86400000);

            // 推播提醒（App + 網頁版裝置）：與 Email 相互獨立，任一方失敗都不影響另一方
            let pushOk = false;
            if (sub.user_id) {
                try {
                    const res = await sendPushToUsers({
                        userIds: [sub.user_id],
                        title: `【截止提醒】剩 ${daysLeft} 天`,
                        body: ann.title,
                        data: { announcementId: ann.id, url: `${siteUrl}/?announcement_id=${ann.id}` },
                        link: `${siteUrl}/?announcement_id=${ann.id}`,
                    });
                    pushed += res.successCount;
                    pushOk = res.successCount > 0;
                } catch (e) {
                    console.error(`[deadline-notify] Push failed for subscription ${sub.id}:`, e.message);
                }
            }

            if (!email) {
                // 沒有 Email 可寄：推播成功就標記已通知，否則留待明天重試
                if (pushOk) {
                    await supabaseServer
                        .from('announcement_subscriptions')
                        .update({ notified_at: new Date().toISOString() })
                        .eq('id', sub.id);
                }
                continue;
            }
            try {
                await transporter.sendMail({
                    from: `"${process.env.SENDER_NAME || siteConfig.shortName}" <${process.env.SENDER_EMAIL}>`,
                    to: email,
                    subject: `【截止提醒】「${ann.title}」剩 ${daysLeft} 天截止`,
                    html: renderEmailShell({
                        heading: '獎學金截止提醒',
                        preheader: `「${ann.title}」剩 ${daysLeft} 天截止`,
                        bodyHtml: `
                            <p>${sub.profiles?.username || '同學'} 您好，您訂閱的獎學金公告即將截止：</p>
                            <div style="background:${EMAIL_COLORS.page};border:1px solid ${EMAIL_COLORS.line};border-radius:10px;padding:18px 20px;margin:16px 0;">
                                <p style="font-weight:700;font-size:15.5px;margin:0 0 8px;color:${EMAIL_COLORS.ink};">${ann.title}</p>
                                <p style="margin:0;font-size:14px;">申請截止：<b style="color:#B42318;">${ann.application_end_date}（剩 ${daysLeft} 天）</b></p>
                                ${ann.submission_method ? `<p style="margin:6px 0 0;font-size:14px;">送件方式：${ann.submission_method}</p>` : ''}
                            </div>
                            ${renderEmailButton('查看公告詳情', `${siteUrl}/?announcement_id=${ann.id}`)}
                            <p style="color:${EMAIL_COLORS.soft};font-size:12px;margin-top:20px;text-align:center;">此信件由系統自動寄送（您於平台訂閱了此公告的截止提醒）。</p>
                        `,
                    }),
                });
                await supabaseServer
                    .from('announcement_subscriptions')
                    .update({ notified_at: new Date().toISOString() })
                    .eq('id', sub.id);
                sent++;
            } catch (e) {
                console.error(`[deadline-notify] Failed for subscription ${sub.id}:`, e.message);
                failed.push(sub.id);
            }
        }

        console.log(`[deadline-notify] Sent ${sent}/${due.length} emails, ${pushed} push deliveries`);
        return NextResponse.json({ success: true, sent, pushed, failed: failed.length });
    } catch (error) {
        console.error('[deadline-notify] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
