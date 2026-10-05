"use client";

import { Field, Fieldset, Input } from "@/components/ui";
import type { LinkableFiling } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";

/**
 * Q084 (10x, 2026-10-05: "While closing job, ask filing date separately"): the
 * day each return was filed ON THE PORTAL, which is the filing's date of
 * record and what lateness is counted from. Today by default; never later.
 *
 * Asked wherever a task that files returns is finished: its state picked as
 * done and its check approved on the task page, and Approve on the Checks
 * queue. One component, so the three ask in the same words.
 */
export function PortalDates({
  filings,
  value,
  onChange,
}: {
  filings: readonly LinkableFiling[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const today = browserDay();
  return (
    <Fieldset legend="Filed on the portal on">
      {filings.map((f) => (
        <Field key={f.obligationId} label={`${f.name} · ${f.periodLabel}`} hint={`Due ${longDay(f.statutoryDueOn)}`}>
          <Input
            type="date"
            max={today}
            required
            value={value[f.obligationId] ?? ""}
            onChange={(e) => {
              onChange({ ...value, [f.obligationId]: e.target.value });
            }}
          />
        </Field>
      ))}
    </Fieldset>
  );
}

/** Every return this close files, filed on the portal today unless typed. */
export function portalDaysToday(filings: readonly LinkableFiling[]): Record<string, string> {
  const today = browserDay();
  return Object.fromEntries(filings.map((f) => [f.obligationId, today]));
}

/** Whether every return has its day. */
export function allPortalDays(filings: readonly LinkableFiling[], days: Record<string, string>): boolean {
  return filings.every((f) => (days[f.obligationId] ?? "") !== "");
}
