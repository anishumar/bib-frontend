"use client";

/**
 * SECTIONS AND FEES — one fee for several services (0083).
 *
 * ── WHAT A FEE GROUP IS, AND WHY THE LETTER NEEDS ONE ─────────────────────
 *
 * "USD 5,000 per month" for accounting, tax and payroll across a client's four
 * companies is TWELVE lines here — an engagement is one service for one legal
 * entity — and until 0083 every one of them had to carry a price of its own.
 * There was no honest way to write the retainer down: twelve prices nobody
 * agreed to, or 5,000 on one line and eleven lines that read as free.
 *
 * A group states the fee ONCE. It is also a SECTION of the Annexure letter:
 * its title heads the section ("B. Ongoing recurring services"), its prose is
 * what the section says about itself, and its fee is the section's row in the
 * Summary of Fees. The services in it print under it and carry no price.
 *
 * ── THE LETTER IS THE GROUP'S RANK, NOT A FIELD ───────────────────────────
 *
 * "A", "B" come from the API (`code`) — the group's rank among the live ones —
 * so striking a section out never leaves a letter that starts at B. Nothing
 * here computes it, for the same reason nothing here adds up money.
 *
 * ── WHAT IS NOT OFFERED, AND WHY ──────────────────────────────────────────
 *
 * Striking out a group that still covers services is refused by the API — the
 * services would be left with no price and no reason — so the button is
 * disabled with the sentence, not hidden. A sent letter is frozen, so nothing
 * here is offered on one.
 */

import { BillingTimingControl } from "@/components/billing-timing";
import { useState } from "react";
import { api, BILLING_FREQUENCY_LABELS, PER_PERIOD, formatCount, formatMoney } from "@/lib/api/client";
import type { FeeGroup, LetterLine } from "@/lib/api/client";
import { Button, Field, Input, Select, Textarea, AmountInput } from "@/components/ui";
import { Card, CardTitle, Pill } from "@/components/tw";
import { cleanAmount } from "@/lib/money";
import { plural } from "@/lib/plural";

/** The page's own `act`: run the call, show the API's refusal verbatim, and
 *  reload the letter on success — which it reports, so a form closes only
 *  when what was typed in it was actually kept. */
export type Act = (key: string, call: () => Promise<{ error?: unknown }>) => Promise<boolean>;

const FREQUENCIES = [
  "one_time",
  "monthly",
  "quarterly",
  "annually",
  "custom",
] as const satisfies readonly FeeGroup["billingFrequency"][];

/** A group's fee as the Summary of Fees says it — "USD 5,000.00 per month".
 *  Null is the fee axis, never "free". */
export function groupFee(g: FeeGroup): string {
  return g.amount === null
    ? "fee hidden"
    : `${formatMoney(g.amount, g.currency)}${PER_PERIOD[g.billingFrequency]}`;
}

export function FeeGroups({
  letterId,
  groups,
  lines,
  editable,
  busy,
  act,
}: {
  letterId: string;
  groups: readonly FeeGroup[];
  lines: readonly LetterLine[];
  /** A draft, and a caller who may write. */
  editable: boolean;
  busy: string | null;
  act: Act;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Card>
      <CardTitle level={2}>Sections and fees</CardTitle>
      {/* ONE LINE (Wave 4). A section prints as a part of Annexure 1 and one
          row of the Summary of Fees ("B. Ongoing recurring services, USD 5,000
          per month" across four companies); its services carry no price of
          their own, and services priced on their own print last. */}
      <p className="text-md text-muted">
        {groups.length === 0
          ? "No sections, so each service is priced on its own."
          : "A section is one fee for the services in it."}
      </p>

      {groups.map((g) => {
        const covered = lines.filter((l) => l.feeGroupId === g.id);
        if (editing === g.id) {
          return (
            <GroupForm
              key={g.id}
              group={g}
              busy={busy}
              onCancel={() => {
                setEditing(null);
              }}
              onSubmit={(body) =>
                act(`group:${g.id}`, () =>
                  api.PATCH("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
                    params: { path: { letterId, groupId: g.id } },
                    body,
                  }),
                ).then((ok) => {
                  if (ok) setEditing(null);
                })
              }
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
                  void act(`timing:${g.id}`, () =>
                    api.PATCH("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
                      params: { path: { letterId, groupId: g.id } },
                      body: { billingTiming, billingOn },
                    }),
                  );
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
                  Covers {plural(covered.length, "service")}:{" "}
                  {covered
                    .map((l) =>
                      l.entity === null ? l.description : `${l.description} (${l.entity.displayName})`,
                    )
                    .join("; ")}
                </>
              )}
            </div>
            {g.feeDescription !== null && (
              <p className="text-sm text-muted">In the Summary of Fees: {g.feeDescription}</p>
            )}
            {g.intro !== null && <p className="text-md whitespace-pre-wrap">{g.intro}</p>}
            {g.deliverables !== null && (
              <div className="mt-1">
                <div className="label">Deliverables</div>
                <p className="text-md whitespace-pre-wrap">{g.deliverables}</p>
              </div>
            )}
            {g.clientObligations !== null && (
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
                    void act(`rm-group:${g.id}`, () =>
                      api.DELETE("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
                        params: { path: { letterId, groupId: g.id } },
                      }),
                    );
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
          busy={busy}
          onSubmit={(body) =>
            act("group:new", () =>
              api.POST("/api/v1/engagement-letters/{letterId}/fee-groups", {
                params: { path: { letterId } },
                body: {
                  title: body.title ?? "",
                  billingFrequency: body.billingFrequency ?? "monthly",
                  amount: body.amount ?? "",
                  ...(body.paymentTerms === undefined || body.paymentTerms === ""
                    ? {}
                    : { paymentTerms: body.paymentTerms }),
                  ...(body.feeDescription === undefined || body.feeDescription === ""
                    ? {}
                    : { feeDescription: body.feeDescription }),
                  ...(body.intro === undefined || body.intro === "" ? {} : { intro: body.intro }),
                  ...(body.deliverables === undefined || body.deliverables === ""
                    ? {}
                    : { deliverables: body.deliverables }),
                  ...(body.clientObligations === undefined || body.clientObligations === ""
                    ? {}
                    : { clientObligations: body.clientObligations }),
                },
              }),
            )
          }
        />
        </details>
      )}
    </Card>
  );
}

interface GroupBody {
  title?: string;
  billingFrequency?: FeeGroup["billingFrequency"];
  amount?: string;
  paymentTerms?: string;
  feeDescription?: string;
  intro?: string;
  deliverables?: string;
  clientObligations?: string;
}

/**
 * Add a section, or change one. EVERY field is sent on an edit and an emptied
 * box clears its prose — the API reads an empty string that way — except the
 * fee, which a caller without the fee axis cannot see and so must not be made
 * to retype.
 */
function GroupForm({
  group,
  busy,
  onSubmit,
  onCancel,
}: {
  group: FeeGroup | null;
  busy: string | null;
  onSubmit: (body: GroupBody) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const adding = group === null;
  return (
    <form
      className="mt-4"
      action={(form) => {
        const text = (name: string): string => String(form.get(name) ?? "").trim();
        const amount = cleanAmount(text("groupAmount"));
        const frequency = FREQUENCIES.find((f) => f === text("groupFrequency")) ?? "monthly";
        void onSubmit({
          title: text("groupTitle"),
          billingFrequency: frequency,
          ...(amount === "" ? {} : { amount }),
          paymentTerms: text("groupPaymentTerms"),
          feeDescription: text("groupFeeDescription"),
          intro: text("groupIntro"),
          deliverables: text("groupDeliverables"),
          clientObligations: text("groupClientObligations"),
        });
      }}
    >
      <fieldset
        className="fieldset"
        aria-label={adding ? "Add a section" : `Editing section ${group.code}, ${group.title}`}
      >
        <div className="field-row mb-4">
          <Field label="Title" hint="The section's heading on the letter.">
            <Input
              name="groupTitle"
              defaultValue={group?.title ?? ""}
              placeholder="e.g. Ongoing recurring services"
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
  letterId,
  line,
  groups,
  currency,
  busy,
  act,
}: {
  letterId: string;
  line: LetterLine;
  groups: readonly FeeGroup[];
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
          void act(`fee:${line.id}`, () =>
            api.PUT("/api/v1/engagement-letters/{letterId}/lines/{lineId}/pricing", {
              params: { path: { letterId, lineId: line.id } },
              body: { feeGroupId: next },
            }),
          );
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
          action={(form) => {
            const unitAmount = cleanAmount(String(form.get("ownPrice") ?? ""));
            const pricingNote = String(form.get("ownNote") ?? "").trim();
            void act(`fee:${line.id}`, () =>
              api.PUT("/api/v1/engagement-letters/{letterId}/lines/{lineId}/pricing", {
                params: { path: { letterId, lineId: line.id } },
                body: {
                  feeGroupId: null,
                  ...(unitAmount === "" ? {} : { unitAmount }),
                  ...(pricingNote === "" ? {} : { pricingNote }),
                },
              }),
            ).then((ok) => {
              if (ok) setPricing(false);
            });
          }}
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
