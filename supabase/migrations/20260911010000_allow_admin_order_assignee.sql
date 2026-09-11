
-- v2 — orders can also be assigned to an Administrator, not just a
-- Manager or Operator. A small shop's Administrator is often also the one
-- doing the work, so the assignee list should include them.

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
      WHERE id = NEW.assigned_to AND role IN ('Administrator', 'Manager', 'Operator') AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Orders can only be assigned to an active Administrator, Manager, or Operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
