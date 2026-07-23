/**
 * AI 品質閉環：知識缺口評估（LLM-as-judge）+ FAQ 草稿產生
 *
 * runQualityEvaluation()：
 *   讀取近期使用者提問（網頁 + LINE）與 👎 回覆，交由 LLM 歸納出「很多人在問、
 *   但現有 FAQ 未涵蓋」的主題，寫入 ai_knowledge_gaps（status=pending）。
 *   夜間 cron 或管理員「立即評估」皆呼叫此函式。
 *
 * generateFaqDraft(gap)：
 *   針對單一缺口，先以知識庫語意檢索接地，再請 LLM 產生受控區塊格式的 FAQ 草稿。
 *   AI 僅產生草稿；務必經管理員審核後才發佈為正式 FAQ。
 */

import { supabaseServer } from '../supabase/server';
import { getSystemConfig, setSystemConfig } from '../config';
import { searchKnowledge } from './knowledge';
import { validateFaqBlocks } from '../faqBlocks';

const EVAL_MODEL = 'gemini-3.6-flash';
const MAX_QUESTIONS = 400;      // 送入 LLM 的提問上限（成本控制）
const MAX_GAPS = 12;            // 單次歸納的缺口數上限
const SAMPLE_CAP = 6;           // 每個缺口保留的樣本提問數
const LAST_EVAL_KEY = 'AI_QUALITY_LAST_EVAL_AT'; // 增量評估游標（system_settings）

// LINE 官方帳號指令與純操作字，非知識型提問，排除於缺口分析之外
const COMMAND_NOISE = new Set([
    '帳號綁定', '綁定', '綁定帳號', '解除綁定', '解綁', '取消綁定', 'unbind', 'bind',
    '選單', 'menu', '開始', '開始使用', '你好', 'hi', 'hello',
]);
function isCommandNoise(q) {
    return COMMAND_NOISE.has(String(q || '').trim().toLowerCase());
}

function normalizeTopicKey(topic = '') {
    return String(topic).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 120);
}

/** 從 LLM 回覆文字中穩健擷取 JSON（容忍 ```json 包裹或前後雜訊） */
function extractJson(text = '') {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf('{');
    const startArr = raw.indexOf('[');
    const from = startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
    if (from === -1) return null;
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    try { return JSON.parse(raw.slice(from, end + 1)); } catch { return null; }
}

async function getGenAI() {
    const apiKey = await getSystemConfig('GEMINI_API_KEY');
    if (!apiKey) return null;
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey });
}

/**
 * 執行知識缺口評估。回傳 { success, discovered, upserted, skipped }。
 */
export async function runQualityEvaluation({ days = 30 } = {}) {
    const ai = await getGenAI();
    if (!ai) return { success: false, error: 'GEMINI_API_KEY 未設定' };

    // 增量評估：只分析「上次評估之後」的新提問，已評估過的不再重複評估。
    // 首次執行（尚無游標）才回溯 days 天。
    const runAt = new Date().toISOString();
    const lastEvalAt = await getSystemConfig(LAST_EVAL_KEY);
    const since = lastEvalAt || new Date(Date.now() - days * 86400000).toISOString();

    // 1. 蒐集近期使用者提問（網頁 chat_history + LINE line_messages）與 👎 回覆
    const [webQ, lineQ, downFb, faqRows, existingGaps] = await Promise.all([
        supabaseServer.from('chat_history')
            .select('message_content')
            .eq('role', 'user').gte('timestamp', since)
            .order('timestamp', { ascending: false }).limit(MAX_QUESTIONS),
        supabaseServer.from('line_messages')
            .select('content')
            .eq('role', 'user').eq('message_type', 'text').gte('created_at', since)
            .order('created_at', { ascending: false }).limit(MAX_QUESTIONS),
        supabaseServer.from('ai_message_feedback')
            .select('question').eq('rating', 'down').gte('created_at', since).limit(100),
        supabaseServer.from('faqs').select('question').eq('is_active', true),
        supabaseServer.from('ai_knowledge_gaps').select('topic_key, status, frequency, sample_questions'),
    ]);

    const questions = [
        ...(webQ.data || []).map(r => r.message_content),
        ...(lineQ.data || []).map(r => r.content),
    ].map(q => String(q || '').trim())
        .filter(q => q && q.length >= 4 && q !== '__HISTORY_CLEARED__' && !isCommandNoise(q))
        .slice(0, MAX_QUESTIONS);

    if (questions.length < 5) {
        // 新提問過少不評估，也不推進游標（讓提問持續累積到足量再一次評估）
        return {
            success: true, discovered: 0, upserted: 0, skipped: 0,
            note: lastEvalAt ? '自上次評估後的新提問過少，暫不評估' : '近期提問過少，暫不評估',
        };
    }

    const downvotedQuestions = [...new Set((downFb.data || []).map(r => String(r.question || '').trim()).filter(q => q && !isCommandNoise(q)))].slice(0, 40);
    const existingFaqQuestions = (faqRows.data || []).map(r => r.question).filter(Boolean);
    const gapMap = new Map((existingGaps.data || []).map(g => [g.topic_key, g]));

    // 2. LLM 歸納缺口
    const prompt = `你是彰師大獎學金平台的 AI 品質分析師。以下是學生近期向 AI 助理提出的問題清單。
你的任務：歸納出「多位學生重複詢問、但現有 FAQ 尚未妥善涵蓋」的主題，作為擴充 FAQ 的建議缺口。

【現有 FAQ 主題（已涵蓋，請勿重複建議）】
${existingFaqQuestions.length ? existingFaqQuestions.map(q => `- ${q}`).join('\n') : '（目前尚無 FAQ）'}

【學生近期提問（可能重複、口語、含錯字）】
${questions.map((q, i) => `${i + 1}. ${q.slice(0, 200)}`).join('\n')}

${downvotedQuestions.length ? `【AI 回覆曾被學生標記為不佳的提問（高優先）】\n${downvotedQuestions.map(q => `- ${q.slice(0, 200)}`).join('\n')}\n` : ''}
規則：
- 只挑出「重複出現且具共通性」的主題，忽略一次性或過於個人化的提問。
- 不要建議已被現有 FAQ 涵蓋的主題。
- 每個主題請估算相關提問次數（frequency），並挑 2-${SAMPLE_CAP} 則最具代表性的原始提問作為樣本。
- 最多 ${MAX_GAPS} 個主題，依熱度由高至低排序。
- 僅輸出 JSON，格式如下，不要有其他文字：
{"gaps":[{"topic":"簡短主題標籤(15字內)","representativeQuestion":"最具代表性的提問","sampleQuestions":["原始提問1","原始提問2"],"frequency":整數,"rationale":"為何這是值得新增的 FAQ 缺口(一句話)"}]}`;

    let parsed;
    try {
        const r = await ai.models.generateContent({
            model: EVAL_MODEL,
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: 'application/json', temperature: 0.2 },
        });
        parsed = extractJson(r.text || '');
    } catch (e) {
        console.error('[QualityEval] LLM failed:', e.message);
        return { success: false, error: e.message };
    }

    const gaps = Array.isArray(parsed?.gaps) ? parsed.gaps : (Array.isArray(parsed) ? parsed : []);

    // LLM 已成功分析這批提問 → 推進評估游標，下次僅分析更新的提問（不重複評估）
    await setSystemConfig(LAST_EVAL_KEY, runAt);

    if (gaps.length === 0) return { success: true, discovered: 0, upserted: 0, skipped: 0, analyzedQuestions: questions.length };

    // 3. 去重 upsert
    let upserted = 0, skipped = 0;
    for (const g of gaps.slice(0, MAX_GAPS)) {
        const topic = String(g.topic || '').trim().slice(0, 60);
        if (!topic) continue;
        const topicKey = normalizeTopicKey(topic);
        const samples = (Array.isArray(g.sampleQuestions) ? g.sampleQuestions : [])
            .map(s => String(s || '').trim()).filter(Boolean).slice(0, SAMPLE_CAP);
        const frequency = Math.max(1, parseInt(g.frequency, 10) || samples.length || 1);
        const existing = gapMap.get(topicKey);

        if (existing) {
            // 已被管理員處理（發佈/忽略）→ 不重新出現，避免打擾
            if (existing.status === 'dismissed' || existing.status === 'published') { skipped++; continue; }
            const mergedSamples = [...new Set([...(existing.sample_questions || []), ...samples])].slice(0, SAMPLE_CAP);
            const { error } = await supabaseServer.from('ai_knowledge_gaps').update({
                topic,
                representative_question: String(g.representativeQuestion || '').trim().slice(0, 300) || existing.representative_question,
                sample_questions: mergedSamples,
                frequency: Math.max(frequency, existing.frequency || 0),
                rationale: String(g.rationale || '').trim().slice(0, 500),
                last_evaluated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('topic_key', topicKey);
            if (!error) upserted++;
        } else {
            const { error } = await supabaseServer.from('ai_knowledge_gaps').insert({
                topic, topic_key: topicKey,
                representative_question: String(g.representativeQuestion || '').trim().slice(0, 300),
                sample_questions: samples,
                frequency,
                rationale: String(g.rationale || '').trim().slice(0, 500),
                status: 'pending',
            });
            if (!error) upserted++;
        }
    }

    return { success: true, discovered: gaps.length, upserted, skipped, analyzedQuestions: questions.length };
}

/**
 * 針對單一缺口產生 FAQ 草稿（受控區塊格式），以知識庫檢索結果接地。
 * 回傳 { success, question, answer } 或 { success:false, error }。
 */
export async function generateFaqDraft(gap) {
    const ai = await getGenAI();
    if (!ai) return { success: false, error: 'GEMINI_API_KEY 未設定' };

    // 以缺口主題 + 代表提問檢索知識庫，作為答案接地資料
    const queries = [gap.topic, gap.representative_question, ...(gap.sample_questions || [])].filter(Boolean);
    let grounding = '';
    try {
        const hits = await searchKnowledge(queries.slice(0, 3), { limit: 4 });
        grounding = (hits || []).map(h => `【${h.title}】\n${String(h.content || '').slice(0, 1200)}`).join('\n\n');
    } catch (e) {
        console.warn('[QualityEval] grounding search failed:', e.message);
    }

    const prompt = `你是彰師大獎學金平台的客服內容編輯，請為以下常見問題主題撰寫一則 FAQ 草稿。

【主題】${gap.topic}
【代表提問】${gap.representative_question || ''}
【學生實際提問樣本】
${(gap.sample_questions || []).map(s => `- ${s}`).join('\n') || '（無）'}

${grounding ? `【平台知識庫參考資料（請據此作答，勿捏造）】\n${grounding}\n` : '【注意】知識庫查無明確對應資料，請以通用、保守且不捏造具體數字/日期的方式作答，並提醒以公告原文為準。\n'}
撰寫規則：
- 以「平台官方、親切專業」口吻，繁體中文。
- 答案為區塊陣列，僅可用這五種區塊：
  - {"type":"paragraph","text":"段落文字"}
  - {"type":"list","items":["項目1","項目2"]}
  - {"type":"steps","items":["步驟1","步驟2"]}
  - {"type":"note","text":"提示"}
  - {"type":"warn","text":"注意事項"}
- 內容一律純文字，不要 HTML/Markdown 標記。
- 精簡但完整，區塊數 2-6 個。若涉及個別公告的具體金額/日期，請提醒以公告原文為準。
- 僅輸出 JSON，格式：{"question":"問題(精煉成一句)","answer":[區塊...]}`;

    try {
        const r = await ai.models.generateContent({
            model: EVAL_MODEL,
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: 'application/json', temperature: 0.4 },
        });
        const parsed = extractJson(r.text || '');
        const question = String(parsed?.question || gap.topic || '').trim().slice(0, 300);
        const answer = Array.isArray(parsed?.answer) ? parsed.answer : null;
        const blockError = answer ? validateFaqBlocks(answer) : '草稿格式錯誤';
        if (blockError) return { success: false, error: `AI 草稿格式不符（${blockError}），請重試或手動撰寫` };
        return { success: true, question, answer };
    } catch (e) {
        console.error('[QualityEval] draft failed:', e.message);
        return { success: false, error: e.message };
    }
}
