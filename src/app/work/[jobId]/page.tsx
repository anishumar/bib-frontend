"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import { api, apiError, CHECK_INELIGIBILITY } from "@/lib/api/client";
import type { AgentProposal, CheckLine, Job, JobStep, StepCheck } from "@/lib/api/client";
import { Button, cx } from "@/components/ui";
import { Card, ErrorNotice, Notice, Page, PageHeader, Pill } from "@/components/tw";
import { longInstant } from "@/lib/day";
import { CheckLines } from "./check-lines";
import { ConfirmAction } from "@/components/confirm-action";

/**
 * One job's process, and how far it has got (T2.7).
 *
 * ── THIS SCREEN IS THE PRODUCT'S FIRST GOAL ─────────────────────────────────
 *
 * Before it, "how do we do a GST filing" lived in a partner's head and "where is
 * that filing" was a phone call. This is the same knowledge written down once
 * and walked automatically — and it works with no agents at all, because every
 * step can be a person's and a person ticks it off here.
 *
 * ── WHY A SKIPPED STEP IS SHOWN, NOT HIDDEN ─────────────────────────────────
 *
 * "We did not do this, and here is why" is a different fact from "we did this",
 * and it is the one somebody asks about a year later when a filing is
 * questioned. Hiding a skipped step would make the process look like it never
 * had that step at all — which is precisely the record this table exists to
 * prevent losing.
 *
 * ── AND WHY AN `agent` STEP CAN SAY "WAITING FOR YOU" ───────────────────────
 *
 * A firm can write a step as an agent's before any agent is built for it. The
 * work does not stop: it waits for a person like any other step, and the screen
 * says which of the two it is. That is the API's own rule rendered, not a
 * convenience — a process must never break because engineering has not shipped
 * something yet.
 */
/** Whether a job's window has not opened yet: a per-period job during its own
 *  month. Compared as instants, which is what `runnableAt` is. The same test
 *  the Jobs list makes, kept beside its reader. */
function isUpcoming(job: Job): boolean {
  const opens = Date.parse(job.runnableAt);
  return !Number.isNaN(opens) && opens > Date.now();
}

/** Why there is nothing to tick yet, in the words of whichever reason it is. */
function NoStepsYet({ job }: { job: Job | null }) {
  if (job !== null && isUpcoming(job)) {
    return (
      <>
        Opens on <strong>{longInstant(job.runnableAt)}</strong>. The steps appear then.
      </>
    );
  }
  if (job === null || job.templateVersionId === null) {
    return (
      <>
        No steps yet: this service has no published process. Choose one for it in the Catalogue.
      </>
    );
  }
  return <>No steps yet. They open on the next run.</>;
}

export default function JobStepsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [checks, setChecks] = useState<StepCheck[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // TICKS ON ONE LIST ARE NOT SERIALISED, and their answers can arrive out of
  // order. Each PUT answers with the whole step (or check) as it stood after
  // ITS write, so if the answer to the first of two quick ticks lands last it
  // would put the list back to one tick, with the "3 of 4" and the Done button
  // computed from it. So the page counts what is in flight per list: an answer
  // is applied only when it is the last one out and nothing overlapped it, and
  // after a burst that did overlap, the list is read again, once. Blocking a
  // second tick until the first returns was the other way, and it drops the
  // presses of somebody ticking quickly down a list of eight.
  const inFlight = useRef(new Map<string, number>());
  const overlapped = useRef(new Set<string>());
  function sent(list: string): void {
    const n = (inFlight.current.get(list) ?? 0) + 1;
    inFlight.current.set(list, n);
    if (n > 1) overlapped.current.add(list);
  }
  /** What to do with an answer that just arrived for `list`. */
  function answered(list: string): "apply" | "wait" | "reload" {
    const n = Math.max(0, (inFlight.current.get(list) ?? 1) - 1);
    inFlight.current.set(list, n);
    if (n > 0) return "wait";
    return overlapped.current.delete(list) ? "reload" : "apply";
  }

  const load = useCallback(async (): Promise<void> => {
    const [result, header, me, checkList] = await Promise.all([
      api.GET("/api/v1/jobs/{jobId}/steps", { params: { path: { jobId } } }),
      // The job itself, not just its steps. A merged job's steps say nothing
      // about WHOSE work they are, and after the merge that is a real question:
      // one checklist can hold three services for one of a client's companies.
      api.GET("/api/v1/jobs/{jobId}", { params: { path: { jobId } } }),
      api.GET("/api/v1/auth/me", {}),
      // Every check this job has ever had, decided ones included (T2.9). The
      // rejections are the point: a step sent back twice and then approved
      // reads as a step that sailed through if only the open one is shown.
      api.GET("/api/v1/jobs/{jobId}/checks", { params: { path: { jobId } } }),
    ]);
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setSteps(result.data.steps);
    setChecks(checkList.data?.checks ?? []);
    setJob(header.data ?? null);
    setPermissions(me.data?.permissions ?? []);
    setMe(me.data?.userId ?? null);
    setError(null);
    setLoaded(true);
  }, [jobId, router]);

  /** Put a step on a desk — mine (take), somebody's (hand over), nobody's (release). */
  const assign = useCallback(
    async (stepKey: string, userId: string | null): Promise<void> => {
      setBusy(stepKey);
      const result = await api.PUT("/api/v1/jobs/{jobId}/steps/{stepKey}/assignee", {
        params: { path: { jobId, stepKey } },
        body: { userId },
      });
      setBusy(null);
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      await load();
    },
    [jobId, load],
  );

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * What a person decided about a machine's answer.
   *
   * Reloads the whole list afterwards for the same reason completing a step
   * does: accepting one opens whatever was waiting on it in the same call, and
   * patching only the clicked row would leave the next step looking untouched.
   */
  async function decide(
    stepKey: string,
    outcome: "accepted" | "corrected" | "rejected",
    applied: Record<string, unknown> | null,
    rejectedReason: string | null,
  ): Promise<void> {
    setBusy(stepKey);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    setError(null);
    const result = await api.POST("/api/v1/jobs/{jobId}/steps/{stepKey}/decide", {
      params: { path: { jobId, stepKey } },
      body: { outcome, applied, rejectedReason },
    });
    if (result.error) setError(apiError(result.error).message);
    else await load();
    setBusy(null);
  }

  /** Correcting edits the machine's own answer, so the box opens holding it —
   *  a blank field would make "correct" mean "retype everything", and the API
   *  refuses a correction that changed nothing anyway. */
  async function correct(stepKey: string, proposal: AgentProposal): Promise<void> {
    const edited = window.prompt(
      "What should this say instead? The automatic answer is below. Change what is wrong.",
      JSON.stringify(proposal.proposed),
    );
    if (edited === null) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(edited) as Record<string, unknown>;
    } catch {
      setError("That text is not in the format it was shown in, so nothing was recorded.");
      return;
    }
    await decide(stepKey, "corrected", parsed, null);
  }

  /** A rejection has to say what was wrong — the schema insists, because that
   *  note is only ever written by somebody already in a hurry. */
  async function reject(stepKey: string): Promise<void> {
    const reason = window.prompt("What was wrong with it?");
    if (reason === null || reason.trim() === "") return;
    await decide(stepKey, "rejected", null, reason.trim());
  }

  /**
   * Approve somebody else's work, or send it back (T2.9).
   *
   * Reloads afterwards for `complete`'s reason and one more: approving FINISHES
   * the step and opens whatever was waiting on it, in the same call, so patching
   * the clicked row would leave the next step looking untouched.
   */
  async function decideCheck(
    approvalId: string,
    decision: "approved" | "rejected",
    notes: string | null,
  ): Promise<void> {
    setBusy(approvalId);
    setError(null);
    const result = await api.POST("/api/v1/checks/{approvalId}/decide", {
      params: { path: { approvalId } },
      body: { decision, notes },
    });
    if (result.error) {
      // Verbatim, and this is the family where it matters most. "You did this
      // work, so you cannot be the one who checks it" is the whole explanation,
      // and a local "not allowed" would leave somebody looking for a permission
      // to change when there is none — the database refuses it.
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  /** Sending work back has to say what was wrong. The API insists and so does
   *  the database — that note is the only thing that ever explains rework. */
  async function sendBack(approvalId: string): Promise<void> {
    const reason = window.prompt("What needs fixing?");
    if (reason === null || reason.trim() === "") return;
    await decideCheck(approvalId, "rejected", reason.trim());
  }

  async function complete(stepKey: string): Promise<void> {
    setBusy(stepKey);
    setError(null);
    const result = await api.POST("/api/v1/jobs/{jobId}/steps/{stepKey}/complete", {
      params: { path: { jobId, stepKey } },
    });
    if (result.error) {
      // Verbatim. The API's refusal is the whole explanation — "this step is
      // not waiting for anybody", "a second completion would overwrite who did
      // it" — and a local "something went wrong" would throw away the sentence
      // that says what actually happened.
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    // Reload rather than patch the one row: completing a step OPENS the ones
    // that were waiting on it, in the same call. Updating only what was clicked
    // would leave the next step looking untouched until somebody refreshed.
    await load();
    setBusy(null);
  }

  /**
   * Tick one of a step's sub-steps, mark it not applicable, or take the tick
   * back (T6.15).
   *
   * PATCHES the one step rather than reloading the page, which is the opposite
   * of what Done does and for the opposite reason. A tick opens nothing and
   * closes nothing: the step it sits on is the only thing that changed, and the
   * API answers with that step already described for this viewer, `subStepsOpen`
   * included. Four reads per tick, down a list of eight, is a page that flickers
   * under somebody while they work.
   *
   * The marker is the SESSION's user and is never sent. Who ticked a line is
   * the one thing about it nobody may choose.
   */
  async function markSubStep(
    stepKey: string,
    itemKey: string,
    outcome: CheckLine["outcome"],
    note: string | null,
  ): Promise<boolean> {
    setBusy(`sub:${stepKey}:${itemKey}`);
    // Cleared before the call, for `decide`'s reason: a second identical
    // refusal has to be a second appearance or the press looks like nothing.
    setError(null);
    const list = `sub:${stepKey}`;
    sent(list);
    const result = await api.PUT("/api/v1/jobs/{jobId}/steps/{stepKey}/sub-steps/{itemKey}", {
      params: { path: { jobId, stepKey, itemKey } },
      body: { outcome, note },
    });
    const next = answered(list);
    setBusy(null);
    if (result.error) {
      // Verbatim. "Locked while the work waits to be checked" and "this step is
      // on Rohan's desk" are the whole explanation, and both can become true
      // between this page loading and the press.
      setError(apiError(result.error).message);
      if (next === "reload") await load();
      return false;
    }
    const updated = result.data;
    if (next === "apply") setSteps((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    else if (next === "reload") await load();
    return true;
  }

  /**
   * Tick one of an open check's review points (T6.15). The CHECKER's list, so
   * it is keyed on the check rather than the step: a check opened after a
   * send-back starts with every point open, and the first round's ticks stay
   * on the first round. Patches the one check, for `markSubStep`'s reason.
   */
  async function markReviewPoint(
    approvalId: string,
    itemKey: string,
    outcome: CheckLine["outcome"],
    note: string | null,
  ): Promise<boolean> {
    setBusy(`review:${approvalId}:${itemKey}`);
    setError(null);
    const list = `review:${approvalId}`;
    sent(list);
    const result = await api.PUT("/api/v1/checks/{approvalId}/review-points/{itemKey}", {
      params: { path: { approvalId, itemKey } },
      body: { outcome, note },
    });
    const next = answered(list);
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      if (next === "reload") await load();
      return false;
    }
    const updated = result.data;
    if (next === "apply") setChecks((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    else if (next === "reload") await load();
    return true;
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  const canComplete = permissions.includes("work:write");
  const open = job !== null && job.status !== "done" && job.status !== "cancelled";

  /** Stop the job for good (V2.4), behind V1.3's confirm. */
  async function cancelJob(): Promise<void> {
    setBusy("cancel");
    const result = await api.POST("/api/v1/jobs/{jobId}/cancel", { params: { path: { jobId } } });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  return (
    <Page>
      <nav className="cluster">
        <Link href="/work">← Jobs</Link>
      </nav>
      {/* WHOSE work this is, as the title. After the merge one checklist can
          hold three services for one of a client's companies, so the title is
          what it delivers and the line under it is the company (and who is
          billed, when that differs). The period, on a per-period job (T6.13):
          this is September's checklist, not the engagement's. */}
      <PageHeader
        title={
          job === null
            ? "Job"
            : [
                job.services.length === 0
                  ? "Job"
                  : job.services.map((sv) => sv.serviceName).join(" · "),
                job.periodLabel,
              ]
                .filter((x) => x !== null)
                .join(" · ")
        }
        lede={
          job === null ? undefined : (
            <>
              {job.entityName ?? "An unnamed company"}
              {job.clientName !== null && job.clientName !== job.entityName && (
                <> · billed to {job.clientName}</>
              )}
              {job.splitCode !== null && <> · {job.splitCode}</>}
              {job.status === "cancelled" && (
                <>
                  {" "}
                  <Pill dot tone="danger">
                    Cancelled
                  </Pill>
                </>
              )}
            </>
          )
        }
        actions={
          open && canComplete ? (
            <ConfirmAction
              variant="destructive-quiet"
              disabled={busy !== null}
              loading={busy === "cancel"}
              title="Cancel this job?"
              confirmLabel="Cancel the job"
              destructive
              consequence={
                <p>
                  Its open steps and tasks come off everyone&rsquo;s desk and cannot be
                  reopened. Steps already done stay done.
                  {job.periodLabel === null ? "" : ` No new job is made for ${job.periodLabel}.`}
                </p>
              }
              onConfirm={() => void cancelJob()}
            >
              Cancel job
            </ConfirmAction>
          ) : undefined
        }
      />
      <ErrorNotice error={error} />

      {steps.length === 0 ? (
        <p className="max-w-[var(--measure)] text-ink-2">
          {/* THREE reasons a job has no steps, and only one of them is the firm
              not having written a process. Saying that one for all three sent a
              partner to the process editor on the 24th of the month to find v1
              already in force: a per-period job pins its process on the day it
              OPENS (T6.13), and until then it carries none by design. */}
          <NoStepsYet job={job} />
        </p>
      ) : (
        <Card>
          <ol className="m-0 list-none p-0">
            {steps.map((s) => (
              <li
                key={s.id}
                /* A skipped step is DIMMED rather than hidden — the record that
                   it will not happen is the point. This carried `data-inactive`
                   over from the tables, where `.table tbody tr[data-inactive]`
                   styles it; on an `<li>` that selector never matches, so the
                   step it was meant to fade read exactly as live as a live one.
                   Measured on the rendered page: opacity 1, identical ink.

                   It STACKS below `sm`. The actions never shrink and a pill
                   carrying a whole sentence sets a wide minimum, so as a row
                   this pushed the page 117px sideways at 390. */
                className={cx(
                  "flex flex-col items-start gap-4 border-t border-line py-4 sm:flex-row",
                  s.status === "skipped" && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  {/* The step's LABEL only: its key is the process's handle,
                      never shown (T6.15's editor keeps keys off screen too). */}
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{s.label}</strong>
                    <StepState
                      step={s}
                      check={openCheckFor(checks, s.stepKey)}
                      jobCancelled={job?.status === "cancelled"}
                    />
                  </div>
                  <Desk step={s} />
                  {s.outcomeNote !== null && (
                    <p className="mt-1 text-sm text-ink-2">{s.outcomeNote}</p>
                  )}
                  {s.proposal !== null && s.proposal !== undefined && (
                    <Proposal proposal={s.proposal} />
                  )}
                  {/* THE DOER'S LIST (T6.15). Editable only where the API
                      would take the tick: the step is waiting, nothing is
                      waiting to be checked, and it is this viewer's to do. The
                      same three facts decide the Done button, so the list and
                      the button can never be open at different times. */}
                  {s.subSteps.length > 0 && (
                    <CheckLines
                      title="Sub-steps"
                      scope={s.label}
                      lines={s.subSteps}
                      open={s.subStepsOpen}
                      editable={
                        s.status === "blocked" &&
                        openCheckFor(checks, s.stepKey) === null &&
                        canComplete &&
                        s.viewer.mayComplete
                      }
                      lockedBecause={subStepsLocked(s, openCheckFor(checks, s.stepKey), canComplete)}
                      busy={lineBusy(busy, `sub:${s.stepKey}:`)}
                      onMark={(key, outcome, note) => markSubStep(s.stepKey, key, outcome, note)}
                    />
                  )}
                  {/* THE CHECKER'S LIST, on the OPEN check only. It belongs to
                      that check, not to the step: after a send-back the next
                      check starts with every point open, and the earlier
                      round's ticks are in the history below, read-only. */}
                  {openCheckFor(checks, s.stepKey) !== null &&
                    (openCheckFor(checks, s.stepKey) as StepCheck).reviewPoints.length > 0 && (
                      <ReviewPoints
                        check={openCheckFor(checks, s.stepKey) as StepCheck}
                        scope={s.label}
                        canWrite={canComplete}
                        busy={busy}
                        onMark={markReviewPoint}
                      />
                    )}
                  <CheckHistory scope={s.label} checks={checks.filter((c) => c.stepKey === s.stepKey)} />
                </div>
                <div className="grid shrink-0 gap-1.5">
                  {/* A step with an undecided proposal gets the three verdicts
                      INSTEAD of the Done button, not beside it. Ticking "done"
                      would record that a person did the work and leave what the
                      machine said undecided forever — which is the accuracy
                      signal the whole guardrail exists to keep, so the API
                      refuses it and the screen does not offer it. */}
                  {/* WAITING TO BE CHECKED takes precedence over everything
                      else, because the person looking at it is a different
                      person: the maker is finished here, and what is offered is
                      somebody else's judgement on their work. Offering Done
                      would be offering a 409. */}
                  {s.status === "blocked" && openCheckFor(checks, s.stepKey) !== null ? (
                    <CheckActions
                      check={openCheckFor(checks, s.stepKey) as StepCheck}
                      stepKey={s.stepKey}
                      busy={busy}
                      onApprove={(id) => void decideCheck(id, "approved", null)}
                      onSendBack={(id) => void sendBack(id)}
                    />
                  ) : null}
                  {s.status === "blocked" &&
                    openCheckFor(checks, s.stepKey) === null &&
                    canComplete &&
                    (s.proposal ? (
                      <>
                        {/* NAMED BY THE STEP'S HANDLE. A process runs more than
                            one step at a time — "Collect the books" and
                            "Prepare the return" can both be waiting — and every
                            one of these four buttons said only its verb. The
                            handle is permanent, it is already on screen beside
                            the step's label, and none of these is a decision to
                            take against the wrong step. */}
                        {/* Accept and Correct are held by the sub-steps too
                            (T6.15): accepting a machine's answer is a person
                            saying the work is done, and the API refuses both
                            while a line is open. Reject is not held: throwing
                            an answer away finishes nothing. */}
                        <Button
                          disabled={busy === s.stepKey || s.subStepsOpen > 0}
                          aria-label={`Accept ${s.stepKey}`}
                          onClick={() => {
                            void decide(s.stepKey, "accepted", null, null);
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy === s.stepKey || s.subStepsOpen > 0}
                          aria-label={`Correct ${s.stepKey}`}
                          onClick={() => {
                            if (s.proposal) void correct(s.stepKey, s.proposal);
                          }}
                        >
                          Correct
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy === s.stepKey}
                          aria-label={`Reject ${s.stepKey}`}
                          onClick={() => {
                            void reject(s.stepKey);
                          }}
                        >
                          Reject
                        </Button>
                        {/* The sub-steps are ticked by whoever has the step,
                            and the list says "take it to tick them yourself";
                            this branch is the one place that sentence would
                            point at a button that was not on the page. */}
                        {s.subSteps.length > 0 && s.viewer.reason === "ON_ANOTHER_DESK" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === s.stepKey}
                            aria-label={`Take: ${s.stepKey}`}
                            onClick={() => {
                              void assign(s.stepKey, me);
                            }}
                          >
                            Take it
                          </Button>
                        )}
                        <SubStepsLeft count={s.subStepsOpen} />
                      </>
                    ) : (
                      s.viewer.mayComplete ? (
                        <>
                          {/* DISABLED while a sub-step is open, and the sentence
                              under it says how many. `subStepsOpen` is the count
                              the API's 409 refuses on, so the button and the
                              refusal cannot disagree; the refusal is still shown
                              if one arrives, because a colleague's list is not
                              this page's to predict. */}
                          <ConfirmAction
                            disabled={busy === s.stepKey || s.subStepsOpen > 0}
                            aria-label={`Done: ${s.stepKey}`}
                            title={`Mark "${s.label}" done?`}
                            confirmLabel="Mark it done"
                            consequence={
                              <p>
                                This records that you did &ldquo;{s.label}&rdquo;. It cannot be
                                undone. If the step is checked, it goes to the checker next.
                              </p>
                            }
                            onConfirm={() => {
                              void complete(s.stepKey);
                            }}
                          >
                            Done
                          </ConfirmAction>
                          <SubStepsLeft count={s.subStepsOpen} />
                        </>
                      ) : s.viewer.reason === "ON_ANOTHER_DESK" ? (
                        /* Somebody else's step. Taking it is one click and one
                           ledger row; ticking it from underneath them is what the
                           API refuses, so it is not offered. */
                        <Button
                          variant="secondary"
                          disabled={busy === s.stepKey}
                          aria-label={`Take: ${s.stepKey}`}
                          onClick={() => {
                            void assign(s.stepKey, me);
                          }}
                        >
                          Take it
                        </Button>
                      ) : (
                        <span className="text-sm text-ink-2">
                          {s.performer === null ? "Not yours to do" : `For ${bandLabel(s.performer)}`}
                        </span>
                      )
                    ))}
                  {s.status === "blocked" && openCheckFor(checks, s.stepKey) === null && canComplete && (
                    <HandOver jobId={jobId} step={s} busy={busy === s.stepKey} onHand={(userId) => void assign(s.stepKey, userId)} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ONE line, where the act is (Wave 4). Three paragraphs sat here; the
          rules they spelt out (sub-steps hold Done shut, review points hold
          Approve shut, a machine's answer is accepted, corrected or rejected)
          are each said on the control they govern, and in CLAUDE.md. */}
      {steps.some((s) => s.status === "blocked") && (
        <p className="max-w-[var(--measure)] text-sm text-ink-2">
          Done records that <strong>you</strong> did the step. It cannot be undone.
        </p>
      )}
      {/* Working papers, challans, the evidence a step was actually done. A
          job's files belong to the FIRM rather than to a client, so no partyId
          is passed — the column exists for the client portal's record scope,
          and claiming a working paper is the client's would be wrong. */}
      <Documents
        subjectKind="job"
        subjectRef={jobId}
        canWrite={permissions.includes("party:write")}
        title="Working papers"
        emptyHint="Nothing attached yet. Add the challan or working paper behind a step."
      />
    </Page>
  );
}

/**
 * A step's state in the words somebody at a desk uses.
 *
 * The `agent`-with-no-agent case gets its own sentence rather than the same
 * "waiting for you" as a human step, because they are different facts and one
 * of them is something the firm may want to chase.
 */
/**
 * The open check on a step, or null.
 *
 * One at most — the database enforces it with a unique partial index, so that
 * two people cannot each open one and approve the other's. Joined on the step
 * KEY rather than an id, because the key is what the wire carries and what the
 * audit trail names; a step's id is not on the check.
 */
function openCheckFor(checks: StepCheck[], stepKey: string): StepCheck | null {
  return checks.find((c) => c.stepKey === stepKey && c.decision === "pending") ?? null;
}

/**
 * What a check says while it is open, and what it said after it was decided.
 *
 * The rejections are the whole reason decided checks are shown at all: a step
 * sent back twice and then approved looks identical to one that sailed through
 * if only the open check is rendered, and "this took three goes" is the only
 * signal anywhere that explains where a week went.
 */
function CheckHistory({ checks, scope }: { checks: StepCheck[]; scope: string }) {
  const decided = checks.filter((c) => c.decision !== "pending");
  if (decided.length === 0) return null;
  return (
    <div className="mt-2">
      {decided.map((c) => (
        <div key={c.id}>
          <p className="mt-0.5 text-sm text-ink-2">
            {c.decision === "rejected" ? "Sent back" : "Approved"} on{" "}
            {c.decidedAt === null ? "an unknown date" : longInstant(c.decidedAt)}
            {c.notes !== null && c.notes.trim() !== "" && <>: “{c.notes}”</>}
          </p>
          {/* What THAT checker ticked, read-only (T6.15). A send-back at
              point three shows points one and two ticked and the rest open,
              which is exactly where the checker stopped and why. */}
          {c.reviewPoints.length > 0 && (
            <CheckLines
              title="Review points"
              scope={scope}
              lines={c.reviewPoints}
              open={c.reviewPointsOpen}
              editable={false}
              lockedBecause={null}
              busy={null}
              onMark={() => Promise.resolve(false)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The review points of the one OPEN check on a step (T6.15), ticked by
 * whoever may check it.
 *
 * Editable for an ELIGIBLE viewer only, which is the API's verdict on the row,
 * so the maker can never tick their own review points: the same rule that
 * keeps them off Approve. Everybody else sees the list as a record of how far
 * the checker has got, with the reason they cannot tick it.
 */
function ReviewPoints({
  check,
  scope,
  canWrite,
  busy,
  onMark,
}: {
  check: StepCheck;
  scope: string;
  canWrite: boolean;
  busy: string | null;
  onMark: (
    approvalId: string,
    itemKey: string,
    outcome: CheckLine["outcome"],
    note: string | null,
  ) => Promise<boolean>;
}) {
  const editable = canWrite && check.viewer.eligible;
  return (
    <CheckLines
      title="Review points"
      scope={scope}
      lines={check.reviewPoints}
      open={check.reviewPointsOpen}
      editable={editable}
      lockedBecause={editable ? null : "Ticked by whoever checks this step."}
      busy={lineBusy(busy, `review:${check.id}:`)}
      onMark={(key, outcome, note) => onMark(check.id, key, outcome, note)}
    />
  );
}

/**
 * Which line of one list is saving, out of the page's single `busy` slot.
 * The slot holds `sub:<step>:<line>` or `review:<check>:<line>`, so a line on
 * one list never shows as busy because a line of the same name on another is.
 */
function lineBusy(busy: string | null, prefix: string): string | null {
  return busy !== null && busy.startsWith(prefix) ? busy.slice(prefix.length) : null;
}

/**
 * Why the sub-steps cannot be changed right now, in words, or null when they
 * can (or when there is nothing worth saying, as on a finished step, where the
 * list is simply the record).
 */
function subStepsLocked(step: JobStep, check: StepCheck | null, canWrite: boolean): string | null {
  if (step.status === "pending" || step.status === "running") {
    return "These can be ticked once the step opens.";
  }
  if (step.status !== "blocked" || !canWrite) return null;
  if (check !== null) {
    return "Locked while the work waits to be checked. If it is sent back, they open again.";
  }
  if (step.viewer.mayComplete) return null;
  return step.viewer.reason === "ON_ANOTHER_DESK"
    ? "Ticked by whoever has this step on their desk. Take it to tick them yourself."
    : "Ticked by whoever does this step.";
}

/** How many sub-steps still hold the step shut, said under the button they
 *  hold. Nothing at all when none do. */
function SubStepsLeft({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="max-w-[22ch] text-sm text-ink-2">
      {count === 1 ? "1 sub-step left" : `${String(count)} sub-steps left`}
    </p>
  );
}

/**
 * Approve, or send it back — offered only to somebody who may actually do it.
 *
 * When they may not, the REASON is shown instead of a greyed-out button. That
 * is the difference between a screen that looks broken and one that says "you
 * did this work, so somebody else has to check it" — which is a rule the person
 * then understands rather than a control they go looking for a way around.
 */
function CheckActions({
  check,
  stepKey,
  busy,
  onApprove,
  onSendBack,
}: {
  check: StepCheck;
  /** The step's PERMANENT handle, so these two buttons can say which step they
   *  are about. A process can have more than one step waiting to be checked. */
  stepKey: string;
  busy: string | null;
  onApprove: (approvalId: string) => void;
  onSendBack: (approvalId: string) => void;
}) {
  if (!check.viewer.eligible) {
    return (
      <p className="max-w-[22ch] text-sm text-ink-2">
        {check.viewer.reason === null
          ? "Not yours to check."
          : CHECK_INELIGIBILITY[check.viewer.reason]}
        {check.viewer.reason === "IS_THE_MAKER" && (
          <>
            {" "}
            Somebody else has to.
          </>
        )}
      </p>
    );
  }
  return (
    <>
      {/* Approve waits for the review points (T6.15); Send back NEVER does.
          The checker may find the problem at point three, and making them tick
          the rest before they can say so would be asking them to record checks
          they had no reason to finish. */}
      <Button
        disabled={busy === check.id || check.reviewPointsOpen > 0}
        aria-label={`Approve ${stepKey}`}
        onClick={() => {
          onApprove(check.id);
        }}
      >
        Approve
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy === check.id}
        aria-label={`Send back ${stepKey}`}
        onClick={() => {
          onSendBack(check.id);
        }}
      >
        Send back
      </Button>
      {check.reviewPointsOpen > 0 && (
        <p className="max-w-[22ch] text-sm text-ink-2">
          {check.reviewPointsOpen === 1
            ? "1 review point left to tick"
            : `${String(check.reviewPointsOpen)} review points left to tick`}
        </p>
      )}
    </>
  );
}

/** The note the API writes on a step its job's cancellation withdrew (V2.4,
 *  `JOB_CANCELLED_NOTE` in the backend's orchestrator). */
const JOB_CANCELLED_NOTE = "The job was cancelled.";

function StepState({
  step,
  check,
  jobCancelled,
}: {
  step: JobStep;
  check: StepCheck | null;
  jobCancelled: boolean;
}) {
  // WAITING TO BE CHECKED is a fourth cause of `blocked`, and it has to be said
  // apart from the other three: the work is DONE here. A step that read
  // "waiting for you" while sitting in somebody else's queue is the same class
  // of bug T2.8 found by opening this page — a label reading one fact when a
  // second had become true underneath it.
  // Every state below is a dot and a word (Wave 4). "Waiting" is WARN, never
  // danger: held up is not wrong, and red is kept for "could not be finished".
  if (step.status === "blocked" && check !== null) {
    return (
      <Pill dot tone="warn">
        Done, waiting to be checked
      </Pill>
    );
  }
  if (step.status === "blocked") {
    // A MACHINE ANSWERED IT changes what this says, and getting that wrong was
    // found by opening the page: an `agent` step showed "no agent built for this
    // yet" while a proposal sat underneath it saying one had just run. The label
    // was reading the executor alone, which was the whole truth until T2.8 and
    // is not any more.
    //
    // The two machine-answered cases are worded apart for the reason the
    // proposal itself is: "it was not sure enough to answer" is a different job
    // for the reader than "check this over".
    const blockedBecause =
      step.proposal === null || step.proposal === undefined
        ? step.executor === "agent"
          ? "Waiting for you (not automated yet)"
          : step.executor === "agent_with_approval"
            ? "Waiting for you to approve"
            : // WHOSE (0301). "waiting for you" on a step that sits on Rohan's
              // desk, read by Kavya or by the partner, was this same bug again:
              // the label read one fact after a second had become true.
              step.viewer.mayComplete
              ? "Waiting for you"
              : step.assignee !== null
                ? `Waiting for ${step.assignee.displayName}`
                : "Waiting for someone"
        : step.proposal.decision === "escalated"
          ? "The system could not answer: you decide"
          : "The system answered: check it";
    return (
      <Pill dot tone="warn">
        {blockedBecause}
      </Pill>
    );
  }
  // NOT `danger`, which is what it wore until this was seen rendered. A skip is
  // a decision somebody recorded, not a failure — nothing is wrong, and the row
  // it sits in is dimmed to say so. Red here put it in the same colour as "could
  // not be finished" one line below, which is the opposite fact.
  if (step.status === "skipped") {
    if (jobCancelled && step.outcomeNote === JOB_CANCELLED_NOTE) return <Pill dot>Cancelled</Pill>;
    // A step withdrawn AFTER it opened (0304) keeps its start time, and says
    // so: it was on somebody's list, and "not needed" alone reads as if it
    // never was.
    return (
      <Pill dot>{step.startedAt !== null ? "No longer needed" : "Not needed"}</Pill>
    );
  }
  if (step.status === "failed") {
    return (
      <Pill dot tone="danger">
        Could not be finished
      </Pill>
    );
  }
  if (step.status === "done") {
    return (
      <Pill dot tone="ok">
        Done
      </Pill>
    );
  }
  // `pending` and `running`. Pending is not "nobody has started it" — it is
  // waiting on a step before it, which is worth saying rather than leaving
  // somebody to wonder why there is no button.
  return (
    <span className="text-sm text-ink-2">
      {step.status === "running" ? "In progress" : "After an earlier step"}
    </span>
  );
}

/**
 * What a machine produced, and how sure it was.
 *
 * The confidence is shown with the BAR it was judged against, not on its own —
 * "0.82" means nothing to a person, and "0.82, and this firm commits above
 * 0.95" is the whole explanation of why they are being asked.
 *
 * And the two reasons for being asked are said apart. A step the firm marked
 * for approval always comes here, however sure the machine was; a step that
 * merely fell short of the bar is a different fact, and only the second is an
 * argument for improving the agent.
 */
function Proposal({ proposal }: { proposal: AgentProposal }) {
  return (
    <div className="mt-2 border-l-2 border-line bg-surface-sunk py-2 pl-3 pr-3">
      <div className="muted text-xs">
        {proposal.decision === "escalated" ? (
          <>
            The system was <strong>not sure enough to answer</strong>. Its confidence was{" "}
            {proposal.confidence} and your firm asks for at least {proposal.reviewAt}. What it
            found is below, as working material rather than an answer.
          </>
        ) : proposal.approvalRequired ? (
          <>
            The system did this with a confidence of {proposal.confidence}, and{" "}
            <strong>your firm asks a person to approve this step</strong>.
          </>
        ) : (
          <>
            The system did this with a confidence of <strong>{proposal.confidence}</strong>. Your
            firm lets it act on its own only above {proposal.autoCommitAt}.
          </>
        )}
      </div>
      <pre className="mono mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
        {JSON.stringify(proposal.proposed, null, 2)}
      </pre>
      <div className="muted mt-1 text-xs">
        {proposal.model} · {proposal.promptVersion}
      </div>
    </div>
  );
}


/** The band in words — "Analyst to Senior Associate", "Manager or above".
 *  The API names each end (an associate may not read the ladder itself); the
 *  code is the fallback for a rung the ladder no longer has. */
function bandLabel(p: NonNullable<JobStep["performer"]>): string {
  const lo = p.minGradeName ?? p.minGradeCode ?? (p.minGradeRank === null ? null : `rank ${String(p.minGradeRank)}`);
  const hi = p.maxGradeName ?? p.maxGradeCode ?? (p.maxGradeRank === null ? null : `rank ${String(p.maxGradeRank)}`);
  if (lo !== null && hi !== null) return lo === hi ? lo : `${lo} to ${hi}`;
  if (lo !== null) return `${lo} or above`;
  if (hi !== null) return `${hi} or below`;
  return "anybody";
}

/** Whose desk a step sits on, and who the process says may do it (0301). */
function Desk({ step }: { step: JobStep }) {
  // WHERE IT WAS, for a step withdrawn after it opened (0304). The assignee is
  // kept on the row as history, so the person whose list it left can find it.
  if (step.status === "skipped" && step.startedAt !== null) {
    return (
      <p className="mt-1 text-sm text-ink-2">
        Opened {longInstant(step.startedAt)}
        {step.assignee === null ? ", on nobody's desk" : `, on ${step.assignee.displayName}'s desk`}
      </p>
    );
  }
  if (step.status === "done" || step.status === "skipped" || step.status === "failed") return null;
  return (
    <p className="mt-1 text-sm text-ink-2">
      {step.assignee === null ? "On nobody's desk" : `On ${step.assignee.displayName}'s desk`}
      {step.performer !== null && <> · {bandLabel(step.performer)}</>}
    </p>
  );
}

/** Hand a waiting step to somebody the process allows. The list is the API's,
 *  so a name outside the band is never offered. */
function HandOver({
  jobId,
  step,
  busy,
  onHand,
}: {
  jobId: string;
  step: JobStep;
  busy: boolean;
  onHand: (userId: string | null) => void;
}) {
  const [people, setPeople] = useState<{ userId: string; displayName: string; gradeName: string | null }[] | null>(null);
  const [choice, setChoice] = useState("");
  useEffect(() => {
    let live = true;
    void api
      .GET("/api/v1/jobs/{jobId}/steps/{stepKey}/performers", { params: { path: { jobId, stepKey: step.stepKey } } })
      .then((r) => {
        if (live) setPeople(r.data?.performers ?? []);
      });
    return () => {
      live = false;
    };
  }, [jobId, step.stepKey]);
  if (people === null) return null;
  return (
    <div className="cluster mt-1">
      <select
        className="select"
        data-size="sm"
        aria-label={`Hand ${step.stepKey} to`}
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
        }}
      >
        <option value="">Hand to…</option>
        {people
          .filter((p) => p.userId !== step.assignee?.userId)
          .map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.displayName}
              {p.gradeName === null ? "" : ` (${p.gradeName})`}
            </option>
          ))}
      </select>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || choice === ""}
        aria-label={`Hand over ${step.stepKey}`}
        onClick={() => {
          onHand(choice);
          setChoice("");
        }}
      >
        Hand over
      </Button>
    </div>
  );
}

