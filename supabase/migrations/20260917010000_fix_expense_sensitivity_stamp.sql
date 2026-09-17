
/*
# v2 — fix: expense sensitivity was never actually stamped

Postgres fires same-event BEFORE ROW triggers in alphabetical order by
trigger name, not creation order. "trg_stamp_expense_sensitivity" sorts
before "trg_stamp_organization_id" (e < o), so the sensitivity trigger ran
first, while NEW.organization_id was still NULL — its config_items lookup
matched nothing and every expense silently stamped is_sensitive = false,
regardless of its category. Confirmed directly: a Salary expense (whose
config_items row has is_sensitive = true) came back false.

Fix: don't depend on trigger firing order at all. Fall back to
current_org_id() when NEW.organization_id isn't set yet, the same source
stamp_organization_id() itself uses.
*/

CREATE OR REPLACE FUNCTION public.stamp_expense_sensitivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
BEGIN
  org_id := COALESCE(NEW.organization_id, public.current_org_id());

  SELECT COALESCE(is_sensitive, false) INTO NEW.is_sensitive
  FROM config_items
  WHERE organization_id = org_id
    AND category = 'expense_category'
    AND name = NEW.category
  LIMIT 1;
  IF NOT FOUND THEN
    NEW.is_sensitive := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill the one expense created while this bug was live.
UPDATE expenses e
SET is_sensitive = COALESCE(c.is_sensitive, false)
FROM config_items c
WHERE c.organization_id = e.organization_id
  AND c.category = 'expense_category'
  AND c.name = e.category
  AND e.is_sensitive IS DISTINCT FROM c.is_sensitive;
