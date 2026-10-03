"use client";

import { useEffect, useRef, useState } from "react";
import { AmountInput, Field } from "@/components/ui";
import { formatMoney } from "@/lib/api/client";
import { cleanAmount, scaledUnits } from "@/lib/money";

/**
 * QUANTITY IS HOW MANY EACH BILLING PERIOD (decided 2026-10-03, audit F03).
 *
 * A monthly line's fee is quantity x price x (1 - discount) EVERY MONTH:
 * that is what the letter prints ("INR 2,70,000 per month"), what automatic
 * billing bills and what the monthly revenue adds up. The demo typed 12 for
 * "12 months" and the letter then asked for twelve times the fee every month.
 * So the box says what it means, shows the fee it makes while it is typed, and
 * warns on the one number that is almost always a term typed as a count.
 */

/** How often, as the box's label reads it. Takes a document's billing
 *  frequency or a catalogue recurrence; anything else is a one-off. */
function periodWord(frequency: string | null | undefined): "month" | "quarter" | "half-year" | "year" | null {
  switch (frequency) {
    case "monthly":
      return "month";
    case "quarterly":
      return "quarter";
    case "half_yearly":
      return "half-year";
    case "annually":
    case "annual":
      return "year";
    default:
      return null;
  }
}

/** Periods in a year, for the annual figure. */
const PER_YEAR: Readonly<Record<string, bigint>> = { month: 12n, quarter: 4n, "half-year": 2n, year: 1n };

export const QUANTITY_HINT = "Not the number of months. The letter's dates set how long the work runs.";

/** "How many each month", "How many each quarter", "How many". */
export function quantityLabel(frequency: string | null | undefined): string {
  const word = periodWord(frequency);
  return word === null ? "How many" : `How many each ${word}`;
}

/** The count that is almost always a term typed as a quantity: 12 on a
 *  monthly line, 4 on a quarterly one, 2 on a half-yearly one. */
export function quantityWarning(quantity: string, frequency: string | null | undefined): string | null {
  const word = periodWord(frequency);
  const typed = cleanAmount(quantity).replace(/\.0*$/, "");
  const suspicious: Readonly<Record<string, string>> = { month: "12", quarter: "4", "half-year": "2" };
  if (word === null || suspicious[word] !== typed) return null;
  const adjective = { month: "monthly", quarter: "quarterly", "half-year": "half-yearly", year: "yearly" }[word];
  const span = { month: "months", quarter: "quarters", "half-year": "half-years", year: "years" }[word];
  return `${typed} on a ${adjective} line bills ${typed} times every ${word}. For ${typed} ${span} of work, keep 1.`;
}

/**
 * The fee the line makes: "INR 22,500 every month · INR 2,70,000 a year", or
 * "INR 15,000" for a one-off. Exact: every figure is a decimal string worked
 * as a bigint, never a JavaScript number. Null until all three are numbers.
 */
export function feeSummary(input: {
  readonly quantity: string;
  readonly unitAmount: string;
  readonly discountPercent: string;
  readonly frequency: string | null | undefined;
  readonly currency: string;
}): string | null {
  const q = scaledUnits(cleanAmount(input.quantity));
  const u = scaledUnits(cleanAmount(input.unitAmount));
  const d = scaledUnits(cleanAmount(input.discountPercent === "" ? "0" : input.discountPercent));
  if (q === null || u === null || d === null || q.units <= 0n) return null;
  // quantity x price x (100 - discount) / 100, at the combined scale, then
  // rounded half up to whole paise (the database rounds a line the same way).
  const hundred = 100n * 10n ** BigInt(d.scale);
  const raw = q.units * u.units * (hundred - d.units);
  const scale = q.scale + u.scale + d.scale + 2;
  const perPeriod = roundToPaise(raw, scale);
  const word = periodWord(input.frequency);
  const each = formatMoney(perPeriod.text, input.currency);
  if (word === null) return each;
  const year = formatMoney(fromPaise(perPeriod.paise * (PER_YEAR[word] ?? 1n)), input.currency);
  return word === "year" ? `${each} every year` : `${each} every ${word} · ${year} a year`;
}

function roundToPaise(units: bigint, scale: number): { paise: bigint; text: string } {
  // units / 10^scale in whole paise, half up (never negative here).
  const denom = 10n ** BigInt(scale);
  const paise = (units * 200n + denom) / (2n * denom);
  return { paise, text: fromPaise(paise) };
}

function fromPaise(paise: bigint): string {
  const whole = paise / 100n;
  const cents = (paise % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${cents}`;
}

/**
 * The quantity box, labelled by the line's frequency, with the fee it makes
 * and the warning, live. Controlled (`value` / `onChange`, as the builder's
 * form is) or not (`defaultValue`, as the letter and proposal pages' forms
 * are): uncontrolled, it reads `unitAmount`, `discountPercent` and
 * `billingFrequency` from its own form as they are typed, unless the page
 * passes them.
 */
export function QuantityField({
  frequency,
  currency,
  unitAmount,
  discountPercent,
  value,
  onChange,
  defaultValue = "1",
  name = "quantity",
}: {
  frequency: string | null | undefined;
  currency: string;
  unitAmount?: string | undefined;
  discountPercent?: string | undefined;
  value?: string | undefined;
  onChange?: ((next: string) => void) | undefined;
  defaultValue?: string | undefined;
  name?: string | undefined;
}) {
  const box = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(value ?? defaultValue);
  const [siblings, setSiblings] = useState<{ unit: string; discount: string; frequency: string | null }>({
    unit: "",
    discount: "0",
    frequency: null,
  });

  // UNCONTROLLED: read the rest of the line from the form it sits in.
  useEffect(() => {
    const form = box.current?.form;
    if (form === null || form === undefined) return;
    const read = (): void => {
      const data = new FormData(form);
      const freq = data.get("billingFrequency");
      setSiblings({
        unit: String(data.get("unitAmount") ?? ""),
        discount: String(data.get("discountPercent") ?? "0"),
        frequency: freq === null || freq === "" ? null : String(freq),
      });
      const q = data.get(name);
      if (value === undefined && q !== null) setTyped(String(q));
    };
    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, [name, value]);

  const quantity = value ?? typed;
  const freq = frequency ?? siblings.frequency;
  const summary = feeSummary({
    quantity,
    unitAmount: unitAmount ?? siblings.unit,
    discountPercent: discountPercent ?? siblings.discount,
    frequency: freq,
    currency,
  });
  const warning = quantityWarning(quantity, freq);

  return (
    <Field
      label={quantityLabel(freq)}
      hint={
        <>
          {summary === null ? QUANTITY_HINT : `${summary}. ${QUANTITY_HINT}`}
          {warning !== null && (
            <strong role="status" className="mt-1 block font-semibold text-danger">
              {warning}
            </strong>
          )}
        </>
      }
    >
      <AmountInput
        ref={box}
        decimals={4}
        name={name}
        required
        {...(value === undefined
          ? { defaultValue }
          : {
              value,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                onChange?.(e.target.value);
              },
            })}
      />
    </Field>
  );
}
