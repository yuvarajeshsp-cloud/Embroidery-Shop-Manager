
/*
# v2 — platform super admin

A small, deliberately narrow escape hatch through the tenant wall we just
built: exactly the accounts listed in `platform_admins` can *read* across
every organization's data. Nobody else — including a regular org
Administrator — gains anything from this; every other policy's normal
`organization_id = current_org_id()` check is untouched, this only adds an
extra `OR is_platform_admin()` alongside it.

Scoped to reads only. A platform admin can see everything; creating,
editing, or deleting still goes through the same per-org rules as before —
this migration does not touch any INSERT/UPDATE/DELETE policy.

`platform_admins` itself has RLS enabled with *no* policies at all, so it
isn't readable or writable through the API by anyone, including a platform
admin themselves — the only sanctioned access path is the SECURITY DEFINER
`is_platform_admin()` function below.
*/

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'yuvarajeshsp@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- ORGANIZATIONS + USER PROFILES
-- ============================================================

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_platform_admin());

-- ============================================================
-- ORDERS
-- ============================================================

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_platform_admin());

-- ============================================================
-- OTHER BUSINESS TABLES
-- ============================================================

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'order_items', 'payments', 'order_item_attachments',
    'whatsapp_templates', 'whatsapp_message_log',
    'config_items', 'config_stitch_rates', 'business_settings'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS "org_select" ON %I; DROP POLICY IF EXISTS "config_select" ON %I;',
        tbl, tbl
      );
      EXECUTE format(
        'CREATE POLICY "org_select" ON %I FOR SELECT TO authenticated USING (organization_id = public.current_org_id() OR public.is_platform_admin())',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- AUDIT LOG
-- ============================================================

DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT TO authenticated
  USING ((organization_id = public.current_org_id() AND public.is_admin()) OR public.is_platform_admin());

-- ============================================================
-- STORAGE
-- ============================================================

DROP POLICY IF EXISTS "order_attachments_select3" ON storage.objects;
CREATE POLICY "order_attachments_select4" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-attachments' AND (
    public.is_platform_admin() OR EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
    )
  ));
