"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, CHECK_INELIGIBILITY } from "@/lib/api/client";
import type { Job, StepCheck } from "@/lib/api/client";

/**
 * The work board — what the engine currently has in hand (T2.6, T2.7).
 *
 * This is the first screen that shows the DELIVERY half of the product at all.
 * Five modules shipped before anything rendered them and every list turned out
 * to return uuids; `GET /api/v1/jobs` has been a write with no read since T2.6,
 * which is exactly the shape CLAUDE.md warns about. It has a screen now.
 *
 * ── WHAT IT DOES NOT SHOW, AND WHY ──────────────────────────────────────────
 *
 * A job whose window has not opened yet is absent. The calendar is materialised
 * a year ahead, and showing all of it as "ready" would bury the work that
 * actually is — the API makes that choice and this screen does not second-guess
 * it.
 *
 * ── WHAT A ROW IS, AFTER THE MERGE (T2.7) ───────────────────────────────────
 *
 * A row is not "an engagement" any more. When a firm splits its work by Dept or
 * by delivery team, one row is that team's whole checklist for one client
 * company on one engagement letter — which may be three services. So the card
 * leads with the COMPANY the work is delivered to, names the team beside it,
 * and lists the services inside it.
 *
 * That last part is not decoration. If a firm splits by team and sees two
 * FinCompliance cards for one client, the only way to understand why is to see
 * what is in each — the answer is usually that the two sets of services name
 * different processes, and the card has to be able to say so rather than
 * looking like a duplicate.
 *
 * ── AND IT NO LONGER RENDERS A uuid ─────────────────────────────────────────
 *
 * It used to show "engagement <uuid>", with a comment saying the honest fix was
 * a read model carrying the client's name. The merge forced it: a merged job's
 * `sourceRef` is a derived group key that names no row at all, so it was not
 * even a uuid somebody could look up. `GET /api/v1/jobs` carries the names now.
 *
 * ── THE HONEST GAP ──────────────────────────────────────────────────────────
 *
 * A job says `pending` with no steps when the firm has not published a workflow
 * template for that service. That is a real state, not a bug, and the screen
 * says so in words rather than showing an empty row somebody has to interpret.
 *
 * ── AND WORK THAT IS FINISHED BUT NOT CHECKED (T2.9) ────────────────────────
 *
 * The second tab. Before T2.9 an escalation and a queued proposal landed in the
 * same place — a blocked step on a job page — and went to nobody's desk: you
 * found them by opening a job and looking. This is the desk.
 *
 * It shows the WHOLE FIRM's queue rather than "mine", deliberately. Under a rank
 * threshold there is no "mine" — any Manager may take any of it — and a list
 * filtered to what the viewer can act on would hide that six filings have been
 * waiting a week because nobody senior enough has looked. So every row carries
 * the viewer's own verdict, and the ones they cannot take say why.
 */
export default function WorkPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [checks, setChecks] = useState<StepCheck[]>([]);
  const [tab, setTab] = useState<"work" | "checks">("work");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass, so the tab count is right the moment the page paints.
    // A badge that fills in a second later reads as "nothing to check" to
    // somebody who glances and moves on, which is the one thing this screen
    // exists to stop.
    const [result, queue] = await Promise.all([
      api.GET("/api/v1/jobs", {}),
      api.GET("/api/v1/checks", {}),
    ]);
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (result.response.status === 401 || queue.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setJobs(result.data.jobs);
    if (!queue.error) setChecks(queue.data.checks);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <h1>Work</h1>
      <p className="bib-muted" style={{ maxWidth: "62ch" }}>
        Everything the engine has in hand: work a signed engagement created, and how far each
        piece has got. Work whose window has not opened yet is not listed.
      </p>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-chips" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <button
          type="button"
          className={tab === "work" ? "bib-button" : "bib-button-quiet"}
          onClick={() => { setTab("work"); }}
        >
          In hand ({jobs.length})
        </button>
        <button
          type="button"
          className={tab === "checks" ? "bib-button" : "bib-button-quiet"}
          onClick={() => { setTab("checks"); }}
        >
          To check ({checks.length})
        </button>
      </div>

      {tab === "checks" ? (
        <CheckQueue checks={checks} />
      ) : jobs.length === 0 ? (
        <p className="bib-muted">
          Nothing is ready to run. Work appears here once an engagement letter is signed and its
          advance is recorded — that is what starts the engine.
        </p>
      ) : (
        <div className="bib-card">
          <table className="bib-table">
            <thead>
              <tr>
                <th>Work</th>
                <th>For</th>
                <th>State</th>
                <th>Ready since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    {/* The services this job delivers — one for an unmerged
                        job, several for a merged one. The team or Dept it was
                        cut under sits beside them, because "why are there two
                        FinCompliance cards" is only answerable if each says
                        what is in it. */}
                    {j.services.length === 0 ? (
                      <span className="bib-muted">no services listed</span>
                    ) : (
                      <>
                        {j.services.map((sv) => (
                          <div key={sv.engagementId}>{sv.serviceName}</div>
                        ))}
                      </>
                    )}
                    {j.splitCode !== null && (
                      <span className="bib-pill" data-tone="neutral" style={{ marginTop: 4 }}>
                        {j.splitCode}
                      </span>
                    )}
                  </td>
                  <td>
                    {/* The COMPANY the work is delivered to, which is the one a
                        filing belongs to — not the client who is billed. A group
                        of four companies has four of these, and putting the
                        billed client here would make them look identical. */}
                    {j.entityName ?? <span className="bib-muted">—</span>}
                    {j.clientName !== null && j.clientName !== j.entityName && (
                      <>
                        <br />
                        <span className="bib-muted" style={{ fontSize: 12 }}>
                          billed to {j.clientName}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <JobState job={j} />
                  </td>
                  <td className="bib-muted">{new Date(j.runnableAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="bib-button-quiet" href={`/work/${j.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/**
 * Work that is finished and waiting for somebody else to look at it (T2.9).
 *
 * THE WHOLE FIRM'S, not the viewer's. Filtering to what you can act on hides
 * the queue's most useful fact — that something has been sitting for a week
 * because nobody eligible has looked at it — so instead every row says whether
 * the viewer may take it, and the ones they cannot say why.
 *
 * Oldest first, which is the API's order, and there is deliberately no due date
 * anywhere on this screen: the firm has not given its internal turnaround times,
 * and a deadline this product invented would be a priority the firm never set.
 */
function CheckQueue({ checks }: { checks: StepCheck[] }) {
  if (checks.length === 0) {
    return (
      <p className="bib-muted" style={{ maxWidth: "62ch" }}>
        Nothing is waiting to be checked. Work lands here when somebody finishes a step whose
        process says it is reviewed — set on <strong>How the firm works</strong>, with the rule
        about who may review it on <strong>Who checks the work</strong>.
      </p>
    );
  }
  return (
    <div className="bib-card">
      <table className="bib-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>Done by</th>
            <th>Waiting since</th>
            <th>You</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id}>
              <td>{c.stepLabel}</td>
              <td>
                {/* Null means a machine committed it unattended — no person made
                    it, so there is no maker to be, and anybody eligible may
                    check it. "—" is the honest cell. */}
                {c.submittedByName ?? <span className="bib-unstated">a machine</span>}
              </td>
              <td className="bib-muted">{new Date(c.submittedAt).toLocaleDateString()}</td>
              <td>
                {c.viewer.eligible ? (
                  <span className="bib-pill" data-tone="live">
                    you can check this
                  </span>
                ) : (
                  <span className="bib-muted" style={{ fontSize: 12 }}>
                    {c.viewer.reason === null
                      ? "not yours to check"
                      : CHECK_INELIGIBILITY[c.viewer.reason]}
                  </span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                {/* Open the JOB, not a modal. Approving somebody's filing without
                    seeing what the rest of the job did is the kind of sign-off
                    this whole feature exists to make real. */}
                <Link className="bib-button-quiet" href={`/work/${c.jobId}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A job's state in the words a person uses, plus the one case that needs
 * explaining rather than labelling.
 *
 * `pending` with no template published is not "not started yet" — it is the
 * firm not having written the process. Somebody looking at a job that has sat
 * there for a week deserves to be told which of those it is.
 */
function JobState({ job }: { job: Job }) {
  if (job.status === "pending" && job.templateVersionId === null) {
    return (
      <>
        <span className="bib-pill" data-tone="revoked">
          waiting for a process
        </span>
        <br />
        <span className="bib-muted" style={{ fontSize: 12 }}>
          nobody has written how this service is delivered
        </span>
      </>
    );
  }
  return (
    <span className="bib-pill" data-tone={job.status === "blocked" ? "revoked" : "active"}>
      {job.status === "blocked" ? "waiting for someone" : job.status}
    </span>
  );
}
