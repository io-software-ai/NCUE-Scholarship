/**
 * AI 知識庫 embedding 回填腳本
 *
 * 用途：pgvector migration（20260723000000_pgvector_semantic_search.sql）套用後，
 *   為既有 ai_knowledge 條目補上語意向量。之後公告建立/更新時會即時產生向量，
 *   本腳本僅需在初次啟用語意檢索時執行一次（或偶爾補漏）。
 *
 * 相依：需先套用 pgvector migration（embedding 欄位存在），否則會報欄位不存在。
 * 執行：node scripts/backfill-knowledge-embeddings.js [--all]
 *   預設只回填 embedding IS NULL 的條目；--all 強制全部重算。
 *
 * 速率：每筆呼叫一次 Gemini embedContent，內建節流避免觸發 RPM 限制。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const EMBEDDING_DIM = 1536;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const THROTTLE_MS = 400;          // 每筆間隔，避免觸發 embedding RPM 上限
const FORCE_ALL = process.argv.includes('--all');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Backfill] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
if (!GEMINI_API_KEY) {
    // GEMINI_API_KEY 亦可能存於 system_settings；此腳本以 .env.local 為準
    console.error('[Backfill] Missing GEMINI_API_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function embedText(text) {
    const input = String(text || '').trim().slice(0, 8000);
    if (!input) return null;
    const r = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: input,
        config: { outputDimensionality: EMBEDDING_DIM, taskType: 'RETRIEVAL_DOCUMENT' },
    });
    const vec = r.embeddings?.[0]?.values || r.embedding?.values;
    return Array.isArray(vec) && vec.length === EMBEDDING_DIM ? vec : null;
}

async function backfill() {
    console.log(`[Backfill] ${new Date().toISOString()} Start (mode: ${FORCE_ALL ? 'all' : 'missing-only'})`);

    let query = supabase
        .from('ai_knowledge')
        .select('id, announcement_id, title, content, embedding');
    if (!FORCE_ALL) query = query.is('embedding', null);

    const { data: rows, error } = await query;
    if (error) {
        if (/embedding|column|vector/i.test(error.message || '')) {
            console.error('[Backfill] embedding 欄位不存在——請先套用 pgvector migration。');
        } else {
            console.error('[Backfill] Fetch failed:', error.message);
        }
        process.exit(1);
    }

    console.log(`[Backfill] Rows to process: ${rows.length}`);
    let done = 0, failed = 0;

    for (const row of rows) {
        try {
            const vec = await embedText(`${row.title}\n${row.content}`);
            if (!vec) { failed++; console.warn(`[Backfill] Empty vector for ${row.announcement_id}`); continue; }
            const { error: upErr } = await supabase
                .from('ai_knowledge')
                .update({ embedding: vec })
                .eq('id', row.id);
            if (upErr) { failed++; console.error(`[Backfill] Update failed ${row.announcement_id}:`, upErr.message); }
            else { done++; }
        } catch (e) {
            failed++;
            console.error(`[Backfill] Embed failed ${row.announcement_id}:`, e.message);
        }
        if ((done + failed) % 10 === 0) console.log(`[Backfill] Progress: ${done + failed}/${rows.length}`);
        await sleep(THROTTLE_MS);
    }

    console.log(`[Backfill] Done. Embedded: ${done}, Failed: ${failed}, Total: ${rows.length}`);
}

backfill().catch(err => {
    console.error('[Backfill] Fatal:', err);
    process.exit(1);
});
