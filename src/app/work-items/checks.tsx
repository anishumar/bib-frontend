"use client";

import { useState } from "react";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { WorkItemCheckRow } from "@/lib/api/client";
import { Button, Card, Field, Sub, Table, TableWrap, Td, Textarea, Th } from "@/components/ui";
import { Empty } from "@/components/states";

/**
 * Tasks that are finished and waiting for somebody else to look at them.
 *
 * The task half of the desk `/work`'s "To check" tab already gives the ENGINE.
 * Those two queues are two different tables — `step_approval` is a step of a
 * published process, `work_item_approval` is a whole task, and plenty of work
 * at a real firm never walks a process at all — so they are two tabs on the two
 * screens that own them rather than one merged list that would have to explain
 * which kind each row was.
 *
 * ── IT WAS REACHABLE ONLY BY ACCIDENT BEFORE THIS ───────────────────────────
 *
 * `GET /api/v1/work-item-checks` has been a read with one caller: a banner
 * saying "N tasks are waiting to be checked" that linked to `checks[0]`. With
 * two pending there was no way to reach the second — found by using the
 * product, not by a test: a partner submitted a task and, signed in as somebody
 * else, there was no screen that listed it.
 *
 * ── THE WHOLE FIRM'S QUEUE, AND THE VERDICT RIDES ON THE ROW ────────────────
 *
 * Not "mine". Under a rank threshold there is no "mine" — any Manager may take
 * any of it — and a list filtered to what the viewer can act on hides the
 * queue's most useful fact: that six tasks have waited a week because nobody
 * senior enough has looked. So every row carries the viewer's own verdict, and
 * the ones they may not take SAY WHY, in the API's own sentence.
 *
 * Never a greyed-out button. A control that is present and dead is how a person
 * concludes the product is broken; a sentence is how they find out that the
 * rule is maker != checker and the fix is to ask a colleague.
 *
 * ── NO DUE DATE ANYWHERE ON THIS SCREEN ─────────────────────────────────────
 *
 * Oldest first, by when the work was submitted, which is the API's order. The
 * firm has not given its internal turnaround times, and a deadline this product
 * invented would be a priority the firm never set. How long something has been
 * waiting is not a deadline — it is the elapsed fact the queue exists to show —
 * and it is counted in the BROWSER's calendar days, because the server's day is
 * not the firm's.
 */
export function CheckQueue({
  checks,
  today,
  onDecided,
  onError,
}: {
  checks: WorkItemCheckRow[];
  /** The viewer's own calendar day, computed once by the page. */
  today: string;
  onDecided: () => void;
  onError: (message: string) => void;
}) {
  if (checks.length === 0) {
    return (
      <Card>
        <Empty title="Nothing is waiting to be checked" icon="verification">
          A task lands here when whoever holds it sends it for review from its own page. Who may
          then check it is the firm&rsquo;s own rule, written on{" "}
          <Link href="/admin/verification">Who checks work</Link> — except for one part of it,
          which is never a setting: the person who did the work is never the person who approves
          it.
        </Empty>
      </Card>
    );
  }

  const mine = checks.filter((c) => c.viewer.eligible).length;

  return (
    <>
      {/* What the viewer can actually do about this queue, said once at the top
          rather than left to be counted down the rows. The zero case is the
          one worth saying out loud: a queue you cannot act on is not a queue
          you are being ignored by, and this screen is still the right place to
          see that it is not moving. */}
      <Sub>
        {mine === 0 ? (
          <>
            None of these are yours to check — every row says why. They are waiting on somebody
            else, and that is what this list is for.
          </>
        ) : (
          <>
            <strong>{mine}</strong> of {checks.length}{" "}
            {mine === 1 ? "is yours" : "are yours"} to check.
          </>
        )}
      </Sub>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>What</Th>
              <Th>For</Th>
              <Th>Made by</Th>
              <Th>Waiting</Th>
              <Th>You</Th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <CheckRow
                key={check.id}
                check={check}
                today={today}
                onDecided={onDecided}
                onError={onError}
              />
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

/**
 * One row, and the two buttons — or the sentence instead of them.
 *
 * The title is a LINK, and it is not decoration: approving somebody's work
 * without having looked at it is exactly the sign-off this whole feature exists
 * to make real. The buttons are here because a queue whose every row costs two
 * navigations to clear is a queue nobody clears.
 */
function CheckRow({
  check,
  today,
  onDecided,
  onError,
}: {
  check: WorkItemCheckRow;
  today: string;
  onDecided: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  /** The note panel, open only once somebody has said they are sending it
   *  back. Approving needs no note; rejecting cannot happen without one. */
  const [sendingBack, setSendingBack] = useState(false);
  const [notes, setNotes] = useState("");

  async function decide(decision: "approved" | "rejected", note: string | null): Promise<void> {
    setBusy(true);
    onError("");
    const result = await api.POST("/api/v1/work-item-checks/{approvalId}/decide", {
      params: { path: { approvalId: check.id } },
      body: { decision, notes: note },
    });
    setBusy(false);
    if (result.error) {
      // The API's own words. It re-checks eligibility on the write — the row's
      // verdict was resolved when the page loaded, and somebody's grade, role
      // or membership can change between the two.
      onError(apiError(result.error).message);
      return;
    }
    setSendingBack(false);
    setNotes("");
    onDecided();
  }

  const waited = daysWaiting(check.submittedAt, today);

  return (
    <>
      <tr>
        <Td>
          <Link href={`/work-items/${check.workItemId}`}>{check.workItemTitle}</Link>
          {/* WHICH RULE governs this check, in the firm's own label, pinned as
              it was when the check opened — so a firm that raises its review
              bar in April never restates what was allowed in March. "No
              particular rule" is a real answer and not a blank: then maker !=
              checker is the whole of it. */}
          <Sub>{check.policyLabel ?? "no particular rule — only maker ≠ checker"}</Sub>
        </Td>
        <Td>{check.clientName}</Td>
        <Td>
          {/* Null when the task was unassigned as the check opened: nobody is
              recorded as having made it, so maker != checker has nothing to
              compare and anybody otherwise eligible may check it. */}
          {check.submittedByName ?? <span className="unstated">nobody recorded</span>}
        </Td>
        <Td>
          <span className="mono">{new Date(check.submittedAt).toLocaleDateString()}</span>
          <Sub>{waited}</Sub>
        </Td>
        <Td>
          {check.viewer.eligible ? (
            <span className="cluster tight">
              <Button
                size="sm"
                loading={busy && !sendingBack}
                onClick={() => {
                  void decide("approved", null);
                }}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={sendingBack}
                onClick={() => {
                  setSendingBack(!sendingBack);
                }}
              >
                Send back
              </Button>
            </span>
          ) : (
            // THE SENTENCE, verbatim from the API, never a dead button. The
            // most common one here is the one the database enforces too: you
            // made this, so somebody else has to check it.
            <span className="empty">{check.viewer.reason ?? "Not yours to check."}</span>
          )}
        </Td>
      </tr>
      {sendingBack && (
        <tr>
          {/* The note is the whole reason a rejection is worth recording, so it
              gets the width of the row rather than being squeezed into a cell.
              The API refuses a rejection without one — this asks for it in
              words first, so the refusal is never what teaches somebody. */}
          <Td colSpan={5}>
            <Field
              label="What has to change"
              hint="Required. Why work came back is the only thing that ever explains rework — marking the task done later erases that it was ever sent back."
            >
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
              />
            </Field>
            <span className="cluster tight">
              <Button
                variant="destructive-quiet"
                size="sm"
                loading={busy}
                disabled={notes.trim() === ""}
                onClick={() => {
                  void decide("rejected", notes.trim());
                }}
              >
                Send it back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSendingBack(false);
                }}
              >
                Cancel
              </Button>
            </span>
          </Td>
        </tr>
      )}
    </>
  );
}

/**
 * How long it has been waiting, in the VIEWER's calendar days.
 *
 * `submittedAt` is an instant in UTC and `today` is the browser's own day, so
 * the timestamp is converted to the reader's local date before either is
 * counted. Taking `submittedAt.slice(0, 10)` instead would be the UTC day, and
 * work submitted at 04:11 in India would read as a day older than it is —
 * which is the same bug this product has already shipped twice against a date.
 */
function daysWaiting(submittedAt: string, today: string): string {
  const at = new Date(submittedAt);
  const from = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  const [y, m, d] = today.split("-").map(Number);
  const to = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const days = Math.round((to - from) / 86_400_000);
  if (days <= 0) return "since today";
  return days === 1 ? "1 day" : `${String(days)} days`;
}
