
/*
# Paavai Embroidery — Revised Schema (configuration-driven)

This migration replaces the initial schema with a configuration-driven model
matching the specification. All dropdown values come from a single `config_items`
table so administrators can add/edit/reorder/deactivate values without code changes.

1. Configuration: config_items, config_stitch_rates, business_settings
2. People: user_profiles, customers
3. Orders: orders, order_items (stitch pricing with manual override)
4. Financials: payments (with payment_status lifecycle)
5. Production: production_records (one active per order), production_stage_history
6. Audit: audit_logs

All tables: RLS enabled, anon + authenticated access (single-tenant).
*/

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS production_stage_history CASCADE;
DROP TABLE IF EXISTS production_tasks CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS config_stitch_rates CASCADE;
DROP TABLE IF EXISTS config_machines CASCADE;
DROP TABLE IF EXISTS config_embroidery_types CASCADE;
DROP TABLE IF EXISTS config_expense_categories CASCADE;
DROP TABLE IF EXISTS config_payment_methods CASCADE;
DROP TABLE IF EXISTS config_product_categories CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS config_items CASCADE;
DROP TABLE IF EXISTS production_records CASCADE;

-- ============================================================
-- CONFIGURATION
-- ============================================================

CREATE TABLE config_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, name)
);

CREATE INDEX idx_config_items_category ON config_items(category, sort_order);

CREATE TABLE config_stitch_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embroidery_type text NOT NULL,
  rate_per_1000_stitches numeric(10,4) NOT NULL DEFAULT 10.0000,
  min_stitches int,
  max_stitches int,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PEOPLE
-- ============================================================

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'Operator' CHECK (role IN ('Administrator', 'Manager', 'Operator', 'Accounts')),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text UNIQUE NOT NULL,
  customer_business_name text NOT NULL,
  contact_person text,
  phone text,
  whatsapp text,
  email text,
  billing_address text,
  delivery_address text,
  customer_type text NOT NULL DEFAULT 'Retail',
  gst_tax_number text,
  date_added date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_by uuid REFERENCES user_profiles(id)
);

CREATE INDEX idx_customers_code ON customers(customer_code);
CREATE INDEX idx_customers_name ON customers(customer_business_name);
CREATE INDEX idx_customers_type ON customers(customer_type);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  required_date date,
  priority text NOT NULL DEFAULT 'Normal',
  order_status text NOT NULL DEFAULT 'Quotation',
  actual_delivery_date date,
  customer_po_reference text,
  sales_channel text,
  special_instructions text,
  internal_notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_by uuid REFERENCES user_profiles(id)
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_required_date ON orders(required_date);
CREATE INDEX idx_orders_archived ON orders(archived);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_number int NOT NULL DEFAULT 1,
  product_type text NOT NULL DEFAULT 'Other',
  product_description text,
  design_name_number text,
  size_placement text,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  stitches_per_unit int NOT NULL DEFAULT 0 CHECK (stitches_per_unit >= 0),
  rate_per_1000_stitches numeric(10,4) NOT NULL DEFAULT 10.0000,
  manual_unit_price numeric(10,2),
  setup_digitizing_charge numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  payment_method text NOT NULL DEFAULT 'Cash',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  transaction_reference text,
  notes text,
  payment_status text NOT NULL DEFAULT 'Completed' CHECK (payment_status IN ('Completed', 'Pending', 'Reversed', 'Refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_by uuid REFERENCES user_profiles(id)
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_status ON payments(payment_status);

-- ============================================================
-- PRODUCTION
-- ============================================================

CREATE TABLE production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  assigned_operator text NOT NULL DEFAULT 'Unassigned',
  overall_stage text NOT NULL DEFAULT 'Not Scheduled',
  design_received_date date,
  digitizing_status text NOT NULL DEFAULT 'Not Started',
  digitizing_date date,
  sampling_status text NOT NULL DEFAULT 'Not Started',
  sample_approval_date date,
  production_status text NOT NULL DEFAULT 'Not Started',
  production_start_date date,
  production_complete_date date,
  qc_status text NOT NULL DEFAULT 'Not Started',
  packing_status text NOT NULL DEFAULT 'Not Started',
  delivery_status text NOT NULL DEFAULT 'Not Started',
  remarks text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES user_profiles(id)
);

CREATE INDEX idx_production_order ON production_records(order_id);
CREATE INDEX idx_production_stage ON production_records(overall_stage);
CREATE INDEX idx_production_operator ON production_records(assigned_operator);

CREATE TABLE production_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL REFERENCES production_records(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  previous_value text,
  new_value text,
  changed_by uuid REFERENCES user_profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX idx_stage_history_production ON production_stage_history(production_id);

-- ============================================================
-- AUDIT
-- ============================================================

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  user_name text,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_logs(changed_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE config_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_stitch_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'config_items','config_stitch_rates','business_settings',
    'customers','orders','order_items','payments',
    'production_records','production_stage_history','audit_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "select_all" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "insert_auth" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "update_auth" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "delete_auth" ON %I', tbl);
    EXECUTE format('CREATE POLICY "select_all" ON %I FOR SELECT TO anon, authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "insert_auth" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "update_auth" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "delete_auth" ON %I FOR DELETE TO anon, authenticated USING (true)', tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON user_profiles;
CREATE POLICY "select_all_profiles" ON user_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_own_profile" ON user_profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_own_profile" ON user_profiles FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SEED CONFIGURATION DATA
-- ============================================================

INSERT INTO config_items (category, name, sort_order) VALUES
  ('order_status', 'Design', 1),
  ('order_status', 'Quotation', 2),
  ('order_status', 'Confirmed', 3),
  ('order_status', 'In Production', 4),
  ('order_status', 'Ready', 5),
  ('order_status', 'Delivered', 6),
  ('order_status', 'On Hold', 7),
  ('order_status', 'Cancelled', 8),
  ('payment_status', 'Unpaid', 1),
  ('payment_status', 'Part Paid', 2),
  ('payment_status', 'Paid', 3),
  ('payment_status', 'Refunded', 4),
  ('priority', 'Low', 1),
  ('priority', 'Normal', 2),
  ('priority', 'High', 3),
  ('priority', 'Urgent', 4),
  ('production_stage', 'Not Scheduled', 1),
  ('production_stage', 'Digitizing', 2),
  ('production_stage', 'Confirmation', 3),
  ('production_stage', 'Production', 4),
  ('production_stage', 'Quality Check', 5),
  ('production_stage', 'Ready for Delivery', 6),
  ('production_stage', 'Delivered', 7),
  ('stage_status', 'Not Started', 1),
  ('stage_status', 'In Progress', 2),
  ('stage_status', 'Waiting', 3),
  ('stage_status', 'Completed', 4),
  ('stage_status', 'Not Required', 5),
  ('payment_method', 'Cash', 1),
  ('payment_method', 'UPI', 2),
  ('payment_method', 'Credit', 3),
  ('payment_method', 'Other', 4),
  ('customer_type', 'Retail', 1),
  ('customer_type', 'School/College', 2),
  ('customer_type', 'Designer/Boutique', 3),
  ('customer_type', 'Reseller', 4),
  ('customer_type', 'Direct Customer', 5),
  ('product_type', 'T-Shirt', 1),
  ('product_type', 'Shirt', 2),
  ('product_type', 'Cap', 3),
  ('product_type', 'Jacket', 4),
  ('product_type', 'Uniform', 5),
  ('product_type', 'Patch/Badge', 6),
  ('product_type', 'Bag', 7),
  ('product_type', 'Fabric', 8),
  ('product_type', 'Other', 9),
  ('operator', 'Unassigned', 1),
  ('operator', 'Yuvarani', 2),
  ('operator', 'Bathma', 3)
ON CONFLICT (category, name) DO NOTHING;

INSERT INTO business_settings (key, value) VALUES
  ('business_name', 'Paavai Embroidery'),
  ('currency', 'INR'),
  ('default_rate_per_1000_stitches', '10.00'),
  ('tax_rate', '0')
ON CONFLICT (key) DO NOTHING;
