
/*
# Remove separate production flow

The production board no longer tracks its own stage/operator state. It now
reflects `orders.order_status` directly, and the stages shown on the board
are configured via the existing `order_status` config_items category
(Configuration → "Production Stages (Order Status)").

1. Drop production_stage_history (child of production_records)
2. Drop production_records
3. Remove the now-unused `production_stage`, `stage_status`, and `operator`
   config_items categories (order_status itself is kept — it now drives
   the board)
*/

DROP TABLE IF EXISTS production_stage_history CASCADE;
DROP TABLE IF EXISTS production_records CASCADE;

DELETE FROM config_items WHERE category IN ('production_stage', 'stage_status', 'operator');
