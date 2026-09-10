
/*
# v2 — organization-level data isolation

Turns the single-shop schema into a multi-tenant one. Every business table
gets an `organization_id`; every RLS policy is rewritten to also require
`organization_id = current_org_id()`, so a query can only ever touch rows
belonging to the signed-in user's own organization — the same guarantee a
separate database per shop would give, enforced by Postgres on every query
instead of by app code remembering to filter.

This migration is intentionally scoped to the *foundation*: the schema, the
backfill of existing data into one organization, and RLS. It deliberately
does not yet build:
  - self-serve "create a new shop" sign-up (still joins the single existing org)
  - subscription/billing/trial gating
  - per-org seeding of default config values for a brand new org
Those are the next slices of the multi-tenant plan, not this one.

Existing data is test data (per the user), so this migrates in place rather
than standing up a parallel database — if anything here needs a do-over, the
tables can be wiped and reseeded.
*/

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'monthly', 'yearly')),
  subscription_status text NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ADD organization_id TO EVERY TENANT TABLE (nullable for now) —
-- must happen before current_org_id() below, since a plain SQL function's
-- body is validated against the catalog at CREATE time.
-- ============================================================

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'user_profiles', 'customers', 'orders', 'order_items', 'payments',
    'audit_logs', 'order_item_attachments', 'whatsapp_templates',
    'whatsapp_message_log', 'config_items', 'config_stitch_rates', 'business_settings'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id)', tbl);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_org ON %I(organization_id)', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id FROM user_profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- BACKFILL — one organization for all existing (test) data
-- ============================================================

DO $$ DECLARE default_org_id uuid; tbl text; BEGIN
  INSERT INTO organizations (name, slug, plan, subscription_status)
  VALUES ('Paavai Embroidery', 'paavai-embroidery', 'monthly', 'active')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO default_org_id FROM organizations WHERE slug = 'paavai-embroidery';

  FOREACH tbl IN ARRAY ARRAY[
    'user_profiles', 'customers', 'orders', 'order_items', 'payments',
    'audit_logs', 'order_item_attachments', 'whatsapp_templates',
    'whatsapp_message_log', 'config_items', 'config_stitch_rates', 'business_settings'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET organization_id = $1 WHERE organization_id IS NULL', tbl) USING default_org_id;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- AUTO-STAMP organization_id ON INSERT (every table but user_profiles —
-- that one is set explicitly by sign-up / the invite-user function, the
-- same places that already decide `role`)
-- ============================================================

CREATE OR REPLACE FUNCTION public.stamp_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.organization_id := public.current_org_id();
  RETURN NEW;
END;
$$;

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'orders', 'order_items', 'payments', 'audit_logs',
    'order_item_attachments', 'whatsapp_templates', 'whatsapp_message_log',
    'config_items', 'config_stitch_rates', 'business_settings'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_organization_id ON %I', tbl);
      EXECUTE format('CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id()', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- ORGANIZATIONS — members can see their own org, nothing else
-- ============================================================

DROP POLICY IF EXISTS "org_select_own" ON organizations;
CREATE POLICY "org_select_own" ON organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());

-- A freshly signed-up user has no user_profiles row yet, so current_org_id()
-- has nothing to look up — this lets them discover an org to join *only*
-- during that brief pre-profile window. Once they have a profile, this
-- grants nothing extra (they already see their own org via the policy
-- above). Temporary, until self-serve "create a new shop" sign-up replaces
-- "join the one existing org."
DROP POLICY IF EXISTS "org_select_during_signup" ON organizations;
CREATE POLICY "org_select_during_signup" ON organizations FOR SELECT TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- ============================================================
-- USER PROFILES — team directory is now scoped to your own org
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "profiles_insert_self" ON user_profiles;
CREATE POLICY "profiles_insert_self" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role <> 'Administrator');

DROP POLICY IF EXISTS "profiles_update" ON user_profiles;
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (auth.uid() = id OR public.is_admin()))
  WITH CHECK (organization_id = public.current_org_id() AND (auth.uid() = id OR public.is_admin()));

DROP POLICY IF EXISTS "profiles_delete_admin_only" ON user_profiles;
CREATE POLICY "profiles_delete_admin_only" ON user_profiles FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin());

-- ============================================================
-- ORDER ASSIGNMENT — assignee must be an active Manager/Operator in the
-- SAME org as the order, not just any org
-- ============================================================

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
      WHERE id = NEW.assigned_to
        AND organization_id = NEW.organization_id
        AND role IN ('Manager', 'Operator')
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Orders can only be assigned to an active Manager or Operator in the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- ORDERS / OTHER BUSINESS TABLES — same role logic as before, plus org scope
-- ============================================================

DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id());
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id());
CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'order_items', 'payments', 'order_item_attachments',
    'whatsapp_templates', 'whatsapp_message_log'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "select_auth" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "insert_auth2" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "update_auth2" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "delete_auth2" ON %I', tbl);
      EXECUTE format('CREATE POLICY "org_select" ON %I FOR SELECT TO authenticated USING (organization_id = public.current_org_id())', tbl);
      EXECUTE format('CREATE POLICY "org_insert" ON %I FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id())', tbl);
      EXECUTE format('CREATE POLICY "org_update" ON %I FOR UPDATE TO authenticated USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', tbl);
      EXECUTE format('CREATE POLICY "org_delete" ON %I FOR DELETE TO authenticated USING (organization_id = public.current_org_id())', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- CONFIGURATION — reads/writes scoped to your org, writes admin-only
-- ============================================================

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['config_items', 'config_stitch_rates', 'business_settings'] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "config_select" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "config_insert_admin" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "config_update_admin" ON %I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "config_delete_admin" ON %I', tbl);
      EXECUTE format('CREATE POLICY "config_select" ON %I FOR SELECT TO authenticated USING (organization_id = public.current_org_id())', tbl);
      EXECUTE format('CREATE POLICY "config_insert_admin" ON %I FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.is_admin())', tbl);
      EXECUTE format('CREATE POLICY "config_update_admin" ON %I FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.is_admin()) WITH CHECK (organization_id = public.current_org_id() AND public.is_admin())', tbl);
      EXECUTE format('CREATE POLICY "config_delete_admin" ON %I FOR DELETE TO authenticated USING (organization_id = public.current_org_id() AND public.is_admin())', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- AUDIT LOG — admin-only reads, scoped to your org, still insert-only
-- ============================================================

DROP POLICY IF EXISTS "audit_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND public.is_admin());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id());

-- ============================================================
-- STORAGE — an order item's attachments live under "<order_item_id>/...";
-- only someone in the same org as that order item may write there. (The
-- bucket is public for reads via getPublicUrl — a pre-existing, separate
-- gap this migration doesn't change — but writes now require org membership.)
-- ============================================================

DROP POLICY IF EXISTS "order_attachments_select2" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_insert2" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_update2" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_delete2" ON storage.objects;

CREATE POLICY "order_attachments_select3" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-attachments' AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
  ));
CREATE POLICY "order_attachments_insert3" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-attachments' AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
  ));
CREATE POLICY "order_attachments_update3" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'order-attachments' AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
  ));
CREATE POLICY "order_attachments_delete3" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'order-attachments' AND EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.id::text = (storage.foldername(name))[1] AND oi.organization_id = public.current_org_id()
  ));
