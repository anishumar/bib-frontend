"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, VERIFICATION_RULES } from "@/lib/api/client";
import type { ConfigEntry, StaffGrade, VerificationRule } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  Fieldset,
  Input,
  Notice,
  Radio,
  Select,
  useSwapFocus,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";

/**
 * Who may check somebody else's work.
 *
 * ── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
 *
 * One rule on this page is NOT here: whoever did the work can never be the
 * person who approves it. That is a CHECK constraint in the database, it holds
 * against a script and an import as well as against this app, and no firm may
 * switch it off. The banner says so, because a control somebody thinks is a
 * setting is a control they will look for a way around.
 *
 * Everything else IS the firm's, and that is the whole reason for the screen.
 * The client gave two different answers on two different days — "Manager or
 * above is fine" (a grade) and "manager means engagement manager" (a person) —
 * and they are not the same rule. Picking one on the firm's behalf would be us
 * choosing its maker-checker control.
 *
 * ── AND WHY IT IS A LIST, NOT ONE SETTING ───────────────────────────────────
 *
 * SQC 1, which is what a CA firm is actually audited against, wants an
 * engagement quality control reviewer to be independent of the engagement team —
 * the opposite of a reporting line, where your reviewer is your own manager. So
 * a firm doing both an ordinary manager review and an EQCR sign-off needs two
 * rules inside one process, and a step on /admin/workflows names the one that
 * governs it.
 *
 * ── PUBLISHING, NOT SAVING ──────────────────────────────────────────────────
 *
 * The same two-step /catalogue and /admin/workflows use, and for a stronger
 * reason than either: a check PINS the rule that was in force when it opened, so
 * raising the bar this afternoon leaves this morning's open checks approvable by
 * the people already looking at them — and an audit asking "who was allowed to
 * approve this in March" gets March's answer. A draft is not in force and the
 * card says which is which.
 */

interface PolicyBody {
  readonly label: string;
  readonly rule: VerificationRule;
  readonly minGradeRank: number | null;
  readonly minGradeCode: string | null;
}

function readBody(body: Record<string, unknown> | undefined): PolicyBody | null {
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

export default function VerificationPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<ConfigEntry[]>([]);
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The form below REPLACES the button that opens it, so focus has to be
  // carried across the swap by hand. See `useSwapFocus`.
  const { panel: addPanel, trigger: addTrigger } = useSwapFocus(adding);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass. The ladder is not decoration here: a rank threshold is
    // chosen BY GRADE and stored as the rank, so a screen without the ladder
    // would be asking a partner to type a number.
    const [list, ladder] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "verification_policy" } } }),
      api.GET("/api/v1/tenancy/grades", {}),
    ]);
    if (list.response.status === 401 || ladder.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setPolicies(list.data.entries);
    // The ladder failing is not fatal — an admin can still read the rules that
    // exist. It only stops a NEW rank threshold being written, and the form says
    // so rather than offering an empty picker.
    if (!ladder.error) setGrades(ladder.data.grades);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function publish(key: string, version: number): Promise<void> {
    setBusy(`publish:${key}`);
    setError(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "verification_policy", key, version } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  if (!loaded) return <Loading />;

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Who checks the work"
        lede={<>A rule here says who is allowed to approve a finished step. Steps name the rule that
        applies to them on <strong>How the firm works</strong>, so a process can have an
        ordinary manager review and an independent partner sign-off with different rules.</>}
      />

      {/* NOT a setting, and the screen has to say so where somebody would look
          for the switch. */}
      {/* A raw `<div className="notice">` holding ONE SENTENCE with a
          `<strong>` and an `<em>` in it. `.notice` is `display: flex`, so each
          run of that sentence became a column — the bold clause, then the
          prose, then the word "else" alone, then "may check it" — four
          newspaper columns of one paragraph, measured 83px and 30px wide.
          `Notice` puts its children in `.notice-body`, where prose belongs. */}
      <Notice className="measure">
        <p>
          <strong>Nobody can ever approve their own work.</strong> That is not a setting on this
          page and there is no way to switch it off — the database refuses it, so an import, a
          script or an automated agent cannot get past it either. What you choose below is who
          <em> else</em> may check it.
        </p>
      </Notice>

      <ErrorNotice error={error} />

      {policies.length === 0 ? (
        <p className="muted" style={{ maxWidth: "64ch" }}>
          No rule written yet. Until one is, a step that names no rule is simply finished by
          whoever did it — nothing is held for checking, which is how the product behaved
          before this page existed.
        </p>
      ) : (
        policies.map((p) => (
          <PolicyCard
            key={p.entry.key}
            entry={p}
            grades={grades}
            busy={busy}
            onPublish={publish}
            onSaved={() => void load()}
            onError={setError}
          />
        ))
      )}

      {adding ? (
        <Card ref={addPanel} tabIndex={-1}>
          <CardTitle level={2}>A new rule</CardTitle>
          <PolicyForm
            policyKey={null}
            grades={grades}
            onDone={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => { setAdding(false); }}
            onError={setError}
          />
        </Card>
      ) : (
        /* A `cluster`, because `<Page>` is a flex COLUMN and a button laid
           straight into one is stretched by it. Measured at 1168px — the full
           width of the page — against the 81px "Change it" inside a card. */
        <div className="cluster">
          <Button ref={addTrigger} onClick={() => { setAdding(true); }}>
            Write a rule
          </Button>
        </div>
      )}
    </Page>
  );
}

function ruleLabel(rule: VerificationRule): string {
  return VERIFICATION_RULES.find((r) => r.value === rule)?.label ?? rule;
}

/** One rule, what it says now, and whether that is actually in force. */
function PolicyCard({
  entry,
  grades,
  busy,
  onPublish,
  onSaved,
  onError,
}: {
  entry: ConfigEntry;
  grades: StaffGrade[];
  busy: string | null;
  onPublish: (key: string, version: number) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Same swap as the page-level "Write a rule": the form takes the button's
  // place, so focus has to be handed over. See `useSwapFocus`.
  const { panel: editPanel, trigger: editTrigger } = useSwapFocus(editing);
  const inForce = readBody(entry.published?.body);
  const draft = entry.pendingDraft;

  return (
    <Card>
      <div className="row">
        <div>
          <CardTitle level={2}>
            {inForce?.label ?? readBody(draft?.body)?.label ?? entry.entry.key}
          </CardTitle>
          <p className="muted text-sm">
            <code>{entry.entry.key}</code> — this is what a step names to say it is checked
            under this rule.
          </p>
        </div>
      </div>

      {inForce === null ? (
        // A rule somebody wrote and never published is a real state, and hiding
        // it would leave a partner sure they had set something they had not.
        <p className="muted" style={{ marginTop: "var(--s-4)" }}>
          <strong>Not in force.</strong> A step naming this rule is checked by anybody except
          the person who did the work, because nothing is published for it yet.
        </p>
      ) : (
        <dl className="meta" data-layout="list" style={{ marginTop: "var(--s-4)" }}>
          <dt>Who may check</dt>
          <dd>{ruleLabel(inForce.rule)}</dd>
          {inForce.minGradeRank !== null && (
            <>
              <dt>From grade</dt>
              <dd>
                {grades.find((g) => g.code === inForce.minGradeCode)?.name ??
                  inForce.minGradeCode ??
                  `rank ${String(inForce.minGradeRank)}`}{" "}
                <span className="muted">and above</span>
              </dd>
            </>
          )}
        </dl>
      )}

      {draft && (
        <Notice className="mt-4">
          <p>
            <strong>A change is written and not yet in force.</strong> Checks opened from now on
            use it only once it is published; ones already open keep the rule they opened under.
          </p>
          <div className="cluster mt-2">
            <Button
              disabled={busy === `publish:${entry.entry.key}`}
              onClick={() => { onPublish(entry.entry.key, draft.version); }}
            >
              Put it in force
            </Button>
          </div>
        </Notice>
      )}

      {editing ? (
        <div ref={editPanel} tabIndex={-1}>
          <PolicyForm
            policyKey={entry.entry.key}
            initial={inForce ?? readBody(draft?.body)}
            grades={grades}
            onDone={() => {
              setEditing(false);
              onSaved();
            }}
            onCancel={() => { setEditing(false); }}
            onError={onError}
          />
        </div>
      ) : (
        <Button
          ref={editTrigger}
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => { setEditing(true); }}
        >
          Change it
        </Button>
      )}
    </Card>
  );
}

/**
 * Writing a rule.
 *
 * The grade picker appears only for the two rules that READ a grade. That is
 * not tidiness: the API refuses a `reporting_line` body carrying a threshold,
 * on the ground that a number nothing compares is a setting that looks live —
 * so offering the field would be offering a 400.
 */
function PolicyForm({
  policyKey,
  initial,
  grades,
  onDone,
  onCancel,
  onError,
}: {
  policyKey: string | null;
  initial?: PolicyBody | null;
  grades: StaffGrade[];
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [rule, setRule] = useState<VerificationRule>(initial?.rule ?? "rank_threshold");
  const [gradeCode, setGradeCode] = useState(initial?.minGradeCode ?? "");
  const [busy, setBusy] = useState(false);
  // Two sentences on this form describe a control and were wired to nothing.
  // A paragraph too wide for a `<Field>`'s column, or that describes a whole
  // group, has to be given an id and pointed at by hand — the `<Field hint>`
  // that does it automatically is only for the ones that fit.
  const editorId = useId();
  const reportingNoteId = `${editorId}-reporting`;
  const draftNoteId = `${editorId}-draft`;

  // Retired rungs are not offered. Somebody who holds one keeps it and still
  // meets a threshold written against it — that is the point of retiring rather
  // than deleting — but writing a NEW rule against a rung the firm has moved on
  // from is a stale choice nobody meant.
  const offered = grades.filter((g) => g.isActive);
  const needsGrade = rule !== "reporting_line";
  const chosen = offered.find((g) => g.code === gradeCode) ?? null;

  async function save(): Promise<void> {
    setBusy(true);
    const body: Record<string, unknown> = {
      label: label.trim(),
      rule,
      // The RANK, resolved here from the grade the firm picked, because a
      // published body is frozen and re-resolving a code later would answer an
      // old question with today's ladder. The code rides along for display.
      minGradeRank: needsGrade ? (chosen?.rank ?? null) : null,
      minGradeCode: needsGrade ? (chosen?.code ?? null) : null,
    };
    const result =
      policyKey === null
        ? await api.POST("/api/v1/config/{kind}", {
            params: { path: { kind: "verification_policy" } },
            body: { key: key.trim(), body },
          })
        : await api.POST("/api/v1/config/{kind}/{key}/versions", {
            params: { path: { kind: "verification_policy", key: policyKey } },
            body: { body },
          });
    setBusy(false);
    if (result.error) {
      // Verbatim. The validator's message names the field and the valid set,
      // and a local "invalid rule" would throw away the only sentence that says
      // how to fix it.
      onError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  const incomplete = label.trim() === "" || (policyKey === null && key.trim() === "") ||
    (needsGrade && chosen === null);

  return (
    /* NAMED, because both editors can be open at once — the rule being changed
       and a new one — and then "What to call it" and "Who may check it" each
       appear twice with nothing saying which rule they belong to. No legend, so
       nothing moves on screen; the card's heading already says it to anybody
       who can see it. */
    <fieldset
      className="fieldset"
      style={{ marginTop: "var(--s-4)" }}
      aria-label={policyKey === null ? "A new rule" : `The rule ${policyKey}`}
    >
      <FieldRow>
        {policyKey === null && (
          <Field
            label="Short name"
            hint="What a step names to say it is checked under this rule. It cannot be changed later — every step pointing at it would stop pointing anywhere."
          >
            <Input
              value={key}
              placeholder="manager_review"
              onChange={(e) => { setKey(e.target.value); }}
            />
          </Field>
        )}
        <Field label="What to call it">
          <Input
            value={label}
            placeholder="Manager review"
            onChange={(e) => { setLabel(e.target.value); }}
          />
        </Field>
      </FieldRow>

      <Fieldset legend="Who may check it">
        {VERIFICATION_RULES.map((r) => (
          /* The trade-off in the option itself, not in help text somebody has
             to go looking for — this is the choice that decides who may sign
             off a statutory filing. As `note` it is the option's DESCRIPTION
             and not part of its name. */
          <Radio
            key={r.value}
            label={<strong>{r.label}</strong>}
            note={r.detail}
            name={`rule-${policyKey ?? "new"}`}
            checked={rule === r.value}
            /* CONDITIONAL, because the paragraph is. It is only rendered once
               the reporting-line rule is chosen, and a `describedby` naming an
               element that is not on the page describes nothing. `Radio`
               APPENDS to its own `note`, so both are read. */
            {...(r.value === "reporting_line" && rule === "reporting_line"
              ? { "aria-describedby": reportingNoteId }
              : {})}
            onChange={() => { setRule(r.value); }}
          />
        ))}
      </Fieldset>

      {needsGrade && (
        <div style={{ marginTop: "var(--s-4)", maxWidth: 360 }}>
          {offered.length === 0 ? (
            <>
              <p className="label">From which grade up</p>
              <p className="muted">
                This firm has no active grades, so there is nothing to compare. Add rungs on{" "}
                <strong>Grades</strong> first, or choose the reporting-line rule.
              </p>
            </>
          ) : (
            /* `className="input"` on a `<select>`. The two share a base rule so
               it looked right, but `appearance: none` and the chevron are on
               `.select` alone — this drew the operating system's own dropdown. */
            <Field label="From which grade up">
              <Select
                value={gradeCode}
                onChange={(e) => { setGradeCode(e.target.value); }}
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

      {rule === "reporting_line" && (
        // Said before they choose it, not discovered when the queue turns out to
        // be unactionable. Every firm is in exactly this state the day the
        // feature ships, because nothing has filled the column in.
        <p id={reportingNoteId} className="muted" style={{ marginTop: "var(--s-4)", maxWidth: "60ch" }}>
          This rule reads <strong>who reports to whom</strong>, which is set on{" "}
          <strong>People</strong>. Anybody whose manager is not recorded there has nobody who
          may check their work, and the queue will say so.
        </p>
      )}

      {/* `.cluster` is `display: flex; gap: var(--s-2)` with wrapping, which is
          those two declarations and one it was missing. */}
      <div className="cluster mt-4">
        {/* THE SENTENCE UNDER THIS BUTTON IS ABOUT THIS BUTTON. It says what
            pressing it does — a draft, not a rule in force — and sitting loose
            underneath, it reached nobody who could not see it. It describes the
            save and not the cancel, so only the save points at it. */}
        <Button
          disabled={busy || incomplete}
          aria-describedby={draftNoteId}
          onClick={() => void save()}
        >
          {policyKey === null ? "Save as a draft" : "Save the change"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p id={draftNoteId} className="muted text-xs">
        Saved as a draft. It governs nothing until you put it in force, and checks already open
        keep the rule they were opened under.
      </p>
    </fieldset>
  );
}
