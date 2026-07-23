-- =============================================================
-- 個資管理擴充：AI 背景資料 + 校園信箱驗證碼
--
-- 1. profiles.ai_background：使用者自填的背景資料，隨每次 AI 對話帶入，
--    避免每次重述自我介紹（網頁與 LINE 兩端共用）。
-- 2. school_email_codes：非學校 Google 帳號登入者，透過學校信箱（@mail.ncue.edu.tw
--    或 @gm.ncue.edu.tw）收取 6 位數驗證碼完成在學身分綁定（學號由信箱推導）。
-- =============================================================

-- 1. AI 背景資料欄位
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS ai_background text;

-- 2. 校園信箱驗證碼（user_id 為主鍵：同一使用者僅保留最新一組）
CREATE TABLE IF NOT EXISTS public.school_email_codes (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    email text NOT NULL,
    code varchar(6) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.school_email_codes ENABLE ROW LEVEL SECURITY;
