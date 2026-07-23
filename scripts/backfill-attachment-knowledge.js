/**
 * 一次性回填：知識庫全量重建（含附件 PDF 全文抽取）
 *
 * 用途：增量同步上線前建立的知識條目沒有「附件全文」段，
 *       本腳本強制重建所有上架公告的知識條目並抽取 PDF 全文。
 * 內容格式與 src/lib/ai/knowledge.js 完全一致，重建後 updated_at 更新，
 * 後續增量同步會正常跳過未變更公告。
 *
 * 執行：node scripts/backfill-attachment-knowledge.js
 */

const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

const MAX_PDF_PER_ANNOUNCEMENT = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_PER_ATTACHMENT = 5000;

// ---- 與 src/lib/ai/knowledge.js 相同的內容格式 ----
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

function formatAnnouncementForAI(announcement, attachments = [], attachmentFullText = '') {
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
${attachmentText}${attachmentFullText ? `\n\n[附件全文]\n${attachmentFullText}` : ''}
    `.trim();
}

async function main() {
    const { GoogleGenAI } = await import('@google/genai');

    const { data: keyRow } = await supabase.from('system_settings').select('value').eq('key', 'GEMINI_API_KEY').maybeSingle();
    if (!keyRow?.value) { console.error('缺少 GEMINI_API_KEY'); process.exit(1); }
    const ai = new GoogleGenAI({ apiKey: keyRow.value });

    async function extractAttachmentTexts(attachments = []) {
        const pdfs = (attachments || [])
            .filter(att => (att.mime_type || '').includes('pdf') && att.stored_file_path)
            .slice(0, MAX_PDF_PER_ANNOUNCEMENT);
        if (pdfs.length === 0) return '';

        const sections = [];
        for (const att of pdfs) {
            try {
                const fileName = path.basename(att.stored_file_path);
                const filePath = path.join(__dirname, '..', 'public', 'storage', 'attachments', fileName);
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
                if (text) sections.push(`--- 附件「${att.file_name}」全文 ---\n${text.slice(0, MAX_TEXT_PER_ATTACHMENT)}`);
            } catch (e) {
                console.warn(`  ⚠ PDF 抽取失敗（${att.file_name}）: ${e.message?.slice(0, 100)}`);
            }
        }
        return sections.join('\n\n');
    }

    console.log(`[Backfill] ${new Date().toISOString()} 開始全量重建（含附件全文）…`);

    const { data: announcements, error } = await supabase
        .from('announcements')
        .select('*, attachments(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
    if (error) { console.error(error); process.exit(1); }

    const total = announcements.length;
    let ok = 0, fail = 0, withPdf = 0;

    for (let i = 0; i < total; i++) {
        const ann = announcements[i];
        const hasPdf = (ann.attachments || []).some(a => (a.mime_type || '').includes('pdf'));
        if (hasPdf) withPdf++;

        const attachmentFullText = await extractAttachmentTexts(ann.attachments || []);
        const row = {
            announcement_id: ann.id,
            title: ann.title || '',
            content: formatAnnouncementForAI(ann, ann.attachments || [], attachmentFullText),
            metadata: {
                category: ann.category || null,
                internal_id: ann.internal_id || null,
                application_start_date: ann.application_start_date || null,
                application_end_date: ann.application_end_date || null,
            },
            updated_at: new Date().toISOString(),
        };
        const { error: upErr } = await supabase.from('ai_knowledge').upsert(row, { onConflict: 'announcement_id' });
        if (upErr) { fail++; console.error(`  ✗ ${ann.title?.slice(0, 30)}: ${upErr.message}`); }
        else ok++;

        if ((i + 1) % 20 === 0 || i === total - 1) {
            console.log(`[Backfill] 進度 ${i + 1}/${total}（成功 ${ok}、失敗 ${fail}、含PDF ${withPdf}）`);
        }
    }

    console.log(`[Backfill] 完成 ✅ 共 ${total} 筆：成功 ${ok}、失敗 ${fail}、含 PDF 公告 ${withPdf}`);
}

main().catch(e => { console.error('[Backfill] Fatal:', e); process.exit(1); });
