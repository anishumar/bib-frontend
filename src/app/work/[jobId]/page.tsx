"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { AgentProposal, Job, JobStep } from "@/lib/api/client";

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
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [result, header, me] = await Promise.all([
      api.GET("/api/v1/jobs/{jobId}/steps", { params: { path: { jobId } } }),
      // The job itself, not just its steps. A merged job's steps say nothing
      // about WHOSE work they are, and after the merge that is a real question:
      // one checklist can hold three services for one of a client's companies.
      api.GET("/api/v1/jobs/{jobId}", { params: { path: { jobId } } }),
      api.GET("/api/v1/auth/me", {}),
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

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const canComplete = permissions.includes("work:write");

  return (
    <main>
      <nav className="bib-subnav" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <Link href="/work">← Work</Link>
      </nav>

      <h1>Process</h1>
      {/* WHOSE work this is, above the steps. After the merge one checklist can
          hold three services for one of a client's companies, and a page that
          only listed steps left "which client, which company, which services"
          unanswerable from the screen. */}
      {job !== null && (
        <p className="bib-muted" style={{ maxWidth: "62ch" }}>
          <strong>{job.entityName ?? "an unnamed company"}</strong>
          {job.clientName !== null && job.clientName !== job.entityName && (
            <> · billed to {job.clientName}</>
          )}
          {job.splitCode !== null && <> · {job.splitCode}</>}
          <br />
          {job.services.length === 0
            ? "No services listed against this job."
            : job.services.map((sv) => sv.serviceName).join(" · ")}
        </p>
      )}
      {error !== null && <p className="bib-error">{error}</p>}

      {steps.length === 0 ? (
        <p className="bib-muted" style={{ maxWidth: "62ch" }}>
          This job has no steps yet. That means the firm has not published a workflow template
          for the service it delivers — the work is not lost, it waits. Publish the process and
          the job picks it up on the next sweep.
        </p>
      ) : (
        <div className="bib-card">
          <ol className="bib-steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {steps.map((s) => (
              <li
                key={s.id}
                data-inactive={s.status === "skipped"}
                style={{
                  display: "flex",
                  gap: "var(--bib-gap-2)",
                  alignItems: "flex-start",
                  padding: "var(--bib-gap-2) 0",
                  borderTop: "1px solid var(--bib-border)",
                }}
              >
                <div style={{ flex: "1 1 auto" }}>
                  <strong>{s.label}</strong>{" "}
                  <span className="bib-muted bib-mono" style={{ fontSize: 12 }}>
                    {s.stepKey}
                  </span>
                  <br />
                  <StepState step={s} />
                  {s.outcomeNote !== null && (
                    <p className="bib-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                      {s.outcomeNote}
                    </p>
                  )}
                  {s.proposal !== null && s.proposal !== undefined && (
                    <Proposal proposal={s.proposal} />
                  )}
                </div>
                <div style={{ flex: "0 0 auto", display: "grid", gap: 6 }}>
                  {/* A step with an undecided proposal gets the three verdicts
                      INSTEAD of the Done button, not beside it. Ticking "done"
                      would record that a person did the work and leave what the
                      machine said undecided forever — which is the accuracy
                      signal the whole guardrail exists to keep, so the API
                      refuses it and the screen does not offer it. */}
                  {s.status === "blocked" &&
                    canComplete &&
                    (s.proposal ? (
                      <>
                        <button
                          className="bib-button"
                          disabled={busy === s.stepKey}
                          onClick={() => {
                            void decide(s.stepKey, "accepted", null, null);
                          }}
                        >
                          Accept
                        </button>
                        <button
                          className="bib-button-quiet"
                          disabled={busy === s.stepKey}
                          onClick={() => {
                            if (s.proposal) void correct(s.stepKey, s.proposal);
                          }}
                        >
                          Correct
                        </button>
                        <button
                          className="bib-button-quiet"
                          disabled={busy === s.stepKey}
                          onClick={() => {
                            void reject(s.stepKey);
                          }}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <button
                        className="bib-button"
                        disabled={busy === s.stepKey}
                        onClick={() => {
                          void complete(s.stepKey);
                        }}
                      >
                        Done
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="bib-muted" style={{ fontSize: 13, maxWidth: "62ch" }}>
        Ticking a step records that <strong>you</strong> did it, and opens whatever was waiting
        on it straight away. It cannot be undone: a second completion would overwrite the record
        of who did the work.
      </p>
      <p className="bib-muted" style={{ fontSize: 13, maxWidth: "62ch" }}>
        Where a machine has proposed an answer, accepting and correcting are recorded
        separately and both are kept beside what it originally said. That difference is the
        only measure of whether it is getting better — so a correction that changes nothing is
        refused, and a rejection has to say what was wrong. Rejecting does not finish the step:
        the work still needs doing.
      </p>
    </main>
  );
}

/**
 * A step's state in the words somebody at a desk uses.
 *
 * The `agent`-with-no-agent case gets its own sentence rather than the same
 * "waiting for you" as a human step, because they are different facts and one
 * of them is something the firm may want to chase.
 */
function StepState({ step }: { step: JobStep }) {
  if (step.status === "blocked") {
    return (
      <span className="bib-pill" data-tone="revoked">
        {step.executor === "agent"
          ? "waiting for you — no agent built for this yet"
          : step.executor === "agent_with_approval"
            ? "waiting for you to approve"
            : "waiting for you"}
      </span>
    );
  }
  if (step.status === "skipped") {
    return (
      <span className="bib-pill" data-tone="revoked">
        not needed
      </span>
    );
  }
  if (step.status === "failed") {
    return (
      <span className="bib-pill" data-tone="revoked">
        could not be finished
      </span>
    );
  }
  if (step.status === "done") {
    return (
      <span className="bib-pill" data-tone="active">
        done
      </span>
    );
  }
  // `pending` and `running`. Pending is not "nobody has started it" — it is
  // waiting on a step before it, which is worth saying rather than leaving
  // somebody to wonder why there is no button.
  return (
    <span className="bib-muted" style={{ fontSize: 13 }}>
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
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderLeft: "3px solid var(--bib-border)",
        background: "var(--bib-surface-2, transparent)",
      }}
    >
      <div className="bib-muted" style={{ fontSize: 12 }}>
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
      <pre
        className="bib-mono"
        style={{ fontSize: 12, margin: "6px 0 0", whiteSpace: "pre-wrap", overflowX: "auto" }}
      >
        {JSON.stringify(proposal.proposed, null, 2)}
      </pre>
      <div className="bib-muted" style={{ fontSize: 11, marginTop: 4 }}>
        {proposal.model} · {proposal.promptVersion}
      </div>
    </div>
  );
}
