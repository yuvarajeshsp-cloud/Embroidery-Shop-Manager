
/*
# Order item attachments

Lets each order item carry its own photos/documents, split into two
categories:
- `material`: customer-supplied fabric/material photos
- `design_confirmation`: design approval images or documents

Files live in the public `order-attachments` storage bucket; this
table stores the metadata row per file, scoped to one order_item.
Access follows the same open anon+authenticated pattern as the rest
of this single-tenant app.
*/

CREATE TABLE order_item_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('material', 'design_confirmation')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size int,
  uploaded_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_item_attachments_item ON order_item_attachments(order_item_id);

ALTER TABLE order_item_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all" ON order_item_attachments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_auth" ON order_item_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_auth" ON order_item_attachments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_auth" ON order_item_attachments FOR DELETE TO anon, authenticated USING (true);

-- Storage bucket for the actual files
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-attachments', 'order-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "order_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "order_attachments_delete" ON storage.objects;

CREATE POLICY "order_attachments_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'order-attachments');
CREATE POLICY "order_attachments_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'order-attachments');
