/**
 * AI 獎學金助理的工具 (Gemini Function Calling)
 *
 * 每個工具 = declaration (給模型的 schema) + executor (實際查詢知識庫)。
 * 知識庫來源為 ai_knowledge 資料表（公告建立當下即整理完成的 AI 易讀內容）。
 */

import { Type } from '@google/genai';
import { load as cheerioLoad } from 'cheerio';
import { supabaseServer } from '../supabase/server';
import { getSystemConfig } from '../config';
import { searchKnowledge, listKnowledge } from './knowledge';

const TAIPEI_TZ = 'Asia/Taipei';

function todayInTaipei() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TAIPEI_TZ }).format(new Date());
}

function deadlineStatus(endDate, today) {
    if (!endDate) return '未指定截止日';
    if (endDate < today) return '已截止';
    const daysLeft = Math.round((new Date(endDate) - new Date(today)) / 86400000);
    return daysLeft <= 7 ? `即將截止（剩 ${daysLeft} 天）` : `開放申請中（剩 ${daysLeft} 天）`;
}

export const toolDeclarations = [
    {
        name: 'search_scholarships',
        description: '以關鍵字搜尋獎學金公告知識庫。回答任何具體獎學金問題前必須先呼叫此工具。可一次提供多個關鍵字（同義詞、簡稱）提高命中率，例如 ["低收入戶", "清寒"]。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                keywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '搜尋關鍵字（1-5 個），例如獎學金名稱、身份別（原住民/低收入戶/僑生）、縣市、學系等',
                },
            },
            required: ['keywords'],
        },
    },
    {
        name: 'list_scholarships',
        description: '瀏覽獎學金公告列表（依截止日排序）。適合「最近有什麼獎學金？」「哪些快截止了？」這類總覽問題。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                status: {
                    type: Type.STRING,
                    description: 'open = 尚可申請（預設）、closing_soon = 7 天內截止、all = 全部（含已截止）',
                },
                limit: { type: Type.NUMBER, description: '最多回傳筆數，預設 15' },
                within_days: { type: Type.NUMBER, description: '只列出 N 天內截止的公告（例如 14 = 兩週內截止）' },
            },
        },
    },
    {
        name: 'get_scholarship_details',
        description: '取得單一獎學金公告的完整內容（申請資格、日期、送件方式、附件、連結）。傳入 search_scholarships 或 list_scholarships 回傳的公告ID。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                announcement_id: { type: Type.STRING, description: '公告 UUID' },
            },
            required: ['announcement_id'],
        },
    },
    {
        name: 'search_faq',
        description: '搜尋平台「常見問題 FAQ」知識（揚鷹生資格、弱勢助學金、兼領規定、清寒證明、戶籍謄本/財產清單申請方式、成績計算等制度性問題）。回答制度、資格、流程類問題前先呼叫此工具。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                keywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '搜尋關鍵字（1-3 個），例如 ["揚鷹生"]、["兼領"]、["戶籍謄本"]',
                },
            },
            required: ['keywords'],
        },
    },
    {
        name: 'get_current_date',
        description: '取得今天日期（台北時區），用於判斷公告是否截止、計算剩餘天數。',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'web_search',
        description: '搜尋網際網路（Google）。僅當知識庫與 FAQ 都查無資料時才使用，例如查詢校外單位的最新資訊、外部獎學金官網。引用結果時必須附上來源連結，並註明為外部資訊非平台公告。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: '搜尋字串（繁體中文），例如「花蓮縣 新住民 獎學金 114學年」' },
            },
            required: ['query'],
        },
    },
    {
        name: 'read_webpage',
        description: '讀取指定網頁的純文字內容。用於深入閱讀 web_search 的結果連結，或公告中的外部連結，取得詳細申請條件。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: '完整網址（http/https）' },
            },
            required: ['url'],
        },
    },
    {
        name: 'subscribe_announcement',
        description: '為目前使用者訂閱某公告的截止日 Email 提醒。呼叫前務必先取得使用者的明確同意（使用者說「好」「確認訂閱」等），未經同意不可呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                announcement_id: { type: Type.STRING, description: '公告 UUID（來自搜尋/列表工具的結果）' },
                days_before: { type: Type.NUMBER, description: '截止日前幾天提醒（1-14，預設 3）' },
            },
            required: ['announcement_id'],
        },
    },
];

/** SSRF 防護：僅允許公開的 http(s) 網址 */
function isSafeExternalUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { return false; }
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const executors = {
    async search_scholarships({ keywords }) {
        const rows = await searchKnowledge(keywords, { limit: 8 });
        if (rows.length === 0) {
            return { found: 0, message: '知識庫中找不到符合的公告，可換其他關鍵字重試，或告知使用者目前無相關公告。' };
        }
        const today = todayInTaipei();
        return {
            found: rows.length,
            results: rows.map(row => ({
                announcement_id: row.announcement_id,
                title: row.title,
                category: row.metadata?.category || '未分類',
                application_end_date: row.metadata?.application_end_date || null,
                status: deadlineStatus(row.metadata?.application_end_date, today),
                content: row.content,
            })),
        };
    },

    async list_scholarships({ status = 'open', limit = 15 } = {}) {
        const rows = await listKnowledge({ limit: 100 });
        const today = todayInTaipei();
        let items = rows.map(row => ({
            announcement_id: row.announcement_id,
            title: row.title,
            category: row.metadata?.category || '未分類',
            application_end_date: row.metadata?.application_end_date || null,
            status: deadlineStatus(row.metadata?.application_end_date, today),
        }));

        if (status !== 'all') {
            items = items.filter(item => !item.application_end_date || item.application_end_date >= today);
        }
        if (status === 'closing_soon') {
            items = items.filter(item => item.status.startsWith('即將截止'));
        }
        if (arguments[0]?.within_days) {
            const cutoff = new Date(new Date(today).getTime() + Number(arguments[0].within_days) * 86400000)
                .toISOString().slice(0, 10);
            items = items.filter(item => item.application_end_date && item.application_end_date <= cutoff && item.application_end_date >= today);
        }

        items.sort((a, b) => (a.application_end_date || '9999-12-31').localeCompare(b.application_end_date || '9999-12-31'));
        items = items.slice(0, Math.min(Number(limit) || 15, 30));

        return { total: items.length, today, scholarships: items };
    },

    async get_scholarship_details({ announcement_id }) {
        const { data: row, error } = await supabaseServer
            .from('ai_knowledge')
            .select('announcement_id, title, content, metadata')
            .eq('announcement_id', announcement_id)
            .maybeSingle();

        if (error || !row) {
            return { found: false, message: '查無此公告（可能已下架或 ID 錯誤）。' };
        }
        const today = todayInTaipei();
        return {
            found: true,
            announcement_id: row.announcement_id,
            title: row.title,
            status: deadlineStatus(row.metadata?.application_end_date, today),
            content: row.content,
        };
    },

    async search_faq({ keywords }) {
        const terms = (Array.isArray(keywords) ? keywords : [keywords])
            .map(k => String(k || '').trim()).filter(Boolean).slice(0, 3);
        if (terms.length === 0) return { found: 0, message: '未提供關鍵字。' };

        const { data: faqs, error } = await supabaseServer
            .from('faqs')
            .select('question, answer')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        if (error) return { error: `FAQ 查詢失敗: ${error.message}` };

        const flatten = (answer) => (Array.isArray(answer) ? answer : [])
            .map(b => b?.text || (Array.isArray(b?.items) ? b.items.join('\n') : ''))
            .join('\n')
            .replace(/\*\*|==|\[|\]\([^)]*\)/g, '');

        const matched = (faqs || [])
            .map(f => ({ question: f.question, answer: flatten(f.answer) }))
            .filter(f => terms.some(t => f.question.includes(t) || f.answer.includes(t)))
            .slice(0, 4);

        if (matched.length === 0) {
            return { found: 0, message: 'FAQ 中找不到相關內容，可改以 search_scholarships 搜尋公告，或建議學生聯繫生輔組。' };
        }
        return { found: matched.length, faqs: matched };
    },

    async get_current_date() {
        const now = new Date();
        const weekday = new Intl.DateTimeFormat('zh-TW', { timeZone: TAIPEI_TZ, weekday: 'long' }).format(now);
        return { date: todayInTaipei(), weekday, timezone: TAIPEI_TZ };
    },

    async web_search({ query }) {
        const q = String(query || '').trim().slice(0, 120);
        if (!q) return { error: '未提供搜尋字串。' };
        const apiKey = await getSystemConfig('SERP_API_KEY');
        if (!apiKey) return { error: '外部搜尋尚未設定（缺少 SerpApi 金鑰），請以知識庫資訊回答。' };

        const params = new URLSearchParams({ q, num: '6', hl: 'zh-tw', gl: 'tw', api_key: apiKey });
        const res = await fetchWithTimeout(`https://serpapi.com/search.json?${params}`, {}, 8000);
        if (!res.ok) return { error: `外部搜尋失敗（${res.status}），請以知識庫資訊回答。` };
        const data = await res.json();

        const results = (data.organic_results || []).slice(0, 6).map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet || '',
        }));
        if (results.length === 0) return { found: 0, message: '外部搜尋沒有找到相關結果。' };
        return {
            found: results.length,
            results,
            note: '這些是外部網路資訊，回答時必須附上來源連結，並提醒使用者以原始網站公告為準。可用 read_webpage 深入閱讀特定結果。',
        };
    },

    async read_webpage({ url }) {
        const target = String(url || '').trim();
        if (!isSafeExternalUrl(target)) return { error: '無效或不允許的網址。' };
        try {
            const res = await fetchWithTimeout(target, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarshipBot/1.0)' },
                redirect: 'follow',
            }, 8000);
            if (!res.ok) return { error: `網頁讀取失敗（${res.status}）。` };
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('html') && !contentType.includes('text')) {
                return { error: `不支援的內容類型（${contentType.split(';')[0]}），僅能讀取網頁。` };
            }
            const html = (await res.text()).slice(0, 500000);
            const $ = cheerioLoad(html);
            $('script, style, nav, footer, iframe, noscript, svg').remove();
            const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
            if (!text) return { error: '網頁沒有可讀取的文字內容。' };
            return {
                url: target,
                page_title: $('title').text().trim().slice(0, 120),
                content: text.slice(0, 6000),
                truncated: text.length > 6000,
            };
        } catch (e) {
            return { error: `網頁讀取失敗：${e.name === 'AbortError' ? '逾時' : e.message}` };
        }
    },

    async subscribe_announcement({ announcement_id, days_before }, context = {}) {
        if (!context.userId) {
            return {
                success: false,
                message: context.channel === 'line'
                    ? '使用者尚未綁定平台帳號，無法訂閱。請引導使用者輸入「帳號綁定」完成綁定。'
                    : '使用者尚未登入，無法訂閱。請引導使用者先登入平台。',
            };
        }
        const days = Math.min(14, Math.max(1, parseInt(days_before, 10) || 3));

        const { data: ann } = await supabaseServer
            .from('announcements')
            .select('id, title, application_end_date, is_active')
            .eq('id', announcement_id)
            .maybeSingle();
        if (!ann || !ann.is_active) return { success: false, message: '查無此公告或公告已下架，無法訂閱。' };
        if (!ann.application_end_date) return { success: false, message: '此公告未設定截止日期，無法訂閱截止提醒。' };
        if (ann.application_end_date < todayInTaipei()) return { success: false, message: '此公告已截止，無法訂閱提醒。' };

        const { error } = await supabaseServer
            .from('announcement_subscriptions')
            .upsert({
                user_id: context.userId,
                announcement_id: ann.id,
                days_before: days,
                notified_at: null,
            }, { onConflict: 'user_id,announcement_id' });
        if (error) return { success: false, message: `訂閱失敗：${error.message}` };

        return {
            success: true,
            title: ann.title,
            application_end_date: ann.application_end_date,
            days_before: days,
            message: `訂閱成功：「${ann.title}」將於截止日前 ${days} 天寄送 Email 提醒。`,
        };
    },
};

/**
 * 執行工具並回傳可 JSON 序列化的結果（永不 throw，錯誤以訊息回傳給模型）。
 * @param {Object} context - { userId, channel } 呼叫端使用者脈絡（訂閱等行動型工具需要）
 */
export async function executeTool(name, args = {}, context = {}) {
    const executor = executors[name];
    if (!executor) {
        return { error: `未知的工具: ${name}` };
    }
    try {
        return await executor(args, context);
    } catch (error) {
        console.error(`[AITool] ${name} failed:`, error);
        return { error: `工具執行失敗: ${error.message}` };
    }
}

/**
 * 工具活動的人類可讀描述（顯示在前端「思考過程」區塊）。
 */
export function describeToolCall(name, args = {}) {
    switch (name) {
        case 'search_scholarships':
            return `搜尋知識庫：${(args.keywords || []).join('、')}`;
        case 'list_scholarships':
            return `瀏覽公告列表（${args.status === 'closing_soon' ? '即將截止' : args.status === 'all' ? '全部' : '開放申請中'}）`;
        case 'get_scholarship_details':
            return '讀取公告完整內容';
        case 'search_faq':
            return `查詢常見問題：${(args.keywords || []).join('、')}`;
        case 'get_current_date':
            return '確認今天日期';
        case 'web_search':
            return `搜尋網路：${args.query || ''}`;
        case 'read_webpage': {
            let host = '';
            try { host = new URL(args.url).hostname; } catch { host = args.url || ''; }
            return `閱讀網頁：${host}`;
        }
        case 'subscribe_announcement':
            return '訂閱截止提醒';
        default:
            return `執行 ${name}`;
    }
}
