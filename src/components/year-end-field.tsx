"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

/**
 * A client company's YEAR END, as Q076 decided it (Ashish, 2026-10-04).
 *
 * - India: fixed at 31 March. Shown, never asked (Q077: no Indian client runs
 *   another year), and nothing is sent: the API stores 03-31 itself.
 * - Anywhere else: required, as a month and a day. Two selects rather than a
 *   typed "MM-DD", so nobody has to know the format.
 * - No country chosen yet: says it depends on the country.
 *
 * The value travels as one hidden `name` input in `MM-DD`, which is what the
 * API takes. Sits in a `FieldRow` beside the country: no hint inside it, since
 * a hint inside a row column rides its input up.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function YearEndField({
  country,
  name = "financialYearEnd",
  defaultValue = null,
}: {
  /** The ISO country chosen beside it; "" while none is. */
  country: string;
  name?: string;
  /** MM-DD already recorded, or null. */
  defaultValue?: string | null;
}) {
  const [month, setMonth] = useState(defaultValue?.slice(0, 2) ?? "");
  const [day, setDay] = useState(defaultValue?.slice(3, 5) ?? "");

  if (country === "IN") {
    return (
      <Field label="Year ends">
        {/* Read-only input rather than a sentence, so the row's fields line up. */}
        <Input value="31 March (fixed for India)" readOnly />
      </Field>
    );
  }
  const days = month === "" ? 31 : (DAYS_IN[Number(month) - 1] ?? 31);
  const value = month !== "" && day !== "" ? `${month}-${day}` : "";
  return (
    <Field label={country === "" ? "Year ends (outside India)" : "Year ends"}>
      <div className="cluster" style={{ flexWrap: "nowrap" }}>
        <Select
          aria-label="Year ends: month"
          value={month}
          required={country !== ""}
          onChange={(e) => {
            setMonth(e.target.value);
            if (e.target.value !== "" && Number(day) > (DAYS_IN[Number(e.target.value) - 1] ?? 31)) setDay("");
          }}
        >
          <option value="">Month…</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Year ends: day"
          value={day}
          required={country !== ""}
          onChange={(e) => {
            setDay(e.target.value);
          }}
        >
          <option value="">Day…</option>
          {Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </Select>
      </div>
      <input type="hidden" name={name} value={value} />
    </Field>
  );
}
