/**
 * Currencies, picked by name and sent as the ISO 4217 code the API wants
 * (0344, Q006).
 *
 * The six the firm actually quotes in come first, then every currency the
 * browser knows, each named in words ("UAE Dirham"), because a code alone is
 * a guess for anybody who does not trade in it. Names come from the browser
 * (`Intl.DisplayNames`), so there is no list here to fall out of date.
 */

/** What the firm's companies and clients actually use, in this order. */
export const USUAL_CURRENCIES = ["INR", "USD", "AED", "SGD", "EUR", "SAR"] as const;

let names: Intl.DisplayNames | null = null;

/** "AED" -> "UAE Dirham". The code itself when the browser has no name. */
export function currencyName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "AED, UAE Dirham": what an option says. */
export function currencyLabel(code: string): string {
  const name = currencyName(code);
  return name === code ? code : `${code}, ${name}`;
}

/** Every currency the browser knows, the usual ones apart. */
export function currencyOptions(): { usual: readonly string[]; rest: readonly string[] } {
  let all: readonly string[] = [];
  try {
    all = Intl.supportedValuesOf("currency");
  } catch {
    all = [];
  }
  const usual = new Set<string>(USUAL_CURRENCIES);
  return { usual: USUAL_CURRENCIES, rest: all.filter((c) => !usual.has(c)) };
}

/**
 * How many places after the point a currency is written with: 2 for most,
 * 0 for the yen, 3 for the Kuwaiti dinar. From the browser's own currency
 * data, never from a number.
 */
export function minorUnits(code: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
