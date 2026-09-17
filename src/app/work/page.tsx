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
  ErrorNotice,
  LinkButton,
  Pill,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
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
 */
export default function WorkPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
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

  if (!loaded) return <Loading label="Loading the engine" />;

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title="The engine"
        lede="Everything the engine has open: work a signed engagement created, and how far each piece has got. A recurring service gets a job for each month or quarter as it begins, shown as upcoming with the day it opens."
      />

      <ErrorNotice error={error} />

      <Tabs
        id={tabsId}
        label="Engine views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "work", label: "In hand", count: jobs.length },
          { value: "checks", label: "To check", count: checks.length },
        ]}
      />

      <TabPanel tabsId={tabsId} value={tab}>
      {tab === "checks" ? (
        <CheckQueue checks={checks} />
      ) : jobs.length === 0 ? (
        <Card>
          <Empty title="Nothing is ready to run" icon="engine">
            Work appears here once an engagement letter is signed and its advance is recorded —
            that is what starts the engine.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Work</Th>
                <Th>For</Th>
                <Th>State</Th>
                <Th>Ready since / opens</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <Td>
                    {/* The services this job delivers — one for an unmerged
                        job, several for a merged one. The team or Dept it was
                        cut under sits beside them, because "why are there two
                        FinCompliance cards" is only answerable if each says
                        what is in it. */}
                    {j.services.length === 0 ? (
                      <span className="empty">no services listed</span>
                    ) : (
                      <>
                        {j.services.map((sv) => (
                          <div key={sv.engagementId}>{sv.serviceName}</div>
                        ))}
                      </>
                    )}
                    {/* WHICH month or quarter, on a per-period job. Twelve
                        identical bookkeeping cards are twelve cards nobody can
                        tell apart, and this is the one word that does. */}
                    {(j.periodLabel !== null || j.splitCode !== null) && (
                      <Sub>
                        {j.periodLabel !== null && <Pill tone="neutral">{j.periodLabel}</Pill>}
                        {j.periodLabel !== null && j.splitCode !== null && " "}
                        {j.splitCode !== null && <Pill tone="code">{j.splitCode}</Pill>}
                      </Sub>
                    )}
                  </Td>
                  <Td>
                    {/* The COMPANY the work is delivered to, which is the one a
                        filing belongs to — not the client who is billed. A group
                        of four companies has four of these, and putting the
                        billed client here would make them look identical. */}
                    {j.entityName ?? <span className="empty">—</span>}
                    {j.clientName !== null && j.clientName !== j.entityName && (
                      <Sub>billed to {j.clientName}</Sub>
                    )}
                  </Td>
                  <Td>
                    <JobState job={j} />
                  </Td>
                  <Td>
                    {/* An instant, parsed and shown where the reader is (T6.9)
                        — and for a job whose window is still ahead, the day it
                        opens, said as such. */}
                    {isUpcoming(j) ? (
                      <>
                        <Pill tone="quiet">upcoming</Pill>
                        <Sub>opens {longInstant(j.runnableAt)}</Sub>
                      </>
                    ) : (
                      <span className="mono">{longInstant(j.runnableAt)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    {/* Six links reading "Open", which is a list of six
                        identical destinations to anybody who cannot see the
                        row they sit in. */}
                    <LinkButton
                      size="sm"
                      href={`/work/${j.id}`}
                      aria-label={`Open the ${
                        j.services[0]?.serviceName ?? "job"
                      } for ${j.entityName ?? "an unnamed company"}`}
                    >
                      Open
                    </LinkButton>
                  </Td>
                </tr>
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
function CheckQueue({ checks }: { checks: StepCheck[] }) {
  if (checks.length === 0) {
    return (
      <Card>
        <Empty title="Nothing is waiting to be checked" icon="verification">
          Work lands here when somebody finishes a step whose process says it is reviewed — set
          on Processes, with the rule about who may review it on Who checks work.
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
            <Th>Done by</Th>
            <Th>Waiting since</Th>
            <Th>You</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id}>
              <Td>{c.stepLabel}</Td>
              <Td>
                {/* Null means a machine committed it unattended — no person made
                    it, so there is no maker to be, and anybody eligible may
                    check it. "—" is the honest cell. */}
                {c.submittedByName ?? <span className="unstated">a machine</span>}
              </Td>
              <Td>
                <span className="mono">{longInstant(c.submittedAt)}</span>
              </Td>
              <Td>
                {c.viewer.eligible ? (
                  <Pill tone="ok">you can check this</Pill>
                ) : (
                  <span className="empty">
                    {c.viewer.reason === null
                      ? "not yours to check"
                      : CHECK_INELIGIBILITY[c.viewer.reason]}
                  </span>
                )}
              </Td>
              <Td align="right">
                {/* Open the JOB, not a modal. Approving somebody's filing without
                    seeing what the rest of the job did is the kind of sign-off
                    this whole feature exists to make real. */}
                <LinkButton
                  size="sm"
                  href={`/work/${c.jobId}`}
                  aria-label={`Open the job holding ${c.stepLabel}`}
                >
                  Open
                </LinkButton>
              </Td>
            </tr>
          ))}
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
      <>
        <Pill tone="quiet">not open yet</Pill>
        <Sub>the process is pinned on the day it opens</Sub>
      </>
    );
  }
  if (job.status === "pending" && job.templateVersionId === null) {
    return (
      <>
        <Pill tone="danger">waiting for a process</Pill>
        <Sub>nobody has written how this service is delivered</Sub>
      </>
    );
  }
  return (
    <Pill tone={job.status === "blocked" ? "danger" : "ok"}>
      {job.status === "blocked" ? "waiting for someone" : job.status}
    </Pill>
  );
}
