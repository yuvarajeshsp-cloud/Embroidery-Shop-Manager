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

/** Prompts for biometric verification. Resolves true on success, false on any failure or cancel. */
export async function authenticateWithBiometry(reason: string): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({ reason, allowDeviceCredential: true, cancelTitle: "Use Password" })
    return true
  } catch {
    return false
  }
}
