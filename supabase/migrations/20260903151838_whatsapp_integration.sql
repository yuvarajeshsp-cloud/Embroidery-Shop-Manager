
/*
# WhatsApp integration

1. customers.whatsapp_opt_in — per-customer preference for receiving
   WhatsApp updates (order status changes, shared documents).
2. whatsapp_templates — local registry of Meta-approved message
   template names/metadata, so operators can pick a template in the
   UI. The templates themselves are approved and defined in Meta
   Business Manager; this table just mirrors their names for
   selection and documents what each one is for.
3. whatsapp_message_log — audit trail of every message the app has
   asked the whatsapp-send Edge Function to deliver.

The actual WhatsApp access token is never stored in the database —
it lives only as a Supabase Edge Function secret (WHATSAPP_ACCESS_TOKEN),
kept out of the client bundle entirely. Non-secret config (phone
number id, business account id, which template to use for what)
reuses the existing business_settings key/value table.
*/

ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  category text NOT NULL DEFAULT 'utility' CHECK (category IN ('utility', 'marketing', 'authentication')),
  language text NOT NULL DEFAULT 'en',
  description text,
  variable_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  message_kind text NOT NULL CHECK (message_kind IN ('status_update', 'invoice', 'design_confirmation', 'customer_material', 'test')),
  template_name text,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message text,
  whatsapp_message_id text,
  sent_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_order ON whatsapp_message_log(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_customer ON whatsapp_message_log(customer_id);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['whatsapp_templates', 'whatsapp_message_log'] LOOP
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
