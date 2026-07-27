/**
 * 記憶庫（profiles.ai_background）寫入邏輯
 *
 * AI 助理在對話中發現可長期沿用的背景資料（系級、身分別、家境、成績…）時，
 * 會「建議」加入記憶庫；使用者同意後才由此處寫入。
 *
 * 核心原則：整理增補，不覆蓋。既有內容一律保留，新資訊與其合併去重後重寫，
 * 兩端（網頁確認按鈕 / LINE 文字同意）共用同一條寫入路徑。
 */

import { GoogleGenAI } from '@google/genai';
import { supabaseServer } from '../supabase/server';
import { getSystemConfig } from '../config';

// 與 /api/users/background（個資頁手動編輯）相同的長度上限
export const BACKGROUND_MAX = 1000;
const MEMORY_MODEL = 'gemini-3.6-flash';

const MAX_ITEMS = 6;
const MAX_ITEM_LEN = 200;

/** 正規化模型或前端送來的項目：去空白、限長、去重 */
export function normalizeMemoryItems(items) {
    const list = Array.isArray(items) ? items : [items];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const text = String(raw ?? '')
            .replace(/^[\s•\-*·]+/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_ITEM_LEN);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= MAX_ITEMS) break;
    }
    return out;
}

const toBullets = (items) => items.map(item => `• ${item}`).join('\n');

/** 現有內容是否已描述過這件事（粗略判斷，避免無謂地呼叫模型／重複條目） */
const alreadyCovered = (existing, item) => existing.replace(/\s+/g, '').includes(item.replace(/\s+/g, ''));

/**
 * 保底合併：既有內容完整保留，新項目逐條附加（塞不進上限的就略過）。
 * 模型不可用或輸出不合格時使用。
 */
function appendMerge(existing, items) {
    let merged = existing;
    const skipped = [];
    for (const item of items) {
        if (alreadyCovered(merged, item)) continue;
        const candidate = `${merged}\n• ${item}`;
        if (candidate.length > BACKGROUND_MAX) { skipped.push(item); continue; }
        merged = candidate;
    }
    return { merged, skipped };
}

/** 以模型將新資訊整理進既有背景資料（同一件事更新為一條，而非並列兩條） */
async function organizeWithModel(existing, items) {
    const apiKey = await getSystemConfig('GEMINI_API_KEY');
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `你是個人資料整理助手。請把「新增資訊」合併進「現有背景資料」，輸出整理後的完整背景資料。

規則：
1. 現有背景資料的每一項資訊都必須保留，不可刪除、不可改變原意。
2. 若新增資訊與既有某項描述同一件事，合併為一條並以新增資訊為準（例如年級更新）。
3. 以「• 」開頭的條列輸出，每項一行，用繁體中文精簡陳述。
4. 全文不得超過 ${BACKGROUND_MAX} 字。
5. 不要加入任何未出現在下方兩段內容中的資訊，也不要推測。
6. 只輸出整理後的背景資料本身，不要任何說明、標題或前後綴。

現有背景資料：
${existing}

新增資訊：
${toBullets(items)}`;

    try {
        const res = await ai.models.generateContent({
            model: MEMORY_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { temperature: 0.1 },
        });
        const text = (res.text || '').trim();
        // 明顯不合格（空白／超長／短於原文一半 = 疑似刪掉既有內容）就退回保底合併
        if (!text || text.length > BACKGROUND_MAX || text.length < existing.length * 0.5) return null;
        return text;
    } catch (error) {
        console.warn('[Memory] organize failed, falling back to append:', error.message);
        return null;
    }
}

/**
 * 將項目整理後寫入使用者的記憶庫。
 * @param {Object} options
 * @param {string} options.userId
 * @param {string[]} options.items 要加入的背景資料項目
 * @returns {Promise<{success:boolean, message:string, background?:string, added?:string[], skipped?:string[]}>}
 */
export async function mergeIntoBackground({ userId, items }) {
    if (!userId) return { success: false, message: '缺少使用者身分，無法寫入記憶庫。' };

    const cleaned = normalizeMemoryItems(items);
    if (cleaned.length === 0) return { success: false, message: '沒有可加入記憶庫的內容。' };

    const { data: profile, error: readError } = await supabaseServer
        .from('profiles').select('ai_background').eq('id', userId).maybeSingle();
    if (readError) {
        if (readError.code === '42703') return { success: false, message: '資料庫尚未套用 migration（缺少 ai_background 欄位）。' };
        return { success: false, message: `讀取現有背景資料失敗：${readError.message}` };
    }

    const existing = (profile?.ai_background || '').trim();
    let merged;
    let skipped = [];

    if (!existing) {
        merged = toBullets(cleaned).slice(0, BACKGROUND_MAX);
    } else {
        const fresh = cleaned.filter(item => !alreadyCovered(existing, item));
        if (fresh.length === 0) {
            return { success: true, background: existing, added: [], skipped: [], message: '這些資訊記憶庫中已經有了，無需重複加入。' };
        }
        merged = (await organizeWithModel(existing, fresh)) || null;
        if (!merged) {
            const fallback = appendMerge(existing, fresh);
            merged = fallback.merged;
            skipped = fallback.skipped;
        }
    }

    const { error: writeError } = await supabaseServer
        .from('profiles')
        .update({ ai_background: merged })
        .eq('id', userId);
    if (writeError) return { success: false, message: `寫入記憶庫失敗：${writeError.message}` };

    return {
        success: true,
        background: merged,
        added: cleaned.filter(item => !skipped.includes(item)),
        skipped,
        message: skipped.length > 0
            ? `已加入記憶庫，但背景資料已接近 ${BACKGROUND_MAX} 字上限，部分項目未加入：${skipped.join('、')}。可到「個人資料」頁自行整理。`
            : '已整理並加入記憶庫，之後的對話會自動帶入這些背景資料。',
    };
}
