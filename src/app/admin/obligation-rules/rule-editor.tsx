"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ObligationRule } from "@/lib/api/client";
import { longDay, monthYear } from "@/lib/day";
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
  scrollBelowBar,
  Select,
  Table,
  Td,
} from "@/components/ui";
import { plural } from "@/lib/plural";
import { CountrySelect } from "@/components/country-select";
export { rulePackLabel } from "@/lib/rule-pack";

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
 * · WHICH SERVICE OWES IT (T6.16). This form had an "Owed by clients who
 *   bought" picker whose blank answer was "Any service", and that blank is how
 *   98 GST filings reached a bookkeeping-only client on 2026-09-18. A filing is
 *   now added to a service in the CATALOGUE and nowhere else, as many services
 *   as want it, and a rule on no service adds nothing to the calendar. Two
 *   places to say "which service" is how the two answers drift apart, so the
 *   picker went rather than being kept beside the new one.
 *
 * ── THE CATALOGUE WRITES WITH THIS FORM TOO ─────────────────────────────────
 *
 * `/catalogue`'s "Write a new filing" renders this editor `bare` inside the
 * service's own card and sends `createBodyOf(draft)` plus the service it was
 * written on, so a filing written there and one written in the library are the
 * same shape by construction rather than by two forms agreeing.
 */

export type DueRuleKind = "day_of_month" | "days_after";

export interface RuleDraft {
  readonly recurrence: string;
  readonly fiscalYearStartMonth: number;
  readonly hasFormula: boolean;
  readonly kind: DueRuleKind;
  /** Null until somebody types it: a rule with no formula opens with EMPTY
   *  boxes (audit 2026-10-03, CA#9). It pre-filled "the 20th of the following
   *  month", which is GSTR-3B's date, onto a yearly return like ITR. */
  readonly dueMonthOffset: number | null;
  readonly dueDayOfMonth: number | null;
  readonly dueDaysAfter: number | null;
  readonly unresolvedReason: string;
  readonly module: string;
  readonly authority: string;
  readonly entityType: string;
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
    // The rule's own numbers, or nothing: never a guessed date (CA#9).
    dueMonthOffset: rule?.dueRule?.dueMonthOffset ?? null,
    dueDayOfMonth: rule?.dueRule?.dueDayOfMonth ?? null,
    dueDaysAfter: rule?.dueRule?.dueDaysAfter ?? null,
    unresolvedReason: rule?.unresolvedReason ?? "",
    module: rule?.module ?? "",
    authority: rule?.authority ?? "",
    entityType: rule?.entityType ?? "",
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
  };
}

/**
 * A NEW rule's body: the draft plus its three identity fields.
 *
 * One function for both writers, the library's "Write a rule" and the
 * catalogue's "Write a new filing", so the two cannot send different shapes.
 * The catalogue adds `serviceEntryIds` beside it; the library sends none, and
 * a rule on no service adds nothing to the calendar until a service carries it.
 *
 * `leadTimeDays: 0` is the shipped pack's own default and not a guess at the
 * firm's practice: T–X is set on the library's row once the rule is in use.
 */
export function createBodyOf(d: RuleDraft): Record<string, unknown> {
  return {
    ...bodyOf(d),
    name: d.name.trim(),
    jurisdiction: d.jurisdiction.trim().toUpperCase(),
    rulePack: d.rulePack.trim(),
    leadTimeDays: 0,
  };
}

/** A field of the draft and what is wrong with it, in words. */
type Problems = Partial<Record<keyof RuleDraft, string>>;

/**
 * What the API would refuse in this draft, said beside the field BEFORE any
 * call (T6.16 follow-up).
 *
 * An empty name reached the API from "Write a new filing" and came back as
 * zod's own sentence, "name: String must contain at least 1 character(s)",
 * which is a developer's words on a partner's screen. So every field the body
 * above REQUIRES is checked here, in the terms the request schema uses (a
 * name and a pack of at least one character, a two-letter country, a day of
 * the month from 1 to 31, and a reason when there is no formula), and the
 * sentence says what to type. The API still refuses regardless; what it
 * refuses for reasons only it can know (the name already taken in that pack)
 * still arrives in the `refusal` slot.
 *
 * The three identity fields are checked only while CREATING, because an edit
 * does not send them. The counts need no check: `intOf` floors them already.
 */
function problemsOf(d: RuleDraft, creating: boolean): Problems {
  const out: Problems = {};
  if (creating) {
    if (d.name.trim() === "") out.name = "Give the filing a name, for example GSTR-3B.";
    if (d.jurisdiction.trim() === "") {
      out.jurisdiction = "Choose the country.";
    }
    if (d.rulePack.trim() === "") {
      out.rulePack = `Give the rule pack a name. Your firm's own is ${firmRulePack()}.`;
    }
  }
  if (d.hasFormula && d.kind === "day_of_month") {
    if (d.dueDayOfMonth === null || d.dueDayOfMonth < 1 || d.dueDayOfMonth > 31) {
      out.dueDayOfMonth = "Give a day of the month from 1 to 31.";
    }
    if (d.dueMonthOffset === null) {
      out.dueMonthOffset = "Give the months after the period ends. 0 is the same month.";
    }
  }
  if (d.hasFormula && d.kind === "days_after" && d.dueDaysAfter === null) {
    out.dueDaysAfter = "Give the number of days.";
  }
  if (!d.hasFormula && d.unresolvedReason.trim() === "") {
    out.unresolvedReason =
      "Say what the date is waiting for, for example the date of the AGM, or choose that this rule computes a date.";
  }
  return out;
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
    if (d.dueDaysAfter === null) return `${every} · the date is not filled in yet`;
    return `${every} · ${String(d.dueDaysAfter)} days after ${from}`;
  }
  if (d.dueDayOfMonth === null || d.dueMonthOffset === null) return `${every} · the date is not filled in yet`;
  const day = ordinal(d.dueDayOfMonth);
  if (d.dueMonthOffset === 0) return `${every} · the ${day} of the month the period ends in`;
  if (d.dueMonthOffset === 1) return `${every} · the ${day} of the following month`;
  return `${every} · the ${day}, ${String(d.dueMonthOffset)} months after ${from}`;
}

/**
 * A SAVED rule's formula, in words.
 *
 * A partner has to be able to check this against the statute without knowing
 * what `dueMonthOffset` means. The first version of this function was written
 * blind and produced "Once a year, day 15 3 months after" and "When it happens,
 * 30 days after the period ends": both grammatical nonsense, and the second one
 * factually wrong as well, because an event-driven rule has no period to count
 * from. Reading the page is what found them; the types were happy.
 *
 * Two functions, deliberately: `describeDraft` describes an unsaved draft and
 * this a saved rule, and merging them would mean building a fake rule out of
 * form state to render a sentence. It lives HERE rather than in the library's
 * page since T6.16, because the catalogue needs the same sentence three times
 * (the picker's options, a service's filings, the confirmation before adding
 * an unconfirmed one) and a third copy is how the wording drifts.
 */
export function describeRule(rule: Pick<ObligationRule, "recurrence" | "dueRule">): string {
  const every = EVERY[rule.recurrence] ?? rule.recurrence;
  const due = describeDue(rule);
  return due === null ? every : `${every} · ${due}`;
}

/**
 * Only the due half of `describeRule`: "the 22nd of the following month", or
 * null when there is no formula. For the line saying what a law change moves
 * a date TO, where "Every month" again would be noise: a successor keeps its
 * predecessor's period shape, because the amendment form cannot change it.
 */
export function describeDue(rule: Pick<ObligationRule, "recurrence" | "dueRule">): string | null {
  if (rule.dueRule === null) return null;

  // An EVENT rule counts from the event, never from a period: it does not have
  // one. Saying "after the period ends" there would describe a mechanism that
  // does not exist.
  const from = rule.recurrence === "event" ? "the event" : "the period ends";

  if (rule.dueRule.kind === "days_after") {
    return `${String(rule.dueRule.dueDaysAfter ?? 0)} days after ${from}`;
  }

  const offset = rule.dueRule.dueMonthOffset ?? 0;
  const day = ordinal(rule.dueRule.dueDayOfMonth ?? 1);
  if (offset === 0) return `the ${day} of the month the period ends in`;
  if (offset === 1) return `the ${day} of the following month`;
  return `the ${day}, ${String(offset)} months after ${from}`;
}

/**
 * What a filing is due on TODAY: the formula of the chain's row that governs
 * the period containing the firm's today, which the API reads on the firm's
 * own day (T6.16 follow-up).
 *
 * A rule row's own `dueRule` is not that. The catalogue's row for a chain is
 * its NEWEST row, and after "from April 2027 the law says the 22nd" that is the
 * successor: the card said September was due on the 22nd while the calendar,
 * correctly, dated it the 20th. So every place that says when a filing is due
 * (a service's filings, the picker, the confirmation) says it through this,
 * and `describeNextChange` says what changes and when. Null from the API means
 * no row governs today yet; the row itself is then the best there is.
 */
export function todayOf(rule: ObligationRule): {
  readonly dueRule: ObligationRule["dueRule"];
  readonly exceptions: ObligationRule["exceptions"];
  readonly coverage: ObligationRule["coverage"];
  readonly unresolvedReason: ObligationRule["unresolvedReason"];
} {
  // COVERAGE TOO (review): a pill read off the newest row said "date not
  // known yet" for a successor waiting on a fact, beside today's 20th, while
  // the confirmed row before it was putting this year's returns on the
  // calendar. The API judges each row of the chain, so the pill and the
  // date above it describe one row.
  return rule.inForceToday ?? rule;
}

export function describeToday(rule: ObligationRule): string {
  return describeRule({ recurrence: rule.recurrence, dueRule: todayOf(rule).dueRule });
}

/**
 * The second line after a law change: "From April 2027: the 22nd of the
 * following month." Null when nothing changes.
 *
 * The day is `firstPeriodStart`, the start of the first period the new rule
 * GOVERNS, which the API works out the way the calendar dates periods. Not
 * `effectiveFrom`, the day the change was recorded from (review): a
 * quarterly rule changed on 1 August printed "From August 2026" in September,
 * while the July to September quarter was still due under the old rule. A
 * period start is a 1st and names its month; only an event-driven rule, which
 * has no period, can start on another day, and that is said as the day.
 */
export function describeNextChange(rule: ObligationRule): string | null {
  const next = rule.nextChange;
  if (next === null) return null;
  const when = next.firstPeriodStart.endsWith("-01")
    ? `From ${monthYear(next.firstPeriodStart)}`
    : `From ${longDay(next.firstPeriodStart)}`;
  // WHAT THE NEW ROW DOES, not only its formula (review). A retired successor
  // dates nothing from then on, and one nobody has confirmed dates nothing
  // until somebody does; printing its formula alone promised both.
  if (next.coverage === "retired") {
    return `${when}: nothing goes on the calendar, because the rule from then on is retired.`;
  }
  const due = describeDue({ recurrence: rule.recurrence, dueRule: next.dueRule });
  if (due !== null && next.coverage === "unconfirmed") {
    return `${when}: ${due}, once somebody confirms it in the library.`;
  }
  if (due !== null) return `${when}: ${due}.`;
  // A successor may be written waiting on a fact; its reason is the firm's
  // own sentence and is printed as written, as the library prints it.
  const reason = next.unresolvedReason?.trim() ?? "";
  return reason === ""
    ? `${when}: the date is not known yet.`
    : `${when}: the date is not known yet. ${reason}`;
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

/** The same, but an EMPTY box stays empty (null): a formula number is never
 *  filled in for the partner (CA#9). The form then says what is missing. */
export function intOrNull(raw: string, min: number): number | null {
  return raw.trim() === "" ? null : intOf(raw, min);
}

export function RuleEditor({
  draft,
  onChange,
  /** Null while creating: there is no rule yet, so nothing is locked. */
  rule,
  creating,
  busy,
  onSave,
  onCancel,
  bare = false,
  saveLabel,
  cancelLabel,
  refusal,
  onRefused,
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
  rule: ObligationRule | null;
  creating: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** No card of its own. The catalogue renders this inside a service's card,
   *  and a card inside a card draws two borders around one form. */
  bare?: boolean;
  /** What the save button says. The catalogue's reads "Write it and add it to
   *  this service", because that press does both. */
  saveLabel?: string;
  /** The Cancel button's accessible name, when the page around it has more
   *  than one: every service card in the catalogue can hold one of these. */
  cancelLabel?: string;
  /** The API's refusal of the save, drawn just above the save row, beside
   *  the button that was pressed. The catalogue passes one: its form is
   *  about 900px tall, and a refusal drawn above it was off screen. */
  refusal?: ReactNode;
  /** This form refused a save itself, before any call. The page clears the
   *  API's last refusal here: it answered a different body, and left beside
   *  "Give the filing a name" it read as a second reason (review). */
  onRefused?: () => void;
}) {
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void => {
    onChange({ ...draft, [key]: value });
  };
  // The period shape is editable exactly while the rule has produced nothing,
  // which is the state of every rule a partner actually has to answer.
  const produced = rule?.instanceCount ?? 0;
  const shapeLocked = produced > 0;
  // Two paragraphs on this form sit BELOW a `.field-row` rather than inside a
  // column of it — deliberately, because a hint inside one column makes that
  // field taller and leaves four inputs at four heights. Sitting outside, they
  // have to be pointed at by hand, and neither was: each describes two fields
  // at once, which is also why neither could be a `<Field hint>`.
  const noteId = useId();
  const periodNoteId = `${noteId}-period`;
  const groupingNoteId = `${noteId}-grouping`;
  // The radio group's NAME, and "new" is not unique any more: the catalogue can
  // hold a new-filing form on every service card at once, and two radio groups
  // sharing a name in one document are ONE group, so answering the formula on
  // one card would untick it on the other.
  const group = `formula-${rule?.id ?? noteId}`;

  // THE CHECK BEFORE THE CALL. Nothing is said until a save is pressed, so a
  // form opening empty is not a form opening red; after that, each sentence
  // goes the moment its field is fixed. Remembered PER FORM (the rule's id, or
  // "new"), because the library keeps one editor mounted while a partner moves
  // from rule to rule, and one rule's refusal must not appear on the next.
  const formKey = rule?.id ?? "new";
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const problems = problemsOf(draft, creating);
  const shown: Problems = checkedFor === formKey ? problems : {};

  // FOCUS THE FIRST REFUSED FIELD, below the sticky bar. The save row is at
  // the bottom of a form about 900px tall and the name box at its top, so a
  // sentence drawn beside the name is off screen from the button that was
  // pressed; moving focus there is what brings it into view, and `focus()`'s
  // own scroll would park the field's label under the bar. Every press moves
  // it again, so a second press on an unchanged form is not a dead button.
  useEffect(() => {
    if (attempt === 0) return;
    const first = box.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (first === null || first === undefined) return;
    scrollBelowBar(first.closest(".field") ?? first);
    first.focus({ preventScroll: true });
  }, [attempt]);

  const save = (): void => {
    if (Object.keys(problems).length > 0) {
      setCheckedFor(formKey);
      setAttempt((n) => n + 1);
      onRefused?.();
      return;
    }
    onSave();
  };

  const form = (
    <Stack>
      {creating && (
        <>
          <FieldRow>
            <Field label="Filing" error={shown.name ?? null}>
              <Input
                value={draft.name}
                placeholder="e.g. PF monthly return"
                onChange={(e) => { set("name", e.target.value); }}
              />
            </Field>
            <Field label="Country" error={shown.jurisdiction ?? null}>
              {/* A picker (F24): it was a typed two-letter code. */}
              <CountrySelect
                value={draft.jurisdiction}
                blankLabel="Choose a country"
                required
                onChange={(e) => { set("jurisdiction", e.target.value); }}
              />
            </Field>
            <Field label="Rule pack" error={shown.rulePack ?? null}>
              <Input
                value={draft.rulePack}
                onChange={(e) => { set("rulePack", e.target.value); }}
              />
            </Field>
          </FieldRow>
          {/* The pack is prefilled with the firm's own name, kept apart from the
              shipped `gst-in@...` pack, so reloading a shipped pack never
              overwrites a rule the firm wrote. */}
          <Notice eyebrow="Cannot be changed later">
            The filing, country and pack identify this rule. Every filing it makes points back
            to them.
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
          April for India, so a quarter runs April to June.
        </p>
      )}

      {/* DISABLED WITH THE SENTENCE, never silently. A partner meets an
          explanation rather than the API's 409. */}
      {shapeLocked && (
        <Notice tone="warn" eyebrow="The period shape is fixed now">
          This rule has made {plural(produced, "filing")} on these periods. To
          change them, retire it and write a new one.
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
                  <Field label="Day of the month" error={shown.dueDayOfMonth ?? null}>
                    <Input
                      inputMode="numeric"
                      placeholder="e.g. 15"
                      value={draft.dueDayOfMonth === null ? "" : String(draft.dueDayOfMonth)}
                      onChange={(e) => { set("dueDayOfMonth", intOrNull(e.target.value, 1)); }}
                    />
                  </Field>
                  <Field label="Months after the period ends" error={shown.dueMonthOffset ?? null}>
                    <Input
                      inputMode="numeric"
                      placeholder="e.g. 2"
                      value={draft.dueMonthOffset === null ? "" : String(draft.dueMonthOffset)}
                      onChange={(e) => { set("dueMonthOffset", intOrNull(e.target.value, 0)); }}
                    />
                  </Field>
                </>
              ) : (
                <Field label="Days after the period ends" error={shown.dueDaysAfter ?? null}>
                  <Input
                    inputMode="numeric"
                    placeholder="e.g. 30"
                    value={draft.dueDaysAfter === null ? "" : String(draft.dueDaysAfter)}
                    onChange={(e) => { set("dueDaysAfter", intOrNull(e.target.value, 0)); }}
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
            <Field label="What it is waiting for" error={shown.unresolvedReason ?? null}>
              <Input
                value={draft.unresolvedReason}
                placeholder="e.g. Due a set time after the AGM, and no AGM date is held"
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
            placeholder="e.g. GST"
            onChange={(e) => { set("authority", e.target.value); }}
          />
        </Field>
        <Field label="Statute grouping">
          <Input
            value={draft.module}
            placeholder="e.g. TDS"
            aria-describedby={groupingNoteId}
            onChange={(e) => { set("module", e.target.value); }}
          />
        </Field>
        <Field label="Only for entity type" optional>
          <Input
            value={draft.entityType}
            placeholder="e.g. private_limited"
            aria-describedby={groupingNoteId}
            onChange={(e) => { set("entityType", e.target.value); }}
          />
        </Field>
        {/* No "which service" field. See WHAT IS NOT OFFERED above: the
            catalogue is the one place a filing meets a service. */}
      </FieldRow>
      {/* One paragraph, TWO fields — which is exactly why it cannot be a
          `<Field hint>` and had to be wired by hand. */}
      <p id={groupingNoteId} className="field-hint">
        Statute grouping is the law&rsquo;s (GST, TDS, MCA), not your Dept. Blank entity type
        means every kind of company.
      </p>

      {/* THE SENTENCE A PARTNER CHECKS AGAINST THE STATUTE, before saving
          rather than after. `dueMonthOffset: 1` is not proofreadable. */}
      <p>
        <strong>Reads as:</strong> {describeDraft(draft)}
      </p>

      {refusal}
      <Cluster>
        <Button onClick={save} loading={busy}>
          {saveLabel ?? (creating ? "Write the rule" : "Save the formula")}
        </Button>
        <Button
          variant="ghost"
          /* SAYS WHICH CANCEL. Open a rule and then "The law changed" and
             there are two buttons on screen saying only "Cancel" — this one
             abandons an edit to the formula, the other abandons an
             AMENDMENT, which is a new rule taking over from a date. Named by
             `rule.name`, which is the saved name and does not move while the
             name box is being typed in; `draft.name` would rename the button
             on every keystroke. The visible word is unchanged. */
          {...(cancelLabel !== undefined
            ? { "aria-label": cancelLabel }
            : rule === null
              ? {}
              : { "aria-label": `Cancel the edit to ${rule.name}` })}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
      </Cluster>
    </Stack>
  );

  // The wrapper is what the refused-field search looks inside: a page holds a
  // form like this on every service card, and the first refused field is this
  // form's, not the page's.
  const boxed = <div ref={box}>{form}</div>;
  return bare ? boxed : <Card>{boxed}</Card>;
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
            aria-expanded={open}
            onClick={() => { setOpen((o) => !o); }}
          >
            {open ? "Cancel" : "Add an exception"}
          </Button>
        )}
      </CardHead>

      <Stack>
        {rule.exceptions.length === 0 ? (
          <p>None. Every period follows the formula.</p>
        ) : (
          <Table>
            <tbody>
              {rule.exceptions.map((e) => (
                <tr key={e.periodEndMonth}>
                  <Td>Period ending {MONTHS[e.periodEndMonth - 1] ?? "?"}</Td>
                  <Td>
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
                        title="Put this period back under the rule's own formula. The row is kept on record, because it explains why a filing was due on the day it was."
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
              <Field label="Month the period ends in">
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
              The month the period ends in, not the month it is due.
            </p>
            {/* Required: without it a partner checking the calendar cannot tell
                a real exception from a typo. */}
            <Field label="Why this period is different" hint="Required.">
              <Input
                value={note}
                placeholder="e.g. March is the year end; the law allows till the 30th"
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
