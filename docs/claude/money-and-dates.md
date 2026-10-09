# Money and dates

## Money never becomes a number

The API sends amounts as decimal **strings** (a JS number cannot hold 1499.50 exactly) and this
app keeps them strings all the way to the screen.

- **`formatMoney`** (`src/lib/api/client.ts`) hands the string to `Intl.NumberFormat`, which
  formats a decimal string exactly; `format(Number(amount))` would undo the whole arrangement at
  the last moment. That is why `tsconfig.json` pulls in `ES2023.Intl` (the runtime has had exact
  string formatting for years; only the ES2022 declarations lack it).
- **The shape (Wave 4), and none of it follows the reader's browser**: INR in Indian grouping with
  the rupee sign (`₹12,00,000`, never `₹1,200,000`); every other currency with its code in its own
  grouping (`AED 5,000`); no `.00` when there are no paise (`₹25,00,000.50` keeps them, `₹1,800`
  does not; a check reading a figure off the screen must not expect the PDF's two places).
  `formatMoney(null)` is "Not set". `previewAmount(amount, currency)` groups INR in lakhs while
  somebody types; `axisMoney` is for chart ticks only.
- **`formatMoney` is THE screen formatter.** The documents keep the PDFs' own words, because a
  preview must say what the paper says: `pdfMoney` / `FREQUENCY_WORDS` / `totalWords`
  (`proposal-document/words.ts`, restating the proposal renderer, INR in lakhs since it restates
  the renderer's `inLakhs`) and `letter-builder/words.ts` (the letter PDF's words, western
  grouping: "INR 5,000.00 per month"). Never mix the two on one screen.
- **Never add money across currencies, and never add in the browser what the API can sum.** When a
  screen must add (per-frequency totals, period sums), use `addDecimals` / `sumSigned`
  (`lib/money`) on the API's strings, and sort with `commonUnits` on bigints. `toMinorUnits` is for
  what a person TYPES and refuses the API's four-place strings (`"25000.0000"`); `scaledUnits`
  takes them. Where several currencies appear, show one total (or one tab/table/chart) per
  currency.
- **A `null` amount is the fee axis**, not zero and not an error: a login without commercial
  visibility gets the record with its money removed. **Show "Hidden", never "Not set"** (audit F10:
  "Not set" reads as "the firm forgot"): use `<Money>` / `<MissingMoney>` from
  `@/components/fees`, which print Hidden when `useSeesFees()` is false (the session's
  `commercialVisibility`) and the `unset` words otherwise. A STATUS is not money: "Not issued" is
  decided by `issuedOn`, never by a null balance. `priced: false` on a bill is "No price", never
  redaction.
- **What a login without fees is not offered (F33, B01, B27, B09).** The API refuses it every money
  write (manual invoice, lines, payments, credit notes, a refund, a lead's value, a catalogue
  service) and every PDF that prints fees (`Document.showsFees`), so the screens do not offer:
  Raise an invoice, Record a payment, Download on a fee document ("Shows fees"), the proposal /
  letter preview (one line instead), Receivables in the nav. The builders still let it pick
  services: a tick sends neither fee nor note (the API quotes the list price), and Details saves
  with `feesUnchanged`, so a fee is never overwritten with the null it was shown.
- Input boxes for money: `<AmountInput>` + `cleanAmount` (`forms-and-inputs.md`).
- **CSV**: `src/lib/csv.ts` is the one CSV writer: a UTF-8 BOM (or Excel garbles ₹ and names), RFC
  4180 quoting, CRLF, and OWASP's formula guard (a TEXT cell starting `= + - @` gets a `'`; number
  cells stay numbers so they still sum). Amounts as plain decimals with a Currency column, days as
  `YYYY-MM-DD`, statuses and flags in words. A CSV is built in the browser from rows already on
  screen, so the fee wall holds.

## Dates live in `@/lib/day`

`browserDay` · `longDay` · `monthYear` · `longInstant` · `longInstantTime` · `localDate` ·
`instantDay` · `longMoment` · `daysBefore`, each defined once. Import; never copy the nearest one
(there were once six `browserDay`s and nine `longDay`s in four versions).

**The field's TYPE decides which rule applies**, and getting it backwards is silent for everyone
on one side of Greenwich:

- **A `YYYY-MM-DD` date is SPLIT, never parsed** (`longDay`, `monthYear`; compare as strings). A
  statutory deadline is the same day for everybody, and `new Date("2026-09-20")` is UTC midnight,
  which prints as the 19th west of Greenwich.
- **An instant (`…At`: `raisedAt`, `writtenAt`) is PARSED** and shown in the READER's zone
  (`longInstant`, formatted by hand because `toLocaleDateString`'s ORDER follows the locale).
  Reading its UTC fields showed a request raised at 00:20 in Delhi as the day before.
  `longInstantTime` where the minute matters (acceptance evidence); `longMoment` for a settled
  checklist line (who and when, with the clock).
- **Today is `browserDay()`, never `new Date().toISOString().slice(0, 10)`.** That is the UTC day:
  a firm in India is on the next date from 00:00 to 05:30 (five screens shipped with it and
  under-reported what was overdue 5.5 hours a day; the account-team panel read "as of 29-08" on the
  30th at 04:11 in Delhi). **A calendar day is the caller's fact, and this app is the caller**: send
  it as `asOf` wherever the API decides "overdue", "today" or "how late" (`/my-clients`, the
  board, the calendar's decisions `daysLate`, My day).
- **Months are counted by decrementing an INTEGER**, never `setMonth(m - 1)`, which on the 31st
  lands in the wrong month (shows three days a quarter).

### A company's documents are dated on the COMPANY's day (0337)

Each of the firm's companies has its own year and time zone, and the API dates its invoices,
letters, acceptances, credit notes and raised bills on that company's day. So Issue, the due date,
credit notes, Raise, refunds, every letter Send (builder and letter page), a signature recorded by
hand and the letter preview send **no `asOf`**; a sentence naming the day Issue will use reads the
invoice's `issuesOn`.

- **Exception: a recorded acceptance** is the RECORDER's statement, so it sends
  `asOf=browserDay()` (letters and proposals); the API holds it to the company's day or one either
  side.
- **Year labels are the API's** (`financialYearLabel` on an invoice, `label` on a series:
  `2026-27`, or `2027` for a calendar-year company), never built from `financialYear`.
- Reminders and buckets ("Overdue", "Today") stay on `browserDay`.
- Your firm → Companies shows "Year and clock" and sets both in Add / Change
  (`src/app/admin/firm/company-calendar.tsx`).

### A filing is late on the FILING's day (S3, 2026-10-05)

The calendar's legal deadline is late on the filing's own day (`row.filingToday` from the API,
`pastLegalDeadline`), never the browser's; the start-by date stays on `browserDay`. A zone name
("Dubai time", "New York time") is shown under a deadline whose clock reads differently from the
reader's, **compared by wall clock, never by zone name** (Chrome calls India `Asia/Calcutta`, and a
name comparison put "Kolkata time" on every Indian row).

### The firm's own time zone

Set on Your firm (`#time-zone`, `lib/ui/time-zone.tsx`; it moved off Structure, where nobody found
it). Not chosen reads "days follow UTC, not your country". The list includes "United States,
Pacific (America/Los_Angeles)" (Q075: 10x's US company keeps LA time).
