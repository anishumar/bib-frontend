# Sign-in, the session, and the account pages

## The session

- The API sets an **httpOnly** cookie. No script can read it, so: no token in `localStorage`, no
  auth header, and sign-out is a call the server acts on. To know who is signed in, read
  `GET /api/v1/auth/me` (through `readSession()` / `useSession()`).
- **Only a 401 signs anybody out** (audit 2026-10-03). `readSession()` in `@/lib/session` is how
  both shells read `/auth/me`: 401 = signed out; a 429, a 5xx or no answer = *busy*: keep what was
  known and ask again (2 s doubling to 30 s, never sooner than `Retry-After`, which the API now
  exposes; `retryDelayMs`). On a first load it shows "The workspace is busy. Trying again in N
  seconds" with **Try now**. A page's own 401 still routes to `/login`; nothing else may. (The
  shell once sent anybody to `/login` whenever `/auth/me` failed, so a busy office's 429 signed
  people out mid-work. Not yet exercised against a real 429 in a browser.)
- A 401 mid-session is ordinary, not an error to display: expired, revoked, or the membership was
  deactivated (the API re-checks it on every request).
- **The API allows 300 requests a minute per ADDRESS**, and an office is one address. Anything
  that polls must budget for that (the bell: `shell-and-navigation.md` (Shared panels)); browser walks must pace
  themselves (CLAUDE.md (Verification)).
- **Permissions decide what to OFFER.** `/auth/me` carries the role's permissions; a portal
  session gets a REAL list since T6.6 (it was `[]`). The fee axis is
  `principal.commercialVisibility`, a separate membership flag that being a partner does not imply
  (`useSeesFees()`; `money-and-dates.md`).

## The firm has a NAME on the wire

`/auth/me` once carried only `tenantId`, so every identity surface showed a uuid fragment (the
topbar `BiB · b35c4196`; "Choose a firm" offering `partner · b35c4196` against `manager ·
7f0a21c4`). Fixed in the API, not joined here:

- `Principal.tenantName`, nullable because it is LOOKED UP and a session pointed at a tenant row
  that has gone is a real (broken) state. One field fixed every screen at once.
- `MembershipSummary.tenantName` on the sign-in response.
- `GET /api/v1/tenancy/me/memberships` returns `MyMembership` (membership + name) instead of adding
  the name to the shared `Membership` schema: it is the only read that crosses firms.
- The uuid stays the FALLBACK wherever the name is null: a bar that silently drops the firm is
  worse than one showing a uuid.

## `/login` and where people land

- Email + password sets the cookie. **`/login` routes by AUDIENCE** (`homeFor` in
  `lib/api/home.ts`): staff land on `/` (My day), clients on `/portal`. A client contact sent to
  `/` sees an empty sidebar with every screen answering 403: the gate working, reading as a broken
  app. `audience` answers when a firm is chosen; when null (more than one firm) the memberships
  decide, and it is the portal only when EVERY membership is a portal login.
- "Email me a sign-in link instead" is never disabled (it drew pale grey); with no email typed it
  asks the browser to flag the empty box and focuses it. The link lands on `/auth/magic-link`.

## Pages with no session

| Route | Rule |
|---|---|
| `/auth/forgot-password` | Answers the same sentence whatever happened, because the API answers 202 to everything: "we found your account" is exactly the leak the 202 prevents. |
| `/auth/reset-password` | A FORM, not an effect: nothing is spent by arriving, so a mail scanner that follows the link burns nothing. Choosing a password replaces the old one, revokes every session the account held, and signs this one in. |
| `/auth/welcome` | A new colleague's welcome link: "Choose your password", or "Skip for now and sign in". |
| `/portal/accept-invite` | The token IS the authorisation; setting a password creates the login, so the portal frame exempts this route rather than bouncing to `/login`. Prints the `firm` query parameter the API puts on the link (display only, capped). |
| `/p/[token]` | The public proposal (`proposals-and-letters.md`). |

The API's refusals here are deliberately vague about whether an account exists. Show them
verbatim; a friendlier rewrite leaks what the backend refused to.

## The account pages

- **`/account` is yours, not the firm's**: your password, whether you see fees, and your
  notification choices (`owner="mine"`). Role, grade, reporting line and access are the firm's and
  live on `/admin/people`.
- **`/portal/account`** is the client's half: the audience that most reliably HAS a password, and
  before it the only one that could not change it.
