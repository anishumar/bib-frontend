"use client";

import { useState } from "react";
import type { ObligationRule } from "@/lib/api/client";
import { Cluster, Row, Stack } from "@/components/layout";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  FieldRow,
  Input,
  Notice,
  Select,
} from "@/components/ui";
import { describeDraft, draftOf, firmRulePack, type DueRuleKind, type RuleDraft } from "./rule-editor";

/**
 * The law changed, from a day (migration 0057).
 *
 * ── THIS IS NOT THE EDIT FORM, AND THE DIFFERENCE IS THE WHOLE FEATURE ──────
 *
 * Editing a rule is a CORRECTION. Every date in the shipped pack came from a
 * previous vendor's document and ships `unconfirmed`, so a partner supplying
 * the real formula is not changing the law — they are recording it properly for
 * the first time. That edits in place and moves the filings already generated,
 * because those dates were this system's guess.
 *
 * This is an AMENDMENT. The old formula was RIGHT for every period before the
 * cutover, and a return filed under it has to go on explaining its own date
 * forever. So the old rule is not edited and it is not retired — it is CLOSED
 * at a day, and a successor opens on the same day, in one transaction.
 *
 * ── WHY IT ASKS FOR A PERIOD RATHER THAN "TODAY" ────────────────────────────
 *
 * The day is compared against the START of a filing period, never against a due
 * date. August's return is August's law even though it falls due on 20
 * September, so a change effective 1 September must not reach back and restate
 * August. The form says so where the date is typed, because getting it backwards
 * moves every date by exactly one period and looks entirely plausible.
 *
 * ── AND IT DEFAULTS TO NOTHING ──────────────────────────────────────────────
 *
 * No prefilled cutover. A date this screen guessed would be a date somebody
 * accepted, and the day a law changes is a fact about the world rather than a
 * convenience — the same reason every rule ships with a lead time of zero
 * rather than a plausible one.
 */
export function Supersede({
  rule,
  busy,
  onSupersede,
  onCancel,
}: {
  rule: ObligationRule;
  busy: boolean;
  onSupersede: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  // Seeded from the rule being replaced, because an amendment usually changes
  // one thing — and the partner should be reading the OLD formula while they
  // decide what the new one is.
  const [draft, setDraft] = useState<RuleDraft>(draftOf(rule));
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [rulePack, setRulePack] = useState(firmRulePack());

  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void => {
    setDraft({ ...draft, [key]: value });
  };
  const samePack = rulePack.trim() === rule.rulePack;

  return (
    <Card>
      <CardHead>
        <CardTitle>The law changed</CardTitle>
      </CardHead>
      <Stack>
        <Notice tone="warn" eyebrow="THIS KEEPS THE OLD RULE">
          <p>
            <strong>{rule.name}</strong> goes on governing every period beginning before the day
            you give, and the filings made under it keep their dates. A new rule governs
            everything from that day.
          </p>
          <p>
            Filings already on the calendar for those later periods move to the new rule and its
            dates. One that somebody has already started stays as it is, and you are told how
            many.
          </p>
          {/* T6.16: a service carries the rule's CHAIN, so the new rule is on
              every service the old one was on with nothing to copy. Said here
              because otherwise a partner goes to the catalogue to add it
              again, and wonders why it is already there. */}
          <p>
            The new rule stays on every service the old one is on in the Catalogue. Nothing needs
            adding again.
          </p>
          <p>
            If instead the date on this rule was simply <em>wrong</em>, close this and edit the
            formula. Editing corrects the calendar. This form records a change in the law.
          </p>
        </Notice>

        <FieldRow>
          <Field label="First period that uses the new rule">
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => { setEffectiveFrom(e.target.value); }}
            />
          </Field>
          <Field
            label="New rule pack"
            error={samePack ? "The new rule needs a pack of its own. This is the pack it replaces." : null}
          >
            <Input value={rulePack} onChange={(e) => { setRulePack(e.target.value); }} />
          </Field>
        </FieldRow>
        {/* BELOW THE ROW, not inside a column of it — `.field-row` is
            `align-items: end`, so a field carrying a hint stands taller and its
            input sits higher than the ones beside it. */}
        <p className="field-hint">
          Give the start of the period, not the due date. August&rsquo;s return follows
          August&rsquo;s law even though it is due on 20 September. Replacing{" "}
          <span className="mono">{rule.rulePack}</span>.
        </p>

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
                  onChange={(e) => { set("dueDayOfMonth", Number(e.target.value) || 1); }}
                />
              </Field>
              <Field label="Months after the period ends">
                <Input
                  inputMode="numeric"
                  value={String(draft.dueMonthOffset)}
                  onChange={(e) => { set("dueMonthOffset", Number(e.target.value) || 0); }}
                />
              </Field>
            </>
          ) : (
            <Field label="Days after the period ends">
              <Input
                inputMode="numeric"
                value={String(draft.dueDaysAfter)}
                onChange={(e) => { set("dueDaysAfter", Number(e.target.value) || 0); }}
              />
            </Field>
          )}
        </FieldRow>

        {/* BOTH FORMULAS, side by side. An amendment is a comparison — "it was
            the 20th and it is now the 11th" — and a form showing only the new
            one asks somebody to remember the old. */}
        <Row>
          <span className="mono faint">was · {describeDraft({ ...draftOf(rule), hasFormula: true })}</span>
          <span className="mono">now · {describeDraft({ ...draft, hasFormula: true })}</span>
        </Row>

        <Cluster>
          <Button
            disabled={busy || effectiveFrom === "" || samePack || rulePack.trim() === ""}
            onClick={() => {
              onSupersede({
                effectiveFrom,
                rulePack: rulePack.trim(),
                dueRule: {
                  kind: draft.kind,
                  dueMonthOffset: draft.kind === "day_of_month" ? draft.dueMonthOffset : null,
                  dueDayOfMonth: draft.kind === "day_of_month" ? draft.dueDayOfMonth : null,
                  dueDaysAfter: draft.kind === "days_after" ? draft.dueDaysAfter : null,
                },
              });
            }}
          >
            Hand over on this date
          </Button>
          <Button
            variant="ghost"
            /* The other half of the pair — see the note on the editor's
               Cancel in `rule-editor.tsx`. */
            aria-label={`Cancel the amendment to ${rule.name}`}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}
