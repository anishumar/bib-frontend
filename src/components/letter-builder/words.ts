/**
 * How the ANNEXURE LETTER's PDF words money and frequency, so the preview says
 * them the same way (`render-source.ts`: `documentMoney`, `FREQUENCY_LABELS`,
 * `PER_PERIOD`). The letter is not the proposal: it says "Annually" and
 * "One-off", and a section's fee "per month". Its money, since the audit of
 * 2026-10-03 (B19 / CA#49), is the screens' own: "₹5,000", paise only when
 * there are some.
 */

import { formatMoney } from "@/lib/api/client";
import type { FeeGroup } from "@/lib/api/client";

type Frequency = FeeGroup["billingFrequency"];

/** `documentMoney`: the screens' formatter, as the letter's PDF now prints. */
export function letterMoney(amount: string, currency: string): string {
  return formatMoney(amount, currency);
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
