-- =============================================================
-- AI 知識庫 (自建 Gemini Agent 取代 Dify) + LINE 官方帳號整合
-- =============================================================

-- 1. AI 知識庫：公告建立/更新時即整理成 AI 易讀內容，供 AI 助理檢索
--    ON DELETE CASCADE：公告刪除時知識條目自動移除，避免知識庫無限增長
CREATE TABLE IF NOT EXISTS public.ai_knowledge (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id uuid NOT NULL UNIQUE REFERENCES public.announcements(id) ON DELETE CASCADE,
    title varchar NOT NULL,
    content text NOT NULL,              -- AI 易讀全文（結構化純文字）
    metadata jsonb DEFAULT '{}'::jsonb, -- category / deadline / urls 等過濾用欄位
    updated_at timestamp with time zone DEFAULT now()
);

-- 檢索索引：trigram 支援中文子字串 / ILIKE 搜尋
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_content_trgm
    ON public.ai_knowledge USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_title_trgm
    ON public.ai_knowledge USING GIN (title gin_trgm_ops);

-- 2. LINE 好友（官方帳號的使用者）
--    bound_user_id：綁定平台帳號後，AI 回覆時會一併參考該使用者在網頁版的對話紀錄
CREATE TABLE IF NOT EXISTS public.line_users (
    line_user_id text PRIMARY KEY,
    display_name text,
    picture_url text,
    status_message text,
    bound_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_followed boolean DEFAULT true,      -- 封鎖/解除好友時設為 false
    followed_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_line_users_bound_user ON public.line_users (bound_user_id);

-- 3. LINE 對話紀錄（user = 好友來訊、ai = AI 自動回覆、admin = 管理員親自回覆）
CREATE TABLE IF NOT EXISTS public.line_messages (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_user_id text NOT NULL REFERENCES public.line_users(line_user_id) ON DELETE CASCADE,
    role varchar NOT NULL CHECK (role IN ('user', 'ai', 'admin')),
    message_type varchar DEFAULT 'text',   -- text / sticker / image / video / audio / file / location
    content text,
    created_at timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_line_messages_user_time
    ON public.line_messages (line_user_id, created_at DESC);

-- 4. 移除 Dify 遺留欄位
ALTER TABLE public.announcements DROP COLUMN IF EXISTS dify_document_id;

-- 5. RLS：新表僅允許 service_role（後端 API）存取
ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_messages ENABLE ROW LEVEL SECURITY;

-- 6. 公告訂閱提醒：登入使用者訂閱公告，截止日前 N 天寄送 Email 通知
CREATE TABLE IF NOT EXISTS public.announcement_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    days_before integer NOT NULL DEFAULT 3 CHECK (days_before BETWEEN 1 AND 14),
    notified_at timestamp with time zone,      -- 已寄送提醒時間（防重複寄送；變更天數時重置）
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (user_id, announcement_id)
);
CREATE INDEX IF NOT EXISTS idx_ann_subs_announcement ON public.announcement_subscriptions (announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_subs_user ON public.announcement_subscriptions (user_id);
ALTER TABLE public.announcement_subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. 常見問題（FAQ）：後台可編輯，內容為受控區塊 JSON（僅允許固定樣式）
CREATE TABLE IF NOT EXISTS public.faqs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question text NOT NULL,
    answer jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{type:'paragraph'|'list'|'steps'|'note'|'warn', ...}]
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faqs_order ON public.faqs (display_order);
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- 8. LINE 綁定驗證碼（使用者於 LINE 輸入「綁定」取得，10 分鐘內於網頁輸入完成手動綁定）
CREATE TABLE IF NOT EXISTS public.line_bind_codes (
    code varchar(6) PRIMARY KEY,
    line_user_id text NOT NULL REFERENCES public.line_users(line_user_id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.line_bind_codes ENABLE ROW LEVEL SECURITY;

-- 9. LINE 聊天室置頂
ALTER TABLE public.line_users ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
