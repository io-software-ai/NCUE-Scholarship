export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { verifyUserAuth, checkRateLimit, handleApiError } from '@/lib/apiMiddleware'
import { supabaseServer as supabase } from '@/lib/supabase/server'
import { getSystemConfig } from '@/lib/config'
import { runScholarshipAgent } from '@/lib/ai/agent'
import { resolveGeminiKeyForUser } from '@/lib/ai/userKey'
import { buildReviewContext } from '@/lib/ai/reviewGuide'

/** 提問帶有「填寫／送件／檢核文件」意圖時，自動帶入承辦端的查核重點 */
const REVIEW_INTENT = /檢核|檢查|審核|複審|退件|補件|申請書|申請表|報名表|自傳|讀書計畫|計畫書|推薦函|家庭狀況|經濟狀況|班排|排名|百分比|怎麼填|如何填|填寫|填錯|要附|應附|應備|附上什麼|需要準備|文件齊全|修改建議|潤稿|優化|幫我看|幫我改/;

async function saveHistory(userId, sessionId, userMessage, aiResponse) {
    try {
        // 記憶庫提議是「當下這回合」的一次性動作，不留在歷史裡，
        // 否則重新整理後同一張同意卡會再出現一次（可能重複寫入）。
        aiResponse = aiResponse.replace(/\[MEMORY_CONFIRM:[^\]]*\]/g, '').trimEnd();
        await supabase.from('chat_history').insert([
            { user_id: userId, session_id: sessionId, role: 'user', message_content: userMessage, timestamp: new Date().toISOString() },
            { user_id: userId, session_id: sessionId, role: 'model', message_content: aiResponse, timestamp: new Date().toISOString() }
        ]);
    } catch (e) {
        console.error('[History] Failed to save:', e);
    }
}

export async function POST(request) {
    try {
        // Check if AI Assistant is disabled by admin
        const aiEnabled = await getSystemConfig('AI_ASSISTANT_ENABLED');
        if (aiEnabled === 'false') {
            return NextResponse.json({ error: 'AI Assistant is currently disabled by administrator.' }, { status: 403 });
        }

        // RPM 防護：每分鐘最多 10 次 AI 請求（Gemini 呼叫成本高，防惡意刷量）
        const rateLimitCheck = checkRateLimit(request, 'chat', 10, 60000);
        if (!rateLimitCheck.success) return rateLimitCheck.error;

        const authCheck = await verifyUserAuth(request, { requireAuth: true });
        if (!authCheck.success) return authCheck.error;

        const body = await request.json();
        const { messages, sessionId: providedSessionId } = body;

        // 強化相容性：擷取 user 最新文字，通吃各種 SDK 結構
        const lastMessage = messages?.[messages.length - 1];
        let userMessage = '';
        if (typeof lastMessage?.content === 'string') userMessage = lastMessage.content;
        else if (Array.isArray(lastMessage?.content)) userMessage = lastMessage.content.find(p => p.type === 'text')?.text || '';
        else if (Array.isArray(lastMessage?.parts)) userMessage = lastMessage.parts.find(p => p.type === 'text')?.text || '';
        else userMessage = body.text || '';

        if (!userMessage) return NextResponse.json({ error: 'No user message provided' }, { status: 400 });

        const sessionId = providedSessionId || crypto.randomUUID();
        const userId = authCheck.user.id;

        // 本次對話要用哪把金鑰：彰師大學生 → 平台金鑰；校外使用者 → 其自備金鑰
        // （雲端儲存者由資料庫解密，本機儲存者由前端標頭 x-gemini-api-key 附帶）
        const keyResult = await resolveGeminiKeyForUser({ userId, request });
        if (!keyResult.ok) {
            return NextResponse.json({ error: keyResult.error, code: keyResult.code }, { status: 403 });
        }
        const geminiApiKey = keyResult.apiKey;

        // 附件抽取前的原始輸入（存入歷史用）；前端顯示用的（附件：…）標記先去掉避免重複
        const originalUserText = userMessage.replace(/\n*（附件：[^）]*）\s*$/, '').trim();
        let attachmentLabel = '';

        // 組合對話歷史（若前端只送單句，補上最新提問）
        let history = Array.isArray(messages) && messages.length > 0
            ? messages
            : [{ role: 'user', content: userMessage }];

        // ── 對話附件（自傳/計畫書/公文）：先抽取為純文字，附掛於本輪提問 ──
        // 原始檔案不落地保存，僅當次對話使用（條款第九條已載明）
        const { attachment, reviewAnnouncementId } = body;
        if (attachment?.data && attachment?.mimeType) {
            const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
            if (!ALLOWED_MIME.includes(attachment.mimeType)) {
                return NextResponse.json({ error: '不支援的檔案類型（僅限 PDF / 圖片 / 純文字）' }, { status: 400 });
            }
            if (attachment.data.length * 0.75 > 11 * 1024 * 1024) {
                return NextResponse.json({ error: '檔案需小於 10MB' }, { status: 400 });
            }
            let extracted = '';
            let extractError = '';
            try {
                if (attachment.mimeType === 'text/plain') {
                    extracted = Buffer.from(attachment.data, 'base64').toString('utf8');
                } else {
                    const { GoogleGenAI } = await import('@google/genai');
                    const extractorAi = new GoogleGenAI({ apiKey: geminiApiKey });
                    const extract = () => extractorAi.models.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: [{ parts: [
                            { inlineData: { mimeType: attachment.mimeType, data: attachment.data } },
                            { text: '請將此文件內容完整轉為純文字，保留段落與條列結構；不要加入任何評論或摘要。' },
                        ] }],
                    });
                    let r;
                    try {
                        r = await extract();
                    } catch (first) {
                        // 大檔抽取偶發 503/逾時，重試一次再放棄
                        console.warn('[Chat] Attachment extract retry after:', first?.message);
                        await new Promise(res => setTimeout(res, 1200));
                        r = await extract();
                    }
                    extracted = (r.text || '').trim();
                }
            } catch (e) {
                extractError = e?.message || String(e);
                console.error('[Chat] Attachment extract failed:', attachment.name, extractError);
            }
            extracted = extracted.slice(0, 8000);
            if (!extracted) {
                return NextResponse.json({
                    error: extractError
                        ? `無法讀取此文件內容（${extractError.slice(0, 120)}），請改用文字貼上或縮小檔案後重試`
                        : '無法讀取此文件內容（可能是掃描件或空白檔），請改用文字貼上',
                }, { status: 422 });
            }
            attachmentLabel = String(attachment.name || '文件').slice(0, 80);
            userMessage = `${userMessage}\n\n【使用者上傳文件「${attachmentLabel}」內容】\n${extracted}`;
            history = [...history.slice(0, -1), { role: 'user', content: userMessage }];
        }

        // ── 文件檢核模式 ──
        // 網頁端不再有模式切換鈕：由提問內容自動判斷；App 仍可用 body.mode 明示。
        // 上傳附件或以「@」指定公告一律視為檢核（這兩種操作本身就是要檢核文件）。
        const isReviewMode =
            body.mode === 'review' ||
            !!reviewAnnouncementId ||
            !!attachment?.data ||
            (body.mode !== 'general' && REVIEW_INTENT.test(userMessage));
        let reviewContext = '';
        if (isReviewMode) {
            let kb = null;
            if (reviewAnnouncementId) {
                const { data } = await supabase
                    .from('ai_knowledge').select('title, content')
                    .eq('announcement_id', reviewAnnouncementId).maybeSingle();
                kb = data;
            }
            reviewContext = buildReviewContext({
                announcementTitle: kb?.title || '',
                announcementContent: kb?.content || '',
                userText: userMessage,
            });
        }

        // 使用者自填的 AI 背景資料（個資管理），隨每次對話帶入避免重複自我介紹
        let userBackground = '';
        try {
            const { data: prof } = await supabase
                .from('profiles').select('ai_background').eq('id', userId).maybeSingle();
            userBackground = prof?.ai_background || '';
        } catch { /* 欄位未建立時靜默略過 */ }

        // 已綁定 LINE 的使用者：帶入其 LINE 近期對話作為前情上下文（跨渠道連續理解）
        try {
            const { data: lineUser } = await supabase
                .from('line_users')
                .select('line_user_id')
                .eq('bound_user_id', userId)
                .maybeSingle();

            if (lineUser?.line_user_id) {
                // 使用者按過「清除紀錄」→ 只帶入標記時間之後的 LINE 對話
                const { data: marker } = await supabase
                    .from('chat_history')
                    .select('timestamp')
                    .eq('user_id', userId)
                    .eq('role', 'system')
                    .eq('message_content', '__HISTORY_CLEARED__')
                    .order('timestamp', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                let lineRecentQuery = supabase
                    .from('line_messages')
                    .select('role, content, message_type')
                    .eq('line_user_id', lineUser.line_user_id)
                    .eq('message_type', 'text')
                    .order('created_at', { ascending: false })
                    .limit(10);
                if (marker?.timestamp) lineRecentQuery = lineRecentQuery.gt('created_at', marker.timestamp);

                const { data: lineRecent } = await lineRecentQuery;

                const lineHistory = (lineRecent || [])
                    .reverse()
                    .filter(msg => msg.content)
                    .map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }));

                if (lineHistory.length > 0) {
                    history = [
                        ...lineHistory,
                        { role: 'assistant', content: '（以上為該使用者先前在 LINE 官方帳號的對話紀錄，供理解背景與偏好；以下為目前網頁版的對話。）' },
                        ...history,
                    ];
                }
            }
        } catch (e) {
            console.warn('[Chat] Failed to load bound LINE history:', e.message);
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const fullText = await runScholarshipAgent({
                        messages: history,
                        channel: 'web',
                        userId,
                        apiKey: geminiApiKey,
                        userContext: [
                            userBackground ? `## 使用者背景資料（本人自填，僅供推薦合適獎學金參考，不得複誦全文）\n${userBackground}` : '',
                            reviewContext,
                        ].filter(Boolean).join('\n\n'),
                        onText: (delta) => {
                            controller.enqueue(encoder.encode(`0:${JSON.stringify(delta)}\n`));
                        },
                        onThought: (delta) => {
                            controller.enqueue(encoder.encode(`8:${JSON.stringify(delta)}\n`));
                        },
                        onToolEvent: (event) => {
                            controller.enqueue(encoder.encode(`9:${JSON.stringify(event)}\n`));
                        },
                    });

                    // 只有當真的有收到 AI 回覆時，才附加免責聲明
                    const disclaimer = fullText ? "\n\n(此內容由 AI 獎學金助理生成，請以平台公告原文為準，並自負查證責任。)" : "";
                    if (disclaimer) {
                        controller.enqueue(encoder.encode(`0:${JSON.stringify(disclaimer)}\n`));
                    }

                    if (fullText) {
                        // 對話紀錄存原始提問 + 附件檔名（抽取出的文件全文不落庫，見條款第九條）
                        const historyUserMessage = attachmentLabel
                            ? `${originalUserText}\n\n（附件：${attachmentLabel}）`.trim()
                            : userMessage;
                        saveHistory(userId, sessionId, historyUserMessage, fullText + disclaimer);
                    }
                } catch (err) {
                    console.error('[Chat] Agent error:', err);
                    // 校外使用者以自備金鑰呼叫：金鑰失效／額度用盡時要說清楚，否則使用者無從排除
                    const isUserKey = keyResult.source !== 'platform';
                    const message = String(err?.message || '');
                    let notice = '抱歉，AI 助理暫時無法回應，請稍後再試。';
                    if (isUserKey && /API[_ ]?key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) {
                        notice = '您的 Gemini 金鑰已失效或無權限，請到「個資管理 → 帳號安全」重新設定金鑰。';
                    } else if (isUserKey && /RESOURCE_EXHAUSTED|quota|429/i.test(message)) {
                        notice = '您的 Gemini 金鑰用量已達上限，請稍後再試，或到 Google AI Studio 確認額度。';
                    }
                    try {
                        controller.enqueue(encoder.encode(`0:${JSON.stringify(notice)}\n`));
                    } catch (e) { /* stream already closed */ }
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-vercel-ai-data-stream': 'v1',
                // nginx 預設會緩衝整個 proxied 回應，導致文字/思考/工具事件「結束後一次出現」；
                // 此標頭指示 nginx 對本回應停用緩衝，串流才能逐字逐事件即時顯示。
                'X-Accel-Buffering': 'no',
                'Cache-Control': 'no-cache, no-transform',
            }
        });

    } catch (error) {
        return handleApiError(error, '/api/chat');
    }
}
