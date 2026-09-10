
/*
# v2 — per-org uniqueness + default config for new shops

Two problems, both from the same root cause: several UNIQUE constraints
predate multi-tenancy and were never widened to include organization_id.

1. `config_items(category, name)` and `business_settings(key)` are unique
   *globally* — only one organization in the entire system could ever have
   an order_status called "Design" or a business_settings row keyed
   "company_name". Every other org's config/profile save would fail outright.

2. `customers.customer_code`, `orders.order_number`, and
   `payments.payment_number` are unique *globally* too. Every new org's
   number sequence starts back at 1 (CUST-1001, order #0001, ...) since the
   sequence lookup is already correctly scoped to *their own* rows by RLS —
   which means the very first customer or order a second organization ever
   creates collides with whichever org already holds that number, and (since
   the retry logic just re-queries the same, still-empty-for-them sequence)
   retrying doesn't help. This would have silently broken account #2 in the
   product entirely.

Both are fixed the same way: widen the unique constraint to include
organization_id. Then, since config_items/business_settings can safely be
duplicated per org now, seed every new organization with the same defaults
Paavai Embroidery started with, via a trigger — so a founder signing up
today doesn't land on empty dropdowns everywhere.
*/

-- ============================================================
-- FIX: the auto-stamp trigger from the previous migration unconditionally
-- overwrote organization_id with current_org_id() on every insert. Fine for
-- the app (which never sends organization_id itself), but it clobbers a
-- correct, explicit value from trusted server-side code — migrations and
-- the seed_organization_defaults() function below run with no authenticated
-- session, so current_org_id() there is NULL. Only stamp when unset.
-- ============================================================

CREATE OR REPLACE FUNCTION public.stamp_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- WIDEN UNIQUE CONSTRAINTS TO INCLUDE organization_id
-- ============================================================

ALTER TABLE config_items DROP CONSTRAINT IF EXISTS config_items_category_name_key;
ALTER TABLE config_items ADD CONSTRAINT config_items_org_category_name_key UNIQUE (organization_id, category, name);

ALTER TABLE business_settings DROP CONSTRAINT IF EXISTS business_settings_key_key;
ALTER TABLE business_settings ADD CONSTRAINT business_settings_org_key_key UNIQUE (organization_id, key);

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_code_key;
ALTER TABLE customers ADD CONSTRAINT customers_org_customer_code_key UNIQUE (organization_id, customer_code);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
ALTER TABLE orders ADD CONSTRAINT orders_org_order_number_key UNIQUE (organization_id, order_number);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_number_key;
ALTER TABLE payments ADD CONSTRAINT payments_org_payment_number_key UNIQUE (organization_id, payment_number);

-- ============================================================
-- DEFAULT CONFIG FOR A NEW ORGANIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_organization_defaults(org_id uuid, org_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO config_items (organization_id, category, name, sort_order) VALUES
    (org_id, 'order_status', 'Design', 1),
    (org_id, 'order_status', 'Quotation', 2),
    (org_id, 'order_status', 'Confirmed', 3),
    (org_id, 'order_status', 'In Production', 4),
    (org_id, 'order_status', 'Ready', 5),
    (org_id, 'order_status', 'Delivered', 6),
    (org_id, 'order_status', 'On Hold', 7),
    (org_id, 'order_status', 'Cancelled', 8),
    (org_id, 'production_board_stage', 'Design', 1),
    (org_id, 'production_board_stage', 'Quotation', 2),
    (org_id, 'production_board_stage', 'Confirmed', 3),
    (org_id, 'production_board_stage', 'In Production', 4),
    (org_id, 'production_board_stage', 'Ready', 5),
    (org_id, 'production_board_stage', 'Delivered', 6),
    (org_id, 'payment_status', 'Unpaid', 1),
    (org_id, 'payment_status', 'Part Paid', 2),
    (org_id, 'payment_status', 'Paid', 3),
    (org_id, 'payment_status', 'Refunded', 4),
    (org_id, 'priority', 'Low', 1),
    (org_id, 'priority', 'Normal', 2),
    (org_id, 'priority', 'High', 3),
    (org_id, 'priority', 'Urgent', 4),
    (org_id, 'payment_method', 'Cash', 1),
    (org_id, 'payment_method', 'UPI', 2),
    (org_id, 'payment_method', 'Credit', 3),
    (org_id, 'payment_method', 'Other', 4),
    (org_id, 'customer_type', 'Retail', 1),
    (org_id, 'customer_type', 'Wholesale', 2),
    (org_id, 'customer_type', 'Reseller', 3),
    (org_id, 'customer_type', 'Direct Customer', 4),
    (org_id, 'product_type', 'T-Shirt', 1),
    (org_id, 'product_type', 'Shirt', 2),
    (org_id, 'product_type', 'Cap', 3),
    (org_id, 'product_type', 'Jacket', 4),
    (org_id, 'product_type', 'Uniform', 5),
    (org_id, 'product_type', 'Patch/Badge', 6),
    (org_id, 'product_type', 'Bag', 7),
    (org_id, 'product_type', 'Fabric', 8),
    (org_id, 'product_type', 'Other', 9),
    (org_id, 'sales_channel', 'Walk-in', 1),
    (org_id, 'sales_channel', 'Phone', 2),
    (org_id, 'sales_channel', 'WhatsApp', 3),
    (org_id, 'sales_channel', 'Website', 4),
    (org_id, 'sales_channel', 'Referral', 5)
  ON CONFLICT (organization_id, category, name) DO NOTHING;

  INSERT INTO business_settings (organization_id, key, value) VALUES
    (org_id, 'company_name', org_name),
    (org_id, 'currency', 'INR'),
    (org_id, 'default_rate_per_1000_stitches', '10.00'),
    (org_id, 'tax_rate', '0')
  ON CONFLICT (organization_id, key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_organization_defaults(NEW.id, NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_new_organization ON organizations;
CREATE TRIGGER trg_seed_new_organization AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_new_organization();

-- Backfill any organization created before this trigger existed (e.g. test
-- shops created earlier in this session) that has no config yet.
DO $$ DECLARE org RECORD; BEGIN
  FOR org IN SELECT id, name FROM organizations o WHERE NOT EXISTS (
    SELECT 1 FROM config_items ci WHERE ci.organization_id = o.id
  ) LOOP
    PERFORM public.seed_organization_defaults(org.id, org.name);
  END LOOP;
END $$;
