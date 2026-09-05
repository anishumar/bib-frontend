"use client";

import { useId, useState } from "react";
import type { ConfigEntry, ObligationRule } from "@/lib/api/client";
import { Cluster, Row, Stack } from "@/components/layout";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  FieldRow,
  Fieldset,
  Input,
  Notice,
  Radio,
  Select,
  Table,
  Td,
} from "@/components/ui";

/**
 * The form a partner answers a compliance rule with (T6.4).
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * Fifty-seven rules ship in the India pack and TEN of them can produce a date.
 * The other forty-seven carry an `unresolvedReason` instead — "depends on the
 * AGM date", "State-specific", "seven working days, and we hold no holiday
 * calendar" — which is the honest state of the firm's own specification rather
 * than a bug. But until this form existed a partner could not supply any of
 * those answers, so those forty-seven rules were never going to start
 * generating, however well the firm knew the answer. Config held as rows is
 * half a promise while editing it still needs a developer; the board calls that
 * the "row with a screen" bar and this is the half that had not been built.
 *
 * ── THE FORMULA AND ITS REASON ARE ONE CONTROL, NOT TWO FIELDS ──────────────
 *
 * `obligation_due_rule_chk` refuses a rule holding both a formula and a reason,
 * and refuses one holding neither. Rendered as two independent inputs, the
 * commonest edit on this screen — answering a rule — fails with a constraint
 * message unless the partner also remembers to clear the reason. So the two are
 * one radio group: EITHER this rule computes a date, OR it says what it is
 * waiting for. The form cannot express the states the database refuses.
 *
 * ── WHAT IS NOT OFFERED, AND WHY EACH ONE IS ABSENT ─────────────────────────
 *
 * · Jurisdiction, name and rule pack — a rule's IDENTITY. Every filing already
 *   generated pins this row, so moving them would silently restate why those
 *   filings were due when they were. A genuine revision is a new rule.
 * · Recurrence and the financial-year start, ONCE THE RULE HAS PRODUCED
 *   ANYTHING. Between them they decide where a period BEGINS, and `period_start`
 *   is the key every generated filing is deduplicated on. The API refuses it
 *   (`PERIOD_SHAPE_LOCKED`); this disables it and says why, so a partner meets
 *   a sentence rather than a rejection.
 */

export type DueRuleKind = "day_of_month" | "days_after";

export interface RuleDraft {
  readonly recurrence: string;
  readonly fiscalYearStartMonth: number;
  readonly hasFormula: boolean;
  readonly kind: DueRuleKind;
  readonly dueMonthOffset: number;
  readonly dueDayOfMonth: number;
  readonly dueDaysAfter: number;
  readonly unresolvedReason: string;
  readonly module: string;
  readonly authority: string;
  readonly entityType: string;
  readonly serviceEntryId: string;
  /** Create only — the three identity fields, absent from an edit. */
  readonly name: string;
  readonly jurisdiction: string;
  readonly rulePack: string;
}

/** The pack a firm's OWN rules go into, kept clear of the shipped `gst-in@…`
 *  namespace so that re-seeding a vendor pack can never collide with an answer
 *  the firm wrote itself — the unique key is (tenant, jurisdiction, name, rule
 *  pack), so this is a collision boundary rather than a label. Prefilled rather
 *  than locked: it is a default the partner may overwrite, which is what this
 *  whole screen is about. */
export function firmRulePack(): string {
  return `firm@${String(new Date().getFullYear())}`;
}

export function draftOf(rule: ObligationRule | null): RuleDraft {
  return {
    recurrence: rule?.recurrence ?? "monthly",
    fiscalYearStartMonth: rule?.fiscalYearStartMonth ?? 4,
    // A NEW rule defaults to computing a date; an existing one reads its own
    // state. Found by writing one: the form opened on "it depends on something
    // this system does not hold" with an empty reason, so the first press of
    // Write was always a refusal. "Waiting on a fact" is the SHIPPED PACK's
    // condition — forty-seven rules imported from a document nobody has
    // answered — not the state somebody typing a rule from scratch is in. They
    // are writing it because they know when it is due.
    hasFormula: rule === null ? true : rule.dueRule != null,
    kind: rule?.dueRule?.kind ?? "day_of_month",
    dueMonthOffset: rule?.dueRule?.dueMonthOffset ?? 1,
    dueDayOfMonth: rule?.dueRule?.dueDayOfMonth ?? 20,
    dueDaysAfter: rule?.dueRule?.dueDaysAfter ?? 30,
    unresolvedReason: rule?.unresolvedReason ?? "",
    module: rule?.module ?? "",
    authority: rule?.authority ?? "",
    entityType: rule?.entityType ?? "",
    serviceEntryId: rule?.serviceEntryId ?? "",
    name: "",
    jurisdiction: "IN",
    rulePack: firmRulePack(),
  };
}

/**
 * The draft as the API takes it.
 *
 * `null` on the losing half of the radio is deliberate and is not the same as
 * omitting it: PATCH treats an absent field as "leave it alone", so answering a
 * rule has to SEND `unresolvedReason: null` or the write is refused for holding
 * both a formula and a reason.
 */
export function bodyOf(d: RuleDraft): Record<string, unknown> {
  const formula = d.hasFormula
    ? {
        kind: d.kind,
        dueMonthOffset: d.kind === "day_of_month" ? d.dueMonthOffset : null,
        dueDayOfMonth: d.kind === "day_of_month" ? d.dueDayOfMonth : null,
        dueDaysAfter: d.kind === "days_after" ? d.dueDaysAfter : null,
      }
    : null;
  return {
    recurrence: d.recurrence,
    fiscalYearStartMonth: d.fiscalYearStartMonth,
    dueRule: formula,
    unresolvedReason: d.hasFormula ? null : d.unresolvedReason.trim(),
    module: d.module.trim() || null,
    authority: d.authority.trim() || null,
    entityType: d.entityType.trim() || null,
    serviceEntryId: d.serviceEntryId || null,
  };
}

/**
 * The formula in the words a partner checks against the statute.
 *
 * Shown live, above the Save button, because `dueMonthOffset` is not a thing
 * anybody can proofread. The list's copy of this function was written blind and
 * produced "Once a year, day 15 3 months after" and "When it happens, 30 days
 * after the period ends" — the second factually wrong as well, since an
 * event-driven rule has no period to count from. Reading the page found them
 * both; the types were perfectly happy.
 */
export function describeDraft(d: RuleDraft): string {
  const every = EVERY[d.recurrence] ?? d.recurrence;
  if (!d.hasFormula) return `${every} · no date is computed`;
  const from = d.recurrence === "event" ? "the event" : "the period ends";
  if (d.kind === "days_after") {
    return `${every} · ${String(d.dueDaysAfter)} days after ${from}`;
  }
  const day = ordinal(d.dueDayOfMonth);
  if (d.dueMonthOffset === 0) return `${every} · the ${day} of the month the period ends in`;
  if (d.dueMonthOffset === 1) return `${every} · the ${day} of the following month`;
  return `${every} · the ${day}, ${String(d.dueMonthOffset)} months after ${from}`;
}

const EVERY: Record<string, string> = {
  monthly: "Every month",
  quarterly: "Every quarter",
  half_yearly: "Twice a year",
  annual: "Once a year",
  event: "When it happens",
};

export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${String(n)}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${String(n)}${suffix}`;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A whole number from a text input, floored at `min`. An empty box is `min`
 *  rather than `NaN`, which would reach the API as `null` and be refused with a
 *  message about a half-stated formula. */
function intOf(raw: string, min: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : min;
}

export function RuleEditor({
  draft,
  onChange,
  services,
  /** Null while creating: there is no rule yet, so nothing is locked. */
  rule,
  creating,
  busy,
  onSave,
  onCancel,
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
  services: ConfigEntry[];
  rule: ObligationRule | null;
  creating: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void => {
    onChange({ ...draft, [key]: value });
  };
  // The period shape is editable exactly while the rule has produced nothing,
  // which is the state of every rule a partner actually has to answer.
  const produced = rule?.instanceCount ?? 0;
  const shapeLocked = produced > 0;
  const group = `formula-${rule?.id ?? "new"}`;
  // Two paragraphs on this form sit BELOW a `.field-row` rather than inside a
  // column of it — deliberately, because a hint inside one column makes that
  // field taller and leaves four inputs at four heights. Sitting outside, they
  // have to be pointed at by hand, and neither was: each describes two fields
  // at once, which is also why neither could be a `<Field hint>`.
  const noteId = useId();
  const periodNoteId = `${noteId}-period`;
  const groupingNoteId = `${noteId}-grouping`;

  return (
    <Card>
      <Stack>
        {creating && (
          <>
            <FieldRow>
              <Field label="Filing">
                <Input
                  value={draft.name}
                  placeholder="PF monthly return"
                  onChange={(e) => { set("name", e.target.value); }}
                />
              </Field>
              <Field label="Country">
                <Input
                  value={draft.jurisdiction}
                  maxLength={2}
                  placeholder="IN"
                  onChange={(e) => { set("jurisdiction", e.target.value.toUpperCase()); }}
                />
              </Field>
              <Field label="Rule pack">
                <Input
                  value={draft.rulePack}
                  onChange={(e) => { set("rulePack", e.target.value); }}
                />
              </Field>
            </FieldRow>
            <Notice eyebrow="CANNOT BE CHANGED LATER">
              The filing, the country and the pack are this rule&rsquo;s <strong>identity</strong>.
              Every filing it generates pins this row, so moving them would restate why those
              filings were due when they were. The pack is prefilled with the firm&rsquo;s own,
              kept clear of the shipped <code>gst-in@…</code> namespace so reloading a shipped pack
              can never collide with an answer you wrote here.
            </Notice>
          </>
        )}

        <FieldRow>
          <Field label="How often">
            <Select
              value={draft.recurrence}
              disabled={shapeLocked}
              {...(shapeLocked ? {} : { "aria-describedby": periodNoteId })}
              onChange={(e) => { set("recurrence", e.target.value); }}
            >
              <option value="monthly">Every month</option>
              <option value="quarterly">Every quarter</option>
              <option value="half_yearly">Twice a year</option>
              <option value="annual">Once a year</option>
              <option value="event">When something happens</option>
            </Select>
          </Field>
          <Field label="Financial year starts in">
            <Select
              value={String(draft.fiscalYearStartMonth)}
              disabled={shapeLocked}
              {...(shapeLocked ? {} : { "aria-describedby": periodNoteId })}
              onChange={(e) => { set("fiscalYearStartMonth", Number(e.target.value)); }}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </Select>
          </Field>
        </FieldRow>

        {/* THE HINT SITS BELOW THE ROW, NOT INSIDE A COLUMN OF IT.
            `.field-row` is `align-items: end`, so a field carrying a hint is
            taller and its INPUT ends up higher than the ones beside it — four
            fields at four different heights. `/admin/workflows` learnt this and
            it is written in CLAUDE.md; this screen re-made it, and looking at
            the page is what found it again. */}
        {!shapeLocked && (
          /* Pointed at by BOTH selects above, and only while it is rendered —
             a `describedby` naming an element that is not on the page describes
             nothing, and this paragraph is replaced by a Notice once the shape
             is locked. */
          <p id={periodNoteId} className="field-hint">
            April for India: a quarter runs Apr&ndash;Jun, so leaving the year at January would put
            every quarterly filing in the wrong period.
          </p>
        )}

        {/* DISABLED WITH THE SENTENCE, never silently. A partner meets an
            explanation rather than the API's 409. */}
        {shapeLocked && (
          <Notice tone="warn" eyebrow="THE PERIOD SHAPE IS FIXED NOW">
            These two decide where a period <strong>begins</strong>, and this rule has already
            produced {produced} filing{produced === 1 ? "" : "s"} keyed on those boundaries.
            Changing them now would orphan every one of them &mdash; last quarter&rsquo;s return
            would match no quarter. Retire this rule and write a new one instead; the retired row
            goes on explaining the filings it made.
          </Notice>
        )}

        {/* ── THE ONE DECISION, AS ONE CONTROL ──────────────────────────── */}
        <Fieldset legend="When it is due">
          <Stack>
            <Radio
              name={group}
              checked={draft.hasFormula}
              label="This rule computes a date"
              onChange={() => { set("hasFormula", true); }}
            />
            {draft.hasFormula && (
              <FieldRow>
                <Field label="Counted as">
                  <Select
                    value={draft.kind}
                    onChange={(e) => { set("kind", e.target.value as DueRuleKind); }}
                  >
                    <option value="day_of_month">A day of a month</option>
                    <option value="days_after">A number of days</option>
                  </Select>
                </Field>
                {draft.kind === "day_of_month" ? (
                  <>
                    <Field label="Day of the month">
                      <Input
                        inputMode="numeric"
                        value={String(draft.dueDayOfMonth)}
                        onChange={(e) => { set("dueDayOfMonth", intOf(e.target.value, 1)); }}
                      />
                    </Field>
                    <Field label="Months after the period ends">
                      <Input
                        inputMode="numeric"
                        value={String(draft.dueMonthOffset)}
                        onChange={(e) => { set("dueMonthOffset", intOf(e.target.value, 0)); }}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Days after the period ends">
                    <Input
                      inputMode="numeric"
                      value={String(draft.dueDaysAfter)}
                      onChange={(e) => { set("dueDaysAfter", intOf(e.target.value, 0)); }}
                    />
                  </Field>
                )}
              </FieldRow>
            )}

            <Radio
              name={group}
              checked={!draft.hasFormula}
              label="It depends on something this system does not hold"
              note="Say what, and the calendar shows that in place of a deadline."
              onChange={() => { set("hasFormula", false); }}
            />
            {!draft.hasFormula && (
              <Field label="What it is waiting for">
                <Input
                  value={draft.unresolvedReason}
                  placeholder="Due within a statutory period after the AGM, and no AGM date is recorded here."
                  onChange={(e) => { set("unresolvedReason", e.target.value); }}
                />
              </Field>
            )}
          </Stack>
        </Fieldset>

        <FieldRow>
          <Field label="Filed with">
            <Input
              value={draft.authority}
              placeholder="GST"
              onChange={(e) => { set("authority", e.target.value); }}
            />
          </Field>
          <Field label="Statute grouping">
            <Input
              value={draft.module}
              placeholder="TDS"
              aria-describedby={groupingNoteId}
              onChange={(e) => { set("module", e.target.value); }}
            />
          </Field>
          <Field label="Only for entity type" optional>
            <Input
              value={draft.entityType}
              placeholder="private_limited"
              aria-describedby={groupingNoteId}
              onChange={(e) => { set("entityType", e.target.value); }}
            />
          </Field>
          <Field label="Owed by clients who bought" optional>
            <Select
              value={draft.serviceEntryId}
              onChange={(e) => { set("serviceEntryId", e.target.value); }}
            >
              <option value="">Any service</option>
              {services.map((s) => (
                <option key={s.entry.id} value={s.entry.id}>{s.entry.key}</option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        {/* One paragraph, TWO fields — which is exactly why it cannot be a
            `<Field hint>` and had to be wired by hand. */}
        <p id={groupingNoteId} className="field-hint">
          <strong>Statute grouping</strong> is the law&rsquo;s &mdash; GST, TDS, MCA &mdash; not
          the firm&rsquo;s revenue Dept, which is a different axis. Leaving{" "}
          <strong>entity type</strong> blank means every kind of company, which is the ordinary
          case: GST does not care what shape a client is.
        </p>

        {/* THE SENTENCE A PARTNER CHECKS AGAINST THE STATUTE, before saving
            rather than after. `dueMonthOffset: 1` is not proofreadable. */}
        <p className="mono">{describeDraft(draft)}</p>

        <Cluster>
          <Button onClick={onSave} loading={busy}>
            {creating ? "Write the rule" : "Save the formula"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

/**
 * The one period a rule does not apply to itself.
 *
 * March's TDS deposit is due 30 April while the other eleven months are due on
 * the 7th. A template holds ONE formula, so reading only the normal half gives
 * a rule that is right eleven months a year and quietly wrong every April —
 * the worst failure available here, because nobody re-reads a date that looks
 * right and the cost lands on the client as a penalty.
 *
 * The month is the one the filed PERIOD ends in, never the month it is due,
 * because the due month is exactly what the exception changes. The label says
 * so: getting it backwards produces a carve-out for the wrong month that looks
 * entirely plausible on the screen.
 */
export function Exceptions({
  rule,
  busy,
  mayWrite,
  onAdd,
  onWithdraw,
}: {
  rule: ObligationRule;
  busy: boolean;
  mayWrite: boolean;
  onAdd: (body: Record<string, unknown>) => void;
  onWithdraw: (periodEndMonth: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("3");
  const [kind, setKind] = useState<DueRuleKind>("day_of_month");
  const [day, setDay] = useState("30");
  const [offset, setOffset] = useState("1");
  const [daysAfter, setDaysAfter] = useState("30");
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardHead>
        <CardTitle>Exceptions</CardTitle>
        {mayWrite && rule.recurrence !== "event" && (
          <Button
            variant="ghost"
            size="sm"
            {...(open ? { "aria-label": "Cancel the new exception" } : {})}
            onClick={() => { setOpen((o) => !o); }}
          >
            {open ? "Cancel" : "Add an exception"}
          </Button>
        )}
      </CardHead>

      <Stack>
        {rule.exceptions.length === 0 ? (
          <p className="muted">None. This rule&rsquo;s own formula governs every period.</p>
        ) : (
          <Table>
            <tbody>
              {rule.exceptions.map((e) => (
                <tr key={e.periodEndMonth}>
                  <Td>Period ending {MONTHS[e.periodEndMonth - 1] ?? "?"}</Td>
                  <Td className="mono">
                    {e.kind === "days_after"
                      ? `${String(e.dueDaysAfter ?? 0)} days after the period ends`
                      : `the ${ordinal(e.dueDayOfMonth ?? 1)}, ${String(
                          e.dueMonthOffset ?? 0,
                        )} month${(e.dueMonthOffset ?? 0) === 1 ? "" : "s"} after`}
                  </Td>
                  <Td>{e.note}</Td>
                  <Td align="right">
                    {mayWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => { onWithdraw(e.periodEndMonth); }}
                        title="Put this period back under the rule's own formula. The row is kept, never destroyed — it is part of why a filing was due on the day it was."
                      >
                        Withdraw
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {open && mayWrite && rule.recurrence !== "event" && (
          <Stack>
            <FieldRow>
              <Field label="Month the PERIOD ends in">
                <Select value={month} onChange={(e) => { setMonth(e.target.value); }}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Counted as">
                <Select
                  value={kind}
                  onChange={(e) => { setKind(e.target.value as DueRuleKind); }}
                >
                  <option value="day_of_month">A day of a month</option>
                  <option value="days_after">A number of days</option>
                </Select>
              </Field>
              {kind === "day_of_month" ? (
                <>
                  <Field label="Day">
                    <Input
                      inputMode="numeric"
                      value={day}
                      onChange={(e) => { setDay(e.target.value); }}
                    />
                  </Field>
                  <Field label="Months after">
                    <Input
                      inputMode="numeric"
                      value={offset}
                      onChange={(e) => { setOffset(e.target.value); }}
                    />
                  </Field>
                </>
              ) : (
                <Field label="Days after">
                  <Input
                    inputMode="numeric"
                    value={daysAfter}
                    onChange={(e) => { setDaysAfter(e.target.value); }}
                  />
                </Field>
              )}
            </FieldRow>
            <p className="field-hint">
              The month the PERIOD ends in, never the month it is due &mdash; the due month is
              exactly what this changes.
            </p>
            <Field
              label="Why this period is different"
              hint="Required. A partner checking the calendar against the statute cannot otherwise tell a real carve-out from a typo."
            >
              <Input
                value={note}
                placeholder="March is the year end, and the statute allows until the 30th."
                onChange={(e) => { setNote(e.target.value); }}
              />
            </Field>
            <Row>
              <Button
                disabled={busy || note.trim() === ""}
                onClick={() => {
                  onAdd({
                    periodEndMonth: Number(month),
                    kind,
                    dueMonthOffset: kind === "day_of_month" ? intOf(offset, 0) : null,
                    dueDayOfMonth: kind === "day_of_month" ? intOf(day, 1) : null,
                    dueDaysAfter: kind === "days_after" ? intOf(daysAfter, 0) : null,
                    note: note.trim(),
                  });
                  setNote("");
                  setOpen(false);
                }}
              >
                Add the exception
              </Button>
            </Row>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
