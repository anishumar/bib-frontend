"use client";

import type { ProposalRecord } from "@/lib/api/client";
import { totalWords } from "@/components/proposal-document";

/**
 * What the proposal adds up to, PER FREQUENCY (D8), in the sticky footer:
 * "3 services · AED 4,000 Monthly + AED 2,500 Quarterly + AED 3,500 One-time".
 * Never one mixed figure: a monthly fee and a one-time fee added together is a
 * number no client is ever billed.
 *
 * The sentence is `totalWords`, the one the document's Summary of Fees ends
 * with and the PDF prints, so the footer and the paper cannot disagree. Every
 * figure in it was summed by the database. A reader without fee visibility
 * sees the count of services and nothing else.
 */
export function FrequencyTotals({ record }: { record: ProposalRecord }) {
  const count = record.lines.length;
  const { sentence } = totalWords(record.totalsByFrequency, record.proposal.currency);
  return (
    <span>
      <strong>
        {count} {count === 1 ? "service" : "services"}
      </strong>
      {sentence !== null && <span className="mono text-muted"> · {sentence}</span>}
    </span>
  );
}
