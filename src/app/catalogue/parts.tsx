"use client";

import { useId, useState } from "react";
import type { ServiceAxis } from "@/lib/api/client";
import { Checkbox, NotSet, Pill } from "@/components/ui";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { STATUS_WORDS, axisName, deptTint } from "./service";
import type { ServiceStatus } from "./service";

/**
 * The small pieces the Catalogue's screens share, and `/admin/standard-terms`
 * borrows the countries picker from.
 */

/** A Dept as a tinted chip: its code, its full name on hover and to a screen
 *  reader. A service with no Dept says "Not set". */
export function DeptChip({ axes, code }: { axes: readonly ServiceAxis[]; code: string | null }) {
  const tint = deptTint(axes, code);
  if (code === null || tint === null) return <NotSet />;
  const name = axisName(axes, "dept", code) ?? code;
  return (
    <Pill cat={tint} title={name === code ? undefined : name}>
      {code}
      {name !== code && <span className="sr-only">: {name}</span>}
    </Pill>
  );
}

/** Where a service is offered, as small code badges ("IN", "AE"), never
 *  flags; "Everywhere" for an empty list. */
export function CountryCodes({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return <span>Everywhere</span>;
  return (
    <span className="cluster tight">
      {codes.map((c) => (
        <Pill key={c} tone="code" title={countryName(c)}>
          {c}
          <span className="sr-only"> {countryName(c)}</span>
        </Pill>
      ))}
    </span>
  );
}

/** Live (teal), Draft (neutral), Unpublished changes (amber): brief §8.1. */
export function StatusPill({ status }: { status: ServiceStatus }) {
  const tone = status === "live" ? "ok" : status === "changes" ? "warn" : "neutral";
  return (
    <Pill dot tone={tone}>
      {STATUS_WORDS[status]}
    </Pill>
  );
}

/**
 * Which countries something is offered in: a tick per usual country (the
 * firm's own companies' and any the catalogue already names), and "Another
 * country" for the rest. None ticked means everywhere, and the line under it
 * says so, because an empty set that meant "nowhere" would be the opposite
 * fact.
 */
export function CountriesPicker({
  label,
  value,
  suggested,
  onChange,
  noneMeans = "Everywhere",
}: {
  label: string;
  value: readonly string[];
  /** Offered as ticks, in this order. */
  suggested: readonly string[];
  onChange: (next: string[]) => void;
  noneMeans?: string;
}) {
  const groupId = useId();
  const [other, setOther] = useState("");
  const shown = [...suggested, ...value.filter((c) => !suggested.includes(c))];
  return (
    <fieldset className="fieldset" aria-labelledby={`${groupId}-label`}>
      <p className="label" id={`${groupId}-label`}>
        {label}
      </p>
      <div className="cluster">
        {shown.map((code) => (
          <Checkbox
            key={code}
            label={countryName(code)}
            checked={value.includes(code)}
            onChange={(e) => {
              onChange(
                e.currentTarget.checked ? [...value, code] : value.filter((c) => c !== code),
              );
            }}
          />
        ))}
        <div className="w-56">
          <CountrySelect
            aria-label="Another country"
            blankLabel="Another country…"
            value={other}
            onChange={(e) => {
              const code = e.currentTarget.value;
              setOther("");
              if (code !== "" && !value.includes(code)) onChange([...value, code]);
            }}
          />
        </div>
      </div>
      <p className="field-hint">
        {value.length === 0 ? `None ticked: ${noneMeans.toLowerCase()}.` : `Only in ${value.map(countryName).join(", ")}.`}
      </p>
    </fieldset>
  );
}
