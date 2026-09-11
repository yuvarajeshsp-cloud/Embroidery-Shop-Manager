
/*
# v2 — phone verification gate on self-serve sign-up

The sign-up form only ever asked for a shop name, a display name, an
email, and a password — nothing about it confirmed a real person was
behind the account, so it was trivial to mass-create junk
organizations. This adds a phone-number OTP step: a brand-new
self-signed-up account is created as before, but user_profiles.phone_verified
starts false and the app gates all real access behind a "verify your
phone" screen until it's flipped to true.

Accounts created by an Administrator (via invite or direct-create) are
NOT self-signup and are exempt — those two edge functions insert
phone_verified = true directly. This column only ever gates the public
sign-up form.

Existing users must not be retroactively locked out, so every row that
exists before this migration is backfilled to verified.
*/

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
UPDATE user_profiles SET phone_verified = true WHERE phone_verified = false;

-- One row per OTP send. Only ever touched by the send-signup-otp /
-- verify-signup-otp edge functions using the service role key — RLS is
-- enabled with zero policies so no client role can read or write it
-- directly, matching the platform_admins table's lockdown pattern.
CREATE TABLE IF NOT EXISTS signup_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_otp_codes_user_id ON signup_otp_codes(user_id);

ALTER TABLE signup_otp_codes ENABLE ROW LEVEL SECURITY;
