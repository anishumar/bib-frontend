# The compliance calendar, the rules library, and filings on a service

| Route | Is |
|---|---|
| `/calendar` | what each company owes and by when; tabs for coverage (WHY an engagement produced nothing) and decisions (missed deadlines waiting on a partner) |
| `/admin/obligation-rules` | **the LIBRARY** ("Compliance rules"): what the law asks and when; write the due formula, add a carve-out, confirm, set T–X, retire, see where each rule is USED. No service is chosen here |
| `/admin/obligation-vocabulary` | "Calendar words": the states a filing moves through, and what may be decided about a missed one |
| `/catalogue/[serviceKey]?tab=filings` | **the ONE place a filing is linked to a service** (T6.16) |

## `/calendar` (T3.2)

- **Read-only, and must stay so.** No "add a filing" (no endpoint, and never will be): every row
  falls out of the firm's rules, entities and engagements. A typed-in row could disagree with the
  statute (the Excel this replaces, inside Postgres). People change the RULES.
- **Ordered by the INTERNAL target, not the legal deadline**: `statutoryDueOn` is the law;
  `internalTargetOn` is the firm's T–X, when work must START. Both are on the row and go red
  separately. The LEGAL deadline is late on the filing's own day (`row.filingToday`,
  `pastLegalDeadline`, `src/app/calendar/filing-clock.tsx`); the start-by date on `browserDay`.
  A zone name shows under a deadline whose wall clock differs from the reader's (`money-and-dates.md`).
- **Every row is marked "unconfirmed rule" until a partner ticks it**: the shipped dates came from a
  previous vendor's document. A plausible wrong date must not look like a checked one.
- A filing taken off when a service stopped including it is not shown (the API leaves it out; the
  calendar filters nothing itself: a second filter in the browser is a second answer to "what is on
  the calendar").
- S3 rows: a row filed by a period job's task says "Filed by <task>"; a `rule_fallback` row says
  "Using April: no year end recorded for <company>" under the COMPANY cell (the period cell is
  nowrap and the sentence there widened the table past the screen). The weekday letters are 14px.

### The coverage tab is the point of the screen

An empty calendar means nothing is owed, a rule is missing a fact, or the software is broken; only
one is somebody's to fix. The tab names every live engagement the calendar produced nothing for,
WITH A REASON, and **says none of them is an error**: `no_rule_names_this_service` (now "no filing
is on this service", saying conditionally where to add one) is the ordinary state of advisory work
and sorts LAST. Reasons are grouped (four different jobs) and each group's next step links to where
the fix is (`where`, incl. `/catalogue`): an unregistered company is fixed on its client page; a
filing for another country is written on the service; `rules_unconfirmed` goes to the library
(adding a filing confirms it, so this state means somebody unticked it there). One line keeps "Not
an error: most advisory work has none". The coverage line no longer claims "Every period so far
ended before the engagement began".

- **The deep link into the rules screen appears only where there is something to FIX.**
  `blockedRuleIds` is populated for every reason, `nothing_due_yet` included; a "47 rules →" link
  beside a healthy engagement landed on "the rules that blocked this engagement's calendar". The
  `REASONS` table records which reasons have a fix, and the link reads it. It deep-links
  `/admin/obligation-rules?rules=…`, which focuses exactly those rules with a banner.
- **`entity_not_registered` exists because opening this screen found it**: three engagements read
  "no rule names this service" at a firm with fifty-seven rules; nobody had registered the companies
  as legal entities, and a rule matches an entity's jurisdiction exactly.

### The decisions tab: where money gets decided (T3.3)

A passed deadline is **not an error and not hidden**: it is a choice with money on both sides (file
provisionally, accept the late fee, record that it never applied) that used to happen on WhatsApp.

- **Its badge is toned whenever non-empty**, not only when selected: a queue of undecided client
  money, visible from across the room.
- **A WORKLIST, not a window**: no date filter (a filing missed in April is still owed in September);
  oldest first.
- **`daysLate` is computed from the day the BROWSER sends** (`asOf`).
- **The form is collapsed until somebody acts, and the REASON is why it is a form**: a single
  "Resolve" loses why (what the client asks about). API and a CHECK refuse a blank reason; the button
  is disabled before the click, the server's sentence is what gets shown.
- **It says where the filing goes NEXT before the click**: *"the filing still has to happen"* or
  *"this ENDS the filing"*, from `closesWithoutFiling` on the firm's own option row (a firm adding
  its own answer gets the right sentence).

## `/admin/obligation-vocabulary` (T3.3)

The states have been ROWS since T3.2 so a firm can rename them; nothing could write them until T3.3.

- **The tick boxes are mechanism, and the screen says which is which.** Four are DESTINATIONS
  (starts here · filed here · missed here · decided here; exactly one of each per firm), drawn as
  **radios** (a checkbox that refuses to untick reads as broken; marking another moves the flag in
  one step). Two are DESCRIPTIONS of what is true once a filing is there.
- **A control that would contradict is DISABLED with a title saying why, never hidden**: "Missed
  here" is unavailable until "needs a decision" is ticked, and the tooltip says the filing would move
  there and nobody would be asked.
- **Resolution options read as a sentence** (*"the filing still happens, late"* / *"it will never
  be filed"*), never `closesWithoutFiling`, and every seeded option carries **unconfirmed** (from the
  app this replaced; the firm never confirmed the list).
- Rows use `<Input variant="quiet">` (W4C); name and rank commit on blur or Enter.

## `/admin/obligation-rules` — the library (T3.2, T6.4)

- **Most shipped rules cannot produce a date, and that is not a fault list.** Forty-seven of
  fifty-seven say, in the firm's words, the one fact each is waiting for. **Tabs with counts** (W4C)
  replaced the counts paragraph and filters: All · Producing dates · Not used by a service · Not yet
  confirmed · Waiting on a fact · Event-driven · Retired (an empty tab is left out except the four a
  partner looks for). An arrival at an all-retired chain still shows its rows. Authority is a line
  under the filing's name. **The "waiting on a fact" count is a BUTTON**; a separate "answer these
  47" checklist was refused (it measures COMPLETION, and most firms rightly never answer rules their
  clients do not owe); the outcome-linked surface is the calendar's coverage deep link.
- **The editor opens under its own row** (`rule-editor.tsx`), with the page's notice and refusal in
  it (it used to open after all 58 rows).
- **The lead time is a blank, not a default**: every rule ships at zero (the task appears on the
  statutory date: visibly useless, deliberately, because T–X is the firm's practice). It commits on
  **blur**. Start early is greyed with the reason.
- **WHAT IS NOT EDITABLE IS THE DESIGN.** Jurisdiction, name and rule pack are a rule's identity and
  every generated filing pins the row; no Delete. **How often** and **the financial-year start** are
  editable only while the rule has produced nothing (they decide where a period BEGINS); disabled
  with the sentence rather than a 409.
- **The formula and its reason are ONE control** (a radio): a CHECK refuses a rule holding both or
  neither, so two inputs made the commonest edit (answering a rule) fail unless the reason was also
  cleared. The form cannot express what the database refuses.
- **The formula is rendered as a sentence** a partner checks against the statute ("Every month · the
  20th of the following month"), never `dueMonthOffset: 1`. The first version produced "Once a year,
  day 15 3 months after" and, for an event-driven rule, "30 days after the period ends" (wrong: an
  event rule has no period). `describeRule` (exported from `rule-editor.tsx`) is the one wording,
  used by the library, the catalogue's list, its picker and its confirmation.
- **EVERY WRITE REPORTS WHAT IT DID TO THE CALENDAR**, which half is which: "4 filings added; 14
  already there moved to the new date; 3 left as they are — somebody has already started them",
  from the API's `RuleEffect`, never inferred from a 200.
- **"THE LAW CHANGED" IS A DIFFERENT BUTTON FROM EDITING** (`supersede.tsx`). Editing a formula is a
  CORRECTION (recording the law properly for the first time). The amendment keeps the old rule (it
  governs every period before the cutover and explains the filings it produced): the panel says both
  halves first, asks for the first PERIOD that uses the new rule (never "today": August's return is
  August's law though due in September), prefills no date, and shows BOTH formulas side by side. A
  rule that already hands over is not offered the button; it shows its hand-over and points at its
  successor.
- **A NEW rule defaults to COMPUTING A DATE** (it opened on "waiting on a fact" with an empty
  reason, so the first Write was always refused; somebody typing a rule knows when it is due). The
  pack prefills as `firm@<year>`, editable, clear of the shipped `gst-in@…` namespace. The form says
  a rule written here is on no service and adds nothing until added to a service in the Catalogue.
  The editor never pre-fills a due date (empty boxes, "e.g." placeholders). "Periods follow" (S3):
  one year for everyone / each client's year end / each client's assigned period (needs the group,
  e.g. VAT), locked with the period shape.
- **The editor's "Owed by clients who bought" picker is gone** (T6.16, next section).
- **Rows list every row of a chain**, each with its own formula (what Edit edits). The row in force
  adds "From April 2027: …"; any other row says what today's filings follow ("Not in force yet.
  Today's filings follow the earlier rule: the 20th of the following month."). Which row governs
  today is always the API's answer.
- **Every row says where it is used**: "Used in: <service>" (each a link to
  `/catalogue/<key>?tab=filings`) or *"Not used by any service, so it adds nothing to the calendar"*,
  never a blank (said only where the pill does not already say it and a formula exists). `coverage`
  has `unlinked`, un-toned (using a filing is a choice, not a job), with its own filter and count.
- **Arriving at `#rule-<lineageId>`**: the anchor is the CHAIN, on its first row as shown (a law
  change gives the chain a new newest row; a row id would go stale). The hash is read on the FIRST
  answer only and on `hashchange` (a fragment-only change is a same-page jump the browser makes,
  under the bar: measured 63px under before the listener); retired rows show when the whole chain is
  retired; scroll through `scrollBelowBar`; every row of the chain gets `data-arrived` (`.table` in
  `components.css`: hover ground and an ink edge, never a status colour); the row is `tabIndex={-1}`
  and focused with `preventScroll`, so the next Tab is its first control. Never on a reload.
- **Local refusals before any call** (`RuleEditor`): name and pack non-empty, a two-letter country, a
  day 1–31, a reason when there is no formula; sentences in the field's `error`, focus to the first
  below the bar (`forms-and-inputs.md`). The API-only refusal (a name already taken in that pack)
  arrives in the `refusal` slot; a local refusal calls `onRefused` and the library clears its
  `ErrorNotice` (both showed at once).
- **Draft packs (S3, 2026-10-05)**: Load the UAE / Singapore / US draft pack (unconfirmed, on no
  service).
- Known and left for its own change: the table is wider than a 1440 window (the Filing column's long
  reasons set its width), so the When column starts off to the right inside its scroller.

## Filings on a service (T6.16, 2026-09-26)

A rule used to name AT MOST ONE service ("Owed by clients who bought"), and blank meant **every**
service: that blank sent 98 GST filings to a bookkeeping-only client on 2026-09-18, and a filing two
services owe had to be written twice. **The firm's idea is the shape now**: building a service you
say what it files; a service carries any number of filings; a filing written once is in the list for
the next service. Decisions the screens render:

1. **A rule on no service adds nothing.** "Every service" is gone; the catalogue is the ONE place a
   filing reaches a client (two places to say "which service" is how answers drift).
2. **Removing a filing from a service withdraws its untouched upcoming filings** for clients no other
   service of theirs covers. Kept and marked, never deleted; anything started, filed, decided or past
   its date stays and is counted.
3. **`/admin/obligation-rules` stays the LIBRARY.**
4. Built before the SFF freeze.

**The links are not versioned, by design.** Everything else on a service is a published, frozen
version; a link hangs off the catalogue ENTRY (`entry.entry.id`, kept by `serviceRow` as `id`), so
adding a filing needs no new version and a draft-only service can carry filings. A proposal pins a
version for its PRICE; what the law asks of a client is not a term agreed with them.

### The Compliance filings tab (`src/app/catalogue/compliance-filings.tsx`)

Since W4B it is a tab of `/catalogue/[serviceKey]` (it was the foot of a card on one long page); the
tab names the section, "Also used in" links to the other service's filings tab.

- **Each filing carried**: name, who it is filed with (said once: "GST · GST" came from the pack
  naming both authority and grouping "GST"), today's due rule and the next change in words, a status
  pill and SENTENCE (on the calendar for this service's clients registered in India / date not known
  yet: *the rule's own reason* / event-driven / not confirmed / retired), and "Also used in: …".
- **"Add a filing"**: a searchable picker (Popover + Command, the `month-view.tsx` precedent) over
  the whole library, grouped by the statute's `module` (GST / TDS / MCA, never the firm's Dept); each
  option says its due rule and how many services use it. The cmdk item's VALUE is the rule id and the
  words are `keywords` (cmdk treats two items with one value as one; "TDS return" exists in two
  countries). `collisionPadding={16}` keeps a gutter on a phone.
- **Choosing an UNCONFIRMED rule opens an inline confirmation**, never `window.confirm`: the dates in
  words, the exceptions (today's row's: a successor inherits none), that nobody at the firm has
  checked them, which other services it is confirmed for, and that a zero lead time means work starts
  on the legal date. Adding it confirms it (the API's path and event; `willConfirm` stays on the
  newest row because it predicts what the API does). A confirmed rule is added on the click. A rule
  waiting on a fact is added WITHOUT a confirmation (no date to confirm), and the sentence after says
  nothing went on the calendar and why.
- **"Write a new filing"** is the library's editor rendered `bare` (a card inside a card drew two
  borders) with `createBodyOf(draft)` plus `serviceEntryIds: [thisService]`, in ONE call (the rule
  never exists on no service). `createBodyOf` is shared with the library's "Write a rule". Its radio
  group is named with `useId`.
- **"Remove from this service"** opens a confirmation stating the effect BEFORE the press (what comes
  off, what stays, that it comes back if re-added), then the counts after: *"13 upcoming filings
  taken off the calendar"* / *"13 kept because another service the same client holds still includes
  it"*. The three kept reasons (started / past its date or waiting on a decision / covered elsewhere)
  are said apart.
- **Every press says what it did, and the sentence takes focus** (`useAppearFocus`; a removal
  unmounts the pressed button's row): *"12 filings added to the calendar for 4 companies"*
  (companies: a group files per company), *"13 filings taken off earlier are back on the calendar"*,
  *"GSTR-3B was already on this service. Nothing changed."* It is CLEARED when the next act starts.
- **Accessible names lead with the visible words** (`Remove from this service: GSTR-3B`, `Remove it:
  GSTR-3B`, `Keep it: GSTR-3B`).
- **"Edit in the library"** (`LinkedFiling`), a `LinkButton` beside Remove, offered on `party:read`
  and worded "See it in the library" without `tenant:admin` (its controls are an admin's). It lands
  on `/admin/obligation-rules#rule-<lineageId>`.
- **One read for the whole page**: `GET /obligation-filings` returns the library once, one row per
  chain with `usedIn` named (one request per card is the per-row lookup to avoid; the local limit is
  ~300 a minute). It is `party:read` where the catalogue is `config:read`: **only a 403** draws "Your
  role cannot see the firm's compliance filings" (a `?? null` on any failure turned a throttled
  reload into that sentence for an admin, hid the controls and swallowed the add's result). Any other
  failure keeps the list already read with a warn that it may be out of date, or, with none, says it
  could not be read and to reload.
- **A refusal is drawn beside the press that caused it, and takes focus** (inside the removal's
  confirmation, the adding confirmation, just above the new filing's save row via `RuleEditor`'s
  `refusal` slot, or by the add controls). The catalogue forgets which act was refused on toggling or
  cancelling the form, and when `RuleEditor` refuses locally (`onRefused`).
- **The "Add a service" form has the same section** (`NewServiceFilings`, the `/catalogue` section below).

### Today's rule, and the next change (follow-ups 2026-09-26, decided by the user)

- **A filing's date is TODAY's rule; a law change is a second line.** After "the law changed from
  April 2027" a chain's newest row is the successor, and the card said the 22nd while the calendar
  (correctly) dated September's return the 20th. Each rule row carries `inForceToday` (the chain's
  row governing the period containing the FIRM's today, read by the API) and `nextChange`;
  `rule-editor.tsx` words them once: `describeToday` and `describeNextChange` ("From April 2027: the
  22nd of the following month."). The service list, the picker and the confirmation use both, so the
  option and the row it becomes say one date. `monthYear` (`@/lib/day`) is split like `longDay`.
- **It names `nextChange.firstPeriodStart`**, the start of the first period the new row GOVERNS,
  never `effectiveFrom` (the day the change was recorded from: a quarterly rule changed on 1 November
  read "From November 2026" while Oct–Dec was still due under the old rule; it now reads "From
  January 2027"). A period start is a 1st; only an event-driven rule can start on another day, said
  as the day.
- **The pill and the date describe the same row**: each chain row carries its own `coverage`, and
  `todayOf` returns today's row's coverage and reason with its date (`standingOf` once read the
  NEWEST row, so a card said "date not known yet" while the confirmed row before it was dating this
  year's returns). The newest row's standing is the second line's to say ("nothing goes on the
  calendar, because the rule from then on is retired"; "once somebody confirms it in the library").
- **Arriving from "Edit in the library" focuses the row** (the pressed link is unmounted by the
  navigation, so focus fell to `<body>` and the first Tab scrolled the row away).
- A firm's reason already ending in a full stop got a second one ("yet.."): fixed.
- `/audit` names the service for a filing added or removed: `obligation_rule.linked` / `unlinked`
  carry `serviceName` beside `serviceKey`; `audit-words.ts`'s `NAMED_BY` prints the name on the key's
  own row ("Service: Payroll Processing"); older events print the key.
- What walking found: the "Used in" link landed with the card's name UNDER the sticky bar (all
  anchors now go through `scrollBelowBar`, `@/components/ui`; it was the catalogue's own
  `showService`); a smoke firm whose companies were never registered answered "no new filings" to
  every add until one was (the coverage tab's `entity_not_registered` working as designed, so walks
  register a company before measuring counts).

## `/catalogue`: a list, a page per service (W4B, 2026-09-28)
 The user: *"currently it looks so complicated, use better
colouring, make it better UX"*. Before: 17,662px tall, 121 headings, 298 form inputs in the DOM (every
card carried its own hidden new-version form). Standard terms: `proposals-and-letters.md`; the discount
limit: Your firm.

- **`/catalogue` is one table**: code · service (delivery team under it) · Dept · countries · price ·
  filings · status, sorted by the firm's Dept order then code (numeric: H2 before H10). The Dept is a
  tinted chip and a row edge (`deptTint`: first three Depts get `--cat-1..3`, any other the spare).
  Search (name, code, Dept, team; labelled **"Search services"**, because the sidebar's box is the other
  "Search"), **country chips** (the builder's `Tabs`; a service offered everywhere shows under every
  country, D3; each chip counts what the other filters leave) and a Dept select; chip and Dept ride in the
  URL.
- **Status is one of three** (`rowOf` / `rowFromHistory`, `catalogue/service.ts`): **Live**, **Draft**
  (never published), **Unpublished changes** (a draft NEWER than the live version). The registry has no
  discard, so publishing the newest of two drafts leaves the older a draft for ever: the list's
  `pendingDraft` is the newest draft LEFT, and an older one is history ("Never published" on History).
- **Prices read "AED 4,000 / month"** (`priceWords`: `formatMoney`, so INR is in lakhs; "/ month",
  "/ quarter", "/ year", "one time"). No list price shows the pricing note, capped narrow, or "Not set".
  The note and service name sit in capped spans (`max-w-36`, `max-w-64`) so nothing hides at 1280.
- **`/catalogue/[serviceKey]`** reads `GET /config/service/{key}` (every version with its body) plus the
  form's context (`loadFormContext`: Depts and teams, processes, the firm's companies, the library).
  Tabs in the URL (`?tab=price|filings|history`). **Overview hides empty details** and says them in one
  line ("5 details missing: … Add them"; **Add them** opens Edit focused on the first missing box).
  **History** lists every version: state, when published, until when, price, and what it changed
  (`changesBetween`, field names in words).
- **Edit never edits in place: it saves a NEW version** (publishing FREEZES a config version, which is
  what keeps a proposal's pinned price resolving next year). The form opens on the WORKING body (the
  waiting draft, so a second edit carries the first). **Save as draft** shows an amber notice listing
  what changes ("Price: AED 5,500 / month → AED 6,000 / month") under a brand **Publish**; **Save and
  publish** is both in one press. While a change waits the tabs show the LIVE version (what a proposal
  quotes). A service's compliance filings are NOT versioned, on purpose (T6.16).
- **Add a service** (`/catalogue/new`, the one brand button): Basics · Price · What's included ·
  Compliance filings (optional). **The key is made from the name** (`keyFrom`; "new" kept free).
  **The currency follows the first country ticked** (`currencyFor`: the firm's company there, else D1's
  four, else the books currency) until the partner picks. **Add the service publishes**; **Save as draft**
  does not. Calls in order: the service, each library filing, each written one, the publish; what it said
  lands on the service page through sessionStorage (`ARRIVAL_KEY`), a refused filing named with the
  API's sentence. `description` and `category` are not asked (nothing reads them); an edit keeps whatever
  the body says (`bodyOf`'s `kept`).
- **The form checks what it can before any call** (`refusalsOf`: a name, an amount that is a number,
  whole days), beside the box with focus on the first; the API's refusal is shown verbatim above the
  buttons. The amount previews as money as it is typed.
- **A never-published service is a "Draft" row, not omitted**: a real state a firm must see, and the
  proposal screen correctly refuses to quote one.
- **Walking it found**: a `<ul>` keeps the browser's 40px indent (preflight is off), so a list in a card
  needs `list-none pl-0`; the fixture's second run found every datable India filing already confirmed, so
  the walk needs a fresh fixture. Walk `bib/demo-assets/tools/w4b-walk.mjs` (after `EPB_TAG=…
  epb-fixture.mjs` and `w4b-seed.mjs`); measure `w4b-measure.mjs`.
