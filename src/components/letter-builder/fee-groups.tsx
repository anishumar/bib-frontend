"use client";

/**
 * SECTIONS AND FEES — one fee for several services: a letter's (0083) and,
 * since 0394, a proposal's.
 *
 * ── WHAT A FEE GROUP IS, AND WHY THE DOCUMENTS NEED ONE ───────────────────
 *
 * "USD 5,000 per month" for accounting, tax and payroll across a client's four
 * companies is TWELVE lines here — an engagement is one service for one legal
 * entity — and until 0083 every one of them had to carry a price of its own.
 * There was no honest way to write the retainer down: twelve prices nobody
 * agreed to, or 5,000 on one line and eleven lines that read as free.
 *
 * A group states the fee ONCE. On a letter it is also a SECTION of the
 * Annexure: its title heads the section, its prose is what the section says
 * about itself. A proposal's has no prose (the letter drafted from it adds
 * that); its PDF prints the fee on the section's first service and "Included
 * in A1" on the others, the firm's own way.
 *
 * ── THE LETTER IS THE GROUP'S RANK, NOT A FIELD ───────────────────────────
 *
 * "A", "B" come from the API (`code`) — the group's rank among the live ones —
 * so striking a section out never leaves a document that starts at B.
 *
 * ── WHAT IS NOT OFFERED, AND WHY ──────────────────────────────────────────
 *
 * Striking out a group that still covers services is refused by the API — the
 * services would be left with no price and no reason — so the button is
 * disabled with the sentence, not hidden. A sent document is frozen, so
 * nothing here is offered on one.
 */

import { CurrencySelect } from "@/components/currency-select";
import { BillingTimingControl } from "@/components/billing-timing";
import type { BillingTiming } from "@/components/billing-timing";
import { useId, useState } from "react";
import { api, BILLING_FREQUENCY_LABELS, PER_PERIOD, formatCount, formatMoney } from "@/lib/api/client";
import type { FeeGroup } from "@/lib/api/client";
import { Button, Checkbox, Field, Input, Select, Textarea, AmountInput } from "@/components/ui";
import { Card, CardTitle, Pill } from "@/components/tw";
import { cleanAmount } from "@/lib/money";
import { plural } from "@/lib/plural";
import { keepTyped } from "@/lib/ui/keep-typed";

/** The page's own `act`: run the call, show the API's refusal verbatim, and
 *  reload the document on success — which it reports, so a form closes only
 *  when what was typed in it was actually kept. */
export type Act = (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;

/** Which document the sections are on. */
export interface SectionDoc {
  readonly kind: "letter" | "proposal";
  readonly id: string;
}

/** A section as either document reads it; only a letter's carries prose. */
export interface Section {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly billingFrequency: FeeGroup["billingFrequency"];
  readonly billingTiming: BillingTiming | null;
  readonly billingOn: string | null;
  /** Null is the fee axis, never "free". */
  readonly amount: string | null;
  readonly currency: string;
  readonly paymentTerms: string | null;
  readonly feeDescription?: string | null;
  readonly intro?: string | null;
  readonly deliverables?: string | null;
  readonly clientObligations?: string | null;
}

/** A service as a section reads it. */
export interface SectionLine {
  readonly id: string;
  readonly description: string;
  readonly feeGroupId: string | null;
  readonly currency: string;
  readonly entity: { readonly displayName: string } | null;
}

const FREQUENCIES = [
  "one_time",
  "monthly",
  "quarterly",
  "annually",
  "custom",
] as const satisfies readonly FeeGroup["billingFrequency"][];

/** A group's fee as the Summary of Fees says it — "USD 5,000.00 per month".
 *  Null is the fee axis, never "free". */
export function groupFee(g: Pick<Section, "amount" | "currency" | "billingFrequency">): string {
  return g.amount === null
    ? "fee hidden"
    : `${formatMoney(g.amount, g.currency)}${PER_PERIOD[g.billingFrequency]}`;
}

/** A service as a section names it: with its company when the document has several. */
function lineLabel(l: SectionLine): string {
  return l.entity === null ? l.description : `${l.description} (${l.entity.displayName})`;
}

interface GroupBody {
  title?: string;
  /** Sent on an edit only when it changes: its services move with it (0344). */
  currency?: string;
  billingFrequency?: FeeGroup["billingFrequency"];
  amount?: string;
  paymentTerms?: string;
  feeDescription?: string;
  intro?: string;
  deliverables?: string;
  clientObligations?: string;
  /** Services ticked to move INTO the section; never part of the section's own body. */
  lineIds: string[];
}

type SectionFields = Omit<GroupBody, "lineIds">;

/** A non-blank field, or nothing: a new section sends only what was typed. */
const typed = (key: keyof SectionFields, v: string | undefined) => (v === undefined || v === "" ? {} : { [key]: v });

// ── The four writes, per document. Literal paths, so the typed client checks
// each body against its own route. ─────────────────────────────────────────

async function addSection(doc: SectionDoc, main: string, b: SectionFields): Promise<{ id?: string; error?: unknown }> {
  const head = {
    title: b.title ?? "",
    ...(b.currency === undefined || b.currency === main ? {} : { currency: b.currency }),
    billingFrequency: b.billingFrequency ?? "monthly",
    amount: b.amount ?? "",
    ...typed("paymentTerms", b.paymentTerms),
  };
  if (doc.kind === "proposal") {
    const r = await api.POST("/api/v1/proposals/{proposalId}/fee-groups", {
      params: { path: { proposalId: doc.id } },
      body: head,
    });
    return r.error ? { error: r.error } : { id: r.data.id };
  }
  const r = await api.POST("/api/v1/engagement-letters/{letterId}/fee-groups", {
    params: { path: { letterId: doc.id } },
    body: {
      ...head,
      ...typed("feeDescription", b.feeDescription),
      ...typed("intro", b.intro),
      ...typed("deliverables", b.deliverables),
      ...typed("clientObligations", b.clientObligations),
    },
  });
  return r.error ? { error: r.error } : { id: r.data.id };
}

async function editSection(
  doc: SectionDoc,
  groupId: string,
  b: SectionFields & { billingTiming?: BillingTiming | null; billingOn?: string | null },
): Promise<{ error?: unknown }> {
  if (doc.kind === "proposal") {
    const { feeDescription: _f, intro: _i, deliverables: _d, clientObligations: _c, ...head } = b;
    const r = await api.PATCH("/api/v1/proposals/{proposalId}/fee-groups/{groupId}", {
      params: { path: { proposalId: doc.id, groupId } },
      body: head,
    });
    return r.error ? { error: r.error } : {};
  }
  const r = await api.PATCH("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
    params: { path: { letterId: doc.id, groupId } },
    body: b,
  });
  return r.error ? { error: r.error } : {};
}

async function removeSection(doc: SectionDoc, groupId: string): Promise<{ error?: unknown }> {
  const r =
    doc.kind === "proposal"
      ? await api.DELETE("/api/v1/proposals/{proposalId}/fee-groups/{groupId}", {
          params: { path: { proposalId: doc.id, groupId } },
        })
      : await api.DELETE("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
          params: { path: { letterId: doc.id, groupId } },
        });
  return r.error ? { error: r.error } : {};
}

/** Into a section (`feeGroupId`), or out of one with a price or a reason. */
async function priceLine(
  doc: SectionDoc,
  lineId: string,
  body: { feeGroupId: string | null; unitAmount?: string; pricingNote?: string },
): Promise<{ error?: unknown }> {
  const r =
    doc.kind === "proposal"
      ? await api.PUT("/api/v1/proposals/{proposalId}/lines/{lineId}/pricing", {
          params: { path: { proposalId: doc.id, lineId } },
          body,
        })
      : await api.PUT("/api/v1/engagement-letters/{letterId}/lines/{lineId}/pricing", {
          params: { path: { letterId: doc.id, lineId } },
          body,
        });
  return r.error ? { error: r.error } : {};
}

/** Puts each ticked service in the section, in order. The first refusal stops
 *  it; the ones already moved stay moved. */
async function moveInto(doc: SectionDoc, groupId: string, lineIds: readonly string[]): Promise<{ error?: unknown }> {
  for (const lineId of lineIds) {
    const moved = await priceLine(doc, lineId, { feeGroupId: groupId });
    if (moved.error) return moved;
  }
  return {};
}

export function FeeGroups({
  doc,
  groups,
  lines,
  main,
  currencies,
  editable,
  busy,
  act,
}: {
  doc: SectionDoc;
  groups: readonly Section[];
  lines: readonly SectionLine[];
  /** The document's main currency: a new section's, unless another is chosen. */
  main: string;
  /** The main currency and every one the document holds a rate for (0344). */
  currencies: readonly string[];
  /** A draft, and a caller who may write. */
  editable: boolean;
  busy: string | null;
  act: Act;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const prose = doc.kind === "letter";

  return (
    <Card>
      <CardTitle level={2}>Sections and fees</CardTitle>
      <p className="text-md text-muted">
        {groups.length === 0
          ? "No sections, so each service is priced on its own."
          : prose
            ? "A section is one fee for the services in it."
            : "A section is one fee for the services in it. The proposal shows the fee on its first service and \"Included in\" on the rest."}
      </p>

      {groups.map((g) => {
        const covered = lines.filter((l) => l.feeGroupId === g.id);
        if (editing === g.id) {
          return (
            <GroupForm
              key={g.id}
              group={g}
              groups={groups}
              lines={lines}
              prose={prose}
              main={main}
              currencies={currencies}
              busy={busy}
              onCancel={() => {
                setEditing(null);
              }}
              onSubmit={async ({ lineIds, ...body }) => {
                const ok = await act(`group:${g.id}`, () => editSection(doc, g.id, body));
                if (ok) setEditing(null);
                if (ok && lineIds.length > 0) await act(`group:${g.id}`, () => moveInto(doc, g.id, lineIds));
              }}
            />
          );
        }
        return (
          <div key={g.id} className="mb-4">
            <div className="text-md strong">
              {g.code}. {g.title}
            </div>
            <div className="text-md">
              <span className="tabular-nums">{groupFee(g)}</span> ·{" "}
              {BILLING_FREQUENCY_LABELS[g.billingFrequency]}
              {g.paymentTerms !== null && <> · {g.paymentTerms}</>}
            </div>
            {/* When the section's fee is invoiced (0319); signing sets the
                billing schedule of every service in it from this. */}
            <div className="text-md">
              Billed{" "}
              <BillingTimingControl
                label={`When section ${g.code} is billed`}
                frequency={g.billingFrequency}
                timing={g.billingTiming}
                on={g.billingOn}
                editable={editable}
                busy={busy !== null}
                onSave={(billingTiming, billingOn) => {
                  void act(`timing:${g.id}`, () => editSection(doc, g.id, { billingTiming, billingOn }));
                }}
              />
            </div>
            {/* WHAT IT PAYS FOR. A fee whose services a reader cannot see is a
                number with nothing under it — and one that covers none cannot
                be sent, which the API says in words if it is tried. */}
            <div className="text-sm text-muted">
              {covered.length === 0 ? (
                <Pill tone="warn">Covers no services yet</Pill>
              ) : (
                <>
                  Covers {plural(covered.length, "service")}: {covered.map(lineLabel).join("; ")}
                </>
              )}
            </div>
            {g.feeDescription != null && (
              <p className="text-sm text-muted">In the Summary of Fees: {g.feeDescription}</p>
            )}
            {g.intro != null && <p className="text-md whitespace-pre-wrap">{g.intro}</p>}
            {g.deliverables != null && (
              <div className="mt-1">
                <div className="label">Deliverables</div>
                <p className="text-md whitespace-pre-wrap">{g.deliverables}</p>
              </div>
            )}
            {g.clientObligations != null && (
              <div className="mt-1">
                <div className="label">Client&apos;s responsibilities</div>
                <p className="text-md whitespace-pre-wrap">{g.clientObligations}</p>
              </div>
            )}
            {editable && (
              <div className="cluster mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Edit section ${g.code}, ${g.title}`}
                  disabled={busy !== null}
                  onClick={() => {
                    setEditing(g.id);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Strike out section ${g.code}, ${g.title}`}
                  /* Disabled WITH the reason, never hidden: the API refuses a
                     group that still prices a service, and a button that is
                     simply absent reads as a missing feature. */
                  disabled={busy !== null || covered.length > 0}
                  title={
                    covered.length > 0
                      ? "Move its services into another section, or price them on their own, first."
                      : undefined
                  }
                  onClick={() => {
                    void act(`rm-group:${g.id}`, () => removeSection(doc, g.id));
                  }}
                >
                  Strike it out
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {editable && editing === null && (
        /* Behind a disclosure (Wave 4): eight boxes stood open under every
           letter, used once per section. */
        <details className="card-foot">
          <summary>Add a section</summary>
          <GroupForm
            group={null}
            groups={groups}
            lines={lines}
            prose={prose}
            main={main}
            currencies={currencies}
            busy={busy}
            onSubmit={async ({ lineIds, ...body }) => {
              // `act` says only whether it held, so the new section's id is
              // read off the POST here.
              const added: { id?: string } = {};
              const ok = await act("group:new", async () => {
                const result = await addSection(doc, main, body);
                if (result.id !== undefined) added.id = result.id;
                return result;
              });
              // The section exists now, so the form clears even if a service
              // will not move; the refusal says why.
              const id = added.id;
              if (ok && id !== undefined && lineIds.length > 0) {
                await act("group:new", () => moveInto(doc, id, lineIds));
              }
              return ok;
            }}
          />
        </details>
      )}
    </Card>
  );
}

/**
 * Add a section, or change one. EVERY field is sent on an edit and an emptied
 * box clears its prose — the API reads an empty string that way — except the
 * fee, which a caller without the fee axis cannot see and so must not be made
 * to retype. A proposal's section has no prose, so its form has none.
 */
function GroupForm({
  group,
  groups,
  lines,
  prose,
  main,
  currencies,
  busy,
  onSubmit,
  onCancel,
}: {
  group: Section | null;
  groups: readonly Section[];
  /** The document's services, offered as ticks so none has to be written again. */
  lines: readonly SectionLine[];
  prose: boolean;
  main: string;
  currencies: readonly string[];
  busy: string | null;
  onSubmit: (body: GroupBody) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const hintId = useId();
  const adding = group === null;
  const current = group?.currency ?? main;
  // A currency taken off the document since stays listed, so the form says
  // what the section holds.
  const choices = currencies.includes(current) ? currencies : [...currencies, current];
  return (
    <form
      className="mt-4"
      onSubmit={(event) => keepTyped(event, (form) => {
        const text = (name: string): string => String(form.get(name) ?? "").trim();
        const amount = cleanAmount(text("groupAmount"));
        const frequency = FREQUENCIES.find((f) => f === text("groupFrequency")) ?? "monthly";
        const currency = text("groupCurrency") === "" ? current : text("groupCurrency");
        // A new section's form stays open: it clears once the section is
        // added (the caller resolves true), and a refusal keeps it (F05).
        return onSubmit({
          title: text("groupTitle"),
          ...(currency === current && !adding ? {} : { currency }),
          billingFrequency: frequency,
          ...(amount === "" ? {} : { amount }),
          paymentTerms: text("groupPaymentTerms"),
          ...(prose
            ? {
                feeDescription: text("groupFeeDescription"),
                intro: text("groupIntro"),
                deliverables: text("groupDeliverables"),
                clientObligations: text("groupClientObligations"),
              }
            : {}),
          lineIds: form.getAll("groupLines").map(String),
        }).then((done) => done === true);
      })}
    >
      <fieldset
        className="fieldset"
        aria-label={adding ? "Add a section" : `Editing section ${group.code}, ${group.title}`}
      >
        <div className="field-row mb-4">
          <Field label="Title" hint={prose ? "The section's heading on the letter." : "The section's name, shown beside its fee."}>
            <Input
              name="groupTitle"
              defaultValue={group?.title ?? ""}
              placeholder={prose ? "e.g. Ongoing recurring services" : "e.g. Accounting, Tax & GST"}
              required
            />
          </Field>
          <Field label="Billed">
            <Select name="groupFrequency" defaultValue={group?.billingFrequency ?? "monthly"}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {BILLING_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
          {choices.length > 1 && (
            <Field label="Currency" hint={adding ? undefined : "Its services move with it."}>
              <CurrencySelect name="groupCurrency" only={choices} defaultValue={current} />
            </Field>
          )}
          <Field
            label="Fee"
            hint={
              adding
                ? "Per billing period, e.g. 5,000 a month."
                : group.amount === null
                  ? "Hidden from you. Leave blank to keep it."
                  : "Per billing period."
            }
          >
            <AmountInput
              name="groupAmount"
              defaultValue={group?.amount == null ? "" : formatCount(group.amount)}
              required={adding}
            />
          </Field>
          <Field label="How it is paid" optional>
            <Input
              name="groupPaymentTerms"
              defaultValue={group?.paymentTerms ?? ""}
              placeholder="e.g. 40% advance, 60% on completion"
            />
          </Field>
        </div>
        {/* The document's own services, ticked in rather than written again.
            One already here stays fixed: out of a section it needs a price,
            which its own row asks for ("Priced on its own"). */}
        {lines.length > 0 && (
          // The margin sits on a wrapper: `.fieldset` zeroes its own.
          <div className="mb-4">
            <fieldset className="fieldset" aria-label="Services in this section" aria-describedby={hintId}>
              <div className="label">Services in this section</div>
              <div className="flex flex-col gap-1">
                {lines.map((l) => {
                  const here = group !== null && l.feeGroupId === group.id;
                  const elsewhere = here ? undefined : groups.find((g) => g.id === l.feeGroupId);
                  return (
                    <Checkbox
                      key={l.id}
                      name="groupLines"
                      value={l.id}
                      label={lineLabel(l)}
                      defaultChecked={here}
                      disabled={here}
                      note={
                        here
                          ? "in this section. To take it out, choose Priced on its own under the service"
                          : elsewhere === undefined
                            ? "priced on its own"
                            : `now in section ${elsewhere.code}`
                      }
                    />
                  );
                })}
              </div>
              <p id={hintId} className="field-hint">
                Tick what this fee pays for. A ticked service drops its own price.
              </p>
            </fieldset>
          </div>
        )}
        {prose && (
          <>
            <div className="field-row mb-4">
              <Field
                label="In the Summary of Fees"
                optional
                hint="Its row's words. Blank names the title and services."
              >
                <Textarea name="groupFeeDescription" rows={2} defaultValue={group?.feeDescription ?? ""} />
              </Field>
              <Field label="Introduction" optional hint="The paragraph under the section's heading.">
                <Textarea name="groupIntro" rows={2} defaultValue={group?.intro ?? ""} />
              </Field>
            </div>
            <div className="field-row mb-4">
              <Field
                label="Deliverables"
                optional
                hint="For the whole section. Start a line with - for a bullet."
              >
                <Textarea name="groupDeliverables" rows={3} defaultValue={group?.deliverables ?? ""} />
              </Field>
              <Field
                label="Client's responsibilities"
                optional
                hint="For the whole section. Services keep their own."
              >
                <Textarea
                  name="groupClientObligations"
                  rows={3}
                  defaultValue={group?.clientObligations ?? ""}
                />
              </Field>
            </div>
          </>
        )}
        <div className="cluster">
          <Button type="submit" variant={adding ? "secondary" : "primary"} disabled={busy !== null}>
            {adding ? "Add the section" : "Save the section"}
          </Button>
          {onCancel !== undefined && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

/**
 * How ONE service is priced: by a section's fee, or on its own.
 *
 * Into a section, the service GIVES UP its price — the section's fee pays for
 * it, and a price on both would charge twice. Out of one, it needs a price or a
 * reason again, so choosing "on its own" opens the two boxes that say which,
 * rather than sending a request the API would refuse.
 */
export function LineFee({
  doc,
  line,
  groups,
  currency,
  busy,
  act,
}: {
  doc: SectionDoc;
  line: SectionLine;
  groups: readonly Section[];
  currency: string;
  busy: string | null;
  act: Act;
}) {
  const [pricing, setPricing] = useState(false);
  if (groups.length === 0 && line.feeGroupId === null) return null;

  return (
    <div className="mt-1">
      <Select
        size="sm"
        aria-label={`How ${line.description} is priced`}
        value={pricing ? "own" : (line.feeGroupId ?? "own")}
        disabled={busy !== null}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "own") {
            // Already on its own: nothing to change. Leaving a section: say
            // what it costs now.
            setPricing(line.feeGroupId !== null);
            return;
          }
          setPricing(false);
          void act(`fee:${line.id}`, () => priceLine(doc, line.id, { feeGroupId: next }));
        }}
      >
        <option value="own">Priced on its own</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            In {g.code} · {g.title}
          </option>
        ))}
      </Select>
      {pricing && (
        <form
          className="mt-2"
          onSubmit={(event) => keepTyped(event, (form) => {
            const unitAmount = cleanAmount(String(form.get("ownPrice") ?? ""));
            const pricingNote = String(form.get("ownNote") ?? "").trim();
            void act(`fee:${line.id}`, () =>
              priceLine(doc, line.id, {
                feeGroupId: null,
                ...(unitAmount === "" ? {} : { unitAmount }),
                ...(pricingNote === "" ? {} : { pricingNote }),
              }),
            ).then((ok) => {
              if (ok) setPricing(false);
            });
          })}
        >
          <fieldset className="fieldset" aria-label={`Price ${line.description} on its own`}>
            <div className="field-row">
              <Field label={`Its own price (${currency})`}>
                <AmountInput name="ownPrice" />
              </Field>
              <Field label="Or why it has none">
                <Input name="ownNote" placeholder="e.g. As mutually agreed" />
              </Field>
            </div>
            <div className="cluster mt-2">
              <Button type="submit" size="sm" disabled={busy !== null}>
                Price it on its own
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPricing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
