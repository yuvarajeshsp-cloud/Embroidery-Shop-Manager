// Text for the in-app Help and FAQ pages. Keep this in step with the app: it
// should only describe things the app really does. Held-back modules
// (WhatsApp, Subscription — see lib/features.ts) are deliberately not
// mentioned; add them here when they're switched on.

export interface HelpSection {
  id: string
  title: string
  intro?: string
  steps?: string[]
  tips?: string[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    intro: "Set your shop up once, then work from the Dashboard every day.",
    steps: [
      "Sign up with your shop name, what kind of shop it is (embroidery, tailor, boutique or mixed), your name, email, phone number and a password. We send a 6-digit code by SMS (or by email if the SMS can't be delivered) — enter it to finish.",
      "Open Configuration and fill in your company details, logo and brand colours. These appear on invoices and across the app. The Shop Type card there changes the wording and adds the starter lists for another kind of shop. Leave ‘Show only this type’s lists’ on to hide the statuses and item types that don't belong; nothing is deleted, and anything already in use stays visible.",
      "Still in Configuration, review the dropdown lists — order statuses, payment methods, product types, expense categories and so on — and add or rename values to match how your shop works.",
      "Add your team under Users & Roles (see “Team and roles” below).",
      "Add your customers, then create your first order.",
    ],
  },
  {
    id: "customers",
    title: "Customers",
    steps: [
      "Open Customers and tap New Customer.",
      "Enter at least the business name. Contact person, phone, WhatsApp number, email, addresses and GST number are optional but show up on invoices.",
      "Tap a customer to see their details and an order summary. Use the search box to find anyone by name, code, contact or phone.",
    ],
    tips: ["Customer codes (CUST-1001, CUST-1002 …) are assigned automatically."],
  },
  {
    id: "orders",
    title: "Creating and managing orders",
    steps: [
      "Tap New Order. Step 1: choose the customer, dates, status, priority, who it is assigned to, and any special instructions.",
      "Step 2: add items. For each item pick the product type, then choose how it is priced. By stitch: enter the quantity, stitches per unit and rate per 1,000 stitches — the unit price is worked out for you (stitches ÷ 1,000 × rate), or type a Manual Unit Price instead. Per piece: quantity and the price of one piece. Per metre: the metres and the price per metre. Fixed price: one price for the whole item.",
      "Add the extra charge if you bill one (setup/digitizing, lining, padding …) — it is added to the order total on top of the item totals. You can attach a photo or design to each item.",
      "Still on step 2, open an item and use its Additional costs for anything charged on top of that item — packaging, a rush fee, extra material. Pick a type from your list or choose Custom and type your own. Each one is added to the item and to the order total. Tap an item's header to fold it shut.",
      "Step 3: review the totals and tap Create Order.",
      "Open any order to change its status, assign it to a team member, add or edit items and additional costs, record payments, and print or download documents.",
    ],
    tips: [
      "For tailors and boutiques: set a Trial / Fitting date and note the material or fabric received. Trials due today and this week show on the Dashboard.",
      "Changing the status moves the order along the Production Board.",
      "Overdue orders (past their delivery date and not delivered) are highlighted in red and counted on the Dashboard.",
    ],
  },
  {
    id: "payments",
    title: "Recording payments",
    steps: [
      "Open the order and tap Record Payment.",
      "The amount defaults to the full balance. Change it for a part payment, pick the method (cash, UPI …), add a reference or note if you like, and save.",
      "The order shows Paid, Balance and a payment status — Unpaid, Part Paid or Paid — and updates automatically as you record more payments.",
      "The Payments page lists every payment across all orders, with search, filters and export.",
    ],
  },
  {
    id: "documents",
    title: "Invoices, PDFs and order tags",
    steps: [
      "On an order, Download / Print PDF opens a preview of the full invoice with Download and Print buttons at the top and bottom.",
      "Print Invoice opens a preview of the thermal-printer receipt (with your logo); press Print at the top or bottom to send it to the printer. Choose your printer and set paper size, border and spacing under Printer (next to Configuration).",
      "Print Order Tag works the same way and gives a small tag to attach to the garment.",
    ],
  },
  {
    id: "expenses",
    title: "Expenses",
    steps: [
      "Open Expenses and tap Add Expense.",
      "Choose a category (for example Shop Expense, Rent, EB Bill), enter the amount and date, and an optional description.",
      "To see what an order really cost you, link the expense to that order. The order then shows its linked expenses.",
      "Categories marked as restricted (Salary by default) can only be seen and recorded by an Administrator. Administrators can change which categories are restricted, and add their own, in Configuration → Expense Categories.",
    ],
  },
  {
    id: "dashboard-reports",
    title: "Dashboard, Production Board and Reports",
    steps: [
      "The Dashboard summarises orders, revenue collected, pending payments, overdue orders and orders in production. Use the date filter at the top (this week, this month, last month, this year, custom …) and every figure and chart follows it.",
      "The Production Board shows orders as cards in columns, one per production stage, so you can see at a glance what is in the queue. Stages are set in Configuration → Production Stages.",
      "Reports gives revenue, order, customer and outstanding-balance analysis for any date range.",
      "List pages (orders, customers, payments, expenses) have an Export button to download the data.",
    ],
  },
  {
    id: "team",
    title: "Team and roles",
    intro: "Administrators manage the team from Users & Roles. Create User makes an account straight away with a password you set; Invite User emails a sign-in link instead.",
    steps: [
      "Administrator — everything, including Configuration, Users & Roles and the Audit Log.",
      "Manager — orders, customers, payments, expenses, production board and reports. No configuration or user management.",
      "Accounts — orders, customers, payments, expenses and reports.",
      "Operator — production-focused: view orders and work from the Production Board.",
    ],
    tips: [
      "Only an Administrator can change a team member's role, switch them active/inactive, or change a phone number.",
      "Switching someone to Inactive stops them signing in straight away; their past work stays in the records.",
      "The Audit Log records who changed what, and when.",
    ],
  },
  {
    id: "security",
    title: "Your account and security",
    steps: [
      "My Profile lets you change your display name and password.",
      "On the web, you can add a passkey (Windows Hello, Touch ID or a security key) to sign in without typing a password.",
      "On the Android and iPhone apps, turn on Fingerprint / Face ID unlock in My Profile. The app then locks whenever you leave it and opens with a touch. After you sign out, a “Sign in with Fingerprint / Face ID” button on the sign-in screen signs you straight back in.",
      "Delete Account in My Profile permanently removes your account (see the FAQ for exactly what happens).",
    ],
  },
]

export interface FaqItem {
  q: string
  a: string
}

export interface FaqGroup {
  title: string
  items: FaqItem[]
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Signing in and verification",
    items: [
      {
        q: "I didn't receive my verification code.",
        a: "We first try to text the code to the phone number you signed up with. If the SMS can't be delivered, we automatically email the code to you instead — check your inbox and spam folder. You can ask for a new code after 60 seconds. If the number on your account is wrong, ask your Administrator to correct it in Users & Roles.",
      },
      {
        q: "I forgot my password.",
        a: "Tap “Forgot password?” on the sign-in screen, enter your email, and we'll send you a link to choose a new one. If you're already signed in you can change your password any time in My Profile → Change Password.",
      },
      {
        q: "What is “Sign in with Fingerprint / Face ID”?",
        a: "After you turn on Fingerprint / Face ID unlock on your phone (My Profile), your login is saved in your phone's secure storage. If you later sign out, a button on the sign-in screen lets you sign back in with a touch instead of typing your password. Your fingerprint or face is handled only by your phone — the app never sees it. Use “Not you? Forget this saved sign-in” on that screen to remove it, for example on a shared phone.",
      },
      {
        q: "The app keeps asking for my fingerprint / Face ID.",
        a: "That is the app lock: it locks each time you leave the app and come back. If you don't want it, turn off Fingerprint / Face ID unlock in My Profile.",
      },
      {
        q: "Can I use the app on more than one device?",
        a: "Yes. Sign in with the same email and password on the web, Android and iPhone — everything is stored online, so all your devices show the same data.",
      },
    ],
  },
  {
    title: "Orders and payments",
    items: [
      {
        q: "How is the price of an item calculated?",
        a: "It depends on how the item is priced. By stitch: unit price = stitches per unit ÷ 1,000 × rate per 1,000 stitches (a Manual Unit Price replaces this). Per piece and per metre: unit price × quantity (or metres). Fixed price: the price you enter. Item total = unit price × quantity, and any extra charge (setup/digitizing, lining …) is added once on top. The default stitch rate comes from Configuration.",
      },
      {
        q: "How do I charge delivery or packaging on top of an item?",
        a: "Costs belong to an item. On the order, find the item and tap Add cost under it (or add them while creating the order). Choose a type from your list, or Custom to type your own, and enter the amount. Every additional cost is added to the order total, shown on the invoice, and counted in the balance. Administrators manage the list of types in Configuration → Additional Cost Types.",
      },
      {
        q: "I'm a tailor or boutique — why do I still see embroidery fields?",
        a: "Choose your kind of shop in Configuration → Shop Type. Items then default to per-piece pricing and the wording changes (Garment, Style, Trial date …). You can still price any individual item by stitch when you add embroidery work.",
      },
      {
        q: "Can I edit or delete an order after creating it?",
        a: "Yes. Open the order to change its status, assignee, items and payments. Deleting an order is limited to Administrators and Managers.",
      },
      {
        q: "A customer paid part of the amount. What do I do?",
        a: "Open the order, tap Record Payment and enter the amount actually received. The balance and status (Part Paid) update automatically; record the next payment the same way when it arrives.",
      },
      {
        q: "Where do I see everything a customer owes?",
        a: "Open the customer to see their order summary, or use the Reports page and its Outstanding view for balances still to be collected.",
      },
      {
        q: "How do I get an invoice to send to a customer?",
        a: "Open the order and tap Download / Print PDF, then Download (or Save / Share on a phone). For a thermal printer receipt use Print Invoice.",
      },
      {
        q: "Can I use the app without internet?",
        a: "Yes. A strip at the top shows when you are offline. You can keep opening orders, customers and payments that were loaded earlier, and add or change orders, customers, payments and expenses; they are saved on the device and sent automatically when you are back online (the strip turns blue while syncing). Sign in once with internet first. Photos, sign-in, WhatsApp and user management need internet.",
      },
    ],
  },
  {
    title: "Team, roles and expenses",
    items: [
      {
        q: "Why can't I see a menu item my colleague can?",
        a: "Menus depend on your role. For example, only Administrators see Configuration, Users & Roles and the Audit Log, and Operators don't see Payments or Expenses. Ask your Administrator if you need a different role.",
      },
      {
        q: "Why can't I change my phone number?",
        a: "Phone numbers can only be changed by an Administrator, to keep accounts trustworthy. Ask your Administrator to update it in Users & Roles.",
      },
      {
        q: "How do I add a team member?",
        a: "Administrators: open Users & Roles. Create User makes the account immediately with a password you choose (tell them the password). Invite User emails them a link to set their own. Pick their role carefully — it decides what they can see and do.",
      },
      {
        q: "Why can't I see the Salary expense category?",
        a: "Salary is a restricted category: only Administrators can see or record it. Administrators can choose which categories are restricted in Configuration → Expense Categories.",
      },
      {
        q: "Can I attach an expense to a specific order?",
        a: "Yes. When adding an expense, choose the order under “Linked Order”. That lets you see what each order cost to produce.",
      },
    ],
  },
  {
    title: "Your data and privacy",
    items: [
      {
        q: "Is my data private from other shops?",
        a: "Yes. Every shop's data is kept separate; people in other shops cannot see your customers, orders, payments or files.",
      },
      {
        q: "How do I delete my account?",
        a: "Go to My Profile → Delete Account, type DELETE and confirm. Your sign-in, name, email and phone number are removed and your name is cleared from the shop's history. If you are the only member of your shop, the shop and all its orders, customers, payments, expenses and uploaded files are deleted too. If you are the only Administrator and others remain, first make someone else an Administrator. Deletion is immediate and can't be undone.",
      },
      {
        q: "What does the app store on my phone?",
        a: "Your signed-in session and, only if you enable fingerprint / Face ID sign-in, your saved login in your phone's secure storage. See the Privacy Policy for the full picture.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        q: "The app says it can't connect or data won't load.",
        a: "Check your internet connection and try again. The app needs to be online because your data is stored securely online. If it still fails, sign out and back in.",
      },
      {
        q: "A photo or document won't upload.",
        a: "Check your connection and that the file isn't very large, then try again. On a phone, make sure the app is allowed to use the camera and photos in your phone's settings.",
      },
      {
        q: "I made a mistake in a payment or expense.",
        a: "Open the payment or expense and edit or delete it. Changes are recorded in the Audit Log, so there's always a trail.",
      },
    ],
  },
]
