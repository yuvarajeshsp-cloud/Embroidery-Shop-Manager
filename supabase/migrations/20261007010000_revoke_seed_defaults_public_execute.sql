-- Only the new-organization trigger calls this; nothing in the app does. Left
-- executable, anyone (even signed out) could call it with any organization id
-- and re-add default dropdown values that shop had deliberately removed.
REVOKE EXECUTE ON FUNCTION public.seed_organization_defaults(uuid, text) FROM PUBLIC, anon, authenticated;
