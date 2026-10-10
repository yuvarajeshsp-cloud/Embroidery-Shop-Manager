-- v3.3: additional costs belong to an item, not to the whole order.
--
-- Each cost now points at the order item it was charged on. The order total is
-- still the sum of everything, and order_id stays on the row so an order's
-- costs can be read in one go. Costs recorded before this change (there were
-- none outside testing) are attached to the order's first item.

ALTER TABLE order_additional_costs
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES order_items(id) ON DELETE CASCADE;

UPDATE order_additional_costs c
SET order_item_id = (
  SELECT i.id FROM order_items i WHERE i.order_id = c.order_id ORDER BY i.item_number LIMIT 1
)
WHERE c.order_item_id IS NULL;

-- An order with no items cannot hold a cost.
DELETE FROM order_additional_costs WHERE order_item_id IS NULL;

ALTER TABLE order_additional_costs ALTER COLUMN order_item_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_additional_costs_item ON order_additional_costs(order_item_id);
