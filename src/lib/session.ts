import { api, type Principal } from "@/lib/api/client";

/**
 * Who is signed in, read the one way both shells read it.
 *
 * ── ONLY A 401 MEANS SIGNED OUT (audit 2026-10-03, F15) ──────────────────
 *
 * Both the staff shell and the portal frame used to treat ANY failed
 * `/auth/me` as "not signed in" and send the reader to `/login`. A 429 (the
 * API's rate limit), a 502 while the API restarts, or a dropped connection
 * then signed out somebody whose session was perfectly good, mid-task. The
 * session is the API's to end, and it says so with a 401; everything else is
 * the API being busy or unreachable for a moment, which is a reason to wait
 * and ask again, never a reason to throw the reader out.
 */
export type SessionRead =
  | { readonly kind: "in"; readonly principal: Principal }
  | { readonly kind: "out" }
  /** Busy or unreachable. `waitMs` is the API's own Retry-After when it sent
   *  one (exposed to this origin since F15), else 0 for "use the backoff". */
  | { readonly kind: "busy"; readonly waitMs: number };

export async function readSession(): Promise<SessionRead> {
  try {
    const me = await api.GET("/api/v1/auth/me", {});
    if (me.data) return { kind: "in", principal: me.data };
    if (me.response.status === 401) return { kind: "out" };
    return { kind: "busy", waitMs: retryAfterMs(me.response) };
  } catch {
    // fetch rejects only when no response arrived at all: offline, DNS, the
    // API down. Not a sign-out.
    return { kind: "busy", waitMs: 0 };
  }
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/**
 * How long to wait before the next try: doubling from 2 s, capped at 30 s, and
 * never sooner than the API asked for. Attempt 0 is the first retry.
 */
export function retryDelayMs(attempt: number, askedMs: number): number {
  const backoff = Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
  return Math.max(backoff, askedMs);
}
