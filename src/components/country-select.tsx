"use client";

import { Select } from "@/components/ui";
import type { SelectProps } from "@/components/ui/field";
import { COUNTRY_CODES, countryOptions } from "@/lib/country";

/**
 * Where a prospect is, picked by NAME and sent as the ISO code the API wants.
 *
 * The capture form and the lead page both ask this, and a free-text box for
 * it was the trap: the API refuses "India" and "in" (it compares the code
 * against territory rules), so every typed answer but one was a refusal.
 *
 * "Not known" is the first option and the empty value, because it is the
 * ordinary answer at capture and the API treats it as a real one. Where a
 * country is required (one of the firm's own companies is always registered
 * somewhere), `blankLabel` says "Choose a country" instead, and `required`
 * refuses the empty value.
 */
export function CountrySelect({
  blankLabel = "Not known",
  ...props
}: Omit<SelectProps, "children"> & { blankLabel?: string }) {
  const { usual, rest } = countryOptions();
  // A code saved before the list was cleaned up (DD, UK …) is still SHOWN, as
  // itself, rather than the select silently reading "Not known" and a save
  // quietly clearing it. The API refuses it on the next save, in words.
  const current = typeof props.value === "string" ? props.value : typeof props.defaultValue === "string" ? props.defaultValue : "";
  const retired = current !== "" && !COUNTRY_CODES.includes(current) ? current : null;
  return (
    <Select {...props}>
      <option value="">{blankLabel}</option>
      {retired === null ? null : (
        <option value={retired}>{retired} (not a country code in use, choose again)</option>
      )}
      <optgroup label="Usual">
        {usual.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Every country">
        {rest.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
