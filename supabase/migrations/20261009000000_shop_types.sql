-- v3: shop types (embroidery / tailor / boutique / mixed)
--
-- 1. order_items.pricing_mode — how an item is priced: by stitch count (what
--    every existing item is), per piece, per metre, or a fixed price. The
--    arithmetic is unchanged: pricing other than 'stitch' uses
--    manual_unit_price, which orderItemUnitPrice() already honours.
-- 2. order_items.quantity becomes decimal so a metre-priced item can be 2.5.
-- 3. orders.trial_date / orders.material_received — fitting/trial promise and
--    a note of the customer's fabric or material received.
-- 4. apply_shop_type(shop_type, replace) — records the shop's type and seeds
--    the matching starter lists (statuses, board stages, product types,
--    expense categories, customer types, payment methods, channels).
--    Adds only, unless replace is requested for lists that nothing uses yet
--    (brand-new shops), so an existing shop's data is never rewritten.

ALTER TABLE order_items ALTER COLUMN quantity TYPE numeric(10,2);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'stitch'
  CHECK (pricing_mode IN ('stitch', 'piece', 'metre', 'fixed'));

-- Items that were already priced by hand with no stitch count are piece-priced.
UPDATE order_items
SET pricing_mode = 'piece'
WHERE manual_unit_price IS NOT NULL AND COALESCE(stitches_per_unit, 0) = 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS trial_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS material_received text;

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
    'sales_channel', jsonb_build_array('Walk-in', 'Phone', 'WhatsApp', 'Instagram', 'Referral', 'Regular customer')
  );
  v_name text;
  v_i integer;
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

    v_i := 0;
    FOR v_name IN SELECT jsonb_array_elements_text(v_preset -> v_cat) LOOP
      v_i := v_i + 1;
      INSERT INTO config_items (organization_id, category, name, sort_order, is_sensitive)
      VALUES (v_org, v_cat, v_name, v_i, v_cat = 'expense_category' AND v_name = ANY (v_sensitive))
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
