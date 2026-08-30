"use client";

import { useState } from "react";
import type { ConfigEntry, ObligationRule } from "@/lib/api/client";

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
 * one radio: EITHER this rule computes a date, OR it says what it is waiting
 * for. The form cannot express the states the database refuses.
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
 *  the firm wrote itself. Prefilled rather than locked: it is a default the
 *  partner may overwrite, which is what this whole screen is about. */
export function firmRulePack(): string {
  return `firm@${String(new Date().getFullYear())}`;
}

export function draftOf(rule: ObligationRule | null): RuleDraft {
  return {
    recurrence: rule?.recurrence ?? "monthly",
    fiscalYearStartMonth: rule?.fiscalYearStartMonth ?? 4,
    hasFormula: rule?.dueRule != null,
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
 * both.
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
 * anybody can proofread. The first version of the list's copy of this function
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

  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      {creating && (
        <div className="bib-field-row">
          <label className="bib-label">
            Filing
            <input
              className="bib-input"
              value={draft.name}
              placeholder="PF monthly return"
              onChange={(e) => { set("name", e.target.value); }}
            />
          </label>
          <label className="bib-label">
            Country
            <input
              className="bib-input"
              value={draft.jurisdiction}
              maxLength={2}
              placeholder="IN"
              onChange={(e) => { set("jurisdiction", e.target.value.toUpperCase()); }}
            />
          </label>
          <label className="bib-label">
            Rule pack
            <input
              className="bib-input"
              value={draft.rulePack}
              onChange={(e) => { set("rulePack", e.target.value); }}
            />
          </label>
        </div>
      )}
      {creating && (
        <p className="bib-hint" style={{ marginTop: 0 }}>
          The filing, the country and the pack are this rule&rsquo;s <strong>identity</strong> and
          cannot be changed afterwards &mdash; every filing it generates pins this row, so moving
          them would restate why those filings were due when they were. The pack is prefilled with
          the firm&rsquo;s own, kept clear of the shipped <span className="bib-mono">gst-in@…</span>{" "}
          namespace so reloading a shipped pack can never collide with an answer you wrote here.
        </p>
      )}

      <div className="bib-field-row">
        <label className="bib-label">
          How often
          <select
            className="bib-select"
            value={draft.recurrence}
            disabled={shapeLocked}
            onChange={(e) => { set("recurrence", e.target.value); }}
          >
            <option value="monthly">Every month</option>
            <option value="quarterly">Every quarter</option>
            <option value="half_yearly">Twice a year</option>
            <option value="annual">Once a year</option>
            <option value="event">When something happens</option>
          </select>
        </label>
        <label className="bib-label">
          Financial year starts in
          <select
            className="bib-select"
            value={String(draft.fiscalYearStartMonth)}
            disabled={shapeLocked}
            onChange={(e) => { set("fiscalYearStartMonth", Number(e.target.value)); }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {shapeLocked ? (
        <p className="bib-hint" style={{ marginTop: 0 }}>
          These two decide where a period <strong>begins</strong>, and this rule has already
          produced {produced} filing{produced === 1 ? "" : "s"} keyed on those boundaries. Changing
          them now would orphan every one of them &mdash; last quarter&rsquo;s return would match no
          quarter. Retire this rule and write a new one instead; the retired row goes on explaining
          the filings it made.
        </p>
      ) : (
        <p className="bib-hint" style={{ marginTop: 0 }}>
          April for India: a quarter runs Apr&ndash;Jun, so leaving this at January would put every
          quarterly filing in the wrong period.
        </p>
      )}

      {/* ── THE ONE DECISION, AS ONE CONTROL ──────────────────────────────── */}
      <fieldset style={{ border: "none", padding: 0, margin: "var(--bib-gap-2) 0 0" }}>
        <legend style={{ padding: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>
          WHEN IT IS DUE
        </legend>
        <label className="bib-check" style={{ marginTop: "var(--bib-gap-1)" }}>
          <input
            type="radio"
            name={`formula-${rule?.id ?? "new"}`}
            checked={draft.hasFormula}
            onChange={() => { set("hasFormula", true); }}
          />
          <span>This rule computes a date</span>
        </label>
        {draft.hasFormula && (
          <div className="bib-field-row" style={{ marginTop: "var(--bib-gap-1)" }}>
            <label className="bib-label">
              Counted as
              <select
                className="bib-select"
                value={draft.kind}
                onChange={(e) => { set("kind", e.target.value as DueRuleKind); }}
              >
                <option value="day_of_month">A day of a month</option>
                <option value="days_after">A number of days</option>
              </select>
            </label>
            {draft.kind === "day_of_month" ? (
              <>
                <label className="bib-label">
                  Day of the month
                  <input
                    className="bib-input"
                    inputMode="numeric"
                    value={String(draft.dueDayOfMonth)}
                    onChange={(e) => { set("dueDayOfMonth", intOf(e.target.value, 1)); }}
                  />
                </label>
                <label className="bib-label">
                  Months after the period ends
                  <input
                    className="bib-input"
                    inputMode="numeric"
                    value={String(draft.dueMonthOffset)}
                    onChange={(e) => { set("dueMonthOffset", intOf(e.target.value, 0)); }}
                  />
                </label>
              </>
            ) : (
              <label className="bib-label">
                Days after the period ends
                <input
                  className="bib-input"
                  inputMode="numeric"
                  value={String(draft.dueDaysAfter)}
                  onChange={(e) => { set("dueDaysAfter", intOf(e.target.value, 0)); }}
                />
              </label>
            )}
          </div>
        )}

        <label className="bib-check" style={{ marginTop: "var(--bib-gap-2)" }}>
          <input
            type="radio"
            name={`formula-${rule?.id ?? "new"}`}
            checked={!draft.hasFormula}
            onChange={() => { set("hasFormula", false); }}
          />
          <span>
            It depends on something this system does not hold &mdash; say what, and the calendar
            shows that instead of a deadline
          </span>
        </label>
        {!draft.hasFormula && (
          <input
            className="bib-input"
            style={{ width: "100%", marginTop: "var(--bib-gap-1)" }}
            value={draft.unresolvedReason}
            placeholder="Due within a statutory period after the AGM, and no AGM date is recorded here."
            onChange={(e) => { set("unresolvedReason", e.target.value); }}
          />
        )}
      </fieldset>

      <div className="bib-field-row" style={{ marginTop: "var(--bib-gap-2)" }}>
        <label className="bib-label">
          Filed with
          <input
            className="bib-input"
            value={draft.authority}
            placeholder="GST"
            onChange={(e) => { set("authority", e.target.value); }}
          />
        </label>
        <label className="bib-label">
          Statute grouping
          <input
            className="bib-input"
            value={draft.module}
            placeholder="TDS"
            onChange={(e) => { set("module", e.target.value); }}
          />
        </label>
        <label className="bib-label">
          Only for entity type
          <input
            className="bib-input"
            value={draft.entityType}
            placeholder="private_limited"
            onChange={(e) => { set("entityType", e.target.value); }}
          />
        </label>
        <label className="bib-label">
          Owed by clients who bought
          <select
            className="bib-select"
            value={draft.serviceEntryId}
            onChange={(e) => { set("serviceEntryId", e.target.value); }}
          >
            <option value="">Any service</option>
            {services.map((s) => (
              <option key={s.entry.id} value={s.entry.id}>{s.entry.key}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="bib-hint" style={{ marginTop: 0 }}>
        <strong>Statute grouping</strong> is the law&rsquo;s &mdash; GST, TDS, MCA &mdash; and not
        the firm&rsquo;s revenue Dept, which is a different axis. Leaving{" "}
        <strong>entity type</strong> blank means every kind of company, which is the ordinary case:
        GST does not care what shape a client is.
      </p>

      <p className="bib-mono" style={{ marginBottom: "var(--bib-gap-2)" }}>
        {describeDraft(draft)}
      </p>
      <div style={{ display: "flex", gap: "var(--bib-gap-1)" }}>
        <button type="button" onClick={onSave} disabled={busy}>
          {creating ? "Write the rule" : "Save the formula"}
        </button>
        <button type="button" className="bib-button-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
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
  const [month, setMonth] = useState("3");
  const [kind, setKind] = useState<DueRuleKind>("day_of_month");
  const [day, setDay] = useState("30");
  const [offset, setOffset] = useState("1");
  const [daysAfter, setDaysAfter] = useState("30");
  const [note, setNote] = useState("");

  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      <h4 style={{ margin: "0 0 var(--bib-gap-1)" }}>Exceptions</h4>
      {rule.exceptions.length === 0 ? (
        <p className="bib-muted" style={{ marginTop: 0 }}>
          None. This rule&rsquo;s own formula governs every period.
        </p>
      ) : (
        <table className="bib-table">
          <tbody>
            {rule.exceptions.map((e) => (
              <tr key={e.periodEndMonth}>
                <td style={{ whiteSpace: "nowrap" }}>
                  Period ending {MONTHS[e.periodEndMonth - 1] ?? "?"}
                </td>
                <td className="bib-mono">
                  {e.kind === "days_after"
                    ? `${String(e.dueDaysAfter ?? 0)} days after the period ends`
                    : `the ${ordinal(e.dueDayOfMonth ?? 1)}, ${String(e.dueMonthOffset ?? 0)} month${
                        (e.dueMonthOffset ?? 0) === 1 ? "" : "s"
                      } after`}
                </td>
                <td>{e.note}</td>
                <td style={{ textAlign: "right" }}>
                  {mayWrite && (
                    <button
                      type="button"
                      className="bib-pill"
                      disabled={busy}
                      onClick={() => { onWithdraw(e.periodEndMonth); }}
                      title="Put this period back under the rule's own formula. The row is kept, never destroyed — it is part of why a filing was due on the day it was."
                    >
                      Withdraw
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mayWrite && rule.recurrence !== "event" && (
        <details style={{ marginTop: "var(--bib-gap-2)" }}>
          <summary>Add an exception</summary>
          <div className="bib-field-row" style={{ marginTop: "var(--bib-gap-2)" }}>
            <label className="bib-label">
              Month the PERIOD ends in
              <select
                className="bib-select"
                value={month}
                onChange={(e) => { setMonth(e.target.value); }}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
            </label>
            <label className="bib-label">
              Counted as
              <select
                className="bib-select"
                value={kind}
                onChange={(e) => { setKind(e.target.value as DueRuleKind); }}
              >
                <option value="day_of_month">A day of a month</option>
                <option value="days_after">A number of days</option>
              </select>
            </label>
            {kind === "day_of_month" ? (
              <>
                <label className="bib-label">
                  Day
                  <input
                    className="bib-input"
                    inputMode="numeric"
                    value={day}
                    onChange={(e) => { setDay(e.target.value); }}
                  />
                </label>
                <label className="bib-label">
                  Months after
                  <input
                    className="bib-input"
                    inputMode="numeric"
                    value={offset}
                    onChange={(e) => { setOffset(e.target.value); }}
                  />
                </label>
              </>
            ) : (
              <label className="bib-label">
                Days after
                <input
                  className="bib-input"
                  inputMode="numeric"
                  value={daysAfter}
                  onChange={(e) => { setDaysAfter(e.target.value); }}
                />
              </label>
            )}
          </div>
          <label className="bib-label" style={{ display: "block" }}>
            Why this period is different
            <input
              className="bib-input"
              style={{ width: "100%" }}
              value={note}
              placeholder="March is the year end, and the statute allows until the 30th."
              onChange={(e) => { setNote(e.target.value); }}
            />
          </label>
          <p className="bib-hint" style={{ marginTop: "var(--bib-gap-1)" }}>
            Required. A partner checking the calendar against the statute cannot otherwise tell a
            real carve-out from a typo.
          </p>
          <button
            type="button"
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
            }}
          >
            Add the exception
          </button>
        </details>
      )}
    </div>
  );
}
