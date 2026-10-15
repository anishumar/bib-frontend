"use client";

import Link from "next/link";
import type { Route } from "next";
import { Fragment, useEffect, useRef, useState } from "react";
import { api, apiError, colleagueLabel, formatMoney } from "@/lib/api/client";
import type { ClientSummary, ClientSummaryLine, Colleague, PartySummary, SummaryFigures } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { Row, Stack } from "@/components/layout";
import { Empty } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  Field,
  FieldRow,
  NotSet,
  Select,
  Stat,
  Strip,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";

type PeriodKey = "default" | "last_fy" | "last_12" | "this_month" | "last_month";

/**
 * CLIENT SUMMARY: per client and per service, what was billed, what came in and
 * what is still owed, beside the client's Key Manager and the SPOC of each
 * service's Dept. The API adds it up (one invoice for several services is split
 * by each one's share); this file filters and words it. Only offered to a login
 * that sees fees.
 */
export function ClientSummaryTab({
  parties,
  colleagues,
}: {
  parties: readonly PartySummary[];
  colleagues: readonly Colleague[];
}) {
  const [client, setClient] = useState("");
  const [keyManager, setKeyManager] = useState("");
  const [spoc, setSpoc] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("default");
  /** The firm's financial year, once the API has said; the periods need it. */
  const [fyStart, setFyStart] = useState<number | null>(null);
  const fy = useRef<number | null>(null);
  const [answer, setAnswer] = useState<ClientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The filters the shown answer is for: loading while they differ from now. */
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const filters = [client, keyManager, spoc, period].join("|");
  const loading = answeredFor !== filters;
  /** The latest ask, so a slow answer to an earlier filter cannot land last. */
  const asked = useRef(0);

  useEffect(() => {
    const ask = ++asked.current;
    const range = periodRange(period, browserDay(), fy.current);
    void (async () => {
      const result = await api.GET("/api/v1/dashboard/client-summary", {
        params: {
          query: {
            ...(range === null ? {} : range),
            ...(client === "" ? {} : { partyId: client }),
            ...(keyManager === "" ? {} : { keyManagerUserId: keyManager }),
            ...(spoc === "" ? {} : { spocUserId: spoc }),
          },
        },
      });
      if (ask !== asked.current) return;
      setAnsweredFor([client, keyManager, spoc, period].join("|"));
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      setAnswer(result.data);
      fy.current = result.data.financialYearStartMonth;
      setFyStart(result.data.financialYearStartMonth);
    })();
  }, [client, keyManager, spoc, period]);

  const clients = parties.filter((p) => !p.isOwnCompany);
  const filtered = client !== "" || keyManager !== "" || spoc !== "";

  return (
    <Stack>
      <form onSubmit={(e) => e.preventDefault()}>
        <FieldRow>
          <Field label="Key Manager">
            <Select value={keyManager} onChange={(e) => setKeyManager(e.target.value)}>
              <option value="">Everyone</option>
              {colleagues.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {colleagueLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="SPOC">
            <Select value={spoc} onChange={(e) => setSpoc(e.target.value)}>
              <option value="">Everyone</option>
              {colleagues.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {colleagueLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Client">
            <Select value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              {periodOptions(fyStart).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <Row>
          <Button
            variant="secondary"
            size="sm"
            disabled={answer === null || answer.clients.length === 0 || loading}
            onClick={() => {
              if (answer !== null) downloadCsv(`client-summary-${answer.from}-to-${answer.to}.csv`, csvRows(answer));
            }}
          >
            Download CSV
          </Button>
        </Row>
      </form>

      <ErrorNotice error={error} />

      {answer !== null && (
        <>
          {answer.currencies.map((c) => (
            <Strip key={c.currency}>
              <Stat label={`Billed${answer.currencies.length > 1 ? ` (${c.currency})` : ""}`} value={money(c.billed, c.currency)} note={invoicesNote(c.invoices)} />
              <Stat label="Received" value={money(c.received, c.currency)} {...(isZero(c.tds) ? {} : { note: `TDS ${money(c.tds, c.currency)}` })} />
              <Stat label="Pending" value={money(c.pending, c.currency)} {...(isZero(c.pending) ? {} : { tone: "warn" as const })} />
              <Stat label="Overdue" value={money(c.overdue, c.currency)} {...(isZero(c.overdue) ? {} : { tone: "danger" as const })} />
            </Strip>
          ))}
          <p className="muted">
            Billed and received from {longDay(answer.from)} to {longDay(answer.to)}. Pending is what is still owed on{" "}
            {longDay(answer.asOf)}, whenever it was billed. When one invoice covers several services, its payments are
            shared by each service&apos;s part of the invoice.
          </p>
        </>
      )}

      {answer === null ? (
        <p className="muted">{loading ? "Loading…" : ""}</p>
      ) : answer.clients.length === 0 ? (
        <Card>
          <Empty title="Nothing billed or owed" icon="invoices">
            {filtered ? "No client matches these filters in this period." : "No invoice was issued or paid in this period, and nothing is owed."}
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table aria-busy={loading}>
            <thead>
              <tr>
                <Th>Client and service</Th>
                <Th>Key Manager</Th>
                <Th>SPOC</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Received</Th>
                <Th align="right">Pending</Th>
              </tr>
            </thead>
            <tbody>
              {answer.clients.map((c) => (
                <Fragment key={c.partyId}>
                  <tr data-client={c.partyId}>
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        <strong>
                          <Link href={`/clients/${c.partyId}` as Route}>{c.name}</Link>
                        </strong>
                      </span>
                      <Sub>
                        <Link href={`/invoices?tab=work&client=${c.partyId}` as Route}>Month by month</Link>
                      </Sub>
                    </Td>
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        {c.keyManager === null ? <NotSet>No Key Manager</NotSet> : c.keyManager.name}
                      </span>
                    </Td>
                    <Td />
                    <Figures rows={c.totals} strong />
                  </tr>
                  {c.lines.map((l) => (
                    <tr key={`${l.kind}:${l.key}:${l.currency}`} data-line={l.kind}>
                      <Td style={{ paddingLeft: "var(--s-6)" }}>
                        <span className="cell-text" data-size="narrow">
                          {lineName(l)}
                        </span>
                        {lineNote(l) !== null && (
                          <span className="cell-text sub" data-size="narrow">
                            {lineNote(l)}
                          </span>
                        )}
                      </Td>
                      <Td />
                      <Td>
                        <div className="cell-text" data-size="narrow">
                          <Spocs line={l} />
                        </div>
                      </Td>
                      <Figures rows={[l]} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Stack>
  );
}

/** The three money cells, one line per currency. */
function Figures({ rows, strong = false }: { rows: readonly SummaryFigures[]; strong?: boolean }) {
  const cell = (pick: (f: SummaryFigures) => string, sub?: (f: SummaryFigures) => string | null) => (
    <Td align="right" className="nowrap">
      {rows.map((f) => (
        <div key={f.currency}>
          {strong ? <strong>{money(pick(f), f.currency)}</strong> : money(pick(f), f.currency)}
          {sub !== undefined && sub(f) !== null && <Sub>{sub(f)}</Sub>}
        </div>
      ))}
    </Td>
  );
  return (
    <>
      {cell((f) => f.billed)}
      {cell(
        (f) => f.received,
        (f) => (isZero(f.tds) ? null : `TDS ${money(f.tds, f.currency)}`),
      )}
      {cell(
        (f) => f.pending,
        (f) => (isZero(f.overdue) ? null : `${money(f.overdue, f.currency)} overdue`),
      )}
    </>
  );
}

function Spocs({ line: l }: { line: ClientSummaryLine }) {
  if (l.depts.length === 0) return null;
  const missing = l.depts.filter((d) => !l.spocs.some((s) => s.deptCode === d.code));
  return (
    <>
      {l.spocs.map((s) => (
        <span key={`${s.userId}:${s.deptCode}`} className="cell-text" data-size="narrow">
          {s.name} <span className="muted">({s.deptCode})</span>
        </span>
      ))}
      {missing.map((d) => (
        <span key={d.code} className="cell-text" data-size="narrow">
          <NotSet>No SPOC for {d.code}</NotSet>
        </span>
      ))}
    </>
  );
}

function lineName(l: ClientSummaryLine): string {
  switch (l.kind) {
    case "service":
      return l.name ?? "Service";
    case "section":
      return l.name ?? "Section";
    case "advance":
      return "Advance";
    case "other":
      return "Not linked to a service";
  }
}

function lineNote(l: ClientSummaryLine): string | null {
  switch (l.kind) {
    case "service":
      return l.depts.length === 0 ? null : l.depts.map((d) => d.name).join(", ");
    case "section":
      return l.services.length === 0 ? "One fee for several services" : `One fee for ${l.services.join(", ")}`;
    case "advance":
      return "Paid ahead, not yet set against a service";
    case "other":
      return "Raised by hand without choosing the service";
  }
}

function money(amount: string, currency: string): string {
  return formatMoney(amount, currency);
}

function isZero(amount: string): boolean {
  return /^-?0*(\.0*)?$/.test(amount.trim());
}

function invoicesNote(n: number): string {
  return n === 1 ? "1 invoice" : `${String(n)} invoices`;
}

// ── The period ──────────────────────────────────────────────────────────────

/** "Default" is the API's own: this financial year to date, else the last twelve months. */
function periodOptions(fyStart: number | null): { key: PeriodKey; label: string }[] {
  return [
    { key: "default", label: fyStart === null ? "Last 12 months" : "This financial year" },
    ...(fyStart === null ? [] : [{ key: "last_fy" as const, label: "Last financial year" }, { key: "last_12" as const, label: "Last 12 months" }]),
    { key: "this_month", label: "This month" },
    { key: "last_month", label: "Last month" },
  ];
}

function periodRange(key: PeriodKey, today: string, fyStart: number | null): { from: string; to: string } | null {
  const [y = 2026, m = 1] = today.split("-").map(Number);
  switch (key) {
    case "default":
      return null;
    case "last_12":
      return { from: monthStart(y, m - 11), to: today };
    case "this_month":
      return { from: monthStart(y, m), to: today };
    case "last_month":
      return { from: monthStart(y, m - 1), to: dayBefore(monthStart(y, m)) };
    case "last_fy": {
      if (fyStart === null) return null;
      const startYear = m >= fyStart ? y : y - 1;
      return { from: monthStart(startYear - 1, fyStart), to: dayBefore(monthStart(startYear, fyStart)) };
    }
  }
}

/** The first of a month, `month` allowed outside 1-12 (it carries into the year). */
function monthStart(year: number, month: number): string {
  const zero = year * 12 + (month - 1);
  return `${String(Math.floor(zero / 12))}-${String((zero % 12) + 1).padStart(2, "0")}-01`;
}

function dayBefore(day: string): string {
  const [y = 2026, m = 1, d = 1] = day.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return prev.toISOString().slice(0, 10);
}

// ── The CSV ─────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Client",
  "Key Manager",
  "Service",
  "Services in the section",
  "Dept",
  "SPOC",
  "Currency",
  "Billed",
  "Received",
  "TDS",
  "Pending",
  "Overdue",
  "Invoices",
] as const;

/** One line per service row of the table, amounts as plain numbers. */
export function csvRows(answer: ClientSummary): CsvCell[][] {
  const rows: CsvCell[][] = [[...CSV_HEADERS]];
  for (const c of answer.clients) {
    for (const l of c.lines) {
      rows.push([
        c.name,
        c.keyManager?.name ?? null,
        lineName(l),
        l.services.join("; ") || null,
        l.depts.map((d) => d.name).join("; ") || null,
        l.spocs.map((s) => `${s.name} (${s.deptCode})`).join("; ") || null,
        l.currency,
        { number: l.billed },
        { number: l.received },
        { number: l.tds },
        { number: l.pending },
        { number: l.overdue },
        { number: String(l.invoices) },
      ]);
    }
  }
  return rows;
}
