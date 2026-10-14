-- 2026-10-14 補丁：20261014000000 把 admin_profiles_view 設成 security_invoker = true，
-- 但 service_role 沒有 auth.users 的 SELECT 權限 → /api/users 查詢失敗（42501 permission denied for table users），
-- 退回不含 email / provider 的備援查詢。
-- 改回以擁有者（supabase_admin）權限執行；anon / authenticated 已無任何權限，只有 service_role 能讀。
--
-- 執行：sudo docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
--         < apps/web/supabase/migrations/20261014010000_fix_admin_profiles_view_invoker.sql
BEGIN;
ALTER VIEW public.admin_profiles_view SET (security_invoker = false);
REVOKE ALL ON public.admin_profiles_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_profiles_view TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
