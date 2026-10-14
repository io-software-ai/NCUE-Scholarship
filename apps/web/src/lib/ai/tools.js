/**
 * AI 獎學金助理的工具 (Gemini Function Calling)
 *
 * 每個工具 = declaration (給模型的 schema) + executor (實際執行) + describeToolCall (前端顯示文字)。
 * 新增工具時三處都要加；有副作用的工具一律要求 confirmed=true，並在 agent.js 的 TOOL_CALL_LIMITS 設上限。
 *
 * 分類：
 * - 知識庫查詢：search_scholarships / list_scholarships / get_scholarship_details / search_faq / get_application_checklist
 * - 輔助：get_current_date / compare_scholarships / get_deadline_calendar / recommend_for_me / get_profile_prefill
 * - 外部：web_search / read_webpage
 * - 行動型（需 userId 與使用者同意）：subscribe_announcement / cancel_subscription / save_to_memory / forget_memory
 * - 回報：report_knowledge_gap（寫入 ai_knowledge_gaps，管理員於「AI 品質」分頁審核）
 *
 * 知識庫來源為 ai_knowledge 資料表（公告建立當下即整理完成的 AI 易讀內容）。
 */

import { Type } from '@google/genai';
import { load as cheerioLoad } from 'cheerio';
import { supabaseServer } from '../supabase/server';
import { getSystemConfig } from '../config';
import { searchKnowledge, listKnowledge, cleanContent } from './knowledge';
import { mergeIntoBackground, normalizeMemoryItems, removeFromBackground, splitBackgroundLines } from './memory';
import { REVIEW_BASE_GUIDE, REVIEW_GUIDE_NAMES, matchScholarshipGuides } from './reviewGuide';
import { buildCriteria, extractCriteriaFromBackground, scoreAnnouncements } from './recommend';
import { normalizeTopicKey } from './qualityEval';
import { siteConfig, getAnnouncementUrl } from '../siteConfig';
import { buildGoogleCalendarUrl, CATEGORY_NAMES } from '../announcementUi';
import { safeFetch, isAllowedUrlSyntax } from '../safeFetch';

const TAIPEI_TZ = 'Asia/Taipei';

function todayInTaipei() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TAIPEI_TZ }).format(new Date());
}

/** YYYY-MM-DD 加減天數（以 UTC 計算避免時區位移） */
function shiftDate(isoDate, days) {
    if (!isoDate) return null;
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** 需登入／綁定的工具共用回覆 */
function notSignedIn(context, action) {
    return {
        success: false,
        message: context.channel === 'line'
            ? `使用者尚未綁定平台帳號，無法${action}。請引導使用者輸入「帳號綁定」完成綁定。`
            : `使用者尚未登入，無法${action}。請引導使用者先登入平台。`,
    };
}

const limitationLabel = (v) => (v === 'Y' ? '可兼領' : v === 'N' ? '不可兼領' : '未指定');
const categoryLabel = (code) => (code ? `${code}｜${CATEGORY_NAMES[code] || '未分類'}` : '未分類');

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
    {
        name: 'get_application_checklist',
        description: '取得「申請文件檢核重點」：生輔組承辦人員實際查核的欄位、最常見的填寫錯誤與缺漏（班排百分比、系所全名、戶籍地址、匯款分行、簽名與日期…），以及特定獎學金的專屬應附文件與退件雷點。當使用者問「申請書怎麼填」「要附哪些文件」「為什麼被退件」「自傳／家庭狀況怎麼寫」時呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                scholarship_name: {
                    type: Type.STRING,
                    description: '獎學金名稱或關鍵字（選填），例如「廣源」「嘉新」「新住民」「崇她」；不填則只回傳共通檢核重點',
                },
            },
        },
    },
    {
        name: 'save_to_memory',
        description: '將使用者的長期背景資料（系級年級、身分別、家庭經濟狀況、成績表現、特殊需求等）整理後加入「記憶庫」，之後每次對話都會自動帶入，使用者不必重複自我介紹。既有內容只會被整理增補、不會被覆蓋。呼叫前必須先向使用者說明要記住哪些內容並取得明確同意（使用者說「好」「同意」「請記住」等），未經同意嚴禁呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '要加入記憶庫的項目（1-6 項），每項為精簡的一句陳述，例如「就讀資工系三年級」、「具低收入戶身分」',
                },
                confirmed: {
                    type: Type.BOOLEAN,
                    description: '使用者是否已明確同意加入記憶庫。未取得同意時不可傳 true。',
                },
            },
            required: ['items', 'confirmed'],
        },
    },
    {
        name: 'list_my_subscriptions',
        description: '列出目前使用者已訂閱截止提醒的公告（標題、截止日、提醒天數、是否已寄送提醒）。使用者問「我訂閱了哪些」「我的提醒」時呼叫；要取消訂閱前也先呼叫此工具確認是哪一則。',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'cancel_subscription',
        description: '取消目前使用者對某公告的截止提醒訂閱。呼叫前必須先向使用者說出要取消的公告名稱並取得明確同意（「好」「確認取消」）；未經同意不可呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                announcement_id: { type: Type.STRING, description: '公告 UUID（來自 list_my_subscriptions）' },
                confirmed: { type: Type.BOOLEAN, description: '使用者是否已明確同意取消。未取得同意時不可傳 true。' },
            },
            required: ['announcement_id', 'confirmed'],
        },
    },
    {
        name: 'forget_memory',
        description: '從記憶庫刪除指定的背景資料，或全部清除。使用者說「把我的 XX 忘掉」「刪掉記憶庫裡的 XX」「清空記憶庫」時使用。呼叫前必須列出將刪除的項目並取得明確同意；未經同意嚴禁呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '要刪除的內容描述（1-6 項），盡量引用記憶庫原句，例如「具低收入戶身分」',
                },
                clear_all: { type: Type.BOOLEAN, description: '是否清空整個記憶庫（需使用者明確說要全部清除）' },
                confirmed: { type: Type.BOOLEAN, description: '使用者是否已明確同意刪除。未取得同意時不可傳 true。' },
            },
            required: ['confirmed'],
        },
    },
    {
        name: 'compare_scholarships',
        description: '並列比較 2-4 則公告的結構化資訊（分類、申請期間、適用對象、兼領限制、送件方式、摘要），供產生比較表。使用者問「A 和 B 哪個適合我」「這幾個有什麼差別」時，先用搜尋／列表工具取得公告 ID 再呼叫。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                announcement_ids: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '要比較的公告 UUID（2-4 筆）',
                },
            },
            required: ['announcement_ids'],
        },
    },
    {
        name: 'get_deadline_calendar',
        description: '取得指定期間內的截止日程表（依日期分組），每筆附「加入 Google 日曆」連結與公告連結。使用者問「這個月／下個月有哪些截止」「幫我排時程」「加到日曆」時呼叫；也可只傳 announcement_ids 取得特定公告的日曆連結。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                month: { type: Type.STRING, description: '月份 YYYY-MM（例如 2026-10）；未提供 from/to 時預設為今天起 30 天' },
                from: { type: Type.STRING, description: '起始日 YYYY-MM-DD' },
                to: { type: Type.STRING, description: '結束日 YYYY-MM-DD' },
                announcement_ids: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '只取這些公告的日曆連結（提供時忽略日期範圍）',
                },
            },
        },
    },
    {
        name: 'recommend_for_me',
        description: '依使用者條件（身分別、戶籍縣市、系所、學制等）對所有開放中的公告做結構化初篩，回傳命中條件的公告與「不限身分」的公告。已登入者會自動合併記憶庫中的背景；對話中新提到的條件請一併傳入 criteria。使用者問「有哪些適合我」「幫我推薦」時優先使用此工具，而不是只靠關鍵字搜尋。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                criteria: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '使用者條件（0-8 項），例如 ["低收入戶", "花蓮縣", "資工系", "研究生"]',
                },
                limit: { type: Type.NUMBER, description: '最多回傳命中筆數，預設 8' },
            },
        },
    },
    {
        name: 'report_knowledge_gap',
        description: '當知識庫與 FAQ 都查無資料、無法回答使用者的獎學金相關問題時，把該問題回報給管理員作為知識缺口（每次對話最多一次）。純閒聊、與獎學金無關的問題、LINE 指令字不可回報。',
        parameters: {
            type: Type.OBJECT,
            properties: {
                topic: { type: Type.STRING, description: '主題短標籤（30 字內），例如「僑生可否申請縣市獎學金」' },
                question: { type: Type.STRING, description: '使用者的原始提問' },
                reason: { type: Type.STRING, description: '已查過哪些工具、為何無法回答' },
            },
            required: ['topic', 'question'],
        },
    },
    {
        name: 'get_profile_prefill',
        description: '取得目前使用者可用於申請表「基本資料欄位」預填的資訊（校名全稱、姓名、學號、Email、記憶庫中的系級與身分別），以及仍需使用者自行確認的欄位清單。使用者問「幫我填申請表」「基本資料怎麼填」時呼叫。僅供基本欄位；自傳、家庭狀況等敘述內容不可代寫。',
        parameters: { type: Type.OBJECT, properties: {} },
    },
];

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
    async search_scholarships({ keywords }, context = {}) {
        const rows = await searchKnowledge(keywords, { limit: 8, apiKey: context.apiKey || null });
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
        if (!isAllowedUrlSyntax(target)) return { error: '無效或不允許的網址。' };
        try {
            // safeFetch：擋內網 / 本機 / IPv6 與 DNS 繞過，重新導向逐跳檢查
            const res = await safeFetch(target, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarshipBot/1.0)' },
                timeoutMs: 8000,
                maxBytes: 1024 * 1024,
            });
            if (!res.ok) return { error: `網頁讀取失敗（${res.status}）。` };
            const contentType = res.contentType;
            if (!contentType.includes('html') && !contentType.includes('text')) {
                return { error: `不支援的內容類型（${contentType.split(';')[0]}），僅能讀取網頁。` };
            }
            const html = res.text().slice(0, 500000);
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
            if (e.name === 'UnsafeUrlError') return { error: '不允許的網址（僅能讀取公開網站）。' };
            return { error: `網頁讀取失敗：${e.name === 'AbortError' ? '逾時' : '無法連線'}` };
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

    async get_application_checklist({ scholarship_name } = {}) {
        const matched = matchScholarshipGuides(String(scholarship_name || ''));
        return {
            general_checklist: REVIEW_BASE_GUIDE,
            scholarship_specific: matched.map(g => ({ name: g.name, checklist: g.content })),
            available_scholarships: REVIEW_GUIDE_NAMES,
            note: matched.length === 0 && scholarship_name
                ? '沒有這個獎學金的專屬檢核重點，請以共通檢核重點回答，並提醒使用者以公告原文為準。'
                : '這些是生輔組承辦端的實際查核點，回答時要具體指出「哪裡要改、為什麼會被退件」。',
        };
    },

    async save_to_memory({ items, confirmed }, context = {}) {
        if (!context.userId) {
            return {
                success: false,
                message: context.channel === 'line'
                    ? '使用者尚未綁定平台帳號，無法使用記憶庫。請引導使用者輸入「帳號綁定」完成綁定。'
                    : '使用者尚未登入，無法使用記憶庫。請引導使用者先登入平台。',
            };
        }
        if (confirmed !== true) {
            return {
                success: false,
                message: '尚未取得使用者同意。請先向使用者說明打算記住哪些內容，等使用者明確同意後再呼叫本工具。',
            };
        }

        const cleaned = normalizeMemoryItems(items);
        if (cleaned.length === 0) return { success: false, message: '沒有可加入記憶庫的內容。' };

        const result = await mergeIntoBackground({ userId: context.userId, items: cleaned, apiKey: context.apiKey || null });
        return {
            success: result.success,
            saved_items: result.added || [],
            message: result.message,
        };
    },

    async list_my_subscriptions(_args, context = {}) {
        if (!context.userId) return notSignedIn(context, '查看訂閱');
        const { data, error } = await supabaseServer
            .from('announcement_subscriptions')
            .select('announcement_id, days_before, notified_at, created_at, announcements:announcement_id(id, title, category, application_end_date, is_active)')
            .eq('user_id', context.userId);
        if (error) return { error: `查詢訂閱失敗：${error.message}` };

        const today = todayInTaipei();
        const items = (data || [])
            .map(s => {
                const ann = s.announcements || {};
                return {
                    announcement_id: s.announcement_id,
                    title: ann.title || '（公告已移除）',
                    category: ann.category || null,
                    application_end_date: ann.application_end_date || null,
                    status: ann.is_active === false ? '公告已下架' : deadlineStatus(ann.application_end_date, today),
                    days_before: s.days_before,
                    reminder_date: shiftDate(ann.application_end_date, -s.days_before),
                    reminded: !!s.notified_at,
                    announcement_url: getAnnouncementUrl(s.announcement_id),
                };
            })
            .sort((a, b) => (a.application_end_date || '9999-12-31').localeCompare(b.application_end_date || '9999-12-31'));

        if (items.length === 0) return { total: 0, today, subscriptions: [], message: '目前沒有任何訂閱。可推薦使用者對有興趣的公告訂閱截止提醒。' };
        return { total: items.length, today, subscriptions: items };
    },

    async cancel_subscription({ announcement_id, confirmed }, context = {}) {
        if (!context.userId) return notSignedIn(context, '取消訂閱');
        if (confirmed !== true) {
            return { success: false, message: '尚未取得使用者同意。請先說明要取消哪一則公告的提醒，等使用者明確同意後再呼叫本工具。' };
        }
        const { data: sub } = await supabaseServer
            .from('announcement_subscriptions')
            .select('id, announcements:announcement_id(title)')
            .eq('user_id', context.userId)
            .eq('announcement_id', announcement_id)
            .maybeSingle();
        if (!sub) return { success: false, message: '使用者並未訂閱此公告，無需取消。可用 list_my_subscriptions 確認目前的訂閱。' };

        const { error } = await supabaseServer
            .from('announcement_subscriptions')
            .delete()
            .eq('id', sub.id);
        if (error) return { success: false, message: `取消失敗：${error.message}` };

        const title = sub.announcements?.title || '該公告';
        return { success: true, title, message: `已取消「${title}」的截止提醒。` };
    },

    async forget_memory({ items, clear_all, confirmed }, context = {}) {
        if (!context.userId) return notSignedIn(context, '修改記憶庫');
        if (confirmed !== true) {
            return { success: false, message: '尚未取得使用者同意。請先列出打算刪除的項目，等使用者明確同意後再呼叫本工具。' };
        }
        if (!clear_all && normalizeMemoryItems(items).length === 0) {
            return { success: false, message: '沒有指定要刪除的內容；若要全部清除請傳 clear_all=true。' };
        }
        const result = await removeFromBackground({
            userId: context.userId,
            items: items || [],
            clearAll: clear_all === true,
            apiKey: context.apiKey || null,
        });
        return {
            success: result.success,
            removed: result.removed || [],
            not_found: result.notFound || [],
            remaining_items: splitBackgroundLines(result.background || ''),
            message: result.message,
        };
    },

    async compare_scholarships({ announcement_ids }) {
        const ids = [...new Set((Array.isArray(announcement_ids) ? announcement_ids : [announcement_ids])
            .map(id => String(id || '').trim()).filter(Boolean))].slice(0, 4);
        if (ids.length < 2) return { error: '至少需要 2 筆公告 ID 才能比較。請先用搜尋／列表工具取得公告 ID。' };

        const { data, error } = await supabaseServer
            .from('announcements')
            .select('id, title, category, application_start_date, application_end_date, target_audience, application_limitations, submission_method, external_urls, summary, is_active')
            .in('id', ids)
            .eq('is_active', true); // 未上架（草稿 / 下架）公告不可外流
        if (error) return { error: `查詢公告失敗：${error.message}` };

        const today = todayInTaipei();
        const found = new Map((data || []).map(a => [a.id, a]));
        const items = ids.filter(id => found.has(id)).map(id => {
            const a = found.get(id);
            let links = [];
            try {
                const parsed = JSON.parse(a.external_urls || '[]');
                links = Array.isArray(parsed) ? parsed.map(x => x?.url).filter(Boolean) : [];
            } catch { links = a.external_urls?.startsWith?.('http') ? [a.external_urls] : []; }
            return {
                announcement_id: a.id,
                title: a.title,
                category: categoryLabel(a.category),
                application_start_date: a.application_start_date || null,
                application_end_date: a.application_end_date || null,
                status: a.is_active === false ? '公告已下架' : deadlineStatus(a.application_end_date, today),
                target_audience: cleanContent(a.target_audience) || '未指定',
                application_limitations: limitationLabel(a.application_limitations),
                submission_method: a.submission_method || '未指定',
                external_urls: links,
                summary: cleanContent(a.summary).slice(0, 2500),
                announcement_url: getAnnouncementUrl(a.id),
            };
        });
        const missing = ids.filter(id => !found.has(id));

        return {
            compared: items.length,
            today,
            items,
            missing_ids: missing,
            note: '請以表格並列關鍵差異（適用對象、截止日、兼領限制、送件方式），再依使用者狀況說明哪一則較合適；需要更完整內容可再呼叫 get_scholarship_details。',
        };
    },

    async get_deadline_calendar({ month, from, to, announcement_ids } = {}) {
        const today = todayInTaipei();
        const siteUrl = siteConfig.url;
        const SELECT = 'id, title, category, application_start_date, application_end_date, submission_method, is_active';
        const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

        let query = supabaseServer.from('announcements').select(SELECT).eq('is_active', true);
        let range = null;

        const ids = (Array.isArray(announcement_ids) ? announcement_ids : []).map(id => String(id || '').trim()).filter(Boolean).slice(0, 10);
        if (ids.length > 0) {
            query = query.in('id', ids);
        } else {
            let start = isDate(from) ? from : null;
            let end = isDate(to) ? to : null;
            if (/^\d{4}-\d{2}$/.test(String(month || ''))) {
                start = start || `${month}-01`;
                end = end || shiftDate(shiftDate(`${month}-01`, 31).slice(0, 7) + '-01', -1); // 該月最後一天
            }
            start = start || today;
            end = end || shiftDate(start, 30);
            if (end < start) [start, end] = [end, start];
            range = { from: start, to: end };
            query = query.gte('application_end_date', start).lte('application_end_date', end);
        }

        const { data, error } = await query.order('application_end_date', { ascending: true }).limit(40);
        if (error) return { error: `查詢截止日程失敗：${error.message}` };

        const rows = (data || []).filter(a => a.application_end_date);
        const groups = new Map();
        for (const a of rows) {
            const item = {
                announcement_id: a.id,
                title: a.title,
                category: a.category || null,
                application_start_date: a.application_start_date || null,
                application_end_date: a.application_end_date,
                status: deadlineStatus(a.application_end_date, today),
                submission_method: a.submission_method || '未指定',
                announcement_url: getAnnouncementUrl(a.id),
                google_calendar_url: buildGoogleCalendarUrl(a, siteUrl),
            };
            if (!groups.has(a.application_end_date)) groups.set(a.application_end_date, []);
            groups.get(a.application_end_date).push(item);
        }
        const days = [...groups.entries()].map(([date, items]) => ({ date, items }));

        if (days.length === 0) {
            return { today, range, total: 0, days: [], message: range ? `${range.from} 至 ${range.to} 之間沒有截止的公告。` : '這些公告沒有設定截止日，無法產生日曆。' };
        }
        return {
            today,
            range,
            total: rows.length,
            days,
            note: '每筆的 google_calendar_url 可直接給使用者點擊「加入 Google 日曆」；網頁請用 <a target="_blank">，LINE 直接貼網址。',
        };
    },

    async recommend_for_me({ criteria, limit } = {}, context = {}) {
        const given = (Array.isArray(criteria) ? criteria : (criteria ? [criteria] : []))
            .map(c => String(c || '').trim()).filter(Boolean).slice(0, 8);

        let derived = [];
        if (context.userId) {
            try {
                const { data: prof } = await supabaseServer
                    .from('profiles').select('ai_background').eq('id', context.userId).maybeSingle();
                derived = extractCriteriaFromBackground(prof?.ai_background || '');
            } catch { /* 欄位未建立時略過 */ }
        }
        const all = buildCriteria([...given, ...derived]);

        const today = todayInTaipei();
        const { data, error } = await supabaseServer
            .from('announcements')
            .select('id, title, category, application_end_date, target_audience, application_limitations, summary')
            .eq('is_active', true)
            .or(`application_end_date.gte.${today},application_end_date.is.null`)
            .limit(300);
        if (error) return { error: `查詢公告失敗：${error.message}` };

        const result = scoreAnnouncements(data || [], all, { limit: Math.min(Number(limit) || 8, 15) });
        const decorate = (list) => list.map(item => ({
            ...item,
            status: deadlineStatus(item.application_end_date, today),
            application_limitations: limitationLabel((data || []).find(a => a.id === item.announcement_id)?.application_limitations),
        }));

        if (all.length === 0) {
            return {
                today,
                criteria_used: [],
                matched: [],
                general: decorate(result.general),
                message: '沒有任何可比對的條件。請先詢問使用者的身分別（低收／原住民／新住民…）、戶籍縣市、系所或學制，或改用 list_scholarships 提供總覽。',
            };
        }
        return {
            today,
            criteria_used: all.map(c => c.label),
            derived_from_memory: derived,
            matched: decorate(result.matched),
            general: decorate(result.general),
            excluded_by_county: result.excludedByCounty,
            note: '這是依關鍵條件的初篩，不代表確定符合資格。回覆時請說明依據了哪些條件、每則命中了什麼，並提醒使用者對照公告原文查證；不確定的資格列為待確認。',
        };
    },

    async report_knowledge_gap({ topic, question, reason }, context = {}) {
        const t = String(topic || '').trim().slice(0, 60);
        const q = String(question || '').trim().slice(0, 300);
        if (t.length < 2 || q.length < 4) return { success: false, message: '主題或提問過短，未回報。' };
        const topicKey = normalizeTopicKey(t);
        const now = new Date().toISOString();
        const rationale = `AI 助理即時回報（${context.channel || 'web'}）：${String(reason || '知識庫與 FAQ 皆查無資料').trim().slice(0, 400)}`;

        const { data: existing, error: readError } = await supabaseServer
            .from('ai_knowledge_gaps')
            .select('id, status, frequency, sample_questions')
            .eq('topic_key', topicKey)
            .maybeSingle();
        if (readError) return { success: false, message: `回報失敗：${readError.message}` };

        if (existing) {
            if (existing.status === 'dismissed' || existing.status === 'published') {
                return { success: true, duplicate: true, message: '此主題管理員先前已處理（已發佈 FAQ 或判定不需處理），不重複回報。' };
            }
            const samples = [...new Set([...(existing.sample_questions || []), q])].slice(0, 6);
            const { error } = await supabaseServer.from('ai_knowledge_gaps').update({
                sample_questions: samples,
                frequency: (existing.frequency || 0) + 1,
                last_evaluated_at: now,
                updated_at: now,
            }).eq('id', existing.id);
            if (error) return { success: false, message: `回報失敗：${error.message}` };
            return { success: true, duplicate: true, message: '此主題已在待處理清單中，已累計一次提問。' };
        }

        const { error } = await supabaseServer.from('ai_knowledge_gaps').insert({
            topic: t,
            topic_key: topicKey,
            representative_question: q,
            sample_questions: [q],
            frequency: 1,
            rationale,
            status: 'pending',
        });
        if (error) return { success: false, message: `回報失敗：${error.message}` };
        return { success: true, message: '已回報給管理員作為知識缺口。回覆使用者時簡短說明「已將此問題回報給承辦單位」即可，並建議聯繫生輔組。' };
    },

    async get_profile_prefill(_args, context = {}) {
        if (!context.userId) return notSignedIn(context, '取得預填資料');
        const { data: prof, error } = await supabaseServer
            .from('profiles')
            .select('username, student_id, email, account_type, ai_background')
            .eq('id', context.userId)
            .maybeSingle();
        if (error || !prof) return { success: false, message: '讀取個人資料失敗。' };

        const isExternal = prof.account_type === 'external';
        return {
            success: true,
            school: {
                name: siteConfig.school,
                note: '校名一律填全稱，不可寫簡稱；學校地址與郵遞區號請向生輔組或學校網頁確認後填寫。',
            },
            applicant: {
                name: prof.username || null,
                name_note: '此為帳號顯示名稱，申請表須填證件上的姓名，請使用者確認。',
                student_id: prof.student_id || null,
                email: prof.email || null,
                account_type: isExternal ? '校外使用者（學號欄位可能不適用）' : '本校學生',
            },
            background_items: splitBackgroundLines(prof.ai_background || ''),
            fields_to_confirm: [
                '學院（須與系所正確對應，不確定請查系所網頁）',
                '系所全名（不可用自創簡稱，例：「企管系」應寫「企業管理學系」）',
                '年級（看清楚該表要的是申請當下學期或前一學年）',
                '身分證字號（逐字核對證件，不憑記憶）',
                '手機與聯絡 Email（退件補正通知會寄到這裡）',
                '戶籍地址（照抄戶籍謄本，含鄰、里）',
                '戶號（戶籍謄本／戶口名簿的戶長資料欄位）',
                '匯款銀行與分行名稱、金融機構代號、帳號（戶名須為本人）',
                '家庭成員與父母年齡（與戶籍謄本一致）',
                '申請學期（例：114-2）與本人簽名、日期',
            ],
            rules: [
                '只可預填基本資料欄位；自傳、家庭狀況、讀書計畫須由學生本人撰寫，不可代寫。',
                '個資（身分證字號、帳號、完整地址）只提醒格式與一致性，不在回覆中複誦。',
                '以表格列出欄位，分為「已知（可直接填）」與「待確認（請使用者補充）」兩類。',
            ],
        };
    },
};

/**
 * 執行工具並回傳可 JSON 序列化的結果（永不 throw，錯誤以訊息回傳給模型）。
 * @param {Object} context - { userId, channel, apiKey } 呼叫端使用者脈絡
 *        （訂閱等行動型工具需要 userId；apiKey 供語意檢索、記憶庫整理沿用同一把金鑰）
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
        case 'get_application_checklist':
            return args.scholarship_name ? `查詢申請檢核重點：${args.scholarship_name}` : '查詢申請文件檢核重點';
        case 'save_to_memory':
            return `整理並加入記憶庫（${(args.items || []).length} 項）`;
        case 'list_my_subscriptions':
            return '查看我的訂閱提醒';
        case 'cancel_subscription':
            return '取消截止提醒';
        case 'forget_memory':
            return args.clear_all ? '清空記憶庫' : `從記憶庫刪除（${(args.items || []).length} 項）`;
        case 'compare_scholarships':
            return `比較 ${(args.announcement_ids || []).length} 則公告`;
        case 'get_deadline_calendar':
            return args.month ? `整理 ${args.month} 截止日程` : '整理截止日程與日曆連結';
        case 'recommend_for_me':
            return (args.criteria || []).length > 0 ? `依條件篩選：${(args.criteria || []).join('、')}` : '依記憶庫背景篩選公告';
        case 'report_knowledge_gap':
            return '回報知識缺口給管理員';
        case 'get_profile_prefill':
            return '整理申請表基本資料';
        default:
            return `執行 ${name}`;
    }
}
