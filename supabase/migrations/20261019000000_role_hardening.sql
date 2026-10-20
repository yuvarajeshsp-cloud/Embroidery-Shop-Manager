-- v3.8: make the database enforce what the screens already promise.
--
-- 1. The discount consistency check let "a discount amount with no type"
--    through (a NULL result passes a CHECK). It now rejects it.
-- 2. Payments, customers, order items and extra costs could be written by any
--    signed-in staff role, including Operators, whose screens don't even show
--    Payments or Customers. Writing them now needs Administrator, Manager or
--    Accounts. Reading is unchanged.
-- 3. Creating an order needs Administrator or Manager (the screens only offer
--    New Order to them).
-- 4. An Operator may still move an order through its stages, but any other
--    change to an order (prices, discount, customer, dates…) is refused.
--
-- Nothing here touches existing rows.

-- 1 ----------------------------------------------------------------------------
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_consistent;
ALTER TABLE orders ADD CONSTRAINT orders_discount_consistent CHECK (
  COALESCE(
    (discount_type IS NULL AND discount_value = 0)
    OR discount_type = 'amount'
    OR (discount_type = 'percent' AND discount_value <= 100),
    false
  )
);

-- 2 ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  roles constant text := $r$current_user_role() = ANY (ARRAY['Administrator'::text, 'Manager'::text, 'Accounts'::text])$r$;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'payments', 'order_items', 'order_additional_costs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (organization_id = current_org_id() AND organization_access_level() = ''full'' AND %s)',
      t, roles);
    EXECUTE format(
      'CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (organization_id = current_org_id() AND %s) WITH CHECK (organization_id = current_org_id() AND organization_access_level() = ''full'' AND %s)',
      t, roles, roles);
    EXECUTE format(
      'CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (organization_id = current_org_id() AND organization_access_level() = ''full'' AND %s)',
      t, roles);
  END LOOP;
END
$$;

-- 3 ----------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = current_org_id()
    AND organization_access_level() = 'full'
    AND current_user_role() = ANY (ARRAY['Administrator'::text, 'Manager'::text])
  );

-- 4 ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_operator_order_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed constant text[] := ARRAY['order_status', 'actual_delivery_date', 'status_changed_at', 'status_changed_by', 'updated_at', 'updated_by'];
BEGIN
  IF current_user_role() = 'Operator'
     AND (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Operators can only change an order''s production stage' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restrict_operator_order_edits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_restrict_operator_order_edits ON public.orders;
CREATE TRIGGER trg_restrict_operator_order_edits
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restrict_operator_order_edits();
