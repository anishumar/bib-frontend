/**
 * How the ANNEXURE LETTER's PDF words money and frequency, so the preview says
 * them the same way (`render-source.ts`: `money`, `FREQUENCY_LABELS`,
 * `PER_PERIOD`). The letter is not the proposal: its PDF prints two decimals
 * ("INR 5,000.00"), "Annually" and "One-off", and a section's fee "per month".
 * A preview in the proposal's words would be a second document.
 */

import type { FeeGroup } from "@/lib/api/client";

type Frequency = FeeGroup["billingFrequency"];
type NumericLiteral = `${number}`;

/** `money`: always two decimals and the ISO code; the string goes to Intl as
 *  it is, never through a JS number. */
export function letterMoney(amount: string, currency: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(amount)) return `${currency} ${amount}`;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount as NumericLiteral);
  return `${currency} ${formatted}`;
}

/** `FREQUENCY_LABELS`, the Summary of Fees' own column. */
export const LETTER_FREQUENCY: Readonly<Record<Frequency, string>> = {
  one_time: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  custom: "Custom",
};

/** `PER_PERIOD`: what follows a recurring fee. */
const PER: Partial<Readonly<Record<Frequency, string>>> = {
  monthly: " per month",
  quarterly: " per quarter",
  annually: " per year",
};

/** One row's fee: the amount per period, or the reason there is none. */
export function letterFee(
  amount: string | null,
  frequency: Frequency | null,
  pricingNote: string | null,
  currency: string,
): string {
  if (amount === null) return pricingNote ?? "To be agreed";
  return `${letterMoney(amount, currency)}${frequency === null ? "" : (PER[frequency] ?? "")}`;
}

/** "A", "A and B", "A, B and C". */
export function andList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}
