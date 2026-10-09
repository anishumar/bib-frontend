# The shell: sidebar, top bar, glass, panels

`AppShell` (`src/components/layout/app-shell.tsx`) owns navigation, once; a page never lists its
own links. `/login`, `/auth/*`, `/p/[token]` and every `/portal` route are bare (`isBare`); the
portal draws its own frame (`portal.md`).

## The sidebar

Collapsible groups over a search box, not a flat column: twenty-odd links in one list get read top
to bottom every time. Groups today (verify in `app-shell.tsx` before relying on it):

| Group | Links |
|---|---|
| My day | My day (`/`) — a group of one, so a plain link |
| Commercial | Clients · Pipeline · Proposals · Engagement letters · Invoices · Receivables · The firm's numbers · Catalogue |
| Delivery (`openByDefault`) | Work board · Jobs · Compliance calendar · Client requests |
| Record | Audit trail |
| The firm | Your firm · People · Roles · Grades · Structure · Territories |
| How work runs | Compliance rules · Calendar words · Processes · Work states · Who checks work · Escalation ladder · Client reminders |
| Documents | Standard prose · Standard terms · Brand |

`/account` and `/notifications` sit outside the nav (`OUTSIDE_NAV`, section "You"). There is no
Copilot link (S7; the line to put back is commented in `app-shell.tsx`). `NavItem.note` draws a
note in the `.count` style; `NavGroup.openByDefault` opens a group as well as when it holds the
current page. Links carry `needs: "<permission>"`: a link is shown only to someone who can use it.

The rules, each a decision:

- **The group holding the current page opens on its own** until the reader toggles something.
  Absent from the toggle map means untouched, which is not closed.
- **A search opens everything and hides non-matches; it never restructures the nav.** The first
  version chose dropdown-vs-link from the FILTERED count, so typing "escal" promoted one screen to
  a top-level link and removed the one thing a result should say: which section it lives in.
- **Search matches the label, the PATH, and the section name, but the section only when that
  name is drawn.** The path is what makes `admin` find every settings screen and `obligation`
  find Calendar words. A one-screen group's name is never on screen, so it is excluded (typing
  `work` once returned Home because its group was called "Workspace").
- **A group of one is a plain link. Children carry no icon** (an icon separates siblings at one
  level; in an open group it would repeat the head five times).
- **Below 60rem the sidebar folds into a horizontal strip and the groups FLATTEN** into it
  (`display: contents`). A collapsed group still renders no children, so tapping its head reveals
  them; the chevron stays. Watch `width`: `.nav-top { width: 100% }` was invisible in the column
  and made every row 2100px wide in the strip.
- **The admin screens all need `tenant:admin`, but are grouped by SUBJECT, not by that
  permission** (it was one section of thirteen). Three sections, not four: at a CA firm a
  compliance rule IS how work runs. Top-level, not a third tier under Administration (two clicks
  and a chevron whose meaning changes with depth). Territories is under The firm (the firm
  describing itself, like Structure) even though lead assignment reads it.

**Sidebar counts (`useNavCounts`)**: Work board = open tasks on the reader's desk, Jobs = steps on
it, Client requests = requests on it waiting for the firm. The shell fetches NOTHING for them: My
day reports all three, Work board and Jobs report their own when they load. A count nobody
reported, or a 0, is not drawn.

## Wave 5: the Aurora shell (2026-09-29)

The user's cut, and it binds: on QA **only the sidebar and the page ground change** (Aurora
glass), no text, no font, no other redesign. Brief:
`bib/prompts/entity-proposal-builder/W5-AURORA-SHELL.md`.

- **Ground and glass are atmosphere.** `--aurora` (four soft lights, a shine, a fine grain; a low
  cool version in dark) is painted ONCE on a fixed `body::before`, never with
  `background-attachment: fixed` (repaints on scroll; iPhone Safari stretches it). The sidebar is
  frosted glass (`--glass-*`, `--r-lg`). Nothing on a card, pill, button or line of text takes a
  colour from either. The builder's sticky footer and the cards were left as they were (the
  user's call).
- **The top bar is glass on the sidebar's line.** Both panes start one gutter down, same radius
  and glass, one gutter apart. The header is sticky at 0, `--topbar-h` + a gutter tall; its
  `::before` is the bar, its `::after` the body's own ground clipped to the header's corner of the
  window, so a scrolled page never shows in the gutter (measured pixel-identical). Folded (60rem)
  the bar is a second strip under the first and scrolls away with it.
- **The sidebar's LIST scrolls, not the sidebar** (`.sidebar > .nav`, 4px padding for the focus
  ring). As the scroller, the whole sidebar pushed the account block under the window's edge once
  a group opened. The Next dev badge sits bottom-right (`devIndicators` in `next.config`).
- **The page mounts once.** The frame renders from the first paint with the page in place; only
  the links, the account and the firm's name wait for `/auth/me`. (It used to render the page bare
  and then again inside the frame: two "Loading"s, every read twice, count-ups twice.)

## The chrome (2026-10-05)

From a QA screenshot: *"notification bell icon is going out of the page and teh rectengualr text
look so ai genrated"*.

- **Every floating panel is placed by `useAnchoredPanel`** (`components/ui/anchored.ts`), shared
  by `Menu` and the bell: under its button, flipped above when there is no room below, pulled back
  inside the window on BOTH axes and never nearer than 8px to an edge (a panel bigger than the
  window lands at the margin). The refs are the HOOK's, not arguments: placing writes
  `panel.current.style`, and the React Compiler refuses a hook modifying what it was handed. The
  bug it fixed: `.menu-panel` is `position: fixed; inset: auto` (pinned where it would have been
  in the flow), and the bell was a `<details>`, so its 26rem panel ended 238px past the window's
  edge at every desktop width. A fixed box does not widen the page, so nothing scrolled to it.
  **One hand-placed panel IS the bug.** The bell is a `<button popovertarget>`, state in
  `aria-expanded`; Escape and light dismiss come from the popover.
- **The top bar says where the reader is**: nav section / screen from `trail()`, the longest nav
  href the path starts with (`/clients/<id>` → "Commercial / Clients"; the page itself is headed
  by the client's name). Only links this reader is offered match. A group of one names no section
  ("Audit trail"). Nothing matched draws nothing. The slash is `aria-hidden` with real spaces. (It
  read `BiB · 10x Global · fees visible`: a codename, the firm the sidebar names, a permission.)
- **The sidebar's head is one line**: the firm's name. The product names itself once, at the FOOT
  of the column (`.brand-foot`), and on every sign-in page. The mark is 2rem; `data-chars="3"`
  sizes a three-character mark ("10x Global" → "10x"). The portal's head keeps its second line
  ("Client portal"), because that says which app it is.
- **The product's name is one constant**, `PRODUCT_NAME` (`@/lib/brand`, "10X Workspace"); the
  browser tab is `PRODUCT_NAME` alone. Anything scoped to one firm shows that firm: the sidebar's
  and the portal's mark are `firmInitials(principal.tenantName)`, never "10x".
- **Whether a login sees fees is on `/account`**, a fact about the person on the person's page.
- Walk: `bib/demo-assets/tools/shell-chrome-walk.mjs` (63 checks at 1440 / 1280 / 1024 / 390, on
  an `epb-fixture.mjs` firm) measures the panel's box against the window rather than asserting a
  rule.

The bell's polling and the notification screens: "Shared panels" below. How the shell reads the
session (only a 401 signs out): `auth-and-session.md`.

## Admin and record screens: what each is for, and how they are shaped
 The sidebar's second half. Every `/admin/*` screen needs
`tenant:admin`; the screens with their own sections are linked.

| Route | Is |
|---|---|
| `/admin/firm` | **Your firm**: Setup, Companies, Signing, Deadlines, discount limit (`proposals-and-letters.md`). `/admin/companies` redirects to `/admin/firm#companies` |
| `/admin/people` | the roster: add somebody, change a role or grade, say who they report to, revoke or restore access |
| `/admin/roles` | what roles MEAN: permissions per role, published as versions |
| `/admin/grades` | the seniority ladder: add, rename, re-rank, retire a rung |
| `/admin/structure`, `/admin/workflows`, `/admin/verification` | Depts and teams, **Processes**, **Who checks work** (`delivery-work.md`) |
| `/admin/escalation-ladder` | when the firm hears its own work went quiet: the rungs and who each tells (`delivery-work.md`) |
| `/admin/client-reminders` | when a CLIENT hears from the firm: the chase ladder (forward from the day we asked, stopped by a freeze) and the heads-up ladder (back from a statutory date, not stopped by one). Two config kinds, one screen |
| `/admin/territories` | whose desk covers which country; picks from `CountrySelect`, the value is the code |
| `/admin/document-blocks`, `/admin/standard-terms`, `/admin/brand` | Standard prose, Standard terms, the marks per company (`proposals-and-letters.md`) |
| `/admin/obligation-rules`, `/admin/obligation-vocabulary` | the compliance library and the calendar's words (`compliance-calendar.md`) |
| `/admin/work-vocabulary` | the board's states and priorities (`delivery-work.md`) |
| `/audit` | every state transition; any object's timeline via `?type=&id=`. Payloads are shown RAW (read when something went wrong, and a friendlier rendering is one more thing between the reader and what was recorded). The actor is joined at read time; `actor: null` is a real state (erasure keeps only the id) the screen must render |

### People, Roles and Grades

- **Roles and grades are different screens and must not merge.** A role is what somebody may REACH and
  grants permissions; a grade is how SENIOR they are and grants nothing (it exists for the "Manager or
  above" review rule). Merging would imply a promotion changes what you can open.
- **Grades offer Retire, never Delete** (no endpoint, no DELETE grant: a rung somebody held is part of why
  they could approve something). A retired rung still renders on the person who holds it, marked retired,
  and the grade picker on People offers it only to them (the API refuses it for anyone else). The picker
  also offers "not graded" as a real choice (a portal contact is on no rung).
- **Name and rank editors commit on blur or Enter**, never per keystroke (every commit writes an audit
  event: one rename would be twelve unreadable rows).
- **The role dropdown is the firm's own PUBLISHED roles** (a firm that invents `rm` sees it without a
  deploy; a draft is not yet a role). **The permission set comes from `GET /api/v1/config/permissions`**
  with its descriptions: retyping it would drift from what the backend checks and, on an access-control
  screen, offer a permission that grants nothing or hide one that grants everything.

### How the admin screens are shaped (W4C admin-portal, 2026-09-28)

Behaviour did not change: every API refusal is still shown verbatim.

- **No eyebrow, no lede.** The sidebar's own word is the title.
- **One brand button per screen, top right**, opening a dialog where the form was a card at the bottom
  (People: **Add somebody**, Grades: **Add a grade**, Roles: **Add a role**); the refusal is shown IN the
  dialog and the outcome is a notice after it closes ("Added" / "Added, but no email sent"). Where the form
  takes the page (Who checks work, Escalation ladder, Processes, Compliance rules) the button is in the
  header and the form opens under the title; `useSwapFocus` hands focus back.
- **`<Input variant="quiet">`** (beside the quiet select): a name, order or rank renamed in place reads as
  its value, framed on hover and focus; commit on blur/Enter. A system code (`senior_manager`,
  `in_progress`) is a line under the name; a retired row carries a Retired pill there, not a Status column.
- **People**: access is a pill beside the name only when it is not ordinary staff (Revoked, Client portal);
  Revoke / Restore live in the row's **More** menu.
- **Compliance rules**: the counts paragraph, the Show select and the "Show retired" box are ONE control,
  tabs with counts (All · Producing dates · Not used by a service · Not yet confirmed · Waiting on a fact ·
  Event-driven · Retired; an empty tab is left out except the four a partner looks for). The editor opens
  under its own row (not after all 58). Authority is a line under the filing's name.
- **Roles is one table**: permissions down (the API's sentence, the key under it), roles across, a box per
  cell named "<key> for <role>". Each role saves on its own, draft then publish, from a **Publish** button
  under its column that appears only when its ticks changed.
- **The portal** (W4C): a request's reply box opens on **Add to this**; invoices print through
  `formatMoney`; the month picker sits in the header. **`/p/[token]`**: a zero discount arrives as "0.00"
  and comparing it to "0" drew "after ₹0 off ₹65,000": compare decimals, not strings. **`/login`**: "Email
  me a sign-in link instead" is never disabled; with no email it asks the browser to flag the empty box and
  focuses it.
- Measured with `bib/demo-assets/tools/w4ap-measure.mjs` (1280): every table in the group hides 0px (the
  rules table was 1,432px). Walk `w4ap-walk.mjs`.

### `/copilot`: parked, honest, dark

- **Not the landing since V1.1**: staff land on their work (`homeFor`, `lib/api/home.ts`). Since S7 the
  route answers 404 unless the deployment sets `NEXT_PUBLIC_BIB_COPILOT=on` (nothing does) and has no
  sidebar link; the screen lives in `app/copilot/copilot-chat.tsx`, type-checked, for the day it can answer.
- **It must never imply it worked**: no model and no endpoint behind it; when the API lands, `<Answer>` is
  the only thing that changes. Said in three places (header pill, the reply sentence, the line under the
  composer). A reply naming a keyword points at the screen that answers it TODAY, and says that is the
  product pointing. Mark is `--brand`, never `--accent` (accent is also `--ok`); only the Copilot's side
  has a bubble.
- **The old Home printed the session's user id, tenant id and permission keys above the fold.** Facts
  about the SYSTEM are LAST and closed (a `<details className="disclosure">`) because support asks "what is
  your firm id"; deleting them would trade one bad screen for another.

## Shared panels: the bell, notifications, and the Files panel


### The bell and `/notifications` (0323, 0324)

The API writes and words them; this side shows them.

- **`components/notify/bell.tsx`** sits in the top bar once a firm is chosen. `useUnreadCount`
  (`unread.ts`) polls **once a minute, only while the tab is VISIBLE, one request at a time**, and on a
  429 doubles its wait (to 8 min) and keeps the last number. Budget: the API allows 300/min per ADDRESS
  and an office is one address, so 40 people cost ~40/min. **Never shorten the interval or poll hidden
  tabs.** The dropdown reads the latest 8 only when opened; opening a row marks it read first, then goes
  to the API's `href`. Anything that changes the count calls `notificationsChanged()`.
- **`/notifications`**: All / Unread (unread = not read AND not done, the bell's own count), 30 at a time
  with Show older (`nextBefore`), Mark all as read up to the newest SHOWN row (`upTo`), "Done" on a
  resolved one. `title` and `detail` are the API's words, already without an amount for a reader who may
  not see fees: never add one.
- **Settings** (`components/notify/settings.tsx`): Your account (`owner="mine"`: the person's value wins,
  "· Your choice", the firm's value in the box's title) and Your firm (`owner="firm"`, plus "Daily email
  at", 00:00 to 23:00). Columns: In the bell, By email. Escalations and missed filings mail at once, the
  rest in one email a day. Locked bells show ticked and disabled ("Always in the bell"); their email can
  still be switched off. The box moves at once and the API's answer replaces the table (a refusal reloads
  it). No push column until push exists.
- Walk `bib/demo-assets/tools/nt-walk.mjs` (42/42, emails read back from Mailpit) on a fresh
  `ai-fixture.mjs` firm; run fixture and walk 60 s apart or the fixture meets a 429.

### The Files panel (`src/lib/ui/documents.tsx`, T3.6)

- **Files are a PANEL, not a screen**: nobody opens the product to browse files, they open a client, a
  letter, an invoice or a job. `<Documents>` is one component with the subject kind as a prop, on all
  four; there is deliberately no `/documents` route. `GET /subjects/{kind}/{ref}/documents` is the read
  and the upload **attaches in the same call that stores** (a two-step upload-then-attach leaves an
  orphan whenever the tab closes).
- **Downloads go through `fetch`, never an `<a href>`.** The session is an httpOnly cookie from another
  origin with `SameSite=Lax`: a plain link works on localhost and silently downloads an HTML error page
  anywhere the API is on another domain. `downloadDocument` (`client.ts`) fetches with credentials and
  hands the browser a blob (the file sits in memory, bounded by the upload limit: the cost of the API
  deliberately offering no pre-signed URL).
- **The title is required and never defaulted from the filename** (`scan_0043.pdf` is not how anybody
  finds a document later). **Four columns** since W4D: title (file name, size, day and who filed it
  under it), what, client can see, actions; as seven it hid the Download button at 1440. Its day is "28
  Sep 2026" like every other date.
- A refused upload says `CONTENT_NOT_OF_TYPE` in plain words (the file is not the type it was sent
  as); `ErrorNotice` shows it as is (S7).
- **Building it found three API faults** while 939 backend tests passed: `createdByName: string | null`
  collapsed "the system" and "a person with no display name" (now `{ userId, displayName, email }`, as
  `EventRecord.actor`: email is the discriminator); `kind` and `subjectKind` were bare strings (now
  enums, so a switch gets a compile error when a member is added); a `BrandAsset` carried a version with
  no `documentId`, so its bytes were unreachable.
