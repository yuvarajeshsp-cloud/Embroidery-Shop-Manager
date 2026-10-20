# Subscriptions on Google Play — plan for later

Thiyal Desk launches free. This is what switching on paid plans will involve for
the Android app, so nothing done at launch has to be undone.

## What stays true from day one

- The listing is **Free**. A free app can add in-app subscriptions later; it can
  never become a *paid* (pay-to-download) app, and that is not wanted anyway.
- `FEATURES.subscription` in `src/lib/features.ts` stays `false` until billing is
  ready, so the Android build has no purchase screens and the Play declarations
  ("no in-app purchases", "no digital purchases" in the rating questionnaire) are
  accurate.
- The database already tracks each shop's plan and trial
  (`organizations.subscription_status`, `trial_ends_at`, the
  `organization_access_level()` function, `platform_settings.subscription_enforced`
  and the trial-start trigger keyed on `phone_verified`). Play purchases will
  update the same columns, so the web, desktop and Android apps share one
  subscription per shop.

## Google's payment rule

Inside an app distributed by Google Play, a subscription to the app's own
features must be sold with **Google Play Billing**. The current Razorpay checkout
cannot appear in the Android app. Two allowed set-ups for India:

| Option | How it works | Fee |
|---|---|---|
| **Play Billing only** (simplest) | Android users subscribe through Google; web and desktop keep Razorpay | 15% on subscriptions |
| **User choice billing** (India programme) | Android users pick Google Play or our own Razorpay checkout | Lower service fee on the Razorpay path; needs enrolment and extra integration |

Start with Play Billing only; enrol in user choice billing later if the fee
matters.

## Work involved when the time comes

1. **Play Console:** set up a payments profile (merchant account) and create a
   subscription product, for example `thiyaldesk_pro` with base plans `monthly`
   and `yearly`, plus a free-trial offer to match the web trial.
2. **App:** add a billing plugin to the Capacitor app (for example
   `cordova-plugin-purchase` or RevenueCat's Capacitor SDK); on Android the
   Subscription page shows Play's prices and buys through Google; on web and
   desktop it keeps Razorpay. Subscription management links go to the Play
   subscriptions page on Android.
3. **Server:** a Supabase edge function that verifies the purchase token with
   the Google Play Developer API and updates the shop's subscription status; Real-time
   Developer Notifications (Pub/Sub → edge function) handle renewals,
   cancellations, grace periods and refunds.
4. **Play declarations to update at that release:** rating questionnaire →
   digital purchases *Yes*; Data safety → Financial info → *Purchase history*
   collected; store listing shows "In-app purchases" automatically.
5. **Existing shops:** decide whether shops that joined during the free period
   get a grace period or a discounted first year before
   `subscription_enforced` is switched on.
