# bib-frontend

The browser half of **BiB (Business in a Box)** — the 10X Workspace for firm staff, and
later the client portal. A Next.js app talking to `bib-backend` over a typed client
generated from that service's OpenAPI spec.

## Running it

The API must be up first, on `:8080`:

```bash
cd ../bib-backend && npm run migrate && npm run dev
```

Then:

```bash
cp .env.example .env.local
npm install
npm run api:generate     # types, straight from the running API
npm run dev              # http://localhost:3000
```

Sign in at `/login`. To create a login, use the backend's provisioning API, or run the backend's
`npm run smoke` (it prints logins) — see `bib-backend/README.md`. The live task board is
`bib-docs/backend/MERGE_BUILD-PLAN.md` (`bib-docs/backend/BUILD-PLAN.md` is superseded).

## Where things are

| Path | Is |
|---|---|
| `src/app/` | routes (App Router) |
| `src/app/globals.css` | design tokens — colour, spacing, type |
| `src/lib/api/client.ts` | the typed client, and the only place `credentials` is configured |
| `src/lib/api/schema.d.ts` | **generated** from `/openapi.json` — never edit |

Read `CLAUDE.md` before changing anything. The short version: API shapes are generated and
never retyped, the API is always a different origin, and the session cookie is httpOnly so
this app never handles a token.
