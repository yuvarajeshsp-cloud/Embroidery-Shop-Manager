/**
 * Modules that are built but held back from the current release. Flip a flag
 * to true to bring the module back — nothing else needs to change on the
 * client. `subscription` also has a database-side switch
 * (platform_settings.subscription_enforced, see
 * 20261007000000_subscription_enforcement_flag.sql) that must be turned on
 * at the same time, otherwise the paywall UI would be live but the database
 * would not be enforcing it (or vice versa).
 */
export const FEATURES = {
  subscription: false,
  whatsapp: false,
} as const
