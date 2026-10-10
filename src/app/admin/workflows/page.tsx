"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, codeLabel } from "@/lib/api/client";
import type { ConfigEntry, StaffGrade } from "@/lib/api/client";
import { Button, Checkbox, Field, FieldRow, Fieldset, Input, Select, Textarea } from "@/components/ui";
import { Card, CardTitle, ErrorNotice, Notice, Page, PageHeader, Pill } from "@/components/tw";
import { shortNameFrom } from "@/lib/short-name";
import { CheckRuleForm } from "@/lib/ui/check-rule-form";
import { readStepRequestTemplateKey, useRequestTemplateNames } from "@/lib/request-template";
import type { RequestTemplateName } from "@/lib/request-template";

/**
 * Where a firm writes down how it does its work (T2.7).
 *
 * ── WHY THIS SCREEN IS THE POINT OF THE TASK ────────────────────────────────
 *
 * The orchestrator can walk a process and a work board can show it, and neither
 * is worth anything while the only way to WRITE a process is a curl command.
 * "How we do a GST filing" lives in a partner's head; this is where it stops
 * living there.
 *
 * ── DRAFT AND PUBLISH ARE SEPARATE, UNLIKE /admin/roles ─────────────────────
 *
 * Roles draft-and-publish in one press, because an admin editing a role has one
 * intent. A process is not that: publishing changes the path every job started
 * from now on will walk, and a partner may well write one over several sittings.
 * So this follows /catalogue — a draft sits visibly unpublished until somebody
 * decides, and the screen says plainly that nothing is running it yet.
 *
 * ── WHAT IT DOES NOT TRY TO BE ──────────────────────────────────────────────
 *
 * Not a diagram editor. The graph is expressed as "this step waits for these
 * steps", which is how a person describes a process out loud, and it is exactly
 * what the engine reads. A cycle is possible to type and the API refuses it by
 * NAMING the loop — a better error than any drag-and-drop would give, and the
 * screen shows it verbatim.
 *
 * ── WRITTEN IN A PERSON'S WORDS (audit 2026-10-03, CA#26 and CA#27) ─────────
 *
 * Every process and step asked for a "Short name, lower case, cannot change
 * later", steps ran side by side unless "Waits for" was ticked, and those boxes
 * were labelled with the short names ("collect", "recon-2b"). Now the short
 * name is made from the title and is under More for anybody who wants to set
 * it; a step ADDED here waits for the step before it (a process already written
 * keeps what it says); "Waits for" names the steps by their titles; and a step
 * that should be checked under a rule the firm has not written yet can have one
 * written in place, put in force and chosen, without leaving the editor.
 */

type Executor = "human" | "agent" | "agent_with_approval";
type Fact = "recurrence" | "jurisdiction";

interface StepDraft {
  key: string;
  label: string;
  executor: Executor;
  dependsOn: string[];
  conditionFact: Fact | "";
  conditionOp: Operator;
  /** One value for equals / is not; a comma-separated list for is one of /
   *  is none of. Split on the way out — see `toBody`. */
  conditionValue: string;
  /** The rule that says WHO checks this step once it is done (T2.9), or "" for
   *  a step nobody checks — which is every step of every process written before
   *  this field existed, and the right default. */
  verificationPolicyKey: string;
  /** The request template the client is asked for each period at this step
   *  (F1.2), or "" for nothing, which is null on the wire and what every step
   *  written before the field existed means. */
  requestTemplateKey: string;
  /** The grade band that may do this step, as grade CODES; "" is an open end.
   *  Both "" means anybody, which is null on the wire. */
  performerMin: string;
  performerMax: string;
  /** The step's SUB-STEPS (T6.15) as the box holds them, one per line. Turned
   *  into `{ key, label }` only on the way out; see `toLines`. */
  checklistText: string;
  /** The sub-steps the version being edited already had, so a line whose
   *  words did not change keeps its key. Empty on a step being written. */
  checklistBefore: readonly ChecklistLine[];
  /** The step's REVIEW POINTS, likewise: the checker's list, not the doer's. */
  reviewText: string;
  reviewBefore: readonly ChecklistLine[];
  /** The short name still follows the title (CA#26): true for a step written
   *  in this editor until somebody types their own; false for a step that came
   *  from a saved version, whose name jobs already record. */
  autoKey: boolean;
}

/**
 * One line of a step's sub-steps or review points, as the API stores it.
 *
 * The KEY is what a tick is stored against, so it must outlive the editor. A
 * job pins the version it started on and reads its lines from that version,
 * which is why a key never has to be stable across versions for the ticks to
 * stay right; it is kept stable anyway wherever the words did not change,
 * because "s3 is the payroll line" is what somebody comparing two versions of
 * the process, or reading the audit trail, relies on.
 */
interface ChecklistLine {
  readonly key: string;
  readonly label: string;
}

/**
 * The box's text as lines: trimmed, blanks dropped, and a leading bullet taken
 * off.
 *
 * The bullet is not a nicety. The firm's first process arrived as a document
 * with "• bank statements" under every step, and pasting it is the obvious way
 * to write one. Left on, every label would start with a dot nobody typed on
 * purpose. Only a bullet followed by a space goes, so "-5% variance" is safe.
 */
function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[•·*-]\s+/, "").trim())
    .filter((line) => line !== "");
}

/**
 * The box's lines as `{ key, label }`, keeping keys wherever it can.
 *
 * MATCHED BY THE WORDS. A line whose label is unchanged keeps its key even if
 * it moved, which is what a reorder is; a line whose words changed is a new
 * line with a new key, because a key that silently changed meaning under a
 * rewording would say two different things in two versions. Two identical
 * lines each claim their own old key, in order.
 *
 * A new line takes the next `s1, s2, …` (or `r1, r2, …`) that is not taken,
 * counting the keys the version being edited had as taken even when their line
 * was deleted. A key that meant "payroll" in v3 is never recycled as "fixed
 * assets" in v4.
 */
function toLines(text: string, before: readonly ChecklistLine[], prefix: "s" | "r"): ChecklistLine[] {
  const labels = splitLines(text);
  const unclaimed = [...before];
  const kept = labels.map((label) => {
    const at = unclaimed.findIndex((b) => b.label === label);
    return at === -1 ? null : (unclaimed.splice(at, 1)[0] ?? null);
  });
  const taken = new Set([...before.map((b) => b.key), ...kept.flatMap((k) => (k === null ? [] : [k.key]))]);
  let n = 0;
  return labels.map((label, i) => {
    const old = kept[i];
    if (old !== null && old !== undefined) return { key: old.key, label };
    do {
      n += 1;
    } while (taken.has(`${prefix}${String(n)}`));
    const key = `${prefix}${String(n)}`;
    taken.add(key);
    return { key, label };
  });
}

/** A stored list read back. ABSENT IS EMPTY: every process published before
 *  T6.15 has neither list, and those versions are frozen. */
function readLines(raw: unknown): ChecklistLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l: unknown) => {
    if (typeof l !== "object" || l === null) return [];
    const line = l as Record<string, unknown>;
    return typeof line["key"] === "string" && typeof line["label"] === "string"
      ? [{ key: line["key"], label: line["label"].trim() }]
      : [];
  });
}

/** A box tall enough for what is in it, within reason. */
function rowsFor(text: string): number {
  return Math.min(12, Math.max(3, text.split("\n").length + 1));
}

/** The firm's ladder, fetched once for every step editor on the page. */
let gradesPromise: Promise<{ code: string; name: string; rank: number; isActive: boolean }[]> | null = null;
function useGrades() {
  const [grades, setGrades] = useState<{ code: string; name: string; rank: number; isActive: boolean }[]>([]);
  useEffect(() => {
    gradesPromise ??= api
      .GET("/api/v1/tenancy/grades", {})
      .then((r) => (r.data?.grades ?? []).map((g) => ({ code: g.code, name: g.name, rank: g.rank, isActive: g.isActive })));
    let live = true;
    void gradesPromise.then((g) => {
      if (live) setGrades(g);
    });
    return () => {
      live = false;
    };
  }, []);
  return grades;
}

/** "Who does it", as a band of the ladder — "Analyst to Senior Associate",
 *  "Manager or above". Null means anybody, which is every process written
 *  before this existed. */
function BandFields({ step, onChange }: { step: StepDraft; onChange: (patch: Partial<StepDraft>) => void }) {
  const grades = useGrades();
  const active = grades.filter((g) => g.isActive).sort((a, b) => a.rank - b.rank);
  return (
    <>
      <Field label="From grade" optional>
        <Select
          value={step.performerMin}
          onChange={(e) => {
            onChange({ performerMin: e.target.value });
          }}
        >
          <option value="">Anybody</option>
          {active.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To grade" optional>
        <Select
          value={step.performerMax}
          onChange={(e) => {
            onChange({ performerMax: e.target.value });
          }}
        >
          <option value="">Anybody</option>
          {active.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

const EXECUTORS: { value: Executor; label: string; hint: string }[] = [
  {
    value: "human",
    label: "A person",
    hint: "Somebody does it and ticks it off.",
  },
  {
    value: "agent",
    label: "Automatically",
    hint: "If nothing automated exists yet, a person does it.",
  },
  {
    value: "agent_with_approval",
    label: "Automatically, then a person approves",
    hint: "The system does it and a person accepts it.",
  },
];

/** A published rule about who may check a step, as this screen offers it. */
interface CheckRule {
  readonly key: string;
  readonly label: string;
}

/**
 * How a condition compares its fact.
 *
 * **All four compare a STRING**, because both facts the engine can resolve are
 * strings. There is deliberately no "is at least" here: the firm's own
 * compliance list makes a threshold its commonest rule (*"turnover > ₹1 Cr"*),
 * but nothing stores a turnover yet — so the option would sit in this picker,
 * compare a string, and do nothing. It arrives with the data.
 */
type Operator = "equals" | "not_equals" | "in" | "not_in";

const OPERATORS: { value: Operator; label: string; list: boolean; hint: string }[] = [
  { value: "equals", label: "is", list: false, hint: "" },
  {
    value: "not_equals",
    label: "is not",
    list: false,
    hint: "Everything except this one value.",
  },
  {
    value: "in",
    label: "is one of",
    list: true,
    hint: "Separate the values with commas.",
  },
  { value: "not_in", label: "is none of", list: true, hint: "Separate the values with commas." },
];

function takesList(op: Operator): boolean {
  return OPERATORS.find((o) => o.value === op)?.list ?? false;
}

const FACTS: { value: Fact; label: string; example: string }[] = [
  { value: "recurrence", label: "How often the service recurs", example: "monthly, annually" },
  { value: "jurisdiction", label: "Where the entity is registered", example: "IN, AE, US" },
];

/**
 * A condition as the API wants it, or null.
 *
 * Null unless both halves are given: half a condition is not a condition, and
 * sending one would be refused. A list operator splits on commas and drops the
 * blanks, so a trailing comma is not an empty value the API then rejects.
 */
function toCondition(s: StepDraft): Record<string, unknown> | null {
  if (s.conditionFact === "") return null;
  if (takesList(s.conditionOp)) {
    const values = s.conditionValue
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
    return values.length === 0
      ? null
      : { fact: s.conditionFact, op: s.conditionOp, value: values };
  }
  const value = s.conditionValue.trim();
  return value === "" ? null : { fact: s.conditionFact, op: s.conditionOp, value };
}

/** A step as the API wants it. */
function toBody(
  label: string,
  steps: readonly StepDraft[],
  grades: readonly { code: string; rank: number }[],
): Record<string, unknown> {
  return {
    label: label.trim(),
    steps: steps.map((s) => ({
      key: s.key.trim(),
      label: s.label.trim(),
      executor: s.executor,
      dependsOn: s.dependsOn,
      condition: toCondition(s),
      // "" means nobody checks it, and that is null on the wire — not an empty
      // string, which the API would refuse as not being a config key.
      verificationPolicyKey: s.verificationPolicyKey === "" ? null : s.verificationPolicyKey,
      // "" is "Nothing", null on the wire, for the same reason.
      requestTemplateKey: s.requestTemplateKey === "" ? null : s.requestTemplateKey,
      performer: toPerformer(s, grades),
      // ALWAYS arrays, never left out, so a version written here says "none"
      // in so many words. Review points on a step that names no check are
      // SENT as typed: the API refuses them with a sentence naming the step,
      // and the editor already says so beside the box. Dropping them here
      // would lose a list somebody wrote without telling them.
      checklist: toLines(s.checklistText, s.checklistBefore, "s"),
      reviewPoints: toLines(s.reviewText, s.reviewBefore, "r"),
    })),
  };
}

/** Rank AND code, the shape the API stores — the rank is compared, the code is read. */
function toPerformer(
  s: StepDraft,
  grades: readonly { code: string; rank: number }[],
): Record<string, unknown> | null {
  if (s.performerMin === "" && s.performerMax === "") return null;
  const rankOf = (code: string): number | null => grades.find((g) => g.code === code)?.rank ?? null;
  return {
    minGradeRank: s.performerMin === "" ? null : rankOf(s.performerMin),
    minGradeCode: s.performerMin === "" ? null : s.performerMin,
    maxGradeRank: s.performerMax === "" ? null : rankOf(s.performerMax),
    maxGradeCode: s.performerMax === "" ? null : s.performerMax,
  };
}

/** A stored body back into the editor's shape, so "draft a new version" starts
 *  from what is actually in force rather than from an empty form. */
function fromBody(body: Record<string, unknown>): { label: string; steps: StepDraft[] } {
  const raw = Array.isArray(body["steps"]) ? (body["steps"] as Record<string, unknown>[]) : [];
  return {
    label: typeof body["label"] === "string" ? body["label"] : "",
    steps: raw.map((s) => {
      const condition = s["condition"] as Record<string, unknown> | null | undefined;
      return {
        key: typeof s["key"] === "string" ? s["key"] : "",
        label: typeof s["label"] === "string" ? s["label"] : "",
        executor: (typeof s["executor"] === "string" ? s["executor"] : "human") as Executor,
        dependsOn: Array.isArray(s["dependsOn"]) ? (s["dependsOn"] as string[]) : [],
        conditionFact: (condition?.["fact"] ?? "") as Fact | "",
        // BOTH SHAPES. A version published before operators existed carries
        // `equals` and no `op`, and it is frozen — it will never be rewritten,
        // so this reader keeps understanding it forever.
        conditionOp: (typeof condition?.["op"] === "string"
          ? condition["op"]
          : "equals") as Operator,
        conditionValue: Array.isArray(condition?.["value"])
          ? (condition["value"] as string[]).join(", ")
          : typeof condition?.["value"] === "string"
            ? condition["value"]
            : typeof condition?.["equals"] === "string"
              ? condition["equals"]
              : "",
        verificationPolicyKey:
          typeof s["verificationPolicyKey"] === "string" ? s["verificationPolicyKey"] : "",
        // Absent on every version written before F1.2, and those are frozen.
        requestTemplateKey: readStepRequestTemplateKey(s) ?? "",
        performerMin: readCode(s["performer"], "minGradeCode"),
        performerMax: readCode(s["performer"], "maxGradeCode"),
        checklistText: readLines(s["checklist"]).map((l) => l.label).join("\n"),
        checklistBefore: readLines(s["checklist"]),
        reviewText: readLines(s["reviewPoints"]).map((l) => l.label).join("\n"),
        reviewBefore: readLines(s["reviewPoints"]),
        // A saved step's name is a handle jobs already record: never re-made.
        autoKey: false,
      };
    }),
  };
}

function readCode(performer: unknown, key: "minGradeCode" | "maxGradeCode"): string {
  if (performer === null || typeof performer !== "object") return "";
  const v = (performer as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ConfigEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [writing, setWriting] = useState(false);
  // The firm's request templates, by name, read once for every card and editor
  // on the page: the summary names a step's template by its label, and a step
  // may be pointed only at a PUBLISHED one (F1.2).
  const requestTemplates = useRequestTemplateNames() ?? [];

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/config/{kind}", {
      params: { path: { kind: "workflow_template" } },
    });
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setTemplates(result.data.entries);
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
      params: { path: { kind: "workflow_template", key, version } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <Page>
      {/* The sidebar's own word for it (Wave 4). No lede: a process is the
          steps a job walks, in order, written once per service, and every step
          can be done by a person, so it works with nothing automated. */}
      <PageHeader
        title="Processes"
        actions={
          <Button
            variant={writing ? "secondary" : "primary"}
            aria-expanded={writing}
            {...(writing ? { "aria-label": "Cancel the new process" } : {})}
            onClick={() => {
              setWriting((w) => !w);
            }}
          >
            {writing ? "Cancel" : "Write a new process"}
          </Button>
        }
      />
      <ErrorNotice error={error} />

      {writing && (
        <NewTemplate
          requestTemplates={requestTemplates}
          onClose={() => {
            setWriting(false);
          }}
          onSaved={() => void load()}
          onError={setError}
        />
      )}

      {templates.length === 0 ? (
        <p className="max-w-[64ch] text-sm text-muted">
          No process yet. Until there is one, signed work waits on the work board.
        </p>
      ) : (
        templates.map((t) => (
          <TemplateCard
            key={t.entry.key}
            entry={t}
            busy={busy}
            requestTemplates={requestTemplates}
            onPublish={publish}
            onSaved={() => void load()}
            onError={setError}
          />
        ))
      )}

    </Page>
  );
}

// ── One process ──────────────────────────────────────────────────────────────

function TemplateCard({
  entry,
  busy,
  requestTemplates,
  onPublish,
  onSaved,
  onError,
}: {
  entry: ConfigEntry;
  busy: string | null;
  requestTemplates: readonly RequestTemplateName[];
  onPublish: (key: string, version: number) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inForce = entry.published;
  const draft = entry.pendingDraft;
  const shown = fromBody((draft ?? inForce)?.body ?? {});

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4">
        <CardTitle level={2}>{shown.label || entry.entry.key}</CardTitle>
        {/* A state is a pill (Wave 4). The handle (`w4d-close`) was printed
            beside the name; it is a system key, and the catalogue picks a
            process by its name. */}
        <span className="flex items-center gap-2">
          {draft !== null && <Pill tone="warn">Unpublished changes</Pill>}
          {inForce === null ? (
            <Pill tone="neutral">Draft</Pill>
          ) : (
            <Pill tone="ok">In force, v{String(inForce.version)}</Pill>
          )}
        </span>
      </div>

      {/* A draft is shown rather than hidden, and the sentence says what it
          means. A process somebody wrote and never published is a real state,
          and a job will not touch it — which is worth saying out loud, because
          it looks finished on this screen otherwise. */}
      {draft !== null && (
        <p className="text-sm text-ink-2">
          Draft v{draft.version} is saved. No job follows it until you put it in force.
        </p>
      )}

      <StepList steps={shown.steps} requestTemplates={requestTemplates} />

      <div className="mt-4 flex flex-wrap gap-2">
        {draft !== null && (
          <Button
            disabled={busy === `publish:${entry.entry.key}`}
            onClick={() => {
              onPublish(entry.entry.key, draft.version);
            }}
          >
            Put v{draft.version} in force
          </Button>
        )}
        {/* One per process, so four read "Change it". By the handle, which
            is what every job that ever ran resolves through. */}
        <Button
          variant="secondary"
          size="sm"
          aria-label={`${
            editing ? "Stop editing" : draft === null ? "Change" : "Edit the draft of"
          } ${entry.entry.key}`}
          aria-expanded={editing}
          onClick={() => {
            setEditing((e) => !e);
          }}
        >
          {editing ? "Cancel" : draft === null ? "Change it" : "Edit the draft"}
        </Button>
      </div>

      {editing && (
        <StepEditor
          templateKey={entry.entry.key}
          initialLabel={shown.label}
          initialSteps={shown.steps}
          requestTemplates={requestTemplates}
          note="Saved as a new version. Work under way keeps the version it started on."
          onDone={() => {
            setEditing(false);
            onSaved();
          }}
          onError={onError}
        />
      )}
    </Card>
  );
}

/** The process as a person reads it: each step, who does it, and what it waits
 *  for. Read-only — editing is a deliberate act behind a button. */
/** The band in the ladder's own words — "Analyst to Senior Associate",
 *  "Manager or above" — or null when the step is anybody's. Names, not codes:
 *  this is the sentence a partner reads to answer "who does this step". */
function bandWords(min: string, max: string, grades: readonly { code: string; name: string }[]): string | null {
  if (min === "" && max === "") return null;
  const name = (code: string): string => grades.find((g) => g.code === code)?.name ?? code;
  if (min !== "" && max !== "") return min === max ? name(min) : `${name(min)} to ${name(max)}`;
  if (min !== "") return `${name(min)} or above`;
  return `${name(max)} or below`;
}

function StepList({
  steps,
  requestTemplates,
}: {
  steps: readonly StepDraft[];
  requestTemplates: readonly RequestTemplateName[];
}) {
  const grades = useGrades();
  // "after collect" named the step by its HANDLE; the reader knows it by the
  // words above it (Wave 4).
  const nameOf = (key: string): string => steps.find((s) => s.key === key)?.label || key;
  if (steps.length === 0) return <p className="text-sm text-muted">No steps.</p>;
  return (
    /* NUMBERED. `[data-tw] ol` sets `list-style: none`, so the 1.2rem of left
       padding this list carried was a gutter reserved for a marker that never
       drew. A process is its ORDER — that is the sentence at the top of the
       screen — so the marker is put back rather than the gutter taken away. */
    <ol className="mb-0 ml-5 mt-2 list-decimal">
      {steps.map((s) => (
        <li key={s.key} className="mb-1.5">
          <strong>{s.label || s.key}</strong>{" "}
          <span className="text-sm text-ink-2">
            · {EXECUTORS.find((e) => e.value === s.executor)?.label ?? s.executor}
            {/* WHO, in the summary (0301). The band was stored and read back
                and the published list still said "A person" on every step —
                the one fact a process is now written to carry, visible only
                behind "Change it". */}
            {bandWords(s.performerMin, s.performerMax, grades) !== null && (
              <> · for {bandWords(s.performerMin, s.performerMax, grades)}</>
            )}
            {s.dependsOn.length > 0 && <> · after {s.dependsOn.map(nameOf).join(", ")}</>}
            {s.conditionFact !== "" && (
              <>
                {" "}
                · only when {s.conditionFact}{" "}
                {OPERATORS.find((o) => o.value === s.conditionOp)?.label ?? s.conditionOp}{" "}
                {s.conditionValue}
              </>
            )}
            {/* Said in the summary, not only in the editor. "Is this step
                reviewed" is the question somebody reads a process to answer,
                and a fact visible only behind an edit button is one nobody
                checks. */}
            {s.verificationPolicyKey !== "" && (
              <>
                {" "}
                · then checked ({codeLabel(s.verificationPolicyKey)})
              </>
            )}
            {/* What the client is asked for at this step (F1.2), by the
                template's own name; its short name until the names arrive. */}
            {s.requestTemplateKey !== "" && (
              <>
                {" "}
                · asks the client for{" "}
                {requestTemplates.find((t) => t.key === s.requestTemplateKey)?.label ??
                  s.requestTemplateKey}
              </>
            )}
          </span>
          <StepLines step={s} />
        </li>
      ))}
    </ol>
  );
}

/**
 * A step's two lists in the read-only summary (T6.15), folded.
 *
 * FOLDED, because the firm's own process runs to eight lines under most of its
 * ten steps, and eighty lines open at once turn "what are our steps" into a
 * scroll. The fold's own line says how many of each, so "does step 8 have
 * review points" is answered without opening anything. Nothing at all for a
 * step with neither, which is every step written before this existed.
 */
function StepLines({ step }: { step: StepDraft }) {
  const subSteps = splitLines(step.checklistText);
  const reviewPoints = splitLines(step.reviewText);
  if (subSteps.length === 0 && reviewPoints.length === 0) return null;
  const counts = [
    subSteps.length === 0 ? null : `${String(subSteps.length)} sub-step${subSteps.length === 1 ? "" : "s"}`,
    reviewPoints.length === 0
      ? null
      : `${String(reviewPoints.length)} review point${reviewPoints.length === 1 ? "" : "s"}`,
  ].filter((c) => c !== null);
  return (
    <details className="disclosure mt-1">
      <summary>{counts.join(" and ")}</summary>
      <div className="text-sm">
        {subSteps.length > 0 && (
          <>
            <p className="text-ink-2">Sub-steps, ticked by whoever does it:</p>
            <ul className="mb-2 ml-5 mt-1 list-disc">
              {subSteps.map((line, i) => (
                <li key={`s-${String(i)}`}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {reviewPoints.length > 0 && (
          <>
            <p className="text-ink-2">Review points, ticked by whoever checks it:</p>
            <ul className="ml-5 mt-1 list-disc">
              {reviewPoints.map((line, i) => (
                <li key={`r-${String(i)}`}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

// ── Writing one ──────────────────────────────────────────────────────────────

function NewTemplate({
  requestTemplates,
  onClose,
  onSaved,
  onError,
}: {
  requestTemplates: readonly RequestTemplateName[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  return (
    <Card>
      <CardTitle level={2}>A new process</CardTitle>
      <StepEditor
        templateKey={null}
        initialLabel=""
        initialSteps={[
          {
            key: "collect-what-we-need-from-the-client",
            label: "Collect what we need from the client",
            executor: "human",
            dependsOn: [],
            conditionFact: "",
            conditionOp: "equals",
            conditionValue: "",
            verificationPolicyKey: "",
            requestTemplateKey: "",
            performerMin: "",
            performerMax: "",
            checklistText: "",
            checklistBefore: [],
            reviewText: "",
            reviewBefore: [],
            autoKey: true,
          },
        ]}
        requestTemplates={requestTemplates}
        note="Saved as a draft. Nothing follows it until you put it in force."
        onDone={() => {
          onClose();
          onSaved();
        }}
        onError={onError}
      />
      <div className="cluster">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/**
 * The editor.
 *
 * `templateKey` null means this is a NEW process and needs a handle; otherwise
 * it is a new version of an existing one and the handle cannot move — every job
 * that ever ran resolves through it.
 */
function StepEditor({
  templateKey,
  initialLabel,
  initialSteps,
  requestTemplates,
  note,
  onDone,
  onError,
}: {
  templateKey: string | null;
  initialLabel: string;
  initialSteps: readonly StepDraft[];
  requestTemplates: readonly RequestTemplateName[];
  note: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState(templateKey ?? "");
  // The process's short name follows its name until somebody types their own
  // (CA#26). Only for a new process: a saved one's never moves.
  const [keyTouched, setKeyTouched] = useState(false);
  const [label, setLabel] = useState(initialLabel);
  const [steps, setSteps] = useState<StepDraft[]>([...initialSteps]);
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState<CheckRule[]>([]);
  /** Every rule's short name, drafts included, so a rule written here does not
   *  clash with one that exists. */
  const [policyKeys, setPolicyKeys] = useState<string[]>([]);
  const processKey = templateKey ?? (keyTouched ? key.trim() : shortNameFrom(label, "entry", "process"));

  // Fetched HERE rather than on the page, because only an open editor needs it
  // and only PUBLISHED rules may be offered: a draft governs nothing, and
  // pointing a step at one would name a rule no check will ever apply.
  const loadPolicies = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/config/{kind}", {
      params: { path: { kind: "verification_policy" } },
    });
    if (result.error) return;
    setPolicyKeys(result.data.entries.map((e) => e.entry.key));
    setPolicies(
      result.data.entries.flatMap((e) => {
        const body = e.published?.body;
        if (!body) return [];
        const label = typeof body["label"] === "string" ? body["label"] : e.entry.key;
        return [{ key: e.entry.key, label }];
      }),
    );
  }, []);
  useEffect(() => {
    void (async () => {
      await loadPolicies();
    })();
  }, [loadPolicies]);

  /**
   * One step changed. Two things follow from a new short name (CA#26): a step
   * whose name still follows its title gets a new one as the title is typed,
   * and every step that waits for it is pointed at the new one, so a renamed
   * step never leaves a "Waits for" naming a step that is not there.
   */
  function patch(index: number, change: Partial<StepDraft>): void {
    setSteps((current) => {
      const before = current[index];
      if (before === undefined) return current;
      let next: StepDraft = { ...before, ...change };
      if (change.key !== undefined) next = { ...next, autoKey: false };
      else if (change.label !== undefined && before.autoKey) {
        const taken = current.filter((_, i) => i !== index).map((s) => s.key);
        next = { ...next, key: shortNameFrom(change.label, "step", `step-${String(index + 1)}`, taken) };
      }
      const renamed = next.key !== before.key && before.key !== "";
      return current.map((s, i) => {
        if (i === index) return next;
        return renamed && s.dependsOn.includes(before.key)
          ? { ...s, dependsOn: s.dependsOn.map((d) => (d === before.key ? next.key : d)) }
          : s;
      });
    });
  }

  function addStep(): void {
    setSteps((current) => [
      ...current,
      {
        key: shortNameFrom("", "step", `step-${String(current.length + 1)}`, current.map((s) => s.key)),
        label: "",
        executor: "human",
        // IN ORDER BY DEFAULT (CA#26): a CA writes steps in the order they are
        // done, and a new step ran alongside the others unless a box was
        // ticked. It waits for the step before it; untick to run it alongside.
        dependsOn: [current.at(-1)?.key ?? ""].filter((k) => k !== ""),
        conditionFact: "",
        conditionOp: "equals",
        conditionValue: "",
        verificationPolicyKey: "",
        requestTemplateKey: "",
        performerMin: "",
        performerMax: "",
        checklistText: "",
        checklistBefore: [],
        reviewText: "",
        reviewBefore: [],
        autoKey: true,
      },
    ]);
  }

  function removeStep(index: number): void {
    setSteps((current) => {
      const gone = current[index];
      return current
        .filter((_, i) => i !== index)
        // A step that waited on the removed one must stop waiting, or the API
        // refuses the whole process for naming a step that does not exist —
        // which is correct, and a confusing way to learn you deleted something.
        .map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== gone?.key) }));
    });
  }

  async function save(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    onError("");
    const body = toBody(label, steps, await (gradesPromise ?? Promise.resolve([])));
    const result =
      templateKey === null
        ? await api.POST("/api/v1/config/{kind}", {
            params: { path: { kind: "workflow_template" } },
            body: { key: processKey, body },
          })
        : await api.POST("/api/v1/config/{kind}/{key}/versions", {
            params: { path: { kind: "workflow_template", key: templateKey } },
            body: { body },
          });
    setBusy(false);
    if (result.error) {
      // Verbatim. The validator's messages are the whole explanation — it names
      // the cycle, or the step a dependency points at that does not exist — and
      // a local "invalid process" would throw away the only sentence that says
      // how to fix it.
      onError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  /* The process every step below belongs to, for the groups' names.
     `templateKey` is the process's PERMANENT handle; the label in the box
     beside it is not — naming a group after a value editable inside it renames
     the group on every keystroke. A process being written has no handle yet
     (that is the field), so it gets a literal. */
  const scope = templateKey ?? "a new process";

  return (
    <div className="mt-4">
      {/* Named for the same reason every step below is: three editors can be
          open at once and each of them asks for a "Name". `aria-label` with no
          <legend>, so nothing changes on screen. */}
      <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={scope}>
        <FieldRow>
          <Field label="Name">
            <Input
              value={label}
              placeholder="e.g. GST monthly filing"
              onChange={(e) => {
                setLabel(e.target.value);
              }}
            />
          </Field>
        </FieldRow>
        {/* MADE FROM THE NAME (CA#26), and here for anybody who wants to set
            it: services name a process by it, so it cannot change later. */}
        {templateKey === null && (
          <details className="mt-2">
            <summary className="text-sm">More</summary>
            <Field label="Short name" hint="Made from the name. Services refer to it, so it cannot change later.">
              <Input
                value={processKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
              />
            </Field>
          </details>
        )}
      </fieldset>

      {steps.map((step, index) => (
        <StepFields
          key={index}
          index={index}
          scope={scope}
          step={step}
          others={steps.flatMap((s, i) =>
            i === index || s.key === "" ? [] : [{ key: s.key, title: s.label.trim() === "" ? `Step ${String(i + 1)}` : s.label.trim() }],
          )}
          onChange={(change) => {
            patch(index, change);
          }}
          policies={policies}
          policyKeys={policyKeys}
          requestTemplates={requestTemplates}
          onRuleWritten={(ruleKey) => {
            void loadPolicies().then(() => {
              patch(index, { verificationPolicyKey: ruleKey });
            });
          }}
          onRemove={() => {
            removeStep(index);
          }}
        />
      ))}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addStep}>
          Add a step
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          Save as a draft
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  );
}

function StepFields({
  index,
  scope,
  step,
  others,
  policies,
  policyKeys,
  requestTemplates,
  onRuleWritten,
  onChange,
  onRemove,
}: {
  index: number;
  /** The process this step belongs to, by its permanent handle. */
  scope: string;
  step: StepDraft;
  /** The other steps it may wait for: the short name the API reads, and the
   *  title a person reads (CA#26). */
  others: readonly { readonly key: string; readonly title: string }[];
  policies: readonly CheckRule[];
  /** Every rule's short name, so a rule written here does not clash. */
  policyKeys: readonly string[];
  /** The firm's request templates; only the published ones are offered. */
  requestTemplates: readonly RequestTemplateName[];
  /** A rule was written and put in force from this step (CA#27). */
  onRuleWritten: (ruleKey: string) => void;
  onChange: (change: Partial<StepDraft>) => void;
  onRemove: () => void;
}) {
  const [writingRule, setWritingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  /*
   * `useId`, not `step-0`.
   *
   * TWO editors can be open at once — any of the four process cards, and "Write
   * a new process" — and every one of them numbered its steps from zero. Both
   * open, the page carried ten duplicate ids and five labels pointing into the
   * OTHER card: clicking "Handle" under "A new process" was proved to put the
   * cursor in GST monthly filing's box, and a screen reader announced it by the
   * wrong process's label. An id is DOCUMENT-wide; a step index is not.
   *
   * `<Field>` generates its own with `useId` when it is given no `id`, so the
   * three fields that had one hardcoded simply stopped passing it. This prefix
   * is still needed for the two hints that describe a GROUP rather than one
   * control, which `Field` cannot wire.
   */
  const id = useId();
  /* Named by the PROCESS as well as the position. "Step 1" is not a name while
     a second form on the same page also has a Step 1. */
  const groupName = `${scope} · step ${String(index + 1)}`;
  return (
    /*
     * A <fieldset> so the step's fields are a GROUP, named.
     *
     * Measured with the forms open, this screen had 35 controls answering to
     * EIGHT distinct names — "Handle" seven times, "Step" six, "Who does it"
     * six, and every step's dependency checkboxes repeating the same four
     * handles. Each of those names is correct and none of them says which step
     * is about to change. The visible layout carries that (the steps are
     * separate cards, in order); nothing in the accessibility tree did.
     *
     * `aria-label` rather than a <legend> ON PURPOSE: a legend would put a
     * visible "Step 1" caption on every card, which is a design change nobody
     * asked for. The label names the group for a screen reader and changes
     * nothing on screen.
     *
     * Drawn in utilities rather than `.card`, which is what it wore before. The
     * card it wants is a SUNK one, and `.card` is unlayered while every utility
     * is in `@layer utilities` — so `bg-surface-sunk` beside it would silently
     * do nothing and the background had to be an inline style to land at all.
     * Written out, it needs no inline style and no note about cascade order.
     *
     * `min-w-0` is load-bearing and not decoration: a <fieldset>'s UA
     * `min-width: min-content` blows out the grid rows inside it without it.
     */
    <fieldset
      className="mb-2 min-w-0 rounded-md border border-line bg-surface-sunk p-6"
      aria-label={groupName}
    >
      <FieldRow>
        <Field id={`${id}-label`} label="Step">
          <Input
            value={step.label}
            placeholder="e.g. Reconcile against the books"
            onChange={(e) => {
              onChange({ label: e.target.value });
            }}
          />
        </Field>
        <Field id={`${id}-executor`} label="Who does it">
          <Select
            value={step.executor}
            onChange={(e) => {
              onChange({ executor: e.target.value as StepDraft["executor"] });
            }}
          >
            {EXECUTORS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <BandFields step={step} onChange={onChange} />
      </FieldRow>
      {/* UNDER THE ROW, not in a column of it (the FieldRow rule). */}
      <p className="field-hint">{EXECUTORS.find((x) => x.value === step.executor)?.hint}</p>
      {/* THE SHORT NAME, made from the title (CA#26). Under More: jobs record
          a step by it, so once work has run it cannot change. */}
      <details className="mt-2">
        <summary className="text-sm">More</summary>
        <Field id={`${id}-key`} label="Short name" hint="Made from the step's title. Cannot change once work has run.">
          <Input
            value={step.key}
            onChange={(e) => {
              onChange({ key: e.target.value });
            }}
          />
        </Field>
      </details>

      {others.length > 0 && (
        <div className="mt-2">
          {/* A <fieldset>/<legend>, not a <span className="label">. "Waits for"
              is the QUESTION these boxes answer, and a span answers it only for
              somebody who can see it sitting above them — a screen reader
              announcing "reconcile, checkbox, not checked" on its own gives an
              answer to nothing. A legend is read with each box. */}
          <Fieldset legend="Waits for">
            <div className="flex flex-wrap gap-2">
              {others.map((other) => (
                <Checkbox
                  key={other.key}
                  label={other.title}
                  checked={step.dependsOn.includes(other.key)}
                  aria-describedby={`${id}-waits-hint`}
                  onChange={(e) => {
                    onChange({
                      dependsOn: e.target.checked
                        ? [...step.dependsOn, other.key]
                        : step.dependsOn.filter((d) => d !== other.key),
                    });
                  }}
                />
              ))}
            </div>
            {/* Wired by hand: this describes the GROUP, and `Field` — which
                would do the wiring for us — is for one control. */}
            <p className="field-hint" id={`${id}-waits-hint`}>
              A new step waits for the one before it. Nothing ticked: it starts as soon as the work does.
            </p>
          </Fieldset>
        </div>
      )}

      <FieldRow>
        <Field id={`${id}-fact`} label="Only do this step when…">
          <Select
            value={step.conditionFact}
            /* The sentence explaining what a blank field means sits BELOW the
               row on purpose (see the comment under it), so it cannot be this
               field's `hint`. Pointed at by hand instead — and only while
               there IS a condition, because an aria-describedby naming an
               element that is not rendered describes nothing. */
            aria-describedby={step.conditionFact === "" ? undefined : `${id}-cond-hint`}
            onChange={(e) => {
              onChange({ conditionFact: e.target.value as StepDraft["conditionFact"] });
            }}
          >
            <option value="">Always</option>
            {FACTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        {step.conditionFact !== "" && (
          <>
            {/* Reads as one sentence with the two selects around it — "…it"
                + "is one of" + "…these". The labels are minimal because the
                OPTIONS carry the words; they are still real labels rather
                than a bare "…", because a screen reader gets nothing from an
                ellipsis. All three parts of the sentence point at the one
                explanation below the row. */}
            <Field id={`${id}-op`} label="…it">
              <Select
                value={step.conditionOp}
                aria-describedby={`${id}-cond-hint`}
                onChange={(e) => {
                  onChange({ conditionOp: e.target.value as Operator });
                }}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`${id}-value`} label={takesList(step.conditionOp) ? "…these" : "…this"}>
              <Input
                value={step.conditionValue}
                aria-describedby={`${id}-cond-hint`}
                placeholder={`e.g. ${
                  takesList(step.conditionOp)
                    ? (FACTS.find((f) => f.value === step.conditionFact)?.example ?? "")
                    : (FACTS.find((f) => f.value === step.conditionFact)?.example.split(",")[0] ??
                      "")
                }`}
                onChange={(e) => {
                  onChange({ conditionValue: e.target.value });
                }}
              />
            </Field>
          </>
        )}
      </FieldRow>
      {/* BELOW the row, not inside one of its columns. Inside, this paragraph
          made its own column six lines tall, and `.field-row`'s end-alignment
          alignment then pushed the two selects to the bottom of it — the three
          parts of one sentence stopped being on one line. Found by looking at
          the page, not by the types. */}
      {step.conditionFact !== "" && (
        <p className="field-hint" id={`${id}-cond-hint`} style={{ maxWidth: "62ch" }}>
          {OPERATORS.find((o) => o.value === step.conditionOp)?.hint}{" "}
          If the service does not state it, the step is kept.
        </p>
      )}

      {/* THE DOER'S LIST (T6.15). A text box, one line per sub-step, rather
          than a row of inputs with an Add button: the firm's process arrives as
          a document with bullets under every step, and pasting eight lines at
          once is how it actually gets written. Keys are kept by `toLines` on
          the way out, so nobody ever sees or types one. */}
      <div className="mt-2 max-w-[64ch]">
        <Field
          id={`${id}-substeps`}
          label="Sub-steps"
          optional
          hint="One per line. Ticked by the doer before it is marked done."
        >
          <Textarea
            rows={rowsFor(step.checklistText)}
            value={step.checklistText}
            placeholder={"e.g. Bank statements\nSales data\nPurchase data"}
            onChange={(e) => {
              onChange({ checklistText: e.target.value });
            }}
          />
        </Field>
        {/* Said BEFORE the save, not left to the API's refusal: a machine
            acting alone never ticks anything, so the step would finish with its
            list open. The API refuses it regardless; this is so the sentence is
            met while the fix is one select away. */}
        {step.executor === "agent" && splitLines(step.checklistText).length > 0 && (
          <div className="mt-2">
            <Notice tone="warn">
              A machine cannot tick sub-steps. Choose a person under Who does it, or remove
              them.
            </Notice>
          </div>
        )}
      </div>

      {/* WHAT THE CLIENT IS ASKED FOR at this step, each period (F1.2). Only
          PUBLISHED templates are offered, for the reason only published check
          rules are: a draft asks nobody anything. A template the step already
          names but the firm has not published (or has withdrawn) stays
          selectable, marked, so opening the editor never drops it silently. */}
      <div className="mt-2 max-w-[360px]">
        <Field
          id={`${id}-ask`}
          label="Ask the client for"
          hint={
            requestTemplates.some((t) => t.inForce) ? (
              "Asked each period, on the template's days."
            ) : (
              <>
                No template is published yet.{" "}
                <Link href="/admin/request-templates">Write one</Link>
              </>
            )
          }
        >
          <Select
            value={step.requestTemplateKey}
            onChange={(e) => {
              onChange({ requestTemplateKey: e.target.value });
            }}
          >
            <option value="">Nothing</option>
            {requestTemplates
              .filter((t) => t.inForce)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            {step.requestTemplateKey !== "" &&
              !requestTemplates.some((t) => t.inForce && t.key === step.requestTemplateKey) && (
                <option value={step.requestTemplateKey}>
                  {`${
                    requestTemplates.find((t) => t.key === step.requestTemplateKey)?.label ??
                    step.requestTemplateKey
                  } (not in force)`}
                </option>
              )}
          </Select>
        </Field>
      </div>

      <div className="mt-2 max-w-[360px]">
        <Field
          id={`${id}-check`}
          label="When it is done, who checks it?"
          hint={
            policies.length === 0
              ? "No rule is in force yet. Write one below."
              : "The doer can never check their own work."
          }
        >
          <Select
            value={step.verificationPolicyKey}
            onChange={(e) => { onChange({ verificationPolicyKey: e.target.value }); }}
          >
          {/* Nobody is the default and the honest one: it is what every process
              written before this field existed meant, and those processes must
              not start holding work for review because a new field appeared. */}
          <option value="">Nobody</option>
          {/* PUBLISHED rules only. A draft is not in force, and pointing a step
              at one would name a rule that governs nothing. */}
          {policies.map((pk) => (
            <option key={pk.key} value={pk.key}>
              {pk.label}
            </option>
          ))}
          {/* A rule the step already names but the firm has since withdrawn
              stays selectable, marked — blanking it silently is how a review
              disappears from a process nobody meant to change. */}
          {step.verificationPolicyKey !== "" &&
            !policies.some((pk) => pk.key === step.verificationPolicyKey) && (
              <option value={step.verificationPolicyKey}>
                {step.verificationPolicyKey} (not in force)
              </option>
            )}
          </Select>
        </Field>
        {/* WRITTEN WHERE IT IS NEEDED (CA#27). A step could only name a rule
            written beforehand on Who checks work, so a partner here met "No
            rule is in force yet" and had to leave, losing the process. The
            same form opens in place, puts the rule in force and chooses it. */}
        {!writingRule && (
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            aria-label={`Write a new rule for who checks: ${groupName}`}
            onClick={() => {
              setWritingRule(true);
            }}
          >
            {policies.length === 0 ? "Write a rule" : "Write a new rule"}
          </Button>
        )}
      </div>
      {writingRule && (
        <div className="mt-2 max-w-[64ch] rounded-md border border-line bg-surface p-4">
          {ruleError !== null && ruleError !== "" && <Notice tone="danger">{ruleError}</Notice>}
          <InlineRuleForm
            takenKeys={policyKeys}
            onDone={(ruleKey) => {
              setWritingRule(false);
              setRuleError(null);
              onRuleWritten(ruleKey);
            }}
            onCancel={() => {
              setWritingRule(false);
              setRuleError(null);
            }}
            onError={setRuleError}
          />
        </div>
      )}

      {/* THE CHECKER'S LIST (T6.15), offered only once somebody checks the
          step: review points are ticked by the checker, and a step nobody
          checks has nobody to tick them. Kept on screen, though, when the
          checker is set back to nobody while points are written. Hiding the
          box would leave a list the API then refuses sitting where nobody can
          see it, and dropping it quietly would lose what somebody wrote. So the
          step says so and offers the two honest ways out. */}
      {(step.verificationPolicyKey !== "" || step.reviewText.trim() !== "") && (
        <div className="mt-2 max-w-[64ch]">
          <Field
            id={`${id}-review`}
            label="Review points"
            optional
            hint="One per line. Ticked by the checker before approving."
          >
            <Textarea
              rows={rowsFor(step.reviewText)}
              value={step.reviewText}
              placeholder={"e.g. P&L movements\nBalance sheet movements\nUnusual variances"}
              onChange={(e) => {
                onChange({ reviewText: e.target.value });
              }}
            />
          </Field>
          {step.verificationPolicyKey === "" && (
            <div className="mt-2">
              <Notice
                tone="warn"
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Move the review points to the sub-steps: ${groupName}`}
                      onClick={() => {
                        onChange({
                          checklistText: [step.checklistText.trimEnd(), step.reviewText.trim()]
                            .filter((t) => t !== "")
                            .join("\n"),
                          reviewText: "",
                        });
                        // This notice and its buttons go with the points, so
                        // focus is put where the lines went rather than left
                        // to fall to the top of the page.
                        document.getElementById(`${id}-substeps`)?.focus();
                      }}
                    >
                      Move them to the sub-steps
                    </Button>
                    <Button
                      variant="destructive-quiet"
                      size="sm"
                      aria-label={`Remove the review points: ${groupName}`}
                      onClick={() => {
                        onChange({ reviewText: "" });
                        document.getElementById(`${id}-check`)?.focus();
                      }}
                    >
                      Remove them
                    </Button>
                  </>
                }
              >
                Nobody checks this step, so these points cannot be saved. Choose a checker, move
                them, or remove them.
              </Notice>
            </div>
          )}
        </div>
      )}

      {/* Named separately: a group's name is announced when you enter the
          group, and it is not prepended to a BUTTON the way a field's label
          is. Six identical "Remove this step" is the one duplicate on this
          screen that destroys work. */}
      <div className="cluster">
        <Button
          variant="destructive-quiet"
          size="sm"
          aria-label={`Remove ${groupName}`}
          onClick={onRemove}
        >
          Remove this step
        </Button>
      </div>
    </fieldset>
  );
}

/** The rule form, with the firm's ladder it needs, for a step (CA#27). */
function InlineRuleForm({
  takenKeys,
  onDone,
  onCancel,
  onError,
}: {
  takenKeys: readonly string[];
  onDone: (ruleKey: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [grades, setGrades] = useState<StaffGrade[] | null>(null);
  useEffect(() => {
    let live = true;
    void api.GET("/api/v1/tenancy/grades", {}).then((r) => {
      if (live) setGrades(r.data?.grades ?? []);
    });
    return () => {
      live = false;
    };
  }, []);
  if (grades === null) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <CheckRuleForm
      policyKey={null}
      grades={grades}
      takenKeys={takenKeys}
      putInForce
      onDone={(ruleKey) => {
        onDone(ruleKey);
      }}
      onCancel={onCancel}
      onError={onError}
    />
  );
}
