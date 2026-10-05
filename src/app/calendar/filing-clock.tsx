"use client";

import Link from "next/link";
import type { CalendarRow } from "@/lib/api/client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Past the LEGAL deadline, on the filing's own day (Q070 Part B).
 *
 * `filingToday` is the API's: today in the filing's zone (the client's own,
 * else its country's, New York for the US, else the firm's company there,
 * else the firm's). A UAE return due on the 28th is not missed at India's
 * midnight. The firm's own start-by date stays on the reader's day.
 */
export function pastLegalDeadline(row: CalendarRow): boolean {
  return !row.isTerminal && row.filedOn === null && row.statutoryDueOn < row.filingToday;
}

/** "Asia/Dubai" -> "Dubai", "America/New_York" -> "New York". */
export function zoneCity(zone: string): string {
  const last = zone.split("/").at(-1) ?? zone;
  return last.replace(/_/g, " ");
}

/** The wall clock in `zone` right now, to the minute, or null if the browser
 *  does not know the zone. */
function wallClock(zone: string | undefined, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

/**
 * The city whose clock this filing is judged on, when that clock reads
 * differently from the reader's; null when they agree.
 *
 * COMPARED BY THE CLOCK, NEVER BY NAME: Chrome reports India as
 * "Asia/Calcutta" while the API says "Asia/Kolkata", and a name comparison
 * put "Kolkata time" under every Indian filing for an Indian reader.
 */
export function otherClock(row: CalendarRow): string | null {
  const now = new Date();
  const reader = wallClock(undefined, now);
  const filing = wallClock(row.filingZone, now);
  if (reader === null || filing === null || reader === filing) return null;
  return zoneCity(row.filingZone);
}

/** "Dubai time" under a legal deadline judged on a clock not the reader's. */
export function FilingClock({ row }: { row: CalendarRow }) {
  const city = otherClock(row);
  if (city === null) return null;
  return <span title={`Judged on ${row.filingZone} time`}>{city} time</span>;
}

/** Whether `FilingNotes` has anything to say for this row. */
export function hasFilingNotes(row: CalendarRow): boolean {
  return (
    (row.filedByWorkItemId !== null && row.filedByWorkItemId !== row.workItemId) ||
    row.periodBasis === "rule_fallback"
  );
}

/**
 * Who filed it, when it was not this row's own task (Q063), and a period cut
 * on the rule's month because the client has no year end recorded (0358).
 * Nothing at all for the ordinary row.
 */
export function FilingNotes({ row, className }: { row: CalendarRow; className?: string }) {
  const byJob =
    row.filedByWorkItemId !== null && row.filedByWorkItemId !== row.workItemId ? row.filedByWorkItemId : null;
  const fallback = row.periodBasis === "rule_fallback";
  if (byJob === null && !fallback) return null;
  return (
    <>
      {byJob !== null && (
        <span className={className}>
          Filed by <Link href={`/work-items/${byJob}`}>{row.filedByTitle ?? "the job's task"}</Link>
        </span>
      )}
      {fallback && (
        <span className={className}>
          Using {MONTHS[row.ruleYearStartMonth - 1] ?? "the rule's month"}: no year end recorded for{" "}
          {row.entityName ?? "this company"}
        </span>
      )}
    </>
  );
}
