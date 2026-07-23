/**
 * AI 知識庫定期校正腳本（取代 sync-dify-knowledge.js）
 *
 * 用途：cron 定期執行，確保 ai_knowledge 與 announcements 完全一致：
 *   1. 上架公告 → 重建 AI 易讀內容 (upsert)
 *   2. 已刪除 / 已下架公告 → 移除知識條目（知識庫不會越來越大）
 *
 * 執行：node scripts/sync-ai-knowledge.js
 * 建議 crontab（每日 04:00）：
 *   0 4 * * * cd /var/www/html/NCUE-Scholarship && /usr/bin/node scripts/sync-ai-knowledge.js >> /var/log/sync-ai-knowledge.log 2>&1
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[SyncAI] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function cleanContent(html) {
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
        if (Array.isArray(parsed)) return parsed.map(item => item.url).filter(Boolean);
    } catch (e) {
        if (typeof externalUrls === 'string' && externalUrls.startsWith('http')) return [externalUrls];
    }
    return [];
}

function formatAnnouncementForAI(announcement, attachments = []) {
    const summary = cleanContent(announcement.summary);
    const targetAudience = cleanContent(announcement.target_audience);
    const externalUrls = parseExternalUrls(announcement.external_urls);

    const attachmentText = attachments.length > 0
        ? attachments.map(att => `- ${att.file_name}: ${APP_URL}/api/attachments/${att.stored_file_path.split('/').pop()}`).join('\n')
        : '無附件';

    return `
[獎學金公告]
公告ID: ${announcement.id}
標題: ${announcement.title}
內部辨識名: ${announcement.internal_id || '無'}
分類: ${announcement.category || '未分類'}
公告連結: ${APP_URL}/?announcement_id=${announcement.id}
申請開始日期: ${announcement.application_start_date || '未指定'}
申請截止日期: ${announcement.application_end_date || '未指定'}
適用對象: ${targetAudience || '未指定'}
兼領限制: ${announcement.application_limitations === 'Y' ? '可兼領' : (announcement.application_limitations === 'N' ? '不可兼領' : '未指定')}
送件方式: ${announcement.submission_method || '未指定'}
相關連結: ${externalUrls.join(', ') || '無'}
摘要內容:
${summary}

[附件清單]
${attachmentText}
    `.trim();
}

async function reconcile() {
    console.log(`[SyncAI] ${new Date().toISOString()} Starting reconciliation...`);

    const { data: announcements, error: annError } = await supabase
        .from('announcements')
        .select('*, attachments(*)')
        .eq('is_active', true);

    if (annError) throw annError;

    const activeIds = new Set(announcements.map(a => a.id));
    console.log(`[SyncAI] Active announcements: ${activeIds.size}`);

    // 既有知識條目的更新時間：未變更公告跳過（避免每晚全量重建、
    // 也避免覆蓋掉後台同步時加入的附件全文內容）
    const { data: existingRows } = await supabase.from('ai_knowledge').select('announcement_id, updated_at');
    const existingMap = new Map((existingRows || []).map(r => [r.announcement_id, r.updated_at]));

    // 1. Upsert changed active announcements（增量）
    let upserted = 0;
    let skipped = 0;
    for (const ann of announcements) {
        const kUpdated = existingMap.get(ann.id);
        const aUpdated = ann.updated_at || ann.created_at;
        if (kUpdated && aUpdated && new Date(kUpdated) >= new Date(aUpdated)) { skipped++; continue; }
        const row = {
            announcement_id: ann.id,
            title: ann.title || '',
            content: formatAnnouncementForAI(ann, ann.attachments || []),
            metadata: {
                category: ann.category || null,
                internal_id: ann.internal_id || null,
                application_start_date: ann.application_start_date || null,
                application_end_date: ann.application_end_date || null,
            },
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('ai_knowledge').upsert(row, { onConflict: 'announcement_id' });
        if (error) console.error(`[SyncAI] Upsert failed for ${ann.id}:`, error.message);
        else upserted++;
    }

    // 2. Remove stale entries
    const { data: knowledgeRows, error: kError } = await supabase
        .from('ai_knowledge')
        .select('id, announcement_id');
    if (kError) throw kError;

    const staleIds = knowledgeRows.filter(r => !activeIds.has(r.announcement_id)).map(r => r.id);
    if (staleIds.length > 0) {
        const { error } = await supabase.from('ai_knowledge').delete().in('id', staleIds);
        if (error) console.error('[SyncAI] Stale cleanup failed:', error.message);
    }

    console.log(`[SyncAI] Done. Upserted: ${upserted}, Skipped(unchanged): ${skipped}, Removed stale: ${staleIds.length}`);
}

reconcile().catch(err => {
    console.error('[SyncAI] Fatal:', err);
    process.exit(1);
});
