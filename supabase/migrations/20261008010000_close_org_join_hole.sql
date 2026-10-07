-- SECURITY FIX: any signed-in user with no profile yet (i.e. anyone who could
-- reach the public sign-up endpoint) could list every organization on the
-- platform and insert their own profile into ANY of them as Manager — or even
-- Administrator — instantly getting read/write access to that shop's data.
--
-- Two causes:
--  1. profiles_insert_self allowed any non-Administrator role into any
--     organization_id, and its "no existing member" guard for Administrator was
--     a sub-select on user_profiles that RLS filters down to nothing for a
--     brand-new user, so it was always true.
--  2. org_select_during_signup let a profile-less user read every organization.
--
-- The app only ever inserts a profile from the client in one case: the first
-- Administrator of the shop they just created. Invited / admin-created users
-- are inserted server-side with the service role, which bypasses RLS. So the
-- policy now allows exactly that one case, using a SECURITY DEFINER check that
-- really can see whether the organization already has members.
CREATE OR REPLACE FUNCTION org_has_members(p_org uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE organization_id = p_org)
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS profiles_insert_self ON user_profiles;
CREATE POLICY profiles_insert_self ON user_profiles FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND role = 'Administrator'
    AND NOT org_has_members(organization_id)
  );

-- Needed so sign-up can read back the organization it just created (still
-- empty) — but nobody can browse organizations that already have members.
DROP POLICY IF EXISTS org_select_during_signup ON organizations;
CREATE POLICY org_select_during_signup ON organizations FOR SELECT
  USING (
    NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid())
    AND NOT org_has_members(id)
  );
