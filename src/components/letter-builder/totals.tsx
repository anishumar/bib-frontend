"use client";

import type { LetterRecord } from "@/lib/api/client";
import { totalWords } from "@/components/proposal-document";

/**
 * What the letter adds up to, PER FREQUENCY (D8), for the sticky footer:
 * "3 services · INR 50,000 Monthly + INR 1,20,000 Yearly". A section's fee is
 * counted once at its own frequency. Summed by the database; the words are
 * the proposal's `totalWords`, so both builders say money one way.
 */
export function LetterTotals({ record }: { record: LetterRecord }) {
  const count = record.lines.length;
  const { withheld, sentence } = totalWords(record.totalsByFrequency, record.letter.currency);
  return (
    <span>
      <strong>
        {count} {count === 1 ? "service" : "services"}
      </strong>
      {withheld ? (
        <span className="text-muted"> · fees not shown to you</span>
      ) : (
        sentence !== null && <span className="tabular-nums text-ink-2"> · {sentence}</span>
      )}
    </span>
  );
}
