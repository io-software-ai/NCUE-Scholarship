-- =============================================================
-- AI 品質閉環：👍👎 回饋 + 知識缺口（LLM-as-judge 夜間評估）+ FAQ 草稿
--
-- 流程：
--   1. 使用者對 AI 回覆按 👍 / 👎 → ai_message_feedback
--   2. 夜間排程（cron）以 LLM 評估近期提問 + 👎 回覆，歸納出「很多人在問但 FAQ 未涵蓋」
--      的主題 → ai_knowledge_gaps（status=pending）
--   3. 管理員於後台檢視缺口 → 一鍵產生 FAQ 草稿（LLM 依知識庫接地）→ 人工審核後發佈為 faqs
--      （務必人工批准，AI 僅產生草稿）
-- =============================================================

-- 1. AI 回覆逐則回饋（👍 / 👎）
--    message_key 為前端訊息識別碼；同一使用者對同一則訊息只保留一筆（可切換/取消）
CREATE TABLE IF NOT EXISTS public.ai_message_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    session_id uuid,
    message_key text NOT NULL,
    question text,                       -- 該回覆對應的使用者提問（供缺口分析）
    answer text,                         -- AI 回覆內容快照
    rating varchar(4) NOT NULL CHECK (rating IN ('up', 'down')),
    channel varchar(8) DEFAULT 'web',    -- web / line
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (user_id, message_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_rating ON public.ai_message_feedback (rating, created_at DESC);
ALTER TABLE public.ai_message_feedback ENABLE ROW LEVEL SECURITY;

-- 2. 知識缺口（夜間評估產出，管理員審核來源）
CREATE TABLE IF NOT EXISTS public.ai_knowledge_gaps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic text NOT NULL,                          -- 主題短標籤（歸納後）
    topic_key text NOT NULL UNIQUE,               -- 正規化去重鍵（小寫去空白）
    representative_question text,                 -- 最具代表性的提問
    sample_questions jsonb DEFAULT '[]'::jsonb,   -- 相關提問樣本（字串陣列）
    frequency integer NOT NULL DEFAULT 1,         -- 近期相關提問次數（熱度）
    rationale text,                               -- 為何判定為缺口（LLM 說明）
    suggested_question text,                      -- FAQ 草稿：問題
    suggested_answer jsonb,                        -- FAQ 草稿：受控區塊陣列
    status varchar(12) NOT NULL DEFAULT 'pending' -- pending / drafted / dismissed / published
        CHECK (status IN ('pending', 'drafted', 'dismissed', 'published')),
    created_faq_id uuid REFERENCES public.faqs(id) ON DELETE SET NULL,
    last_evaluated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON public.ai_knowledge_gaps (status, frequency DESC);
ALTER TABLE public.ai_knowledge_gaps ENABLE ROW LEVEL SECURITY;
