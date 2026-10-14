-- =====================================================================
-- 2026-10-14 資安修補：權限控管（RLS）全面收斂
--
-- 事件：前端公開的 anon 金鑰即可直接讀取 profiles / admin_profiles_view /
-- chat_history / announcement_views 等含個資資料表；且 anon 對所有表都持有
-- INSERT/UPDATE/DELETE 權限，未開 RLS 的 announcements / attachments 可被任意竄改。
-- 另外 profiles 的「本人可更新」policy 未限制欄位，登入者可自行把 role 改成 admin。
--
-- 原則：
--   * 伺服器端一律走 service_role（不受 RLS 限制），本檔不影響任何 API route。
--   * 瀏覽器 / App 直接存取的只有：
--       announcements、attachments  → 公開讀（僅上架），管理員可寫
--       profiles                    → 只能讀自己；只能改 username / has_agreed_to_terms
--   * 其餘資料表：anon / authenticated 一律無權限（僅 service_role）。
-- 本檔可重複執行（idempotent）。
--
-- 執行方式（必須用 supabase_admin：public schema 的表 / view / 函式都歸它所有，postgres 無權 ALTER）：
--   sudo docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
--     < apps/web/supabase/migrations/20261014000000_security_lockdown_rls.sql
-- 套用後驗證：node apps/web/scripts/check-anon-exposure.js
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION '請以 supabase_admin 執行此 migration（目前為 %）', current_user;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 0. 管理員判斷函式（SECURITY DEFINER，避免 policy 查 profiles 時遞迴）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')  -- 與 apiMiddleware.verifyUserAuth 一致
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. 收回 anon / authenticated 對 public schema 所有表、序列的預設全開權限
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 之後新建的表不再自動授權給 anon / authenticated（需要時請明確 GRANT + RLS）
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC';
  END IF;
END $$;

-- service_role 維持完整權限（伺服器端 API 依賴）
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------
-- 2. 每一張表都開 RLS（沒有 policy = anon/authenticated 完全不可存取）
-- ---------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- 移除舊有過寬 / 有漏洞的 policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile."       ON public.profiles;
DROP POLICY IF EXISTS "System can insert login history"           ON public.login_history;   -- WITH CHECK (true)：任何人可灌假紀錄
DROP POLICY IF EXISTS "Users can insert their own tokens"         ON public.fcm_tokens;      -- 允許 uid() IS NULL：可替他人註冊推播 token
DROP POLICY IF EXISTS "Admins can do everything on system_settings" ON public.system_settings; -- 含 API 金鑰，只允許伺服器端存取

-- ---------------------------------------------------------------------
-- 3. announcements：公開讀上架公告；管理員可讀全部並可寫
-- ---------------------------------------------------------------------
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

DROP POLICY IF EXISTS announcements_public_read  ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_read   ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_insert ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_update ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_delete ON public.announcements;

CREATE POLICY announcements_public_read  ON public.announcements FOR SELECT TO anon, authenticated USING (is_active IS TRUE);
CREATE POLICY announcements_admin_read   ON public.announcements FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY announcements_admin_insert ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY announcements_admin_update ON public.announcements FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY announcements_admin_delete ON public.announcements FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. attachments：跟著公告走；管理員可寫
-- ---------------------------------------------------------------------
GRANT SELECT ON public.attachments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.attachments TO authenticated;

DROP POLICY IF EXISTS attachments_public_read  ON public.attachments;
DROP POLICY IF EXISTS attachments_admin_read   ON public.attachments;
DROP POLICY IF EXISTS attachments_admin_insert ON public.attachments;
DROP POLICY IF EXISTS attachments_admin_update ON public.attachments;
DROP POLICY IF EXISTS attachments_admin_delete ON public.attachments;

CREATE POLICY attachments_public_read ON public.attachments FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND a.is_active IS TRUE));
CREATE POLICY attachments_admin_read   ON public.attachments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY attachments_admin_insert ON public.attachments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY attachments_admin_update ON public.attachments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY attachments_admin_delete ON public.attachments FOR DELETE TO authenticated USING (public.is_admin());

-- stored_file_path 會被 /api/delete-files、duplicate 等拿去組檔案路徑 → 限定格式，杜絕 ../ 路徑穿越
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_stored_file_path_format;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_stored_file_path_format
  CHECK (stored_file_path ~ '^/storage/attachments/[A-Za-z0-9._-]+$' AND stored_file_path !~ '\.\.');

-- ---------------------------------------------------------------------
-- 5. profiles：只能讀自己；只能改自己的 username / has_agreed_to_terms
--    （管理員後台走 /api/users，使用 service_role，不需要 RLS 放行）
-- ---------------------------------------------------------------------
-- 欄位級授權：authenticated 只能 UPDATE 這兩欄（之後新增的欄位預設也改不了）
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username, has_agreed_to_terms) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_self_read   ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_read   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 第二層防護（trigger）：即使日後有人誤加了較寬的 GRANT，非 service_role 的更新
-- 除 username / has_agreed_to_terms 外一律維持原值；role / student_id / account_type /
-- gemini_* / ai_background / email 等只能由伺服器端修改。
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.id                    := OLD.id;
    NEW.role                  := OLD.role;
    NEW.student_id            := OLD.student_id;
    NEW.email                 := OLD.email;
    NEW.created_at            := OLD.created_at;
    NEW.avatar_url            := OLD.avatar_url;
    NEW.last_login_at         := OLD.last_login_at;
    NEW.last_login_ip         := OLD.last_login_ip;
    NEW.ai_background         := OLD.ai_background;
    NEW.account_type          := OLD.account_type;
    NEW.gemini_key_storage    := OLD.gemini_key_storage;
    NEW.gemini_key_hint       := OLD.gemini_key_hint;
    NEW.gemini_key_updated_at := OLD.gemini_key_updated_at;
    -- NULL 視為未變更
    NEW.has_agreed_to_terms   := COALESCE(NEW.has_agreed_to_terms, OLD.has_agreed_to_terms);
    NEW.username              := left(NEW.username, 100);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- ---------------------------------------------------------------------
-- 6. admin_profiles_view：view 由 supabase_admin 擁有、以擁有者權限執行（會繞過 RLS 並讀 auth.users），
--    所以只能給 service_role。不可設 security_invoker = true：service_role 沒有 auth.users 的 SELECT 權限，
--    /api/users 會因 42501 退回不含 email 的備援查詢。
-- ---------------------------------------------------------------------
ALTER VIEW public.admin_profiles_view SET (security_invoker = false);
REVOKE ALL ON public.admin_profiles_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_profiles_view TO service_role;

-- ---------------------------------------------------------------------
-- 7. 其餘含個資 / 機敏資料的表：僅 service_role（已於步驟 1 收回、步驟 2 開 RLS）
--    chat_history, announcement_views, login_history, fcm_tokens, line_users,
--    line_messages, line_bind_codes, school_email_codes, user_ai_keys,
--    system_settings, announcement_subscriptions, ai_message_feedback,
--    ai_knowledge, ai_knowledge_gaps, faqs
--    （以上全部經由 /api/* 伺服器端存取）
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 8. 函式：RPC 只開給 service_role
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge(vector, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_ai_knowledge(vector, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_view_count() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user()      SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_view_count() SET search_path = public, pg_temp;

COMMIT;

-- 重新載入 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
