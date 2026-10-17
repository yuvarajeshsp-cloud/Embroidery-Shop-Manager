-- v3.7: live production board.
--
-- 1. orders.status_changed_at / status_changed_by — when an order last moved to
--    its current stage and who moved it. Set by a trigger from the signed-in
--    user, so it is right whichever screen (or device) made the change. The
--    board shows the editor's initials on the card.
-- 2. orders joins the realtime publication so every open board hears about a
--    change straight away. Realtime follows the table's row-level security,
--    so a person only hears about their own shop's orders.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Best available history for orders that already exist.
UPDATE orders
SET status_changed_at = COALESCE(updated_at, created_at),
    status_changed_by = COALESCE(updated_by, created_by)
WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.track_order_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    NEW.status_changed_at := now();
    NEW.status_changed_by := (SELECT id FROM user_profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_order_stage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_track_order_stage ON orders;
CREATE TRIGGER trg_track_order_stage
  BEFORE INSERT OR UPDATE OF order_status ON orders
  FOR EACH ROW EXECUTE FUNCTION track_order_stage();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END
$$;
