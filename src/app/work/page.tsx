"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, CHECK_INELIGIBILITY } from "@/lib/api/client";
import type { Job, StepCheck } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { longInstant } from "@/lib/day";
import { Empty, Loading } from "@/components/states";
import {
  Card,
  CardTitle,
  ErrorNotice,
  NotSet,
  Pill,
  RowChevron,
  RowLink,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  ThChevron,
  Tr,
  type PillTone,
} from "@/components/ui";

/**
 * The work board — what the engine currently has in hand (T2.6, T2.7).
 *
 * This is the first screen that shows the DELIVERY half of the product at all.
 * Five modules shipped before anything rendered them and every list turned out
 * to return uuids; `GET /api/v1/jobs` has been a write with no read since T2.6,
 * which is exactly the shape CLAUDE.md warns about. It has a screen now.
 *
 * ── WHAT IS UPCOMING, AND WHY IT IS HERE (T6.13) ────────────────────────────
 *
 * A recurring service — monthly bookkeeping — gets a job PER PERIOD. That job
 * exists from the day its month begins and OPENS the day after the month ends,
 * so for the whole month it is on this board as upcoming, with the day it
 * opens where a ready job shows the moment it became ready. That is the row a
 * partner plans capacity from, and it is why the list is no longer only what
 * is runnable. Nothing is materialised for a month that has not begun, which
 * is what keeps this from being a year of empty checklists.
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
 *
 * ── THE WAVE 4 SHAPE (2026-09-28) ───────────────────────────────────────────
 *
 * No eyebrow and no lede (what upcoming means is on the row: "Opens 1 Oct").
 * The whole row opens the job, where ten "Open" buttons sat before. The
 * engine's states read as words with a dot ("Waiting on someone", in warn: a
 * job waiting on a person is held up, not wrong), and a check in the queue
 * names its client, looked up from the jobs this page already holds.
 */
export default function WorkPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  /** Process steps on the session user's own desk, across jobs (0301). */
  const [mySteps, setMySteps] = useState<{ id: string; jobId: string; stepKey: string; label: string; status: string }[]>([]);
  useEffect(() => {
    let live = true;
    void api.GET("/api/v1/my-steps", {}).then((r) => {
      // The ones that are waiting for THIS person first. The API lists a
      // desk by step key, which put "Bank reconciliation" above the one
      // step Rohan could actually do; a job step carries no position, so
      // process order is not available here — actionable first is.
      const mine = [...(r.data?.steps ?? [])].sort(
        (a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || a.label.localeCompare(b.label),
      );
      if (live) setMySteps(mine);
    });
    return () => {
      live = false;
    };
  }, []);
  const [checks, setChecks] = useState<StepCheck[]>([]);
  const [tab, setTab] = useState<"work" | "checks">("work");
  // Shared with every `<TabPanel>` below — it is what ties a tab to the panel
  // it controls, so `aria-controls` points at something real.
  const tabsId = useId();
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

  if (!loaded) return <Loading label="Loading jobs" />;

  return (
    <Page>
      <PageHeader title="Jobs" />

      <ErrorNotice error={error} />

      <Tabs
        id={tabsId}
        label="Job views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "work", label: "In hand", count: jobs.length },
          { value: "checks", label: "To check", count: checks.length },
        ]}
      />

      {tab === "work" && mySteps.length > 0 && (
        <Card>
          <CardTitle level={2}>Steps on your desk</CardTitle>
          <ul className="mt-2 grid gap-1">
            {mySteps.map((st) => {
              const job = jobs.find((j) => j.id === st.jobId);
              return (
                <li key={st.id} className="text-md">
                  <Link href={`/work/${st.jobId}`}>{st.label}</Link>
                  <span className="text-ink-2">
                    {" "}
                    · {job?.entityName ?? "a job"}
                    {job?.periodLabel ? ` · ${job.periodLabel}` : ""}
                    {st.status === "blocked" ? " · ready for you" : " · after an earlier step"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <TabPanel tabsId={tabsId} value={tab}>
      {tab === "checks" ? (
        <CheckQueue checks={checks} jobs={jobs} />
      ) : jobs.length === 0 ? (
        <Card>
          <Empty title="No jobs yet" icon="engine">
            A job starts when a signed engagement begins.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Company</Th>
                <Th>State</Th>
                <Th>Ready</Th>
                <ThChevron />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <Tr key={j.id} linked>
                  <Td>
                    {/* The services this job delivers — one for an unmerged
                        job, several for a merged one; the first is the row's
                        link, so a screen reader's list of links names each job.
                        The team or Dept it was cut under sits beside them,
                        because "why are there two FinCompliance rows" is only
                        answerable if each says what is in it. */}
                    <RowLink href={`/work/${j.id}`}>
                      {j.services[0]?.serviceName ?? "Job with no services listed"}
                    </RowLink>
                    {j.services.slice(1).map((sv) => (
                      <Sub key={sv.engagementId}>{sv.serviceName}</Sub>
                    ))}
                    {/* WHICH month or quarter, on a per-period job: twelve
                        identical bookkeeping rows are twelve rows nobody can
                        tell apart, and this is the one word that does. */}
                    {(j.periodLabel !== null || j.splitCode !== null) && (
                      <Sub>
                        {[j.periodLabel, j.splitCode].filter((x) => x !== null).join(" · ")}
                      </Sub>
                    )}
                  </Td>
                  <Td>
                    {/* The COMPANY the work is delivered to, which is the one a
                        filing belongs to — not the client who is billed. A group
                        of four companies has four of these. */}
                    {j.entityName ?? <NotSet>No company named</NotSet>}
                    {j.clientName !== null && j.clientName !== j.entityName && (
                      <Sub>Billed to {j.clientName}</Sub>
                    )}
                  </Td>
                  <Td>
                    <JobState job={j} />
                  </Td>
                  <Td className="nowrap">
                    {/* An instant, shown where the reader is (T6.9); for a job
                        whose window is still ahead, the day it opens. */}
                    {isUpcoming(j) ? (
                      `Opens ${longInstant(j.runnableAt)}`
                    ) : (
                      longInstant(j.runnableAt)
                    )}
                  </Td>
                  <RowChevron />
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      </TabPanel>
    </Page>
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
function CheckQueue({ checks, jobs }: { checks: StepCheck[]; jobs: readonly Job[] }) {
  if (checks.length === 0) {
    return (
      <Card>
        <Empty title="Nothing is waiting to be checked" icon="verification">
          A step comes here when its process says it is checked. Set that on Processes.
        </Empty>
      </Card>
    );
  }
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Step</Th>
            <Th>Company</Th>
            <Th>Done by</Th>
            <Th>Sent for check</Th>
            <Th>Your part</Th>
            <ThChevron />
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            // The job this check belongs to, from the list this page already
            // holds: a check row carries only its step, and "Manager review"
            // six times over says nothing about whose work each one is.
            const job = jobs.find((j) => j.id === c.jobId) ?? null;
            return (
            <Tr key={c.id} linked>
              <Td>
                {/* Open the JOB, not a modal: approving somebody's filing
                    without seeing what the rest of the job did is the sign-off
                    this feature exists to make real. */}
                <RowLink href={`/work/${c.jobId}`}>{c.stepLabel}</RowLink>
                {job !== null && (
                  <Sub>
                    {[job.services[0]?.serviceName, job.periodLabel].filter((x) => x != null).join(" · ")}
                  </Sub>
                )}
                {/* HOW MUCH OF THE CHECK IS LEFT (T6.15). This queue approves
                    nothing itself, deliberately: Open goes to the job, where
                    the review points are ticked and Approve waits for them. So
                    the row says there is a list to work through rather than
                    letting a check with nine points to tick look like a
                    one-click sign-off. */}
                {c.reviewPoints.length > 0 && (
                  <Sub>
                    {c.reviewPointsOpen === 0
                      ? `All ${String(c.reviewPoints.length)} review points ticked`
                      : `${String(c.reviewPointsOpen)} of ${String(c.reviewPoints.length)} review points to tick`}
                  </Sub>
                )}
              </Td>
              <Td>{job?.entityName ?? <NotSet />}</Td>
              <Td>
                {/* Null means a machine committed it unattended — no person made
                    it, so there is no maker to be, and anybody eligible may
                    check it. */}
                {c.submittedByName ?? <NotSet>Done automatically</NotSet>}
              </Td>
              <Td className="nowrap">{longInstant(c.submittedAt)}</Td>
              <Td>
                {c.viewer.eligible ? (
                  <Pill dot tone="ok">
                    Yours to check
                  </Pill>
                ) : (
                  <span className="cell-text">
                    {c.viewer.reason === null
                      ? "Not yours to check"
                      : CHECK_INELIGIBILITY[c.viewer.reason]}
                  </span>
                )}
              </Td>
              <RowChevron />
            </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** Whether a job's window has not opened yet — a per-period job during its
 *  own month. Compared as instants, which is what `runnableAt` is. */
function isUpcoming(job: Job): boolean {
  const opens = Date.parse(job.runnableAt);
  return !Number.isNaN(opens) && opens > Date.now();
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
  // A per-period job pins the firm's process on the day it OPENS, not the day
  // it is spawned (T6.13) - so for the whole month before that it carries no
  // template, and that is not the firm having written nothing. Saying
  // "waiting for a process" about September's close on the 17th of September
  // sent a partner to the process editor to find v1 already in force.
  if (job.status === "pending" && isUpcoming(job)) {
    return (
      <Pill dot tone="neutral">
        Upcoming
      </Pill>
    );
  }
  if (job.status === "pending" && job.templateVersionId === null) {
    return (
      <>
        <Pill dot tone="danger">
          No process yet
        </Pill>
        <Sub>Publish one for this service on Processes</Sub>
      </>
    );
  }
  return (
    <Pill dot tone={JOB_TONE[job.status]}>
      {JOB_WORDS[job.status]}
    </Pill>
  );
}

/** The ENGINE's states in words. The same at every firm (they are mechanics,
 *  not the firm's vocabulary), which is why a map here is right. `blocked`
 *  means waiting for a person: held up, so warn, never danger. */
const JOB_WORDS: Record<Job["status"], string> = {
  pending: "Not started",
  running: "In progress",
  blocked: "Waiting on someone",
  done: "Done",
  cancelled: "Cancelled",
};
const JOB_TONE: Record<Job["status"], PillTone> = {
  pending: "neutral",
  running: "ok",
  blocked: "warn",
  done: "ok",
  cancelled: "neutral",
};
