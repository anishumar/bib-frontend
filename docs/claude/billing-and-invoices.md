# Invoices, automatic billing, advances, receivables, and the firm's numbers

| Route | Is |
|---|---|
| `/invoices` | what the firm has BILLED. Tabs (`?tab=`): **Invoices** (`invoices`) · **To raise** (`raise`, 0318) · **Work vs Billing** (`work`) · **Advances** (`advances`) · **To adjust** (`adjust`) · **Billing not set up** (`setup`). **Raise an invoice** is the brand button (a dialog) |
| `/invoices/[invoiceId]` | one invoice: lines, what has been paid and credited, what is left; **Issue** in the header (a draft's one committing act, `tenant:admin`; Cancel stays in the document card) |
| `/receivables` | who owes money, and the dunning steps waiting for a partner's decision |
| `/dashboard` | "The firm's numbers": MRR, what it is owed, how long it waits, what the figures could NOT count; billing by company; revenue by manager; the revenue report |

Rules from the backend live in `bib-backend/CLAUDE.md`; auto-invoice rules and API in
`bib/prompts/auto-invoice/PLAN.md`. Money rules: `money-and-dates.md`.

## The invoice

- **An invoice number is not a document reference.** `PR-2026-0007` may gap; a tax invoice series
  must be consecutive, so nobody picks one: the API allocates it, **at ISSUE since 0322** (a draft
  has NO number, so a cancelled draft burns nothing). A cancelled invoice still appears, numbered,
  and says why; a replacement is a new invoice. `invoiceNumberWords(number, status)` prints
  "Draft" / "Cancelled draft" where a number will be (list, To raise "On a draft", Link dialog,
  Advances, My day); the page is titled "Draft invoice"; Issue's confirm says "It gets the next
  number in <company>'s series"; Cancel on a draft says no number is used up. A raise answers
  `number: null`; only `invoiceId: null` means "No invoice needed" (the walk caught every new draft
  read as covered).
- **There is no "paid" badge, because there is no such column.** Status is about the DOCUMENT;
  what is paid is arithmetic over invoices, payments and credit notes. Render the API's four
  figures; add nothing up (a badge would be a cache of a sum that drifts on the first correction).
- **Only an issued invoice owes anything.** The "What is owed" card is for `issued` only; a draft
  says "Not issued yet, so nothing is owed.", a cancelled one "Cancelled, so nothing is owed."
- **A negative payment is real**: a bounced cheque is a reversal with its own date beside the
  original, never the original edited away.
- **A credit note's reason is a dropdown category**, never a sentence: "how much did we write off
  to service failures" is a GROUP BY. Particulars go in the note beside it.
- The page names the **Manager** and the **Engagement letter(s)** its lines bill (linked), "Not
  set" on a hand-raised one. On a draft, the Manager is a quiet select saved as it changes
  (`PUT /invoices/{id}/manager`); issued, it is text (`MANAGER_NOT_STAFF` refuses non-staff).
- Folded forms: Record the e-invoice reference, Issue a credit note.

## Raise an invoice: who charges, in what currency

- **The company that signed the client's letters charges** (2026-09-28: the dialog defaulted to the
  first company, so an Indian client was numbered in the Gulf company's series). Choosing "Bill to"
  reads that client's `billable-engagements`: when every letter was issued by ONE company it is
  preselected and the letters named under it ("Issued EL-2026-0001."); with none, or several, the
  select stays on "Choose the company…" and `required` stops the form. A company cannot be changed
  on an invoice.
- "What is this for?" disables an engagement another company signed ("(billed by 10x Global
  FZCO)", `ENGAGEMENT_OF_ANOTHER_ISSUER`) or priced in another currency ("(priced in USD)",
  `ENGAGEMENT_IN_ANOTHER_CURRENCY`: a line takes the INVOICE's currency, and USD 3,000 became
  ₹3,000). When the preselected company's letters for the client are all in one currency, it is
  prefilled ("As priced in EL-2026-0007."); the rate still starts at 1.
- A **Manager** select (active staff from `/tenancy/colleagues`), preselected to the client's Key
  Manager from `/parties/{id}/assignments` (in force, still staff); the hint says where the default
  came from ("Key Manager of this client.", "Their Key Manager has left the firm.", "This client
  has no Key Manager.").
- The line form prefills the letter's figures through `formatCount`. **A section's fee is named,
  not prefilled**: a grouped engagement's `unitAmount` is null because the price is the whole
  section's; four services of a 5,000 retainer are billed 5,000, not 20,000, and the hint says so.

## Automatic billing (auto-invoice, 0318–0322)

Ashish's rule: no service is delivered unbilled. The daily sweep writes a **bill** for each period
fallen due on an engagement whose billing is set up; a person raises the invoice from it. **The
sweep never makes a period invoice**: a manager decides what goes on one (which bills, the tax, a
price the letter left open). The one automatic draft is the advance at signing.

### To raise (`src/app/invoices/to-raise.tsx`)

- One card per invoice that COULD be raised: client, company (the series), currency and manager
  (whose revenue), the four the API refuses to mix. Oldest bill first. A bill is named in the
  LETTER's words (`serviceName`: the line's own wording or the fee group's title, never the
  catalogue's), because that is also the invoice line's text and a client checks it against what
  they signed. `billLabel(d)` names any bill.
- Each card's **Raise invoice** is secondary (the header's is the brand button). Ticks are per raise
  and reset after any act (a kept untick left the button disabled with nothing saying why). The
  dialog asks per bill for the tax rate (prefilled with `lastTaxPercent`, the last invoice line for
  that work; starting at the letters' own when they agree) and, only where the letter fixed no
  price, the amount; no `asOf` (dated on the company's day).
- Rows say pro-rata ("17 of 31 days", "of ₹50,000"), **Overdue, also with <manager's manager>** once
  escalated (`escalated`, 7 days, computed by the API), and the API's `managerNote` in warn when the
  bill fell back to the Key Manager. A bill on a draft stays listed ("On a draft") until the invoice
  is issued; a cancelled invoice gives its bills back.
- **Skip** needs a reason, has no undo, and shows only to a login holding `billing:skip` (Partner
  and Manager by default; `canSkip`), and on an advance bill only once nothing waits on it
  (`advanceHoldsWork: false`). **Link** offers only the client's invoices from the same company in
  the same currency, not cancelled; on an advance bill Link is an admin's (a paid invoice starts the
  work). A second person acting on the same bill gets the API's `BILL_BUSY` sentence.
- **Show raised and skipped** reads `/billing/dues?status=all` when opened and after any act while
  open (the page's list is pending only since 0322's 14a).
- Without the fee axis amounts read Hidden; a priced bill is not asked for an amount. `priced:
  false` (never redacted) is "No price", and a login without fees is still asked the amount of a
  bill that has none.
- **A bill with no price** also lands on the client's SPOC's (for that Dept) and every
  administrator's My day, "Needs a price · with <manager>", until an amount is on a draft. Ashish
  asked for a weekly reminder to the SPOC, the manager and the admin: it is a flag counting weeks
  ("No price yet", "No price for 4 weeks", `noPriceWords`), the same on the To raise row. Nothing is
  sent.
- Sections below the cards: **To refund** (an admin's "Give it back" = credit note
  `advance_refund` with its tax, or "Keep it" with a reason; the screen says "Pay back ₹X" from
  `paid`, never more than was received, or "Nothing was paid, so nothing goes back."), **One-time
  work with no process** (Bill it now), and **Work done before its bill date** (Bill it now, Q071).

### Billing not set up, and the schedule

- `not-set-up.tsx`: recurring engagements the sweep cannot bill. A fee group is ONE row ("One fee:
  <title>"), and setting it sets the group.
- **Set billing** opens `BillingScheduleDialog` (`src/components/billing-schedule.tsx`) with two
  dates: **Bill from** (the first period billed; the API snaps it to the period's first day) and
  **First invoice on** (that period's invoice date; later ones follow one span after). One date
  cannot say whether 1 Nov bills October or November. The boxes open on the API's `suggestion`,
  never a date worked out here (a quarter or year is cut by the firm's financial year).
- The client's **Engagements** panel has a **Billing** column ("From July 2026 · First invoice 1 Aug
  2026", or "Not set up" in warn) with Set billing / Change (the same dialog, reading
  `/billing/unscheduled` for the suggestion; Change has **Stop billing**, both dates null).
  `billable-engagements` carries `billingFrom` / `firstInvoiceOn`.
- **Your firm → Automatic billing** (`#billing`): one switch, saved as switched, off by default, with
  a "Starts from" month select (two years back to a year ahead) beside it, sent WITH the switch;
  while on, "Change month". There is no firm go-live date: each engagement starts at its own Bill
  from. Work vs Billing reads `before_auto_billing` as a note.

### When a letter's fee is billed (0319, Q042, Q071)

- `BillingTimingControl` (`src/components/billing-timing.tsx`): the letter page's Services table has
  a **Billed** column and each fee section a "Billed" line. Monthly: "At the end of each month"
  (the default, and what a silent letter means; the bill is made on the period's LAST day since
  Q042, 0339) | "At the start of each month" | "On a date I choose" (a date box). Yearly (Q071): "On
  its annual filing's due date, else at the end of each year" (default) | "At the start of each
  year" | "Every year on a date I choose" (the existing `on_date`, which IS the "invoice setup at EL
  finalisation"). On a draft it saves as it changes (PATCH line / fee group `billingTiming` +
  `billingOn`); on a sent or signed letter it is the words the PDF prints. A one-off reads "Billed
  by hand", a grouped line "With its section". Signing with the switch on sets each engagement's
  schedule from it (the API's GoLiveScheduler), so those never reach Billing not set up. The
  builder's services step does not offer it yet.
- **`BillEarly`** (`components/bill-early.tsx`, Q071) on the job page (job done) and the task page
  (task finished): `GET /billing/bill-early?jobId=` / `?workItemId=`, nothing when there is nothing
  to offer. "Raise invoice now" writes the bill (`POST /billing/bill-early`) and takes the reader to
  To raise, where it is ticked and raised normally. No fee line without fees. My day lists
  `bill-early?mine=true` rows for the bill's manager under Today with no due day (an offer, not a
  deadline), opening the job.

### Advances (0320, 0322, 0363)

- **Every advance is a tax invoice**, drafted at signing, and **the work starts at once** (0322;
  Ashish). The SPOC, Key Manager and partner are reminded until it is paid, the admins weekly.
  Approve start is gone. An advance bill with no automatic draft (no tax rate, or its draft
  cancelled) has its own **Raise invoice** (no tick) and no Skip; a final bill (one-time work done)
  is marked; a bill with an issued advance says "Less up to ₹X advance" (the API takes it off,
  earliest bill first, before tax; a raise the advance pays in full answers `invoiceId: null` +
  `covered`: "No invoice needed"). Invoice lines name the advance invoice with no amounts in words.
- **Advances tab** (`advances.tsx`): every advance, pending first, Overdue first among them; the
  `AdvanceStage` pill (No invoice yet · Draft, not issued · Not paid yet · Part paid · Paid in full;
  "…, overdue" in danger) and one line (`advanceLine`: "No tax rate for <company>. Set one on Your
  firm.", "Waiting for an admin to issue it. Signed 2 days ago.", "₹20,000 of ₹59,000 paid. Issued
  today."); who is reminded under the letter. No buttons.
- **The letter page**: an **Advance** column for a service's own advance (`LineAdvanceControl`,
  saved on blur; no column on a letter with one advance for all) and an Advance card
  (`AdvanceStatus`) where "Record the advance" was (nothing writes `advanceRecordedAt` since T3, so
  the old "advance ₹X · outstanding" suffix is gone).
- **Your firm → Automatic billing** has nested `SetOnce` parts: **Advance reminders**
  (`#advance-reminders`: draft overdue after N days, unpaid overdue after N days from issue, the
  partner's grade from `/tenancy/grades` by RANK ("Director or above"; ranks shared by two rungs
  read "Director / Partner"; a rank no rung holds still shown), the weekly summary's weekday and
  hour in the firm's zone), **Default tax rate** (`#tax-rates`, one box per company,
  `AmountInput decimals={4}`), **Payment terms** (`#payment-terms`) and **Advances to be adjusted**
  (`#unmapped-advances`: the reminder's day of the month). Each saves its own partial
  `PUT /billing/settings`. The API keeps a rate it is not sent, so emptying a box that had one is
  refused on the screen ("It can be changed, not removed").
- **To adjust: advances taken before the letter** (0363, Q044–Q048): `src/app/invoices/adjust.tsx`
  (`AdjustTab`, `?tab=adjust`, its count the open ones in warn) reads `/advances` (`open` by
  default; "Show mapped and cancelled" reads `all`). A row: client and company, the invoice (Draft /
  number), who raised it and when, the paid pill, the advance before tax, each mapping (service and
  job, or "All services of EL-…" from a signed letter; amount, what bills took, whose revenue; ended
  ones keep who and why; "Left on a finished service" in warn), what is left, and a per-currency
  total above ("Left to adjust: ₹… · AED …", never added). **Raise an advance** (secondary; needs
  `advance:manage` and fees): client, Charged by, currency (and the feed's rate for another), amount
  before tax, tax rate prefilled from the company's default via `formatCount`, manager (blank = the
  client's Key Manager), a note; it lands on the draft. **Map** (an issued one with something left)
  lists `/advances/{id}/targets`: one amount box per service, a job select, a service in another
  currency or company disabled with the API's refusal; the dialog says when the total exceeds what
  is left. **End** asks why. **Give back** (`invoice:issue`) confirms the credit note. Without fees:
  Hidden, no actions. The same list is on the client page (Raise preset to the client). The letter
  page has **Advance received** (`components/advances-received.tsx`): on a draft, tick the client's
  issued advances and the amount, then Save; a warn notice when the letter also asks for an advance.

### My day's billing rows

My day reads `/billing/dues?mine=true` (one row per invoice to raise, "Raise the invoice:
Bookkeeping, Jul 2026 and 3 more", or draft to issue, due the last day before the oldest bill
escalates, so it turns Overdue the morning the manager's manager gets it; theirs reads "Escalated to
you · with <manager>") and `/billing/advances?mine=true` for EVERY staff login (the API answers only
what the caller chases, with `duties`). An admin sees "Issue the advance invoice", "Raise the
advance invoice", "Set a tax rate for <company>" or "Link INV/… as the advance"; anybody else on a
draft "Advance invoice: with an admin to issue", whose turn **An admin**; with no invoice yet they
may raise it themselves (`party:write`, the rate typed in the dialog). Issued: "Advance not paid:
INV/…" / "Advance part paid: INV/…", whose turn **The client**. The kind line names the letter,
"signed/issued N days ago" and "you are the SPOC, Key Manager"; "Escalated" a week after signing.
Dated `overdueOn` minus a day, and **Today until then** (dated by its due day, an unpaid advance sat
in the closed Later bucket for its first week; Ashish wants the reminder on the dashboard). A bill's
draft reads "Issue the draft invoice: …" to an admin and "With an admin to issue: …" to anybody
else (review 14b): issuing is `tenant:admin`.

### Work vs Billing (Q041, 2026-10-04)

`?tab=work`, `work-vs-billing.tsx`, from `GET /billing/work-vs-billing`: one row per client,
service and period with the work, the bill, its invoice and the money, and a sentence wherever a
person must act. The default view is read with the rest of the page, so the tab counts rows needing
attention (danger); it reads again only when a filter changes (Client, Manager, From and To months,
Only problems). `?client=` sets the client (the client page's Engagements card links there). A strip
(Need attention, Done not billed, Unpaid past due, Skipped; ageing as "N over 30 days") and four
columns so it fits 1280: **Client and service**, **Work** (pill, day done, filings under it),
**Billing** (bill pill and amount, date, invoice and payment pill, how late, what is owed), **Needs
attention** (flags in danger, notes muted, a link to the fix: Set billing, Automatic billing, To
raise). The API sends codes; `flagWords` / `noteWords` are the words. A retainer billed while its
month is open reads "Billed before the work is finished." and is never red. Without fees: "Fees
hidden", no amounts. **Download CSV** saves what the table shows, filters and all, built in the
browser (`lib/csv.ts`; no route, so no amounts for a login without fees).

## GST tax invoice and TDS (Q056, Q057, S5)

- **Invoice page** (`app/invoices/[invoiceId]/tax.tsx` + `page.tsx`): a Tax card (how it is taxed in
  words, place of supply, both GSTINs, reverse charge No, the client's TDS with a link to set it, the
  account it is paid into). On a draft, place of supply is a picker (`PUT /place-of-supply`; blank
  follows the client) and each line's SAC a quiet box saved on blur (`PUT /lines/{id}/sac`). The
  line table has a SAC column and the tax split under the rate; the foot has CGST/SGST (or UTGST,
  IGST) rows, then Less TDS and Net payable. `issueBlocked` also carries PLACE_OF_SUPPLY_UNKNOWN and
  INVOICE_LINE_NEEDS_SAC, shown where Issue would be. Payments: "Amount received" plus an optional
  "TDS deducted" (hint: the expected TDS), a TDS column, "TDS deducted" on the owed card.
- **Round off (Q087)**: Your firm → "Bank details and LUT on invoices" has a Round off switch per
  company (`PUT /firm-entities/{id}/round-off`; the hint says an Indian company starts on, 0380); the
  invoice page prints a Round off row above the Total when `totals.roundOff` is not zero.
- **Catalogue** service form: a "Tax on the invoice" card, SAC (India) and GST rate %, written into
  `body.tax.IN`; other countries' entries kept as the body had them.
- **Your firm** (`admin/firm/invoicing-card.tsx`, `#invoicing`): each company's GSTIN, bank accounts
  (Add, Replace, Take off; one per currency plus a general one) and, for an Indian company, LUTs by
  financial year. Self-contained: loads `GET /invoicing/companies`, reloads the page after a write.
- **Client** (`clients/[partyId]/tds-card.tsx`, `#tds`): the TDS it deducts (section + rate) or none.
- **Series** (`admin/brand`): a live warning when an Indian company's prefix makes a number longer
  than 16 characters (Rule 46(b), Q080). Never a refusal: the choice is 10x's.
- **Readiness**: the `tax_invoice` line and its gaps (no GSTIN, no bank account, no SAC, no rate).
- No e-invoicing (Q056).

## `/receivables`

- **The DECISION QUEUE is the point of the screen.** A machine may chase a client; only a person may
  put one on credit hold or send a matter to lawyers. The worker climbs to those rungs and stops;
  the queue shows the client, the invoice number and what is outstanding NOW, all joined by the API
  (building this screen found the collections list returning a `partyId` with no name or number and
  the dunning queue returning an `invoiceId`: approving a uuid for credit hold. Fixed in the API;
  the backend smoke asserts the client name). Rejecting is as prominent as approving.
- Charts (W5): a strip (Outstanding, Overdue, each with its invoices) and "How late the money is"
  (the dashboard's six buckets, lateness from `browserDay()` via `daysBefore`) beside "Who owes it"
  (top six, then Everyone else), from the SAME rows as the table, no new call. **Currencies are
  never added**: the rows carry no rate, so a firm owed in several gets a tab per currency. Nothing
  when nothing is owed, or when amounts are hidden.

## `/dashboard`: the gaps are the point (T3.7)

- **The MRR figure is not the feature; the list of what MRR could not count is.** The API returns
  every exclusion with its reason and the screen shows them beside the figure, not behind a
  disclosure. The first run on real data found **1,490 engagements stating no billing frequency
  against 34 that counted**; a tidier screen would have shown ₹31.2 lakh and looked complete. Each
  reason has its own sentence: `unpriced` (agreed work never priced), `no_frequency_stated` (the one
  to go and fix), `one_time` (real revenue, not recurring).
- **DSO can be null, and null is not zero** ("0 days" reads as excellent collections). **DSO is a
  ratio** (2026-09-28): owed ÷ billed in the last 90 days (issued invoices less their credit notes;
  drafts and cancelled left out) × 90, worded "What is owed equals about 45.6 days of billing (last
  90 days)", never "Paid on average 45.6 days after invoicing" (₹76,700 owed over ₹1,51,400 billed).
- **Every ageing band is shown, including empty ones** ("nothing over 90 days" is the most
  reassuring row; a table that changes shape is unreadable week to week).
- **The currency is stated once, at the top**: every figure arrives converted at the rate stored on
  its document, never today's rate (which would change last quarter's MRR every morning).
- **The page is behind the FEE AXIS, not a role**, the first place that axis GATES rather than
  redacts: a page of nulls would say "the firm has no revenue". The API answers 403 naming the fix;
  the link is offered only to `principal.commercialVisibility` (not implied by being a partner).
- **Billing by company** (W5): small multiples, one area chart per company in its own currency
  (they cannot share an axis; four hues on one chart failed a colour-blind check), four in a row at
  1440, and "All companies, in INR" above them from the API's per-month total. A company with fewer
  than two months of invoices says "Charts appear once two months have invoices." Read:
  `GET /dashboard/revenue/by-company` (backend CLAUDE.md, "Billing by company").
- **Revenue by manager** (`src/app/dashboard/revenue-by-manager.tsx`,
  `/dashboard/revenue/by-manager?months=12`): a **Period** select (each month, newest first; **This
  financial year** from the firm's `financialYearStartMonth`, offered only when set, so nobody is
  assumed to start in April; the whole window). Columns Manager, Billed (before tax, less credit
  notes), Collected (cash, with tax), Owed now (today, with tax; does not move with the period),
  Invoices; one line says which include tax (the three are not meant to add up). Biggest billed
  first; **No manager** always last while it has a figure; a **Total** row equal to the firm. A
  leaver keeps their row with a **Left** pill; an unknown id reads "Not on your staff"; a row with
  nothing in the period and nothing owed is hidden. Sums are `sumSigned`, the sort `commonUnits`.
- **Revenue report** (Q049, `app/dashboard/revenue-report.tsx`, under Revenue by manager): By
  (Manager / Originator), From, To (default: this financial year to date, the firm's own year),
  Company, Currency. **One table per currency with its own total; never a figure across two
  currencies**, nothing converted (Revenue by manager above still converts at stored rates). The
  nobody row by manager reads "No manager yet (incl. advances not adjusted)" on screen and in the CSV
  (Q085). Download CSV: one row per person and currency, then each currency's total.

## Walks

`bib/demo-assets/tools/`: `ai-walk.mjs` (on `ai-fixture.mjs`, sweeping that one firm with
`ai-sweep-tenant.mts`), `ai-1b-walk.mjs` (16), `ai-t3-walk.mjs` (fresh fixture with NO default tax
rate, so the advance is raised by hand; FIFO and the refund), `ai-adv-walk.mjs` (settings, signing,
each role's My day, issue, a week on with signing moved back by psql on THAT tenant only, the weekly
email in Mailpit via `ai-digest-tenant.mts`), `adv-walk.mjs` (50, fresh `adv-fixture.mjs` each run),
`wvb-walk.mjs` (50, both logins' CSVs), `bdr-walk.mjs q071` (38, `bdr-fixture.mjs`) and
`bdr-walk.mjs q049` (29, `bdr-rev-fixture.mjs`), `gst-fixture.mjs` + `gst-walk.mjs` (46; each run
needs a NEW ids file: it chooses a place and types a SAC), `ans-walk.mjs` (29), `fix4-walk.mjs` (17).
They pace themselves under 300 requests a minute (CLAUDE.md (Verification)).
