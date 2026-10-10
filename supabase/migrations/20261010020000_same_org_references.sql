-- v3.4: a row may only reference rows of its own shop.
--
-- Row-level security stops one shop reading or writing another's rows, but a
-- foreign key only checks that the referenced id exists — in any shop. A user
-- could therefore create an order item, payment, order or additional cost
-- pointing at another shop's order/customer/item (and find out by the
-- insert's success or failure whether an id exists). The rows were invisible
-- to the other shop, yet the dangling reference could block that shop from
-- deleting its own record.
--
-- Fix: a trigger on each table checks that every referenced row belongs to the
-- same shop as the row being written. It runs as the caller (not definer), so
-- the lookup is itself subject to row-level security. It must fire after
-- trg_stamp_organization_id, which sets organization_id — trigger names fire
-- in alphabetical order and "trg_validate_…" sorts after "trg_stamp_…".

CREATE OR REPLACE FUNCTION public.enforce_same_org_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  i integer := 0;
  v_ref_table text;
  v_column text;
  v_id uuid;
  v_found integer;
BEGIN
  -- TG_ARGV is pairs: referenced table, column on this row.
  WHILE i + 1 < TG_NARGS LOOP
    v_ref_table := TG_ARGV[i];
    v_column := TG_ARGV[i + 1];
    v_id := (to_jsonb(NEW) ->> v_column)::uuid;
    IF v_id IS NOT NULL THEN
      EXECUTE format('SELECT 1 FROM public.%I WHERE id = $1 AND organization_id = $2', v_ref_table)
        INTO v_found USING v_id, NEW.organization_id;
      IF v_found IS NULL THEN
        RAISE EXCEPTION '% refers to a record that does not belong to this shop', v_column
          USING ERRCODE = '23503';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;

-- An additional cost's item must be an item of the cost's own order.
CREATE OR REPLACE FUNCTION public.enforce_cost_item_in_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE id = NEW.order_item_id AND order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'order_item_id is not an item of this order' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_same_org_references() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_cost_item_in_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_refs ON order_items;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF order_id ON order_items
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('orders', 'order_id');

DROP TRIGGER IF EXISTS trg_validate_refs ON payments;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF order_id, customer_id ON payments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('orders', 'order_id', 'customers', 'customer_id');

DROP TRIGGER IF EXISTS trg_validate_refs ON orders;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF customer_id ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('customers', 'customer_id');

DROP TRIGGER IF EXISTS trg_validate_refs ON expenses;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF order_id ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('orders', 'order_id');

DROP TRIGGER IF EXISTS trg_validate_refs ON order_item_attachments;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF order_item_id ON order_item_attachments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('order_items', 'order_item_id');

DROP TRIGGER IF EXISTS trg_validate_refs ON order_additional_costs;
CREATE TRIGGER trg_validate_refs BEFORE INSERT OR UPDATE OF order_id, order_item_id ON order_additional_costs
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org_references('orders', 'order_id', 'order_items', 'order_item_id');

DROP TRIGGER IF EXISTS trg_validate_item_in_order ON order_additional_costs;
CREATE TRIGGER trg_validate_item_in_order BEFORE INSERT OR UPDATE OF order_id, order_item_id ON order_additional_costs
  FOR EACH ROW EXECUTE FUNCTION enforce_cost_item_in_order();
