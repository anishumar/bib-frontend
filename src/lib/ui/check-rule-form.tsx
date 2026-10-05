"use client";

import { useId, useState } from "react";
import { api, apiError, VERIFICATION_RULES } from "@/lib/api/client";
import type { StaffGrade, VerificationRule } from "@/lib/api/client";
import { Button, Field, FieldRow, Fieldset, Input, Radio, Select } from "@/components/ui";
import { shortNameFrom } from "@/lib/short-name";

/**
 * Writing a rule for who checks work, shared by Who checks work and the process
 * editor (audit 2026-10-03, CA#27).
 *
 * A step could only name a rule that already existed on its own page, so a
 * partner writing a process met "No rule is in force yet" and had to leave the
 * editor, losing what was typed. The process editor now opens this same form
 * in place, saves it and puts it in force (`putInForce`), and selects it.
 *
 * The grade picker appears only for the two rules that READ a grade: the API
 * refuses a `reporting_line` body carrying a threshold, so offering the field
 * would be offering a 400. The short name is made from the name (CA#26) and is
 * editable under More.
 */

export interface PolicyBody {
  readonly label: string;
  readonly rule: VerificationRule;
  readonly minGradeRank: number | null;
  readonly minGradeCode: string | null;
}

export function readPolicyBody(body: Record<string, unknown> | undefined): PolicyBody | null {
  if (!body) return null;
  const rule = body["rule"];
  if (typeof rule !== "string") return null;
  if (!VERIFICATION_RULES.some((r) => r.value === rule)) return null;
  return {
    label: typeof body["label"] === "string" ? body["label"] : "",
    rule: rule as VerificationRule,
    minGradeRank: typeof body["minGradeRank"] === "number" ? body["minGradeRank"] : null,
    minGradeCode: typeof body["minGradeCode"] === "string" ? body["minGradeCode"] : null,
  };
}

export function CheckRuleForm({
  policyKey,
  initial,
  grades,
  takenKeys = [],
  putInForce = false,
  onDone,
  onCancel,
  onError,
}: {
  /** Null writes a NEW rule; a key writes a new version of that one. */
  policyKey: string | null;
  initial?: PolicyBody | null;
  grades: readonly StaffGrade[];
  /** Short names already in use, so a made one does not clash. */
  takenKeys?: readonly string[];
  /** Save AND put it in force in one press: the process editor's case, where
   *  a draft could not be chosen for a step. */
  putInForce?: boolean;
  onDone: (key: string, label: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [rule, setRule] = useState<VerificationRule>(initial?.rule ?? "client_key_manager");
  const [gradeCode, setGradeCode] = useState(initial?.minGradeCode ?? "");
  const [busy, setBusy] = useState(false);
  const editorId = useId();
  const reportingNoteId = `${editorId}-reporting`;
  const draftNoteId = `${editorId}-draft`;

  // Retired rungs are not offered: writing a NEW rule against a rung the firm
  // has moved on from is a stale choice nobody meant.
  const offered = grades.filter((g) => g.isActive);
  // Only the two rules that test a grade ask for one.
  const needsGrade = rule === "rank_threshold" || rule === "reporting_line_or_rank";
  const chosen = offered.find((g) => g.code === gradeCode) ?? null;
  // The short name follows the name until somebody types their own (CA#26).
  const shortName = keyTouched ? key.trim() : shortNameFrom(label, "entry", "rule", takenKeys);

  async function save(): Promise<void> {
    setBusy(true);
    // Cleared first: a second identical refusal must be a second appearance.
    onError("");
    const body: Record<string, unknown> = {
      label: label.trim(),
      rule,
      // The RANK, resolved here from the grade the firm picked, because a
      // published body is frozen and re-resolving a code later would answer an
      // old question with today's ladder. The code rides along for display.
      minGradeRank: needsGrade ? (chosen?.rank ?? null) : null,
      minGradeCode: needsGrade ? (chosen?.code ?? null) : null,
    };
    const targetKey = policyKey ?? shortName;
    let version: number | null = null;
    if (policyKey === null) {
      const created = await api.POST("/api/v1/config/{kind}", {
        params: { path: { kind: "verification_policy" } },
        body: { key: targetKey, body },
      });
      if (created.error) {
        setBusy(false);
        // Verbatim: the validator's message names the field and the valid set.
        onError(apiError(created.error).message);
        return;
      }
      version = created.data.draft?.version ?? null;
    } else {
      const added = await api.POST("/api/v1/config/{kind}/{key}/versions", {
        params: { path: { kind: "verification_policy", key: policyKey } },
        body: { body },
      });
      if (added.error) {
        setBusy(false);
        onError(apiError(added.error).message);
        return;
      }
      version = added.data?.version ?? null;
    }
    if (putInForce && version !== null) {
      const published = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "verification_policy", key: targetKey, version } },
      });
      if (published.error) {
        setBusy(false);
        onError(apiError(published.error).message);
        return;
      }
    }
    setBusy(false);
    onDone(targetKey, label.trim());
  }

  const incomplete =
    label.trim() === "" || (policyKey === null && shortName === "") || (needsGrade && chosen === null);

  return (
    /* NAMED, because two editors can be open at once. No legend, so nothing
       moves on screen. */
    <fieldset
      className="fieldset"
      style={{ marginTop: "var(--s-4)" }}
      aria-label={policyKey === null ? "A new rule" : `The rule ${initial?.label ?? policyKey}`}
    >
      <FieldRow>
        <Field label="What to call it">
          <Input
            value={label}
            placeholder="e.g. Manager review"
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </Field>
      </FieldRow>
      {policyKey === null && (
        <details className="mt-2">
          <summary className="text-sm">More</summary>
          <Field label="Short name" hint="Made from the name. Steps refer to it, so it cannot change later.">
            <Input
              value={shortName}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
            />
          </Field>
        </details>
      )}

      <Fieldset legend="Who may check it">
        {VERIFICATION_RULES.map((r) => (
          <Radio
            key={r.value}
            label={<strong>{r.label}</strong>}
            note={r.detail}
            name={`rule-${editorId}`}
            checked={rule === r.value}
            {...(r.value === "reporting_line" && rule === "reporting_line"
              ? { "aria-describedby": reportingNoteId }
              : {})}
            onChange={() => {
              setRule(r.value);
            }}
          />
        ))}
      </Fieldset>

      {needsGrade && (
        <div style={{ marginTop: "var(--s-4)", maxWidth: 360 }}>
          {offered.length === 0 ? (
            <>
              <p className="label">From which grade up</p>
              <p>No grades yet. Add them on Grades, or choose the manager rule.</p>
            </>
          ) : (
            <Field label="From which grade up">
              <Select
                value={gradeCode}
                onChange={(e) => {
                  setGradeCode(e.target.value);
                }}
              >
                <option value="">Choose a grade…</option>
                {[...offered]
                  .sort((a, b) => b.rank - a.rank)
                  .map((g) => (
                    <option key={g.id} value={g.code}>
                      {g.name} and above
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>
      )}

      {rule === "client_key_manager" && (
        <p className="field-hint" style={{ marginTop: "var(--s-4)" }}>
          Reads the Key Manager on the client&apos;s account team. A client with no Key Manager is
          checked by the person who signs for the firm.
        </p>
      )}

      {rule === "reporting_line" && (
        <p id={reportingNoteId} className="field-hint" style={{ marginTop: "var(--s-4)" }}>
          Reads who reports to whom on People. Nobody there: nobody may check their work.
        </p>
      )}

      <div className="cluster mt-4">
        <Button disabled={busy || incomplete} aria-describedby={draftNoteId} onClick={() => void save()}>
          {putInForce ? "Save and use it" : policyKey === null ? "Save as a draft" : "Save the change"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p id={draftNoteId} className="field-hint">
        {putInForce
          ? "It is put in force at once, and this step is checked under it."
          : "Saved as a draft. Nothing changes until you put it in force."}
      </p>
    </fieldset>
  );
}
