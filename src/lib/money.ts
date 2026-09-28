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
 * The exact sum of decimal strings AS THE API SENDS THEM ("25000.0000": line
 * amounts are `numeric` with four places), at whatever scale they arrive, or
 * null when one is not a plain non-negative decimal. `toMinorUnits` is for
 * what a person types (two places at most) and refuses these.
 */
export function addDecimals(amounts: readonly string[]): string | null {
  const parts: { whole: string; fraction: string }[] = [];
  for (const a of amounts) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(a);
    if (m === null) return null;
    parts.push({ whole: m[1] ?? "0", fraction: m[2] ?? "" });
  }
  const scale = Math.max(0, ...parts.map((p) => p.fraction.length));
  const total = parts.reduce(
    (sum, p) => sum + BigInt(`${p.whole}${p.fraction.padEnd(scale, "0")}`),
    BigInt(0),
  );
  if (scale === 0) return total.toString();
  const digits = total.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/**
 * A decimal string AT ITS OWN SCALE, as whole units in a `bigint`: "-25000.0000"
 * is -250000000n at scale 4. Signed, because a month of billing can be net
 * negative once a credit note lands in it. Null for anything that is not a
 * plain decimal. This is what a count-up and a chart's geometry work on, so an
 * amount is never a JS number, not even for an animation. (`toMinorUnits` is
 * the same idea for what a person TYPES, two places at most, and refuses the
 * API's four-place strings.)
 */
export function scaledUnits(amount: string): { units: bigint; scale: number } | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (m === null) return null;
  const fraction = m[3] ?? "";
  const magnitude = BigInt(`${m[2] ?? "0"}${fraction}`);
  return { units: m[1] === "-" ? -magnitude : magnitude, scale: fraction.length };
}

/** The other direction: whole units at `scale` back to the decimal string
 *  `formatMoney` takes, with the same number of places. */
export function fromScaledUnits(units: bigint, scale: number): string {
  const negative = units < BigInt(0);
  const digits = (negative ? -units : units).toString();
  const sign = negative ? "-" : "";
  if (scale === 0) return `${sign}${digits}`;
  const padded = digits.padStart(scale + 1, "0");
  return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

/**
 * Several amounts on ONE scale, so they can be compared and summed exactly:
 * `["1.5", "20"]` -> `{ units: [15n, 200n], scale: 1 }`. Null if any is not a
 * plain decimal.
 */
export function commonUnits(
  amounts: readonly string[],
): { units: bigint[]; scale: number } | null {
  const parsed: { units: bigint; scale: number }[] = [];
  for (const a of amounts) {
    const p = scaledUnits(a);
    if (p === null) return null;
    parsed.push(p);
  }
  const scale = Math.max(0, ...parsed.map((p) => p.scale));
  return {
    units: parsed.map((p) => p.units * BigInt(10) ** BigInt(scale - p.scale)),
    scale,
  };
}

/**
 * `part` as a share of `whole` in PER MILLE, 0 to 1000, worked out on `bigint`.
 * A chart's geometry is drawn from this, never from money as a JS number: the
 * result is a proportion, and a whole number up to 1000 is exact.
 */
export function perMille(part: bigint, whole: bigint): number {
  if (whole === BigInt(0)) return 0;
  return Number((part * BigInt(1000)) / whole);
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
