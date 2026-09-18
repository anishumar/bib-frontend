"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import { Button, Checkbox, Field, FieldRow, Fieldset, Input, Select } from "@/components/ui";
import { Card, CardTitle, ErrorNotice, Notice, Page, PageHeader } from "@/components/tw";

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
  /** The grade band that may do this step, as grade CODES; "" is an open end.
   *  Both "" means anybody, which is null on the wire. */
  performerMin: string;
  performerMax: string;
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
      <Field label="From grade" optional hint="Lowest grade that does this step. Blank: no floor.">
        <Select
          value={step.performerMin}
          onChange={(e) => {
            onChange({ performerMin: e.target.value });
          }}
        >
          <option value="">anybody</option>
          {active.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To grade" optional hint="Highest grade that does this step. Blank: no ceiling.">
        <Select
          value={step.performerMax}
          onChange={(e) => {
            onChange({ performerMax: e.target.value });
          }}
        >
          <option value="">anybody</option>
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
    hint: "Somebody does it and ticks it off. The ordinary answer.",
  },
  {
    value: "agent",
    label: "Automatically",
    hint: "If no agent is built for it yet, it waits for a person instead — the process still runs.",
  },
  {
    value: "agent_with_approval",
    label: "Automatically, then a person approves",
    hint: "The machine produces the work and somebody decides whether it stands.",
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
    hint: "Everything except this one — a step that applies to everybody but one case.",
  },
  {
    value: "in",
    label: "is one of",
    list: true,
    hint: "Comma-separated. One step instead of one process per value.",
  },
  { value: "not_in", label: "is none of", list: true, hint: "Comma-separated." },
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
      performer: toPerformer(s, grades),
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
        performerMin: readCode(s["performer"], "minGradeCode"),
        performerMax: readCode(s["performer"], "maxGradeCode"),
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
      <PageHeader
        eyebrow="How work runs"
        title="How the firm works"
        lede="A process is the steps a piece of work goes through, in the order they have to happen.
        Write it once and every job for that service follows it — and every step can be a
        person&apos;s, so this works today with nothing automated at all."
      />
      <ErrorNotice error={error} />

      {templates.length === 0 ? (
        <p className="max-w-[64ch] text-sm text-muted">
          No process written yet. Until one is, a signed engagement creates work that WAITS —
          visibly, on the work board — rather than running a process nobody wrote.
        </p>
      ) : (
        templates.map((t) => (
          <TemplateCard
            key={t.entry.key}
            entry={t}
            busy={busy}
            onPublish={publish}
            onSaved={() => void load()}
            onError={setError}
          />
        ))
      )}

      <NewTemplate onSaved={() => void load()} onError={setError} />

      <p className="max-w-[64ch] text-sm text-muted">
        A published process is <strong>frozen</strong>, and that is what makes it trustworthy: a
        job records which version it started on and keeps walking that one. Editing a process
        never changes work already under way — it changes what happens next time.
      </p>
    </Page>
  );
}

// ── One process ──────────────────────────────────────────────────────────────

function TemplateCard({
  entry,
  busy,
  onPublish,
  onSaved,
  onError,
}: {
  entry: ConfigEntry;
  busy: string | null;
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
        <CardTitle level={2}>
          {shown.label || entry.entry.key}{" "}
          <span className="mono muted text-xs">
            {entry.entry.key}
          </span>
        </CardTitle>
        <span className="text-sm text-muted">
          {inForce === null ? "not in use yet" : `v${String(inForce.version)} in force`}
        </span>
      </div>

      {/* A draft is shown rather than hidden, and the sentence says what it
          means. A process somebody wrote and never published is a real state,
          and a job will not touch it — which is worth saying out loud, because
          it looks finished on this screen otherwise. */}
      {draft !== null && (
        <p className="text-sm text-muted">
          Draft v{draft.version} is written but <strong>not in force</strong>. No job is
          following it.
        </p>
      )}

      <StepList steps={shown.steps} />

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
          note="A change is a NEW version. What is in force keeps running until you put the new one in force."
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

function StepList({ steps }: { steps: readonly StepDraft[] }) {
  const grades = useGrades();
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
          <span className="text-sm text-muted">
            · {EXECUTORS.find((e) => e.value === s.executor)?.label ?? s.executor}
            {/* WHO, in the summary (0301). The band was stored and read back
                and the published list still said "A person" on every step —
                the one fact a process is now written to carry, visible only
                behind "Change it". */}
            {bandWords(s.performerMin, s.performerMax, grades) !== null && (
              <> · for {bandWords(s.performerMin, s.performerMax, grades)}</>
            )}
            {s.dependsOn.length > 0 && <> · after {s.dependsOn.join(", ")}</>}
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
                · then checked ({s.verificationPolicyKey})
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ── Writing one ──────────────────────────────────────────────────────────────

function NewTemplate({
  onSaved,
  onError,
}: {
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="cluster">
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Write a new process
        </Button>
      </div>
    );
  }
  return (
    <Card>
      <CardTitle level={2}>A new process</CardTitle>
      <StepEditor
        templateKey={null}
        initialLabel=""
        initialSteps={[
          {
            key: "collect",
            label: "Collect what we need from the client",
            executor: "human",
            dependsOn: [],
            conditionFact: "",
            conditionOp: "equals",
            conditionValue: "",
            verificationPolicyKey: "",
            performerMin: "",
            performerMax: "",          },
        ]}
        note="Saved as a draft. Nothing follows it until you put it in force."
        onDone={() => {
          setOpen(false);
          onSaved();
        }}
        onError={onError}
      />
      <div className="cluster">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpen(false);
          }}
        >
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
  note,
  onDone,
  onError,
}: {
  templateKey: string | null;
  initialLabel: string;
  initialSteps: readonly StepDraft[];
  note: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState(templateKey ?? "");
  const [label, setLabel] = useState(initialLabel);
  const [steps, setSteps] = useState<StepDraft[]>([...initialSteps]);
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState<CheckRule[]>([]);

  // Fetched HERE rather than on the page, because only an open editor needs it
  // and only PUBLISHED rules may be offered: a draft governs nothing, and
  // pointing a step at one would name a rule no check will ever apply.
  useEffect(() => {
    void (async () => {
      const result = await api.GET("/api/v1/config/{kind}", {
        params: { path: { kind: "verification_policy" } },
      });
      if (result.error) return;
      setPolicies(
        result.data.entries.flatMap((e) => {
          const body = e.published?.body;
          if (!body) return [];
          const label = typeof body["label"] === "string" ? body["label"] : e.entry.key;
          return [{ key: e.entry.key, label }];
        }),
      );
    })();
  }, []);

  function patch(index: number, change: Partial<StepDraft>): void {
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...change } : s)));
  }

  function addStep(): void {
    setSteps((current) => [
      ...current,
      {
        key: "",
        label: "",
        executor: "human",
        dependsOn: [],
        conditionFact: "",
        conditionOp: "equals",
        conditionValue: "",
        verificationPolicyKey: "",
        performerMin: "",
        performerMax: "",      },
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
            body: { key: key.trim(), body },
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
          {templateKey === null && (
            <Field
              label="Handle"
              hint="Lower case, permanent. A service points at this, and every job that ever ran resolves through it."
            >
              <Input
                value={key}
                placeholder="gst-monthly"
                onChange={(e) => {
                  setKey(e.target.value);
                }}
              />
            </Field>
          )}
          <Field label="Name" hint="What a partner picks this process by.">
            <Input
              value={label}
              placeholder="GST monthly filing"
              onChange={(e) => {
                setLabel(e.target.value);
              }}
            />
          </Field>
        </FieldRow>
      </fieldset>

      {steps.map((step, index) => (
        <StepFields
          key={index}
          index={index}
          scope={scope}
          step={step}
          others={steps.filter((_, i) => i !== index).map((s) => s.key).filter((k) => k !== "")}
          onChange={(change) => {
            patch(index, change);
          }}
          policies={policies}
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
  onChange,
  onRemove,
}: {
  index: number;
  /** The process this step belongs to, by its permanent handle. */
  scope: string;
  step: StepDraft;
  others: readonly string[];
  policies: readonly CheckRule[];
  onChange: (change: Partial<StepDraft>) => void;
  onRemove: () => void;
}) {
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
            placeholder="Reconcile against the books"
            onChange={(e) => {
              onChange({ label: e.target.value });
            }}
          />
        </Field>
        <Field
          id={`${id}-key`}
          label="Handle"
          hint="Lower case. Never changes once work has run."
        >
          <Input
            value={step.key}
            placeholder="reconcile"
            onChange={(e) => {
              onChange({ key: e.target.value });
            }}
          />
        </Field>
        <Field
          id={`${id}-executor`}
          label="Who does it"
          hint={EXECUTORS.find((x) => x.value === step.executor)?.hint}
        >
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
                  key={other}
                  label={other}
                  checked={step.dependsOn.includes(other)}
                  aria-describedby={`${id}-waits-hint`}
                  onChange={(e) => {
                    onChange({
                      dependsOn: e.target.checked
                        ? [...step.dependsOn, other]
                        : step.dependsOn.filter((d) => d !== other),
                    });
                  }}
                />
              ))}
            </div>
            {/* Wired by hand: this describes the GROUP, and `Field` — which
                would do the wiring for us — is for one control. */}
            <p className="field-hint" id={`${id}-waits-hint`}>
              Nothing ticked means it starts as soon as the work does. Two steps waiting for the
              same thing both start together.
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
            <option value="">always do it</option>
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
                placeholder={
                  takesList(step.conditionOp)
                    ? (FACTS.find((f) => f.value === step.conditionFact)?.example ?? "")
                    : (FACTS.find((f) => f.value === step.conditionFact)?.example.split(",")[0] ??
                      "")
                }
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
          If the service does not state this at all, the step is KEPT — under every one of these,
          including the negative ones. A blank field must not quietly remove a step from a
          process.
        </p>
      )}

      <div className="mt-2 max-w-[360px]">
        <Field
          id={`${id}-check`}
          label="When it is done, who checks it?"
          hint={
            policies.length === 0
              ? "No rule has been put in force yet. Write one on Who checks work — until then a step is finished by whoever does it."
              : "Whoever does the work can never be the one who checks it. That is not a setting anywhere — the database refuses it."
          }
        >
          <Select
            value={step.verificationPolicyKey}
            onChange={(e) => { onChange({ verificationPolicyKey: e.target.value }); }}
          >
          {/* Nobody is the default and the honest one: it is what every process
              written before this field existed meant, and those processes must
              not start holding work for review because a new field appeared. */}
          <option value="">nobody — it is finished when it is done</option>
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
      </div>

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
