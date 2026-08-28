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
| `/clients` | the firm's book — every counterparty, and adding one |
| `/clients/[partyId]` | party 360: identifiers, registrations, relationships |
| `/leads` | the pipeline — capture with dedup, stage, ownership |
| `/proposals` | what the firm has quoted, and drafting a new one |
| `/proposals/[proposalId]` | one proposal: its lines, the catalogue version each was pinned to, the discount gate, sending |
| `/p/[token]` | **PUBLIC** — the proposal as its recipient reads it. No session. |
| `/catalogue` | what the firm sells, and its discount limit — read on `config:read`, written on `tenant:admin` |
| `/audit` | every state transition, and any object's own timeline via `?type=&id=` |

The two admin screens are one subject deliberately split: the API needs `tenant:admin` for
both, because between them they decide what every role can do **and** who holds it.

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
