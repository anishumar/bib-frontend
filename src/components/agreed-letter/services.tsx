"use client";

import { useId, useMemo, useState } from "react";
import { AmountInput, Button, Checkbox, Icon, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/api/client";
import { FREQUENCY_WORDS } from "@/components/proposal-document/words";
import type { BillingFrequency } from "@/components/proposal-document/words";
import type { CatalogueService } from "@/components/proposal-builder/data";

/** What the short letter bills on: no "custom", which needs a schedule written by hand. */
export const AGREED_FREQUENCIES = ["one_time", "monthly", "quarterly", "annually"] as const;
export type AgreedFrequency = (typeof AGREED_FREQUENCIES)[number];

/** One agreed service, before it is a line on the letter. */
export interface AgreedRow {
  readonly key: string;
  readonly service: CatalogueService;
  /** The company the work is for: the client itself unless it has several. */
  readonly entityId: string;
  readonly fee: string;
  readonly frequency: AgreedFrequency | "";
  /** Set once the row is a line on the draft; it can no longer change. */
  readonly lineId: string | null;
}

export function newRow(service: CatalogueService, currency: string, entityId: string): AgreedRow {
  const price = service.listPrice;
  const recurrence = service.recurrence;
  return {
    key: service.key,
    service,
    entityId,
    // The list price only when it is in the letter's money: another currency's
    // figure is not this letter's fee.
    fee: price !== null && price.currency === currency ? price.amount.replace(/\.0+$/, "") : "",
    frequency: AGREED_FREQUENCIES.find((f) => f === recurrence) ?? "",
    lineId: null,
  };
}

/**
 * The services the client agreed to: a search over the catalogue for the
 * letter's country, ticked into rows that take the agreed fee and how often it
 * is billed. Everything else a full letter asks (scope wording, sections,
 * advances) stays with the full builder.
 */
export function AgreedServices({
  catalogue,
  rows,
  onRows,
  currency,
  companies,
  seesFees,
  locked,
}: {
  catalogue: readonly CatalogueService[];
  rows: readonly AgreedRow[];
  onRows: (rows: AgreedRow[]) => void;
  currency: string;
  /** The client's companies; one means nobody is asked. */
  companies: readonly { id: string; name: string }[];
  /** False: the API quotes the list price, so no fee box is shown. */
  seesFees: boolean;
  /** The client or letter is not settled yet, or the letter is being recorded. */
  locked: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const only = companies.length === 1 ? (companies[0]?.id ?? "") : "";
  const ticked = new Set(rows.map((r) => r.key));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter(
      (s) => q === "" || s.name.toLowerCase().includes(q) || (s.ref ?? "").toLowerCase().includes(q),
    );
  }, [catalogue, query]);

  function toggle(s: CatalogueService, on: boolean): void {
    if (on) onRows([...rows, newRow(s, currency, only)]);
    else onRows(rows.filter((r) => r.key !== s.key || r.lineId !== null));
  }

  function change(key: string, next: Partial<AgreedRow>): void {
    onRows(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor={searchId} className="label">
          Find a service
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          placeholder="e.g. GST or payroll"
          disabled={locked}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <ul className="m-0 mt-2 max-h-64 list-none overflow-y-auto rounded-md border border-line p-0" aria-label="Services">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted">No service by that name in this country.</li>
          ) : (
            matches.map((s) => {
              const priced = s.listPrice === null ? null : formatMoney(s.listPrice.amount, s.listPrice.currency);
              const often = s.recurrence === null ? "" : ` ${FREQUENCY_WORDS[s.recurrence as BillingFrequency]}`;
              const row = rows.find((r) => r.key === s.key);
              return (
                <li key={s.key} className="border-b border-line px-3 py-2 last:border-b-0">
                  <Checkbox
                    label={`${s.ref === null ? "" : `${s.ref} · `}${s.name}`}
                    note={seesFees && priced !== null ? `List price ${priced}${often}` : undefined}
                    checked={ticked.has(s.key)}
                    // A service already on the draft stays: the letter holds it.
                    disabled={locked || row?.lineId != null}
                    onChange={(e) => {
                      toggle(s, e.target.checked);
                    }}
                  />
                </li>
              );
            })
          )}
        </ul>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col gap-3" role="list" aria-label="Agreed services">
          {rows.map((r) => {
            const fixed = locked || r.lineId !== null;
            return (
              <div
                key={r.key}
                role="listitem"
                data-service={r.key}
                className="agreed-row rounded-md border border-line bg-surface-sunk px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="m-0 font-semibold">
                    {r.service.ref === null ? "" : `${r.service.ref} · `}
                    {r.service.name}
                    {r.lineId !== null && <span className="ml-2 text-sm font-normal text-muted">on the draft</span>}
                  </p>
                  {r.lineId === null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      aria-label={`Remove ${r.service.name}`}
                      icon={<Icon name="close" size={16} />}
                      onClick={() => {
                        toggle(r.service, false);
                      }}
                    />
                  )}
                </div>
                <div className="agreed-row-fields mt-2">
                  {companies.length > 1 && (
                    <label className="flex flex-col gap-1">
                      <span className="label">For</span>
                      <Select
                        value={r.entityId}
                        disabled={fixed}
                        onChange={(e) => {
                          change(r.key, { entityId: e.target.value });
                        }}
                      >
                        <option value="" disabled>
                          Choose the company…
                        </option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="label">Fee agreed ({currency})</span>
                    {seesFees ? (
                      <AmountInput
                        value={r.fee}
                        disabled={fixed}
                        placeholder="e.g. 25,000"
                        onChange={(e) => {
                          change(r.key, { fee: e.target.value });
                        }}
                      />
                    ) : (
                      <span className="py-2 text-muted">The list price</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="label">Billed</span>
                    <Select
                      value={r.frequency}
                      disabled={fixed}
                      onChange={(e) => {
                        change(r.key, { frequency: e.target.value as AgreedFrequency });
                      }}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {AGREED_FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {FREQUENCY_WORDS[f]}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
