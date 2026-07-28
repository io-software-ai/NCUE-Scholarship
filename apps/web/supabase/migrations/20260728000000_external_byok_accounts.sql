-- =============================================================
-- 校外使用者（自備 Gemini 金鑰 / BYOK）
--
-- 平台原本僅開放彰師大學生（以學校信箱驗證取得學號）。此 migration 讓校外使用者
-- 也能註冊：改由使用者自備 Google AI Studio 的 Gemini 金鑰，AI 相關功能一律以
-- 其本人的金鑰呼叫，額度與費用歸使用者本人，不佔用平台金鑰。
--
-- profiles 新增欄位（前端會讀到，因此只放非敏感資訊）：
--   account_type           'ncue' = 彰師大學生（平台金鑰）；'external' = 校外自備金鑰
--   gemini_key_storage     'local' = 僅存於使用者裝置（每次請求附帶）；'server' = 加密存於 user_ai_keys
--   gemini_key_hint        遮罩提示（例 AIza••••7f3c），供介面顯示，非完整金鑰
--   gemini_key_updated_at  最後一次設定／更換金鑰的時間
--
-- 加密後的金鑰另存於 user_ai_keys：該表啟用 RLS 且不建立任何 policy，
-- 因此僅伺服器端 service role 可存取，使用者自己的 session 也讀不到密文。
-- =============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'ncue',
    ADD COLUMN IF NOT EXISTS gemini_key_storage text,
    ADD COLUMN IF NOT EXISTS gemini_key_hint text,
    ADD COLUMN IF NOT EXISTS gemini_key_updated_at timestamp with time zone;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_type_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_account_type_check
            CHECK (account_type IN ('ncue', 'external'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gemini_key_storage_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_gemini_key_storage_check
            CHECK (gemini_key_storage IS NULL OR gemini_key_storage IN ('local', 'server'));
    END IF;
END $$;

-- 加密金鑰保管表（AES-256-GCM 密文，格式 v1.<base64(iv|tag|cipher)>）
CREATE TABLE IF NOT EXISTS public.user_ai_keys (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'gemini',
    cipher text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
-- RLS 開啟且刻意不建任何 policy：只有 service role 能讀寫密文
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

-- 後台使用者清單需要看得出身分別（校外使用者無學號）
--
-- 這裡必須先 DROP 再 CREATE：CREATE OR REPLACE VIEW 只允許在既有欄位「後面」追加欄位，
-- 無法在中間插入（會報 cannot change name of view column "email" to "account_type"）。
-- 此 view 僅供後台使用者清單查詢，且 /api/users 在 view 不存在時會自動改查 profiles，
-- 因此重建期間不影響服務。
DROP VIEW IF EXISTS public.admin_profiles_view;

CREATE VIEW public.admin_profiles_view AS
SELECT
  p.id,
  p.student_id,
  p.username,
  p.role,
  p.created_at,
  p.avatar_url,
  p.account_type,
  p.gemini_key_storage,
  u.email,
  u.raw_app_meta_data->>'provider' AS provider,
  u.raw_app_meta_data->'providers' AS providers
FROM public.profiles p
JOIN auth.users u ON p.id = u.id;

-- DROP 會連同原有授權一起移除，這裡補回（Supabase 的 default privileges 通常已涵蓋，
-- 非 Supabase 環境沒有 service_role 角色時則略過，不讓 migration 失敗）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT ON public.admin_profiles_view TO service_role;
    END IF;
END $$;
