export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { verifyUserAuth, checkRateLimit, handleApiError } from '@/lib/apiMiddleware'
import { supabaseServer as supabase } from '@/lib/supabase/server'
import { getSystemConfig } from '@/lib/config'
import { runScholarshipAgent } from '@/lib/ai/agent'
import { buildReviewContext } from '@/lib/ai/reviewGuide'

async function saveHistory(userId, sessionId, userMessage, aiResponse) {
    try {
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
            if (attachment.data.length * 0.75 > 6 * 1024 * 1024) {
                return NextResponse.json({ error: '檔案需小於 5MB' }, { status: 400 });
            }
            let extracted = '';
            try {
                if (attachment.mimeType === 'text/plain') {
                    extracted = Buffer.from(attachment.data, 'base64').toString('utf8');
                } else {
                    const geminiKey = await getSystemConfig('GEMINI_API_KEY');
                    const { GoogleGenAI } = await import('@google/genai');
                    const extractorAi = new GoogleGenAI({ apiKey: geminiKey });
                    const r = await extractorAi.models.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: [{ parts: [
                            { inlineData: { mimeType: attachment.mimeType, data: attachment.data } },
                            { text: '請將此文件內容完整轉為純文字，保留段落與條列結構；不要加入任何評論或摘要。' },
                        ] }],
                    });
                    extracted = (r.text || '').trim();
                }
            } catch (e) {
                console.warn('[Chat] Attachment extract failed:', e.message);
            }
            extracted = extracted.slice(0, 8000);
            if (!extracted) {
                return NextResponse.json({ error: '無法讀取此文件內容，請改用文字貼上' }, { status: 422 });
            }
            userMessage = `${userMessage}\n\n【使用者上傳文件「${String(attachment.name || '文件').slice(0, 80)}」內容】\n${extracted}`;
            history = [...history.slice(0, -1), { role: 'user', content: userMessage }];
        }

        // ── 文件檢核模式：使用者選擇「文件檢核」或以「@」指定公告 ──
        // 檢核基準 = 承辦人員實務查核點（reviewGuide）+ 該獎學金專屬重點 + 指定公告內容
        const isReviewMode = body.mode === 'review' || !!reviewAnnouncementId;
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
                        saveHistory(userId, sessionId, userMessage, fullText + disclaimer);
                    }
                } catch (err) {
                    console.error('[Chat] Agent error:', err);
                    try {
                        controller.enqueue(encoder.encode(`0:${JSON.stringify('抱歉，AI 助理暫時無法回應，請稍後再試。')}\n`));
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
