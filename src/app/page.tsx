"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { agoWords, api, apiError, billLabel, billingPersonName, invoiceNumberWords, noPriceWords } from "@/lib/api/client";
import type {
  BillingAdvance,
  BillingAdvanceDuty,
  BillingDue,
  ClientRequest,
  Escalation,
  MyStep,
  Readiness,
  StepCheck,
  WorkItem,
  WorkItemCheckRow,
} from "@/lib/api/client";
import { Page, PageHeader, Section, useNavCounts, useSession } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  NotSet,
  Notice,
  Pill,
  RowChevron,
  RowLink,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  ThChevron,
  Tr,
} from "@/components/ui";
import { browserDay, longDay } from "@/lib/day";
import { readinessCount } from "@/lib/ui/readiness";

/**
 * My day (V2.1, 2026-09-28): one list of everything that is the reader's.
 *
 * A person's work was spread over the Work board, Jobs, two To check queues and
 * Client requests: about nine clicks and four screens, and nothing said what was
 * due today. This is where staff land now (`homeFor`), and it answers one
 * question: what is on my desk, by when.
 *
 * ── SIX READS, ONE LIST ────────────────────────────────────────────────────
 *
 *   /work-items?mine          my tasks (the firm's own states, not finished)
 *   /my-steps                 process steps on my desk, with their job
 *   /work-item-checks         task checks: the ones I may decide
 *   /checks                   step checks: the ones I may decide, and my own
 *                             steps waiting for a checker
 *   /client-requests          the live inbox, kept to what is on my desk
 *   /escalations?mine         what the ladder told me about
 *   /billing/dues?mine        bills to raise: mine as the manager, and my
 *                             reports' once a week has passed (0318)
 *   /billing/advances?mine    advances still a draft or unpaid that I chase:
 *                             as the client's SPOC, Key Manager or partner,
 *                             and as an admin to issue, or a week on (0322)
 *
 * Eight calls on load (nine for an administrator, who also gets the firm's setup
 * readiness as one line at the top, V2.6), and nothing per row: every read carries the client BY ID
 * and the due day, which the API grew for this screen. An escalation about one
 * of my own tasks is a FLAG on that task's row, not a second row.
 *
 * ── THE BUCKETS ────────────────────────────────────────────────────────────
 *
 * Overdue, Today, This week and Later, by the work's due day against the
 * BROWSER's calendar day (`browserDay`). "This week" is the next seven days, so
 * on a Friday Monday's filings are still in it. What is waiting on me RIGHT NOW
 * (a check to decide, a client request to answer, an escalation to chase) is
 * Today unless it is already late, whatever the work's own date: a check due
 * next week is still a check somebody is waiting on. Other work with no due day
 * goes to Later. Later starts closed.
 *
 * ── WHOSE TURN ─────────────────────────────────────────────────────────────
 *
 * Every row says who has to move next: you; a checker (your task or step is
 * waiting for a check); the client (you replied and they have not come back,
 * or an advance invoice they have not paid); an admin (a draft invoice only an
 * administrator may issue, `tenant:admin`); or an earlier step (a step on your
 * desk that cannot start yet). Waiting on the
 * client for a TASK is not derivable yet (it needs the open asks on the board's
 * read, a P1 task), so a task is yours or a checker's.
 */

type Bucket = "overdue" | "today" | "week" | "later";
type Turn = "me" | "checker" | "client" | "admin" | "earlier";

interface Row {
  readonly key: string;
  readonly what: string;
  /** The kind of thing, and where it comes from, in a few words. */
  readonly kind: string;
  readonly href: Route;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly dueOn: string | null;
  readonly turn: Turn;
  /** Held up or escalated: said under the title, in its tone. */
  readonly flags: readonly { readonly tone: "danger" | "warn"; readonly text: string }[];
  /** Due on nothing, but waiting on me now: goes under Today. */
  readonly now: boolean;
}

const TURN_WORDS: Readonly<Record<Turn, string>> = {
  me: "You",
  checker: "A checker",
  client: "The client",
  admin: "An admin",
  earlier: "An earlier step",
};

const BUCKETS: readonly { readonly key: Bucket; readonly title: string }[] = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Today" },
  { key: "week", title: "This week" },
  { key: "later", title: "Later" },
];

/** `YYYY-MM-DD` plus `days`, on the calendar (no clock, no zone). */
function addDays(day: string, days: number): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
}

function bucketOf(row: Row, today: string): Bucket {
  if (row.dueOn !== null && row.dueOn < today) return "overdue";
  // Waiting on me NOW (a check to decide, a request to answer, an escalation to
  // chase): today, whatever the work's own date, or it hides under Later.
  if (row.now) return "today";
  if (row.dueOn === null) return "later";
  if (row.dueOn === today) return "today";
  if (row.dueOn <= addDays(today, 7)) return "week";
  return "later";
}

/** Earliest first; undated last; then the reader's own turn first; then name. */
function byDue(a: Row, b: Row): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  const mine = Number(b.turn === "me") - Number(a.turn === "me");
  if (mine !== 0) return mine;
  return a.what.localeCompare(b.what);
}

/** The job a step belongs to, in words: "Monthly close · Aug 2026". */
function jobWords(job: MyStep["job"]): string {
  if (job === null) return "a job";
  const services = job.services.join(", ");
  return [services === "" ? null : services, job.periodLabel].filter(Boolean).join(" · ") || "a job";
}

export default function MyDayPage() {
  const router = useRouter();
  const session = useSession();
  const reportCounts = useNavCounts();
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const userId = session?.userId ?? null;
  // Only an administrator sees the firm's setup (the API refuses anybody else).
  const admin = session?.permissions.includes("tenant:admin") === true;
  // CA#6 (0323): issuing a draft invoice is `invoice:issue`, not the whole of
  // administering the firm.
  const issuer = session?.permissions.includes("invoice:issue") === true;

  useEffect(() => {
    // The shell knows who is signed in; until it does there is nothing to ask.
    if (userId === null) return;
    let live = true;
    void (async () => {
      const today = browserDay();
      const [tasks, steps, taskChecks, stepChecks, requests, escalated, bills, ready, advances] = await Promise.all([
        api.GET("/api/v1/work-items", { params: { query: { mine: "true", asOf: today } } }),
        api.GET("/api/v1/my-steps", {}),
        api.GET("/api/v1/work-item-checks", {}),
        api.GET("/api/v1/checks", {}),
        api.GET("/api/v1/client-requests", {}),
        api.GET("/api/v1/escalations", { params: { query: { mine: "true" } } }),
        api.GET("/api/v1/billing/dues", { params: { query: { mine: "true" } } }),
        admin ? api.GET("/api/v1/tenancy/readiness", {}) : Promise.resolve(null),
        // Every staff login: the API answers only the advances this person
        // chases, each with why (`duties`), so nobody else's is listed (0322).
        api.GET("/api/v1/billing/advances", { params: { query: { mine: "true" } } }),
      ]);
      if (!live) return;
      if (tasks.response.status === 401) {
        router.push("/login");
        return;
      }
      // The board is the one read this screen cannot do without. The others
      // empty their own rows when refused, rather than blanking the page.
      if (tasks.error) {
        setError(apiError(tasks.error).message);
        setRows([]);
        return;
      }
      const built = buildRows({
        me: userId,
        issuer,
        tasks: tasks.data.items,
        steps: steps.data?.steps ?? [],
        taskChecks: taskChecks.data?.checks ?? [],
        stepChecks: stepChecks.data?.checks ?? [],
        requests: requests.data?.requests ?? [],
        escalations: escalated.data?.rows ?? [],
        dues: bills.data?.dues ?? [],
        advances: advances.data?.advances ?? [],
      });
      setRows(built);
      setReadiness(ready?.data ?? null);
      setError(null);
      reportCounts({
        "/work-items": tasks.data.items.length,
        "/work": (steps.data?.steps ?? []).length,
        "/client-requests": (requests.data?.requests ?? []).filter(
          (r) => r.assignee?.userId === userId && r.awaitingFirm,
        ).length,
      });
    })();
    return () => {
      live = false;
    };
  }, [userId, admin, issuer, router, reportCounts]);

  if (session === null || rows === null) return <Loading label="Loading your day" />;

  const today = browserDay();
  const grouped = new Map<Bucket, Row[]>(BUCKETS.map((b) => [b.key, []]));
  for (const row of rows) grouped.get(bucketOf(row, today))?.push(row);
  for (const list of grouped.values()) list.sort(byDue);
  const dueSoon =
    (grouped.get("overdue")?.length ?? 0) +
    (grouped.get("today")?.length ?? 0) +
    (grouped.get("week")?.length ?? 0);

  return (
    <Page>
      <PageHeader title="My day" aside={<span className="text-ink-2">{longDay(today)}</span>} />

      <ErrorNotice error={error} />

      {readiness !== null && <SetupLine readiness={readiness} />}

      {dueSoon === 0 && (
        <Card>
          <Empty title="Nothing due. You are up to date." icon="check" />
        </Card>
      )}

      {BUCKETS.map(({ key, title }) => {
        const list = grouped.get(key) ?? [];
        if (list.length === 0) return null;
        const later = key === "later";
        return (
          <Section
            key={key}
            level={2}
            title={
              <>
                {title}{" "}
                <Pill tone={key === "overdue" ? "danger" : key === "today" ? "warn" : "neutral"}>
                  {list.length}
                </Pill>
              </>
            }
            aside={
              later ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={showLater}
                  aria-controls="my-day-later"
                  onClick={() => {
                    setShowLater((v) => !v);
                  }}
                >
                  {showLater ? "Hide" : "Show"}
                </Button>
              ) : undefined
            }
          >
            {(!later || showLater) && (
              <div id={later ? "my-day-later" : undefined}>
                <DayTable rows={list} today={today} />
              </div>
            )}
          </Section>
        );
      })}
    </Page>
  );
}

/** "Setup: 5 of 8", for an administrator, until the firm is set up. */
function SetupLine({ readiness }: { readiness: Readiness }) {
  const { done, total } = readinessCount(readiness);
  if (done === total) return null;
  return (
    <Notice tone="warn">
      <p>
        <strong>{`Setup: ${String(done)} of ${String(total)}`}</strong>{" "}
        <Link href={"/admin/firm#setup" as Route}>See what is left</Link>
      </p>
    </Notice>
  );
}

function DayTable({ rows, today }: { rows: readonly Row[]; today: string }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>What</Th>
            <Th>Client</Th>
            <Th>Due</Th>
            <Th>Whose turn</Th>
            <ThChevron />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const late = row.dueOn !== null && row.dueOn < today;
            return (
              <Tr key={row.key} linked>
                <Td>
                  <span className="cell-text">
                    <RowLink href={row.href}>{row.what}</RowLink>
                  </span>
                  <Sub>{row.kind}</Sub>
                  {row.flags.map((f) => (
                    <Sub key={f.text}>
                      <span className={`cell-text tone-${f.tone}`}>{f.text}</span>
                    </Sub>
                  ))}
                </Td>
                <Td>
                  {row.clientName === null ? (
                    <NotSet />
                  ) : row.clientId === null ? (
                    <span className="cell-text" data-size="narrow">
                      {row.clientName}
                    </span>
                  ) : (
                    <span className="cell-text" data-size="narrow">
                      <Link href={`/clients/${row.clientId}`}>{row.clientName}</Link>
                    </span>
                  )}
                </Td>
                <Td className="nowrap">
                  {row.dueOn === null ? (
                    <NotSet>No due date</NotSet>
                  ) : (
                    <span className={late ? "tone-danger" : row.dueOn === today ? "tone-warn" : undefined}>
                      {longDay(row.dueOn)}
                    </span>
                  )}
                </Td>
                <Td className="nowrap">
                  {row.turn === "me" ? <strong>{TURN_WORDS.me}</strong> : TURN_WORDS[row.turn]}
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

/**
 * The six reads, as one list of rows.
 *
 * Pure, so the rules above are in one place: what counts as mine, whose turn it
 * is, and the one merge (an escalation about my own task flags that task).
 */
function buildRows(input: {
  me: string;
  /** Holds `invoice:issue` (0323): issues a draft invoice. */
  issuer: boolean;
  tasks: readonly WorkItem[];
  steps: readonly MyStep[];
  taskChecks: readonly WorkItemCheckRow[];
  stepChecks: readonly StepCheck[];
  requests: readonly ClientRequest[];
  escalations: readonly Escalation[];
  dues: readonly BillingDue[];
  /** `?mine=true`: the advances I chase, each with its `duties`. */
  advances: readonly BillingAdvance[];
}): Row[] {
  const out: Row[] = [];

  // What the ladder told me, by the task it is about: a flag on my own row.
  const escalatedTask = new Map<string, Escalation>();
  for (const e of input.escalations) {
    if (e.workItemId !== null && !escalatedTask.has(e.workItemId)) escalatedTask.set(e.workItemId, e);
  }
  const myTaskIds = new Set(input.tasks.map((t) => t.id));

  for (const t of input.tasks) {
    const flags: { tone: "danger" | "warn"; text: string }[] = [];
    // WHY it is stuck, in the danger tone: the kind line above already says the
    // firm's word for the state ("Task · Blocked"), from the FLAG.
    if (t.state.isBlocked && t.blockedReason !== null) {
      flags.push({ tone: "danger", text: t.blockedReason });
    }
    if (t.blockedByOpen.length > 0) {
      flags.push({ tone: "warn", text: `Waiting on ${t.blockedByOpen.map((b) => b.title).join(", ")}` });
    }
    // One word: the rung and who was told are on the board's Escalated tab, and
    // the firm's rung label repeated on every late row drowned the reason above.
    if (escalatedTask.has(t.id)) flags.push({ tone: "warn", text: "Escalated" });
    out.push({
      key: `task-${t.id}`,
      what: t.title,
      kind: `Task · ${t.state.name}`,
      href: `/work-items/${t.id}` as Route,
      clientId: t.clientPartyId,
      clientName: t.clientName,
      dueOn: t.dueOn,
      turn: t.hasOpenReview ? "checker" : "me",
      flags,
      now: false,
    });
  }

  // A step I finished that waits for its check is still on my desk to the
  // engine (`blocked`: waiting on a person), and it is the CHECKER's turn. One
  // row for it, here, rather than a step and a check saying two things.
  const stepKey = (jobId: string, key: string): string => `${jobId}|${key}`;
  const checking = new Set(
    input.stepChecks.filter((c) => c.decision === "pending").map((c) => stepKey(c.jobId, c.stepKey)),
  );
  const mySteps = new Set(input.steps.map((s) => stepKey(s.jobId, s.stepKey)));
  for (const s of input.steps) {
    const waitingForCheck = checking.has(stepKey(s.jobId, s.stepKey));
    out.push({
      key: `step-${s.id}`,
      what: s.label,
      kind: `${waitingForCheck ? "Step, done" : "Step"} · ${jobWords(s.job)}`,
      href: `/work/${s.jobId}` as Route,
      clientId: s.job?.clientPartyId ?? null,
      clientName: s.job?.clientName ?? null,
      dueOn: s.job?.dueOn ?? null,
      // `blocked` on a step is the engine waiting on a PERSON: this one, unless
      // the step is done and a check is open on it.
      turn: waitingForCheck ? "checker" : s.status === "pending" ? "earlier" : "me",
      flags: [],
      now: false,
    });
  }

  // Checks I may decide. My OWN task waiting for a check is already a row
  // above (whose turn: a checker), so the queue adds only the ones I decide.
  for (const c of input.taskChecks) {
    if (!c.viewer.eligible || c.decision !== "pending") continue;
    out.push({
      key: `task-check-${c.id}`,
      what: c.workItemTitle,
      kind: `Check${c.submittedByName === null ? "" : ` · by ${c.submittedByName}`}`,
      href: `/work-items/${c.workItemId}` as Route,
      clientId: c.clientPartyId,
      clientName: c.clientName,
      dueOn: c.dueOn,
      turn: "me",
      flags: [],
      now: true,
    });
  }

  // Step checks: the ones I decide, and my own finished steps waiting for a
  // checker (a done step leaves /my-steps, so this is the only place it shows).
  for (const c of input.stepChecks) {
    if (c.decision !== "pending") continue;
    const mineToDecide = c.viewer.eligible;
    // My own step waiting for a checker, unless it is already a row above.
    const mineWaiting = c.submittedBy === input.me && !mySteps.has(stepKey(c.jobId, c.stepKey));
    if (!mineToDecide && !mineWaiting) continue;
    out.push({
      key: `step-check-${c.id}`,
      what: c.stepLabel,
      kind: `${mineToDecide ? "Check" : "Step, done"} · ${jobWords(c.job)}${
        mineToDecide && c.submittedByName !== null ? ` · by ${c.submittedByName}` : ""
      }`,
      href: `/work/${c.jobId}` as Route,
      clientId: c.job?.clientPartyId ?? null,
      clientName: c.job?.clientName ?? null,
      dueOn: c.job?.dueOn ?? null,
      turn: mineToDecide ? "me" : "checker",
      flags: [],
      now: mineToDecide,
    });
  }

  // Client requests on my desk: mine to answer, or answered and waiting on them.
  for (const r of input.requests) {
    if (r.assignee?.userId !== input.me) continue;
    out.push({
      key: `request-${r.requestId}`,
      what: r.subject,
      kind: "Client request",
      href: `/client-requests/${r.requestId}` as Route,
      clientId: r.clientPartyId,
      clientName: r.clientName,
      dueOn: null,
      turn: r.awaitingFirm ? "me" : "client",
      flags: [],
      now: r.awaitingFirm,
    });
  }

  // What the ladder told me about work that is NOT mine: mine to chase. One row
  // per piece of work, however many rungs have fired on it.
  const seen = new Set<string>();
  for (const e of input.escalations) {
    if (e.workItemId !== null && myTaskIds.has(e.workItemId)) continue;
    const subject = e.workItemId ?? e.obligationInstanceId ?? e.id;
    if (seen.has(subject)) continue;
    seen.add(subject);
    const holder = e.holder === null ? null : (e.holder.displayName ?? e.holder.email);
    out.push({
      key: `escalation-${e.id}`,
      what: e.subjectTitle,
      kind: `Escalated to you${holder === null ? "" : ` · with ${holder}`}`,
      href: (e.workItemId !== null ? `/work-items/${e.workItemId}` : "/calendar") as Route,
      clientId: e.clientPartyId,
      clientName: e.clientName ?? e.entityName,
      dueOn: e.dueOn,
      turn: "me",
      flags: [],
      now: true,
    });
  }

  out.push(...billRows(input.me, input.issuer, input.dues));
  out.push(...advanceRows(input.advances));

  return out;
}

const DUTY_WORDS: Readonly<Record<Exclude<BillingAdvanceDuty, "admin">, string>> = {
  spoc: "SPOC",
  key_manager: "Key Manager",
  partner: "Partner",
};

/**
 * ADVANCES I CHASE (0322). The work started at signing and the advance invoice
 * was drafted then (Ashish, 2026-10-02); until it is paid it is on the desks of
 * the client's SPOC for the work, its Key Manager and the partner above them
 * (`duties`, worked out by the API). An administrator gets the ones waiting for
 * an admin (no invoice yet, or a draft to issue) and any still pending a week
 * after signing ("Escalated", the weekly summary's list).
 *
 * Whose turn: a draft is an admin's (only they issue), an issued one the
 * client's (they pay). The row is dated the last day before the firm's
 * Overdue days run out (`overdueOn`, Your firm), so it turns Overdue here the
 * same morning the Advances tab says so. Until then it is Today, every day:
 * Ashish asked for the reminder to stay on the dashboard until the money is
 * in, and dated by its due day an unpaid advance sat in Later (closed) for its
 * first week, which the walk found.
 */
function advanceRows(advances: readonly BillingAdvance[]): Row[] {
  return advances.map((a) => {
    const asAdmin = a.duties.includes("admin");
    const roles = a.duties.filter((d): d is Exclude<BillingAdvanceDuty, "admin"> => d !== "admin");
    const forWhat = a.engagementId === null ? a.letter.ref : `${a.serviceName} · ${a.letter.ref}`;
    const invoice = a.invoice !== null && a.invoice.status !== "cancelled" ? a.invoice : null;
    const issued = a.stage === "unpaid" || a.stage === "part_paid";
    const flags: { tone: "danger" | "warn"; text: string }[] = [];
    if (a.escalated) flags.push({ tone: "warn", text: "Escalated" });

    let what: string;
    let turn: Turn;
    let href: Route = (invoice === null ? "/invoices?tab=advances" : `/invoices/${invoice.id}`) as Route;
    if (issued) {
      what = `Advance ${a.stage === "part_paid" ? "part paid" : "not paid"}: ${invoiceNumberWords(invoice?.number ?? null)}`;
      turn = "client";
    } else if (a.stage === "on_draft") {
      // Item 14b: issuing is an admin's, so a SPOC or a manager is told where it is.
      what = asAdmin ? "Issue the advance invoice" : "Advance invoice: with an admin to issue";
      turn = asAdmin ? "me" : "admin";
    } else if (a.draftBlocked === "billed_by_hand" && a.handRaised !== null) {
      // Linking an advance is an admin's too (0321).
      what = asAdmin ? `Link ${a.handRaised.number} as the advance` : `Advance: with an admin to link ${a.handRaised.number}`;
      turn = asAdmin ? "me" : "admin";
      href = "/invoices?tab=raise" as Route;
    } else if (a.draftBlocked === "no_tax_rate" && asAdmin) {
      what = `Set a tax rate for ${a.issuer.displayName}`;
      turn = "me";
      href = "/admin/firm#billing" as Route;
    } else {
      // No invoice yet: anybody who may raise (the SPOC, a manager) can, typing
      // the tax rate in the dialog.
      what = "Raise the advance invoice";
      turn = "me";
      href = "/invoices?tab=raise" as Route;
    }

    const since = `${issued ? "issued" : "signed"} ${agoWords(a.daysPending)}`;
    const role = roles.length === 0 ? "" : ` · you are the ${roles.map((d) => DUTY_WORDS[d]).join(", ")}`;
    return {
      key: `advance-${a.id}`,
      what,
      kind: `Advance · ${forWhat} · ${since}${role}`,
      href,
      clientId: a.party.id,
      clientName: a.party.displayName,
      dueOn: a.overdueOn === null ? null : addDays(a.overdueOn, -1),
      turn,
      flags,
      now: true,
    };
  });
}

/**
 * BILLS TO RAISE (auto-invoice, 0318), from `/billing/dues?mine`: one row per
 * invoice that could be raised (client, company, currency and manager, the four
 * an invoice cannot mix), and one per draft invoice made from bills and not yet
 * issued. Due on the last day before the oldest bill escalates to the
 * manager's own manager (the API does that 7 days after the bill date, so it
 * turns Overdue here the same morning); it is on my desk NOW either way. A
 * bill escalated to me from somebody who reports to me says whose it is.
 *
 * A bill with NO PRICE is also on the client's SPOC's desk and every
 * administrator's (Ashish: the SPOC, the manager and the admin, every week):
 * "Needs a price · with <manager>", and a flag counting the weeks it has waited,
 * which is the weekly reminder. The manager's own row carries the same flag.
 *
 * A draft made from bills is issued by an administrator only (`tenant:admin`),
 * and since 0322 it has no number until then: an admin reads "Issue the draft
 * invoice", anybody else "With an admin to issue" (review item 14b).
 */
function billRows(me: string, issuer: boolean, dues: readonly BillingDue[]): Row[] {
  const groups = new Map<string, BillingDue[]>();
  for (const d of dues) {
    const key =
      d.status === "drafted" && d.invoice !== null
        ? `invoice-${d.invoice.id}`
        : `bill-${[d.party.id, d.issuer.id, d.currency, d.manager?.userId ?? ""].join("|")}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const rows: Row[] = [];
  for (const [key, list] of groups) {
    const first = [...list].sort((a, b) => a.billOn.localeCompare(b.billOn))[0];
    if (first === undefined) continue;
    const more = list.length > 1 ? ` and ${String(list.length - 1)} more` : "";
    const mine = first.manager?.userId === me;
    const holder = first.manager === null ? null : billingPersonName(first.manager);
    const drafted = first.status === "drafted" && first.invoice !== null;
    const flags: { tone: "danger" | "warn"; text: string }[] = [];
    if (mine && first.escalated && first.managerReportsTo !== null) {
      flags.push({ tone: "warn", text: `Also with ${billingPersonName(first.managerReportsTo)}` });
    }
    // The longest-waiting bill with no price, counted in weeks.
    const unpriced = list.filter((d) => !d.priced && d.status === "open");
    if (unpriced.length > 0) {
      flags.push({ tone: "warn", text: noPriceWords(Math.max(...unpriced.map((d) => d.daysSinceBillOn))) });
    }
    // Not the manager: either it escalated to me, or I am reminded of a price.
    const escalatedToMe = list.some((d) => d.escalated && d.managerReportsTo?.userId === me);
    rows.push({
      key,
      what: drafted
        ? `${issuer ? "Issue the draft invoice" : "Waiting to be issued"}: ${billLabel(first)}${more}`
        : `Raise the invoice: ${billLabel(first)}${more}`,
      kind: mine
        ? drafted
          ? "Draft invoice"
          : "Bill to raise"
        : `${escalatedToMe ? "Escalated to you" : "Needs a price"}${holder === null ? "" : ` · with ${holder}`}`,
      href: (drafted && first.invoice !== null ? `/invoices/${first.invoice.id}` : "/invoices?tab=raise") as Route,
      clientId: first.party.id,
      clientName: first.party.displayName,
      dueOn: addDays(first.billOn, 6),
      turn: drafted && !issuer ? "admin" : "me",
      flags,
      now: !drafted || issuer,
    });
  }
  return rows;
}
