/*
# Public website — services price list + enquiry leads

The shop's public website (separate repo: paavai-embroidery-web) needs two
things from this database:

1. website_services — the customer-facing "starting from" price list. This is
   deliberately separate from config_stitch_rates: stitch rates are internal
   costing, while the website shows friendly names (in English and Tamil) and
   a rounded starting price. Staff edit it in the app; only rows marked
   is_published are ever visible to the website.

   The website reads it at build time through public_website_services(slug),
   a SECURITY DEFINER function granted to anon that returns published rows
   only — the table itself stays closed to anon, so unpublished drafts and
   other orgs' internals never leak through the REST API.

2. website_leads — enquiries sent from the website's form. They land here,
   not in orders, so a spammed form can never create fake orders; staff
   convert a lead into a customer/order in the app. Leads are written only by
   the website's Netlify function using the service-role key, which sets
   organization_id explicitly (stamp_organization_id() is NOT attached: it
   would overwrite it with current_org_id(), which is null for the service
   role). anon has no access at all.

   The utm_* / fbclid / fbp / fbc / event_id columns keep the ad attribution
   so that, when a lead later becomes an order, the Meta Conversions API
   "Purchase" event can be matched back to the Instagram ad that brought it.
*/

-- ============================================================
-- WEBSITE SERVICES
-- ============================================================

CREATE TABLE IF NOT EXISTS website_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'General',
  name_en text NOT NULL,
  name_ta text,
  description_en text,
  description_ta text,
  starting_price numeric(10,2) CHECK (starting_price IS NULL OR starting_price >= 0),
  price_unit text,
  -- Public image URL (JPG/PNG, at least 500x500) — required for the
  -- website's Instagram/Facebook Shop catalog feed.
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_services_org ON website_services(organization_id, sort_order);

DROP TRIGGER IF EXISTS trg_stamp_organization_id ON website_services;
CREATE TRIGGER trg_stamp_organization_id BEFORE INSERT ON website_services
  FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id();

ALTER TABLE website_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_services_select" ON website_services FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "website_services_insert" ON website_services FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "website_services_update" ON website_services FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager())
  WITH CHECK (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE POLICY "website_services_delete" ON website_services FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());

CREATE OR REPLACE FUNCTION public.public_website_services(org_slug text)
RETURNS TABLE (
  category text,
  name_en text,
  name_ta text,
  description_en text,
  description_ta text,
  starting_price numeric,
  price_unit text,
  image_url text,
  sort_order int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.category, s.name_en, s.name_ta, s.description_en, s.description_ta,
         s.starting_price, s.price_unit, s.image_url, s.sort_order
  FROM website_services s
  JOIN organizations o ON o.id = s.organization_id
  WHERE o.slug = org_slug AND s.is_published
  ORDER BY s.sort_order, s.name_en;
$$;

REVOKE ALL ON FUNCTION public.public_website_services(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_website_services(text) TO anon, authenticated;

-- ============================================================
-- WEBSITE LEADS
-- ============================================================

CREATE TABLE IF NOT EXISTS website_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  service text,
  message text,
  preferred_date date,
  language text,
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Converted', 'Closed')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  source_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbclid text,
  fbp text,
  fbc text,
  event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_leads_org ON website_leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_leads_status ON website_leads(organization_id, status);

ALTER TABLE website_leads ENABLE ROW LEVEL SECURITY;

-- No INSERT policy for authenticated/anon: only the website's server function
-- (service role, which bypasses RLS) creates leads.
CREATE POLICY "website_leads_select" ON website_leads FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "website_leads_update" ON website_leads FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "website_leads_delete" ON website_leads FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_admin_or_manager());
