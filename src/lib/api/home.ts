import type { SignInResponse } from "@/lib/api/client";

/**
 * Which half of the product a sign-in belongs to.
 *
 * ── WHY THIS IS A MODULE AND NOT A FUNCTION INSIDE THE LOGIN PAGE ───────────
 *
 * Because it was one, and the OTHER way in did not have it. Signing in with a
 * password routed a client contact to `/portal` correctly; redeeming an emailed
 * link — the same accounts, the same audiences, the same product — pushed
 * everybody to `/`. So a client who used the link the firm sent them landed on
 * the staff workspace, where the sidebar was empty, every screen answered 403,
 * and the pages said "Nobody in the book yet" beside the refusal.
 *
 * Two doors into one building, and the rule about which floor you belong on was
 * written on one of them. It is written here now, once, and both doors read it.
 *
 * ── THE RULE ITSELF ────────────────────────────────────────────────────────
 *
 * `principal.audience` answers it whenever a firm has been chosen. It is NULL
 * for somebody who belongs to more than one, because no membership is active
 * yet — so the memberships decide, and only when EVERY one of them is a portal
 * login. Somebody who is a colleague at one firm and a client's contact at
 * another goes to the workspace and switches org from there: guessing the
 * portal for them would put the narrower app in front of the wider need.
 *
 * ── WHERE STAFF LAND ───────────────────────────────────────────────────────
 *
 * The Work board (V1.1, 2026-09-28), not the AI Copilot that `/` used to be:
 * that screen cannot answer anything yet, and every role started the day on it.
 */
const STAFF_HOME = "/work-items";

export function homeFor(result: SignInResponse | undefined): typeof STAFF_HOME | "/portal" {
  if (result === undefined) return STAFF_HOME;
  if (result.principal.audience === "CLIENT_PORTAL") return "/portal";
  if (result.principal.audience !== null) return STAFF_HOME;
  const all = result.memberships;
  return all.length > 0 && all.every((m) => m.audience === "CLIENT_PORTAL")
    ? "/portal"
    : STAFF_HOME;
}
