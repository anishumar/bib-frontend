"use client";

import { useState } from "react";
import { longDay } from "@/lib/day";
import { Input, NotSet, Select } from "@/components/ui";

/**
 * WHEN A RECURRING FEE IS INVOICED, as the letter says it (0319): after each
 * period (the firm's default, and what a letter that says nothing means), at
 * its start, or on a date the firm chooses for the first one. Signing sets the
 * engagement's billing schedule from it, so nobody has to "Set billing" by
 * hand. Only for a monthly, quarterly or yearly fee.
 *
 * On a draft it is a select that saves as it changes ("On a date I choose"
 * then asks for the date, and saves when one is given); on a sent or signed
 * letter it is the words the PDF prints.
 */
export type BillingTiming = "arrears" | "advance" | "on_date";

const SPAN: Readonly<Record<string, string>> = { monthly: "month", quarterly: "quarter", annually: "year" };

/** "At the end of each month", "At the start of each quarter", "First invoice 15 Nov
 *  2026", or null for a fee not billed per period. */
export function billingTimingWords(frequency: string | null, timing: BillingTiming | null, on: string | null): string | null {
  const span = SPAN[frequency ?? ""];
  if (span === undefined) return null;
  if (timing === "advance") return `At the start of each ${span}`;
  if (timing === "on_date" && on !== null) return `First invoice ${longDay(on)}`;
  // On the period's last day (Q042).
  return `At the end of each ${span}`;
}

export function BillingTimingControl({
  label,
  frequency,
  timing,
  on,
  editable,
  busy,
  onSave,
}: {
  /** Names the select for a screen reader: "When GST returns is billed". */
  label: string;
  frequency: string | null;
  timing: BillingTiming | null;
  on: string | null;
  editable: boolean;
  busy: boolean;
  onSave: (timing: BillingTiming, on: string | null) => void;
}) {
  const [choice, setChoice] = useState<BillingTiming>(timing ?? "arrears");
  const words = billingTimingWords(frequency, timing, on);
  if (words === null) return <NotSet>Billed by hand</NotSet>;
  if (!editable) return <>{words}</>;
  const span = SPAN[frequency ?? ""] ?? "period";
  return (
    <span className="stack tight">
      <Select
        variant="quiet"
        aria-label={label}
        value={choice}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value === "advance" ? "advance" : e.target.value === "on_date" ? "on_date" : "arrears";
          setChoice(next);
          if (next !== "on_date") onSave(next, null);
        }}
      >
        <option value="arrears">{`At the end of each ${span}`}</option>
        <option value="advance">{`At the start of each ${span}`}</option>
        <option value="on_date">On a date I choose</option>
      </Select>
      {choice === "on_date" && (
        <Input
          type="date"
          aria-label={`${label}: first invoice date`}
          defaultValue={on ?? ""}
          disabled={busy}
          onChange={(e) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onSave("on_date", e.target.value);
          }}
        />
      )}
    </span>
  );
}
