"use client";

import { Select } from "@/components/ui";
import type { SelectProps } from "@/components/ui/field";
import { currencyLabel, currencyOptions } from "@/lib/currency";

/**
 * A currency, picked by name and sent as its code (0344, Q006).
 *
 * With `only`, just those: a service on a proposal or letter may be priced in
 * the main currency or one the document holds a rate for, and offering any
 * other would be offering a refusal. Without it, the usual six first and then
 * every currency, for choosing which one to add a rate for. `exclude` leaves
 * out the ones already there.
 */
export function CurrencySelect({
  only,
  exclude = [],
  blankLabel,
  ...props
}: Omit<SelectProps, "children"> & {
  only?: readonly string[];
  exclude?: readonly string[];
  /** A first, empty option ("Choose a currency"), for a select with no answer yet. */
  blankLabel?: string;
}) {
  const skip = new Set(exclude);
  const blank = blankLabel === undefined ? null : <option value="">{blankLabel}</option>;
  if (only !== undefined) {
    return (
      <Select {...props}>
        {blank}
        {only
          .filter((c) => !skip.has(c))
          .map((c) => (
            <option key={c} value={c}>
              {currencyLabel(c)}
            </option>
          ))}
      </Select>
    );
  }
  const { usual, rest } = currencyOptions();
  return (
    <Select {...props}>
      {blank}
      <optgroup label="Usual">
        {usual
          .filter((c) => !skip.has(c))
          .map((c) => (
            <option key={c} value={c}>
              {currencyLabel(c)}
            </option>
          ))}
      </optgroup>
      <optgroup label="Every currency">
        {rest
          .filter((c) => !skip.has(c))
          .map((c) => (
            <option key={c} value={c}>
              {currencyLabel(c)}
            </option>
          ))}
      </optgroup>
    </Select>
  );
}
