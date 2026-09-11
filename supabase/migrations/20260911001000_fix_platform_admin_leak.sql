
/*
# v2 — fix: platform-admin RLS bypass was leaking into every regular page

Widening every table's SELECT policy with `OR is_platform_admin()` made the
dedicated Platform Admin pages work, but it also broke the *regular* app for
a platform admin's own day-to-day use: pages like the sidebar, Dashboard,
Orders, Customers, and Payments never filter by organization_id in their
queries — they rely entirely on RLS to scope results to "my own org." Once
RLS started letting a platform admin's queries return every organization's
rows, those unfiltered client queries got a mix of every shop's data, and
whichever row happened to come back last silently overwrote the rest (this
is exactly what made the sidebar show "Second Test Shop" for Yuvarani, whose
own organization_id genuinely points to Paavai Embroidery the whole time —
confirmed directly against the database, this was never a data problem).

Fix: revert every regular table's RLS back to strict
`organization_id = current_org_id()` — identical behavior for a platform
admin and everyone else on the normal app. Cross-org visibility for the
Platform Admin pages now comes from dedicated SECURITY DEFINER functions
instead, which check is_platform_admin() internally and only ever get used
by those specific pages — RLS itself no longer has any org-crossing hole.
*/

-- ============================================================
-- REVERT: strict org-only RLS everywhere (drop the is_platform_admin() OR)
-- ============================================================

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());

DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'order_items', 'payments', 'order_item_attachments',
    'whatsapp_templates', 'whatsapp_message_log',
    'config_items', 'config_stitch_rates', 'business_settings'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "org_select" ON %I', tbl);
      EXECUTE format('CREATE POLICY "org_select" ON %I FOR SELECT TO authenticated USING (organization_id = public.current_org_id())', tbl);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin());

DROP POLICY IF EXISTS "order_attachments_select4" ON storage.objects;
CREATE POLICY "order_attachments_select5" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-attachments' AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
  ));

-- ============================================================
-- Platform Admin pages get cross-org reads through dedicated,
-- purpose-built functions instead — each checks is_platform_admin()
-- itself and is the only path that can ever see more than one org.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pa_organizations()
RETURNS SETOF organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM organizations ORDER BY created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_organization(p_org_id uuid)
RETURNS SETOF organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM organizations WHERE id = p_org_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_org_counts(p_org_id uuid)
RETURNS TABLE(member_count bigint, customer_count bigint, order_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM user_profiles WHERE organization_id = p_org_id),
    (SELECT count(*) FROM customers WHERE organization_id = p_org_id),
    (SELECT count(*) FROM orders WHERE organization_id = p_org_id);
END; $$;

CREATE OR REPLACE FUNCTION public.pa_members(p_org_id uuid)
RETURNS SETOF user_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM user_profiles WHERE organization_id = p_org_id ORDER BY display_name;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_customer_names(p_org_id uuid)
RETURNS TABLE(id uuid, customer_business_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT c.id, c.customer_business_name FROM customers c WHERE c.organization_id = p_org_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_orders(p_org_id uuid)
RETURNS SETOF orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM orders WHERE organization_id = p_org_id ORDER BY order_date DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_order_items(p_org_id uuid)
RETURNS SETOF order_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM order_items WHERE organization_id = p_org_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_payments(p_org_id uuid)
RETURNS SETOF payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM payments WHERE organization_id = p_org_id ORDER BY payment_date DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_config_items(p_org_id uuid)
RETURNS SETOF config_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT * FROM config_items WHERE organization_id = p_org_id ORDER BY category, sort_order;
END; $$;

CREATE OR REPLACE FUNCTION public.pa_business_settings(p_org_id uuid)
RETURNS TABLE("key" text, value text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT bs.key, bs.value FROM business_settings bs WHERE bs.organization_id = p_org_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.pa_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_org_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_customer_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_order_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_config_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pa_business_settings(uuid) TO authenticated;

-- Remove the temporary diagnostic function from the last migration.
DROP FUNCTION IF EXISTS public.debug_user_org(text);
