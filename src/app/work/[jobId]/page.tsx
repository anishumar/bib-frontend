"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import { api, apiError, CHECK_INELIGIBILITY } from "@/lib/api/client";
import type { AgentProposal, Job, JobStep, StepCheck } from "@/lib/api/client";
import { Button, cx } from "@/components/ui";
import { Card, ErrorNotice, Notice, Page, PageHeader, Pill } from "@/components/tw";
import { longInstant } from "@/lib/day";

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
export default function JobStepsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [checks, setChecks] = useState<StepCheck[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    setError(null);
    setLoaded(true);
  }, [jobId, router]);

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
      "What should this say instead? The machine's answer is below — change what is wrong.",
      JSON.stringify(proposal.proposed),
    );
    if (edited === null) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(edited) as Record<string, unknown>;
    } catch {
      setError("That is not valid JSON, so nothing was recorded. Nothing has changed.");
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

  if (!loaded) return <p className="muted">Loading…</p>;

  const canComplete = permissions.includes("work:write");

  return (
    <Page>
      <nav className="cluster">
        <Link href="/work">← Work</Link>
      </nav>
      <PageHeader
        eyebrow="Delivery"
        title="Process"
      />
      {/* WHOSE work this is, above the steps. After the merge one checklist can
          hold three services for one of a client's companies, and a page that
          only listed steps left "which client, which company, which services"
          unanswerable from the screen. */}
      {job !== null && (
        <p className="muted max-w-[var(--measure)]">
          <strong>{job.entityName ?? "an unnamed company"}</strong>
          {job.clientName !== null && job.clientName !== job.entityName && (
            <> · billed to {job.clientName}</>
          )}
          {job.splitCode !== null && <> · {job.splitCode}</>}
          {/* The period, on a per-period job (T6.13): this is September's
              checklist, not the engagement's. */}
          {job.periodLabel !== null && <> · {job.periodLabel}</>}
          <br />
          {job.services.length === 0
            ? "No services listed against this job."
            : job.services.map((sv) => sv.serviceName).join(" · ")}
        </p>
      )}
      <ErrorNotice error={error} />

      {steps.length === 0 ? (
        <p className="muted max-w-[var(--measure)]">
          This job has no steps yet. That means the firm has not published a workflow template
          for the service it delivers — the work is not lost, it waits. Publish the process and
          the job picks it up on the next sweep.
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
                  <strong>{s.label}</strong>{" "}
                  <span className="mono muted text-xs">
                    {s.stepKey}
                  </span>
                  <br />
                  <StepState step={s} check={openCheckFor(checks, s.stepKey)} />
                  {s.outcomeNote !== null && (
                    <p className="muted mt-1 text-sm">{s.outcomeNote}</p>
                  )}
                  {s.proposal !== null && s.proposal !== undefined && (
                    <Proposal proposal={s.proposal} />
                  )}
                  <CheckHistory checks={checks.filter((c) => c.stepKey === s.stepKey)} />
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
                        <Button
                          disabled={busy === s.stepKey}
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
                          disabled={busy === s.stepKey}
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
                      </>
                    ) : (
                      <Button
                        disabled={busy === s.stepKey}
                        aria-label={`Done — ${s.stepKey}`}
                        onClick={() => {
                          void complete(s.stepKey);
                        }}
                      >
                        Done
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <p className="muted max-w-[var(--measure)] text-sm">
        Ticking a step records that <strong>you</strong> did it, and opens whatever was waiting
        on it straight away. It cannot be undone: a second completion would overwrite the record
        of who did the work.
      </p>
      <p className="muted max-w-[var(--measure)] text-sm">
        Where a machine has proposed an answer, accepting and correcting are recorded
        separately and both are kept beside what it originally said. That difference is the
        only measure of whether it is getting better — so a correction that changes nothing is
        refused, and a rejection has to say what was wrong. Rejecting does not finish the step:
        the work still needs doing.
      </p>
      {/* Working papers, challans, the evidence a step was actually done. A
          job's files belong to the FIRM rather than to a client, so no partyId
          is passed — the column exists for the client portal's record scope,
          and claiming a working paper is the client's would be wrong. */}
      <Documents
        subjectKind="job"
        subjectRef={jobId}
        canWrite={permissions.includes("party:write")}
        title="Working papers"
        emptyHint="Nothing attached yet. The challan, the acknowledgement, the working paper behind a step — whatever a colleague would need to show this was done."
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
function CheckHistory({ checks }: { checks: StepCheck[] }) {
  const decided = checks.filter((c) => c.decision !== "pending");
  if (decided.length === 0) return null;
  return (
    <div className="mt-2">
      {decided.map((c) => (
        <p key={c.id} className="muted mt-0.5 text-sm">
          {c.decision === "rejected" ? "Sent back" : "Approved"} on{" "}
          {c.decidedAt === null ? "—" : longInstant(c.decidedAt)}
          {c.notes !== null && c.notes.trim() !== "" && <> — “{c.notes}”</>}
        </p>
      ))}
    </div>
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
      <p className="muted max-w-[22ch] text-sm">
        {check.viewer.reason === null
          ? "Not yours to check."
          : CHECK_INELIGIBILITY[check.viewer.reason]}
        {check.viewer.reason === "IS_THE_MAKER" && (
          <>
            {" "}
            — somebody else has to.
          </>
        )}
      </p>
    );
  }
  return (
    <>
      <Button
        disabled={busy === check.id}
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
    </>
  );
}

function StepState({ step, check }: { step: JobStep; check: StepCheck | null }) {
  // WAITING TO BE CHECKED is a fourth cause of `blocked`, and it has to be said
  // apart from the other three: the work is DONE here. A step that read
  // "waiting for you" while sitting in somebody else's queue is the same class
  // of bug T2.8 found by opening this page — a label reading one fact when a
  // second had become true underneath it.
  if (step.status === "blocked" && check !== null) {
    return <Pill tone="danger">finished — waiting to be checked</Pill>;
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
          ? "waiting for you — no agent built for this yet"
          : step.executor === "agent_with_approval"
            ? "waiting for you to approve"
            : "waiting for you"
        : step.proposal.decision === "escalated"
          ? "a machine could not answer this — waiting for you to decide"
          : "a machine answered — waiting for you to check it";
    return <Pill tone="danger">{blockedBecause}</Pill>;
  }
  // NOT `danger`, which is what it wore until this was seen rendered. A skip is
  // a decision somebody recorded, not a failure — nothing is wrong, and the row
  // it sits in is dimmed to say so. Red here put it in the same colour as "could
  // not be finished" one line below, which is the opposite fact.
  if (step.status === "skipped") {
    return <Pill>not needed</Pill>;
  }
  if (step.status === "failed") {
    return <Pill tone="danger">could not be finished</Pill>;
  }
  if (step.status === "done") {
    return <Pill tone="ok">done</Pill>;
  }
  // `pending` and `running`. Pending is not "nobody has started it" — it is
  // waiting on a step before it, which is worth saying rather than leaving
  // somebody to wonder why there is no button.
  return (
    <span className="muted text-sm">
      {step.status === "running" ? "in progress" : "waiting on an earlier step"}
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
            The machine was <strong>not sure enough to answer</strong> — {proposal.confidence}{" "}
            against a bar of {proposal.reviewAt}. What it found is below, as material rather
            than as an answer.
          </>
        ) : proposal.approvalRequired ? (
          <>
            A machine did this and <strong>your firm asks for a person on this step</strong>,
            whatever it scored — {proposal.confidence} here.
          </>
        ) : (
          <>
            A machine did this at <strong>{proposal.confidence}</strong>, and this firm acts
            unattended only above {proposal.autoCommitAt}.
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
