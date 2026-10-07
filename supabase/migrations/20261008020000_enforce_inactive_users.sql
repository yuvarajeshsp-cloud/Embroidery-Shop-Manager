-- SECURITY FIX: switching a team member to Inactive (Users & Roles) was only
-- cosmetic. Every row-level-security policy keys off current_org_id() /
-- current_user_role(), and neither looked at user_profiles.is_active, so a
-- deactivated employee could still sign in and read and edit all of the
-- shop's data.
--
-- Both helpers now return NULL for an inactive user, so every policy that
-- compares against them denies access. The user can still read their own
-- profile row (so the app can show "your account has been deactivated"
-- instead of hanging on a blank loading screen) — and nothing else.
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND is_active $$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM user_profiles WHERE id = auth.uid() AND is_active $$;

DROP POLICY IF EXISTS profiles_select_self ON user_profiles;
CREATE POLICY profiles_select_self ON user_profiles FOR SELECT USING (id = auth.uid());
