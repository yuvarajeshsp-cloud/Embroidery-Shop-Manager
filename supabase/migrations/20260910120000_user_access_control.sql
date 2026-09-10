
/*
# User access control cleanup

The previous schema granted `anon` (the public, unauthenticated API key
shipped in the client bundle) full read/write/delete on every table, and let
any authenticated user rewrite any other user's role or active flag via a
raw REST call — regardless of what the "Users & Roles" UI showed. This
migration closes both holes and adds real order assignment.

1. Drop `anon` from every policy — this app requires a signed-in session
   before any screen renders data, so the public key never legitimately
   needs table access.
2. Add `public.current_user_role()` / `public.is_admin()` helpers (SECURITY
   DEFINER so they can read user_profiles without recursing through RLS).
3. `user_profiles`: a user may only edit their own display_name/phone/
   avatar_url; a BEFORE UPDATE trigger blocks anyone but an Administrator
   from changing `role` or `is_active`, even via a direct API call. Self
   sign-up can never insert an 'Administrator' row.
4. `orders`: add `assigned_to`, restricted by trigger to an active Manager
   or Operator (an admin invite/promote must happen before someone can be
   assigned work).
5. `config_items` / `config_stitch_rates` / `business_settings`: writes
   restricted to Administrators (reads stay open to any signed-in user —
   dropdowns need them). `audit_logs` reads restricted to Administrators;
   the log itself stays insert-only (no update/delete policy at all).
*/

-- ============================================================
-- HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(public.current_user_role() = 'Administrator', false)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(public.current_user_role() IN ('Administrator', 'Manager'), false)
$$;

-- ============================================================
-- ORDER ASSIGNMENT
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);

CREATE OR REPLACE FUNCTION public.enforce_order_assignee_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = NEW.assigned_to AND role IN ('Manager', 'Operator') AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Orders can only be assigned to an active Manager or Operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_assignee_role ON orders;
CREATE TRIGGER trg_enforce_order_assignee_role
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_assignee_role();

-- ============================================================
-- USER PROFILES — self-edit vs admin-edit
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only an Administrator can change a user''s role';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Only an Administrator can activate or deactivate a user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_privilege_rules ON user_profiles;
CREATE TRIGGER trg_enforce_profile_privilege_rules
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_rules();

DROP POLICY IF EXISTS "select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON user_profiles;

-- Everyone signed in can see the team directory (assignment pickers, "created by" labels).
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT TO authenticated USING (true);

-- Self sign-up may only create its own row, and can never grant itself Administrator.
-- (Admin-created invites bypass this via the service-role key in the invite-user function.)
CREATE POLICY "profiles_insert_self" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role <> 'Administrator');

-- A user may update their own row (role/is_active changes are blocked by the trigger above
-- unless they're an Administrator); an Administrator may update anyone's row.
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_delete_admin_only" ON user_profiles FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- ORDERS — drop anon, restrict delete
-- ============================================================

DROP POLICY IF EXISTS "select_all" ON orders;
DROP POLICY IF EXISTS "insert_auth" ON orders;
DROP POLICY IF EXISTS "update_auth" ON orders;
DROP POLICY IF EXISTS "delete_auth" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated USING (public.is_admin_or_manager());

-- ============================================================
-- OTHER BUSINESS TABLES — drop anon only, behavior unchanged
-- ============================================================

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'order_items', 'payments', 'order_item_attachments',
    'whatsapp_templates', 'whatsapp_message_log'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "select_all" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "insert_auth" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "update_auth" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "delete_auth" ON %I', tbl);
      EXECUTE format('CREATE POLICY "select_auth" ON %I FOR SELECT TO authenticated USING (true)', tbl);
      EXECUTE format('CREATE POLICY "insert_auth2" ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl);
      EXECUTE format('CREATE POLICY "update_auth2" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl);
      EXECUTE format('CREATE POLICY "delete_auth2" ON %I FOR DELETE TO authenticated USING (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- CONFIGURATION — reads open to any signed-in user, writes admin-only
-- ============================================================

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['config_items', 'config_stitch_rates', 'business_settings'] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "select_all" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "insert_auth" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "update_auth" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "delete_auth" ON %I', tbl);
      EXECUTE format('CREATE POLICY "config_select" ON %I FOR SELECT TO authenticated USING (true)', tbl);
      EXECUTE format('CREATE POLICY "config_insert_admin" ON %I FOR INSERT TO authenticated WITH CHECK (public.is_admin())', tbl);
      EXECUTE format('CREATE POLICY "config_update_admin" ON %I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', tbl);
      EXECUTE format('CREATE POLICY "config_delete_admin" ON %I FOR DELETE TO authenticated USING (public.is_admin())', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- AUDIT LOG — admin-only reads, insert-only (no update/delete), no anon
-- ============================================================

DROP POLICY IF EXISTS "select_all" ON audit_logs;
DROP POLICY IF EXISTS "insert_auth" ON audit_logs;
DROP POLICY IF EXISTS "update_auth" ON audit_logs;
DROP POLICY IF EXISTS "delete_auth" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- STORAGE — order-attachments bucket, drop anon
-- ============================================================

DROP POLICY IF EXISTS "order_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_delete" ON storage.objects;
CREATE POLICY "order_attachments_select2" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_insert2" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_update2" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_delete2" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'order-attachments');
