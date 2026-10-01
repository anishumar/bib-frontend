"use client";

import { formatCount, formatMoney } from "@/lib/api/client";
import { cleanAmount } from "@/lib/money";
import { AmountInput, NotSet } from "@/components/ui";

/**
 * A SERVICE'S OWN ADVANCE, on the letter's Services table (0320): before tax,
 * and that service's work waits until its advance invoice is paid. On a draft
 * it is a box that saves when the reader leaves it (empty clears it); on a sent
 * or signed letter it is the figure the PDF prints. A grouped line has none of
 * its own, and a letter with one advance for the whole of it shows no column.
 */
export function LineAdvanceControl({
  label,
  amount,
  hasAdvance,
  currency,
  editable,
  busy,
  onSave,
}: {
  /** Names the box for a screen reader: "Advance for GST returns". */
  label: string;
  amount: string | null;
  /** Never redacted: says there is one when the figure is hidden. */
  hasAdvance: boolean;
  currency: string;
  editable: boolean;
  busy: boolean;
  onSave: (amount: string | null) => void;
}) {
  if (!editable) {
    if (!hasAdvance) return <NotSet>None</NotSet>;
    return amount === null ? <NotSet>Hidden</NotSet> : <>{formatMoney(amount, currency)}</>;
  }
  const was = amount === null ? "" : cleanAmount(formatCount(amount));
  return (
    <AmountInput
      aria-label={label}
      defaultValue={amount === null ? "" : formatCount(amount)}
      placeholder="e.g. 50,000"
      disabled={busy}
      onBlur={(e) => {
        const next = cleanAmount(e.currentTarget.value);
        if (next === was) return;
        onSave(next === "" ? null : next);
      }}
    />
  );
}
