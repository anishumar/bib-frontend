"use client";

import { useEffect, useId, useState } from "react";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { RevenueReport } from "@/lib/api/client";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { longDay } from "@/lib/day";
import { scaledUnits } from "@/lib/money";
import { Button, ErrorNotice, Input, NotSet, Pill, Select } from "@/components/ui";
import { Card, Section, Table, TableWrap, Td, Th } from "@/components/tw";

type By = "manager" | "originator";
type Row = RevenueReport["rows"][number];

/**
 * THE REVENUE REPORT (Q049; Ashish: "how is revenue captured manager-wise or
 * salesperson-wise?"). Invoiced, collected and outstanding for a period, by
 * MANAGER (the invoice's, fixed when it is issued) or by ORIGINATOR (who won
 * the letter the work was billed under, set on the letter).
 *
 * ONE TABLE PER CURRENCY, never one figure across two: a manager with INR and
 * AED invoices has a row in each, and each currency has its own total. Nothing
 * is converted here or by the API. The definitions are the API's, said once
 * above the tables. A Download CSV gives the same rows to Excel.
 *
 * The firm's numbers are behind the fee axis as a whole, so a login that may
 * not see fees never reaches this section (the page says why).
 */
export function RevenueReportSection({
  companies,
}: {
  /** The firm's own companies, for "Company". */
  companies: readonly { readonly id: string; readonly name: string }[];
}) {
  const [by, setBy] = useState<By>("manager");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [company, setCompany] = useState("");
  const [currency, setCurrency] = useState("");
  const [answer, setAnswer] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = { by: useId(), from: useId(), to: useId(), company: useId(), currency: useId() };

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await api.GET("/api/v1/dashboard/revenue/report", {
        params: {
          query: {
            by,
            ...(from === "" ? {} : { from }),
            ...(to === "" ? {} : { to }),
            ...(company === "" ? {} : { issuerPartyId: company }),
            ...(currency === "" ? {} : { currency }),
          },
        },
      });
      if (!live) return;
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      setAnswer(result.data);
    })();
    return () => {
      live = false;
    };
  }, [by, from, to, company, currency]);

  const who = by === "manager" ? "Manager" : "Originator";
  const currencies = answer?.currencies ?? [];
  // The currency select offers what the period holds, and keeps a choice made.
  const offered = [...new Set([...currencies.map((c) => c.currency), ...(currency === "" ? [] : [currency])])].sort();

  return (
    <Section
      title="Revenue report"
      level={2}
      lede={
        answer === null
          ? undefined
          : `${longDay(answer.from)} to ${longDay(answer.to)}. Invoiced is before tax, less credit notes. Collected is money received, with tax. Outstanding is owed at the close of ${longDay(answer.asOf)}.`
      }
      actions={
        answer !== null && currencies.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              downloadCsv(csvName(answer), csvRows(answer));
            }}
          >
            Download CSV
          </Button>
        ) : undefined
      }
    >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Labelled id={ids.by} label="By">
            <Select id={ids.by} size="sm" className="min-w-[17rem]" value={by} onChange={(e) => setBy(e.target.value === "originator" ? "originator" : "manager")}>
              <option value="manager">Manager</option>
              <option value="originator">Originator (who won the work)</option>
            </Select>
          </Labelled>
          <Labelled id={ids.from} label="From">
            <Input id={ids.from} size="sm" type="date" value={from || (answer?.from ?? "")} onChange={(e) => setFrom(e.target.value)} />
          </Labelled>
          <Labelled id={ids.to} label="To">
            <Input id={ids.to} size="sm" type="date" value={to || (answer?.to ?? "")} onChange={(e) => setTo(e.target.value)} />
          </Labelled>
          <Labelled id={ids.company} label="Company">
            <Select id={ids.company} size="sm" className="min-w-[11rem]" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Labelled>
          <Labelled id={ids.currency} label="Currency">
            <Select id={ids.currency} size="sm" className="min-w-[11rem]" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">Every currency</option>
              {offered.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Labelled>
        </div>
        <ErrorNotice error={error} />
        {answer !== null && currencies.length === 0 && (
          <p className="text-sm text-muted">Nothing invoiced, collected or owed for this period.</p>
        )}
        {answer !== null &&
          currencies.map((c) => {
            const rows = answer.rows.filter((r) => r.currency === c.currency);
            return (
              <TableWrap key={c.currency}>
                <Table>
                  <caption className="text-left text-sm font-semibold">{c.currency}</caption>
                  <thead>
                    <tr>
                      <Th>{who}</Th>
                      <Th align="right">Invoiced</Th>
                      <Th align="right">Collected</Th>
                      <Th align="right">Outstanding</Th>
                      <Th align="right">Invoices</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.userId ?? "nobody"}:${r.currency}`}>
                        <Td>
                          <Person row={r} by={by} />
                        </Td>
                        <Td align="right" className="nowrap">
                          <Money amount={r.invoiced} currency={r.currency} />
                        </Td>
                        <Td align="right" className="nowrap">
                          <Money amount={r.collected} currency={r.currency} />
                        </Td>
                        <Td align="right" className="nowrap">
                          <Money amount={r.outstanding} currency={r.currency} />
                        </Td>
                        <Td align="right">{r.invoices}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <Td className="font-semibold">Total in {c.currency}</Td>
                      <Td align="right" className="nowrap font-semibold">
                        <Money amount={c.invoiced} currency={c.currency} />
                      </Td>
                      <Td align="right" className="nowrap font-semibold">
                        <Money amount={c.collected} currency={c.currency} />
                      </Td>
                      <Td align="right" className="nowrap font-semibold">
                        <Money amount={c.outstanding} currency={c.currency} />
                      </Td>
                      <Td align="right" className="font-semibold">
                        {c.invoices}
                      </Td>
                    </tr>
                  </tfoot>
                </Table>
              </TableWrap>
            );
          })}
      </Card>
    </Section>
  );
}

function Labelled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const NO_MANAGER = "No manager yet (incl. advances not adjusted)";

function isZero(amount: string): boolean {
  return scaledUnits(amount)?.units === BigInt(0);
}

function Money({ amount, currency }: { amount: string; currency: string }) {
  return isZero(amount) ? <NotSet>Nothing</NotSet> : <>{formatMoney(amount, currency)}</>;
}

function Person({ row, by }: { row: Row; by: By }) {
  // Q085 (0376): an advance is nobody's revenue until a bill takes it, so the
  // manager view's "nobody" row is mostly advances still to be adjusted.
  if (row.userId === null)
    return <NotSet>{by === "manager" ? NO_MANAGER : "No originator"}</NotSet>;
  if (row.name === null) return <NotSet>Not on your staff</NotSet>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {row.name}
      {!row.activeStaff && <Pill tone="quiet">Left</Pill>}
    </span>
  );
}

/** The rows as the tables show them, one per person and currency, then each
 *  currency's total; amounts as the API's decimal strings. */
export function csvRows(answer: RevenueReport): CsvCell[][] {
  const who = answer.by === "manager" ? "Manager" : "Originator";
  const out: CsvCell[][] = [[who, "Currency", "Invoiced", "Collected", "Outstanding", "Invoices"]];
  for (const c of answer.currencies) {
    for (const r of answer.rows.filter((x) => x.currency === c.currency)) {
      out.push([
        r.userId === null ? (answer.by === "manager" ? NO_MANAGER : "No originator") : (r.name ?? "Not on your staff"),
        r.currency,
        { number: r.invoiced },
        { number: r.collected },
        { number: r.outstanding },
        { number: String(r.invoices) },
      ]);
    }
    out.push([
      `Total in ${c.currency}`,
      c.currency,
      { number: c.invoiced },
      { number: c.collected },
      { number: c.outstanding },
      { number: String(c.invoices) },
    ]);
  }
  return out;
}

/** `revenue-by-originator-2026-04-01-to-2026-10-05.csv`. */
function csvName(answer: RevenueReport): string {
  return `revenue-by-${answer.by}-${answer.from}-to-${answer.to}.csv`;
}
