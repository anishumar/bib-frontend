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

## Styling

Tokens in `src/app/globals.css`, used by name. No hardcoded hex values in components. This
is the smallest thing worth calling a design system; grow it when a real screen needs more,
not before.

## The screens, and what they are for

| Route | Is |
|---|---|
| `/login` | email + password → the httpOnly session cookie |
| `/` | the workspace home: who you are, which firms you belong to |
| `/admin/people` | the firm's roster — add somebody, change a role, revoke or restore access |
| `/admin/roles` | what the firm's roles MEAN: permissions per role, published as versions |
| `/admin/grades` | the firm's seniority ladder — add a rung, rename it, re-rank it, retire it |
| `/admin/structure` | the firm's Depts and delivery teams, and which of them (if either) splits a client's work |
| `/clients` | the firm's book — every counterparty, and adding one |
| `/clients/[partyId]` | party 360: identifiers, registrations, relationships |
| `/leads` | the pipeline — capture with dedup, stage, ownership |
| `/proposals` | what the firm has quoted, and drafting a new one |
| `/proposals/[proposalId]` | one proposal: its lines, the catalogue version each was pinned to, the discount gate, sending |
| `/p/[token]` | **PUBLIC** — the proposal as its recipient reads it. No session. |
| `/engagement-letters` | what the firm has AGREED, and drafting a new letter |
| `/engagement-letters/[letterId]` | one letter: its terms, its signature, and the engagements it created |
| `/catalogue` | what the firm sells, and its discount limit — read on `config:read`, written on `tenant:admin` |
| `/audit` | every state transition, and any object's own timeline via `?type=&id=` |

The four admin screens are one subject deliberately split: the API needs `tenant:admin` for
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
