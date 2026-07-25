export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { supabaseServer } from '@/lib/supabase/server';
import { getSystemConfig } from '@/lib/config';
import { getLineConfig, verifyLineSignature, replyMessage, pushMessage, getLineProfile, downloadLineContent, sanitizeLineUserId } from '@/lib/line';
import { runScholarshipAgentText } from '@/lib/ai/agent';
import { siteConfig } from '@/lib/siteConfig';

const WELCOME_MESSAGE = `感謝您加入「${siteConfig.name}」官方帳號！🎓

完成帳號綁定後，即可直接在此詢問 AI 獎學金助理，例如：
• 最近有哪些獎學金可以申請？
• 低收入戶可以申請什麼獎學金？
• ○○獎學金的截止日期是什麼時候？

請點選下方選單「帳號綁定」（或直接輸入「帳號綁定」）取得驗證碼開始綁定。

更多公告請至平台查詢：${siteConfig.url}`;

const BIND_GUIDE_MESSAGE = `您好！使用 AI 獎學金助理前，請先完成帳號綁定：

1. 點選下方選單「帳號綁定」（或直接輸入「帳號綁定」）取得驗證碼
2. 於 10 分鐘內至平台「個資管理」頁面的「LINE 帳號綁定」輸入驗證碼

完成綁定後，AI 獎學金助理將同步您在 LINE 與網頁的對話紀錄。
${siteConfig.url}/profile`;

// AI 自動回覆免責聲明：每則 AI 回覆結尾附上，提醒使用者自行查證
const LINE_AI_DISCLAIMER = '\n\n———\n※ 此為 AI 自動回覆，內容可能有誤，請務必以平台公告原文為準並自行查證。';

const NON_TEXT_LABEL = {
    sticker: '[貼圖]',
    image: '[圖片]',
    video: '[影片]',
    audio: '[語音]',
    file: '[檔案]',
    location: '[位置訊息]',
};

const EXT_BY_TYPE = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
};

/**
 * 將 LINE 圖片附件下載並暫存到 public/storage/line/<userId>/。
 * 回傳可公開存取的路徑；失敗時回傳 null。
 */
async function storeLineImage(lineUserId, messageId) {
    try {
        const { buffer, contentType } = await downloadLineContent(messageId);
        const ext = EXT_BY_TYPE[contentType.split(';')[0]] || '.jpg';
        const safeUser = sanitizeLineUserId(lineUserId);
        const dir = path.join(process.cwd(), 'public', 'storage', 'line', safeUser);
        await fs.mkdir(dir, { recursive: true });
        const fileName = `${Date.now()}-${messageId}${ext}`;
        await fs.writeFile(path.join(dir, fileName), buffer);
        return `/storage/line/${safeUser}/${fileName}`;
    } catch (e) {
        console.error('[LINE Webhook] Image store failed:', e.message);
        return null;
    }
}

async function upsertLineUser(lineUserId, { refreshProfile = false, isFollowed = true } = {}) {
    const now = new Date().toISOString();
    const { data: existing } = await supabaseServer
        .from('line_users')
        .select('line_user_id, display_name')
        .eq('line_user_id', lineUserId)
        .maybeSingle();

    const row = { line_user_id: lineUserId, is_followed: isFollowed, updated_at: now };

    if (refreshProfile || !existing || !existing.display_name) {
        const profile = await getLineProfile(lineUserId);
        if (profile) {
            row.display_name = profile.displayName || null;
            row.picture_url = profile.pictureUrl || null;
            row.status_message = profile.statusMessage || null;
        }
    }

    await supabaseServer.from('line_users').upsert(row, { onConflict: 'line_user_id' });
}

async function saveLineMessage(lineUserId, role, content, messageType = 'text') {
    await supabaseServer.from('line_messages').insert({
        line_user_id: lineUserId,
        role,
        message_type: messageType,
        content,
    });
    await supabaseServer
        .from('line_users')
        .update({ last_message_at: new Date().toISOString() })
        .eq('line_user_id', lineUserId);
}

/**
 * AI 自動回覆：以近期 LINE 對話為上下文；若好友已綁定平台帳號，
 * 一併帶入該帳號在「網頁版 AI 助理」的近期對話紀錄，跨渠道連續理解。
 */
/**
 * AI 自動回覆「回應時間」排程檢查（台北時區）
 * 設定存於 system_settings.LINE_AI_REPLY_SCHEDULE：
 *   { enabled, offHoursMessage, days: { 0:[{start:'09:00',end:'22:00'}], … } }（0=週日）
 * 未設定或 enabled=false → 視為全天回應。
 */
async function checkReplySchedule() {
    try {
        const raw = await getSystemConfig('LINE_AI_REPLY_SCHEDULE');
        if (!raw) return { inHours: true };
        const sched = JSON.parse(raw);
        if (!sched?.enabled) return { inHours: true };

        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(new Date());
        const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
        const minutes = (parseInt(map.hour, 10) % 24) * 60 + parseInt(map.minute, 10);

        const ranges = sched.days?.[day] || sched.days?.[String(day)] || [];
        const inHours = ranges.some(r => {
            const [sh, sm] = String(r.start || '').split(':').map(Number);
            const [eh, em] = String(r.end || '').split(':').map(Number);
            if ([sh, sm, eh, em].some(Number.isNaN)) return false;
            return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
        });
        return { inHours, offHoursMessage: (sched.offHoursMessage || '').trim() };
    } catch (e) {
        console.warn('[LINE Webhook] Schedule parse failed, default to in-hours:', e.message);
        return { inHours: true };
    }
}

// 每位 LINE 好友的 AI 回覆 RPM 上限（防惡意刷量；程序內記憶即可）
const lineAiRpm = new Map(); // lineUserId -> number[]（近一分鐘的時間戳）
const LINE_AI_RPM_LIMIT = 5;

function checkLineAiRpm(lineUserId) {
    const now = Date.now();
    const stamps = (lineAiRpm.get(lineUserId) || []).filter(t => now - t < 60000);
    if (stamps.length >= LINE_AI_RPM_LIMIT) { lineAiRpm.set(lineUserId, stamps); return false; }
    stamps.push(now);
    lineAiRpm.set(lineUserId, stamps);
    return true;
}

async function handleAiReply(lineUserId, replyToken, boundUserId = null) {
    const { data: recent } = await supabaseServer
        .from('line_messages')
        .select('role, content, message_type')
        .eq('line_user_id', lineUserId)
        .order('created_at', { ascending: false })
        .limit(10);

    const lineHistory = (recent || [])
        .reverse()
        .filter(msg => msg.message_type === 'text' && msg.content)
        .map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', content: msg.content }));

    if (lineHistory.length === 0) return;

    // 綁定帳號 → 撈網頁版 chat_history 作為前情上下文
    let webHistory = [];
    try {
        const { data: lineUser } = await supabaseServer
            .from('line_users')
            .select('bound_user_id')
            .eq('line_user_id', lineUserId)
            .maybeSingle();

        if (lineUser?.bound_user_id) {
            const { data: webRecent } = await supabaseServer
                .from('chat_history')
                .select('role, message_content')
                .eq('user_id', lineUser.bound_user_id)
                .neq('role', 'system') // 排除清除紀錄標記列
                .order('timestamp', { ascending: false })
                .limit(10);

            webHistory = (webRecent || [])
                .reverse()
                .filter(msg => msg.message_content)
                .map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', content: msg.message_content }));

            if (webHistory.length > 0) {
                // 標示渠道分界，避免模型混淆兩段對話
                webHistory.push({ role: 'model', content: '（以上為該使用者先前在網頁版 AI 助理的對話紀錄，供理解背景與偏好；以下為目前 LINE 上的對話。）' });
            }
        }
    } catch (e) {
        console.warn('[LINE Webhook] Failed to load bound web history:', e.message);
    }

    const history = [...webHistory, ...lineHistory];

    // 綁定者的 AI 背景資料（個資管理自填）一併帶入
    let userContext = '';
    if (boundUserId) {
        try {
            const { data: prof } = await supabaseServer
                .from('profiles').select('ai_background').eq('id', boundUserId).maybeSingle();
            userContext = prof?.ai_background
                ? `## 使用者背景資料（本人自填，僅供推薦合適獎學金參考，不得複誦全文）\n${prof.ai_background}`
                : '';
        } catch { /* 欄位未建立時靜默略過 */ }
    }

    const answer = await runScholarshipAgentText({ messages: history, channel: 'line', userId: boundUserId, userContext });
    if (!answer) return;

    // 每則 AI 自動回覆結尾附上免責聲明（提醒查證）
    const finalAnswer = answer + LINE_AI_DISCLAIMER;

    try {
        await replyMessage(replyToken, finalAnswer);
    } catch (e) {
        // reply token 過期或已使用 → 改用 push
        console.warn('[LINE Webhook] Reply failed, falling back to push:', e.message);
        await pushMessage(lineUserId, finalAnswer);
    }
    await saveLineMessage(lineUserId, 'ai', finalAnswer);
}

async function processEvent(event) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;

    switch (event.type) {
        case 'follow': {
            await upsertLineUser(lineUserId, { refreshProfile: true, isFollowed: true });
            if (event.replyToken) {
                try { await replyMessage(event.replyToken, WELCOME_MESSAGE); } catch (e) { console.warn('[LINE Webhook] Welcome failed:', e.message); }
                await saveLineMessage(lineUserId, 'ai', WELCOME_MESSAGE);
            }
            break;
        }
        case 'unfollow': {
            await supabaseServer
                .from('line_users')
                .update({ is_followed: false, updated_at: new Date().toISOString() })
                .eq('line_user_id', lineUserId);
            break;
        }
        case 'message': {
            await upsertLineUser(lineUserId);
            const message = event.message || {};

            if (message.type === 'text') {
                await saveLineMessage(lineUserId, 'user', message.text, 'text');

                // 「綁定」關鍵字（含 Rich Menu「帳號綁定」）：發放 6 位數驗證碼，供網頁端手動綁定平台帳號
                if (/^(帳號綁定|綁定帳號|綁定)$/.test(message.text.trim())) {
                    try {
                        // 已綁定 → 直接告知綁定帳號，不再發碼
                        const { data: bindUser } = await supabaseServer
                            .from('line_users')
                            .select('bound_user_id')
                            .eq('line_user_id', lineUserId)
                            .maybeSingle();
                        if (bindUser?.bound_user_id) {
                            const { data: prof } = await supabaseServer
                                .from('profiles')
                                .select('email')
                                .eq('id', bindUser.bound_user_id)
                                .maybeSingle();
                            const alreadyBound = `您已完成帳號綁定${prof?.email ? `（帳號：${prof.email}）` : ''}，可直接在此詢問獎學金問題！\n\n若要改綁其他帳號，請先至平台「個資管理」頁面解除綁定：\n${siteConfig.url}/profile`;
                            await replyMessage(event.replyToken, alreadyBound);
                            await saveLineMessage(lineUserId, 'ai', alreadyBound);
                            break;
                        }

                        const code = String(Math.floor(100000 + Math.random() * 900000));
                        await supabaseServer.from('line_bind_codes').delete().eq('line_user_id', lineUserId);
                        await supabaseServer.from('line_bind_codes').insert({
                            code,
                            line_user_id: lineUserId,
                            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                        });
                        const bindReply = `您的綁定驗證碼:${code}\n\n請於 10 分鐘內至平台「個資管理」頁面的「LINE 帳號綁定」輸入此驗證碼，完成綁定後，AI 獎學金助理將同步您在 LINE 與網頁的對話紀錄。\n${siteConfig.url}/profile`;
                        await replyMessage(event.replyToken, bindReply);
                        await saveLineMessage(lineUserId, 'ai', bindReply);
                    } catch (e) {
                        console.error('[LINE Webhook] Bind code failed:', e);
                    }
                    break;
                }

                // 未綁定平台帳號 → 不觸發 AI，回覆綁定引導
                const { data: boundCheck } = await supabaseServer
                    .from('line_users')
                    .select('bound_user_id')
                    .eq('line_user_id', lineUserId)
                    .maybeSingle();

                if (!boundCheck?.bound_user_id) {
                    try {
                        await replyMessage(event.replyToken, BIND_GUIDE_MESSAGE);
                        await saveLineMessage(lineUserId, 'ai', BIND_GUIDE_MESSAGE);
                    } catch (e) {
                        console.warn('[LINE Webhook] Bind guide reply failed:', e.message);
                    }
                    break;
                }

                // RPM 防護：單一好友每分鐘最多觸發 5 次 AI 回覆
                if (!checkLineAiRpm(lineUserId)) {
                    try {
                        await replyMessage(event.replyToken, '訊息有點太頻繁了，請稍候一分鐘再試 🙏');
                    } catch (e) { /* reply token 可能已失效，靜默略過 */ }
                    break;
                }

                const aiEnabled = await getSystemConfig('LINE_AI_AUTO_REPLY_ENABLED');
                if (aiEnabled !== 'false') {
                    // 回應時間排程：非回應時間內不觸發 AI（訊息仍存入聊天紀錄供管理員回覆）
                    const withinSchedule = await checkReplySchedule();
                    if (!withinSchedule.inHours) {
                        if (withinSchedule.offHoursMessage) {
                            try {
                                await replyMessage(event.replyToken, withinSchedule.offHoursMessage);
                                await saveLineMessage(lineUserId, 'ai', withinSchedule.offHoursMessage);
                            } catch (e) { console.warn('[LINE Webhook] Off-hours reply failed:', e.message); }
                        }
                        break;
                    }
                    try {
                        await handleAiReply(lineUserId, event.replyToken, boundCheck.bound_user_id);
                    } catch (e) {
                        console.error('[LINE Webhook] AI reply failed:', e);
                    }
                }
            } else if (message.type === 'image') {
                // 圖片先暫存到本地，聊天紀錄即可直接檢視；刪除對話時一併清除
                const storedPath = await storeLineImage(lineUserId, message.id);
                await saveLineMessage(lineUserId, 'user', storedPath || NON_TEXT_LABEL.image, 'image');
            } else {
                await saveLineMessage(lineUserId, 'user', NON_TEXT_LABEL[message.type] || `[${message.type}]`, message.type);
            }
            break;
        }
        default:
            break;
    }
}

export async function POST(request) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-line-signature');

        const { channelSecret } = await getLineConfig();
        if (!channelSecret) {
            console.error('[LINE Webhook] Channel secret not configured');
            return NextResponse.json({ error: 'LINE channel not configured' }, { status: 503 });
        }

        if (!verifyLineSignature(rawBody, signature, channelSecret)) {
            console.warn('[LINE Webhook] Invalid signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        const body = JSON.parse(rawBody || '{}');
        const events = body.events || [];

        // 先回 200 給 LINE 平台，事件於背景處理（reply token 有效期 1 分鐘）
        after(async () => {
            for (const event of events) {
                try {
                    await processEvent(event);
                } catch (e) {
                    console.error('[LINE Webhook] Event processing failed:', e);
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[LINE Webhook] Fatal:', error);
        // 對 LINE 平台仍回 200，避免重送風暴
        return NextResponse.json({ success: false });
    }
}
