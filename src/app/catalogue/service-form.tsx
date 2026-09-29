"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { ConfigEntry, ServiceAxis } from "@/lib/api/client";
import { formatMoney } from "@/lib/api/client";
import {
  Card,
  CardHead,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Select,
  Textarea,
  AmountInput,
} from "@/components/ui";
import { cleanAmount, previewAmount } from "@/lib/money";
import { CountriesPicker } from "./parts";
import {
  BASIS_WORDS,
  BILLING_BASES,
  RECURRENCES,
  RECURRENCE_WORDS,
  SCOPE_BLOCKS,
  type ServiceDraft,
} from "./service";

export type Refusals = Partial<Record<"name" | "amount" | "slaDays", string>>;

/**
 * The service form: "Add a service" and "Edit" both, so the two cannot ask for
 * a service differently (brief §8.4). Three short sections, each its own card:
 *
 *   Basics            name, code, Dept, team, countries, process, turnaround
 *   Price             amount, currency (follows the country), how often,
 *                     how it is charged, a note
 *   What's included   the four texts a letter is built from
 *
 * The Add page puts a fourth, the compliance filings, OUTSIDE this `<form>`:
 * the filing editor is a column of text boxes, and Enter in a box inside a
 * form submits it. The page's buttons reach the form by `formId`.
 *
 * Controlled, unlike the old per-card `FormData` forms, because the currency
 * follows the countries ticked and a price preview follows the amount.
 * `description` and `category` are not asked: nothing reads them, and an edit
 * keeps whatever a body already says (`bodyOf`'s `kept`).
 */
export function ServiceForm({
  formId,
  draft,
  onChange,
  axes,
  workflows,
  suggestedCountries,
  currencies,
  currencyFor,
  refused,
  onSubmit,
}: {
  formId: string;
  draft: ServiceDraft;
  onChange: (next: ServiceDraft) => void;
  /** The firm's Depts and teams: the full structure for an admin (retired rows
   *  marked), else the active ones. Empty = the firm has no list yet. */
  axes: readonly ServiceAxis[];
  workflows: readonly ConfigEntry[];
  suggestedCountries: readonly string[];
  currencies: readonly string[];
  /** The currency a service offered in this country starts in. */
  currencyFor: (country: string | null) => string;
  /** The form's own refusals, beside each box, after a save was pressed. */
  refused: Refusals;
  /** "publish" or "draft": which of the page's two buttons submitted. */
  onSubmit: (mode: "publish" | "draft") => void;
}) {
  const set = (patch: Partial<ServiceDraft>): void => {
    onChange({ ...draft, ...patch });
  };

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    onSubmit(submitter?.value === "draft" ? "draft" : "publish");
  }

  const amount = cleanAmount(draft.amount);
  const preview =
    refused.amount !== undefined || amount === "" || previewAmount(amount, draft.currency) === null
      ? undefined
      : formatMoney(amount, draft.currency);

  return (
    <form id={formId} onSubmit={submit} className="stack loose" noValidate>
      <Card>
        <CardHead level={2} title="Basics" />
        <FieldStack>
          <FieldRow>
            <Field id={`${formId}-name`} label="Name" error={refused.name ?? null}>
              <Input
                value={draft.name}
                placeholder="e.g. UAE bookkeeping"
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Code" optional hint="Your firm's own code. Printed on proposals.">
              <Input
                value={draft.ref}
                maxLength={32}
                placeholder="e.g. R12"
                onChange={(e) => set({ ref: e.target.value })}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <AxisField
              id={`${formId}-module`}
              label="Dept"
              rows={axes.filter((a) => a.axis === "dept")}
              value={draft.module}
              placeholder="e.g. FRC"
              onChange={(module) => set({ module })}
            />
            <AxisField
              id={`${formId}-group`}
              label="Delivery team"
              rows={axes.filter((a) => a.axis === "team")}
              value={draft.group}
              placeholder="e.g. FINCOMPLIANCE"
              onChange={(group) => set({ group })}
            />
          </FieldRow>
          <CountriesPicker
            label="Offered in"
            value={draft.jurisdictions}
            suggested={suggestedCountries}
            onChange={(jurisdictions) => {
              // THE CURRENCY FOLLOWS THE COUNTRY while the partner has not
              // chosen one: the first country ticked, else the books currency.
              const before = currencyFor(draft.jurisdictions[0] ?? null);
              const follows = draft.currency === before;
              set({
                jurisdictions,
                ...(follows ? { currency: currencyFor(jurisdictions[0] ?? null) } : {}),
              });
            }}
          />
          <FieldRow>
            <Field
              id={`${formId}-workflowTemplateKey`}
              label="How it is delivered"
              optional
              hint={
                <>
                  Jobs wait until a process is chosen. <Link href="/admin/workflows">Write one</Link>
                </>
              }
            >
              <Select
                value={draft.workflowTemplateKey}
                onChange={(e) => set({ workflowTemplateKey: e.target.value })}
              >
                <option value="">No process yet</option>
                {workflows
                  .filter((w) => w.published !== null || w.entry.key === draft.workflowTemplateKey)
                  .map((w) => (
                    <option key={w.entry.key} value={w.entry.key}>
                      {processLabel(w)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              id={`${formId}-slaDays`}
              label="Turnaround, days"
              optional
              error={refused.slaDays ?? null}
              hint={
                draft.recurrence === "monthly" ||
                draft.recurrence === "quarterly" ||
                draft.recurrence === "annually"
                  ? "Days after each period ends."
                  : "Days from signing."
              }
            >
              <Input
                inputMode="numeric"
                value={draft.slaDays}
                placeholder="e.g. 10"
                onChange={(e) => set({ slaDays: e.target.value })}
              />
            </Field>
          </FieldRow>
        </FieldStack>
      </Card>

      <Card>
        <CardHead level={2} title="Price" />
        <FieldStack>
          <FieldRow>
            <Field id={`${formId}-amount`} label="Amount" optional error={refused.amount ?? null} hint={preview ?? "Leave blank to quote per client."}>
              <AmountInput
                value={draft.amount}
                placeholder="e.g. 25,000"
                onChange={(e) => set({ amount: e.target.value })}
              />
            </Field>
            <Field label="Currency" hint="Follows the country.">
              <Select value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How often">
              <Select value={draft.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
                <option value="">Not set</option>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_WORDS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Charged as">
              <Select value={draft.billingBasis} onChange={(e) => set({ billingBasis: e.target.value })}>
                {BILLING_BASES.map((b) => (
                  <option key={b} value={b}>
                    {BASIS_WORDS[b]}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <Field label="Pricing note" optional>
            <Input
              value={draft.pricingNote}
              placeholder="e.g. Plus statutory fees at actuals"
              onChange={(e) => set({ pricingNote: e.target.value })}
            />
          </Field>
        </FieldStack>
      </Card>

      <Card>
        <CardHead level={2} title={<>What&rsquo;s included</>} />
        {/* Two by two: four boxes in a three-column grid left one alone on
            a second row. */}
        <FieldStack>
          {[SCOPE_BLOCKS.slice(0, 2), SCOPE_BLOCKS.slice(2)].map((pair) => (
            <FieldRow key={pair[0]?.field}>
              {pair.map((block) => (
                <Field key={block.field} id={`${formId}-${block.field}`} label={block.heading} optional>
                  <Textarea
                    rows={3}
                    value={draft[block.field]}
                    placeholder={block.placeholder}
                    onChange={(e) => set({ [block.field]: e.target.value })}
                  />
                </Field>
              ))}
            </FieldRow>
          ))}
        </FieldStack>
      </Card>
    </form>
  );
}

/** A process as the firm named it, else its key. */
export function processLabel(w: ConfigEntry): string {
  const label = (w.published ?? w.pendingDraft)?.body["label"];
  return typeof label === "string" && label.trim() !== "" ? label : w.entry.key;
}

/**
 * One of the two axis fields: a picker of the firm's list, or a text box when
 * the firm has not written that list yet (then anything is accepted, as the
 * API does). A service already naming a code no longer on the list keeps it as
 * a marked option rather than losing it silently: a save rewrites the whole
 * body, and a blanked Dept would move revenue nobody meant to move.
 */
function AxisField({
  id,
  label,
  rows,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  rows: readonly ServiceAxis[];
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}): ReactNode {
  if (rows.length === 0) {
    return (
      <Field id={id} label={label} optional hint="Capital letters, as your firm writes it.">
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  const stale = value !== "" && !rows.some((r) => r.code === value);
  return (
    <Field
      id={id}
      label={label}
      optional
      error={stale ? "This code is no longer on your firm's list. Pick one." : null}
    >
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {rows.map((r) => (
          <option key={r.id} value={r.code}>
            {r.name === r.code ? r.code : `${r.code}: ${r.name}`}
            {r.isActive ? "" : " (retired)"}
          </option>
        ))}
        {stale && <option value={value}>{value} (no longer on the list)</option>}
      </Select>
    </Field>
  );
}

/** The form's refusals already on screen that still hold: a box's sentence
 *  goes the moment it is fixed, and nothing new appears until the next save. */
export function stillRefused(shown: Refusals, now: Refusals): Refusals {
  const out: Refusals = {};
  for (const k of ["name", "amount", "slaDays"] as const) {
    const sentence = now[k];
    if (shown[k] !== undefined && sentence !== undefined) out[k] = sentence;
  }
  return out;
}
