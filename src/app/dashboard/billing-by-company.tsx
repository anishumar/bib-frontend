"use client";

import { formatMoney } from "@/lib/api/client";
import type { RevenueByCompany } from "@/lib/api/client";
import { Grid } from "@/components/layout";
import { AreaChart, Pill, axisMoney, type AreaPoint } from "@/components/ui";
import { Card, Section, Stat } from "@/components/tw";
import { monthYear } from "@/lib/day";
import { sumSigned } from "@/lib/money";

/** A series needs two months with invoices before it is a line at all. */
const ENOUGH = 2;

function points(
  months: readonly { month: string; value: string }[],
  currency: string,
): AreaPoint[] {
  return months.map((m) => {
    const name = monthYear(`${m.month}-01`);
    return {
      key: m.month,
      label: name,
      tick: name.slice(0, 3),
      value: m.value,
      text: formatMoney(m.value, currency),
    };
  });
}

function period(count: number): string {
  return `Last ${String(count)} months`;
}

function Series({
  title,
  code,
  currency,
  months,
  invoiced,
  height,
  aside,
}: {
  title: string;
  code?: string | null;
  currency: string;
  months: readonly { month: string; value: string }[];
  /** Months that had an invoice. */
  invoiced: number;
  height: number;
  aside?: string;
}) {
  const total = sumSigned(months.map((m) => m.value));
  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-lg font-semibold text-ink">{title}</h3>
        {code !== undefined && code !== null && <Pill tone="code">{code}</Pill>}
      </div>
      {invoiced < ENOUGH || total === null ? (
        <p className="text-sm text-muted">Charts appear once two months have invoices.</p>
      ) : (
        <>
          <Stat
            label={period(months.length)}
            value={formatMoney(total, currency)}
            figure={{ amount: total, currency }}
            {...(aside === undefined ? {} : { note: aside })}
          />
          <AreaChart
            label={title}
            points={points(months, currency)}
            tickText={(v) => axisMoney(v, currency)}
            height={height}
            columns={["Month", "Billed"]}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Billing by company (Wave 5): what each of the firm's companies billed, month
 * by month, as small area charts side by side. SMALL MULTIPLES, not four lines
 * on one chart: the companies bill in different currencies and cannot share an
 * axis, and four hues on one chart failed a colour-blind check. Each card is
 * one series in `--chart-1`, named by its title.
 *
 * Billed is the API's definition (issued invoices, before tax, less credit
 * notes, by issue month in the firm's calendar); nothing is added up here but
 * a card's own months, exactly, as strings. The whole-firm card uses the API's
 * own per-month total in the reporting currency, every document at its stored
 * rate.
 */
export function BillingByCompany({ data }: { data: RevenueByCompany }) {
  const cur = data.reportingCurrency;
  const firmMonths = data.total.filter((t) => t.invoiceCount > 0).length;
  return (
    <Section title="Billing by company" level={2}>
      {data.companies.length > 1 && (
        <Series
          title={`All companies, in ${cur}`}
          currency={cur}
          months={data.total.map((t) => ({ month: t.month, value: t.billedReporting }))}
          invoiced={firmMonths}
          height={200}
        />
      )}
      <Grid min="narrow">
        {data.companies.map((c) => (
          <Series
            key={c.partyId}
            title={c.name}
            code={c.jurisdiction}
            currency={c.currency}
            months={c.months.map((m) => ({ month: m.month, value: m.billed }))}
            invoiced={c.months.filter((m) => m.invoiceCount > 0).length}
            height={160}
            {...(c.otherCurrencyInvoices > 0
              ? {
                  aside: `${String(c.otherCurrencyInvoices)} invoice${c.otherCurrencyInvoices === 1 ? "" : "s"} in another currency not shown`,
                }
              : {})}
          />
        ))}
      </Grid>
    </Section>
  );
}
