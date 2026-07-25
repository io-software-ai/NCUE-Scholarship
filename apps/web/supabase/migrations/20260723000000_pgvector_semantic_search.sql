-- =============================================================
-- pgvector 混合語意檢索：為 ai_knowledge 增加向量欄位 + HNSW 索引 + RPC
--
-- 目的：把 AI 助理的檢索從純 ilike 關鍵字比對，升級為
--   「關鍵字（trigram）+ 語意（向量餘弦）」雙路 RRF 融合。
-- 相容性：欄位/索引/函式全部 IF NOT EXISTS 或 OR REPLACE，可重複執行。
--   應用層 searchKnowledge 於 embedding 未回填、RPC 不存在時自動降級為純關鍵字，
--   因此本 migration 未套用前平台仍可正常運作，套用後自動啟用語意檢索。
-- 維度：gemini-embedding-001 以 outputDimensionality=1536 產生
--   （預設 3072 超過 HNSW 2000 維上限，故固定 1536）。
-- =============================================================

-- 1. 啟用 pgvector 擴充
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 向量欄位（1536 維，對應 gemini-embedding-001 outputDimensionality）
ALTER TABLE public.ai_knowledge
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. HNSW 近似最近鄰索引（餘弦距離）
--    m / ef_construction 為建構期參數；資料量不大時預設值即足夠。
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_embedding_hnsw
    ON public.ai_knowledge
    USING hnsw (embedding vector_cosine_ops);

-- 4. 語意檢索 RPC：回傳與查詢向量最相近的公告
--    similarity = 1 - cosine_distance（越接近 1 越相似）。
--    embedding 為 NULL（尚未回填）的列自動排除。
CREATE OR REPLACE FUNCTION public.match_ai_knowledge(
    query_embedding vector(1536),
    match_count int DEFAULT 8
)
RETURNS TABLE (
    announcement_id uuid,
    title varchar,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        k.announcement_id,
        k.title,
        k.content,
        k.metadata,
        1 - (k.embedding <=> query_embedding) AS similarity
    FROM public.ai_knowledge k
    WHERE k.embedding IS NOT NULL
    ORDER BY k.embedding <=> query_embedding
    LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

-- 5. 授權：後端以 service_role 呼叫；一併開放 authenticated 以備前端直呼
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge(vector, int) TO service_role, authenticated, anon;
