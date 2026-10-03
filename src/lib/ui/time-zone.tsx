"use client";

import { Card, CardHead, Field, Select } from "@/components/ui";

/**
 * The firm's time zone: which calendar its days and months are cut on (0071).
 *
 * It decides the firm's TODAY everywhere the product has no caller to ask:
 * when a filing turns missed, when a reminder or an escalation fires, which
 * day a proposal lapses on, which month a document falls into on a client's
 * month page. It does not change how a date is DISPLAYED: each reader still
 * sees instants in their own zone.
 *
 * ── ON YOUR FIRM, WHERE A PARTNER LOOKS FOR IT (audit 2026-10-03, CA#16) ──
 *
 * It sat on Structure, under "Who picks up client requests", and nobody found
 * it: an Indian firm ran on UTC. It is now a card on Your firm (`#time-zone`),
 * which the Setup line "Your firm's time zone" links to, and Structure no
 * longer carries it, so there is one place to set it.
 *
 * A LABELLED select and a short curated list rather than all 400-odd zones: a
 * firm picks this once. The CURRENT value is always in the list, so opening
 * the screen never offers to change a setting somebody made deliberately. UTC
 * says it is not a country's calendar, because a firm on it has usually not
 * chosen at all (it was every firm's default until 2026-10-03).
 */
export const TIME_ZONES: readonly { readonly value: string; readonly label: string }[] = [
  { value: "Asia/Kolkata", label: "India (Asia/Kolkata)" },
  { value: "Asia/Dubai", label: "United Arab Emirates (Asia/Dubai)" },
  { value: "Asia/Singapore", label: "Singapore (Asia/Singapore)" },
  { value: "Europe/London", label: "United Kingdom (Europe/London)" },
  { value: "America/New_York", label: "United States, Eastern (America/New_York)" },
  { value: "UTC", label: "UTC, no country's calendar" },
];

export function TimeZoneCard({
  chosen,
  busy,
  onChoose,
}: {
  chosen: string;
  busy: boolean;
  onChoose: (zone: string) => void;
}) {
  const options = TIME_ZONES.some((z) => z.value === chosen)
    ? TIME_ZONES
    : [...TIME_ZONES, { value: chosen, label: chosen }];
  return (
    <Card id="time-zone">
      <CardHead level={2} title="Time zone" />
      <div style={{ maxWidth: "42ch" }}>
        <Field
          id="firm-timezone"
          label="Your firm's time zone"
          hint={chosen === "UTC" ? "Not chosen yet. Pick your country." : "Sets the firm's day for deadlines and reminders."}
        >
          <Select
            value={chosen}
            disabled={busy}
            onChange={(e) => {
              onChoose(e.target.value);
            }}
          >
            {options.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}
