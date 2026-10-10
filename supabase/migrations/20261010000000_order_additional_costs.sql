-- v3.2: additional costs on an order
--
-- An order can carry any number of extra charges (delivery, packaging, rush
-- fee …) on top of its items. Each has a type — picked from a list the shop
-- configures (config category 'additional_cost_type') or typed in freely — an
-- optional note and an amount. They are added to the order total.

CREATE TABLE order_additional_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (length(btrim(cost_type)) > 0),
  notes text,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_additional_costs_order ON order_additional_costs(order_id);
CREATE INDEX idx_order_additional_costs_org ON order_additional_costs(organization_id);

CREATE TRIGGER trg_stamp_organization_id
  BEFORE INSERT ON order_additional_costs
  FOR EACH ROW EXECUTE FUNCTION stamp_organization_id();

ALTER TABLE order_additional_costs ENABLE ROW LEVEL SECURITY;

-- Same access rules as the order's items.
CREATE POLICY org_select ON order_additional_costs FOR SELECT TO authenticated
  USING (organization_id = current_org_id() AND organization_access_level() <> 'locked');
CREATE POLICY org_insert ON order_additional_costs FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
CREATE POLICY org_update ON order_additional_costs FOR UPDATE TO authenticated
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id() AND organization_access_level() = 'full');
CREATE POLICY org_delete ON order_additional_costs FOR DELETE TO authenticated
  USING (organization_id = current_org_id() AND organization_access_level() = 'full');

GRANT SELECT, INSERT, UPDATE, DELETE ON order_additional_costs TO authenticated;

-- Starter list of cost types for every existing shop (additive).
INSERT INTO config_items (organization_id, category, name, sort_order)
SELECT o.id, 'additional_cost_type', t.name, t.ord
FROM organizations o
CROSS JOIN (VALUES
  ('Delivery / Courier', 1), ('Packaging', 2), ('Rush Charge', 3),
  ('Extra Material', 4), ('Design Change', 5), ('Other', 6)
) AS t(name, ord)
ON CONFLICT (organization_id, category, name) DO NOTHING;

-- New shops (and "apply shop type") get the same list.
CREATE OR REPLACE FUNCTION public.apply_shop_type(p_shop_type text, p_replace boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := current_org_id();
  v_added integer := 0;
  v_rows integer;
  v_cat text;
  v_has_orders boolean;
  v_has_expenses boolean;
  v_has_customers boolean;
  v_replace_ok boolean;
  v_sensitive text[] := ARRAY['Salary', 'Wages'];
  v_preset jsonb;
  v_common jsonb := jsonb_build_object(
    'payment_method', jsonb_build_array('Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit', 'Other'),
    'sales_channel', jsonb_build_array('Walk-in', 'Phone', 'WhatsApp', 'Instagram', 'Referral', 'Regular customer'),
    'additional_cost_type', jsonb_build_array('Delivery / Courier', 'Packaging', 'Rush Charge', 'Extra Material', 'Design Change', 'Other')
  );
  v_name text;
  v_i integer;
  v_base integer;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Only an Administrator can change the shop type' USING ERRCODE = '42501';
  END IF;
  IF p_shop_type NOT IN ('embroidery', 'tailor', 'boutique', 'mixed') THEN
    RAISE EXCEPTION 'Unknown shop type %', p_shop_type USING ERRCODE = '22023';
  END IF;

  v_preset := CASE p_shop_type
    WHEN 'embroidery' THEN jsonb_build_object(
      'order_status', jsonb_build_array('Quotation', 'Design', 'Sample / Approval', 'Confirmed', 'In Production', 'Finishing / QC', 'Ready', 'Delivered', 'On Hold', 'Cancelled'),
      'production_board_stage', jsonb_build_array('Quotation', 'Design', 'Sample / Approval', 'Confirmed', 'In Production', 'Finishing / QC', 'Ready', 'Delivered'),
      'product_type', jsonb_build_array('T-Shirt', 'Shirt', 'Cap', 'Jacket', 'Uniform', 'Patch/Badge', 'Bag', 'Fabric', 'Other'),
      'expense_category', jsonb_build_array('Shop Expense', 'Salary', 'Rent', 'EB Bill', 'Thread & Needles', 'Machine Repair', 'Others'),
      'customer_type', jsonb_build_array('Retail', 'Wholesale', 'Reseller', 'Direct Customer', 'Designer/Boutique', 'School/College'))
    WHEN 'tailor' THEN jsonb_build_object(
      'order_status', jsonb_build_array('Enquiry', 'Measurement Taken', 'Fabric Received', 'Cutting', 'Stitching', 'Trial / Fitting', 'Alteration', 'Ready', 'Delivered', 'On Hold', 'Cancelled'),
      'production_board_stage', jsonb_build_array('Enquiry', 'Measurement Taken', 'Fabric Received', 'Cutting', 'Stitching', 'Trial / Fitting', 'Alteration', 'Ready', 'Delivered'),
      'product_type', jsonb_build_array('Blouse', 'Salwar / Churidar', 'Kurta', 'Shirt', 'Trousers / Pant', 'Skirt', 'Gown / Dress', 'Saree Fall & Pico', 'Uniform', 'Alteration', 'Other'),
      'expense_category', jsonb_build_array('Shop Expense', 'Wages', 'Rent', 'EB Bill', 'Fabric / Material', 'Thread & Accessories', 'Machine Repair', 'Others'),
      'customer_type', jsonb_build_array('Walk-in', 'Regular', 'Boutique', 'Uniform / Institution', 'Wholesale'))
    WHEN 'boutique' THEN jsonb_build_object(
      'order_status', jsonb_build_array('Design Finalised', 'Measurement Taken', 'Material Purchased', 'Embroidery / Work', 'Stitching', 'Trial / Fitting', 'Finishing', 'Ready', 'Delivered', 'On Hold', 'Cancelled'),
      'production_board_stage', jsonb_build_array('Design Finalised', 'Measurement Taken', 'Material Purchased', 'Embroidery / Work', 'Stitching', 'Trial / Fitting', 'Finishing', 'Ready', 'Delivered'),
      'product_type', jsonb_build_array('Blouse', 'Bridal Blouse', 'Saree (work)', 'Lehenga', 'Kurti / Salwar Set', 'Gown / Dress', 'Kids Wear', 'Alteration', 'Other'),
      'expense_category', jsonb_build_array('Shop Expense', 'Salary', 'Rent', 'EB Bill', 'Fabric / Material', 'Laces & Accessories', 'Outsourced Work', 'Packaging', 'Others'),
      'customer_type', jsonb_build_array('Walk-in', 'Regular', 'Bridal / Wedding', 'Corporate', 'Wholesale'))
    ELSE jsonb_build_object(
      'order_status', jsonb_build_array('Enquiry', 'Design', 'Quotation', 'Confirmed', 'Material Received', 'In Production', 'Trial / Fitting', 'Ready', 'Delivered', 'On Hold', 'Cancelled'),
      'production_board_stage', jsonb_build_array('Enquiry', 'Design', 'Quotation', 'Confirmed', 'Material Received', 'In Production', 'Trial / Fitting', 'Ready', 'Delivered'),
      'product_type', jsonb_build_array('Blouse', 'Shirt', 'T-Shirt', 'Kurta', 'Uniform', 'Cap', 'Bag', 'Patch/Badge', 'Alteration', 'Other'),
      'expense_category', jsonb_build_array('Shop Expense', 'Salary', 'Rent', 'EB Bill', 'Fabric / Material', 'Thread & Accessories', 'Outsourced Work', 'Others'),
      'customer_type', jsonb_build_array('Walk-in', 'Regular', 'Retail', 'Wholesale', 'Reseller', 'Boutique', 'Institution'))
  END;
  v_preset := v_preset || v_common;

  SELECT EXISTS (SELECT 1 FROM orders WHERE organization_id = v_org) INTO v_has_orders;
  SELECT EXISTS (SELECT 1 FROM expenses WHERE organization_id = v_org) INTO v_has_expenses;
  SELECT EXISTS (SELECT 1 FROM customers WHERE organization_id = v_org) INTO v_has_customers;

  FOR v_cat IN SELECT jsonb_object_keys(v_preset) LOOP
    -- Replace the starter list only when nothing in the shop refers to it yet.
    v_replace_ok := p_replace AND CASE v_cat
      WHEN 'expense_category' THEN NOT v_has_expenses
      WHEN 'customer_type' THEN NOT v_has_customers
      ELSE NOT v_has_orders
    END;
    IF v_replace_ok THEN
      DELETE FROM config_items WHERE organization_id = v_org AND category = v_cat;
    END IF;

    -- Entries added to a list that is being kept go after what is already
    -- there, in the preset's own order, instead of interleaving with it.
    SELECT COALESCE(MAX(sort_order), 0) INTO v_base
    FROM config_items WHERE organization_id = v_org AND category = v_cat;
    v_i := 0;
    FOR v_name IN SELECT jsonb_array_elements_text(v_preset -> v_cat) LOOP
      v_i := v_i + 1;
      INSERT INTO config_items (organization_id, category, name, sort_order, is_sensitive)
      VALUES (v_org, v_cat, v_name, v_base + v_i, v_cat = 'expense_category' AND v_name = ANY (v_sensitive))
      ON CONFLICT (organization_id, category, name) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_added := v_added + v_rows;
    END LOOP;
  END LOOP;

  INSERT INTO business_settings (organization_id, key, value)
  VALUES (v_org, 'shop_type', p_shop_type)
  ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN v_added;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_shop_type(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_shop_type(text, boolean) TO authenticated;
