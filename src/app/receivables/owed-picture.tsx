"use client";

import { useId, useState } from "react";
import { AGEING_LABELS, formatMoney } from "@/lib/api/client";
import type { Receivable } from "@/lib/api/client";
import { Grid, Stack } from "@/components/layout";
import {
  BarChart,
  Card,
  CardTitle,
  Stat,
  Strip,
  TabPanel,
  Tabs,
  axisMoney,
  type BarDatum,
} from "@/components/ui";
import { addDecimals, commonUnits } from "@/lib/money";
import { daysBefore } from "@/lib/day";

/** The dashboard's buckets (`crm.receivable_ageing`, 0038), in its order and
 *  with its words, so the two screens cut lateness the same way. */
const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus", "no_due_date"] as const;
type Bucket = (typeof BUCKETS)[number];

function bucketOf(dueOn: string | null, today: string): Bucket {
  if (dueOn === null) return "no_due_date";
  const late = daysBefore(dueOn, today);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "d90_plus";
}

function invoices(n: number): string {
  return `${String(n)} invoice${n === 1 ? "" : "s"}`;
}

/** The rows' outstanding amounts added up exactly, as strings. */
function sum(rows: readonly Owed[]): string {
  return addDecimals(rows.map((r) => r.outstanding)) ?? "0";
}

interface Owed {
  readonly partyId: string;
  readonly client: string;
  readonly outstanding: string;
  readonly dueOn: string | null;
}

/** Largest first, compared on `bigint`, never as JS numbers. */
function byAmountDesc<T extends { amount: string }>(items: readonly T[]): T[] {
  const common = commonUnits(items.map((i) => i.amount));
  if (common === null) return [...items];
  return items
    .map((item, i) => ({ item, units: common.units[i] ?? BigInt(0) }))
    .sort((a, b) => (a.units === b.units ? 0 : a.units > b.units ? -1 : 1))
    .map((x) => x.item);
}

/** How many clients get a bar of their own before the rest are one. */
const TOP_CLIENTS = 6;

function Picture({ rows, currency, today }: { rows: readonly Owed[]; currency: string; today: string }) {
  const total = sum(rows);
  const late = rows.filter((r) => r.dueOn !== null && daysBefore(r.dueOn, today) > 0);
  const overdue = sum(late);

  const ageing: BarDatum[] = BUCKETS.map((bucket) => {
    const inIt = rows.filter((r) => bucketOf(r.dueOn, today) === bucket);
    const amount = sum(inIt);
    return {
      key: bucket,
      label: AGEING_LABELS[bucket] ?? bucket,
      value: amount,
      text: formatMoney(amount, currency),
      detail: invoices(inIt.length),
      tone: bucket === "current" || bucket === "no_due_date" ? "muted" : "danger",
    };
  });

  const clients = byAmountDesc(
    [...new Set(rows.map((r) => r.partyId))].map((partyId) => {
      const theirs = rows.filter((r) => r.partyId === partyId);
      return {
        partyId,
        name: theirs[0]?.client ?? "",
        amount: sum(theirs),
        count: theirs.length,
      };
    }),
  );
  // The top six and then everyone else as one bar, unless "everyone else"
  // would be a single client, who is then shown by name.
  const shown = clients.length > TOP_CLIENTS + 1 ? clients.slice(0, TOP_CLIENTS) : clients;
  const rest = clients.slice(shown.length);
  const owers: BarDatum[] = shown.map((c) => ({
    key: c.partyId,
    label: c.name,
    value: c.amount,
    text: formatMoney(c.amount, currency),
    detail: invoices(c.count),
  }));
  if (rest.length > 0) {
    const amount = addDecimals(rest.map((c) => c.amount)) ?? "0";
    owers.push({
      key: "everyone-else",
      label: "Everyone else",
      value: amount,
      text: formatMoney(amount, currency),
      detail: invoices(rest.reduce((n, c) => n + c.count, 0)),
    });
  }

  // One stack with the page's own gap, so the strip and the charts sit the
  // same distance apart inside a currency's tab panel as on the page.
  return (
    <Stack gap="loose">
      <Strip>
        <Stat
          label="Outstanding"
          value={formatMoney(total, currency)}
          figure={{ amount: total, currency }}
          note={invoices(rows.length)}
        />
        <Stat
          label="Overdue"
          value={formatMoney(overdue, currency)}
          figure={{ amount: overdue, currency }}
          note={invoices(late.length)}
          {...(late.length > 0 ? { tone: "danger" as const } : {})}
        />
      </Strip>
      <Grid>
        <Card>
          <CardTitle level={2}>How late the money is</CardTitle>
          <BarChart
            label="How late the money is"
            data={ageing}
            tickText={(v) => axisMoney(v, currency)}
            columns={["How overdue", "Amount", "Invoices"]}
            legend={[
              { tone: "muted", label: "Not overdue" },
              { tone: "danger", label: "Overdue" },
            ]}
          />
        </Card>
        <Card>
          <CardTitle level={2}>Who owes it</CardTitle>
          <BarChart
            label="Who owes it"
            orientation="horizontal"
            data={owers}
            columns={["Client", "Outstanding", "Invoices"]}
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/**
 * What is owed, as two figures and two charts, above the lists (Wave 5).
 *
 * Built from the SAME rows the Outstanding table below shows: no second API
 * call, so the picture and the table cannot disagree. Every sum is exact
 * (`addDecimals`, strings); the bars are drawn from per-mille proportions on
 * `bigint`; every amount printed is `formatMoney`. Lateness counts from the
 * READER's calendar day (`browserDay`), as the Overdue marks in the table do.
 *
 * AMOUNTS IN DIFFERENT CURRENCIES ARE NEVER ADDED TOGETHER. The rows carry no
 * rate to a common currency, so a firm owed rupees and dirhams sees one
 * picture per currency, chosen with a tab, and never a total that is neither.
 *
 * Nothing at all when nothing is owed (the Outstanding section says so), or
 * when the amounts are hidden from this login (the fee axis): a chart of
 * hidden amounts would be a chart of nothing.
 */
export function OwedPicture({ owing, today }: { owing: readonly Receivable[]; today: string }) {
  const tabs = useId();
  const byCurrency = new Map<string, Owed[]>();
  let hidden = false;
  for (const r of owing) {
    if (r.balance.outstanding === null) {
      hidden = true;
      continue;
    }
    const list = byCurrency.get(r.balance.currency) ?? [];
    list.push({
      partyId: r.party.id,
      client: r.party.displayName,
      outstanding: r.balance.outstanding,
      dueOn: r.balance.dueOn,
    });
    byCurrency.set(r.balance.currency, list);
  }
  // Most invoices first: the currency the firm mostly bills in leads.
  const currencies = [...byCurrency.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([c]) => c);
  const [picked, setPicked] = useState<string | null>(null);

  if (hidden || currencies.length === 0) return null;
  const current = picked !== null && byCurrency.has(picked) ? picked : (currencies[0] ?? "");
  const rows = byCurrency.get(current) ?? [];

  if (currencies.length === 1) return <Picture rows={rows} currency={current} today={today} />;
  return (
    <>
      <Tabs
        id={tabs}
        label="Currency"
        value={current}
        onChange={setPicked}
        tabs={currencies.map((c) => ({ value: c, label: c }))}
      />
      <TabPanel tabsId={tabs} value={current}>
        <Picture key={current} rows={rows} currency={current} today={today} />
      </TabPanel>
    </>
  );
}
