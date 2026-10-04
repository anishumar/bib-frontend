"use client";

import { Field, FieldRow, Select } from "@/components/ui";
import type { FirmEntity } from "@/lib/api/client";
import { TIME_ZONES, zoneForCountry, zoneLabel } from "@/lib/ui/time-zone";

/**
 * EACH COMPANY'S OWN YEAR AND CLOCK (0337). A company's invoices, their
 * numbers, its billing periods and its letters and proposals are dated on its
 * own financial year and time zone; a company that sets neither is on the
 * firm's (the compliance policy's year, the firm's time zone). Reminders to
 * people stay on the firm's day.
 *
 * Kept out of `page.tsx` on purpose: that page is shared with other work, and
 * this is the whole of what the company calendar adds to it.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The firm's own year and clock, which "Same as the firm" means. */
export interface FirmCalendar {
  readonly timeZone: string | null;
  readonly fiscalYearStartMonth: number | null;
}

/** "Year and clock" in the companies table: the company's own, or the firm's
 *  in muted type when it has set neither. */
export function CompanyCalendarCell({ entity, firm }: { entity: FirmEntity; firm: FirmCalendar }) {
  const month = entity.fiscalYearStartMonth ?? firm.fiscalYearStartMonth;
  const zone = entity.timeZone ?? firm.timeZone;
  const words = `${month === null ? "Year not set" : `Starts ${MONTHS[month - 1] ?? ""}`} · ${
    zone === null ? "firm's clock" : zoneLabel(zone)
  }`;
  if (entity.fiscalYearStartMonth === null && entity.timeZone === null) {
    return <span className="text-muted">Firm&apos;s ({words})</span>;
  }
  return <>{words}</>;
}

/**
 * The two fields in Add and Change. Uncontrolled, like the rest of the
 * company form, so a refusal keeps what was chosen (F05). Both wait for the
 * company's country: the API takes neither before it (COMPANY_NOT_REGISTERED).
 */
export function CompanyCalendarFields({
  country,
  entity,
  firm,
  disabled,
}: {
  /** Where it is registered, or "" before that is chosen. */
  country: string;
  /** The company being changed; null when adding one. */
  entity: FirmEntity | null;
  firm: FirmCalendar;
  disabled: boolean;
}) {
  const waiting = country === "";
  const india = country === "IN";
  // A NEW company starts on what its country settles: April in India (the
  // law fixes it), and the country's one zone where it has only one. A
  // company being changed starts on what it has.
  const month =
    entity === null ? (india ? 4 : null) : entity.fiscalYearStartMonth;
  const zone = entity === null ? zoneForCountry(country) : entity.timeZone;
  const firmMonth = firm.fiscalYearStartMonth === null ? "not set yet" : MONTHS[firm.fiscalYearStartMonth - 1];
  const firmZone = firm.timeZone === null ? "not set yet" : zoneLabel(firm.timeZone);
  const zones =
    zone === null || TIME_ZONES.some((z) => z.value === zone) ? TIME_ZONES : [...TIME_ZONES, { value: zone, label: zone }];
  const hint = (own: string): string | undefined =>
    waiting ? "Record where it is registered first." : own;

  return (
    <FieldRow>
      <Field
        label="Financial year starts"
        hint={hint(
          india
            ? "April. Indian law fixes it."
            : entity === null
              ? "Its invoice numbers and billing periods follow this year."
              : "Numbers already drawn keep their year. A new series starts when the new year begins.",
        )}
      >
        <Select
          // Remounts when the country changes, so a new company's preselection follows it.
          key={`fy-${country}`}
          name="fiscalYearStartMonth"
          disabled={disabled || waiting}
          defaultValue={month === null ? "" : String(month)}
        >
          <option value="">Same as the firm ({firmMonth})</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Time zone" hint={hint("Dates its invoices, letters and proposals.")}>
        <Select
          key={`tz-${country}`}
          name="timeZone"
          disabled={disabled || waiting}
          defaultValue={zone ?? ""}
        >
          <option value="">Same as the firm ({firmZone})</option>
          {zones.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </Select>
      </Field>
    </FieldRow>
  );
}

/** What the two fields changed, against what the company has (null when
 *  adding): only a change is sent, and "Same as the firm" is null. A disabled
 *  field is not in the form, so it sends nothing. */
export function calendarChanges(
  form: FormData,
  entity: FirmEntity | null,
): { timeZone?: string | null; fiscalYearStartMonth?: number | null } {
  const out: { timeZone?: string | null; fiscalYearStartMonth?: number | null } = {};
  if (form.has("fiscalYearStartMonth")) {
    const raw = String(form.get("fiscalYearStartMonth") ?? "");
    const month = raw === "" ? null : Number(raw);
    if (month !== (entity?.fiscalYearStartMonth ?? null)) out.fiscalYearStartMonth = month;
  }
  if (form.has("timeZone")) {
    const raw = String(form.get("timeZone") ?? "");
    const zone = raw === "" ? null : raw;
    if (zone !== (entity?.timeZone ?? null)) out.timeZone = zone;
  }
  return out;
}
