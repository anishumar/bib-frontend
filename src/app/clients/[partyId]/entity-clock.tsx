"use client";

import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Button, ErrorNotice, Field, Select } from "@/components/ui";
import { keepTyped } from "@/lib/ui/keep-typed";
import { zoneForCountry } from "@/lib/ui/time-zone";

/**
 * A client company's FILING CLOCK (Q070 Part B): the zone its filings are
 * judged missed on. Its own zone first, else its country's, and New York for
 * a US company with none (the API's `filingCountryZone`), else the firm's
 * company in that country, else the firm's. Setting one is only needed where
 * the country keeps several zones, so the list is the United States' and the
 * country's own, with the current value always in it.
 */

const US_ZONES: readonly { readonly value: string; readonly label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

/** The country's own clock for filings, or null when it does not settle one. */
export function countryFilingZone(country: string): string | null {
  return zoneForCountry(country) ?? (country.toUpperCase() === "US" ? "America/New_York" : null);
}

function city(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replace(/_/g, " ");
}

/** What the table says: "Los Angeles", or "Dubai (country's)" in words. */
export function clockLabel(entity: { readonly jurisdiction: string; readonly timeZone: string | null }): {
  readonly text: string;
  readonly own: boolean;
} {
  if (entity.timeZone !== null) return { text: city(entity.timeZone), own: true };
  const country = countryFilingZone(entity.jurisdiction);
  return country === null ? { text: "Firm's", own: false } : { text: `${city(country)} (country's)`, own: false };
}

export function EntityClock({
  partyId,
  current,
  onSaved,
}: {
  partyId: string;
  current: { readonly jurisdiction: string; readonly timeZone: string | null };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const country = countryFilingZone(current.jurisdiction);
  const options = [
    ...(current.jurisdiction.toUpperCase() === "US" ? US_ZONES : []),
    ...(country !== null && current.jurisdiction.toUpperCase() !== "US"
      ? [{ value: country, label: city(country) }]
      : []),
  ];
  const listed =
    current.timeZone === null || options.some((o) => o.value === current.timeZone)
      ? options
      : [...options, { value: current.timeZone, label: city(current.timeZone) }];

  async function save(form: FormData): Promise<void> {
    const raw = String(form.get("timeZone") ?? "");
    const timeZone = raw === "" ? null : raw;
    if (timeZone === current.timeZone) {
      setError("Nothing changed.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.PUT("/api/v1/parties/{partyId}/legal-entity/time-zone", {
      params: { path: { partyId } },
      body: { timeZone },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved();
  }

  return (
    <details className="card-foot">
      <summary>Filing clock</summary>
      <form
        className="stack"
        onSubmit={(event) =>
          keepTyped(event, (form) => {
            void save(form);
          })
        }
      >
        <Field label="Filings are missed at midnight in" hint="Needed only where the country has several zones.">
          <Select name="timeZone" defaultValue={current.timeZone ?? ""}>
            <option value="">{country === null ? "Same as the firm" : `Its country's (${city(country)})`}</option>
            {listed.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorNotice error={error} />
        <div className="cluster">
          <Button type="submit" variant="secondary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </details>
  );
}
