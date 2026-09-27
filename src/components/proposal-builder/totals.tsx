"use client";

import { formatMoney } from "@/lib/api/client";
import type { ProposalRecord } from "@/lib/api/client";
import { PER } from "./data";

/**
 * What the proposal adds up to, PER FREQUENCY (D8): "INR 50,000 / month +
 * INR 1,25,000 / year + INR 15,000 one-time". Never one mixed figure: a monthly
 * fee and a one-time fee added together is a number no client is ever billed.
 *
 * Every figure is the API's, summed by the database. This only lays them out.
 * A line with no fixed fee is counted rather than added, and a reader without
 * fee visibility (net null) sees the count of services and nothing else.
 */
export function FrequencyTotals({ record }: { record: ProposalRecord }) {
  const { totalsByFrequency, proposal } = record;
  const count = record.lines.length;
  const money: string[] = [];
  let unpriced = 0;
  for (const t of totalsByFrequency) {
    unpriced += t.unpricedLineCount;
    if (t.net === null || t.lineCount === t.unpricedLineCount) continue;
    const per = t.frequency === null ? "(how often not stated)" : PER[t.frequency];
    money.push(`${formatMoney(t.net, proposal.currency)}${per === "" ? "" : ` ${per}`}`);
  }
  if (unpriced > 0) money.push(`${String(unpriced)} with no fixed fee`);
  return (
    <span>
      <strong>
        {count} {count === 1 ? "service" : "services"}
      </strong>
      {money.length > 0 && <span className="mono text-muted"> · {money.join(" + ")}</span>}
    </span>
  );
}
