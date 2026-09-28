/**
 * Comparing and adding amounts WITHOUT a JavaScript number.
 *
 * The API sends money as a decimal string and this app keeps it one (see
 * `formatMoney`). Filtering the pipeline by value and adding up what is
 * showing both need arithmetic, and `Number("1234567890123.10")` is exactly
 * where a string would lose the cents. So an amount becomes whole MINOR UNITS
 * in a `bigint` — exact at any size — and goes back to a string to be shown.
 */

const PLAIN_DECIMAL = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * What somebody typed, with the grouping taken out: "5,00,000" and "5 00 000"
 * are how people in India write five lakh, and the API takes digits only.
 * Commas are GROUPING here, never a decimal point — this firm's people write
 * 1,250.50 — and the preview under every value box shows the number back, so
 * a misread is visible before anything is saved.
 */
export function cleanAmount(typed: string): string {
  return typed.replace(/[,\s]/g, "");
}

/** A plain decimal ("500000", "1250.5") as exact minor units, or null for
 *  anything else — a comma, a sign, a third decimal place. */
export function toMinorUnits(amount: string): bigint | null {
  const m = PLAIN_DECIMAL.exec(amount);
  if (m === null) return null;
  const whole = m[1] ?? "0";
  const fraction = (m[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * BigInt(100) + BigInt(fraction);
}

/** Minor units back to the decimal string `formatMoney` takes. */
export function fromMinorUnits(units: bigint): string {
  const hundred = BigInt(100);
  const whole = units / hundred;
  const fraction = (units % hundred).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

/**
 * An amount somebody is TYPING, grouped so they can see they typed five lakh
 * and not fifty, with no currency. Null while it is not yet a plain decimal.
 *
 * Pass the `currency` when it is known: INR is then grouped in lakhs
 * ("5,00,000") whatever the browser is set to, as `formatMoney` does. Without
 * it the browser's own grouping is used, which is what this always did.
 */
export function previewAmount(amount: string, currency?: string): string | null {
  if (!PLAIN_DECIMAL.test(amount)) return null;
  const exact = amount as `${number}`;
  const locale = currency === "INR" ? "en-IN" : currency === undefined ? undefined : "en-US";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(exact);
}
