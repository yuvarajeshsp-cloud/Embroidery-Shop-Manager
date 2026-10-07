-- Subscription billing: 30-day trial starting at onboarding completion (phone
-- verification), then a 3-month view-only grace period once full access
-- lapses (trial, a paid period, or a platform-admin comp all count as "full
-- access" for this purpose), then a hard lockout to just the subscribe
-- screen. Platform admins are exempt everywhere via is_platform_admin().

-- Razorpay replaces the unused Stripe placeholders from the original
-- organizations migration — nothing ever read/wrote those columns.
ALTER TABLE organizations RENAME COLUMN stripe_customer_id TO razorpay_customer_id;
ALTER TABLE organizations RENAME COLUMN stripe_subscription_id TO razorpay_subscription_id;

ALTER TABLE organizations ADD COLUMN subscription_current_period_end timestamptz;
ALTER TABLE organizations ADD COLUMN comp_access_until timestamptz;

-- trial_ends_at used to default to now()+60 days at org creation, before the
-- org's admin had even verified their phone. The trial should start at
-- onboarding completion instead, so it's now set explicitly by the trigger
-- below — existing rows (already backfilled with a trial_ends_at) are left
-- untouched.
ALTER TABLE organizations ALTER COLUMN trial_ends_at DROP DEFAULT;

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'comped'));

CREATE OR REPLACE FUNCTION start_trial_on_verification()
RETURNS trigger AS $$
BEGIN
  IF NEW.phone_verified = true AND (OLD.phone_verified IS DISTINCT FROM true) THEN
    UPDATE organizations
    SET trial_ends_at = now() + interval '30 days'
    WHERE id = NEW.organization_id AND trial_ends_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_start_trial_on_verification ON user_profiles;
CREATE TRIGGER trg_start_trial_on_verification
  AFTER UPDATE OF phone_verified ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION start_trial_on_verification();

-- Platform-wide pricing, editable from the Platform Admin page. Singleton
-- table (id is always `true`) rather than a settings key on some other row,
-- since this isn't scoped to any one organization.
CREATE TABLE platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  monthly_price_paise integer NOT NULL DEFAULT 20000,
  -- Razorpay Plans fix their amount at creation time, so a Plan is cached
  -- here and reused as long as the price hasn't changed since; changing
  -- monthly_price_paise (or converting existing plan detected below)
  -- creates a fresh Plan on next checkout without touching subscribers
  -- already on the old one.
  razorpay_monthly_plan_id text,
  razorpay_monthly_plan_price_paise integer,
  razorpay_yearly_plan_id text,
  razorpay_yearly_plan_price_paise integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id, monthly_price_paise) VALUES (true, 20000);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_select ON platform_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY settings_update ON platform_settings FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Lets Platform Admin edit subscription/comp fields directly from the
-- Platform Admin page without a dedicated edge function.
CREATE POLICY org_update_platform_admin ON organizations FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE OR REPLACE FUNCTION organization_access_level(org_id uuid DEFAULT current_org_id())
RETURNS text AS $$
DECLARE
  org organizations%ROWTYPE;
  full_access_until timestamptz;
BEGIN
  IF is_platform_admin() THEN
    RETURN 'full';
  END IF;

  SELECT * INTO org FROM organizations WHERE id = org_id;
  IF org IS NULL THEN
    RETURN 'locked';
  END IF;

  full_access_until := GREATEST(
    COALESCE(org.trial_ends_at, '-infinity'::timestamptz),
    COALESCE(org.subscription_current_period_end, '-infinity'::timestamptz),
    COALESCE(org.comp_access_until, '-infinity'::timestamptz)
  );

  IF full_access_until > now() THEN
    RETURN 'full';
  ELSIF full_access_until + interval '3 months' > now() THEN
    RETURN 'view_only';
  ELSE
    RETURN 'locked';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Writes require full access; reads are blocked only once fully locked out
-- (view-only still reads). Deletes are treated as a write, not just
-- inserts/updates — losing records is worse than gaining a stale copy.

ALTER POLICY orders_insert ON orders
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY orders_update ON orders
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY orders_delete ON orders
  USING (organization_id = current_org_id() AND is_admin_or_manager() AND organization_access_level() = 'full');
ALTER POLICY orders_select ON orders
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');

ALTER POLICY org_insert ON order_items
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_update ON order_items
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_delete ON order_items
  USING (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_select ON order_items
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');

ALTER POLICY org_insert ON order_item_attachments
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_update ON order_item_attachments
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_delete ON order_item_attachments
  USING (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_select ON order_item_attachments
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');

ALTER POLICY org_insert ON customers
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_update ON customers
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_delete ON customers
  USING (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_select ON customers
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');

ALTER POLICY org_insert ON payments
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_update ON payments
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_delete ON payments
  USING (organization_id = current_org_id() AND organization_access_level() = 'full');
ALTER POLICY org_select ON payments
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');

ALTER POLICY expenses_insert ON expenses
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = ANY (ARRAY['Administrator', 'Manager', 'Accounts'])
    AND ((NOT is_sensitive) OR is_admin())
    AND organization_access_level() = 'full'
  );
ALTER POLICY expenses_update ON expenses
  USING (organization_id = current_org_id() AND ((NOT is_sensitive) OR is_admin()))
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = ANY (ARRAY['Administrator', 'Manager', 'Accounts'])
    AND ((NOT is_sensitive) OR is_admin())
    AND organization_access_level() = 'full'
  );
ALTER POLICY expenses_delete ON expenses
  USING (
    organization_id = current_org_id()
    AND ((NOT is_sensitive) OR is_admin())
    AND is_admin_or_manager()
    AND organization_access_level() = 'full'
  );
ALTER POLICY expenses_select ON expenses
  USING (
    organization_id = current_org_id()
    AND ((NOT is_sensitive) OR is_admin())
    AND organization_access_level() <> 'locked'
  );
