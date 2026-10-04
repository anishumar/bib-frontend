"use client";

import { useEffect, useState } from "react";
import { api, apiError, formatCount } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/tw";
import { AmountInput, Button, Field, FieldRow, Input } from "@/components/ui";
import { CurrencySelect } from "@/components/currency-select";
import { browserDay, longDay } from "@/lib/day";
import { currencyLabel } from "@/lib/currency";

export interface CurrencyRateRow {
  readonly currency: string;
  /** Null when the login cannot see fees: the rate goes with the money. */
  readonly fxRate: string | null;
  readonly fxRateDate: string;
  readonly source: string;
}

/**
 * THE OTHER CURRENCIES on a draft (0344, Q006): a service may be priced in the
 * document's main currency or in any currency it holds a rate for, and this is
 * where those rates are set.
 *
 * Each rate is what one unit is worth in the firm's own currency (its books),
 * on a day, just as the main currency's rate on step 1 is. A currency still
 * used by a service or section cannot be taken off; the button says why.
 * Totals are never added across currencies, so nothing here converts a fee.
 */
export function CurrencyRates({
  kind,
  documentId,
  main,
  rates,
  inUse,
  editable,
  onChanged,
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
}) {
  const [reporting, setReporting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [rate, setRate] = useState("");
  const [day, setDay] = useState(browserDay());

  useEffect(() => {
    void api.GET("/api/v1/firm-entities", {}).then((r) => {
      setReporting(r.data?.reportingCurrency ?? null);
    });
  }, []);

  async function put(currency: string, fxRate: string, fxRateDate: string): Promise<boolean> {
    setBusy(currency);
    setError(null);
    const result =
      kind === "proposal"
        ? await api.PUT("/api/v1/proposals/{proposalId}/rates/{currency}", {
            params: { path: { proposalId: documentId, currency } },
            body: { fxRate, fxRateDate },
          })
        : await api.PUT("/api/v1/engagement-letters/{letterId}/rates/{currency}", {
            params: { path: { letterId: documentId, currency } },
            body: { fxRate, fxRateDate },
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

  return (
    <Card>
      <CardTitle level={2}>Other currencies</CardTitle>
      <p className="mt-1 text-sm text-muted">
        {rates.length === 0
          ? `Every fee is in ${main}. To price a service in another currency, add that currency's rate here.`
          : `Fees can be in ${main} or in these. Each currency is totalled on its own.`}
      </p>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

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

      {editable && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding === "" || rate.trim() === "") return;
            void put(adding, rate.replace(/[,\s]/g, ""), day).then((ok) => {
              if (ok) {
                setAdding("");
                setRate("");
              }
            });
          }}
        >
          <FieldRow>
            <Field label="Add a currency">
              <CurrencySelect
                value={adding}
                blankLabel="Choose a currency"
                exclude={[main, ...rates.map((r) => r.currency)]}
                onChange={(e) => {
                  setAdding(e.target.value);
                }}
              />
            </Field>
            <Field label={adding === "" ? `Its rate in ${books}` : `1 ${adding} is how many ${books}`}>
              <AmountInput
                decimals={10}
                value={rate}
                placeholder="e.g. 22.75"
                onChange={(e) => {
                  setRate(e.target.value);
                }}
              />
            </Field>
            <Field label="Rate as of">
              <Input
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                }}
              />
            </Field>
            <div className="flex items-end pb-1">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                loading={busy === adding && adding !== ""}
                disabled={adding === "" || rate.trim() === "" || busy !== null}
              >
                Add rate
              </Button>
            </div>
          </FieldRow>
        </form>
      )}
    </Card>
  );
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
  const [value, setValue] = useState(rate.fxRate === null ? "" : formatCount(rate.fxRate));
  const [day, setDay] = useState(rate.fxRateDate);
  const changed = value.replace(/[,\s]/g, "") !== (rate.fxRate === null ? "" : formatCount(rate.fxRate)) || day !== rate.fxRateDate;

  if (!editable) {
    return (
      <p className="mt-3 text-md">
        <strong>{currencyLabel(rate.currency)}</strong>
        {rate.fxRate !== null && (
          <span className="tabular-nums">
            {" "}
            · 1 {rate.currency} = {formatCount(rate.fxRate)} {books}, as of {longDay(rate.fxRateDate)}
          </span>
        )}
      </p>
    );
  }

  return (
    <form
      className="mt-4 border-t border-line-soft pt-3"
      aria-label={`Rate for ${rate.currency}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() !== "") void onSave(value.replace(/[,\s]/g, ""), day);
      }}
    >
      <FieldRow>
        <Field
          label={`1 ${rate.currency} is how many ${books}`}
          hint={`${currencyLabel(rate.currency)}${used > 0 ? `, used by ${String(used)} ${used === 1 ? "fee" : "fees"}` : ""}`}
        >
          <AmountInput
            decimals={10}
            value={value}
            required
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        </Field>
        <Field label="Rate as of">
          <Input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
            }}
          />
        </Field>
        <div className="cluster items-end pb-1">
          <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={!changed || busy}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || used > 0}
            title={used > 0 ? `Move or remove the fees in ${rate.currency} first.` : undefined}
            onClick={() => {
              void onRemove();
            }}
          >
            Remove
          </Button>
        </div>
      </FieldRow>
    </form>
  );
}
