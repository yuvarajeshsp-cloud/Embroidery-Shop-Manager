import { Preferences } from "@capacitor/preferences"
import { Capacitor } from "@capacitor/core"
import { BiometricAuth, type CheckBiometryResult } from "@aparajita/capacitor-biometric-auth"

/**
 * Whether the signed-in user has opted into unlocking the app with device
 * biometrics (Face ID / Touch ID / Android fingerprint) instead of typing
 * their password again. This is a per-device preference, not an account
 * setting — it only controls whether the already-persisted Supabase
 * session is gated behind a biometric prompt on this specific device.
 */
const ENABLED_KEY = "biometric_unlock_enabled"

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const { value } = await Preferences.get({ key: ENABLED_KEY })
  return value === "true"
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({ key: ENABLED_KEY, value: enabled ? "true" : "false" })
}

export async function getBiometryAvailability(): Promise<CheckBiometryResult | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return await BiometricAuth.checkBiometry()
  } catch {
    return null
  }
}

// The system Face ID / Touch ID sheet itself triggers an iOS app
// resign-active/become-active transition as it opens and closes, which
// fires our own `appStateChange` listener with isActive: true right as (or
// just after) the prompt dismisses. Without this flag, that re-fires the
// app's lock check and re-locks the screen immediately after a successful
// unlock — the "keeps logging out and back in" loop. The listener checks
// this flag and skips re-locking while a prompt we triggered is in flight,
// with a short trailing window to cover event-ordering races between the
// promise resolving and the native become-active event arriving.
let authInFlight = false

export function isBiometricAuthInFlight(): boolean {
  return authInFlight
}

/** Prompts for biometric verification. Resolves true on success, false on any failure or cancel. */
export async function authenticateWithBiometry(reason: string): Promise<boolean> {
  authInFlight = true
  try {
    await BiometricAuth.authenticate({ reason, allowDeviceCredential: true, cancelTitle: "Use Password" })
    return true
  } catch {
    return false
  } finally {
    setTimeout(() => {
      authInFlight = false
    }, 800)
  }
}
