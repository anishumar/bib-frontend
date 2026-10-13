"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { formatCount } from "@/lib/api/client";
import { Button, Field, FieldRow, FieldStack, Input, Select, Textarea, AmountInput } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cleanAmount, convertAmount } from "@/lib/money";
import { longDay } from "@/lib/day";
import { FREQUENCY_WORDS, pdfMoney } from "@/components/proposal-document";
import { FREQUENCIES } from "./data";
import { useSeesFees } from "@/components/fees";
import { QuantityField } from "@/components/quantity-field";
import { CurrencySelect } from "@/components/currency-select";
import type { CatalogueService, Recurrence } from "./data";
import { billingTimingWords } from "@/components/billing-timing";
import type { BillingTiming } from "@/components/billing-timing";

/** The period a fee billed per period is invoiced in (0393). */
const INVOICE_SPAN: Readonly<Record<string, string>> = { monthly: "month", quarterly: "quarter", annually: "year" };
const INVOICE_TIMINGS: readonly BillingTiming[] = ["advance", "on_date"];

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

/**
 * What a row needs of a line already on the document. A proposal's line is one
 * as it comes; a letter's is mapped to it (its `standard` words are the pinned
 * service's, and `inSection` names the section whose fee pays for it).
 */
export interface RowLine {
  readonly id: string;
  readonly unitAmount: string | null;
  readonly currency: string;
  readonly quantity: string;
  readonly discountPercent: string | null;
  readonly billingFrequency: Recurrence | null;
  /** When the fee is invoiced (0393), for the firm only. */
  readonly billingTiming?: BillingTiming | null;
  readonly billingOn?: string | null;
  readonly pricingNote: string | null;
  readonly terms: Readonly<
    Record<ScopeKey, { readonly text: string | null; readonly tailored: boolean; readonly standard: string | null }>
  >;
  /** "B": a letter's section pays for this line, so it has no price of its own. */
  readonly inSection?: string | null;
}

/** Everything a line says beyond which service it is. */
export interface LineTerms {
  /** Null is "no fixed fee", and then `pricingNote` says why. */
  readonly unitAmount: string | null;
  /** What the fee is in (0344): the document's main currency or a rated one. */
  readonly currency: string;
  readonly quantity: string;
  readonly discountPercent: string;
  readonly billingFrequency: Recurrence | null;
  /** When the invoice is raised (0393): never printed on the proposal or letter. */
  readonly billingTiming: BillingTiming | null;
  readonly billingOn: string | null;
  readonly pricingNote: string | null;
  readonly overrides: Overrides;
  /**
   * B09: written by a login that cannot see fees. Its fee, discount and
   * pricing note were never shown and are not sent: on a new line the API
   * quotes the catalogue's list price, on an existing one it keeps them.
   */
  readonly feesUnchanged?: boolean;
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
 *
 * OTHER CURRENCIES (0344): when the document holds a rate for the list price's
 * currency, the tick adds the line at that price, in that currency. A fee
 * typed by hand can be in the main currency or any rated one.
 */
export function ServiceRow<L extends RowLine>({
  service,
  lines,
  currency,
  currencies = [currency],
  editable,
  busy,
  error,
  onAdd,
  onRemove,
  onSave,
  extra,
  noun = "proposal",
  blocked = null,
  autoRate = false,
  rateOf,
  onRate,
}: {
  service: CatalogueService;
  /** The live lines of this document pinned to this service. Normally one. */
  lines: readonly L[];
  /** The document's MAIN currency. */
  currency: string;
  /** The main currency and every one the document holds a rate for. */
  currencies?: readonly string[];
  editable: boolean;
  busy: boolean;
  error: string | null;
  onAdd: (terms: LineTerms) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  /** Changes an added line. True when the API took it. */
  onSave: (line: L, terms: LineTerms) => Promise<boolean>;
  /** Shown under the row once the service is on the document. */
  extra?: ReactNode;
  /** What the document is called in the row's words. */
  noun?: "proposal" | "letter";
  /** Why a tick cannot be taken yet: the checkbox waits. The caller says why,
   *  once, where the missing answer is asked for. */
  blocked?: string | null;
  /** A list price in a currency the document holds no rate for still reads
   *  as that price, and ticking it adds it: the caller adds the rate first
   *  (the proposal builder, 2026-10-10). */
  autoRate?: boolean;
  /** A currency's rate in the firm's own currency, the main one included;
   *  null when not known. Given, the row offers to switch a fee between the
   *  catalogue's currency and the document's main one, and Edit shows the
   *  rate (the proposal builder, 2026-10-10). */
  rateOf?: (currency: string) => { rate: string; on: string; books: string } | null;
  /** Sets a currency's rate from Edit; the API's refusal, or null. */
  onRate?: (currency: string, rate: string) => Promise<string | null>;
}) {
  const detailsId = useId();
  // B09: a login that cannot see fees reads every list price and every line's
  // fee as null. Its row says Hidden, a tick asks the API to quote the list
  // price, and its Details leave the fee alone.
  const blind = useSeesFees() === false;
  const [open, setOpen] = useState(false);
  /** A tick waiting for its fee: "fee" asks for an amount, "agreed" for why
   *  there is none. */
  const [asking, setAsking] = useState<"fee" | "agreed" | null>(null);
  const [fee, setFee] = useState("");
  const [why, setWhy] = useState(service.pricingNote ?? "As mutually agreed");

  const line = lines[0] ?? null;
  const added = line !== null;
  const priced =
    service.listPrice !== null && (autoRate || currencies.includes(service.listPrice.currency))
      ? service.listPrice
      : null;
  const [feeCurrency, setFeeCurrency] = useState(priced?.currency ?? currency);

  const standard: LineTerms = {
    // The catalogue's "4000.00" shown as a person writes it in the Details form.
    unitAmount: priced === null ? null : formatCount(priced.amount),
    currency: priced?.currency ?? currency,
    quantity: "1",
    discountPercent: "0",
    billingFrequency: service.recurrence,
    billingTiming: null,
    billingOn: null,
    pricingNote: null,
    overrides: NO_OVERRIDES,
  };

  function tick(checked: boolean): void {
    if (!checked) {
      setAsking(null);
      if (added) void onRemove();
      return;
    }
    if (blocked !== null) return;
    if (blind) {
      // Neither a fee nor a reason: the API quotes the list price, or says
      // there is none, and then the fee box opens as it would for anybody.
      void onAdd({ ...standard, unitAmount: null, pricingNote: null, feesUnchanged: true }).then((ok) => {
        if (!ok) {
          setFee("");
          setAsking("fee");
        }
      });
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
        : { ...standard, unitAmount: cleanAmount(fee), currency: feeCurrency };
    if (await onAdd(terms)) setAsking(null);
  }

  const label = [service.ref, service.name].filter(Boolean).join(" ");

  /* SWITCH THE QUOTE'S CURRENCY (2026-10-10). A line in another currency can
     be quoted in the document's main one instead, converted at the rate it
     holds; a line in the main one whose catalogue price is in another goes
     back to that list price. Offered only where both halves are known. */
  const switchTo = ((): { currency: string; amount: string } | null => {
    if (rateOf === undefined || line === null || line.unitAmount === null || blind) return null;
    if (line.currency !== currency) {
      const from = rateOf(line.currency);
      const to = rateOf(currency);
      if (from === null || to === null) return null;
      const amount = convertAmount(line.unitAmount, from.rate, to.rate);
      return amount === null ? null : { currency, amount };
    }
    const list = service.listPrice;
    if (list === null || list.currency === currency) return null;
    return { currency: list.currency, amount: list.amount };
  })();

  return (
    <li data-open={open ? "" : undefined} data-added={added ? "" : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex min-w-0 flex-1 basis-60 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={added || asking !== null}
            disabled={!editable || busy || (!added && blocked !== null)}
            aria-label={`Include ${label}`}
            onChange={(e) => {
              tick(e.target.checked);
            }}
          />
          <span className="w-12 shrink-0 pt-px text-md tabular-nums text-ink-2">{service.ref ?? ""}</span>
          <span className="min-w-0 flex-1 text-md text-ink">{service.name}</span>
        </label>
        <span className="ml-auto flex items-center gap-1 text-right text-md">
          <PriceLabel
            service={service}
            line={line}
            currencies={autoRate && priced !== null ? [...currencies, priced.currency] : currencies}
            blind={blind}
          />
          {switchTo !== null && editable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              title={`Quote it in ${switchTo.currency} instead`}
              aria-label={`Quote ${label} in ${switchTo.currency}`}
              onClick={() => {
                if (line !== null) void onSave(line, { ...termsOf(line), currency: switchTo.currency, unitAmount: switchTo.amount });
              }}
            >
              ⇄ {switchTo.currency}
            </Button>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`Edit ${label}`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {error !== null && (
        <p className="ml-8 mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {added && extra !== undefined && <div className="ml-8 mt-2">{extra}</div>}

      {asking !== null && !added && (
        <div className="ml-8 mt-3 flex flex-wrap items-end gap-3">
          {asking === "fee" && currencies.length > 1 && !blind && (
            <Field label="Currency">
              <CurrencySelect
                only={currencies}
                value={feeCurrency}
                onChange={(e) => {
                  setFeeCurrency(e.target.value);
                }}
              />
            </Field>
          )}
          {asking === "fee" ? (
            <Field
              label={`Fee in ${feeCurrency}`}
              hint={
                blind
                  ? "No list price in this currency. Press Enter to add."
                  : service.listPrice === null
                  ? `No list price in the catalogue. ${service.pricingNote ?? ""}`.trim()
                  : `The catalogue lists ${pdfMoney(service.listPrice.amount, service.listPrice.currency)}. Press Enter to add.`
              }
            >
              <AmountInput
                autoFocus
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
            currencies={currencies}
            editable={editable}
            busy={busy}
            noun={noun}
            blind={blind}
            initial={line === null ? standard : termsOf(line)}
            {...(rateOf === undefined ? {} : { rateOf })}
            {...(onRate === undefined ? {} : { onRate })}
            anyCurrency={autoRate}
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
  currencies,
  blind,
}: {
  service: CatalogueService;
  line: RowLine | null;
  /** The currencies the document can price in: a list price in one of them
   *  is what a tick adds. */
  currencies: readonly string[];
  /** The login cannot see fees: every figure here is one it may not read. */
  blind: boolean;
}) {
  if (line !== null) {
    if (line.inSection !== undefined && line.inSection !== null) {
      return <span className="text-muted">In section {line.inSection}</span>;
    }
    if (blind) return <span className="not-set">Hidden</span>;
    if (line.unitAmount === null) return <span className="text-muted">No fixed fee</span>;
    const per = line.billingFrequency === null ? "" : ` ${FREQUENCY_WORDS[line.billingFrequency]}`;
    // HOW MANY, BEFORE THE PRICE (F03): "12 x INR 25,000 Monthly" reads as
    // twelve each month, which is what it bills; "INR 25,000 Monthly x 12"
    // read as a year of months.
    const qty = line.quantity === "1" || formatCount(line.quantity) === "1" ? "" : `${formatCount(line.quantity)} × `;
    return (
      <span className="tabular-nums">
        {qty}
        {pdfMoney(line.unitAmount, line.currency)}
        {per}
      </span>
    );
  }
  if (service.listPrice !== null && currencies.includes(service.listPrice.currency)) {
    return (
      <span className="tabular-nums">
        {pdfMoney(service.listPrice.amount, service.listPrice.currency)}
        {service.recurrence === null ? "" : ` ${FREQUENCY_WORDS[service.recurrence]}`}
      </span>
    );
  }
  if (blind) return <span className="not-set">Hidden</span>;
  return <span className="text-muted">Set fee</span>;
}

/** An added line's terms, as the Details form edits them. */
export function termsOf(line: RowLine): LineTerms {
  const own = (t: { text: string | null; tailored: boolean }): string | null =>
    t.tailored ? t.text : null;
  return {
    // "2500.0000" is the column's scale, not what anybody typed. Trimmed on the
    // string, never through a number.
    unitAmount: line.unitAmount === null ? null : formatCount(line.unitAmount),
    currency: line.currency,
    quantity: formatCount(line.quantity),
    discountPercent: line.discountPercent === null ? "0" : formatCount(line.discountPercent),
    billingFrequency: line.billingFrequency,
    billingTiming: line.billingTiming ?? null,
    billingOn: line.billingOn ?? null,
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
  currencies,
  editable,
  busy,
  noun,
  blind,
  initial,
  onSubmit,
  rateOf,
  onRate,
  anyCurrency = false,
}: {
  service: CatalogueService;
  line: RowLine | null;
  currency: string;
  currencies: readonly string[];
  rateOf?: (currency: string) => { rate: string; on: string; books: string } | null;
  onRate?: (currency: string, rate: string) => Promise<string | null>;
  /** Any currency may be chosen; the caller adds its rate on save. */
  anyCurrency?: boolean;
  editable: boolean;
  busy: boolean;
  noun: "proposal" | "letter";
  /** The login cannot see fees: no fee, discount or pricing note here. */
  blind: boolean;
  initial: LineTerms;
  onSubmit: (terms: LineTerms) => Promise<void>;
}) {
  // A letter's line in a section has no price of its own: the section's fee
  // pays for it, and the API refuses a price on it.
  const section = line?.inSection ?? null;
  const [fee, setFee] = useState(initial.unitAmount ?? "");
  // What the fee is in (0344). A currency taken off the document since stays
  // listed, so the form says what the line holds and the API answers a save.
  const [feeCurrency, setFeeCurrency] = useState(initial.currency);
  const choices = currencies.includes(feeCurrency) ? currencies : [...currencies, feeCurrency];
  const [quantity, setQuantity] = useState(initial.quantity);
  const [discount, setDiscount] = useState(initial.discountPercent);
  const [frequency, setFrequency] = useState<Recurrence | "">(initial.billingFrequency ?? "");
  const [timing, setTiming] = useState<BillingTiming | "">(initial.billingTiming ?? "");
  const [timingOn, setTimingOn] = useState(initial.billingOn ?? "");
  const effectiveFrequency = frequency === "" ? service.recurrence : frequency;
  const span = INVOICE_SPAN[effectiveFrequency ?? ""];
  const [note, setNote] = useState(initial.pricingNote ?? "");
  const [overrides, setOverrides] = useState<Overrides>(initial.overrides);
  /** The wording is folded until asked for, unless this line has its own. */
  const [wording, setWording] = useState(Object.values(initial.overrides).some((v) => v !== null));
  const [rateEdit, setRateEdit] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const known = feeCurrency !== currency && rateOf !== undefined ? rateOf(feeCurrency) : null;

  // For an added line the API says what "standard" is: the words of the
  // catalogue version the line is pinned to, which may be older than today's.
  const standardText = (key: ScopeKey): string | null =>
    line === null ? service[key] : line.terms[key].standard;

  return (
    <form
      className="service-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          unitAmount: section !== null || fee.trim() === "" ? null : cleanAmount(fee),
          currency: feeCurrency,
          quantity: cleanAmount(quantity) === "" ? "1" : cleanAmount(quantity),
          discountPercent: cleanAmount(discount) === "" ? "0" : cleanAmount(discount),
          billingFrequency: frequency === "" ? null : frequency,
          // Only a fee billed per period has a day in the period (0393).
          billingTiming: span === undefined || timing === "" ? null : timing,
          billingOn: span !== undefined && timing === "on_date" ? timingOn : null,
          pricingNote: note.trim() === "" ? null : note.trim(),
          overrides,
          ...(blind ? { feesUnchanged: true } : {}),
        });
      }}
    >
      <fieldset
        className="fieldset"
        disabled={!editable}
        aria-label={`Details of ${service.ref ?? ""} ${service.name}`.trim()}
      >
        <FieldStack>
          {section !== null && (
            <p className="text-sm text-muted">Paid by section {section}. Move it out of the section on the letter page.</p>
          )}
          {section === null && blind && (
          <FieldRow>
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
                    ? "Not set"
                    : `As the catalogue says (${FREQUENCY_WORDS[service.recurrence]})`}
                </option>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_WORDS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity">
              <AmountInput decimals={4}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          )}
          {section === null && !blind && (
          <FieldRow>
            {(anyCurrency || choices.length > 1) && (
              <Field label="Currency">
                <CurrencySelect
                  {...(anyCurrency ? {} : { only: choices })}
                  value={feeCurrency}
                  onChange={(e) => {
                    setFeeCurrency(e.target.value);
                  }}
                />
              </Field>
            )}
            <Field
              label={`Fee (${feeCurrency})`}
              hint={
                service.listPrice === null
                  ? "No list price. Leave empty for no fixed fee."
                  : `Catalogue: ${pdfMoney(service.listPrice.amount, service.listPrice.currency)}.`
              }
            >
              <AmountInput
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
                    ? "Not set"
                    : `As the catalogue says (${FREQUENCY_WORDS[service.recurrence]})`}
                </option>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_WORDS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            {/* HOW MANY EACH PERIOD (F03): never a term in months. */}
            <QuantityField
              frequency={frequency === "" ? service.recurrence : frequency}
              currency={feeCurrency}
              unitAmount={fee}
              discountPercent={discount}
              value={quantity}
              onChange={setQuantity}
            />
            <Field label="Discount %">
              <AmountInput decimals={4}
                value={discount}
                onChange={(e) => {
                  setDiscount(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          )}
          {/* WHEN THE INVOICE IS RAISED (0393), chosen with the service rather
              than on the letter's draft; carried to the letter, printed on neither. */}
          {section === null && span !== undefined && (
            <FieldRow>
              <Field label="Invoice raised" hint="For your team. Not printed on the proposal or the letter.">
                <Select
                  value={timing}
                  onChange={(e) => {
                    const t = INVOICE_TIMINGS.find((x) => x === e.target.value);
                    setTiming(t ?? "");
                  }}
                >
                  <option value="">{billingTimingWords(effectiveFrequency, null, null)}</option>
                  <option value="advance">{billingTimingWords(effectiveFrequency, "advance", null)}</option>
                  <option value="on_date">On a date I choose</option>
                </Select>
              </Field>
              {timing === "on_date" && (
                <Field label="First invoice on" hint={`Then every ${span} after it.`}>
                  <Input
                    type="date"
                    required
                    value={timingOn}
                    onChange={(e) => {
                      setTimingOn(e.target.value);
                    }}
                  />
                </Field>
              )}
            </FieldRow>
          )}
          {/* THE RATE, where the fee in another currency is (2026-10-10):
              one line, and Change opens one box. The rates card is gone. */}
          {section === null && !blind && known !== null && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {rateEdit === null ? (
                <>
                  <span className="text-ink-2">
                    1 {feeCurrency} = {Number(Number(known.rate).toFixed(4))} {known.books}{" "}
                    <span className="text-muted">· {longDay(known.on)}</span>
                  </span>
                  {onRate !== undefined && editable && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setRateEdit(String(Number(Number(known.rate).toFixed(4))));
                        setRateError(null);
                      }}
                    >
                      Change rate
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-ink-2">1 {feeCurrency} in {known.books} =</span>
                  <span className="w-32">
                    <AmountInput
                      decimals={10}
                      aria-label={`Rate for ${feeCurrency}`}
                      value={rateEdit}
                      onChange={(e) => {
                        setRateEdit(e.target.value);
                      }}
                    />
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (onRate === undefined || rateEdit.trim() === "") return;
                      void onRate(feeCurrency, cleanAmount(rateEdit)).then((refused) => {
                        if (refused === null) setRateEdit(null);
                        else setRateError(refused);
                      });
                    }}
                  >
                    Save rate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRateEdit(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {rateError !== null && (
                <span role="alert" className="text-danger">
                  {rateError}
                </span>
              )}
            </div>
          )}
          {section === null && !blind && (fee.trim() === "" || note !== "") && (
          <Field
            label="Pricing note"
            optional={fee.trim() !== ""}
            hint={
              fee.trim() === ""
                ? "Required with no fixed fee. Printed in its place."
                : "Printed beside the fee."
            }
          >
            <Input
              value={note}
              placeholder={`e.g. ${service.pricingNote ?? "As mutually agreed"}`}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </Field>
          )}

          {wording && SCOPE_FIELDS.map((f) => {
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
                      aria-label={`Edit "${f.label}" for this ${noun}`}
                      onClick={() => {
                        setOverrides({ ...overrides, [f.key]: std ?? "" });
                      }}
                    >
                      Edit for this {noun}
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
                    {std ?? "Not set in the catalogue."}
                  </p>
                ) : (
                  <Textarea
                    rows={3}
                    aria-label={`${f.label}, for this ${noun}`}
                    value={own}
                    onChange={(e) => {
                      setOverrides({ ...overrides, [f.key]: e.target.value });
                    }}
                  />
                )}
              </div>
            );
          })}

          {(editable || !wording) && (
            <div className="cluster">
              {editable && (
                <Button type="submit" variant="secondary" size="sm" loading={busy}>
                  {line === null ? "Add with these details" : "Save changes"}
                </Button>
              )}
              {!wording && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWording(true);
                  }}
                >
                  Edit the wording for this {noun}
                </Button>
              )}
            </div>
          )}
        </FieldStack>
      </fieldset>
    </form>
  );
}
