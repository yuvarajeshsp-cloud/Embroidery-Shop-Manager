-- Sign-up verification moved to Twilio Verify SMS (primary) with Supabase
-- email OTP as the automatic fallback — see
-- 20260918000000_email_otp_and_phone_lock.sql and the send-phone-otp /
-- verify-phone-otp edge functions. The WhatsApp-based OTP path this
-- replaces is now fully unused: nothing in the app calls the
-- send-signup-otp / verify-signup-otp edge functions anymore (already
-- deleted), and signup_otp_codes has no other purpose.
DROP TABLE IF EXISTS signup_otp_codes;
