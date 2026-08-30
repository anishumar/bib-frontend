# CLAUDE.md — bib-frontend

The **10X Workspace** (staff) and, later, the **client portal** — the browser half of BiB.
The backend is a separate service in a separate repo (`../bib-backend`); read its
`CLAUDE.md` for the architecture those APIs come from. This file is the rules for this app.

## The one rule: the API's shapes are generated, never retyped

`src/lib/api/schema.d.ts` is generated from the backend's `/openapi.json`, which is itself
generated from the zod schemas that validate the requests. So every request and response
shape has **exactly one definition, in the backend**.

```bash
npm run api:generate    # backend must be running on :8080
```

- **Never hand-write an API type.** Import it from `@/lib/api/client`, which re-exports off
  the generated schema. A renamed backend field then becomes a compile error here instead of
  an `undefined` at runtime.
- **Never edit `schema.d.ts`.** It is overwritten, and it is gitignored from linting for the
  same reason.
- Regenerate after any backend API change. It is one command, deliberately.

## The API is a different origin. Always.

Not a local quirk — the arrangement in every environment. Consequences, all deliberate:

- **No dev proxy / rewrite.** A proxy would make local development work under rules that
  apply nowhere else (same-origin, no preflight, no cookie policy), so the first environment
  to exercise the real rules would be production.
- **`credentials: "include"` on every call**, set once in `client.ts`. Without it the browser
  withholds the session cookie cross-origin and every authenticated request silently becomes
  anonymous.
- **This app's origin must be in the backend's `BIB_CORS_ORIGINS`**, or the browser discards
  responses before this code sees them.

## The session is not ours to hold

The API sets an **httpOnly** cookie. No script can read it — including this one. So there is
no token in `localStorage`, no auth header to attach, and no "log out" that clears a client
store: sign-out is a call the server acts on. If you find yourself wanting to read the
session, the answer is `GET /api/v1/auth/me`.

A 401 mid-session is ordinary, not an error to display: the session expired, was revoked, or
the user's membership was deactivated (the API re-checks it on every request). Route to
`/login`.

## What the API tells the user, we show

Failures come back in one envelope: `{ error: { code, message, reason? } }`. Show `message`.
Do not improve on it — several messages are deliberately vague because the API must not
confirm who holds an account, and a friendlier local rewrite would leak exactly what the
backend refused to.

## Styling — read `src/design/README.md` before writing any UI

There is a design system, and it is the DEFAULT way to build a screen here, not a set of
optional helpers sitting beside the old way. It is the **same design language as 10x CRM**
(`../10xcrm`): same IBM Plex faces, same blue-green-biased neutrals, same teal accent, same
scales. Where a token name exists in both, it means the same thing.

```
src/design/     tokens.css · base.css · layout.css · components.css
src/components/ ui/ · layout/ · states/
```

The rules, in short:

- **Import the component, never type the class.** `<Button>`, `<Field>`, `<Pill>`, `<Card>`,
  `<Table>`, `<Tabs>`, `<Dialog>` — all from `@/components/ui`. The class names are an
  implementation detail, and keeping them so is what stops a sixth button appearing the week
  after the fifth was consolidated.
- **Colour is spent in one place and means one thing: status.** A button is not coloured
  because a button is not a status. The primary button is ink, not accent.
- **Nothing invents a value.** Type comes off the scale (`--t-xs`…`--t-2xl`, or the
  `.text-*` classes), spacing off `--s-1`…`--s-7`, shape off `--r`/`--r-sm`. `13px`, `15px`
  and `17px` are not on the ladder.
- **No hex values in components**, and no inline `fontSize`, `color`, `borderRadius` or
  `boxShadow`. All of these are **lint errors** — `eslint.config.mjs` names what to use
  instead in each message.
- **A component never branches on theme.** Light and dark redefine only the semantic colour
  tokens; everything else appears once. If you want a dark-mode rule inside a component, the
  token is missing — add it to `tokens.css`.
- **Navigation lives in `AppShell`, once.** A page does not list its own links.
- **Accessibility comes from the components.** `<Field>` wires label/hint/error and the ARIA
  that goes with them; `<Tabs>` is a real tablist with arrow keys; `<Dialog>` is the native
  element. Do not hand-roll any of the three.

If a screen needs something the system does not have, add it to the system — deliberately,
in one place, for everybody. Do not solve it locally.

## The screens, and what they are for

| Route | Is |
|---|---|
| `/login` | email + password → the httpOnly session cookie |
| `/` | the workspace home: who you are, which firms you belong to |
| `/admin/people` | the firm's roster — add somebody, change a role or grade, say who they report to, revoke or restore access |
| `/admin/roles` | what the firm's roles MEAN: permissions per role, published as versions |
| `/admin/grades` | the firm's seniority ladder — add a rung, rename it, re-rank it, retire it |
| `/admin/structure` | the firm's Depts and delivery teams, and which of them (if either) splits a client's work |
| `/admin/workflows` | how the firm does its work — the steps a job walks, written once |
| `/admin/verification` | who may check somebody else's work — the firm picks the rule; maker≠checker is not on the page |
| `/clients` | the firm's book — every counterparty, and the caller's OWN clients |
| `/clients/[partyId]` | party 360: the account team, identifiers, registrations, relationships |
| `/leads` | the pipeline — capture with dedup, stage, ownership |
| `/proposals` | what the firm has quoted, and drafting a new one |
| `/proposals/[proposalId]` | one proposal: its lines, the catalogue version each was pinned to, the discount gate, sending |
| `/p/[token]` | **PUBLIC** — the proposal as its recipient reads it. No session. |
| `/engagement-letters` | what the firm has AGREED, and drafting a new letter |
| `/engagement-letters/[letterId]` | one letter: its terms, its signature, and the engagements it created |
| `/catalogue` | what the firm sells, and its discount limit — read on `config:read`, written on `tenant:admin` |
| `/invoices` | what the firm has BILLED, and raising one |
| `/invoices/[invoiceId]` | one invoice: its lines, what has been paid and credited, and what is left |
| `/receivables` | who owes money — and the dunning steps waiting for a partner's decision |
| `/admin/document-blocks` | the firm's standard prose, copied onto every new document |
| `/admin/brand` | the logo, signature and letterhead each of the firm's own companies issues under |
| `/dashboard` | the firm's own numbers — MRR, what it is owed, how long it waits, and what the figures could NOT count |
| `/admin/territories` | whose desk covers which country |
| `/work-items` | the board — what is owed, whose desk it is on, and what is late |
| `/work-items/[workItemId]` | one task: its checklist, what it waits on, and every review it has been through |
| `/admin/work-vocabulary` | the firm's own words for work — the states a task moves through and how urgent it can be |
| `/calendar` | the compliance calendar — what each company owes and by when, plus WHY an engagement produced nothing |
| `/admin/obligation-rules` | what the law asks of a client, and when — confirm a date, set T–X, retire a rule |
| `/work` | the delivery board — what a signed engagement turned into |
| `/work/[jobId]` | one job's process: its steps, who each is waiting on, the Done button, and Approve / Send back |
| `/audit` | every state transition, and any object's own timeline via `?type=&id=` |

The admin screens are one subject deliberately split: the API needs `tenant:admin` for
all of them, because between them they decide what every role can do, who holds it, and who is
senior enough to sign off somebody else's work.

**Roles and grades are not the same screen, and must not become one.** A role is what somebody
may REACH and it grants permissions; a grade is how SENIOR they are and it grants nothing —
it exists for one comparison, the firm's "Manager or above" review rule. Merging them would
imply a promotion changes what you can open.

`/admin/grades` offers **Retire**, never Delete, because there is no delete endpoint and no
DELETE grant behind it: a rung somebody held is part of why they could approve something. A
retired rung still renders on the person who holds it, marked retired, and the grade picker on
`/admin/people` offers it only to them — the API refuses it for anybody else, and offering
what will fail is just a slower error. The picker also offers "not graded" as a real choice,
because a portal contact belongs on no rung and taking somebody off the ladder is a decision.

The name and rank editors commit on **blur or Enter**, not per keystroke: every commit writes
an audit event, and per-keystroke saving turns one rename into twelve rows nobody can read
past.

Two things they get from the API rather than deciding locally, and both matter:

- **The role dropdown is the firm's own published roles.** Not a hardcoded list — a firm that
  invents `rm` sees it without a deploy, and a role that exists only as a draft is correctly
  absent, because a draft is not yet a role.
- **The permission set comes from `GET /api/v1/config/permissions`**, with its descriptions.
  Retyping it here would drift from what the backend actually checks, and on an
  access-control screen that means offering a permission that grants nothing or hiding one
  that grants everything.

**A permission check in this app decides what to OFFER, never what is allowed.** `/auth/me`
returns the permissions the session's role carries, so a link is shown only to somebody who
can use it — but every screen still shows the API's refusal verbatim when one arrives, because
the API is the only place the answer actually lives.

## `/admin/structure` — and the one control that says it is not live yet

Two lists side by side, never a tree: a **Dept** (FRC / TRC / RAA) is the revenue axis and a
**delivery team** (FINCOMPLIANCE, VCFO CONSOLE, PAYROLL) is who does the work, and one team
commonly delivers under several Depts. Rendering them nested would say something about the
firm that is not true.

Neither is required. Most firms have one layer, some have both, plenty have neither, and the
screen leads with that so an empty list reads as an answer rather than an unfinished form.

The split chooser — how a client's work is cut into jobs — **disables an option whose list is
empty and puts the reason beside it**. Hiding it strands somebody looking for a setting they
were told exists; offering it produces the API's refusal, which is a worse way to learn the
same thing.

**And it says out loud that it is not in effect yet.** The setting is stored and audited
today; the orchestrator that reads it is T2.7. A control that looks live and is inert is the
"feature that looks finished" the backend has been caught by before, and the screen is the
only place a user would ever find out. When T2.7 lands, that paragraph comes out.

There is no delete and no way to edit a code, because there is no endpoint for either.
Retiring is not deleting — a Dept that existed in 2026 is part of why a service was filed
where it was filed — and a code cannot move because every published service body names it and
those bodies are frozen.

**`/catalogue`'s two axis fields are pickers only when the firm has a list**, and stay text
boxes when it does not. That is the API's actual rule rendered honestly: a firm with no Depts
is checked against nothing, so a disabled empty dropdown would claim the service cannot be
filed when the truth is that it can be filed anywhere until the firm decides. A service naming
a code that has since been retired, or one typed before the list existed, is offered marked
"no longer on this firm's list" rather than silently blanked — the submit rewrites the whole
body, so blanking it is how a Dept disappears from a service nobody meant to refile.

## `/work` — the first screen the delivery half of the product has ever had

`GET /api/v1/jobs` shipped with T2.6 and nothing rendered it for two tasks, which is exactly the
"write with no read" shape the backend's own CLAUDE.md warns about. It has a screen now, and
building it is what made three things obvious.

**A job with no steps is not broken.** It means the firm has not published a workflow template
for that service, and the screen says so in words — "waiting for a process · nobody has written
how this service is delivered" — rather than showing an empty row for somebody to interpret.

**A skipped step is shown, marked "not needed", with its reason.** Hiding it would make the
process look as though it never had that step, and "we did not do this, and here is why" is the
question asked when a filing is questioned.

**An `agent` step can say "waiting for you — no agent built for this yet".** A firm may write a
step as an agent's long before one exists; the work does not stop, it goes to a person. That is
the API's rule rendered, not a convenience, and the screen distinguishes it from an ordinary
human step because one of the two is something the firm might want to chase.

The Done button appears only for `work:write`, and only on a step that is waiting. Completing
one RELOADS the whole list rather than patching the row, because finishing a step opens the ones
waiting on it in the same call — updating only what was clicked would leave the next step
looking untouched.

`/work` lists what the API calls runnable, which now includes jobs waiting on a person. It does
not show work whose window has not opened: the calendar is materialised a year ahead and showing
all of it as "ready" would bury what actually is.

**A ROW IS NOT AN ENGAGEMENT ANY MORE (T2.7's merge).** When a firm splits its work by Dept or
delivery team, one row is that team's whole checklist for one of a client's companies on one
engagement letter — which may be several services. So the row lists its SERVICES, names the team
beside them, and leads the "For" column with the COMPANY the work is delivered to, with "billed
to …" underneath only when the client differs. A group of four companies has four rows and they
must not look identical.

Listing the services is not decoration. A firm splitting by team can legitimately see two
FinCompliance rows for one client — the merge key includes the workflow key, so two sets of
services naming two different processes stay two checklists — and the only way to tell that from
a duplicate is to see what is in each.

**And this is where the uuid finally went.** The row used to render `engagement <uuid>` with a
comment admitting the honest fix was a read model carrying names. The merge forced it: a merged
job's `sourceRef` is a derived group key naming no row at all, so it was not even a uuid anybody
could look up. `GET /api/v1/jobs` carries the names now, joined once for the page.

`/work/[jobId]` calls `GET /api/v1/jobs/{jobId}` alongside its steps, for the same reason — a
merged job's steps say nothing about whose work they are. That route also exists because the
list is only what is RUNNABLE, so a finished job's page had no way to name itself at all.

**A step a machine answered gets three buttons INSTEAD of Done (T2.8).** Accept · Correct ·
Reject, and never the Done button beside them — the API refuses it there, because ticking
"done" would record that a PERSON did the work and leave what the machine said undecided
forever. Offering a control that will 409 is not honesty, it is a slower error.

**The step's own label reads the proposal, not just the executor** — and getting that wrong is
what opening the page found. An `agent` step showed "waiting for you — no agent built for this
yet" while a proposal sat underneath it saying one had just run. That label was the whole truth
until T2.8 and is not any more, so it now says the two machine-answered cases apart: "a machine
answered — waiting for you to check it" against "a machine could not answer this — waiting for
you to decide". A different job for the reader in each case.

The proposal shows the confidence **with the bar it was judged against**. "0.82" alone means
nothing to somebody at a desk; "0.82, and this firm acts alone only above 0.95" is the entire
explanation of why they are being asked. And the two reasons for being asked are worded apart:
a step the firm marked for approval always comes here whatever the machine scored, while one
that merely fell short is a different fact — only the second says anything about the agent.

Correcting opens the machine's own answer to edit rather than a blank box: a correction is a
change to what it said, and the API refuses one that changed nothing (with a message that says
"if it was right, accept it"). Rejecting asks what was wrong, because the schema insists — and
rejecting does NOT finish the step, which the screen says, because throwing away an answer is
not doing the work.

**There is no screen for the thresholds themselves, deliberately.** They are a `confidence_tier`
config entry and reachable through the generic config API. There are no agents yet, so there is
nothing to auto-commit; a screen for a knob with no consumer is the "control that looks live and
is inert" trap `/admin/structure` was careful about. It belongs with the first real agent.

## `/admin/workflows` — where a process stops living in somebody's head

The engine could walk a process and the board could show one, and neither was worth anything
while the only way to WRITE a process was a curl command. This is that screen.

**Draft and publish are separate here, unlike `/admin/roles`.** A role is one intent and
saves in one press. A process is not: publishing changes the path every job started from now
on will walk, and a partner may write one over several sittings. So it follows `/catalogue` —
a draft sits visibly unpublished, and the screen says "no job is following it".

**A condition reads as one sentence across three controls** — "Only do this step when…
[Where the entity is registered] …it [is none of] …these [AE, SG]". The labels are minimal
because the OPTIONS carry the words, but they are real labels rather than a bare "…", because
a screen reader gets nothing from an ellipsis. `in` / `not_in` take a comma-separated list; the
blanks are dropped on the way out, so a trailing comma is not an empty value the API rejects.

**There is no "is at least" in that picker, and that is not an omission.** The firm's own
compliance list makes a threshold its commonest rule, but the API has no numeric fact to
compare — so the option would sit there, compare a string, and do nothing. It arrives with the
data (T3.2).

**The long hint sits BELOW the row, not inside a column of it.** Inside, it made its own column
six lines tall and `.bib-field-row`'s flex-end alignment pushed the two selects to the bottom
of it, so the three parts of one sentence stopped being on one line. Found by looking at the
page; the types were perfectly happy.

**It is deliberately not a diagram editor.** The graph is expressed as "this step waits for
these steps", which is how somebody describes a process out loud and is exactly what the
engine reads. A cycle is typeable and the API refuses it by NAMING the loop — a better error
than any drag-and-drop would produce, and it is shown verbatim.

Removing a step also removes it from every other step's "waits for". Without that the API
refuses the whole process for naming a step that does not exist — correct, and a confusing way
to find out what you deleted.

**`/catalogue` gained the field that connects the two**: a picker over PUBLISHED processes
only. A draft is not in force, and offering one would point a service at something no job will
ever follow. Blank is a real answer and the hint says what it means — the work is created and
waits, visibly, rather than running a process nobody wrote.

## Files are a PANEL, not a screen (T3.6)

Nobody opens the product to browse files. They open a client, a letter, an invoice or a job,
and the files are part of what that thing IS — so `<Documents>` (`src/lib/ui/documents.tsx`)
is one component with the subject kind as a prop, dropped onto all four. There is deliberately
no `/documents` route.

The API is shaped the same way: `GET /subjects/{kind}/{ref}/documents` is the read, and the
upload **attaches in the same call that stores**. A two-step "upload, then attach" would leave
an orphan behind every time somebody closed the tab.

**Downloads go through `fetch`, never an `<a href>`.** The session is an httpOnly cookie set by
a different origin and the API sets `SameSite=Lax`, so a plain link works on localhost (same
site, different port) and silently downloads an HTML error page anywhere the API is on another
domain. `downloadDocument` in `client.ts` fetches with credentials and hands the browser a
blob. That holds the whole file in memory, bounded by the API's own upload limit — the honest
cost of the backend deliberately not offering a pre-signed URL, which would answer to none of
the four scoping gates.

**The title is required and never defaulted from the filename.** `scan_0043.pdf` is what a
scanner produces and is not something anybody finds a document by later.

**BUILDING THIS PANEL FOUND THREE THINGS WRONG WITH THE API IT WAS BUILT AGAINST**, which is
the rule in the backend's own CLAUDE.md working exactly as written — and worth recording,
because the module had 939 passing tests and every one of them was happy:

- **`createdByName: string \| null` collapsed two different facts.** The system generating a
  file and a person whose display name is simply unset both arrived as `null`. The audit
  trail had already solved this — *email is the discriminator, not the id* — and the field is
  now the same `{ userId, displayName, email }` shape `EventRecord.actor` uses.
- **`kind` and `subjectKind` were bare `z.string()`**, so the generated client lost closed sets
  the database enforces with a CHECK. They are enums on the wire now, and a screen switching on
  one gets a compile error when a member is added instead of a silent default.
- **A `BrandAsset` carried a version with no `documentId`**, so its bytes were unreachable —
  bytes are fetched at `/documents/{documentId}/...` and there was no way to build the URL. A
  write with no read, found the moment a screen tried to show a logo.

## `/admin/brand` — the marks, per COMPANY

Not three upload boxes. A firm with an Indian company and a US company signs on two
letterheads, and a letter its US entity issued printing the Indian logo is the same class of
error as one printing Indian governing law (G1.8) — so the screen leads with the entity.

**Putting one in force supersedes; it does not replace.** The previous mark stays stored and
downloadable, because a document issued last year was issued under last year's logo. There is
no delete and no endpoint behind one.

**It says out loud that nothing renders these yet.** They are stored, versioned and audited
today; the renderer is T3.8. A control that looks live and is inert is the "feature that looks
finished" this product has been caught by before, and this screen is the only place a partner
would find out. That paragraph comes out when T3.8 lands.

The entity list is derived from the ISSUING PREFERENCES, the same source `/invoices` uses, so
the two cannot disagree about which companies the firm has. Its limit is stated in the empty
state rather than hidden: a company with no country on the issuing table does not appear.

Setting a mark is **two calls** — the bytes become an ordinary document first, then that
version is put in force. If the second fails the screen says the file was stored and is not in
force, rather than pretending the upload failed and sending somebody to re-upload a file the
store already holds.
## `/admin/verification` and the To check tab — where work goes to somebody's desk

Before T2.9 an escalation and a queued proposal landed in the same place — a blocked step on a
job page — and went to nobody. You found them by opening a job and looking.

**`/work` has a second tab, and it shows the WHOLE FIRM's queue.** Not "mine": under a rank
threshold there is no "mine", any Manager may take any of it, and a list filtered to what the
viewer can act on hides the queue's most useful fact — that six filings have been waiting a week
because nobody senior enough has looked. So every row carries `viewer.eligible` and, when it is
false, `viewer.reason`, and the screen SAYS the reason rather than greying a button out.

**Ordered oldest-first, and there is deliberately no due date anywhere on the screen.** The firm
has not given its internal turnaround times or confirmed its escalation matrix, and a deadline
this product invented would be a priority the firm never set.

**`/admin/verification` is where the firm picks its rule**, and the thing to understand about
the page is the banner at the top: **maker ≠ checker is NOT a setting on it.** Whoever did the
work can never approve it, the database refuses it, and the screen says so where somebody would
otherwise go looking for the switch. What the page configures is who *else* may check.

Three rules, and **each option carries its own trade-off in the option itself**, not in help
text somebody has to find: "the maker's own manager" says out loud that it stops the morning
that person is on leave. This is the choice that decides who may sign off a statutory filing.

The grade picker appears only for the two rules that READ a grade — the API refuses a
`reporting_line` body carrying a threshold, on the ground that a number nothing compares is a
setting that looks live, so offering the field would be offering a 400. And choosing the
reporting-line rule says, before it is saved, that it reads who reports to whom on
`/admin/people` and that anybody without a manager recorded there has nobody who may check
their work.

**Draft and publish are separate, for a stronger reason than `/admin/workflows` has.** A check
PINS the rule in force when it opened, so raising the bar this afternoon leaves this morning's
open checks approvable by the people already looking at them.

`/admin/workflows` gains a per-step **"who checks it"** picker over PUBLISHED rules only — a
draft governs nothing — and "nobody" is the default, because that is what every process written
before this field existed meant. A rule a step names but the firm has since withdrawn stays
selectable, marked, rather than silently blanked: the submit rewrites the whole body, so
blanking it is how a review disappears from a process nobody meant to change.

`/work/[jobId]` shows a checked step as **"finished — waiting to be checked"** and offers
Approve / Send back INSTEAD of Done. To the person who did the work it shows the sentence
instead of the buttons — the API answers 403 there, and a greyed-out button says nothing about
why. Decided checks stay on the page with their notes: a step sent back twice and then approved
reads as one that sailed through if only the open check is drawn, and "this took two goes" is
the only signal anywhere that explains where a week went.

## The account team, and the date box that is the whole feature (G3.2)

`/clients/[partyId]` leads with **who at the firm owns this client** — the Key Manager, and a
SPOC per Dept — because that is the question somebody opening a client page most often has, and
until G3.2 nothing in this product could answer it.

**The "as of" box is the point of the panel, not a nicety.** Nothing here is edited over: a
handover closes one row and opens the next, so every arrangement the client has ever had is
still on file, and "who was the SPOC in March" is a date in a box rather than a question for
somebody's memory. The API returns the whole history in one response, so changing the date
filters what is already loaded. On a past date the End buttons disappear and a line says which
day is being shown — a screen that let somebody act on March's team would be offering to change
the past.

The **Until** column says "until", not "to", because the dates are HALF-OPEN: an assignment
ending 1 April was in force up to and including 31 March. Getting that word wrong is how a
reader concludes there were two SPOCs on the changeover day.

**A Dept can have more than one SPOC**, so the form says so where somebody would otherwise
expect a replacement: adding a SPOC adds one, and ending the outgoing one is a separate,
deliberate step. A new **Key Manager** is a handover and the form says that instead. The Dept
picker is absent — not disabled — when the role is Key Manager, because the API refuses one
there and offering a control that will 400 is just a slower error.

**TODAY IS THE BROWSER'S CALENDAR DAY, NEVER `toISOString()`.** That one-liner is a day out for
anybody east of Greenwich in the morning, and opening this page at 04:11 in Delhi is how we
found out: the panel rendered "as of 29-08" on the thirtieth. `/clients` sends its local date to
`GET /api/v1/my-clients` for the same reason — the API runs in UTC and the firm does not, so
without it a client assigned this morning was missing from its holder's own book until the
afternoon. **A calendar day is the caller's fact, and this app is the caller.**

**`/clients` has two tabs, not one filter.** "Everyone the firm stores" and "the clients I was
put in charge of" are different questions, and the second reads the assignments rather than
filtering the party list. One row per client with every role collected onto it — a partner is
commonly the Key Manager AND a Dept's SPOC on the same client, and listing it twice would report
a bigger book than they have. An archived client is shown and marked rather than dropped:
somebody still holds it.

**The assign form is not always there, and that is the API's rule rather than this screen's
choice.** Assigning needs `party:write`, which a manager holds; the roster and the Dept list it
needs for its two pickers are `tenant:admin` reads. So a manager can be permitted to assign and
be shown no form — the same shape `/leads`'s owner dropdown already has, and left consistent
with it rather than fixed here, because widening either read is a decision about who may see the
firm's roster and it belongs in one place for both screens.

## `/work-items` and `/admin/work-vocabulary` — the board, and the words on it (T3.1)

`/work` shows the ENGINE: which process a job is walking and which step it is on. `/work-items`
shows the work as a person experiences it — a client, a due date, a name, and a state in the
firm's own words. **They are two screens because they answer two questions**, and because a
firm that has published no process still has work: ad hoc work has no job at all and is still
owned, still due and still reviewable.

**THREE TABS ARE THREE DIFFERENT JOBS.** Mine is what somebody opens in the morning. Everything
is the delivery meeting. **Unassigned is the one that matters most and would not exist on a
naive board**: when the router cannot find the client's SPOC for a Dept, or finds two, it
refuses to guess and the item lands here **with a sentence saying which**. A dash in that
column would make "two SPOCs for FRC, pick one" and "nobody has got to it" look identical, and
only one of them is somebody's to fix.

**NOTHING ON THESE SCREENS COMPARES A STATE'S CODE.** States and priorities are rows the firm
owns and may rename from `/admin/work-vocabulary` without a deploy, so every branch reads the
FLAGS — `isBlocked`, `isTerminal`, `isInitial` — and prints the NAME. The state picker offers
only ACTIVE states (a retired one still renders where it is held), and the **reason box appears
when the SELECTED state is flagged blocked**, for whatever the firm has called it — including a
second state the firm flagged itself. Asking for the reason before the API refuses is not a
duplicated rule: the API refuses regardless, and a person who has already pressed Save has lost
the sentence they were about to write.

**`/admin/work-vocabulary` is the standing directive made visible.** The names came from a
previous vendor and are still unconfirmed even for 10x, so renaming one has to be a tick and a
blur — not a migration somebody asks an engineer for. Each box says **what it turns on** rather
than naming itself ("Means blocked — needs a written reason"), because `is_blocked` tells a
partner nothing. Neither "Starting" nor either default is on the ADD form, deliberately: taking
one silently moves it off whatever holds it today, and that belongs on the row where somebody
can see what it replaces. Name and rank commit on **blur or Enter**, like `/admin/grades`, because
every commit writes an audit event.

There is no Delete on either table, because there is no delete endpoint and no DELETE grant:
a hundred tasks sitting in a state would lose it. Retiring keeps it readable everywhere it is
held.

**TODAY IS THE BROWSER'S CALENDAR DAY, on the board as on `/clients`.** The API takes `asOf` to
decide what is overdue, and `toISOString()` here would be the UTC day — which calls a filing due
today "late" for anybody west of Greenwich and "not yet" for anybody east.

**There is no "approve and mark done" button, and that is a decision.** Nothing says which of the
firm's terminal states an approval should move work into — a firm has at least two, Completed and
Cancelled — so picking one would be this product deciding what approval MEANS. The two acts are
separate and the page shows both. The review section lists **every** review including the
rejections: a list of only the open one makes work that came back twice read as work that sailed
through.

### What building these screens found

**PATCH was missing from the backend's CORS `allowMethods`, and had been since CORS was added.**
These are the first routes in the product that use it. The browser answers the preflight 204,
reads the header, sees PATCH is absent and DISCARDS the request — no server log, no status code,
surfacing as "TypeError: Failed to fetch" and reading as a dead endpoint. **The backend's smoke
walk could never have caught it: curl does not preflight**, and every one of those PATCH calls
passed. Found by clicking a checkbox. There is a backend test over it now.

**Two rendering faults the types were perfectly happy with.** The Owner fact printed the
assignment note in full AND the callout below repeated it verbatim, making the fact grid six
lines tall and saying one sentence twice. And a two-word state name wrapped inside its pill and
rendered as a broken circle — the firm names these, so a two-word name is the ordinary case.
`.bib-field-row > *` is `flex: 1 1 160px`, which is right for a control and turns a Save button
into a banner; the buttons opt out.

## `/calendar` and `/admin/obligation-rules` — the calendar, and the rules behind it (T3.2)

**`/calendar` IS READ-ONLY AND MUST STAY THAT WAY.** There is no "add a filing" button because
there is no endpoint for one, and there will not be: every row falls out of the firm's rules, its
entities and its engagements. If a person could type one in, the calendar could disagree with the
statute — and then it is the Excel this product replaces, only now inside Postgres. What a person
changes is the RULES.

**Ordered by the INTERNAL target, not the legal deadline.** `statutoryDueOn` is what the law says;
`internalTargetOn` is the firm's own T–X and is when work has to START. A list sorted by the legal
date tells you when you are already too late. Both are on the row, and both go red separately.

**Every row is marked "unconfirmed rule" until a partner has ticked it.** The shipped dates came
from a previous vendor's document, not from the firm. Hiding that would make a plausible wrong due
date indistinguishable from a checked one, which is the dangerous kind.

### The coverage tab is the point of the screen

An empty calendar has three possible meanings — nothing is owed, a rule is missing a fact, or the
software is broken — and only one of them is anybody's to fix. So the second tab names every live
engagement the calendar produced nothing for, WITH A REASON, and **the screen says out loud that
none of them is an error**: `no_rule_names_this_service` is the ordinary state of advisory work and
is the longest list at every firm, which is why it sorts LAST. The reasons are grouped rather than
listed flat, because they are four different jobs, and each group's "what to do next" links to
where the fix actually is — an unregistered company is fixed on its client page, not on the rules
screen.

**`entity_not_registered` exists because opening this screen found it.** Three engagements were
reported as "no rule names this service" at a firm that had just loaded fifty-seven rules; the real
answer was that nobody had registered the companies as legal entities, and a rule matches an
entity's jurisdiction exactly. The backend's reason logic was wrong and was fixed there.

### `/admin/obligation-rules` is the standing directive made visible

Forty-seven of the fifty-seven shipped rules cannot produce a date, and **the screen must not
render that as a fault list.** Each says, in the firm's own words, the one fact it is waiting for —
which is a question a partner can answer without knowing anything about this system. The counts
callout leads with the ratio and says in as many words that the second number is the honest state
of the firm's own specification.

**The lead time is a blank, not a default.** Every rule ships at zero, so the task appears on the
statutory date itself — visibly useless, and deliberately so: T–X is the firm's own working
practice and a guessed one is a commitment it never made. It commits on **blur**, like
`/admin/grades`, because every commit writes an audit event.

**Only three things are editable, and what is NOT is the design.** Jurisdiction, name and rule pack
are a rule's identity and every filing already generated pins the row; moving them would silently
restate why those filings were due when they were. A revision is a new rule under a new pack with
the old one retired — and the old one stays readable, which is what lets a filing made last year
explain its own date. There is no Delete for the same reason there is none on `/admin/grades`.

**The formula is rendered as a sentence a partner can check against the statute** — "Every month ·
the 20th of the following month" — never as `dueMonthOffset: 1`. The first version of that function
was written without looking at the page and produced "Once a year, day 15 3 months after" and, for
an event-driven rule, "30 days after the period ends" when an event rule has no period at all. Both
were grammatical nonsense and the second was factually wrong; the types were perfectly happy with
both.


## `/dashboard` — and the gaps that are the point of it (T3.7)

**The MRR figure is not the feature. The list of what MRR could not count is.**

A headline number that silently drops what it does not understand is worse than no number:
a partner reads it, acts on it, and never learns that most of the firm's engagements
contributed nothing to it. So the API returns every exclusion with its reason, and this
screen shows them immediately beside the figure — not behind a disclosure, not in a footnote.
The first run against real data found **1,490 engagements stating no billing frequency against
34 that counted**. A tidier screen would have shown ₹31.2 lakh and looked complete.

Each reason gets its own sentence, because they are not the same problem: `unpriced` means the
firm agreed to work it has not priced; `no_frequency_stated` means nobody said whether it is
monthly or annual; `one_time` is real revenue that is simply not RECURRING. Only the second is
something to go and fix.

**DSO can be null, and null is not zero.** "0 days" reads as excellent collections. The truth
when a firm has billed nothing in the window is that there is not enough billing to say, and
the two render as different sentences.

**Every ageing band is shown, including the empty ones.** "Nothing is more than 90 days
overdue" is the most reassuring row on that table and it has to be visible rather than absent
— and a table that changed shape as debt moved would be unreadable week to week.

**The currency is stated once, at the top.** Every figure arrives already converted at the rate
stored on the document it came from — never a rate looked up today, which would change last
quarter's MRR every morning. Repeating it per row would be noise on a table where it cannot
differ.

**This screen is behind the FEE AXIS, not a role**, and it is the first place in the product
where that axis GATES rather than redacts. Everywhere else commercial visibility nulls an
amount and leaves the record, so "you may not see this" never looks like "there is no fee".
Here the whole page is money: a redacted version would be a page of nulls, which communicates
"the firm has no revenue" — worse than a refusal. So the API answers 403 and names the fix,
and the home page offers the link only to `principal.commercialVisibility`. Note that this is
NOT implied by being a partner: it is a separate flag on the membership, and a partner without
it is refused, correctly.

## Money never becomes a number

The API sends amounts as decimal **strings**, because a JavaScript number cannot hold 1499.50
exactly, and this app keeps them strings all the way to the screen. `formatMoney` in
`client.ts` hands the string to `Intl.NumberFormat`, which formats a decimal string exactly;
`format(Number(amount))` would undo the whole arrangement at the last possible moment. That
is why `tsconfig.json` pulls in `ES2023.Intl` — the runtime has had exact string formatting
for years, only the ES2022 type declarations do not describe it.

A `null` amount is not zero and not an error: it is the fee axis. Somebody without commercial
visibility gets the proposal with its money removed rather than a refusal, so these screens
render an em dash and show everything else.

## The proposal screens, and the one that has no session

`/p/[token]` is public. The person opening it has no login and will not get one — that is
what a proposal is. The token is in the URL because a link has to be sendable, and the page
immediately moves it into a request **body**, so it does not travel onward into the API's
access logs or a Referer header. The page cannot accept the proposal; the firm records the
client's answer, and the page says so rather than showing a button that does not exist.

The share link is shown **once**, on the send response. Only its fingerprint is stored, so
there is nothing to re-fetch — sending again issues a new one.

## Screens are how API gaps get found

`/clients` and `/leads` were built after their APIs shipped, and building them found three
things no backend test had: `registerLegalEntity` was a write with no read, party 360 omitted
the organization/person detail the create form captured, and relationships came back as
uuids. All three were fixed in the backend rather than worked around here — a screen that
renders a uuid is telling you about the API, not about itself.

So: when a screen wants something the API does not return, the default is to fix the API.
Joining, formatting or looking things up per row in this app hides the problem from the next
consumer.

`/receivables` found the fifth and sixth: the collections list returned a balance with a
`partyId` and no name and no invoice number, and the dunning queue returned a rung with an
`invoiceId` — asking a partner to approve putting a uuid on credit hold. Both are joined in the
API now, and the backend's smoke walk asserts the client name so it cannot quietly go back.

`/audit` found the fourth one: the trail named its actor by uuid and nothing a `ledger:read`
holder could call resolved it. The backend joins the account at read time now — the stored
row still keeps only the id, so erasure still works and `actor: null` is a real state this
app has to render, not a bug.

## A signed letter is a different kind of screen

`/engagement-letters/[letterId]` stops offering edits once the letter is signed, because the
DATABASE refuses them — not this app. It shows the signature, its method and the content hash
instead, and says plainly that a change is a new letter. The clause picker offers only clauses
that apply to the letter's jurisdiction and are not already on it: the API refuses the rest,
and offering what will fail is not honesty, it is just a slower error.

The signature form says out loud that it records a colleague's **attestation**, not a
cryptographic signature. The audit trail says the same thing (`signatureMethod: attested`), and
a screen that implied more than the data supports would be the interface lying about the
record.

## The billing screens, and the two numbers that behave differently

An invoice number is not a document reference. `PR-2026-0007` may gap — somebody abandoned a
quote — but a tax invoice series must be consecutive, so `/invoices` never lets anybody pick
one: the API allocates it inside the write. A cancelled invoice therefore still appears, still
numbered, and the screen says why. A replacement is a new invoice.

**There is no "paid" badge anywhere, because there is no such column.** An invoice's status is
about the DOCUMENT — drafted, sent, withdrawn — and what has been paid is arithmetic the
database does over invoices, payments and credit notes. This app renders the four figures the
API returns and adds nothing up: a badge would be a cache of a sum, and it would drift the
first time a payment was corrected.

**A negative payment is a real thing and the form says so.** A bounced cheque is a reversal
with its own date, sitting beside the original — not the original edited away. Both rows show,
because "it was paid and then it was not" is the fact.

**A credit note asks for a reason from a dropdown, never a sentence.** Without the category the
numbers always reconcile and *why* forty thousand came off does not; "how much did we write off
to service failures" is a GROUP BY, which free text cannot answer. The particulars go in the
note beside it.

`/receivables` carries the DECISION QUEUE, and it is the point of the screen. A machine may
chase a client; only a person may put one on credit hold or send a matter to lawyers. The
worker climbs to those rungs and stops, and the queue shows the client, the invoice number and
what is outstanding NOW — the API joins all three, because a queue of uuids would be asking
somebody to approve something they cannot see. Rejecting is offered as prominently as
approving: the firm looked and chose not to, which is a fact somebody wants later.

## Two screens that show the registry rather than hiding it

`/catalogue` offers "new version" and never "edit", because publishing FREEZES a config
version — that is what makes a proposal's pinned price still resolve next year. A draft is
shown as "draft only" rather than omitted, because a draft that was never published is a real
state a firm needs to see and fix, and the proposal screen correctly refuses to quote one.

`/audit` shows payloads raw. An audit trail is read when something has gone wrong, and a
friendlier rendering is one more thing between the reader and what was actually recorded.

## Commands

```bash
npm run dev            # :3000, expects the API on :8080
npm run api:generate   # regenerate the typed client from the running API
npm run check          # typecheck + lint — run before every push
npm run build
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
