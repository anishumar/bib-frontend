"use client";

import Link from "next/link";
import type { Route } from "next";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import type {
  ClientSummary,
  ClientSummaryClient,
  ClientSummaryLine,
  Colleague,
  PartySummary,
  ServiceAxis,
  SummaryFigures,
} from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { compareSigned } from "@/lib/money";
import { Row, Stack } from "@/components/layout";
import { Empty } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  Field,
  FieldRow,
  Icon,
  NotSet,
  Pill,
  Select,
  Stat,
  Strip,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { ComingMonths } from "./client-projection";
import { FoldToggle, Spocs, isZero, money, plural, spocWords } from "./summary-parts";

type PeriodKey = "default" | "last_fy" | "last_12" | "this_month" | "last_month";
type SortKey = "overdue" | "pending" | "billed" | "name";
type View = "so_far" | "coming";

/** Up to this many clients open with their services showing; more start folded. */
const OPEN_UP_TO = 6;

/**
 * CLIENT SUMMARY: per client and per service, what was billed, what came in and
 * what is still owed, beside the client's Key Manager and the SPOC of each
 * service's Dept. The API adds it up (one invoice for several services is split
 * by each one's share); this file filters, orders and words it. Only offered to
 * a login that sees fees.
 */
export function ClientSummaryTab({
  parties,
  colleagues,
}: {
  parties: readonly PartySummary[];
  colleagues: readonly Colleague[];
}) {
  const tableId = useId();
  const [client, setClient] = useState("");
  const [keyManager, setKeyManager] = useState("");
  const [spoc, setSpoc] = useState("");
  // The view is in the URL (`?view=coming`), so a link can open the projection.
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const view: View = search.get("view") === "coming" ? "coming" : "so_far";
  const showView = (next: View) => {
    const q = new URLSearchParams(search.toString());
    if (next === "coming") q.set("view", "coming");
    else q.delete("view");
    router.replace(`${pathname}?${q.toString()}` as Route, { scroll: false });
  };
  const [ahead, setAhead] = useState(3);
  const [period, setPeriod] = useState<PeriodKey>("default");
  const [sort, setSort] = useState<SortKey>("overdue");
  /** Clients opened or folded by hand; the rest follow `OPEN_UP_TO`. */
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});
  /** The firm's financial year, once the API has said; the periods need it. */
  const [fyStart, setFyStart] = useState<number | null>(null);
  const fy = useRef<number | null>(null);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [answer, setAnswer] = useState<ClientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The filters the shown answer is for: loading while they differ from now. */
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const filters = [client, keyManager, spoc, period].join("|");
  const loading = answeredFor !== filters;
  /** The latest ask, so a slow answer to an earlier filter cannot land last. */
  const asked = useRef(0);

  useEffect(() => {
    void (async () => {
      const result = await api.GET("/api/v1/tenancy/axes", {});
      if (result.data) setAxes([...result.data.axes]);
    })();
  }, []);

  useEffect(() => {
    if (view !== "so_far") return;
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
  }, [client, keyManager, spoc, period, view]);

  const clients = parties.filter((p) => !p.isOwnCompany);
  const filtered = client !== "" || keyManager !== "" || spoc !== "";
  const shown = answer === null ? [] : sortClients(answer, sort);
  const isOpen = (id: string) => opened[id] ?? shown.length <= OPEN_UP_TO;
  const allOpen = shown.length > 0 && shown.every((c) => isOpen(c.partyId));
  const services = shown.reduce((n, c) => n + c.lines.length, 0);

  return (
    <Stack>
      <div className="cs-views" role="group" aria-label="What to show">
        <button type="button" aria-pressed={view === "so_far"} onClick={() => showView("so_far")}>
          So far
        </button>
        <button type="button" aria-pressed={view === "coming"} onClick={() => showView("coming")}>
          Coming months
        </button>
      </div>
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
          {view === "so_far" ? (
            <Field label="Period">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
                {periodOptions(fyStart).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Months ahead">
              <Select value={String(ahead)} onChange={(e) => setAhead(Number(e.target.value))}>
                <option value="3">This month and the next 3</option>
                <option value="6">This month and the next 6</option>
              </Select>
            </Field>
          )}
        </FieldRow>
      </form>

      {view === "coming" ? (
        <ComingMonths client={client} keyManager={keyManager} spoc={spoc} ahead={ahead} axes={axes} />
      ) : (
        <>
          <ErrorNotice error={error} />

          {answer !== null && (
            <>
              {answer.currencies.map((c) => {
                const owing = clientsWith(answer, c.currency, (f) => f.pending);
                const late = clientsWith(answer, c.currency, (f) => f.overdue);
                const suffix = answer.currencies.length > 1 ? ` (${c.currency})` : "";
                return (
                  <Strip key={c.currency}>
                    <Stat
                      label={`Billed${suffix}`}
                      value={money(c.billed, c.currency)}
                      note={plural(c.invoices, "invoice")}
                    />
                    <Stat
                      label={`Received${suffix}`}
                      value={money(c.received, c.currency)}
                      {...(isZero(c.tds) ? {} : { note: `TDS ${money(c.tds, c.currency)}` })}
                    />
                    <Stat
                      label={`Pending${suffix}`}
                      value={money(c.pending, c.currency)}
                      {...(owing === 0 ? {} : { note: plural(owing, "client"), tone: "warn" as const })}
                    />
                    <Stat
                      label={`Overdue${suffix}`}
                      value={money(c.overdue, c.currency)}
                      {...(late === 0 ? {} : { note: plural(late, "client"), tone: "danger" as const })}
                    />
                  </Strip>
                );
              })}
              <div className="cs-period">
                <p>
                  <strong>
                    {longDay(answer.from)} to {longDay(answer.to)}
                  </strong>
                  <span className="muted"> · Pending as on {longDay(answer.asOf)}</span>
                </p>
                <details className="disclosure cs-how">
                  <summary>How these figures are counted</summary>
                  <ul>
                    <li>Billed and Received are for the period. Billed includes tax, less credit notes.</li>
                    <li>Pending is everything still owed on {longDay(answer.asOf)}, whenever it was billed.</li>
                    <li>
                      When one invoice covers several services, its payments are shared by each service&apos;s part of
                      it.
                    </li>
                    <li>Work not yet billed is on Work vs Billing.</li>
                  </ul>
                </details>
              </div>
            </>
          )}

          {answer === null ? (
            <p className="muted">{loading ? "Loading…" : ""}</p>
          ) : shown.length === 0 ? (
            <Card>
              <Empty title="Nothing billed or owed" icon="invoices">
                {filtered
                  ? "No client matches these filters in this period."
                  : "No invoice was issued or paid in this period, and nothing is owed."}
              </Empty>
            </Card>
          ) : (
            <Stack>
              <Row className="cs-toolbar">
                <span className="muted">
                  {plural(shown.length, "client")}, {plural(services, "service")}
                </span>
                <div className="cluster">
                  <label className="cs-sort">
                    <span>Sort</span>
                    <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                      <option value="overdue">Most overdue first</option>
                      <option value="pending">Most pending first</option>
                      <option value="billed">Most billed first</option>
                      <option value="name">Name, A to Z</option>
                    </Select>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-controls={tableId}
                    onClick={() => setOpened(Object.fromEntries(shown.map((c) => [c.partyId, !allOpen])))}
                  >
                    {allOpen ? "Fold all" : "Show all services"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Icon name="download" size={16} />}
                    disabled={loading}
                    onClick={() => downloadCsv(`client-summary-${answer.from}-to-${answer.to}.csv`, csvRows(answer))}
                  >
                    Download CSV
                  </Button>
                </div>
              </Row>
              <TableWrap>
                <Table id={tableId} aria-busy={loading} className="cs-table">
                  <thead>
                    <tr>
                      <Th>Client and service</Th>
                      <Th>Key Manager / SPOC</Th>
                      <Th align="right">Billed</Th>
                      <Th align="right">Received</Th>
                      <Th align="right">Pending</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => {
                      const open = isOpen(c.partyId);
                      return (
                        <Fragment key={c.partyId}>
                          <tr data-client={c.partyId}>
                            <Td>
                              <div className="cs-client">
                                <FoldToggle
                                  open={open}
                                  client={c.name}
                                  onToggle={() => setOpened((o) => ({ ...o, [c.partyId]: !open }))}
                                />
                                <span className="cell-text" data-size="narrow">
                                  <Link href={`/clients/${c.partyId}` as Route}>{c.name}</Link>
                                </span>
                                <ClientState client={c} />
                              </div>
                              <span className="sub">
                                {plural(c.lines.length, "service")} ·{" "}
                                <Link href={`/invoices?tab=work&client=${c.partyId}` as Route}>Month by month</Link>
                              </span>
                              <span className="sub cs-narrow">
                                {c.keyManager === null ? "No Key Manager" : `KM ${c.keyManager.name}`} ·{" "}
                                {owedWords(c.totals)}
                              </span>
                            </Td>
                            <Td>
                              <span className="cell-text" data-size="narrow">
                                {c.keyManager === null ? <NotSet>No Key Manager</NotSet> : c.keyManager.name}
                              </span>
                              <span className="sub">Key Manager</span>
                            </Td>
                            <Figures rows={c.totals} strong />
                          </tr>
                          {open &&
                            c.lines.map((l) => (
                              <tr key={`${l.kind}:${l.key}:${l.currency}`} data-line={l.kind} className="cs-line">
                                <Td>
                                  <span className="cell-text" data-size="narrow">
                                    {lineName(l)}
                                  </span>
                                  {lineNote(l) !== null && (
                                    <span className="cell-text sub" data-size="narrow">
                                      {lineNote(l)}
                                    </span>
                                  )}
                                  <span className="sub cs-narrow">
                                    {[spocWords(l), owedWords([l])].filter((x) => x !== null).join(" · ")}
                                  </span>
                                </Td>
                                <Td>
                                  <Spocs line={l} axes={axes} />
                                </Td>
                                <Figures rows={[l]} />
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

/** Where the client stands, in a word and a colour: never the colour alone. */
function ClientState({ client: c }: { client: ClientSummaryClient }) {
  if (c.totals.some((t) => !isZero(t.overdue))) {
    return (
      <Pill dot tone="danger">
        Overdue
      </Pill>
    );
  }
  if (c.totals.some((t) => !isZero(t.pending))) {
    return (
      <Pill dot tone="warn">
        Pending
      </Pill>
    );
  }
  return (
    <Pill dot tone="ok">
      Paid up
    </Pill>
  );
}

/** The three money cells, one line per currency; nothing owed reads quiet. */
function Figures({ rows, strong = false }: { rows: readonly SummaryFigures[]; strong?: boolean }) {
  const amount = (value: string, currency: string) => {
    const text = money(value, currency);
    if (isZero(value)) return <span className="muted">{text}</span>;
    return strong ? <strong>{text}</strong> : text;
  };
  return (
    <>
      <Td align="right" className="nowrap">
        {rows.map((f) => (
          <div key={f.currency}>{amount(f.billed, f.currency)}</div>
        ))}
      </Td>
      <Td align="right" className="nowrap">
        {rows.map((f) => (
          <div key={f.currency}>
            {amount(f.received, f.currency)}
            {!isZero(f.tds) && <span className="sub">TDS {money(f.tds, f.currency)}</span>}
          </div>
        ))}
      </Td>
      <Td align="right" className="nowrap">
        {rows.map((f) => (
          <div key={f.currency}>
            {amount(f.pending, f.currency)}
            {!isZero(f.overdue) && (
              <span className="sub tone-danger">
                <Icon name="alert" size={14} /> {money(f.overdue, f.currency)} overdue
              </span>
            )}
          </div>
        ))}
      </Td>
    </>
  );
}

/** On a phone the figure columns fold away; this line carries what is owed. */
function owedWords(rows: readonly SummaryFigures[]): string {
  const owed = rows.filter((f) => !isZero(f.pending));
  if (owed.length === 0) return "Nothing pending";
  return owed
    .map(
      (f) =>
        `Pending ${money(f.pending, f.currency)}${isZero(f.overdue) ? "" : `, ${money(f.overdue, f.currency)} overdue`}`,
    )
    .join("; ");
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

// ── Order ───────────────────────────────────────────────────────────────────

/** The currencies by how many clients use them, so the order follows the main one. */
function currencyOrder(answer: ClientSummary): string[] {
  const uses = new Map<string, number>();
  for (const c of answer.clients) for (const t of c.totals) uses.set(t.currency, (uses.get(t.currency) ?? 0) + 1);
  return [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([cur]) => cur);
}

function sortClients(answer: ClientSummary, sort: SortKey): ClientSummaryClient[] {
  const byName = (a: ClientSummaryClient, b: ClientSummaryClient) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (sort === "name") return [...answer.clients].sort(byName);
  const order = currencyOrder(answer);
  const figure = (c: ClientSummaryClient, cur: string, key: "overdue" | "pending" | "billed"): string =>
    c.totals.find((x) => x.currency === cur)?.[key] ?? "0";
  // Ties on overdue go to what is pending, then to the name.
  const keys: ("overdue" | "pending" | "billed")[] = sort === "overdue" ? ["overdue", "pending"] : [sort];
  return [...answer.clients].sort((a, b) => {
    for (const key of keys) {
      for (const cur of order) {
        const cmp = compareSigned(figure(b, cur, key), figure(a, cur, key)) ?? 0;
        if (cmp !== 0) return cmp;
      }
    }
    return byName(a, b);
  });
}

function clientsWith(answer: ClientSummary, currency: string, pick: (f: SummaryFigures) => string): number {
  return answer.clients.filter((c) => c.totals.some((t) => t.currency === currency && !isZero(pick(t)))).length;
}

// ── The period ──────────────────────────────────────────────────────────────

/** "Default" is the API's own: this financial year to date, else the last twelve months. */
function periodOptions(fyStart: number | null): { key: PeriodKey; label: string }[] {
  return [
    { key: "default", label: fyStart === null ? "Last 12 months" : "This financial year" },
    ...(fyStart === null
      ? []
      : [
          { key: "last_fy" as const, label: "Last financial year" },
          { key: "last_12" as const, label: "Last 12 months" },
        ]),
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
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
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
