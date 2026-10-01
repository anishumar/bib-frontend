"use client";

import { useId, useState } from "react";
import { formatMoney } from "@/lib/api/client";
import type { RevenueByManager } from "@/lib/api/client";
import { NotSet, Pill, Select } from "@/components/ui";
import { Card, Section, Table, TableWrap, Td, Th } from "@/components/tw";
import { monthYear } from "@/lib/day";
import { commonUnits, scaledUnits, sumSigned } from "@/lib/money";

type Manager = RevenueByManager["managers"][number];

/** A period the select offers: one month, the firm's financial year so far,
 *  or the whole window. */
interface Period {
  readonly key: string;
  readonly label: string;
  /** The label inside a sentence: "October 2026", "this financial year". */
  readonly inWords: string;
  readonly months: readonly string[];
}

/**
 * The periods, newest month first. "This financial year" starts at the FIRM's
 * own financial year (its compliance policy), so a firm in India gets April and
 * one in the US January; it is left out when the firm has not said, or when
 * its start is older than the window.
 */
function periodsOf(data: RevenueByManager): Period[] {
  const months = data.months;
  const current = months.at(-1);
  const out: Period[] = [...months].reverse().map((m) => {
    const name = monthYear(`${m}-01`);
    return { key: m, label: name, inWords: name, months: [m] };
  });
  const fy = data.financialYearStartMonth;
  if (current !== undefined && fy !== null) {
    const [year = 0, month = 0] = current.split("-").map(Number);
    const startYear = month >= fy ? year : year - 1;
    const start = `${String(startYear)}-${String(fy).padStart(2, "0")}`;
    if (months.includes(start)) {
      out.splice(1, 0, {
        key: "fy",
        label: "This financial year",
        inWords: "this financial year",
        months: months.filter((m) => m >= start),
      });
    }
  }
  const all = `Last ${String(months.length)} months`;
  out.push({ key: "all", label: all, inWords: all.toLowerCase().replace("last", "the last"), months });
  return out;
}

/** One row's figures for a period, summed exactly from the API's months. */
function figures(months: Manager["months"], period: Period) {
  const inPeriod = months.filter((m) => period.months.includes(m.month));
  return {
    billed: sumSigned(inPeriod.map((m) => m.billed)) ?? "0",
    collected: sumSigned(inPeriod.map((m) => m.collected)) ?? "0",
    invoices: inPeriod.reduce((n, m) => n + m.invoiceCount, 0),
  };
}

function isZero(amount: string): boolean {
  return scaledUnits(amount)?.units === BigInt(0);
}

function Money({ amount, currency }: { amount: string; currency: string }) {
  return isZero(amount) ? <NotSet>Nothing</NotSet> : <>{formatMoney(amount, currency)}</>;
}

/**
 * Revenue by manager (auto-invoice T4): whose invoices billed what, what came
 * in, and what is still owed, for the period chosen. The API's definitions:
 * BILLED before tax less credit notes (as Billing by company), COLLECTED the
 * cash that came in, with tax, OWED NOW today's balance with tax (the rows
 * "Owed to the firm" sums, so it does not move with the period). Nothing is
 * worked out here but a period's sum of the API's own months, exactly, as
 * strings.
 *
 * One row names nobody: invoices raised before managers were recorded, or
 * with none chosen. It is always last and always shown while it has a figure,
 * so the rows add up to the firm (the Total row). Biggest billed first.
 */
export function RevenueByManagerSection({ data }: { data: RevenueByManager }) {
  const periods = periodsOf(data);
  const [periodKey, setPeriodKey] = useState(periods[0]?.key ?? "all");
  const selectId = useId();
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  if (period === undefined) return null;
  const cur = data.reportingCurrency;

  const rows = data.managers
    .map((m) => ({ manager: m, ...figures(m.months, period) }))
    // A row with nothing in the period and nothing owed is noise.
    .filter((r) => !isZero(r.billed) || !isZero(r.collected) || r.invoices > 0 || !isZero(r.manager.outstanding));
  const named = rows.filter((r) => r.manager.userId !== null);
  const nobody = rows.find((r) => r.manager.userId === null);
  const billedUnits = commonUnits(named.map((r) => r.billed));
  const order = named.map((r, i) => ({ r, units: billedUnits?.units[i] ?? BigInt(0) }));
  order.sort((a, b) =>
    a.units === b.units
      ? (a.r.manager.name ?? "").localeCompare(b.r.manager.name ?? "", "en", { sensitivity: "base" })
      : a.units > b.units
        ? -1
        : 1,
  );
  const shown = [...order.map((o) => o.r), ...(nobody === undefined ? [] : [nobody])];
  const total = figures(data.total.months, period);

  return (
    <Section
      title="Revenue by manager"
      level={2}
      actions={
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm text-muted">
            Period
          </label>
          <Select
            id={selectId}
            size="sm"
            value={period.key}
            onChange={(e) => {
              setPeriodKey(e.target.value);
            }}
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      <Card className="flex flex-col gap-3">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">Nothing to show for {period.inWords}.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Billed is before tax, less credit notes. Collected and owed include tax.</p>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Manager</Th>
                    <Th align="right">Billed</Th>
                    <Th align="right">Collected</Th>
                    <Th align="right">Owed now</Th>
                    <Th align="right">Invoices</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.manager.userId ?? "nobody"}>
                      <Td>
                        <ManagerName manager={r.manager} />
                      </Td>
                      <Td align="right" className="nowrap">
                        <Money amount={r.billed} currency={cur} />
                      </Td>
                      <Td align="right" className="nowrap">
                        <Money amount={r.collected} currency={cur} />
                      </Td>
                      <Td align="right" className="nowrap">
                        <Money amount={r.manager.outstanding} currency={cur} />
                      </Td>
                      <Td align="right">{r.invoices}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <Td className="font-semibold">Total</Td>
                    <Td align="right" className="nowrap font-semibold">
                      {formatMoney(total.billed, cur)}
                    </Td>
                    <Td align="right" className="nowrap font-semibold">
                      {formatMoney(total.collected, cur)}
                    </Td>
                    <Td align="right" className="nowrap font-semibold">
                      {formatMoney(data.total.outstanding, cur)}
                    </Td>
                    <Td align="right" className="font-semibold">
                      {total.invoices}
                    </Td>
                  </tr>
                </tfoot>
              </Table>
            </TableWrap>
          </>
        )}
      </Card>
    </Section>
  );
}

function ManagerName({ manager }: { manager: Manager }) {
  if (manager.userId === null) return <NotSet>No manager</NotSet>;
  if (manager.name === null) return <NotSet>Not on your staff</NotSet>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {manager.name}
      {!manager.activeStaff && <Pill tone="quiet">Left</Pill>}
    </span>
  );
}
