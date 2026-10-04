/**
 * How the proposal PDF WORDS things, so the preview says them the same way.
 *
 * Each of these restates one of `render-source.ts`'s own helpers (0084) and
 * names it. The preview is a promise about the PDF; a fee that reads
 * "₹50,000.00" on screen and "INR 50,000" on paper is two documents.
 *
 * THE BUILDER SAYS MONEY THIS WAY TOO. Its service rows, its Details form and
 * its sticky footer read `pdfMoney`, `FREQUENCY_WORDS` and `totalWords` from
 * here, so "AED 4,000 Monthly" on step 2 is the same words on step 3 and on
 * paper. There is no second copy to drift.
 */

import { formatMoney } from "@/lib/api/client";
import type { ProposalLine, ProposalRecord } from "@/lib/api/client";

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

/**
 * `documentMoney` (render-source, audit 2026-10-03, B19 / CA#49): the PDF
 * writes money exactly as every screen does now, "₹12,50,000" in lakhs for
 * rupees, "AED 4,000" for any other currency, paise only when there are some.
 * So the builder's words and the paper's are the screens' one formatter.
 */
export function pdfMoney(amount: string, currency: string): string {
  return formatMoney(amount, currency);
}

/** `proposalFee`: "₹50,000 Yearly (note)", or the line's reason for having
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

/**
 * THE TOTAL, PER FREQUENCY (D8), as `proposalTotalsFlow` ends the Summary of
 * Fees: "INR 25,000 Monthly + INR 62,500 Yearly, plus 1 service as mutually
 * agreed". Never one mixed figure: a month's fee and a year's fee added
 * together is a number nobody is ever billed. The database adds each group up
 * (`totalsByFrequency`); nothing here adds money.
 *
 * `withheld` is a session without fee visibility: a priced figure exists and
 * is not shown to them, which is not the same as there being none. `sentence`
 * is null when no line has a fixed fee, and the PDF then prints no Total.
 *
 * A group whose every line has no fixed fee is left out of the figures: the
 * staff read carries its sum as "0" where the PDF's own read has NULL and
 * skips it, and "AED 0 One-time" is not something the paper says.
 */
export function totalWords(
  totals: ProposalRecord["totalsByFrequency"],
  currency: string,
): { readonly withheld: boolean; readonly sentence: string | null } {
  const withheld = totals.some((t) => t.net === null && t.lineCount > t.unpricedLineCount);
  if (withheld) return { withheld, sentence: null };
  // A count of services, not money.
  const unpriced = totals.reduce((n, t) => n + t.unpricedLineCount, 0);
  const figures = totals
    .filter((t) => t.net !== null && t.lineCount > t.unpricedLineCount)
    .map((t) => {
      const amount = pdfMoney(t.net ?? "0", currency);
      return t.frequency === null
        ? `${amount} (frequency not stated)`
        : `${amount} ${FREQUENCY_WORDS[t.frequency]}`;
    });
  if (figures.length === 0) return { withheld, sentence: null };
  const tail =
    unpriced === 0 ? "" : `, plus ${String(unpriced)} service${unpriced === 1 ? "" : "s"} as mutually agreed`;
  return { withheld, sentence: `${figures.join(" + ")}${tail}` };
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
