"use client";

import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Button, ErrorNotice, Field, FieldRow, Input, Select } from "@/components/ui";
import { keepTyped } from "@/lib/ui/keep-typed";

/**
 * A client company's return periods as its tax authorities assigned them
 * (Q073, 0359): e.g. UAE VAT, quarterly on the February stagger. A filing rule
 * that follows "each client's assigned period" for that tax cuts this
 * company's returns on it; with none recorded it gets no filing, and Setup
 * lists it. One per tax; saving again changes it.
 */

type ReturnPeriod = { readonly tax: string; readonly frequency: "monthly" | "quarterly"; readonly firstMonth: number | null };

const STAGGERS: Readonly<Record<number, string>> = {
  1: "Jan, Apr, Jul, Oct",
  2: "Feb, May, Aug, Nov",
  3: "Mar, Jun, Sep, Dec",
};

export function periodWords(p: ReturnPeriod): string {
  return p.frequency === "monthly"
    ? `${p.tax}: monthly`
    : `${p.tax}: quarterly, from ${STAGGERS[p.firstMonth ?? 1] ?? ""}`;
}

export function ReturnPeriods({
  partyId,
  periods,
  canWrite,
  onSaved,
}: {
  partyId: string;
  periods: readonly ReturnPeriod[];
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("quarterly");

  async function save(form: FormData): Promise<void> {
    const tax = String(form.get("tax") ?? "").trim();
    // No `?? 1`: the month is required above, and a missing one must reach the
    // API as the refusal it is rather than becoming January quietly.
    const firstMonth = frequency === "quarterly" ? Number(form.get("firstMonth")) : null;
    setBusy(true);
    setError(null);
    const result = await api.PUT("/api/v1/parties/{partyId}/return-periods", {
      params: { path: { partyId } },
      body: { tax, frequency, firstMonth },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved();
  }

  async function remove(tax: string): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.DELETE("/api/v1/parties/{partyId}/return-periods/{tax}", {
      params: { path: { partyId, tax } },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved();
  }

  if (!canWrite && periods.length === 0) return null;
  return (
    <details className="card-foot" open={periods.length > 0}>
      <summary>Tax return periods</summary>
      {periods.length > 0 && (
        <ul className="stack tight" style={{ marginTop: "var(--s-2)" }}>
          {periods.map((p) => (
            <li key={p.tax} className="cluster">
              <span>{periodWords(p)}</span>
              {canWrite && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(p.tax)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form
          className="stack"
          style={{ marginTop: "var(--s-3)" }}
          onSubmit={(event) =>
            keepTyped(event, (form) => {
              void save(form);
            })
          }
        >
          <FieldRow>
            <Field label="Tax">
              <Input name="tax" placeholder="e.g. VAT" required maxLength={40} />
            </Field>
            <Field label="Files">
              <Select
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value === "monthly" ? "monthly" : "quarterly");
                }}
              >
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>
            {frequency === "quarterly" && (
              /* NO DEFAULT MONTH (Q073). The authority assigns the stagger and
                 all three are ordinary, so a pre-picked January is a guess
                 that rides all the way through to the money: a filing rule on
                 "each client's assigned period" cuts this company's returns on
                 this quarter, and `billingDues({ onClientQuarter })` then bills
                 on that quarter's last day. Whoever knows the stagger has to
                 say it; `required` holds the form until they do. */
              <Field label="Quarters start in">
                <Select name="firstMonth" defaultValue="" required>
                  <option value="">Not chosen yet</option>
                  {Object.entries(STAGGERS).map(([m, words]) => (
                    <option key={m} value={m}>
                      {words}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FieldRow>
          <ErrorNotice error={error} />
          <div className="cluster">
            <Button type="submit" variant="secondary" loading={busy}>
              Save period
            </Button>
          </div>
        </form>
      )}
    </details>
  );
}
