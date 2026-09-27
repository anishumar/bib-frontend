"use client";

import { useId, useState } from "react";
import { formatCount, formatMoney } from "@/lib/api/client";
import type { ProposalLine } from "@/lib/api/client";
import { Button, Field, FieldRow, FieldStack, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cleanAmount } from "@/lib/money";
import { FREQUENCIES, FREQUENCY_LABELS, PER } from "./data";
import type { CatalogueService, Recurrence } from "./data";

/** The four scope blocks, as the catalogue screen names them. */
export const SCOPE_FIELDS = [
  { key: "scope", label: "What the firm will do" },
  { key: "clientObligations", label: "What the client must do" },
  { key: "volumeLimits", label: "What the price assumes" },
  { key: "exclusions", label: "What is not included" },
] as const;

export type ScopeKey = (typeof SCOPE_FIELDS)[number]["key"];

/** This proposal's own wording for a scope block; null prints the catalogue's. */
export type Overrides = Readonly<Record<ScopeKey, string | null>>;

/** Everything a line says beyond which service it is. */
export interface LineTerms {
  /** Null is "no fixed fee", and then `pricingNote` says why. */
  readonly unitAmount: string | null;
  readonly quantity: string;
  readonly discountPercent: string;
  readonly billingFrequency: Recurrence | null;
  readonly pricingNote: string | null;
  readonly overrides: Overrides;
}

export const NO_OVERRIDES: Overrides = {
  scope: null,
  clientObligations: null,
  volumeLimits: null,
  exclusions: null,
};

/**
 * One service in the picker: a checkbox, its code, its name, what it costs in
 * this proposal's currency, and its Details.
 *
 * TICKING ADDS THE LINE AT ONCE when the catalogue prices it in this
 * proposal's currency. When it does not (another country's service, or one the
 * firm quotes case by case), the row opens a fee box instead, focused, and the
 * line is added on Enter: the list price in another currency is never
 * converted here, because the only rate this proposal carries goes to the
 * firm's own currency, not to the catalogue's (D3).
 */
export function ServiceRow({
  service,
  lines,
  currency,
  editable,
  busy,
  error,
  onAdd,
  onRemove,
  onSave,
}: {
  service: CatalogueService;
  /** The live lines of this proposal pinned to this service. Normally one. */
  lines: readonly ProposalLine[];
  currency: string;
  editable: boolean;
  busy: boolean;
  error: string | null;
  onAdd: (terms: LineTerms) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  /** Changes an added line. True when the API took it. */
  onSave: (line: ProposalLine, terms: LineTerms) => Promise<boolean>;
}) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  /** A tick waiting for its fee: "fee" asks for an amount, "agreed" for why
   *  there is none. */
  const [asking, setAsking] = useState<"fee" | "agreed" | null>(null);
  const [fee, setFee] = useState("");
  const [why, setWhy] = useState(service.pricingNote ?? "As mutually agreed");

  const line = lines[0] ?? null;
  const added = line !== null;
  const priced =
    service.listPrice !== null && service.listPrice.currency === currency ? service.listPrice : null;

  const standard: LineTerms = {
    unitAmount: priced?.amount ?? null,
    quantity: "1",
    discountPercent: "0",
    billingFrequency: service.recurrence,
    pricingNote: null,
    overrides: NO_OVERRIDES,
  };

  function tick(checked: boolean): void {
    if (!checked) {
      setAsking(null);
      if (added) void onRemove();
      return;
    }
    if (priced !== null) {
      void onAdd(standard);
      return;
    }
    setFee("");
    setAsking("fee");
  }

  async function addAsked(): Promise<void> {
    const terms: LineTerms =
      asking === "agreed"
        ? { ...standard, unitAmount: null, pricingNote: why.trim() }
        : { ...standard, unitAmount: cleanAmount(fee) };
    if (await onAdd(terms)) setAsking(null);
  }

  const label = [service.ref, service.name].filter(Boolean).join(" ");

  return (
    <li className="border-b border-line-soft py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={added || asking !== null}
            disabled={!editable || busy}
            aria-label={`Include ${label}`}
            onChange={(e) => {
              tick(e.target.checked);
            }}
          />
          <span className="mono w-12 shrink-0 pt-px text-sm text-muted">{service.ref ?? ""}</span>
          <span className="min-w-0 flex-1 text-md text-ink">{service.name}</span>
        </label>
        <span className="ml-auto text-right text-md">
          <PriceLabel service={service} line={line} currency={currency} />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`Details of ${label}`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          Details
        </Button>
      </div>

      {error !== null && (
        <p className="ml-8 mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {asking !== null && !added && (
        <div className="ml-8 mt-3 flex flex-wrap items-end gap-3">
          {asking === "fee" ? (
            <Field
              label={`Fee in ${currency}`}
              hint={
                service.listPrice === null
                  ? `No list price in the catalogue. ${service.pricingNote ?? ""}`.trim()
                  : `The catalogue lists ${formatMoney(service.listPrice.amount, service.listPrice.currency)}. Press Enter to add.`
              }
            >
              <Input
                autoFocus
                inputMode="decimal"
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (fee.trim() !== "") void addAsked();
                  } else if (e.key === "Escape") {
                    setAsking(null);
                  }
                }}
              />
            </Field>
          ) : (
            <Field label="Why there is no fixed fee" hint="Printed where the fee would be.">
              <Input
                autoFocus
                value={why}
                onChange={(e) => {
                  setWhy(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (why.trim() !== "") void addAsked();
                  } else if (e.key === "Escape") {
                    setAsking(null);
                  }
                }}
              />
            </Field>
          )}
          <div className="cluster pb-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={busy}
              disabled={busy || (asking === "fee" ? fee.trim() === "" : why.trim() === "")}
              onClick={() => {
                void addAsked();
              }}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(asking === "fee" ? "agreed" : "fee");
              }}
            >
              {asking === "fee" ? "No fixed fee" : "Enter a fee"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && (
        <div id={detailsId} className="ml-8 mt-3">
          <Details
            key={line?.id ?? "new"}
            service={service}
            line={line}
            currency={currency}
            editable={editable}
            busy={busy}
            initial={line === null ? standard : termsOf(line)}
            onSubmit={async (terms) => {
              const ok = line === null ? await onAdd(terms) : await onSave(line, terms);
              if (ok) setOpen(false);
            }}
          />
        </div>
      )}
    </li>
  );
}

/** What a row says it costs. */
function PriceLabel({
  service,
  line,
  currency,
}: {
  service: CatalogueService;
  line: ProposalLine | null;
  currency: string;
}) {
  if (line !== null) {
    if (line.unitAmount === null) return <span className="text-muted">No fixed fee</span>;
    const per = line.billingFrequency === null ? "" : ` ${PER[line.billingFrequency]}`;
    const qty = line.quantity === "1" || formatCount(line.quantity) === "1" ? "" : ` × ${formatCount(line.quantity)}`;
    return (
      <span className="mono">
        {formatMoney(line.unitAmount, line.currency)}
        {per}
        {qty}
      </span>
    );
  }
  if (service.listPrice !== null && service.listPrice.currency === currency) {
    return (
      <span className="mono">
        {formatMoney(service.listPrice.amount, service.listPrice.currency)}
        {service.recurrence === null ? "" : ` ${PER[service.recurrence]}`}
      </span>
    );
  }
  return <span className="text-muted">Set fee</span>;
}

/** An added line's terms, as the Details form edits them. */
export function termsOf(line: ProposalLine): LineTerms {
  const own = (t: { text: string | null; tailored: boolean }): string | null =>
    t.tailored ? t.text : null;
  return {
    // "2500.0000" is the column's scale, not what anybody typed. Trimmed on the
    // string, never through a number.
    unitAmount: line.unitAmount === null ? null : formatCount(line.unitAmount),
    quantity: formatCount(line.quantity),
    discountPercent: line.discountPercent === null ? "0" : formatCount(line.discountPercent),
    billingFrequency: line.billingFrequency,
    pricingNote: line.pricingNote,
    overrides: {
      scope: own(line.terms.scope),
      clientObligations: own(line.terms.clientObligations),
      volumeLimits: own(line.terms.volumeLimits),
      exclusions: own(line.terms.exclusions),
    },
  };
}

/**
 * The fee, the frequency and the wording of ONE line on THIS proposal.
 *
 * Every scope block starts as the catalogue's words and can be rewritten for
 * this proposal only (D7): "Edit for this proposal" opens the words to change,
 * "Back to standard" drops this proposal's own and prints the catalogue's
 * again. The catalogue itself is never written from here.
 */
function Details({
  service,
  line,
  currency,
  editable,
  busy,
  initial,
  onSubmit,
}: {
  service: CatalogueService;
  line: ProposalLine | null;
  currency: string;
  editable: boolean;
  busy: boolean;
  initial: LineTerms;
  onSubmit: (terms: LineTerms) => Promise<void>;
}) {
  const [fee, setFee] = useState(initial.unitAmount ?? "");
  const [quantity, setQuantity] = useState(initial.quantity);
  const [discount, setDiscount] = useState(initial.discountPercent);
  const [frequency, setFrequency] = useState<Recurrence | "">(initial.billingFrequency ?? "");
  const [note, setNote] = useState(initial.pricingNote ?? "");
  const [overrides, setOverrides] = useState<Overrides>(initial.overrides);

  const standardText = (key: ScopeKey): string | null =>
    line?.service?.[key] ?? service[key];

  return (
    <form
      className="rounded-md border border-line bg-surface-sunk p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          unitAmount: fee.trim() === "" ? null : cleanAmount(fee),
          quantity: quantity.trim() === "" ? "1" : quantity.trim(),
          discountPercent: discount.trim() === "" ? "0" : discount.trim(),
          billingFrequency: frequency === "" ? null : frequency,
          pricingNote: note.trim() === "" ? null : note.trim(),
          overrides,
        });
      }}
    >
      <fieldset
        className="fieldset"
        disabled={!editable}
        aria-label={`Details of ${service.ref ?? ""} ${service.name}`.trim()}
      >
        <FieldStack>
          <FieldRow>
            <Field
              label={`Fee (${currency})`}
              hint={
                service.listPrice === null
                  ? "No list price in the catalogue. Leave it empty for no fixed fee, and say why below."
                  : service.listPrice.currency === currency
                    ? `The catalogue lists ${formatMoney(service.listPrice.amount, service.listPrice.currency)}.`
                    : `The catalogue lists ${formatMoney(service.listPrice.amount, service.listPrice.currency)}, in another currency.`
              }
            >
              <Input
                inputMode="decimal"
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                }}
              />
            </Field>
            <Field label="How often">
              <Select
                value={frequency}
                onChange={(e) => {
                  const f = FREQUENCIES.find((x) => x === e.target.value);
                  setFrequency(f ?? "");
                }}
              >
                <option value="">
                  {service.recurrence === null
                    ? "Not stated"
                    : `As the catalogue says (${FREQUENCY_LABELS[service.recurrence]})`}
                </option>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity">
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                }}
              />
            </Field>
            <Field label="Discount %">
              <Input
                inputMode="decimal"
                value={discount}
                onChange={(e) => {
                  setDiscount(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          <Field
            label="Pricing note"
            optional={fee.trim() !== ""}
            hint={
              fee.trim() === ""
                ? "Required when there is no fixed fee: it is printed where the fee would be."
                : "Printed beside the fee, for example \"plus statutory fees at actuals\"."
            }
          >
            <Input
              value={note}
              placeholder={service.pricingNote ?? "As mutually agreed"}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </Field>

          {SCOPE_FIELDS.map((f) => {
            const std = standardText(f.key);
            const own = overrides[f.key];
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-2">{f.label}</span>
                  {own === null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit "${f.label}" for this proposal`}
                      onClick={() => {
                        setOverrides({ ...overrides, [f.key]: std ?? "" });
                      }}
                    >
                      Edit for this proposal
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Put "${f.label}" back to the standard wording`}
                      onClick={() => {
                        setOverrides({ ...overrides, [f.key]: null });
                      }}
                    >
                      Back to standard
                    </Button>
                  )}
                </div>
                {own === null ? (
                  <p className={cn("text-md", std === null && "text-muted")}>
                    {std ?? "The catalogue says nothing here."}
                  </p>
                ) : (
                  <Textarea
                    rows={3}
                    aria-label={`${f.label}, for this proposal`}
                    value={own}
                    onChange={(e) => {
                      setOverrides({ ...overrides, [f.key]: e.target.value });
                    }}
                  />
                )}
              </div>
            );
          })}

          {editable && (
            <div className="cluster">
              <Button type="submit" variant="secondary" size="sm" loading={busy}>
                {line === null ? "Add with these details" : "Save changes"}
              </Button>
            </div>
          )}
        </FieldStack>
      </fieldset>
    </form>
  );
}
