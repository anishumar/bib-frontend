"use client";

import { Select } from "@/components/ui";
import type { SelectProps } from "@/components/ui/field";
import { countryOptions } from "@/lib/country";

/**
 * Where a prospect is, picked by NAME and sent as the ISO code the API wants.
 *
 * The capture form and the lead page both ask this, and a free-text box for
 * it was the trap: the API refuses "India" and "in" (it compares the code
 * against territory rules), so every typed answer but one was a refusal.
 *
 * "Not known" is the first option and the empty value, because it is the
 * ordinary answer at capture and the API treats it as a real one.
 */
export function CountrySelect(props: Omit<SelectProps, "children">) {
  const { usual, rest } = countryOptions();
  return (
    <Select {...props}>
      <option value="">Not known</option>
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
