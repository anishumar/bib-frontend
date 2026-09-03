"use client";

/**
 * Everything outstanding between the client and the firm, in both directions.
 *
 * ── WHY THIS IS ITS OWN SCREEN NOW, WHEN T6.7 SAID IT SHOULD NOT BE ───────
 *
 * The two lanes — what the firm has asked this client for (T6.6) and what the
 * client has asked the firm for (T6.8) — used to sit on the status home, under
 * an argument that was correct: they are ONE SUBJECT read from opposite ends,
 * and *"what is outstanding between us"* should not be two answers on two
 * pages.
 *
 * That argument is untouched. What broke was the page they were on. Measured on
 * the seeded firm, `/portal` had grown to **4,489px — three and a half screens
 * — carrying SEVEN top-level sections**: two request lanes and four status
 * lists. "Ask the firm" was three lines and a button, 1,640px down, wedged
 * between a list of sent replies and a list of blocked jobs. It was on the home
 * page and it was unfindable, which are not the same thing, and the whole of
 * T6.7's reasoning had quietly assumed they were.
 *
 * So both lanes moved, TOGETHER, and that is the part that matters: they are
 * still one answer and still side by side. What they no longer do is compete
 * with four status tables for the top of the only screen a client lands on.
 *
 * ── THE ORDER IS THE POINT ────────────────────────────────────────────────
 *
 * What is waiting on YOU comes first, because it is the only thing on this page
 * a reader can finish. What they have already sent comes next, because the
 * question straight after "what do they need" is "did the thing I sent arrive".
 * What they have asked the firm for comes last: it is theirs, it is not urgent
 * to them in the way an unanswered request is, and putting it first would open
 * the page on a form instead of on a task.
 *
 * ── AND IT COSTS NO EXTRA REQUEST ─────────────────────────────────────────
 *
 * The companies this contact may act for come from `principal.portalScope`,
 * which the frame has already read from `/auth/me`; the counts come from the
 * frame's own read of `/api/v1/portal/asks`. This screen adds neither. The one
 * fetch it does trigger is `ActionCentre`'s and `AskTheFirm`'s own, which are
 * the reads that draw the lists — the same two the home page used to make.
 */

import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { Empty } from "@/components/states";
import { browserDay, usePortalRequestCount, usePortalSession } from "../portal-frame";
import { ActionCentre } from "../action-centre";
import { AskTheFirm } from "../ask-the-firm";

export default function PortalRequestsPage() {
  const session = usePortalSession();
  const counts = usePortalRequestCount();
  const firm = session?.tenantName ?? "your accountants";

  // From the SESSION, not from a second read of the status home. `portalScope`
  // is `null` for a staff principal and `[]` for a contact granted nothing —
  // two different facts, and the frame has already refused to render this page
  // for the first of them, so `?? []` here can only mean the second.
  const companies = session?.portalScope ?? [];
  const asOf = browserDay();

  return (
    <Page>
      <PageHeader
        eyebrow={firm}
        title="Requests"
        lede={`Anything outstanding between you and ${firm} — what they need from you, and what you have asked them for.`}
      />

      {/* GOOD NEWS HAS TO READ AS GOOD NEWS. `ActionCentre` renders nothing at
          all when both its lists are empty, which is right on a status page it
          shares with four other sections and wrong on a page named after it —
          a reader who clicked "Requests" and found the firm's half of the page
          simply missing cannot tell "nothing is waiting" from "this did not
          load". So the sentence is said out loud, and only once the count has
          actually landed: `loaded` is false both before the read and after one
          that failed, and neither is a state in which to claim nothing is owed. */}
      {counts.loaded && counts.awaitingYou === 0 && counts.withTheFirm === 0 && (
        <Empty title={`${firm} is not waiting on anything from you`} icon="check">
          When they need a document, an approval or an answer, it will appear here — and the
          rail on the left will say how many.
        </Empty>
      )}

      {/* ── 1 · WHAT THE FIRM NEEDS FROM YOU (T6.6) ──────────────────────────
          `onChanged` refreshes the FRAME's count as well as this list. Without
          it a client would answer the last outstanding ask and still be looking
          at a badge saying one is waiting — the rail contradicting the page the
          reader is standing on, which is worse than no badge at all. */}
      <ActionCentre asOf={asOf} onChanged={counts.refresh} />

      {/* ── 2 · WHAT YOU HAVE ASKED THEM FOR (T6.8) ────────────────────────── */}
      <AskTheFirm asOf={asOf} companies={companies} firm={firm} />

      {/* GRANTED NOTHING. The status home says this at length; here it needs
          saying too, because "Ask for something" needs a company to be about
          and there is none — and a form that refuses without explaining why is
          the failure the portal was built to end. */}
      {companies.length === 0 && (
        <Section title="Nothing shared with you yet" level={2}>
          <Stack gap="tight">
            <p className="muted">
              Your login works, but {firm} has not yet given it access to a company — so there
              is nothing here to ask about yet. Ask your contact at {firm} to share your
              company with this email address.
            </p>
          </Stack>
        </Section>
      )}
    </Page>
  );
}
