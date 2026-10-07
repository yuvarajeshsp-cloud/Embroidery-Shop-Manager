-- The subscription module is held back from the current release (see
-- FEATURES in src/lib/features.ts). The paywall UI is hidden client-side,
-- but organization_access_level() is also evaluated by RLS on every
-- orders/customers/payments/expenses read and write — so left as-is, any
-- organization whose 30-day trial runs out would be silently blocked from
-- creating/editing (and eventually from viewing) data with no screen left
-- to subscribe from. This switch makes the function report full access for
-- everyone until enforcement is turned back on:
--   UPDATE platform_settings SET subscription_enforced = true;
-- (flip FEATURES.subscription in the client at the same time).
ALTER TABLE platform_settings ADD COLUMN subscription_enforced boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION organization_access_level(org_id uuid DEFAULT current_org_id())
RETURNS text AS $$
DECLARE
  org organizations%ROWTYPE;
  full_access_until timestamptz;
  enforced boolean;
BEGIN
  SELECT subscription_enforced INTO enforced FROM platform_settings WHERE id = true;
  IF NOT COALESCE(enforced, false) THEN
    RETURN 'full';
  END IF;

  IF is_platform_admin() THEN
    RETURN 'full';
  END IF;

  SELECT * INTO org FROM organizations WHERE id = org_id;
  IF org IS NULL THEN
    RETURN 'locked';
  END IF;

  IF org.subscription_status = 'active' AND org.subscription_current_period_end IS NULL THEN
    RETURN 'full';
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
