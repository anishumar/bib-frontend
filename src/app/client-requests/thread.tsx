"use client";

import type { ClientRequest, ClientRequestReply } from "@/lib/api/client";
import { longInstant } from "@/lib/day";

/**
 * The conversation, and where it stands — shared by the inbox and the record.
 *
 * ── WHY THESE TWO LEFT THE INBOX FILE ───────────────────────────────────────
 *
 * A finished request is on no screen the inbox draws: `listLive` filters it out
 * the moment somebody presses Close. `/client-requests/[requestId]` is the
 * record, and it renders the SAME thread — so the alternative was a second copy
 * of a reply line, which is how two surfaces come to disagree about who said
 * what. The API already refuses to keep two copies of this shape for the firm
 * and the portal (`ClientRequestRecord` versus `PortalRequestRow` are different
 * on purpose and each has one definition); this is that rule applied one level
 * up.
 */

export function ReplyLine({
  reply,
  clientName,
}: {
  reply: ClientRequestReply;
  clientName: string;
}) {
  const fromFirm = reply.authorSide === "firm";
  return (
    <div>
      <p className="text-sm text-ink-2">
        {/* BOTH SIDES ARE NAMED HERE, unlike the portal's copy of this thread —
            the firm needs to know which of its own people answered, and which
            of the client's two directors asked. */}
        {reply.authorName ?? (fromFirm ? "Somebody here" : clientName)} ·{" "}
        {fromFirm ? "us" : clientName} · {longInstant(reply.writtenAt)}
      </p>
      <p>{reply.body}</p>
      {reply.document !== null && <p className="text-ink-2">Sent: {reply.document.title}</p>}
    </div>
  );
}

/**
 * THREE STATES, AND THE RAW `status` IS ON NONE OF THEM.
 *
 * The first draft printed the pill AND `request.status` in the meta line, which
 * on a live row said one thing twice — "Waiting on us" beside "open" — and this
 * codebase has now been caught by that shape three times (the portal listing a
 * filing as both a filing and a task; the action centre printing an ask and its
 * blocked reason). Found by looking at the page; both chips were correct.
 *
 * Dropping the duplicate also drops a machine word off a partner's screen. What
 * is left is the three states a reader actually acts on, and the middle one —
 * the client came BACK after the firm replied — is the one neither chip could
 * say on its own: `status` stays `answered` (the firm has come back at least
 * once, which is what that word means and what 0068's CHECK ties to
 * `first_replied_at`), while `awaitingFirm` flips to true off the thread.
 *
 * A FINISHED request never reaches this: `awaitingFirm` is meaningless once
 * nobody is waiting, and the record says how it ENDED instead — see
 * `howItEnded` on the record page.
 */
export function whereItStands(request: ClientRequest): string {
  if (!request.awaitingFirm) return "We replied last";
  // "They came back" means they wrote AFTER we answered. It read off any reply
  // at all, so a client who added a follow-up to a request the firm had never
  // answered was shown as coming back (audit 2026-10-03, F29).
  return request.replies.some((r) => r.authorSide === "firm") ? "They came back" : "Waiting on us";
}
