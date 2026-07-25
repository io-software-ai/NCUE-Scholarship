/**
 * AI 知識庫 (取代 Dify Knowledge Base)
 *
 * 公告在「建立 / 更新」的當下即被整理成 AI 易讀的結構化純文字，
 * 存入 ai_knowledge 資料表，供 AI 獎學金助理（Gemini Agent）以工具檢索。
 *
 * 生命週期保證：
 * - 建立/更新公告 → syncAnnouncementKnowledge(id) 即時 upsert
 * - 刪除公告     → DB 外鍵 ON DELETE CASCADE 自動移除
 * - 下架公告     → syncAnnouncementKnowledge(id) 會移除條目
 * - 定期校正     → reconcileKnowledge() 全量比對，避免知識庫累積孤兒資料
 */

import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { supabaseServer } from '../supabase/server';
import { getSystemConfig } from '../config';

// 附件全文抽取上限（成本控制）
const MAX_PDF_PER_ANNOUNCEMENT = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_PER_ATTACHMENT = 5000;

// 語意檢索：embedding 維度（HNSW index 上限 2000，取 1536）
export const EMBEDDING_DIM = 1536;
const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * 產生文字的 embedding 向量（供語意檢索）。失敗回傳 null（降級為關鍵字檢索）。
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 */
export async function embedText(text, taskType = 'RETRIEVAL_DOCUMENT') {
    const input = String(text || '').trim().slice(0, 8000);
    if (!input) return null;
    try {
        const apiKey = await getSystemConfig('GEMINI_API_KEY');
        if (!apiKey) return null;
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const r = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: input,
            config: { outputDimensionality: EMBEDDING_DIM, taskType },
        });
        const vec = r.embeddings?.[0]?.values || r.embedding?.values;
        return Array.isArray(vec) && vec.length === EMBEDDING_DIM ? vec : null;
    } catch (e) {
        console.warn('[AIKnowledge] embedText failed:', e.message);
        return null;
    }
}

/**
 * 以 Gemini 將 PDF 附件抽為純文字（原生讀 PDF，掃描件也可）。
 * 僅於公告內容變更時執行（見增量同步），單檔失敗不影響整體。
 */
async function extractAttachmentTexts(attachments = []) {
    const pdfs = (attachments || [])
        .filter(att => (att.mime_type || '').includes('pdf') && att.stored_file_path)
        .slice(0, MAX_PDF_PER_ANNOUNCEMENT);
    if (pdfs.length === 0) return '';

    const apiKey = await getSystemConfig('GEMINI_API_KEY');
    if (!apiKey) return '';
    const ai = new GoogleGenAI({ apiKey });

    const sections = [];
    for (const att of pdfs) {
        try {
            const fileName = path.basename(att.stored_file_path);
            const filePath = path.join(process.cwd(), 'public', 'storage', 'attachments', fileName);
            const stat = await fs.stat(filePath);
            if (stat.size > MAX_PDF_BYTES) continue;
            const buffer = await fs.readFile(filePath);

            const result = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{
                    parts: [
                        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
                        { text: '請將這份 PDF 的內容完整轉為純文字。保留條列項目與表格中的所有數字、日期、金額與條件；不要加入任何註解或摘要，只輸出文件內容本身。' },
                    ],
                }],
            });
            const text = (result.text || '').trim();
            if (text) {
                sections.push(`--- 附件「${att.file_name}」全文 ---\n${text.slice(0, MAX_TEXT_PER_ATTACHMENT)}`);
            }
        } catch (e) {
            console.warn(`[AIKnowledge] PDF 抽取失敗（${att.file_name}）:`, e.message);
        }
    }
    return sections.join('\n\n');
}

/**
 * Strip HTML tags and clean up text.
 */
export function cleanContent(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
}

function parseExternalUrls(externalUrls) {
    try {
        const parsed = JSON.parse(externalUrls);
        if (Array.isArray(parsed)) {
            return parsed.map(item => item.url).filter(Boolean);
        }
    } catch (e) {
        if (typeof externalUrls === 'string' && externalUrls.startsWith('http')) {
            return [externalUrls];
        }
    }
    return [];
}

/**
 * 將公告整理成 AI 易讀的結構化純文字。
 * 包含公告 UUID，讓 AI 能產生 [ANNOUNCEMENT_CARD:id] 推薦卡片與正確連結。
 */
export function formatAnnouncementForAI(announcement, attachments = [], attachmentFullText = '') {
    const summary = cleanContent(announcement.summary);
    const targetAudience = cleanContent(announcement.target_audience);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const externalUrls = parseExternalUrls(announcement.external_urls);

    const attachmentText = attachments.length > 0
        ? attachments.map(att => `- ${att.file_name}: ${appUrl}/api/attachments/${att.stored_file_path.split('/').pop()}`).join('\n')
        : '無附件';

    return `
[獎學金公告]
公告ID: ${announcement.id}
標題: ${announcement.title}
內部辨識名: ${announcement.internal_id || '無'}
分類: ${announcement.category || '未分類'}
公告連結: ${appUrl}/?announcement_id=${announcement.id}
申請開始日期: ${announcement.application_start_date || '未指定'}
申請截止日期: ${announcement.application_end_date || '未指定'}
適用對象: ${targetAudience || '未指定'}
兼領限制: ${announcement.application_limitations === 'Y' ? '可兼領' : (announcement.application_limitations === 'N' ? '不可兼領' : '未指定')}
送件方式: ${announcement.submission_method || '未指定'}
相關連結: ${externalUrls.join(', ') || '無'}
摘要內容:
${summary}

[附件清單]
${attachmentText}${attachmentFullText ? `\n\n[附件全文]\n${attachmentFullText}` : ''}
    `.trim();
}

async function buildKnowledgeRow(announcement) {
    const attachmentFullText = await extractAttachmentTexts(announcement.attachments || []);
    const content = formatAnnouncementForAI(announcement, announcement.attachments || [], attachmentFullText);
    const row = {
        announcement_id: announcement.id,
        title: announcement.title || '',
        content,
        metadata: {
            category: announcement.category || null,
            internal_id: announcement.internal_id || null,
            application_start_date: announcement.application_start_date || null,
            application_end_date: announcement.application_end_date || null,
        },
        updated_at: new Date().toISOString(),
    };
    // 語意向量（migration 未套用 embedding 欄位時，upsert 會忽略未知欄位嗎？不會——
    // 因此只有成功產生向量才附上，並在 upsert 失敗時降級重試）
    const vec = await embedText(`${row.title}\n${content}`, 'RETRIEVAL_DOCUMENT');
    if (vec) row.embedding = vec;
    return row;
}

/** upsert 知識條目，若因 embedding 欄位不存在而失敗，去掉向量重試（相容未套用 migration） */
async function upsertKnowledgeRow(row) {
    let { error } = await supabaseServer.from('ai_knowledge').upsert(row, { onConflict: 'announcement_id' });
    if (error && row.embedding && /embedding|column|vector/i.test(error.message || '')) {
        const { embedding, ...rest } = row;
        ({ error } = await supabaseServer.from('ai_knowledge').upsert(rest, { onConflict: 'announcement_id' }));
    }
    return error;
}

/**
 * 單筆同步：公告建立 / 更新 / 上下架時呼叫。
 * - 公告存在且上架 → upsert 知識條目
 * - 公告不存在或已下架 → 移除知識條目
 */
export async function syncAnnouncementKnowledge(announcementId) {
    const { data: announcement, error } = await supabaseServer
        .from('announcements')
        .select('*, attachments(*)')
        .eq('id', announcementId)
        .maybeSingle();

    if (error) {
        console.error('[AIKnowledge] Fetch failed:', error);
        return { success: false, error: error.message };
    }

    if (!announcement || !announcement.is_active) {
        const { error: delError } = await supabaseServer
            .from('ai_knowledge')
            .delete()
            .eq('announcement_id', announcementId);
        if (delError) {
            console.error('[AIKnowledge] Delete failed:', delError);
            return { success: false, error: delError.message };
        }
        return { success: true, action: 'removed' };
    }

    const upsertError = await upsertKnowledgeRow(await buildKnowledgeRow(announcement));

    if (upsertError) {
        console.error('[AIKnowledge] Upsert failed:', upsertError);
        return { success: false, error: upsertError.message };
    }
    return { success: true, action: 'upserted' };
}

/**
 * 全量校正：定期 (cron) 或手動觸發。
 * 1. 上架公告全部 upsert（內容以公告原文重建）
 * 2. 移除知識庫中已不存在 / 已下架公告的條目 → 知識庫不會越來越大
 */
export async function reconcileKnowledge({ force = false } = {}) {
    const { data: announcements, error: annError } = await supabaseServer
        .from('announcements')
        .select('*, attachments(*)')
        .eq('is_active', true);

    if (annError) return { success: false, error: annError.message };

    const activeIds = new Set((announcements || []).map(a => a.id));

    // 既有知識條目的更新時間：未變更的公告直接跳過，避免重複重建（含 PDF 抽取成本）
    const { data: existingRows } = await supabaseServer
        .from('ai_knowledge')
        .select('announcement_id, updated_at');
    const existingMap = new Map((existingRows || []).map(r => [r.announcement_id, r.updated_at]));

    // 1. Upsert active announcements（增量：知識條目比公告新 → 跳過）
    let upserted = 0;
    let skipped = 0;
    for (const ann of announcements || []) {
        const knowledgeUpdatedAt = existingMap.get(ann.id);
        const annUpdatedAt = ann.updated_at || ann.created_at;
        if (!force && knowledgeUpdatedAt && annUpdatedAt && new Date(knowledgeUpdatedAt) >= new Date(annUpdatedAt)) {
            skipped++;
            continue;
        }
        const upsertError = await upsertKnowledgeRow(await buildKnowledgeRow(ann));
        if (upsertError) {
            console.error(`[AIKnowledge] Upsert failed for ${ann.id}:`, upsertError);
        } else {
            upserted++;
        }
    }

    // 2. Remove stale entries (deleted or unpublished announcements)
    let removed = 0;
    const { data: knowledgeRows, error: kError } = await supabaseServer
        .from('ai_knowledge')
        .select('id, announcement_id');

    if (!kError && knowledgeRows?.length > 0) {
        const staleIds = knowledgeRows
            .filter(row => !activeIds.has(row.announcement_id))
            .map(row => row.id);
        if (staleIds.length > 0) {
            const { error: delError } = await supabaseServer
                .from('ai_knowledge')
                .delete()
                .in('id', staleIds);
            if (!delError) removed = staleIds.length;
        }
    }

    return { success: true, upserted, skipped, removed, totalActive: activeIds.size };
}

/**
 * 關鍵字檢索（供 AI 工具使用）：trigram/ILIKE 搜尋標題與內容。
 * keywords 陣列之間為 OR，回傳去重後的條目。
 */
export async function searchKnowledge(keywords = [], { limit = 8 } = {}) {
    const terms = (Array.isArray(keywords) ? keywords : [keywords])
        .map(k => String(k || '').trim())
        .filter(Boolean)
        .slice(0, 5);

    if (terms.length === 0) return [];

    // ── 路 1：關鍵字檢索（ilike，永遠執行作為保底）──
    const keywordRanks = new Map(); // announcement_id -> rank（0 最佳）
    const rowStore = new Map();     // announcement_id -> row
    let kwRank = 0;
    for (const term of terms) {
        const escaped = term.replace(/[%_]/g, m => `\\${m}`);
        const { data, error } = await supabaseServer
            .from('ai_knowledge')
            .select('announcement_id, title, content, metadata')
            .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
            .limit(limit * 2);
        if (error) { console.error('[AIKnowledge] Keyword search failed:', error); continue; }
        for (const row of data || []) {
            rowStore.set(row.announcement_id, row);
            if (!keywordRanks.has(row.announcement_id)) keywordRanks.set(row.announcement_id, kwRank++);
        }
    }

    // ── 路 2：語意檢索（向量；embedding 未回填或 RPC 不存在時自動略過）──
    const semanticRanks = new Map();
    try {
        const queryVec = await embedText(terms.join('，'), 'RETRIEVAL_QUERY');
        if (queryVec) {
            const { data, error } = await supabaseServer.rpc('match_ai_knowledge', {
                query_embedding: queryVec,
                match_count: limit * 2,
            });
            if (!error && Array.isArray(data)) {
                let sRank = 0;
                for (const row of data) {
                    rowStore.set(row.announcement_id, {
                        announcement_id: row.announcement_id, title: row.title,
                        content: row.content, metadata: row.metadata,
                    });
                    semanticRanks.set(row.announcement_id, sRank++);
                }
            }
        }
    } catch (e) {
        console.warn('[AIKnowledge] Semantic search unavailable, keyword only:', e.message);
    }

    // ── RRF 合併（Reciprocal Rank Fusion, k=60）──
    if (semanticRanks.size === 0) {
        // 純關鍵字（降級路徑）
        return [...keywordRanks.keys()].slice(0, limit).map(id => rowStore.get(id));
    }
    const K = 60;
    const scores = new Map();
    for (const [id, r] of keywordRanks) scores.set(id, (scores.get(id) || 0) + 1 / (K + r));
    for (const [id, r] of semanticRanks) scores.set(id, (scores.get(id) || 0) + 1 / (K + r));
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => rowStore.get(id))
        .filter(Boolean);
}

/**
 * 列出所有知識條目（供 AI 「瀏覽全部公告」工具使用）。
 */
export async function listKnowledge({ category = null, limit = 50 } = {}) {
    let query = supabaseServer
        .from('ai_knowledge')
        .select('announcement_id, title, metadata')
        .order('updated_at', { ascending: false })
        .limit(limit);
    if (category) {
        query = query.eq('metadata->>category', category);
    }
    const { data, error } = await query;
    if (error) {
        console.error('[AIKnowledge] List failed:', error);
        return [];
    }
    return data || [];
}
