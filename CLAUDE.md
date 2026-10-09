# CLAUDE.md — bib-frontend

The browser half of **BiB (Business in a Box)**: the **10X Workspace** (the firm's staff), the
**client portal** (`/portal`, a second audience's app) and a few public pages (`/login`, `/auth/*`,
`/p/[token]`). Next.js 16 App Router, React 19, TypeScript; one page per screen under `src/app/`.
The backend is a separate service in a separate repo (`../bib-backend`); its `CLAUDE.md` is the
architecture those APIs come from. This file is the rules for this app and an index. The detail for
each area lives in `docs/claude/`: read the file for the area you are touching (index below).

## Absolute rules

1. **API shapes are generated, never retyped.** `src/lib/api/schema.d.ts` comes from the backend's
   `/openapi.json` (itself from the zod schemas). Import types from `@/lib/api/client`, which
   re-exports them; never hand-write an API type; **never edit `schema.d.ts`**. After any backend
   API change run `npm run api:generate` (backend up on `:8080`): a renamed field is then a compile
   error here instead of an `undefined` at runtime. If a screen needs something the API does not
   return, **fix the API** (a screen rendering a uuid is telling you about the API); do not join,
   format or look up per row here. A field the backend handler forgot to document is absent from
   the generated client.
2. **All API access goes through `src/lib/api/client.ts`.** No `fetch` to the API anywhere else.
3. **The API is a different origin, always.** No dev proxy or rewrite (it would make local work
   under rules that apply nowhere else). `credentials: "include"` on every call, set once in
   `client.ts`; this app's origin must be in the backend's `BIB_CORS_ORIGINS`, or the browser
   discards responses before this code sees them. A new HTTP verb needs the backend's CORS
   `allowMethods` too (PATCH was once missing).
4. **The session is an httpOnly cookie.** No token in `localStorage`, no auth header; sign-out is a
   call the server acts on. Who is signed in = `GET /api/v1/auth/me` (`readSession()` /
   `useSession()`). **Only a 401 signs anybody out**; a 429, 5xx or dropped connection is "busy":
   keep the page and ask again. The API allows 300 requests/min per address (an office is one
   address): anything that polls must budget for it.
5. **A permission check decides what to OFFER; the API's refusal is what is SHOWN.** Failures come
   as `{ error: { code, message, reason? } }`: show `message` verbatim, never rewrite it (several
   are deliberately vague so the API does not confirm who holds an account).
6. **Money is a decimal string, never a JS number**, from the API to the screen: display with
   `formatMoney` (`client.ts`), add with `addDecimals` (`lib/money`). Dates go through `@/lib/day`:
   a calendar day is split, never parsed; `browserDay` is never `toISOString().slice(0, 10)`; an
   instant is shown in the reader's zone; a company's documents are dated on the COMPANY's day.
7. **Design tokens are used by name.** `src/app/globals.css` assembles `src/design/` (tokens, base,
   layout, components, tailwind); read `src/design/README.md` before writing UI. Import the
   component (`<Button>`, `<Field>`, `<Pill>`, `<Table>`, `<Dialog>` from `@/components/ui`), never
   type the class. No hex, no inline `fontSize` / `color` / `borderRadius` / `boxShadow` (lint
   refuses them). Colour means status: `--accent` is also `--ok`, `--warn` and `--danger` say the
   other two; `--brand` is spent in three places only (mark, sidebar, a screen's one committing
   action). A row of buttons is `.cluster`, never `.row`; an undefined class fails silently.
8. **Forms never use `<form action={fn}>`** (React 19 resets the boxes over a refusal; lint refuses
   it). Submit through `onSubmit={(event) => keepTyped(event, fn)}`, and **clear a refusal BEFORE
   the call, never on success** (`ErrorNotice` focuses itself on appearance).
9. **The screen speaks to a non-technical reader over 35** (CA and professional-services staff):
   short plain copy, no eyebrow or lede repeating the sidebar, no AI-sounding filler, no uuids,
   keys or machine codes on screen, no feature implied to work that does not. `check:copy` holds
   placeholder rules; the full rules are in `docs/claude/writing-for-the-screen.md`.
10. **Build the screen alongside the API.** A write with no read, a list of uuids, a field missing
    from the spec are found by rendering them. A control that looks live and is inert is a lie:
    say it is not in effect yet, or do not show it.

## Commands

```bash
npm run dev            # :3000, expects the API on :8080
npm run api:generate   # regenerate the typed client from the RUNNING API
npm run check          # typecheck + lint + check:copy  <- run before every push
npm run build
```

- `check:copy` is `node scripts/check-placeholders.mjs`; it keeps a baseline, refreshed on purpose
  with `node scripts/check-placeholders.mjs --update`.
- **On Windows, start `next dev` from a plain `cmd` shell** (`Start-Process cmd /c "npm run dev"`):
  Turbopack panics with `0xc0000142` when launched from the Bash tool's shell, and `--webpack`
  breaks the app's CSP (`unsafe-eval`).
- **A CSS change that "does nothing" may be a stale Turbopack chunk**: read the served CSS, then
  delete the worktree's `.next/dev` and restart, before debugging the rule.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verification

Typecheck and lint cannot see layout, focus, copy or the second press of a button. Every screen
change is finished only when it has been USED in a real browser.

- **`npm run check` green, in the foreground** (read the result, not an exit code from a
  background run), then walk the screen. Walks are Playwright scripts in
  `bib/demo-assets/tools/` (`*-walk.mjs`), run on a fresh `epb-fixture.mjs` (or the topic's own)
  firm; press every control, including the refusal a second time.
- **Measure, do not eyeball**: at 1280 and 1440 (390 for the shell and the portal), page overflow
  AND every `.tablewrap` (a table scrolls inside itself, so the page can report 0 while columns
  hide); read the heading ladder (`h1` > `h2` > `h3`) off the DOM; seed a client with a
  real-length company name before judging a list.
- **Walk every state, not every probe**: each tab and view, the empty branch, a refused call, a
  signed-out and a client session. Consistency is measured from the rendered page (computed
  styles), not the source.
- **Pace browser walks** under the API's 300 requests/min per address; a 429 bounces a walk to
  `/login`. The browser may already be signed in: check `/auth/me` before debugging a "wrong"
  screen.
- A change that touches API shapes: regenerate (`npm run api:generate`) and commit the new
  `schema.d.ts` with the code that needs it.

## Index: working on X, read Y

| Working on | Read |
|---|---|
| Sign-in, the session, 401 vs busy, permissions and fee visibility, `/account`, no-session pages (`/auth/*`, accept-invite) | `docs/claude/auth-and-session.md` |
| Invoices, automatic billing (To raise, advances, Work vs Billing), GST tax invoice and TDS, `/receivables`, `/dashboard` | `docs/claude/billing-and-invoices.md` |
| `/clients`, the account team, `/clients/import`, `/leads`, own-company and country rules | `docs/claude/clients-and-leads.md` |
| `/calendar`, compliance rules library, calendar words, filings on a service, **`/catalogue` list, service pages and Add a service** | `docs/claude/compliance-calendar.md` |
| My day, `/work-items` board and task page, `/work` jobs, checks (maker ≠ checker), Escalated tab, `/client-requests`, **Structure, Processes, Who checks work** | `docs/claude/delivery-work.md` |
| Tokens, components, Tailwind and shadcn, tables, pills, motion, charts, the Wave 4 / W4C / W4D sweeps | `docs/claude/design-system.md` |
| Forms: submitting, refusals and focus, confirm-in-place, field layout, typed boxes (`AmountInput`, `PhoneInput`) | `docs/claude/forms-and-inputs.md` |
| Money formatting and arithmetic, dates, company day, filing day, time zones, financial years | `docs/claude/money-and-dates.md` |
| The client portal: frame, documents, invoices, action centre, Ask the firm | `docs/claude/portal.md` |
| Proposals and the builder, engagement letters, PDFs, `/p/[token]`, **Your firm, companies, signing, brand, standard prose and terms** | `docs/claude/proposals-and-letters.md` |
| Sidebar, top bar, Aurora shell, anchored panels, **the bell and `/notifications`, the Files panel, the admin-screen map, People / Roles / Grades, `/copilot`** | `docs/claude/shell-and-navigation.md` |
| Any user-facing words: copy rules, the placeholder check, before-and-after examples | `docs/claude/writing-for-the-screen.md` |

## Comments — short, and only the why
- Write WHY, never WHAT the code already says. Default is one line; a short block only for a
  non-obvious decision, a trap, or a client fact — cite its id (Q071, T6.15, W4C).
- No history ("used to", "before W5"), no restating the code/JSX, no repeating a rule documented
  elsewhere — point to it (`see docs/claude/<topic>.md`).
- Exported components/functions: a one-line doc comment unless the contract is genuinely subtle.
- Aim for ≤ ~15 comment lines per 100 lines of code. Long design reasoning belongs in
  `docs/claude/`, not in source.
- This file holds rules + the index only. A new screen or feature adds or extends a
  `docs/claude/` file and at most one index line here — never a new section in CLAUDE.md.
