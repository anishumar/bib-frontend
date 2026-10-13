"use client";

import { useEffect, useState } from "react";
import { api, apiError, formatCount } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/tw";
import { AmountInput, Button, Field, FieldRow, Input } from "@/components/ui";
import { CurrencySelect } from "@/components/currency-select";
import { browserDay, longDay } from "@/lib/day";
import { currencyLabel } from "@/lib/currency";
import { fxSuggestion, type FxSuggestion } from "@/lib/fx";

export interface CurrencyRateRow {
  readonly currency: string;
  /** Null when the login cannot see fees: the rate goes with the money. */
  readonly fxRate: string | null;
  readonly fxRateDate: string;
  readonly source: string;
}

/**
 * THE OTHER CURRENCIES on a draft (0344, Q006): a service may be priced in the
 * document's main currency or in any currency it holds a rate for, and each
 * rate is what one unit is worth in the firm's own currency (its books), on a
 * day. A currency still used by a service or section cannot be taken off.
 * Totals are never added across currencies, so nothing here converts a fee.
 *
 * SIMPLE BY DEFAULT (2026-10-10): each rate is ONE LINE, "1 AED = 26.3346 INR
 * on 11 Oct 2026", with Change and Remove; the boxes open only on Change. Adding
 * another currency is a button until it is pressed. It was a form per rate
 * and an open add form under them, which read as a step to fill in.
 */
export function CurrencyRates({
  kind,
  documentId,
  main,
  rates,
  inUse,
  editable,
  onChanged,
  startAdding = false,
}: {
  kind: "proposal" | "letter";
  documentId: string;
  /** The document's main currency, which has no row here. */
  main: string;
  rates: readonly CurrencyRateRow[];
  /** How many services or sections are priced in a currency. */
  inUse: (currency: string) => number;
  editable: boolean;
  onChanged: () => Promise<void>;
  /** Open with the add form showing (the reader asked to add one). */
  startAdding?: boolean;
}) {
  const [reporting, setReporting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(startAdding);
  const [adding, setAdding] = useState("");
  const [rate, setRate] = useState("");
  const [day, setDay] = useState(browserDay());
  /** The feed's rate for the currency being added (0345), filled in and
   *  shown with its source; typing over it makes the rate "typed". */
  const [suggested, setSuggested] = useState<FxSuggestion | null>(null);

  async function choose(currency: string): Promise<void> {
    setAdding(currency);
    setSuggested(null);
    if (currency === "") return;
    const s = await fxSuggestion(currency, browserDay());
    setSuggested(s);
    if (s !== null) {
      setRate(s.rate);
      setDay(s.on);
    }
  }

  useEffect(() => {
    void api.GET("/api/v1/firm-entities", {}).then((r) => {
      setReporting(r.data?.reportingCurrency ?? null);
    });
  }, []);

  async function put(currency: string, fxRate: string, fxRateDate: string, source?: string): Promise<boolean> {
    setBusy(currency);
    setError(null);
    const result =
      kind === "proposal"
        ? await api.PUT("/api/v1/proposals/{proposalId}/rates/{currency}", {
            params: { path: { proposalId: documentId, currency } },
            body: { fxRate, fxRateDate, ...(source === undefined ? {} : { source }) },
          })
        : await api.PUT("/api/v1/engagement-letters/{letterId}/rates/{currency}", {
            params: { path: { letterId: documentId, currency } },
            body: { fxRate, fxRateDate, ...(source === undefined ? {} : { source }) },
          });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await onChanged();
    setBusy(null);
    return true;
  }

  async function remove(currency: string): Promise<void> {
    setBusy(currency);
    setError(null);
    const result =
      kind === "proposal"
        ? await api.DELETE("/api/v1/proposals/{proposalId}/rates/{currency}", {
            params: { path: { proposalId: documentId, currency } },
          })
        : await api.DELETE("/api/v1/engagement-letters/{letterId}/rates/{currency}", {
            params: { path: { letterId: documentId, currency } },
          });
    if (result.error) setError(apiError(result.error).message);
    else await onChanged();
    setBusy(null);
  }

  const books = reporting ?? "your own currency";
  if (!editable && rates.length === 0) return null;

  function resetAdd(): void {
    setAddOpen(false);
    setAdding("");
    setRate("");
    setSuggested(null);
  }

  return (
    <Card>
      <CardTitle level={2}>Exchange rates</CardTitle>
      <p className="mt-1 text-sm text-muted">
        {rates.length === 0
          ? `Every fee is in ${main}.`
          : `Fees can be in ${main} or in these. Each currency is totalled on its own.`}
      </p>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {rates.length > 0 && (
        <ul className="m-0 mt-3 list-none p-0">
          {rates.map((r) => (
            <RateRow
              key={`${r.currency}:${r.fxRate ?? ""}:${r.fxRateDate}`}
              rate={r}
              books={books}
              used={inUse(r.currency)}
              editable={editable}
              busy={busy === r.currency}
              onSave={(fxRate, fxRateDate) => put(r.currency, fxRate, fxRateDate)}
              onRemove={() => remove(r.currency)}
            />
          ))}
        </ul>
      )}

      {editable && !addOpen && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAddOpen(true);
            }}
          >
            Add a currency
          </Button>
        </div>
      )}

      {editable && addOpen && (
        <form
          className="mt-4 border-t border-line-soft pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding === "" || rate.trim() === "") return;
            const typed = rate.replace(/[,\s]/g, "");
            // The feed's name goes with its rate; anything changed is "typed".
            const source =
              suggested !== null && typed === suggested.rate && day === suggested.on ? suggested.source : undefined;
            void put(adding, typed, day, source).then((ok) => {
              if (ok) resetAdd();
            });
          }}
        >
          <FieldRow>
            <Field label="Currency">
              <CurrencySelect
                value={adding}
                blankLabel="Choose a currency"
                exclude={[main, ...rates.map((r) => r.currency)]}
                onChange={(e) => {
                  void choose(e.target.value);
                }}
              />
            </Field>
            <Field
              label={adding === "" ? `Its rate in ${books}` : `1 ${adding} in ${books}`}
              hint={
                suggested === null
                  ? undefined
                  : rate.replace(/[,\s]/g, "") === suggested.rate && day === suggested.on
                    ? `Today's rate. Change it if you agreed another.`
                    : "Typed by you."
              }
            >
              <AmountInput
                decimals={10}
                value={rate}
                placeholder="e.g. 22.75"
                onChange={(e) => {
                  setRate(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          <div className="cluster mt-3">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={busy === adding && adding !== ""}
              disabled={adding === "" || rate.trim() === "" || busy !== null}
            >
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetAdd}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** A rate printed for reading: four places at most, trailing zeros dropped. */
function shortRate(rate: string): string {
  const n = Number(rate);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : rate;
}

function RateRow({
  rate,
  books,
  used,
  editable,
  busy,
  onSave,
  onRemove,
}: {
  rate: CurrencyRateRow;
  books: string;
  used: number;
  editable: boolean;
  busy: boolean;
  onSave: (fxRate: string, fxRateDate: string) => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate.fxRate === null ? "" : formatCount(rate.fxRate));
  const [day, setDay] = useState(rate.fxRateDate);
  const own = rate.currency === books;
  const usedWords = used > 0 ? ` · used by ${String(used)} ${used === 1 ? "fee" : "fees"}` : "";

  if (editing) {
    return (
      <li className="border-t border-line-soft py-3 first:border-t-0">
        <form
          aria-label={`Rate for ${rate.currency}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() === "") return;
            void onSave(value.replace(/[,\s]/g, ""), day).then((ok) => {
              if (ok) setEditing(false);
            });
          }}
        >
          <FieldRow>
            <Field label={`1 ${rate.currency} in ${books}`}>
              <AmountInput
                decimals={10}
                value={value}
                required
                onChange={(e) => {
                  setValue(e.target.value);
                }}
              />
            </Field>
            <Field label="As of">
              <Input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          <div className="cluster mt-3">
            <Button type="submit" variant="secondary" size="sm" loading={busy}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft py-3 first:border-t-0">
      <p className="m-0 text-md">
        <strong>{rate.currency}</strong>{" "}
        {own ? (
          <span className="text-muted">your own currency{usedWords}</span>
        ) : (
          <span className="tabular-nums">
            {rate.fxRate === null ? (
              <span className="text-muted">{currencyLabel(rate.currency)}</span>
            ) : (
              <>
                1 {rate.currency} = {shortRate(rate.fxRate)} {books}
                <span className="text-muted">
                  {" "}
                  · {longDay(rate.fxRateDate)}
                  {usedWords}
                </span>
              </>
            )}
          </span>
        )}
      </p>
      {editable && (
        <span className="cluster">
          {!own && rate.fxRate !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Change the rate for ${rate.currency}`}
              onClick={() => {
                setEditing(true);
              }}
            >
              Change
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${rate.currency}`}
            disabled={busy || used > 0}
            title={used > 0 ? `Move or remove the fees in ${rate.currency} first.` : undefined}
            onClick={() => {
              void onRemove();
            }}
          >
            Remove
          </Button>
        </span>
      )}
    </li>
  );
}
