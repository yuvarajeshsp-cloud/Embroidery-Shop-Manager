
-- Temporary diagnostic function, removed in the next migration.
CREATE OR REPLACE FUNCTION public.debug_user_org(user_email text)
RETURNS TABLE(user_id uuid, email text, organization_id uuid, org_name text, org_slug text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.id, up.email, up.organization_id, o.name, o.slug
  FROM user_profiles up
  JOIN organizations o ON o.id = up.organization_id
  WHERE up.email = user_email
$$;

GRANT EXECUTE ON FUNCTION public.debug_user_org(text) TO authenticated;
