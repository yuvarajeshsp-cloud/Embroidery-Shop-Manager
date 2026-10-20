# Thiyal Desk — Google Play launch kit

Everything needed to publish the Android app on Google Play, ready to copy into
Play Console. The app launches **free** (no ads, no in-app purchases);
subscriptions come later — see [subscriptions-plan.md](subscriptions-plan.md).

| | |
|---|---|
| Package name | `com.rkapps.thiyaldesk` (permanent once uploaded) |
| Upload file | `installers/ThiyalDesk-Android-3.0-build12.aab` (signed with the upload key in `android/keystore.properties`) |
| Version | 3.0 (versionCode 12) · minSdk 24 · targetSdk 36 · no native libraries |
| Price | Free |
| Category | Business |

---

## 1. Steps in order

Items marked **you** need the account owner (payments, ID, or signing in).

1. **You:** create the developer account at <https://play.google.com/console/signup>
   ($25 one-time fee and identity verification).
   - *Personal* account: before the app can go public, Google requires a **closed
     test with at least 12 testers who stay opted in for 14 days**. Collect 12+
     Gmail addresses (staff, family, customers) now.
   - *Organization* account: needs a D-U-N-S number; no 12-tester rule.
2. **You:** sign up a demo shop in the app (for example
   `demo.thiyaldesk@gmail.com`) and finish the phone/email verification, so the
   reviewer never sees the verification screen. Claude then fills it with
   made-up customers and orders and takes the store screenshots from it.
3. Create the app in Play Console: name *Thiyal Desk*, default language
   English (India) `en-IN`, **App**, **Free**, accept the declarations.
4. Fill **App content** (section 4) and **Store listing** (sections 2–3).
5. **Testing → Closed testing → Create track**: add the testers' email list,
   upload the AAB, paste the release notes (section 5), roll out.
   Opt in **Play App Signing** when asked (Google keeps the app signing key; our
   key becomes the upload key).
6. After 14 days with 12+ testers (personal accounts), apply for production
   access, then promote the same release to **Production**.

---

## 2. Store listing text

**App name** (30 max)

```
Thiyal Desk: Tailor & Boutique
```

**Short description** (80 max)

```
Tailor, Boutique and Embroidery shop manager: orders, payments, production.
```

**Full description** (4000 max)

```
Thiyal Desk is a shop manager built for tailors, boutiques and embroidery units. Take orders at the counter, track every piece through production, collect payments and print bills — from your phone, tablet or computer.

ORDERS
• Create an order in a few taps: customer, items, quantity, price, delivery and trial/fitting dates
• Attach up to 6 photos per item — designs, fabric, reference pictures
• Add extra charges (courier, rush, material) and order discounts
• Search and filter orders by status, date, customer or priority

PRODUCTION BOARD
• See every order by stage — design, cutting, stitching, embroidery, finishing, ready, delivered
• Stages match your trade: tailor, boutique, embroidery or mixed shop
• The board updates live when a team member moves an order, with their initials on the card

PAYMENTS AND BILLS
• Record advances and balance payments by cash, UPI, card or bank transfer
• Always know what is paid, part-paid and due
• Share or print PDF invoices
• Print invoices and order tags on Bluetooth thermal receipt printers, with your shop logo

CUSTOMERS AND EXPENSES
• Customer list with phone, address and complete order history
• Record shop expenses — rent, wages, materials, electricity — and link them to orders

REPORTS
• Dashboard with today's work, overdue deliveries and unpaid balances
• Revenue, order, top-customer and outstanding-balance reports for any date range

YOUR TEAM
• Invite staff with roles: Administrator, Manager, Accounts and Operator
• Operators update production stages without seeing or changing prices
• Audit log of who changed what, and when

WORKS WITHOUT INTERNET
• Keep working when the connection drops; changes sync automatically when you are back online

SAFE AND PRIVATE
• Each shop's data is kept separate and is encrypted in transit
• Optional fingerprint / face unlock
• No ads

Thiyal Desk also runs in the browser and on Windows and Mac, so the counter, the workshop and the owner's phone all see the same orders.
```

**Contact details**

| Field | Value |
|---|---|
| Email | `thiyaldesk@gmail.com` |
| Website | `https://app.paavaifashions.com` |
| Phone | optional |
| Privacy policy | `https://app.paavaifashions.com/privacy.html` |

**Tags** (Store settings): Business, Productivity. Play's tag list has no business-management, point-of-sale or invoicing tags; "Fashion" exists but groups the app with Shopping, so it is left out.

---

## 3. Graphics

| Asset | File | Status |
|---|---|---|
| App icon 512×512 PNG | `graphics/icon-512.png` | ready |
| Feature graphic 1024×500 | `graphics/feature-graphic-1024x500.png` | ready |
| Phone screenshots (2–8, 1080×1920) | `graphics/phone-*.png` | after the demo shop exists |
| 7" and 10" tablet screenshots | optional | — |

Planned phone screenshots, in this order: Dashboard · Orders list · New order
with photos · Order details with payments · Production board · Thermal receipt
preview · Reports.

---

## 4. App content answers

**Privacy policy:** `https://app.paavaifashions.com/privacy.html`

**App access:** *All or some functionality is restricted* → add instructions:

```
Sign in with the demo account below on the first screen (Sign In tab).
Email: <demo email>
Password: <demo password>
The demo shop already contains sample customers, orders and payments.
No other codes or steps are needed.
```

**Ads:** No, the app does not contain ads.

**Content rating** (IARC questionnaire): category *All other app types*. Answer
**No** to violence, fear, sexuality, profanity, drugs, alcohol, tobacco,
gambling, crude humour. *Users interact or exchange content?* **No** (records are
private to the shop's own team; nothing is public). *Shares user location?*
**No**. *Digital purchases?* **No**. Expected rating: Everyone / PEGI 3 / 3+.

**Target audience and content:** 18 and over only. Not designed for children.

**News app:** No. **Government app:** No. **Health apps:** None.
**Financial features:** *My app doesn't provide any financial features*
(it records a shop's own bookkeeping; it does not move money).
**Advertising ID:** No, the app does not use advertising ID.

**Data safety**

- Collects or shares any required user data types? **Yes**
- All user data encrypted in transit? **Yes**
- Way for users to request deletion? **Yes** →
  `https://app.paavaifashions.com/delete-account.html`
- Shared with third parties? **No** for every type (Supabase, Twilio and Netlify
  are service providers processing on our behalf, which Play does not count as
  sharing).

| Data type | Collected | Required? | Purposes |
|---|---|---|---|
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Required | App functionality, Account management |
| Personal info → Phone number | Yes | Required | App functionality, Account management (sign-up verification) |
| Personal info → Address | Yes | Optional | App functionality (customer addresses) |
| Financial info → Other financial info | Yes | Optional | App functionality (payments recorded against orders) |
| Photos and videos → Photos | Yes | Optional | App functionality (order photos) |
| Files and docs | Yes | Optional | App functionality (order attachments) |
| App activity → Other actions | Yes | Required | App functionality (shop audit log) |

Not collected: location, contacts, messages, health, audio, calendar, device IDs,
crash logs, diagnostics, web history. Fingerprint/face data and saved
biometric sign-in stay on the phone and never reach our servers, so they are not
"collected".

**Permissions shown to users:** Camera (order photos), Bluetooth / nearby devices
(thermal printer). On Android 11 and older Bluetooth scanning needs Location;
the app never reads the location.

---

## 5. Release notes (first release)

```
<en-IN>
First release of Thiyal Desk: orders with photos, live production board, payments, PDF and thermal-printer bills, expenses, reports, team roles and offline sync.
</en-IN>
```

---

## 6. Still to decide or do

- [x] Support email `thiyaldesk@gmail.com` → listing contact and content-rating contact (20 Oct 2026).
- [x] Support email in the privacy policy Contact section (live 20 Oct 2026).
- [ ] Personal developer account (owner action; chosen 20 Oct 2026).
- [ ] Demo shop account + password for the reviewer; then screenshots.
- [ ] 12+ tester Gmail addresses (personal account).
