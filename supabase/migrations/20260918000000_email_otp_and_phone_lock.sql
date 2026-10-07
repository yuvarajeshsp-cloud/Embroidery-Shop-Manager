-- Switches signup verification from WhatsApp OTP to Supabase's own native
-- email OTP (supabase.auth.signInWithOtp / verifyOtp) — no more dependency
-- on the org's own WhatsApp Business setup for new signups to get in.
--
-- The onboarding gate is still the user_profiles.phone_verified column and
-- the trial-start trigger on it (see 20260917020000_subscriptions.sql) —
-- kept as-is rather than renamed, to avoid touching that trigger again; it
-- now means "completed onboarding verification", not literally "phone".
--
-- Also locks down user_profiles.phone: previously self-editable by anyone
-- (including phone_verified itself — any signed-in user could PATCH their
-- own phone_verified to true directly via the REST API, skipping
-- verification entirely, since profiles_update's WITH CHECK had no
-- per-column restriction). Only an Administrator may now change a user's
-- phone number; phone_verified may only flip via a real OTP-verified
-- session, checked through the session JWT's `amr` claim — which Supabase
-- Auth itself sets to include an "otp" entry only after a genuine
-- verifyOtp() success, so it can't be spoofed by calling the RPC directly.

CREATE OR REPLACE FUNCTION mark_self_email_verified()
RETURNS void AS $$
DECLARE
  verified_via_otp boolean := false;
BEGIN
  SELECT true INTO verified_via_otp
  FROM jsonb_array_elements(COALESCE(auth.jwt() -> 'amr', '[]'::jsonb)) AS entry
  WHERE entry ->> 'method' = 'otp'
  LIMIT 1;

  IF NOT COALESCE(verified_via_otp, false) THEN
    RAISE EXCEPTION 'Email must be verified with a one-time code first';
  END IF;

  PERFORM set_config('app.otp_verified_write', 'true', true);
  UPDATE user_profiles SET phone_verified = true, updated_at = now() WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION guard_profile_self_edit()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT is_admin() THEN
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'Only an Administrator can change a phone number';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
       AND current_setting('app.otp_verified_write', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'phone_verified can only be set by completing email verification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_profile_self_edit ON user_profiles;
CREATE TRIGGER trg_guard_profile_self_edit
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_self_edit();
