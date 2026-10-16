-- v3.6: a discount on an order.
--
-- One discount per order, either a fixed amount or a percentage. A percentage
-- is taken from the item prices only (not setup charges or extra costs); an
-- amount comes off the whole order. The discount can never push the total
-- below zero (that cap is applied where totals are worked out). The reason is
-- picked from a configurable list (config category 'discount_reason').
--
-- Adding columns with defaults changes nothing for existing orders: no
-- discount_type means no discount.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('amount', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_reason text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_consistent;
ALTER TABLE orders ADD CONSTRAINT orders_discount_consistent
  CHECK ((discount_type IS NULL AND discount_value = 0) OR (discount_type = 'amount') OR (discount_type = 'percent' AND discount_value <= 100));

-- Starter reasons for every existing shop (additive).
INSERT INTO config_items (organization_id, category, name, sort_order)
SELECT o.id, 'discount_reason', t.name, t.ord
FROM organizations o
CROSS JOIN (VALUES
  ('Festival offer', 1), ('Regular customer', 2), ('Bulk order', 3),
  ('Referral', 4), ('Delay compensation', 5), ('Other', 6)
) AS t(name, ord)
ON CONFLICT (organization_id, category, name) DO NOTHING;

-- New shops (and "apply shop type") get the same list.
CREATE OR REPLACE FUNCTION public.apply_shop_type(p_shop_type text, p_replace boolean DEFAULT false, p_hide_others boolean DEFAULT false)
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
    'additional_cost_type', jsonb_build_array('Delivery / Courier', 'Packaging', 'Rush Charge', 'Extra Material', 'Design Change', 'Other'),
    'discount_reason', jsonb_build_array('Festival offer', 'Regular customer', 'Bulk order', 'Referral', 'Delay compensation', 'Other')
  );
  v_name text;
  v_i integer;
  v_base integer;
  v_hidden integer;
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

  -- Optionally hide (never delete) entries that are not part of this shop type,
  -- so the order form only offers this trade's lists. Anything an existing
  -- record still uses stays visible, and Delivered / Cancelled always do —
  -- otherwise orders in progress would vanish from the board.
  IF p_hide_others THEN
    FOR v_cat IN SELECT unnest(ARRAY['order_status', 'production_board_stage', 'product_type', 'customer_type', 'expense_category']) LOOP
      UPDATE config_items c
      SET is_active = false, updated_at = now()
      WHERE c.organization_id = v_org
        AND c.category = v_cat
        AND c.is_active
        AND NOT (v_preset -> v_cat) ? c.name
        AND c.name NOT IN ('Delivered', 'Cancelled')
        AND NOT CASE v_cat
          WHEN 'order_status' THEN EXISTS (SELECT 1 FROM orders o WHERE o.organization_id = v_org AND o.order_status = c.name)
          WHEN 'production_board_stage' THEN EXISTS (SELECT 1 FROM orders o WHERE o.organization_id = v_org AND o.order_status = c.name)
          WHEN 'product_type' THEN EXISTS (SELECT 1 FROM order_items i WHERE i.organization_id = v_org AND i.product_type = c.name)
          WHEN 'customer_type' THEN EXISTS (SELECT 1 FROM customers cu WHERE cu.organization_id = v_org AND cu.customer_type = c.name)
          WHEN 'expense_category' THEN EXISTS (SELECT 1 FROM expenses e WHERE e.organization_id = v_org AND e.category = c.name)
          ELSE false
        END;
      GET DIAGNOSTICS v_hidden = ROW_COUNT;
      v_added := v_added + v_hidden;
    END LOOP;
  END IF;

  INSERT INTO business_settings (organization_id, key, value)
  VALUES (v_org, 'shop_type', p_shop_type)
  ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN v_added;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_shop_type(text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_shop_type(text, boolean, boolean) TO authenticated;
