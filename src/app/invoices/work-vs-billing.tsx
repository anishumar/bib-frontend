"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useId, useRef, useState } from "react";
import { api, apiError, codeLabel, colleagueLabel, formatMoney, invoiceNumberWords } from "@/lib/api/client";
import type { Colleague, PartySummary, WorkBilling, WorkBillingFlag, WorkBillingRow } from "@/lib/api/client";
import { longDay, monthYear } from "@/lib/day";
import { Row, Stack } from "@/components/layout";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { Empty } from "@/components/states";
import {
  Button,
  Card,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  NotSet,
  Notice,
  Pill,
  Select,
  Stat,
  Strip,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  type PillTone,
} from "@/components/ui";

/**
 * WORK VS BILLING (Q041, 2026-10-04): every client, service and period with its
 * work, its bill, the invoice and the money, and a plain sentence wherever
 * something needs a person. Ashish: "job done but bill not generated, hume kyun
 * nahi mil sakta system mein yeh?" The API pairs the rows and decides what is a
 * problem (codes); this file only puts them into words. A retainer's bill raised
 * before its month's work is finished is NOT a problem and reads as a note.
 *
 * Filters: client, manager (the bill's, else the invoice's, else the client's
 * Key Manager), the months, and Only problems. `?client=` comes from the client
 * page's link.
 */
export function WorkVsBillingTab({
  initial,
  initialClient,
  parties,
  colleagues,
}: {
  /** The page's own read (default window, everyone), shown until a filter changes. */
  initial: WorkBilling | null;
  initialClient: string | null;
  parties: readonly PartySummary[];
  colleagues: readonly Colleague[];
}) {
  const formId = useId();
  const [client, setClient] = useState(initialClient ?? "");
  const [manager, setManager] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [answer, setAnswer] = useState<WorkBilling | null>(initialClient === null ? initial : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** The latest ask, so a slow answer to an earlier filter cannot land last. */
  const asked = useRef(0);
  /** The page already read the default view; asked again only once a filter
   *  changes (or when the URL named a client). Read once, at mount: the page's
   *  later reloads do not reach a tab already open. */
  const haveDefault = useRef(initialClient === null && initial !== null);

  useEffect(() => {
    if (haveDefault.current) {
      haveDefault.current = false;
      return;
    }
    const ask = ++asked.current;
    setLoading(true);
    void (async () => {
      const result = await api.GET("/api/v1/billing/work-vs-billing", {
        params: {
          query: {
            ...(client === "" ? {} : { partyId: client }),
            ...(manager === "" ? {} : { managerUserId: manager }),
            ...(from === null ? {} : { from }),
            ...(to === null ? {} : { to }),
            ...(problemsOnly ? { problemsOnly: "true" as const } : {}),
          },
        },
      });
      if (ask !== asked.current) return;
      setLoading(false);
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      setAnswer(result.data);
    })();
  }, [client, manager, from, to, problemsOnly]);

  const months = answer === null ? [] : monthsBack(answer.today, 36);
  const clients = parties.filter((p) => !p.isOwnCompany);
  const s = answer?.summary;
  const unbilled = s === undefined ? 0 : s.byFlag.no_bill + s.byFlag.no_final_bill + s.byFlag.not_raised + s.byFlag.not_issued;

  return (
    <Stack>
      <form id={formId} onSubmit={(e) => e.preventDefault()}>
        <FieldRow>
          <Field label="Client">
            <Select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
              }}
            >
              <option value="">All clients</option>
              {clients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Manager">
            <Select
              value={manager}
              onChange={(e) => {
                setManager(e.target.value);
              }}
            >
              <option value="">Everyone</option>
              {colleagues.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {colleagueLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Select
              value={(from ?? answer?.from ?? "").slice(0, 7)}
              onChange={(e) => {
                setFrom(`${e.target.value}-01`);
              }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthYear(`${m}-01`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select
              value={(to ?? answer?.to ?? "").slice(0, 7)}
              onChange={(e) => {
                setTo(lastDayOf(e.target.value));
              }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthYear(`${m}-01`)}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <Row>
          <Checkbox
            label="Only problems"
            checked={problemsOnly}
            onChange={(e) => {
              setProblemsOnly(e.target.checked);
            }}
          />
          {/* What the table shows, filters and all, as a spreadsheet. Built
              from the rows already here, so a login without fees gets no
              amounts in the file either. */}
          <Button
            variant="secondary"
            size="sm"
            disabled={answer === null || answer.rows.length === 0 || loading}
            onClick={() => {
              if (answer !== null) downloadCsv(csvName(answer, clients.find((p) => p.id === client)?.displayName), csvRows(answer));
            }}
          >
            Download CSV
          </Button>
        </Row>
      </form>

      <ErrorNotice error={error} />

      {answer !== null && s !== undefined && (
        <>
          <Strip>
            <Stat
              label="Need attention"
              value={s.withProblems}
              note={`of ${String(s.rows)}`}
              {...(s.withProblems > 0 ? { tone: "danger" as const } : {})}
            />
            <Stat
              label="Due, not billed"
              value={unbilled}
              note={ageNote(s.unbilledAge)}
              {...(unbilled > 0 ? { tone: "warn" as const } : {})}
            />
            <Stat
              label="Unpaid past due"
              value={s.byFlag.unpaid_overdue}
              note={ageNote(s.overdueAge)}
              {...(s.byFlag.unpaid_overdue > 0 ? { tone: "danger" as const } : {})}
            />
            <Stat label="Skipped" value={s.byFlag.skipped} />
          </Strip>
          {!answer.feesVisible && <Notice tone="neutral">Fees hidden. Amounts are not shown for your login.</Notice>}
          {answer.truncated && <Notice tone="warn">Showing the first 2,000 rows. Narrow the months or pick a client.</Notice>}
        </>
      )}

      {answer === null ? (
        <p className="muted">{loading ? "Loading…" : ""}</p>
      ) : answer.rows.length === 0 ? (
        <Card>
          <Empty title={problemsOnly ? "No problems" : "Nothing in these months"} icon="check">
            {problemsOnly ? "Every job here is billed and every invoice is paid or not yet due." : "No work or bills fall in these months."}
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table aria-busy={loading}>
            <thead>
              <tr>
                <Th>Client and service</Th>
                <Th>Work</Th>
                <Th>Billing</Th>
                <Th>Needs attention</Th>
              </tr>
            </thead>
            <tbody>
              {answer.rows.map((r) => {
                const notes = r.notes.filter((n) => n.code !== "work_in_progress");
                return (
                  <tr key={r.key} data-problem={r.flags.length > 0 ? "" : undefined}>
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        <Link href={`/clients/${r.party.id}` as Route}>{r.party.displayName}</Link>
                      </span>
                      <span className="cell-text" data-size="narrow">
                        {r.serviceName}
                      </span>
                      <Sub>
                        {periodWords(r)} ·{" "}
                        <Link href={`/engagement-letters/${r.letter.id}` as Route}>{r.letter.ref}</Link>
                      </Sub>
                      {r.entityName !== null && r.entityName !== r.party.displayName && <Sub>For {r.entityName}</Sub>}
                      {r.manager !== null && <Sub>Manager: {r.manager.displayName ?? "Not named"}</Sub>}
                    </Td>
                    <Td>
                      <Pill dot tone={workTone(r.work)}>
                        {WORK_WORDS[r.work]}
                      </Pill>
                      {r.workDoneOn !== null && <Sub>On {longDay(r.workDoneOn)}</Sub>}
                      {r.filings.map((f) => (
                        <span key={f.id} className="cell-text sub" data-size="narrow">
                          {f.name}:{" "}
                          {f.filed
                            ? `filed${f.filedOn === null ? "" : ` ${longDay(f.filedOn)}`}`
                            : `${f.stateName.toLowerCase()}, due ${longDay(f.dueOn)}`}
                        </span>
                      ))}
                    </Td>
                    <Td>
                      <div className="cell-text" data-size="narrow">
                        <BillingCell row={r} />
                      </div>
                    </Td>
                    <Td>
                      <div className="cell-text" data-size="narrow">
                        {r.flags.map((f) => (
                          <p key={f.code} className="tone-danger">
                            {flagWords(f, r)}
                          </p>
                        ))}
                        {r.flags.length === 0 && notes.length === 0 && <span className="muted">No action needed</span>}
                        {notes.map((n) => (
                          <Sub key={n.code}>{noteWords(n)}</Sub>
                        ))}
                        {r.handInvoices !== null && r.handInvoices.last !== null && (
                          <Sub>
                            Raised by hand:{" "}
                            <Link href={`/invoices/${r.handInvoices.last.invoiceId}` as Route}>
                              {invoiceNumberWords(r.handInvoices.last.number)}
                            </Link>
                            {r.handInvoices.count > 1 && ` and ${String(r.handInvoices.count - 1)} more`}
                          </Sub>
                        )}
                        <FixLink row={r} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Stack>
  );
}

const WORK_WORDS: Readonly<Record<WorkBillingRow["work"], string>> = {
  none: "No job",
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

function workTone(w: WorkBillingRow["work"]): PillTone {
  return w === "done" ? "ok" : w === "cancelled" ? "neutral" : w === "none" ? "neutral" : "warn";
}

const BILL_WORDS: Readonly<Record<NonNullable<WorkBillingRow["bill"]>["status"], string>> = {
  open: "To raise",
  drafted: "On a draft",
  billed: "Billed",
  skipped: "Skipped",
  covered: "Paid by advance",
};

function billTone(status: NonNullable<WorkBillingRow["bill"]>["status"]): PillTone {
  return status === "billed" || status === "covered" ? "ok" : status === "skipped" ? "danger" : "warn";
}

function periodWords(r: WorkBillingRow): string {
  if (r.kind === "advance") return "Advance";
  if (r.kind === "one_time") return "One-time";
  return r.period?.label ?? "Not set";
}

/** The bill, then its invoice and the money: one column, so the table fits a
 *  1280 screen with the sentences beside it. */
function BillingCell({ row: r }: { row: WorkBillingRow }) {
  if (r.bill === null) {
    return (
      <>
        <NotSet>No bill</NotSet>
        {r.expectedBillOn !== null && <Sub>Due {longDay(r.expectedBillOn)}</Sub>}
      </>
    );
  }
  const amount =
    r.bill.amount !== null ? formatMoney(r.bill.amount, r.bill.currency) : r.bill.priced ? "Fees hidden" : "No price";
  const p = r.payment;
  const late = p !== null && p.state !== "paid" && p.daysOverdue !== null ? dueWords(p.daysOverdue) : null;
  const owed =
    r.invoice !== null && r.invoice.outstanding !== null && p !== null && p.state !== "paid"
      ? `${formatMoney(r.invoice.outstanding, r.bill.currency)} owed`
      : null;
  return (
    <>
      <div className="cluster">
        <Pill dot tone={billTone(r.bill.status)}>
          {BILL_WORDS[r.bill.status]}
        </Pill>
        <span>{amount}</span>
      </div>
      <Sub>Bill date {longDay(r.bill.billOn)}</Sub>
      {r.invoice !== null && (
        <div className="cluster">
          <Link href={`/invoices/${r.invoice.id}` as Route}>{invoiceNumberWords(r.invoice.number, r.invoice.status)}</Link>
          {p !== null && (
            <Pill dot tone={p.state === "paid" ? "ok" : p.daysOverdue !== null && p.daysOverdue > 0 ? "danger" : "warn"}>
              {PAYMENT_WORDS[p.state]}
            </Pill>
          )}
        </div>
      )}
      {(late !== null || owed !== null) && <Sub>{[late, owed].filter((x) => x !== null).join(" · ")}</Sub>}
    </>
  );
}

const PAYMENT_WORDS: Readonly<Record<NonNullable<WorkBillingRow["payment"]>["state"], string>> = {
  paid: "Paid",
  part_paid: "Part paid",
  unpaid: "Unpaid",
};

function dueWords(daysOverdue: number): string {
  if (daysOverdue > 0) return `${days(daysOverdue)} overdue`;
  if (daysOverdue === 0) return "Due today";
  return `Due in ${days(-daysOverdue)}`;
}

function days(n: number): string {
  return n === 1 ? "1 day" : `${String(n)} days`;
}

/** The flag as one sentence that says why. */
export function flagWords(f: WorkBillingFlag, r: WorkBillingRow): string {
  switch (f.code) {
    case "no_bill":
      switch (f.cause) {
        case "no_schedule":
          return "Work done, no bill: billing is not set up for this service.";
        case "auto_billing_off":
          return "Work done, no bill: automatic billing is off.";
        case "no_fiscal_year":
          return "Work done, no bill: set when your financial year starts.";
        default:
          return `Work done, no bill written. Due ${longDay(f.since)}.`;
      }
    case "no_final_bill":
      switch (f.cause) {
        case "auto_billing_off":
          return `Done ${longDay(f.since)}, no final bill: automatic billing is off.`;
        default:
          return `Done ${longDay(f.since)}, no final bill yet.`;
      }
    case "skipped": {
      const who = f.by?.displayName ?? "someone";
      return `Skipped by ${who}: ${f.reason ?? "no reason given"}.`;
    }
    case "not_raised":
      return f.cause === "no_price"
        ? `Bill due ${longDay(f.since)}, not raised: the letter has no price.`
        : `Bill due ${longDay(f.since)}, not raised for ${days(f.days)}.`;
    case "not_issued":
      return `Draft invoice not issued for ${days(f.days)}.`;
    case "unpaid_overdue":
      return `${r.payment?.state === "part_paid" ? "Part paid" : "Unpaid"}, ${days(f.days)} overdue.`;
  }
}

function noteWords(n: WorkBillingRow["notes"][number]): string {
  switch (n.code) {
    case "raised_before_work_done":
      return "Billed before the work is finished.";
    case "bill_due_on":
      return n.date === null ? "Bill not due yet." : `Bill due ${longDay(n.date)}.`;
    case "billing_run_next":
      return "The billing run writes this bill next.";
    case "before_billing_start":
      return n.date === null ? "Before billing started." : `Before billing started on ${longDay(n.date)}.`;
    case "before_auto_billing":
      // Q027: history from before the firm went live, billed by hand if at all.
      return n.date === null
        ? "Before automatic billing started."
        : `Before automatic billing started (${n.date.endsWith("-01") ? monthYear(n.date) : longDay(n.date)}).`;
    case "billed_by_hand":
      return `Billed by hand${n.invoiceNumber === null ? "" : `: ${n.invoiceNumber}`}.`;
    case "not_served":
      return "Not billed: the service was paused.";
    case "covered_by_advance":
      return `Paid from the advance${n.invoiceNumber === null ? "" : ` (${n.invoiceNumber})`}.`;
    case "work_in_progress":
      return "";
  }
}

/** Where the fix is, for the flags a person can act on from another screen. */
function FixLink({ row: r }: { row: WorkBillingRow }) {
  const codes = new Set(r.flags.map((f) => `${f.code}:${f.cause ?? ""}`));
  if (codes.has("no_bill:no_schedule")) return <Sub><Link href={"/invoices?tab=setup" as Route}>Set billing</Link></Sub>;
  if (codes.has("no_bill:auto_billing_off") || codes.has("no_final_bill:auto_billing_off")) {
    return <Sub><Link href={"/admin/firm#billing" as Route}>Automatic billing</Link></Sub>;
  }
  if (codes.has("not_raised:") || codes.has("not_raised:no_price")) {
    return <Sub><Link href={"/invoices?tab=raise" as Route}>To raise</Link></Sub>;
  }
  return null;
}

// ── The CSV ─────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Client",
  "Company",
  "Service",
  "Kind",
  "Period",
  "Period start",
  "Period end",
  "Engagement letter",
  "Manager",
  "Work",
  "Work done on",
  "Filings",
  "Bill",
  "Bill date",
  "Expected bill date",
  "Currency",
  "Bill amount",
  "Invoice",
  "Invoice status",
  "Invoice date",
  "Due date",
  "Invoiced",
  "Paid",
  "Outstanding",
  "Payment",
  "Days overdue",
  "Needs attention",
  "Notes",
] as const;

const KIND_WORDS: Readonly<Record<WorkBillingRow["kind"], string>> = {
  period: "Recurring",
  one_time: "One-time",
  advance: "Advance",
};

/** One line per row of the table, in words, amounts as plain numbers (null
 *  for a login without fees: an empty cell, never a zero), days as YYYY-MM-DD
 *  so Excel sorts them. */
export function csvRows(answer: WorkBilling): CsvCell[][] {
  const num = (v: string | null | undefined): CsvCell => (v === null || v === undefined ? null : { number: v });
  const rows: CsvCell[][] = [[...CSV_HEADERS]];
  for (const r of answer.rows) {
    const p = r.payment;
    const notes = r.notes.filter((n) => n.code !== "work_in_progress").map(noteWords);
    if (r.handInvoices !== null && r.handInvoices.last !== null) {
      notes.push(`Raised by hand: ${invoiceNumberWords(r.handInvoices.last.number)}${r.handInvoices.count > 1 ? ` and ${String(r.handInvoices.count - 1)} more` : ""}.`);
    }
    rows.push([
      r.party.displayName,
      r.entityName,
      r.serviceName,
      KIND_WORDS[r.kind],
      periodWords(r),
      r.period?.start ?? null,
      r.period?.end ?? null,
      r.letter.ref,
      r.manager?.displayName ?? null,
      WORK_WORDS[r.work],
      r.workDoneOn,
      r.filings
        .map((f) => `${f.name} ${f.periodLabel}: ${f.filed ? `filed${f.filedOn === null ? "" : ` ${f.filedOn}`}` : `${f.stateName.toLowerCase()}, due ${f.dueOn}`}`)
        .join("; ") || null,
      r.bill === null ? "No bill" : BILL_WORDS[r.bill.status],
      r.bill?.billOn ?? null,
      r.expectedBillOn,
      r.bill?.currency ?? null,
      r.bill === null ? null : r.bill.amount === null ? (r.bill.priced ? null : "No price") : { number: r.bill.amount },
      r.invoice === null ? null : invoiceNumberWords(r.invoice.number, r.invoice.status),
      r.invoice === null ? null : codeLabel(r.invoice.status),
      r.invoice?.issuedOn ?? null,
      p?.dueOn ?? r.invoice?.dueOn ?? null,
      num(r.invoice?.invoiced),
      num(r.invoice?.paid),
      num(r.invoice?.outstanding),
      p === null ? null : PAYMENT_WORDS[p.state],
      p !== null && p.state !== "paid" && p.daysOverdue !== null && p.daysOverdue > 0 ? { number: String(p.daysOverdue) } : null,
      r.flags.map((f) => flagWords(f, r)).join(" ") || null,
      notes.join(" ") || null,
    ]);
  }
  return rows;
}

/** `work-vs-billing-2025-11-01-to-2026-10-04.csv`, with the client when one is chosen. */
function csvName(answer: WorkBilling, clientName: string | undefined): string {
  const who =
    clientName === undefined
      ? ""
      : `-${clientName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40)}`;
  return `work-vs-billing${who}-${answer.from}-to-${answer.to}.csv`;
}

/** "3 over 30 days", or nothing to add. */
function ageNote(age: WorkBilling["summary"]["unbilledAge"]): string | undefined {
  const old = age.d31_60 + age.d61_90 + age.d90_plus;
  if (old === 0) return undefined;
  return age.d90_plus > 0 ? `${String(old)} over 30 days, ${String(age.d90_plus)} over 90` : `${String(old)} over 30 days`;
}

/** "YYYY-MM" for this month and the `n - 1` before it, newest first. */
function monthsBack(today: string, n: number): string[] {
  const [y = 2026, m = 1] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const zero = y * 12 + (m - 1) - i;
    out.push(`${String(Math.floor(zero / 12))}-${String((zero % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** The last day of a "YYYY-MM" month, as a day. */
function lastDayOf(month: string): string {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
