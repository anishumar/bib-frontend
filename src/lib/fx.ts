/**
 * The day's exchange rate from the feed (0345, Q009), as a SUGGESTION for a
 * rate box. What a document carries is still the rate saved on it; a person
 * can change the suggestion before saving, as in Zoho Books, Xero and
 * QuickBooks.
 */
import { api, formatCount } from "@/lib/api/client";

export interface FxSuggestion {
  /** As a person would type it: "22.75". */
  readonly rate: string;
  readonly on: string;
  /** "ExchangeRate-API" or "Currency API". */
  readonly source: string;
  /** What one unit is worth IN: the firm's own currency. */
  readonly reporting: string;
}

/** The feed's rate for `currency` on `on`, or null when none is available
 *  (the person types it, as before 0345). */
export async function fxSuggestion(currency: string, on: string): Promise<FxSuggestion | null> {
  if (!/^[A-Za-z]{3}$/.test(currency)) return null;
  const r = await api.GET("/api/v1/fx/quote", { params: { query: { currency, on } } });
  if (r.data === undefined) return null;
  return { rate: formatCount(r.data.fxRate), on: r.data.fxRateDate, source: r.data.source, reporting: r.data.reportingCurrency };
}
