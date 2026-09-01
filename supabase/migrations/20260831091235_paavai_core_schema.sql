
/*
# Paavai Embroidery Business Manager — Core Schema

This migration creates the complete database structure for the Paavai Embroidery
business management system. It handles customers, orders, order items, payments,
production tracking, configuration tables, audit logging, and user profiles.

1. Configuration Tables
   - `config_product_categories` — categories like Sarees, Dress Materials, etc.
   - `config_embroidery_types` — types of embroidery work (Zari, Thread, etc.)
   - `config_machines` — machine inventory with capacity
   - `config_stitch_rates` — per-stitch pricing rates by embroidery type
   - `config_expense_categories` — expense classification
   - `config_payment_methods` — cash, bank transfer, UPI, etc.

2. People
   - `user_profiles` — extended profiles for authenticated users with roles
   - `customers` — customer master with type (retail/wholesale/dealer)

3. Orders
   - `orders` — master order with status, priority, due date
   - `order_items` — individual line items with design, stitch count, pricing

4. Financials
   - `payments` — customer payments linked to orders
   - `expenses` — business expenses

5. Production
   - `production_tasks` — tasks linked to order items with assignment + progress

6. Audit
   - `audit_logs` — immutable change log

All tables: RLS enabled, anon + authenticated access (single-tenant app, no per-user isolation required).
*/

-- ============================================================
-- CONFIG TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS config_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_embroidery_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code text NOT NULL UNIQUE,
  name text NOT NULL,
  machine_type text NOT NULL DEFAULT 'Embroidery',
  capacity_heads int NOT NULL DEFAULT 1,
  location text,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Idle', 'Maintenance', 'Retired')),
  purchase_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_stitch_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embroidery_type_id uuid NOT NULL REFERENCES config_embroidery_types(id),
  rate_per_1000_stitches numeric(10,4) NOT NULL DEFAULT 0,
  min_stitches int,
  max_stitches int,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PEOPLE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff', 'accounts', 'production')),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text UNIQUE,
  name text NOT NULL,
  customer_type text NOT NULL DEFAULT 'Retail' CHECK (customer_type IN ('Retail', 'Wholesale', 'Dealer', 'Corporate')),
  phone text,
  phone2 text,
  email text,
  address text,
  city text,
  state text DEFAULT 'Tamil Nadu',
  pincode text,
  gstin text,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  credit_days int NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  delivery_date date,
  status text NOT NULL DEFAULT 'Quotation' CHECK (status IN ('Design', 'Quotation', 'Confirmed', 'In Production', 'Ready', 'Delivered', 'On Hold', 'Cancelled')),
  priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Urgent', 'High', 'Normal', 'Low')),
  delivery_type text NOT NULL DEFAULT 'Pickup' CHECK (delivery_type IN ('Pickup', 'Courier', 'Hand Delivery')),
  delivery_address text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_status text NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid', 'Refunded')),
  special_instructions text,
  internal_notes text,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_number int NOT NULL DEFAULT 1,
  product_category_id uuid REFERENCES config_product_categories(id),
  embroidery_type_id uuid REFERENCES config_embroidery_types(id),
  description text NOT NULL,
  design_code text,
  color_thread text,
  quantity int NOT NULL DEFAULT 1,
  stitch_count int,
  rate_per_1000 numeric(10,4),
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total_price numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  design_file_url text,
  sample_image_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FINANCIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL,
  payment_method_id uuid REFERENCES config_payment_methods(id),
  payment_method_name text,
  reference_number text,
  notes text,
  is_advance boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL UNIQUE,
  expense_category_id uuid REFERENCES config_expense_categories(id),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method_id uuid REFERENCES config_payment_methods(id),
  payment_method_name text,
  vendor_name text,
  invoice_number text,
  notes text,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTION
-- ============================================================

CREATE TABLE IF NOT EXISTS production_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id),
  order_item_id uuid REFERENCES order_items(id),
  machine_id uuid REFERENCES config_machines(id),
  assigned_to uuid REFERENCES user_profiles(id),
  task_type text NOT NULL DEFAULT 'Embroidery' CHECK (task_type IN ('Embroidery', 'Finishing', 'Checking', 'Packing', 'Other')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Paused', 'Completed', 'Cancelled')),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  quantity_total int NOT NULL DEFAULT 1,
  quantity_done int NOT NULL DEFAULT 0,
  progress_percent numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN quantity_total > 0 THEN LEAST(100, (quantity_done::numeric / quantity_total) * 100) ELSE 0 END
  ) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid REFERENCES user_profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_due_date ON orders(due_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_production_tasks_order ON production_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_production_tasks_status ON production_tasks(status);
CREATE INDEX IF NOT EXISTS idx_production_tasks_machine ON production_tasks(machine_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);

-- ============================================================
-- ROW LEVEL SECURITY — single-tenant, anon + authenticated
-- ============================================================

ALTER TABLE config_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_embroidery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_stitch_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Config tables (public read, authenticated write)
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['config_product_categories','config_embroidery_types','config_machines','config_stitch_rates','config_expense_categories','config_payment_methods'] LOOP
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

-- Business tables (anon + authenticated full access — single-tenant)
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['customers','orders','order_items','payments','expenses','production_tasks','audit_logs'] LOOP
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

-- User profiles
DROP POLICY IF EXISTS "select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON user_profiles;

CREATE POLICY "select_all_profiles" ON user_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_own_profile" ON user_profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_own_profile" ON user_profiles FOR DELETE TO anon, authenticated USING (true);
