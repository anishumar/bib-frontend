"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { Job } from "@/lib/api/client";

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
 * ── THE HONEST GAP ──────────────────────────────────────────────────────────
 *
 * A job says `pending` with no steps when the firm has not published a workflow
 * template for that service. That is a real state, not a bug, and the screen
 * says so in words rather than showing an empty row somebody has to interpret.
 */
export default function WorkPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/jobs", {});
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setJobs(result.data.jobs);
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

      {jobs.length === 0 ? (
        <p className="bib-muted">
          Nothing is ready to run. Work appears here once an engagement letter is signed and its
          advance is recorded — that is what starts the engine.
        </p>
      ) : (
        <div className="bib-card">
          <table className="bib-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>State</th>
                <th>Ready since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    {/* The CAUSE, not the job's own id. "Engagement <uuid>" is
                        still a uuid on a screen, and the honest fix is a read
                        model that carries the client's name — recorded on the
                        board rather than papered over with a lookup per row. */}
                    <span className="bib-mono">{j.sourceKind}</span>
                    <br />
                    <span className="bib-muted bib-mono" style={{ fontSize: 12 }}>
                      {j.sourceRef}
                    </span>
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
