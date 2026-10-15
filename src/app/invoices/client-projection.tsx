"use client";

import Link from "next/link";
import type { Route } from "next";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type {
  ClientProjection,
  ProjectionClient,
  ProjectionLine,
  ProjectedFigures,
  ServiceAxis,
} from "@/lib/api/client";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { compareSigned } from "@/lib/money";
import { Row, Stack } from "@/components/layout";
import { Empty } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  Icon,
  NotSet,
  Notice,
  Select,
  Stat,
  Strip,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { FoldToggle, Spocs, isZero, money, plural, spocWords } from "./summary-parts";

type SortKey = "total" | "next" | "name";

/** Up to this many clients open with their services showing; more start folded. */
const OPEN_UP_TO = 6;

/**
 * COMING MONTHS: what each client's services will be billed, before tax, in
 * the rest of this month and the months after, by the month each bill falls
 * due. The API runs the billing sweep's own schedule forward; a service runs on
 * until it is ended. Bills already raised are under "So far".
 */
export function ComingMonths({
  client,
  keyManager,
  spoc,
  ahead,
  axes,
}: {
  client: string;
  keyManager: string;
  spoc: string;
  ahead: number;
  axes: readonly ServiceAxis[];
}) {
  const tableId = useId();
  const [answer, setAnswer] = useState<ClientProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("total");
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});
  const filters = [client, keyManager, spoc, String(ahead)].join("|");
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const loading = answeredFor !== filters;
  const asked = useRef(0);

  useEffect(() => {
    const ask = ++asked.current;
    void (async () => {
      const result = await api.GET("/api/v1/dashboard/client-summary/projection", {
        params: {
          query: {
            months: ahead,
            ...(client === "" ? {} : { partyId: client }),
            ...(keyManager === "" ? {} : { keyManagerUserId: keyManager }),
            ...(spoc === "" ? {} : { spocUserId: spoc }),
          },
        },
      });
      if (ask !== asked.current) return;
      setAnsweredFor([client, keyManager, spoc, String(ahead)].join("|"));
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      setAnswer(result.data);
    })();
  }, [client, keyManager, spoc, ahead]);

  const filtered = client !== "" || keyManager !== "" || spoc !== "";
  const shown = answer === null ? [] : sortClients(answer, sort);
  const isOpen = (id: string) => opened[id] ?? shown.length <= OPEN_UP_TO;
  const allOpen = shown.length > 0 && shown.every((c) => isOpen(c.partyId));
  const services = shown.reduce((n, c) => n + c.lines.length, 0);
  const months = answer?.months ?? [];
  const head = (i: number) => {
    const m = months[i];
    if (m === undefined) return "";
    const short = m.label.split(" ")[0] ?? m.label;
    return i === 0 ? `Rest of ${short}` : m.label;
  };
  const last = months[months.length - 1];

  return (
    <Stack>
      <ErrorNotice error={error} />

      {answer !== null && (
        <>
          {answer.currencies.map((c) => {
            const suffix = answer.currencies.length > 1 ? ` (${c.currency})` : "";
            return (
              <Strip key={c.currency}>
                <Stat
                  label={`${head(0)}${suffix}`}
                  value={money(c.months[0] ?? "0", c.currency)}
                  note="still to bill"
                />
                <Stat label={`${head(1)}${suffix}`} value={money(c.months[1] ?? "0", c.currency)} note="next month" />
                <Stat
                  label={`To ${last?.label ?? ""}${suffix}`}
                  value={money(c.total, c.currency)}
                  note={plural(months.length, "month")}
                />
              </Strip>
            );
          })}
          <div className="cs-period">
            <p>
              <strong>Fees before tax, by the month each bill falls due</strong>
              <span className="muted"> · A service runs on until it is ended</span>
            </p>
            <details className="disclosure cs-how">
              <summary>How this is worked out</summary>
              <ul>
                <li>
                  From each service&apos;s billing schedule, the way automatic billing raises bills. A part month is
                  charged for the days served.
                </li>
                <li>
                  A letter has no end date, so a service is counted until someone ends it. An ended or paused service
                  counts nothing after that.
                </li>
                <li>
                  Bills already raised are under So far. One-time work is billed when it is done, so it is not here.
                </li>
                <li>
                  A service with no billing dates cannot be counted: see{" "}
                  <Link href={"/invoices?tab=setup" as Route}>Billing not set up</Link>.
                </li>
              </ul>
            </details>
          </div>
          {answer.awaitingFiscalYear > 0 && (
            <Notice tone="warn">
              {plural(answer.awaitingFiscalYear, "quarterly or yearly service")} left out: set when your financial year
              starts on <Link href={"/admin/firm" as Route}>Your firm</Link>.
            </Notice>
          )}
        </>
      )}

      {answer === null ? (
        <p className="muted">{loading ? "Loading…" : ""}</p>
      ) : shown.length === 0 ? (
        <Card>
          <Empty title="Nothing to bill in these months" icon="invoices">
            {filtered
              ? "No client matches these filters."
              : "No service has a bill falling due in these months. Services with no billing dates are on Billing not set up."}
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
                  <option value="total">Most to bill first</option>
                  <option value="next">Most next month first</option>
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
                onClick={() =>
                  downloadCsv(`coming-months-${answer.today}-to-${last?.to ?? ""}.csv`, csvRows(answer, head))
                }
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
                  {months.map((m, i) => (
                    <Th key={m.key} align="right">
                      {head(i)}
                    </Th>
                  ))}
                  <Th align="right">Total</Th>
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
                          </div>
                          <span className="sub">{plural(c.lines.length, "service")}</span>
                          <span className="sub cs-narrow">
                            {c.keyManager === null ? "No Key Manager" : `KM ${c.keyManager.name}`} ·{" "}
                            {comingWords(c.totals, head(1))}
                          </span>
                        </Td>
                        <Td>
                          <span className="cell-text" data-size="narrow">
                            {c.keyManager === null ? <NotSet>No Key Manager</NotSet> : c.keyManager.name}
                          </span>
                          <span className="sub">Key Manager</span>
                        </Td>
                        <MonthCells rows={c.totals} count={months.length} strong />
                      </tr>
                      {open &&
                        c.lines.map((l) => (
                          <tr key={`${l.kind}:${l.key}:${l.currency}`} data-line={l.kind} className="cs-line">
                            <Td>
                              <span className="cell-text" data-size="narrow">
                                {l.name}
                              </span>
                              <span className="cell-text sub" data-size="narrow">
                                {l.kind === "section"
                                  ? `One fee for ${l.services.join(", ")}`
                                  : l.depts.map((d) => d.name).join(", ")}
                              </span>
                              {l.unpriced > 0 && (
                                <span className="cell-text sub" data-size="narrow">
                                  <NotSet>{plural(l.unpriced, "bill")} with no price on the letter</NotSet>
                                </span>
                              )}
                              <span className="sub cs-narrow">
                                {[spocWords(l), comingWords([l], head(1))].filter((x) => x !== null).join(" · ")}
                              </span>
                            </Td>
                            <Td>
                              <Spocs line={l} axes={axes} />
                            </Td>
                            <MonthCells rows={[l]} count={months.length} />
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
    </Stack>
  );
}

/** One cell per month and the total, one line per currency; nothing reads quiet. */
function MonthCells({
  rows,
  count,
  strong = false,
}: {
  rows: readonly ProjectedFigures[];
  count: number;
  strong?: boolean;
}) {
  const amount = (value: string, currency: string) => {
    const text = money(value, currency);
    if (isZero(value)) return <span className="muted">{text}</span>;
    return strong ? <strong>{text}</strong> : text;
  };
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Td key={i} align="right" className="nowrap">
          {rows.map((f) => (
            <div key={f.currency}>{amount(f.months[i] ?? "0", f.currency)}</div>
          ))}
        </Td>
      ))}
      <Td align="right" className="nowrap">
        {rows.map((f) => (
          <div key={f.currency}>
            <strong>{money(f.total, f.currency)}</strong>
          </div>
        ))}
      </Td>
    </>
  );
}

/** On a phone the month columns fold away; this line carries next month and the total. */
function comingWords(rows: readonly ProjectedFigures[], next: string): string {
  const any = rows.filter((f) => !isZero(f.total));
  if (any.length === 0) return "Nothing to bill";
  return any
    .map((f) => `${next} ${money(f.months[1] ?? "0", f.currency)}, total ${money(f.total, f.currency)}`)
    .join("; ");
}

function currencyOrder(answer: ClientProjection): string[] {
  const uses = new Map<string, number>();
  for (const c of answer.clients) for (const t of c.totals) uses.set(t.currency, (uses.get(t.currency) ?? 0) + 1);
  return [...uses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([cur]) => cur);
}

function sortClients(answer: ClientProjection, sort: SortKey): ProjectionClient[] {
  const byName = (a: ProjectionClient, b: ProjectionClient) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (sort === "name") return [...answer.clients].sort(byName);
  const order = currencyOrder(answer);
  const figure = (c: ProjectionClient, cur: string): string => {
    const t = c.totals.find((x) => x.currency === cur);
    return t === undefined ? "0" : sort === "next" ? (t.months[1] ?? "0") : t.total;
  };
  return [...answer.clients].sort((a, b) => {
    for (const cur of order) {
      const cmp = compareSigned(figure(b, cur), figure(a, cur)) ?? 0;
      if (cmp !== 0) return cmp;
    }
    return byName(a, b);
  });
}

/** One line per service row, the months as plain numbers. */
function csvRows(answer: ClientProjection, head: (i: number) => string): CsvCell[][] {
  const rows: CsvCell[][] = [
    [
      "Client",
      "Key Manager",
      "Service",
      "Services in the section",
      "Dept",
      "SPOC",
      "Currency",
      ...answer.months.map((_, i) => head(i)),
      "Total",
      "Bills with no price",
    ],
  ];
  for (const c of answer.clients) {
    for (const l of c.lines as readonly ProjectionLine[]) {
      rows.push([
        c.name,
        c.keyManager?.name ?? null,
        l.name,
        l.services.join("; ") || null,
        l.depts.map((d) => d.name).join("; ") || null,
        l.spocs.map((s) => `${s.name} (${s.deptCode})`).join("; ") || null,
        l.currency,
        ...l.months.map((m) => ({ number: m })),
        { number: l.total },
        { number: String(l.unpriced) },
      ]);
    }
  }
  return rows;
}
