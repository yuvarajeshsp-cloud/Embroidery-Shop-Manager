-- Urgent fix: organization_access_level() only looked at trial_ends_at /
-- subscription_current_period_end / comp_access_until, ignoring
-- subscription_status entirely. "Paavai Embroidery" (the real production
-- org) has subscription_status = 'active' but subscription_current_period_end
-- is NULL (it predates Razorpay integration — 'active' was set by hand as a
-- placeholder). With the old logic that computed as 'locked', which would
-- have cut off the real business's own data. An org marked 'active' with no
-- period_end yet is grandfathered as full access until a real period_end is
-- set by a webhook/verify call.
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
