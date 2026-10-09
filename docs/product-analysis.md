# Fine-tuning the app for embroidery, tailoring and boutique shops

Prepared 9 Oct 2026 from the app as it stands today (web, Android, iPhone, one Supabase backend, multi-tenant).
Domain points below come from how these shops generally work; **I have not interviewed shop owners or researched competitor apps** — Section 8 says how to validate before building.

---

## 1. Where the app is today

**What a shop can do now**
- Customers (type, contacts, GST number, addresses) → Orders (dates, priority, status, assignee, sales channel, notes) → Order items → Payments (part payments, methods, status) → Expenses (linked to orders) → Production Board → Reports/Dashboard.
- Roles (Administrator, Manager, Operator, Accounts), audit log, PDF invoice, thermal receipt and order tag, photo/document attachments on items, biometric lock, account deletion, Help/FAQ.
- Every list (statuses, product types, expense categories, payment methods, customer types, channels, production stages) is editable per shop in Configuration.

**What is strongly embroidery-shaped**
- An order item is priced by `stitches per unit ÷ 1,000 × rate`, plus a setup/digitizing charge. That is exactly right for machine embroidery and wrong for tailoring and boutique work, which price per garment.
- New shops all get the same seed lists (statuses like Design/Quotation/Confirmed/In Production, product types like T-Shirt/Cap/Uniform). A tailor or boutique has to rebuild these by hand.

**Evidence the app is already stretching**
- One real shop uses it for a nursery (Plant, Pot, Soil, Tools, Transport appear as product types). Shops are bending the app to fit — a signal that "one app, shop-type presets" is a real demand.

**What is missing for these three trades** (details in Section 3): measurements, trial/fitting dates, fabric and material tracking, worker/karigar wages, customer statements and reminders, GST-aware invoices, design library, WhatsApp updates, offline use.

---

## 2. How each business actually runs

### A. Machine embroidery / digitizing (job-work)
Customer brings a garment, fabric or just a logo → digitize the design (stitch count) → sample or approval → quote → advance → machine run → finishing/QC → delivery → often settled later on credit.
- **Money:** per stitch-count slab, per piece, or per 1,000 stitches; setup/digitizing charged once per design and **not again on repeat orders**.
- **Pain points:** stitch-count disputes, repeat orders ("same as last time"), design approval over WhatsApp, rework/rejects, machine and operator idle time, monthly credit with resellers and boutiques who bring a lot of work.

### B. Tailor (bespoke stitching)
Customer visits → measurements taken (per garment type) → fabric received (often the customer's) → cutting → stitching → **trial/fitting** → alterations → delivery.
- **Money:** rate per garment type and style (e.g. blouse with/without lining, pad, hooks), advance at booking, balance at delivery; alterations are quick small tickets.
- **Pain points:** measurements kept in paper books or WhatsApp photos, lost or mixed-up fabric, festival rush (Diwali, Pongal, wedding season) where promised dates slip, tailors paid per piece, repeat customers whose old measurements nobody can find.

### C. Boutique (designer blouses, sarees, kurtis, bridal)
Design finalised (often from a photo/reference) → measurements → materials bought (fabric, lining, laces, beads) → embroidery/aari/maggam work (frequently **outsourced**) → stitching → trial → finishing → delivery. May also hold ready-made stock.
- **Money:** higher ticket per order, bigger advances, material cost is a large share of price, outsourced work has its own cost and due date.
- **Pain points:** knowing real profit per order (materials + outsourced work + labour), tracking which job is with which outside worker, design photos, delivery commitments, customers who keep changing the design.

### What all three share
Advance + balance, trial/delivery promises, photos, repeat customers, WhatsApp as the main channel, credit customers, a handful of staff paid daily/weekly/per piece, and owners who run the shop from a phone.

---

## 3. Gaps and what to build

Effort: **S** = days, **M** = 1–2 weeks, **L** = several weeks (one developer, rough).

### Tier 1 — makes the app feel built for them
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **Shop-type presets at sign-up** (Embroidery / Tailor / Boutique / Mixed) that seed statuses, product types, expense categories, production stages and the labels used | Removes the biggest first-use friction; stops tailors seeing "Stitches" | S–M |
| 2 | **Pricing modes on an item**: per stitch (today), per piece/garment, per metre, fixed price | Today's form only suits embroidery | M |
| 3 | **Trial date + delivery date** on orders, with "due this week / overdue / trials today" lists | Core promise in tailoring/boutique; festival rush | S–M |
| 4 | **Measurements**: per-customer profiles by garment type (blouse, kurta, pant …) with editable templates, history, photos, share as PDF/WhatsApp, attach to an order item | The single most-requested thing in tailoring; also a lock-in feature | M–L |
| 5 | **Fabric / material received** on an order (what, how much, photo) and a status "Material received" | Prevents lost/mixed fabric; tailors and boutiques | S–M |
| 6 | **Customer statement + outstanding reminders** (PDF/WhatsApp, ageing: 0–30/30–60/60+ days) | Credit is how embroidery job-work gets paid; Reports has the outstanding view, a per-customer statement is missing | M |
| 7 | **Repeat order** ("copy from previous order") and a **design library** (name, thumbnail, stitch count, setup already charged) | Embroidery: repeat designs are most of the volume | M |

### Tier 2 — differentiators
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 8 | **Workers (karigars) and wages**: assign by stage, piece-rate or salary, advances, weekly wage sheet | Shops pay per piece; profit per order needs labour | L |
| 9 | **Outsourced work tracking** (vendor, work sent, due date, cost, received) | Boutiques outsource embroidery/aari work | M |
| 10 | **Per-order profit**: revenue − linked expenses − materials − outsourced − labour | Owners rarely know this; expenses already link to orders | M (after 8–9) |
| 11 | **WhatsApp updates** ("Your order 2188 is ready", payment reminders, trial reminders) | Already built and hidden; needs Meta-approved templates and a decision on the provider | M–L |
| 12 | **GST-aware invoices**: HSN/SAC, tax rate per item, CGST/SGST/IGST split, invoice numbering, GST summary report | The app only prints the GST number today. **Rates and treatment (job-work vs sale of goods) must be confirmed with a CA before building.** | L |
| 13 | **Quotation → order** with approval link (customer views design photo and approves) | Fewer disputes; fewer design changes after cutting | M |
| 14 | **Machine tracking** (heads/machines, run times, thread and needle use), operator view of "my jobs today" | Embroidery shops with several machines | M–L |
| 15 | **Dashboard for these trades**: due today/tomorrow, trials today, cash collected today, top credit customers, workload per day | Daily-use screen | S–M |

### Tier 3 — platform and growth
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 16 | **Offline mode** with sync | Shops have patchy mobile data; the app needs a connection for everything now | L |
| 17 | **Tamil / Hindi UI** (and Indian number words in invoices) | Owners and staff are often more comfortable in the local language. *I am inferring the region from customer names; confirm the target languages.* | M |
| 18 | **Catalogue / price list** with photos and share link | Boutiques sell from photos | M |
| 19 | **Ready-made stock** (SKU, size, stock, quick sale) | Boutiques with retail items; do this only if asked for | L |
| 20 | **Customer tracking link / QR on the order tag** | Fewer "is my order ready?" calls | M |
| 21 | **Multi-branch**, staff attendance | Larger boutiques and chains | L |
| 22 | **Subscriptions** (built, hidden) with Play Billing / App Store in-app purchase | Revenue; see Section 6 | M (+ store review time) |

---

## 4. Suggested process templates (what presets should seed)

**Embroidery / digitizing**
Enquiry → Design/Digitizing → Sample / Approval → Confirmed (advance received) → Material received → Embroidery (machine) → Finishing / QC → Ready → Delivered → Settled
Extra fields: design name/number, stitch count, colours/threads, hoop/placement, pieces, rejects.

**Tailor**
Enquiry → Measurement taken → Fabric received → Cutting → Stitching → Trial / Fitting → Alteration → Ready → Delivered
Extra fields: garment type, style options, measurements, fabric source (customer/ours), trial date, delivery date.

**Boutique**
Design finalised → Measurements → Material purchased → Embroidery / Work (in-house or outsourced) → Stitching → Trial → Finishing → Ready → Delivered
Extra fields: reference photos, materials list with cost, outsourced vendor and due date, trial date, delivery date.

**Common**
Customer types (Walk-in, Regular, Reseller, Boutique, School/Institution, Wholesale), expense categories (Rent, EB Bill, Salary/Wages, Thread/Needles, Fabric/Material, Outsourced work, Transport, Repairs), payment methods (Cash, UPI, Card, Bank transfer, Credit), channels (Walk-in, Phone, WhatsApp, Instagram, Referral).

---

## 5. How to build it without forking the app

- **Configurable fields, not separate apps.** Add a per-shop "item template" (which fields appear, pricing mode, labels) stored in settings. Presets are just ready-made templates; shops can still edit them. This keeps one codebase for all trades.
- Add new data as **new tables** (measurement_profiles, materials, workers, wages, vendors, design_library) all carrying `organization_id` with the same row-level-security pattern already used, so tenant isolation stays consistent.
- Keep the existing orders/payments/expenses tables stable; migrate shops gradually (a preset applied to an existing shop should only *add* lists, never overwrite).
- Release behind the existing `FEATURES` flags (client) and a `platform_settings` switch (database), as was done for Subscription/WhatsApp, so unfinished modules never reach the stores.

---

## 6. Business side

- **Positioning:** "run your stitching shop from your phone": orders, measurements, payments, workers, WhatsApp — in your language.
- **Pricing idea (to test):** free for one user and a small number of open orders; a paid plan per shop per month priced in the range these shops already pay for billing apps; annual discount; a higher tier for multiple users/branches/WhatsApp. The subscription code exists but is hidden. **In-app subscriptions on Android and iPhone must use Google Play Billing / Apple in-app purchase**; Razorpay can stay for the web. Needs store review time.
- **Growth loops:** WhatsApp share of invoices/receipts with the shop's name and an install link; measurement sharing; referral month free; a ready template for tailors' associations and boutique groups.
- **Support:** the in-app Help/FAQ is a start; add short video clips per trade.

---

## 7. Risks and cautions
- **GST and invoicing** are legal territory — confirm with a chartered accountant, and keep clear wording that the app is a record-keeping tool.
- **WhatsApp** business messaging needs provider approval and pre-approved templates; costs per conversation.
- **Measurement data is personal data.** The privacy policy and Play Data Safety form must be updated when it is added; keep deletion working (account deletion already purges shop data).
- **Offline sync** is the riskiest engineering item; do it after the data model settles.
- **Scope creep:** each trade added multiplies screens. Ship Tier 1 for one trade first, learn, then add.
- Current known gaps to close alongside: Supabase auth Site URL (reset/invite email links), contact email in the privacy policy, leaked-password protection (needs the Pro plan).

---

## 8. Validate before building (one week)
Visit or call 5 shops per trade (embroidery, tailor, boutique). Ask:
1. Walk me through the last order from enquiry to delivery. Where did it get stuck?
2. Where do you write measurements today? How often do you re-measure repeat customers?
3. How do you pay your workers? Per piece, daily, monthly? Any advances?
4. How many orders are on credit? How do you chase them?
5. How do you tell customers their order is ready?
6. What would you pay per month to never lose a measurement or a payment?
7. Which language do you and your staff use at work?

Then re-order Tier 1 by what they actually say.

---

## 9. Suggested order of work

**Phase 1 (about a month): fit.** Presets (1), pricing modes (2), trial/delivery dates and "due" lists (3), material received (5), dashboard (15), repeat order (7, first half).
**Phase 2: stickiness.** Measurements (4), customer statements and reminders (6), design library (7), quotation approval (13).
**Phase 3: money and ops.** Workers and wages (8), outsourced work (9), per-order profit (10), WhatsApp (11), GST invoices (12), then subscriptions (22).
**Phase 4: scale.** Offline (16), language (17), catalogue (18), tracking link (20), machines (14), multi-branch (21).

---

## 10. Decisions I need from you
1. Which trade first — embroidery job-work, tailoring, or boutique? (I would start with whichever your own shops and the nearest ten customers belong to.)
2. Do you want a research pass on competing apps and pricing? I can do it with web research; I have not done it yet.
3. Languages to support (English only, or Tamil/Hindi too).
4. GST: do your target shops issue GST invoices, or mostly cash/estimate bills?
5. Subscription timing: keep it hidden until Tier 1 is done, or launch free with a paid plan later?
6. Do you want me to start Phase 1 now, beginning with the shop-type presets?
