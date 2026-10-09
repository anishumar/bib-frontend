# Delivery: My day, the work board, jobs, checks, escalations, client requests

| Route | Is |
|---|---|
| `/` | **My day** (V2.1): everything on the reader's desk as ONE list |
| `/work-items` | the board: what is owed, whose desk, what is late, waiting to be checked, escalated |
| `/work-items/[workItemId]` | one task: details, checklist, what it waits on, client asks, files, reviews |
| `/work` | Jobs: what a signed engagement turned into (the ENGINE: process and step) |
| `/work/[jobId]` | one job's process: steps, sub-steps, Done, Approve / Send back with review points |
| `/client-requests` | what clients asked the FIRM for, unprompted; tabs Mine · Unassigned · Everything · Finished |
| `/client-requests/[requestId]` | one request and its thread |
| `/admin/work-vocabulary` | the firm's words for work: states and priorities |

**Two screens for work because there are two questions.** `/work` shows the engine (which process,
which step). `/work-items` shows work as a person experiences it (a client, a due date, a name, a
state in the firm's words); ad hoc work has no job and is still owned, due and reviewable.

## `/` — My day (V2.1, 2026-09-28)

A person's work was spread over five screens (~nine clicks) and nothing said what was due today.
Staff land here (`homeFor`); V1.1 had sent them to the board.

- **Reads, one list, nothing per row**: `/work-items?mine=true&asOf=`, `/my-steps`,
  `/work-item-checks`, `/checks`, `/client-requests` (kept to the reader's desk),
  `/escalations?mine=true`, `/billing/dues?mine=true`, `/billing/advances?mine=true`,
  `bill-early?mine=true`, plus `/tenancy/readiness` for `tenant:admin` ("Setup: 5 of 8 · See what
  is left", nothing once all are done). One `Promise.all`. The API grew what rows needed
  (`MyStep.job`, `StepCheck.job`: client and company by id, period, services, the job's due day =
  its earliest UNFINISHED task's; `clientPartyId` + `dueOn` on `WorkItemCheckRow` and
  `EscalationRow`). The reader comes from `useSession()`, so nothing is asked until the shell knows
  who is signed in. In `next dev` StrictMode runs the effect twice (double requests); a production
  build does not.
- **Buckets by due day against `browserDay()`**: Overdue, Today, This week (the next SEVEN days, so
  Friday shows Monday), Later (closed, a Show button). What waits on the reader NOW (a check to
  decide, a request to answer, an escalation to chase, work sent back) is Today unless already
  late; other undated work is Later. Within a bucket: earliest first, the reader's own turn first,
  then name.
- **Every row**: what (a whole-row link to where it is worked), the client (a LINK; the column names
  the company the work is for, `entityName`, the group only when the work names none), due, whose
  turn: **You / A checker / The client / An earlier step / An admin** (a draft invoice only an
  administrator may issue, 0322). A task with an open review, or a done step with a check open, is
  the checker's; a request answered and not yet replied to is the client's; a `pending` step waits
  on an earlier step. (Waiting on the client for a TASK needs the open asks on the board's read: a
  P1 task.)
- **One row per thing.** An escalation about the reader's OWN task is the flag "Escalated" on that
  row; about somebody else's work it is its own row ("Escalated to you · with Ananya Nair"), one per
  piece of work however many rungs fired. A done step waiting for its check is one row. A task check
  is listed only when the reader may decide it.
- **Flags under the title, in tone**: the blocked reason in danger (the kind line already says the
  firm's word for the state, "Task · Blocked"), "Waiting on <task>" and "Escalated" in warn, "Legal
  due date" on a step or task dated by a statute, "Sent back to you" with the checker's note.
- **Empty**: "Nothing due this week" naming the next dated row (not "You are up to date").
- Billing rows: `billing-and-invoices.md` ("My day's billing rows"). Sidebar counts: My day reports
  all three (`shell-and-navigation.md`).

## `/work-items` — the board (T3.1)

- **It opens as a dated LIST (V1.2, 2026-09-28); the board is one click away.** As a board at 1440
  the fifth column (Blocked) sat off the right edge, holding exactly the critical, late task the
  v1.5 walk was looking for. The list sorts overdue first (oldest first), then by due date, no due
  date last, rank then title breaking ties (`datedOrder`). **Being stuck is a FLAG ON THE ROW**: the
  state pill in danger with its reason under the task, "Waiting on <task>" in warn. Priority is said
  only when urgent (rank 1–2, by RANK), under the task.
- **Tab, view and person are in the URL** (`?tab=mine|unassigned|checks|escalated|people|all`,
  `&view=list|board`, `&person=`), kept in state and written with `history.replaceState`, so Back
  from a task lands in the same place. `router.replace` was first and is a transition: Everything
  then Board pressed quickly wrote `?tab=mine&view=board`. (`/client-requests` keeps its tab in
  local state and opens on Mine.)
- **The tabs are different jobs.** Mine is the morning; All tasks (was "Everything") is the delivery
  meeting; **Unassigned matters most and would not exist on a naive board**: when the router cannot
  find the client's SPOC for a Dept, or finds two, it refuses to guess and the item lands here
  **with a sentence saying which** (a dash would make "two SPOCs for FRC, pick one" and "nobody got
  to it" identical). **By person** (CA#32): open, late and waiting-for-a-check per colleague; a name
  opens All tasks for them. All tasks has a Whose tasks filter. Every tab counts pieces of work.
  To check and Escalated are below.
- **Board or list is a VIEW, not another tab** (the tabs are questions; drawing is another axis).
  **The board's columns are the firm's own rows (T6.1)**: from `GET /work-vocabulary` (`party:read`,
  like the board), ordered by `sortOrder`; an empty state still gets its column ("nothing is under
  review" is a fact; a board changing shape is unreadable week to week). Proven: a firm renamed
  "Blocked" to "Stuck" and the column says Stuck. Terminal states get columns only when "include
  finished work" is ticked (else "Completed" is the widest column on every board).
- **No drag-and-drop, deliberately**: moving into a blocked state REQUIRES a written reason (the
  service and a trigger refuse without one), so a drag would produce a refusal with nowhere to type
  the answer. A card links to the item, where the state picker opens the reason box.
- **NOTHING COMPARES A STATE'S CODE.** States and priorities are rows the firm renames without a
  deploy, so every branch reads the FLAGS (`isBlocked`, `isTerminal`, `isInitial`) and prints the
  NAME. The picker offers only ACTIVE states (a retired one still renders where held); the **reason
  box appears when the SELECTED state is flagged blocked**, whatever the firm called it.
- **Today is the browser's day**: the API takes `asOf` to decide overdue.
- **New task** is the board's one brand action (a dialog). New task and the Relationships picker
  never offer the firm's own companies (`isOwnCompany`).
- W4 tables: the list's whole-row links replaced ten "Open" buttons; the list hid **1168px** at 1280
  (one "Raised by hand with no Dept…" note widened Whose desk until Due, State and Priority were off
  the edge) and now hides 0. On an assigned task the owner rule's hand-out note reads "To hand out"
  in the list (the card and the task page keep the full sentence).

## The task page `/work-items/[workItemId]`

- **One details card.** State and Whose desk ARE the controls: quiet selects that **save when
  picked** (aria-labels unchanged); a blocked state opens its reason box, whose Save moves it. The
  portal switch shows its state as its word and is named "Show this on the client portal". The
  hand-over rule is said once somebody else is picked. Notes are an append-only list with who and
  when.
- **Send for review** sits in the header while nothing is waiting, as a dialog: the rule the firm
  checks it under (`GET /api/v1/review-rules`: one is applied and named, several are a required
  pick, none reads "anyone at the firm except you"), the unticked checklist lines that hold it (the
  API refuses `CHECKLIST_OPEN` regardless) and a note for the checker. Finished work is never
  offered it. Once a check is open the Reviews card moves up under the details (Approve is then the
  page's act). Approve says it marks the task done and waits for the checklist. A sent-back task
  says so at the top with the checker's note (`item.sentBack`). "Who may check this?" loads on the
  disclosure's `onToggle` and says when it failed, with Try again.
- **The review section lists EVERY review, including rejections**: a list of only the open one
  makes work that came back twice read as work that sailed through.
- **No "approve and mark done" button**: which terminal state approval moves work into (Completed?
  Cancelled?) is the firm's to define, so the two acts are separate.
- **The Filing card** links the task to an open filing of its company
  (`GET/PUT/DELETE /work-items/{id}/filing`), so completing it files the filing. A period job's task
  lists what it filed ("Completing this task filed:") and says reopening un-files them; a filing
  filed by another task names it. `JOB_STEPS_OPEN` shows the API's sentence naming the open steps;
  `JOB_PERIOD_NOT_ENDED` (Done / Approve before the period ends, S7) likewise.
- **Q084 (10x's answers, 5 Oct)**: before a Done state from the State list is saved, and on the
  Approve form, the page asks "Filed on the portal on", one date per return in
  `filing.filesOnDone` (today by default, `max` today), and sends `filedOn` (obligation id → day);
  the API's refusal is shown as is. The To check queue's Approve (`app/work-items/checks.tsx`) reads
  the task's `filing` first and, when it files returns, asks the same days ("Approve and record
  these days"). One component: `lib/ui/portal-dates.tsx`. The board has no state change of its own.
- **Files**: `<Documents>` with the task's client as `partyId`, plus the client-visibility column
  (`portal.md`). **Client asks**: below.
- `BillEarly` offers "Raise invoice now" on a finished task (`billing-and-invoices.md`).

### Client asks on the task (`work-items/[workItemId]/client-asks.tsx`, T6.6)

The firm's half of the action centre: raise an ask, read what came back, and **"Got what we needed"
/ "No longer needed"** (`answered` is not `closed`; this is where closing happens). It says, when
the client-visibility switch is off, that nothing asked here will reach them (the portal's read
joins the work item, so an ask about invisible work disappears with it). No due-date field (the firm
never published turnaround times). The file a client sent is marked as not scanned. Reminders print
*"Reminded 3 times — first on …"* (`portal.md`).

## Work always has an owner (T6.17, 2026-09-27)

The API's owner rule: work the engine creates goes to the client's SPOC, else its Key Manager, else
the person who signs for the firm, to HAND OUT.

- **The assignment note is shown whenever it exists** (on a Key Manager's or signing partner's desk
  it is the sentence saying why it came to them). The API clears it when anybody moves the task by
  hand. Both board cards and the task page read it so.
- **Saving "Whose desk" can move the job's steps too**: the assign route answers `stepsHandedOver`;
  the card says "N steps of this job went with it" (`role="status"`) when above zero, and the hint
  under the picker states the rule.
- `how` on the two assignment events is worded (`HOW_WORDS` in `lib/ui/audit-words.ts`: the three
  rungs, `manual`, `taken`, `handover`, `released`, `with_task`); a `work_item.assigned` with
  `catchUp: true` reads from `CAUGHT_UP_WORDS` ("Moved to the client's SPOC for that Dept once one
  was named"), and `catchUp` gets no row of its own.
- Naming the account team reports what it moved (`clients-and-leads.md`); an unsigned letter warns
  where its work will land (`proposals-and-letters.md`).

## `/work` and `/work/[jobId]` — jobs (T2.6–T2.8)

`GET /api/v1/jobs` shipped with T2.6 and nothing rendered it for two tasks: the "write with no
read" shape the backend warns about.

- **A job with no steps is not broken**: the firm has published no process for that service, and
  the row says "waiting for a process · nobody has written how this service is delivered".
- **A skipped step is shown, marked "not needed", with its reason** ("we did not do this, and here
  is why" is what gets asked when a filing is questioned).
- **A row is not an engagement (T2.7's merge).** When a firm splits work by Dept or team, a row is
  that team's whole checklist for one company on one letter (maybe several services): it lists its
  SERVICES, names the team, and leads "For" with the COMPANY the work is delivered to, "billed to …"
  underneath only when the client differs (a group of four companies has four rows). Two
  FinCompliance rows for one client can be legitimate (the merge key includes the workflow key);
  only the services listed tell that from a duplicate. `GET /api/v1/jobs` carries names (a merged
  job's `sourceRef` is a derived group key naming no row). `/work/[jobId]` calls
  `GET /api/v1/jobs/{jobId}` alongside its steps (the list is only what is RUNNABLE, so a finished
  job could not name itself). A job page is titled by its services and period.
- `/work` lists what the API calls runnable, including jobs waiting on a person; not work whose
  window has not opened (the calendar is materialised a year ahead).
- **Done appears only for `work:write`, on a waiting step, and RELOADS the list** (finishing a step
  opens the ones waiting on it in the same call).
- **Steps a machine may answer (T2.8)**: an `agent` step with no agent built says "waiting for you —
  no agent built for this yet" (the work goes to a person). Once a machine answered, the step gets
  **Accept · Correct · Reject INSTEAD of Done** (Done would record that a PERSON did it and leave the
  machine's answer undecided; the API refuses it). The label reads the proposal: "a machine answered
  — waiting for you to check it" vs "a machine could not answer this — waiting for you to decide".
  The confidence is shown **with the bar it was judged against** ("0.82, and this firm acts alone
  only above 0.95"), and "the firm marked this step for approval" is worded apart from "the machine
  fell short". **Correct** opens the machine's own answer to edit (a form with one box per thing it
  says; the API refuses a correction that changed nothing: "if it was right, accept it"); **Reject**
  asks what was wrong and does NOT finish the step, which the screen says. No screen for the
  thresholds (`confidence_tier` config): a knob with no consumer looks live and is inert; it belongs
  with the first real agent.
- **Engine states in words**: a dot and a word; "Waiting on someone" and "Done, waiting to be
  checked" are WARN (held up, not wrong); red only for "could not be finished". A step's key is
  never on screen (its buttons' aria-labels name the step by TITLE).
- **Dialogs, never `window.prompt`**: Send back and Reject take a required note. Each open step
  offers **Ask the client**: the job task's `ClientAsks`, opened with the step's title
  (`about`, `prefill`, `hiddenHint`).

## Checks: maker ≠ checker (T2.9), sub-steps and review points (T6.15)

Before T2.9 an escalation and a queued proposal landed on a blocked step and went to nobody.

- **Two queues, two tabs, on the screens that own them.** `/work`'s **To check** is the JOB STEP
  queue (`step_approval`); `/work-items`' **To check** is the TASK queue (`work_item_approval`;
  plenty of work never walks a process). A merged list would have to explain each row's kind first.
- **Each shows the WHOLE FIRM's queue, not "mine"**: under a rank threshold any Manager may take any
  of it, and a filtered list hides that six filings waited a week because nobody senior enough
  looked. Every row carries `viewer.eligible` and, when false, `viewer.reason` (the SENTENCE, not a
  code: `/checkers` already returns prose), computed by the API once for the queue (no per-row
  `/checkers` calls, which would also ask the wrong question). The screen SAYS the reason rather
  than greying a button.
- **Oldest first, no due date anywhere** (the firm has not given turnaround times or confirmed its
  escalation matrix).
- **The task queue exists because the product was unreachable without it**: `GET
  /api/v1/work-item-checks` had one caller, a banner linking to `checks[0]`, so a second pending
  check could not be reached. The banner now opens the tab and says how many are the reader's own.
- **Approve and Send back sit on the row**; Send back opens its note field inline (the API refuses a
  rejection without one). A queue row's Approve is secondary. `/work`'s To check approves nothing
  itself (Open goes to the job), so its row says how many review points are left; a check there
  names its company from the jobs list the page holds.
- **On `/work/[jobId]`** a checked step reads "finished — waiting to be checked" and offers Approve
  / Send back INSTEAD of Done; to the person who did the work it shows the sentence instead (the API
  answers 403). Decided checks stay with their notes ("this took two goes" is the only signal that
  explains where a week went).
- **Sub-steps and review points (T6.15)**: a step carries two lists ticked by two people. SUB-STEPS
  are the doer's and all of them hold Done (and Accept, Correct) shut; REVIEW POINTS are the
  checker's and all of them hold Approve shut. **Send back is never held** (the problem may be at
  point three). Disabled controls read the API's counts (`subStepsOpen`, `reviewPointsOpen`) with a
  sentence saying how many are left. **"Not applicable" asks why on the line, never in a
  `prompt()`**, and such a line is NEVER drawn ticked ("it did not apply" ≠ "I did it"). Every
  settled line says who and when, with the clock (`longMoment`). **A tick PATCHes the one step (or
  check) from the PUT's answer** rather than reloading (four reads per tick flickers). The review
  points belong to the CHECK: editable on the open check for an eligible viewer only (never the
  maker); a decided check shows what its checker ticked, read-only; the round after a send-back
  starts empty. The list is held to the measure ("Not applicable" sat 750px from its words at full
  width). The editor side lives on `/admin/workflows` ("Admin screens that write how work runs" below).

## The Escalated tab (T4.5)

`/work-items`' Escalated tab is **not the board sliced**: its rows are the record that somebody was
TOLD about work, so it has its own renderer (`escalations.tsx`) and the Board/List toggle is hidden.

- **Nothing to click on a row, by design**: no dismiss, snooze or acknowledge. A notice ends when the
  WORK moves (finished, picked up, filed, decided), resolved by the API as a join. The only control
  is a link to the thing: the way to clear an escalation is to do the work.
- **An empty queue has two meanings and the screen says which**: everything on time, or the firm
  never published a ladder (`ladderPublished`; the second version links to the fix).
- **"Nobody" is the most important row**: a rung can reach no one (nobody holds the work, nobody is
  recorded above them, no active member holds the rank). Danger tone, reason in the tooltip, counted
  above the table (the first real sweep raised fourteen notices; seven reached nobody).
- **A rung addressed to a GRADE shows as a rank, not a person** (a partner on leave must not kill
  the escalation); the rank reads its NAME from `/tenancy/colleagues` ("Partner or above"; the grades
  route is `tenant:admin`), falling back to "Level N or above" for a rank nobody holds.
- **A person is `displayName ?? email`** (`display_name` is nullable and empty at real firms).
- **The For column** (G0.1: a group of four companies files four sets of returns): the entity sits
  beneath the client, one line when they are the same; a FILING has no client and shows `<NotSet />`
  rather than borrowing the entity's name. Whose desk folds into Told ("Desk: X", only when it is
  not the person told). The tab counts tasks and filings escalated; its panel says how many notices.
  The tab shows `daysPastNow` ("26", with "18 when raised" under it).
- **The ladder itself** (`/admin/escalation-ladder`): **nothing is set by default** (a firm with no
  published ladder escalates nobody; a threshold this product invented would be one nobody agreed
  to). Draft and publish are separate. The grade rung offers the firm's ACTIVE rungs and stores the
  RANK (a published body is frozen; re-resolving a code later answers an old question with today's
  ladder). The one impossible combination (watch unassigned work, notify its assignee) moves the
  picker off it rather than meeting a 400.

## `/client-requests` — the firm's inbox (T6.8, T6.9)

- **It says out loud that nothing is assigned when the firm routes nothing.** Routing is a SWITCH
  on `/admin/structure` (`none` is the default and does what shipped; the firm never said who an
  inbound request belongs to). `routing` travels with the list and the notice reads it: "nothing
  assigned because nothing is routed" and "the rule ran and placed nothing" look identical otherwise
  (T4.5's `ladderPublished` argument). The admin screen says a SPOC rule is impossible (a SPOC covers
  a Dept; a request names no service).
- **Unassigned is its own tab** (work only gets chased if somebody can list it).
- **Three sentences, never a blank**: "With <name>", "Nobody yet — <the rule's note>", "On nobody's
  desk".
- **"Take it" needs no roster, so everybody with `work:write` gets it** (claiming is the verb on a
  firm-wide list). The full picker reads `/tenancy/colleagues` since 2026-09-25 (it was the admin
  roster, so only administrators saw it). The Whose desk line IS the picker: a labelled quiet select
  that assigns on change (a full-width unlabelled dropdown under two ghost buttons read as a control
  that lost its label). Take it, Put it back and Close without replying sit beside **Reply**.
- **Every row says which client it is from (a LINK) and where it stands.** The three states a reader
  acts on replace a "Waiting on us" chip beside a raw `open` chip; the middle one is "the client came
  BACK after the firm replied".
- **The reply form opens on Reply**; its textarea takes focus, which is also what loads the
  documents, so **the attachment picker is never empty** (loading on the select's own focus left it
  empty: a native select opens instantly). It lists documents already filed against that client and
  each option says what sending it DOES ("they already have this" / "not shared yet": a disclosure
  decision). Not an upload: file it against the client first. `clientPartyId` is on the firm's wire
  (not the portal's) for that lookup: fixed in the API.
- Timestamps (`raisedAt`, `writtenAt`) are instants in the reader's zone (`money-and-dates.md`).

## `/admin/work-vocabulary` — the words on the board (T3.1)

The names came from a previous vendor and are unconfirmed even for 10x, so renaming is a tick and a
blur, not a migration. Each box says **what it turns on** ("Means blocked — needs a written
reason"), never `is_blocked`. "Starting" and the defaults are not on the ADD form (taking one
silently moves it off whatever holds it; that belongs on the row). Name and rank commit on **blur or
Enter**. No Delete (no endpoint, no grant; a hundred tasks would lose their state): Retire keeps it
readable. Rows use `<Input variant="quiet">`, the system code as a line under the name, a Retired
pill instead of a Status column.

## Walks and what they found

`bib/demo-assets/tools/w4d-walk.mjs` (50 checks, fresh `epb-fixture.mjs` + `w4d-seed.mjs` firm)
presses every control on these screens. Found by using the screens, never by a gate: PATCH missing
from the backend's CORS `allowMethods` (first routes to use PATCH; CLAUDE.md (Verification)); an owner
note printed in the fact grid and repeated in a callout; a two-word state wrapping inside its pill;
three open requests measuring 2,510px (now 1,351).

## Admin screens that write how work runs: Structure, Processes, Who checks work
 Sidebar word first: `/admin/structure` is **Structure**,
`/admin/workflows` is **Processes**, `/admin/verification` is **Who checks work**.

### `/admin/structure`

- **Two lists side by side, never a tree**: a **Dept** (FRC / TRC / RAA) is the revenue axis, a
  **delivery team** (FINCOMPLIANCE, VCFO CONSOLE, PAYROLL) is who does the work, and one team commonly
  delivers under several Depts. Nesting would say something false. Neither is required; the screen
  leads with that so an empty list reads as an answer, not an unfinished form.
- **The split chooser** (how a client's work is cut into jobs) **disables an option whose list is empty
  and puts the reason beside it** (hiding strands somebody looking for a setting they were told exists;
  offering it produces the API's refusal). The routing switch for client requests is here too
  (`/client-requests` reads it).
- **No delete, no code edit**: no endpoint. Retiring is not deleting (a Dept that existed in 2026 is part
  of why a service was filed where it was), and a code cannot move because every published service body
  names it and those bodies are frozen. Rows use `<Input variant="quiet">`.
- **`/catalogue`'s two axis fields (`AxisField`, `catalogue/service-form.tsx`) are pickers only when the
  firm has a list**, text boxes otherwise (a firm with no Depts is checked against nothing, so a disabled
  empty dropdown would claim the service cannot be filed). A code since retired, or typed before the list
  existed, is offered marked "no longer on this firm's list", never silently blanked (the submit rewrites
  the whole body).

### `/admin/workflows` (Processes)

- **Draft and publish are separate, unlike `/admin/roles`**: publishing changes the path every job
  started from now on will walk, and a process may be written over several sittings. A draft sits
  visibly unpublished and the screen says "no job is following it".
- **A condition reads as one sentence across three controls** ("Only do this step when… [Where the
  entity is registered] …it [is none of] …these [AE, SG]"): real labels, not a bare "…" (a screen reader
  gets nothing from an ellipsis). `in` / `not_in` take a comma-separated list; blanks are dropped on the
  way out. **No "is at least" option, deliberately**: the API has no numeric fact to compare, so the
  option would compare a string and do nothing; it arrives with the data (T3.2). **The long hint sits
  BELOW the row**, not inside a column (`.bib-field-row`'s flex-end alignment pushed the selects to the
  bottom of it; found by looking, never by types).
- **Deliberately not a diagram editor.** The graph is "this step waits for these steps", as somebody
  describes a process aloud and as the engine reads it. A typeable cycle is refused by the API by NAMING
  the loop, shown verbatim. Removing a step also removes it from every other step's "waits for".
- **`/catalogue` links to it through a picker over PUBLISHED processes only** (a draft is not in force).
  Blank is a real answer: the work is created and waits, visibly, rather than running a process nobody
  wrote.
- **Per-step "who checks it"**: a picker over PUBLISHED check rules only (a draft governs nothing),
  "nobody" the default (what every process written before the field meant). A rule the step names but
  the firm has since withdrawn stays selectable, marked, never blanked (same rewrite-the-body reason).
  Sub-steps and review points are edited here (T6.15).
- **The editor makes short names from titles** (`lib/short-name.ts`, to the API's two key shapes; under
  More). A step added waits for the step before it; "Waits for" names steps by TITLE. A review rule can be
  written in place (`lib/ui/check-rule-form.tsx`, shared with Who checks work, which puts it in force) and
  chosen for the step.

### `/admin/verification` (Who checks work)

- **Maker ≠ checker is NOT a setting on this page**: whoever did the work can never approve it (the
  database refuses it), and a banner at the top says so where somebody would look for the switch. The
  page configures who ELSE may check.
- **Each option carries its own trade-off in the option itself** ("the maker's own manager" says out
  loud that it stops the morning that person is on leave). This decides who may sign off a statutory
  filing.
- **The grade picker appears only for the two rules that READ a grade**; the API refuses a
  `reporting_line` body carrying a threshold (a number nothing compares looks live). Choosing the
  reporting-line rule says, before saving, that it reads `/admin/people` and that anybody with no manager
  recorded there has nobody who may check their work.
- **Draft and publish are separate, for a stronger reason than Processes**: a check PINS the rule in
  force when it opened, so raising the bar this afternoon leaves this morning's open checks approvable by
  the people already looking at them.
- **Q069 (S8)**: the check-rule form (`lib/ui/check-rule-form.tsx`) offers "The client's Key Manager"
  first and defaults a NEW rule to it; it asks no grade. The refusals `NOT_THE_CLIENTS_CHECKER` and
  `NO_CLIENT_CHECKER` have short words in `CHECK_INELIGIBILITY`. Walks: `ans-walk.mjs` (29),
  `fix4-walk.mjs` (17).
