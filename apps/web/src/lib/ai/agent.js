/**
 * AI 獎學金助理核心 (自建 Gemini Agent，取代 Dify / digiRunner)
 *
 * - 模型：gemini-3.6-flash（@google/genai）
 * - 具備多工具 Function Calling 迴圈（搜尋 / 列表 / 詳情 / 日期）
 * - 供兩個入口共用：
 *   1. /api/chat        → 網頁 AI 助理（串流，HTML 輸出 + 公告卡片）
 *   2. /api/line/webhook → LINE 官方帳號 AI 自動回覆（純文字輸出）
 */

import { GoogleGenAI } from '@google/genai';
import { getSystemConfig } from '../config';
import { siteConfig } from '../siteConfig';
import { toolDeclarations, executeTool, describeToolCall } from './tools';

export const GEMINI_MODEL = 'gemini-3.6-flash';

const MAX_TOOL_ROUNDS = 6;

function buildSystemPrompt(channel) {
    const appUrl = siteConfig.url;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

    const base = `你是「${siteConfig.name}」的 AI 獎學金助理，親切、專業、值得信賴。
今天日期：${today}（台北時區）。

## 核心規則
1. 回答任何具體獎學金問題前，必須先使用工具查詢知識庫，嚴禁憑空編造獎學金資訊。
2. 制度、資格、流程類問題（揚鷹生、弱勢助學金、兼領規定、清寒/戶籍/財產證明、成績計算）先用 search_faq 查平台 FAQ。
3. 搜尋時善用同義詞與多關鍵字（例如「清寒」也搜「低收入戶」、「中低收入戶」）；一次查不到就換詞再查，最多嘗試兩輪。
4. 若知識庫查無資料，誠實告知並建議學生聯繫承辦單位（${siteConfig.supportEmail}）。
5. 引用公告時務必附上正確的申請截止日期與送件方式，並注意公告是否已截止；日期相關計算先呼叫 get_current_date。
6. 只回答獎助學金與平台相關問題；無關問題請禮貌婉拒並引導回獎學金主題。
7. 學生的個人狀況（家境、成績、身分別）僅用於推薦合適獎學金，不做其他評論。
8. 適時提醒平台功能：公告詳情可「訂閱截止提醒」（Email 通知）與「加入 Google 日曆」；綁定 LINE 後也能在 LINE 詢問。
9. 外部搜尋（web_search / read_webpage）：只有在知識庫與 FAQ 都查無相關資料時才可使用；引用外部資訊時必須附上來源連結，並註明「此為外部網路資訊，請以原始網站公告為準」。
10. 訂閱截止提醒（subscribe_announcement）：必須先向使用者確認「哪一則公告」與「截止前幾天提醒」（1-14 天，預設 3 天），並取得使用者明確同意（如「好」「確認訂閱」）後才可呼叫；未經同意嚴禁自行訂閱。
11. 申請文件問題（get_application_checklist）：使用者問「申請書怎麼填」「要附哪些文件」「為什麼被退件」「自傳／家庭狀況怎麼寫」時，先呼叫此工具取得生輔組承辦端的實際查核重點，再具體回答；能問出是哪一個獎學金就一併傳入名稱。若系統提示中已附「文件檢核模式」區塊，代表檢核重點已在手上，不必重複呼叫。
12. 記憶庫（save_to_memory）：當使用者在對話中透露可長期沿用的背景（系級年級、身分別、家庭經濟狀況、成績表現、特殊需求、獲獎紀錄等），可主動建議把它加入記憶庫，往後對話與推薦就不必重複自我介紹。規則：
   - 必須取得使用者明確同意才可寫入；使用者婉拒就不再追問，同一段對話最多提議一次。
   - 只建議記錄使用者本人主動提供、且對獎學金推薦有幫助的資訊；記憶庫僅整理增補，既有內容不會被覆蓋（可如此向使用者說明）。
   - 提議時要具體列出「打算記住哪幾項」，每項為精簡的一句陳述，不要夾帶推測或評論。
   - 使用者若表示要修改或刪除記憶庫內容，請引導至「個人資料」頁的 AI 背景資料自行編輯。`;

    if (channel === 'line') {
        return `${base}

## 輸出格式（LINE 訊息）
- 只能輸出純文字。嚴禁任何 Markdown 語法：不可出現 **粗體**、*斜體*、# 標題、\`程式碼\`、[文字](連結) 等標記，也不可輸出 HTML 標籤。
- 需要強調時使用「」引號或【】括號；條列使用「•」開頭加換行；連結直接貼完整網址。
- 精簡扼要，盡量控制在 500 字內。
- 推薦公告時附上完整連結：${appUrl}/?announcement_id=<公告ID>
- 提議訂閱時，請引導使用者直接回覆「確認訂閱」（或告知想要的提醒天數）表示同意，收到同意後再呼叫 subscribe_announcement。
- 提議加入記憶庫時，逐項列出要記住的內容並引導使用者回覆「同意」；收到明確同意後才呼叫 save_to_memory（confirmed=true）。
- 結尾可提醒：詳細資訊與更多公告請至獎助學金資訊平台 ${appUrl}`;
    }

    return `${base}

## 輸出格式（網頁聊天）
- 使用簡潔的 HTML 片段輸出（<p>、<ul>、<li>、<strong>、<a>、<table>），不要輸出 <html>/<body> 標籤，也不要使用 Markdown。
- 嚴禁把 HTML 包在 \`\`\` 程式碼圍欄裡（會被當成程式碼區塊顯示），直接輸出標籤本身。
- 重要日期、金額以 <strong> 強調。
- 當回答中推薦了特定公告，請在回答的「最後一行」加上卡片標記，格式：[ANNOUNCEMENT_CARD:公告ID1,公告ID2]（最多 3 筆，ID 必須是工具回傳的 announcement_id UUID）。
- 當你提議為使用者訂閱某公告的截止提醒時，在回答最後一行加上標記：[SUBSCRIBE_CONFIRM:公告ID:天數]（天數 1-14，預設 3；一次只能一筆）。介面會顯示「確認訂閱」按鈕，由使用者點擊確認——加上標記後就不要再呼叫 subscribe_announcement，除非使用者以文字明確同意。
- 當你建議把使用者的背景資料加入記憶庫時，在回答最後一行加上標記：[MEMORY_CONFIRM:項目1|項目2]（最多 6 項，以 | 分隔；項目內不可出現 |、[、]）。介面會顯示「加入記憶庫」按鈕，由使用者點擊同意——加上標記後就不要再呼叫 save_to_memory，除非使用者以文字明確同意。
- 連結一律使用 target="_blank"。`;
}

/**
 * 將前端/資料庫的訊息歷史轉為 Gemini contents。
 * 支援 {role:'user'|'model'|'ai'|'admin'|'assistant', content|message_content}。
 */
export function toGeminiContents(messages = []) {
    return (messages || [])
        .map(msg => {
            let text = '';
            if (typeof msg.content === 'string') text = msg.content;
            else if (Array.isArray(msg.content)) text = msg.content.find(p => p.type === 'text')?.text || '';
            else if (Array.isArray(msg.parts)) text = msg.parts.find(p => p.type === 'text')?.text || '';
            else if (typeof msg.message_content === 'string') text = msg.message_content;
            if (!text.trim()) return null;
            const role = msg.role === 'user' ? 'user' : 'model';
            return { role, parts: [{ text: text.slice(0, 8000) }] };
        })
        .filter(Boolean)
        .slice(-20); // 只保留近 20 則，控制 context 大小
}

let thinkingSupported = true; // 模型若不支援 thinkingConfig，退回一般模式（僅記憶於本程序）

async function streamGenerate(ai, { contents, systemInstruction }) {
    const baseConfig = {
        systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
        temperature: 0.3,
    };

    if (thinkingSupported) {
        try {
            return await ai.models.generateContentStream({
                model: GEMINI_MODEL,
                contents,
                config: { ...baseConfig, thinkingConfig: { includeThoughts: true } },
            });
        } catch (error) {
            // 僅在確定是 thinkingConfig 不支援時降級；其他錯誤（如 thought_signature 缺失）原樣拋出
            if (/thinking_?config|includeThoughts/i.test(error?.message || '')) {
                console.warn('[AIAgent] thinkingConfig not supported, falling back:', error.message);
                thinkingSupported = false;
            } else {
                throw error;
            }
        }
    }
    return ai.models.generateContentStream({ model: GEMINI_MODEL, contents, config: baseConfig });
}

/**
 * 執行 Agent 迴圈（串流）。
 *
 * @param {Object}   options
 * @param {Array}    options.messages  訊息歷史（最後一則為使用者的最新提問）
 * @param {string}   options.channel   'web' | 'line'
 * @param {Function} options.onText    (delta) => void  正式回覆增量
 * @param {Function} options.onThought (delta) => void  思考過程增量
 * @param {Function} options.onToolEvent ({name,label,status,summary}) => void  工具調用事件
 * @returns {Promise<string>} 完整回覆文字
 */
// 工具每輪呼叫上限（外部請求成本控制 + 防濫用）
const TOOL_CALL_LIMITS = { web_search: 2, read_webpage: 3, subscribe_announcement: 2 };

export async function runScholarshipAgent({ messages, channel = 'web', userId = null, userContext = '', onText = () => {}, onThought = () => {}, onToolEvent = () => {} }) {
    const apiKey = await getSystemConfig('GEMINI_API_KEY');
    if (!apiKey) throw new Error('缺少 GEMINI_API_KEY 設定');

    const ai = new GoogleGenAI({ apiKey });
    let systemInstruction = buildSystemPrompt(channel);
    if (userContext) {
        // 呼叫端自行標註區塊標題（背景資料 / 檢核模式等）
        // 上限放寬至 16000：檢核模式會帶入承辦查核通則 + 該獎學金專屬重點 + 公告內容
        systemInstruction += `\n\n${String(userContext).slice(0, 16000)}`;
    }
    const contents = toGeminiContents(messages);
    if (contents.length === 0) throw new Error('沒有可處理的訊息');

    let fullText = '';
    const toolCallCounts = {};

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const stream = await streamGenerate(ai, { contents, systemInstruction });

        const functionCalls = [];
        const modelParts = [];

        for await (const chunk of stream) {
            const parts = chunk?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                    // Gemini 3.x 要求 functionCall 連同 thoughtSignature 原樣回填歷史，缺失會 400
                    const preserved = { functionCall: part.functionCall };
                    if (part.thoughtSignature) preserved.thoughtSignature = part.thoughtSignature;
                    modelParts.push(preserved);
                } else if (part.text) {
                    if (part.thought) {
                        onThought(part.text);
                    } else {
                        fullText += part.text;
                        onText(part.text);
                        const preserved = { text: part.text };
                        if (part.thoughtSignature) preserved.thoughtSignature = part.thoughtSignature;
                        modelParts.push(preserved);
                    }
                }
            }
        }

        if (functionCalls.length === 0) break; // 模型已產生最終回覆

        // 將模型回合 + 工具結果回填，進入下一輪
        contents.push({ role: 'model', parts: modelParts.length > 0 ? modelParts : functionCalls.map(fc => ({ functionCall: fc })) });

        const responseParts = [];
        for (const call of functionCalls) {
            const label = describeToolCall(call.name, call.args);
            onToolEvent({ name: call.name, label, status: 'running' });

            // 每輪工具次數上限（防止外部請求被濫用）
            toolCallCounts[call.name] = (toolCallCounts[call.name] || 0) + 1;
            const cap = TOOL_CALL_LIMITS[call.name];
            const result = (cap && toolCallCounts[call.name] > cap)
                ? { error: `已達本輪「${call.name}」使用上限（${cap} 次），請以目前掌握的資訊回答。` }
                : await executeTool(call.name, call.args || {}, { userId, channel });
            const summary = Array.isArray(result) ? `${result.length} 筆結果`
                : (typeof result === 'string' && result.startsWith('找不到')) ? '無結果' : '完成';
            onToolEvent({ name: call.name, label, status: 'done', summary });
            responseParts.push({ functionResponse: { name: call.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
    }

    return fullText;
}

/**
 * 非串流版本：回傳完整文字（供 LINE 自動回覆使用）。
 */
export async function runScholarshipAgentText({ messages, channel = 'line', userId = null, userContext = '' }) {
    let text = '';
    await runScholarshipAgent({
        messages,
        channel,
        userId,
        userContext,
        onText: delta => { text += delta; },
        onThought: () => {},
    });
    // 保險：移除卡片標記、殘留 HTML 與 Markdown（LINE 僅支援純文字，模型偶爾違規）
    if (channel === 'line') {
        text = text
            .replace(/\[ANNOUNCEMENT_CARD:[^\]]*\]/g, '')
            .replace(/\[SUBSCRIBE_CONFIRM:[^\]]*\]/g, '')
            .replace(/\[MEMORY_CONFIRM:[^\]]*\]/g, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 $2')
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            .replace(/__([^_\n]+)__/g, '$1')
            .replace(/`([^`\n]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .trim();
    }
    return text;
}
