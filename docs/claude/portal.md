# The client portal: a second audience's app (T6.5–T6.8)

Everything else is the **10X Workspace**, read by the firm. `/portal` is read by the firm's
CLIENTS: the two share a design language and nothing else. A `CLIENT_PORTAL` session only; a
staff session is sent back to the workspace.

| Route | Is |
|---|---|
| `/portal` | "What's happening": what the firm is doing for the companies this contact was granted, what is held up, what has been filed |
| `/portal/requests` | "Requests": what the firm has ASKED them for (`ActionCentre`) and what they have asked the FIRM for (`AskTheFirm`), together |
| `/portal/documents` | the client's library: every document shared with them, searchable, each downloads |
| `/portal/invoices` | what the firm has billed them and what is outstanding |
| `/portal/month` | one calendar month: filed, added, billed, what the client sent back |
| `/portal/account` | the client's password (`auth-and-session.md`) |
| `/portal/accept-invite` | NO SESSION: where an emailed invitation lands |

## The frame (`src/app/portal/layout.tsx`, `portal-frame.tsx`)

- **`AppShell` treats every `/portal` route as bare**; the portal renders its own frame: `.shell`
  + `.sidebar` + `.main`, reusing `.brand`, `.nav`, `.nav-link`, `.nav-icon`, `.sidebar-foot`,
  `.who`, `.avatar`, `.topbar`, `.crumb` with no new CSS: *a different audience, not a different
  design language*. (A tab strip was tried first; Shrestha, 2026-09-01: "everything looks messy".)
- The rail has five links: What's happening · Requests (counted) · Documents · Invoices · Month by
  month. **No groups** (five items have nothing to hide), **no search box** (searching five things
  implies more behind them), **no firm switcher** (a contact belongs to one firm's portal). It
  DOES carry icons (siblings at one level).
- **The frame names the FIRM and the COMPANY**: without the firm the reader does not know who is
  doing the work; without the company, a contact for two group companies cannot tell whose filings
  are on screen. Both come off `/auth/me`: `portalScope` is `[{clientPartyId, clientName}]`, the
  shape the portal home's `companies` uses. No eyebrow naming the firm on a page (the rail and the
  bar do).
- **The sidebar's foot names the COMPANY where the staff one names a role.** `client_contact` /
  `client_viewer` is the firm's word for what somebody may do; a client cannot act on it.
- **`portalScope` NULL and `[]` are different facts and never draw the same.** Null is a staff
  session; empty is a contact invited and granted nothing, and the page says so at length, naming
  the firm to ask. A blank page there is indistinguishable from broken software.
- **`/portal/accept-invite` renders with no session and must keep doing so**: the token is the
  authorisation.

## What every portal page obeys

- **NO DEADLINE THIS PRODUCT INVENTED.** A statutory date is shown because the law set it;
  everything else shows how long the work has been open. The API sends `statutoryDueOn` null on the
  rest; never fill it in. The one invented date shown is an invoice's `dueOn`, because it is
  already printed on the invoice the client holds.
- **Dates**: a `YYYY-MM-DD` is split (`longDay`), an instant is the reader's zone
  (`money-and-dates.md`).
- **The client's own company name is shown once.** A calendar-raised task is titled *"Quarterly
  TDS statements — Cobalt Foods Private Limited — Q1 FY2026-27"*; on the client's own page the
  company third is already in the rail and the bar (and it pushed a one-row table into a scrollbar).
- **Two empty states, two sentences**: "Nothing shared with you yet" (ask) is not "nothing matches
  what you typed" (search differently).
- **Never a sentence that lists what is NOT here** ("sending files across is not here yet" sat
  under a working file picker, was rewritten, and went stale again within one task). The nav is the
  fix; the footers that listed absences are gone (W4C).
- What opening it found, invisible to every gate: "Filings coming up" over five rows already past
  and Missed; one filing listed twice (the law's row and the firm's task); two chip tones for the
  same fact in two tables.

## `/portal/documents` (T6.7)

- **Not windowed.** The home shows ninety days ("what is happening now"); the acceptance line here
  is *"a client finds LAST YEAR's challan"*. Filtered in the BROWSER across title, filename and
  what it is about (tens of documents, not hundreds).
- **A table, and the search appears only above eight rows** (a box over one document implies more
  behind it). Cards per document were a two-minute scroll at thirty; it matches `/portal/invoices`.
- **The download is a `fetch`, never an `<a href>`** (`shell-and-navigation.md` (Shared panels)): there is no pre-signed
  URL and never will be, the bytes come through a route that passed every scoping rule, and only a
  button can show it is working or show a refusal.
- **It says what is not in it**, without a list: a document appears because the firm marked it
  client-visible (0066), so the page says "Missing something? Ask … to share it".

## `/portal/invoices` and `/portal/month`

- **`/portal/invoices` does no arithmetic.** Four figures per row, each a decimal string from
  `crm.invoice_balance`, printed through `formatMoney` (`₹1,47,500.59`, no `.00`). No total across
  rows (currencies this page cannot convert), no "pay" button (nothing in this product takes
  money; payments are P11). Drafts are not listed; a cancelled invoice is, marked.
- **`/portal/month` says it is a page and not an email** (transport is P10), so nobody wonders why
  their inbox is empty on the first. The month picker sits in the header. Months are built by
  decrementing an integer.

## The action centre: the client can DO something (T6.6)

`src/app/portal/action-centre.tsx`, first on `/portal/requests`. Each row was addressed to this
client and carries the control that answers it; "Held up" on the home stays (a firm can wait on
several things), and a held-up card with an open ask (`hasOpenAsk` on the work row) points at the
ask instead of repeating it.

- **Three kinds, three controls, and all offer the text box too**: `document` draws a file picker,
  `question` a text box, `approval` two buttons, and every one also takes text, because *"we hold
  none, the shop closed in 2019"* is a real answer the API accepts.
- **`portal:respond` decides what to OFFER.** A `client_viewer` sees every ask and gets no control;
  that is the whole difference between the two portal roles. Reading is not behind a permission:
  being granted a company is the authorisation to read it.
- **"Sent — with the firm" is a second section, not a filter**: a reply does not close an ask (the
  firm decides), and somebody who sent the wrong file must still see what they sent.
- **THE FILE IS NOT SCANNED AND THE PAGE SAYS SO**, on the upload control and again beside the
  file on the firm's screen. There is no scanner; a page implying otherwise would be the lie the
  backend refused to write as a `scan()` returning "clean".
- **No due date anywhere, and no field to type one** on the firm's side either: the firm has never
  published turnaround times.
- The firm's half is `ClientAsks` on the task page (`delivery-work.md`).

## Ask the firm (T6.8)

`src/app/portal/ask-the-firm.tsx`: the first thing a client can START. Its staff inbox is
`/client-requests` (`delivery-work.md`).

- **It lives beside the action centre, on `/portal/requests`.** The two are one subject read from
  opposite ends (*what the firm waits on you for* / *what you wait on the firm for*), so they moved
  together. They sat on `/portal` until the home grew to 4,489px with seven sections and "Ask the
  firm" was 1,640px down: on the home page and unfindable (reasoning in the page's header comment).
  Order: waiting on you, then what you sent, then what you asked.
- **Its split is not the action centre's**: a request sorts on whether the firm has come back
  (`awaitingFirm`, then `replied`); **`settled` stays visible**, because *"did I already ask for
  this"* stops the second phone call.
- **`portal:request` decides what to offer, and is not `portal:respond`** (a firm may want the
  clerk who sends registers not to open requests); `client_viewer` holds neither.
- **Nobody at the firm is named on the client's copy of the thread**: `authorName` is NULL on every
  firm reply (the API drops it; the firm's screen reads the same table and needs the names). The
  client's own colleague is named (a company with two directors needs to know which asked).
- **One company needs no picker** (a select with one option is a decision that cannot go wrong);
  the value still goes up, and the database refuses a company this login was not granted.
- A request's reply box opens on **Add to this** (it was an open box and a brand Send on every
  card, W4C).

## Reminder dates are dates, never counts

`lastRemindedAt` on an ask and `lastNudgedAt` on a filing omit the tally the database holds: *"We
have reminded you 4 times"* is an accusation on somebody's own page (and "9 times" within a
fortnight on a daily rung); WHEN is what a client can act on. Null draws nothing (an ask) or
`<NotSet>Not yet</NotSet>` (a filing): a firm with no published ladder reminds nobody, the
shipped state, not a failure to report. **The firm's
side is the opposite**: `ClientAsks` prints *"Reminded 3 times — first on …, second on …"*, so a
colleague does not chase again by hand.

## The client-visibility switch (T6.7)

`files.document.is_client_visible` decides whether a file is in the client's library, enforced by a
database policy. *A flag the portal enforces and no screen can change is a wall against a value
nobody can move*, so the switch ships as a column on `<Documents>`, and the task page
(`/work-items/[workItemId]`) mounts `<Documents>` with the task's client as `partyId` (a client's
uploaded answer files itself against the job that asked, `subject_kind = 'work_item'`). A document
with no client belongs to the firm: the cell says so instead of offering a control the API would
404. **Flipping it RELOADS the list**, never patches the row: a local guess must not stand on the
control deciding who outside the firm can read a file.
