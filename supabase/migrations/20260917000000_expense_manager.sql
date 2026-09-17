
/*
# v2 — Expense Manager

Adds an Expenses module: shop expenses, salary, rent, EB bills, etc.,
each in a configurable category (managed the same way as order statuses
or payment methods on the Configuration page), optionally linked to an
order for per-order expense reporting.

Access restriction: a category like Salary needs to stay invisible to
most staff, not just hidden in the UI — hiding a page doesn't stop
someone from reading the row over the API. So config_items gains an
is_sensitive flag or restricted for a category. An expense stamps
is_sensitive onto itself at write time from its category's current
flag, and RLS uses that stamped column directly on every
select/insert/update/delete: non-admins simply never see rows for a
sensitive category — no separate "can this role see this" logic
scattered through the app, one rule enforced in the database.
*/

-- ============================================================
-- config_items — which categories are sensitive
-- ============================================================

ALTER TABLE config_items ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expense_number text NOT NULL,
  category text NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT current_date,
  description text,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_org_expense_number_key UNIQUE (organization_id, expense_number)
);

CREATE INDEX IF NOT EXISTS idx_expenses_order ON expenses(order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(organization_id, category);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON expenses;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

-- Stamp is_sensitive from the category's current config_items flag, so RLS
-- never has to join out to config_items on every row check, and an
-- expense's sensitivity reflects what its category actually was at the
-- time — reclassifying a category later doesn't silently change access to
-- expenses already written under the old classification.
CREATE OR REPLACE FUNCTION public.stamp_expense_sensitivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(is_sensitive, false) INTO NEW.is_sensitive
  FROM config_items
  WHERE organization_id = NEW.organization_id
    AND category = 'expense_category'
    AND name = NEW.category
  LIMIT 1;
  IF NOT FOUND THEN
    NEW.is_sensitive := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_expense_sensitivity ON expenses;
CREATE TRIGGER trg_stamp_expense_sensitivity BEFORE INSERT OR UPDATE OF category ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_expense_sensitivity();

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Reads/writes: any active org member, EXCEPT rows stamped sensitive are
-- Administrator-only in every direction (select/insert/update/delete).
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND (NOT is_sensitive OR public.is_admin()));

-- The stamp_expense_sensitivity BEFORE trigger runs before WITH CHECK is
-- evaluated, so is_sensitive here already reflects NEW.category — no need
-- to re-derive it from config_items again in the policy itself.
CREATE POLICY "expenses_insert" ON expenses FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('Administrator', 'Manager', 'Accounts')
    AND (NOT is_sensitive OR public.is_admin())
  );

CREATE POLICY "expenses_update" ON expenses FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (NOT is_sensitive OR public.is_admin()))
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.current_user_role() IN ('Administrator', 'Manager', 'Accounts')
    AND (NOT is_sensitive OR public.is_admin())
  );

CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (NOT is_sensitive OR public.is_admin()) AND public.is_admin_or_manager());

-- ============================================================
-- Seed an "expense_category" config list for every existing org, and fold
-- it into seed_organization_defaults() so future orgs get it too. Salary
-- ships marked sensitive by default — the same example the product owner
-- asked to restrict.
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

  INSERT INTO config_items (organization_id, category, name, sort_order, is_sensitive) VALUES
    (org_id, 'expense_category', 'Shop Expense', 1, false),
    (org_id, 'expense_category', 'Salary', 2, true),
    (org_id, 'expense_category', 'Rent', 3, false),
    (org_id, 'expense_category', 'EB Bill', 4, false),
    (org_id, 'expense_category', 'Others', 5, false)
  ON CONFLICT (organization_id, category, name) DO NOTHING;

  INSERT INTO business_settings (organization_id, key, value) VALUES
    (org_id, 'company_name', org_name),
    (org_id, 'currency', 'INR'),
    (org_id, 'default_rate_per_1000_stitches', '10.00'),
    (org_id, 'tax_rate', '0')
  ON CONFLICT (organization_id, key) DO NOTHING;
END;
$$;

-- One-time backfill: give every existing org the expense_category list if
-- it doesn't already have one (mirrors the config_items backfill pattern
-- used when other new categories were introduced).
DO $$
DECLARE org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    IF NOT EXISTS (SELECT 1 FROM config_items WHERE organization_id = org.id AND category = 'expense_category') THEN
      INSERT INTO config_items (organization_id, category, name, sort_order, is_sensitive) VALUES
        (org.id, 'expense_category', 'Shop Expense', 1, false),
        (org.id, 'expense_category', 'Salary', 2, true),
        (org.id, 'expense_category', 'Rent', 3, false),
        (org.id, 'expense_category', 'EB Bill', 4, false),
        (org.id, 'expense_category', 'Others', 5, false)
      ON CONFLICT (organization_id, category, name) DO NOTHING;
    END IF;
  END LOOP;
END $$;
