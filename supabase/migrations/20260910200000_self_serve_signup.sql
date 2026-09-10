
/*
# v2 — sign-up creates a shop

Replaces "everyone who signs up joins the one existing organization" with the
real multi-tenant shape: signing up always creates a brand-new organization,
and the person who created it becomes its first Administrator. Joining an
*existing* org only ever happens through an invite from that org's own
Administrator (already built) — never by picking one off a list.

A trial clock starts automatically for new organizations; Paavai Embroidery
(already `active`, backfilled by the previous migration) is untouched since
this only changes the column's default for rows inserted from now on.
*/

ALTER TABLE organizations ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '60 days');

-- A signed-up-but-profile-less user may create exactly one organization —
-- this is what "sign up" now means. Once they have a profile, this grants
-- nothing further (they're not profile-less anymore).
DROP POLICY IF EXISTS "org_insert_self_signup" ON organizations;
CREATE POLICY "org_insert_self_signup" ON organizations FOR INSERT TO authenticated
  WITH CHECK (NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- A self-signed-up user may claim 'Administrator' only for an organization
-- that has no members yet — i.e. only as that org's founder. Any org that
-- already has someone in it can only gain members through the invite-user
-- function (which runs as service role and bypasses this policy entirely).
DROP POLICY IF EXISTS "profiles_insert_self" ON user_profiles;
CREATE POLICY "profiles_insert_self" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (
      role <> 'Administrator'
      OR NOT EXISTS (SELECT 1 FROM user_profiles existing WHERE existing.organization_id = user_profiles.organization_id)
    )
  );

-- The temporary "discover an org while profile-less" policy from the
-- previous migration still applies here for a different reason now: it lets
-- a brand-new sign-up SELECT the organization row it just created (Postgrest
-- does `insert(...).select()`), since current_org_id() has nothing to look
-- up until the user_profiles row exists. No change needed — kept as-is.
