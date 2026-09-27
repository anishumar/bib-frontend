/**
 * How the proposal PDF WORDS things, so the preview says them the same way.
 *
 * Each of these restates one of `render-source.ts`'s own helpers (0084) and
 * names it. The preview is a promise about the PDF; a fee that reads
 * "₹50,000.00" on screen and "INR 50,000" on paper is two documents.
 */

import type { ProposalLine } from "@/lib/api/client";

export type BillingFrequency = NonNullable<ProposalLine["billingFrequency"]>;

/** `PROPOSAL_FREQUENCY`: the firm's own words, "Yearly" where a letter says
 *  "Annually". */
export const FREQUENCY_WORDS: Readonly<Record<BillingFrequency, string>> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Yearly",
  custom: "Custom",
};

/** How a total per frequency reads in a sentence: "INR 50,000 a month". */
export const PER_FREQUENCY: Readonly<Record<BillingFrequency, string>> = {
  one_time: "one-time",
  monthly: "a month",
  quarterly: "a quarter",
  annually: "a year",
  custom: "on a custom basis",
};

type NumericLiteral = `${number}`;

/**
 * `wholeMoney`: "INR 50,000" for a whole amount, "INR 12,500.50" when there is
 * a fraction, always the ISO code. The decimal STRING goes to Intl as it is
 * (Intl formats a numeric string exactly); it never becomes a JS number.
 */
export function pdfMoney(amount: string, currency: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(amount)) return `${currency} ${amount}`;
  const whole = /^-?\d+(\.0+)?$/.test(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount as NumericLiteral);
  return `${currency} ${formatted}`;
}

/** `proposalFee`: "INR 50,000 Yearly (note)", or the line's reason for having
 *  no price, never a blank or a zero (G1.6). */
export function feeWords(
  net: string | null,
  frequency: BillingFrequency | null,
  pricingNote: string | null,
  currency: string,
): string {
  if (net === null) return pricingNote ?? "To be agreed";
  const often = frequency === null ? "" : ` ${FREQUENCY_WORDS[frequency]}`;
  const note = pricingNote === null ? "" : ` (${pricingNote})`;
  return `${pdfMoney(net, currency)}${often}${note}`;
}

/** The Summary of Fees' own column: the fee alone, the frequency has a column
 *  of its own there. */
export function summaryFee(net: string | null, pricingNote: string | null, currency: string): string {
  return net === null ? (pricingNote ?? "To be agreed") : pdfMoney(net, currency);
}

/**
 * A service as the in-scope list and the Summary of Fees name it, with its
 * company when the proposal names companies. The PDF joins the two with a
 * dash; this app does not print dashes in its own words, so the preview says
 * "for".
 */
export function namedService(description: string, subject: string | null): string {
  return subject === null ? description : `${description}, for ${subject}`;
}

/** `longDate`: "28 September 2026". Split, never parsed: a `YYYY-MM-DD` is a
 *  calendar day and the same day everywhere. */
export function pdfDate(isoDay: string): string {
  const [y, m, d] = isoDay.slice(0, 10).split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${String(Number(d))} ${months[Number(m) - 1] ?? m ?? ""} ${y ?? ""}`;
}

/**
 * The "Send on WhatsApp" link (D13).
 *
 * `wa.me` wants the number as DIGITS ONLY, with the country code and without a
 * plus: "+91 98200 41210" is `919820041210`. With no number the link still
 * opens WhatsApp, and the person picks the chat there, which is better than
 * no button at all.
 */
export function whatsAppUrl(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const base = digits === "" ? "https://wa.me/" : `https://wa.me/${digits}`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** The message that goes with the link: short, because it is a chat. */
export function whatsAppMessage(input: {
  addresseeName: string | null;
  proposalRef: string;
  title: string;
  firmName: string;
  link: string;
}): string {
  const hello = input.addresseeName === null ? "Hello," : `Hello ${input.addresseeName},`;
  return (
    `${hello} here is our proposal ${input.proposalRef}, ${input.title}, from ${input.firmName}. ` +
    `You can read it, download the PDF and accept or decline it here: ${input.link}`
  );
}
