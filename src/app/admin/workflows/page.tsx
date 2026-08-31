"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";

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
function toBody(label: string, steps: readonly StepDraft[]): Record<string, unknown> {
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
    })),
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
      };
    }),
  };
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

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="How the firm works"
        lede="A process is the steps a piece of work goes through, in the order they have to happen.
        Write it once and every job for that service follows it — and every step can be a
        person&apos;s, so this works today with nothing automated at all."
      />
      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {templates.length === 0 ? (
        <p className="muted" style={{ maxWidth: "64ch" }}>
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

      <p className="muted text-sm" style={{ maxWidth: "64ch" }}>
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
    <article className="card" style={{ marginBottom: "var(--s-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="card-title">
          {shown.label || entry.entry.key}{" "}
          <span className="mono muted text-xs">
            {entry.entry.key}
          </span>
        </h2>
        <span className="muted text-sm">
          {inForce === null ? "not in use yet" : `v${String(inForce.version)} in force`}
        </span>
      </div>

      {/* A draft is shown rather than hidden, and the sentence says what it
          means. A process somebody wrote and never published is a real state,
          and a job will not touch it — which is worth saying out loud, because
          it looks finished on this screen otherwise. */}
      {draft !== null && (
        <p className="muted text-sm">
          Draft v{draft.version} is written but <strong>not in force</strong>. No job is
          following it.
        </p>
      )}

      <StepList steps={shown.steps} />

      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-4)" }}>
        {draft !== null && (
          <button
            className="btn"
            disabled={busy === `publish:${entry.entry.key}`}
            onClick={() => {
              onPublish(entry.entry.key, draft.version);
            }}
          >
            Put v{draft.version} in force
          </button>
        )}
        <button
          className="btn" data-variant="secondary" data-size="sm"
          onClick={() => {
            setEditing((e) => !e);
          }}
        >
          {editing ? "Cancel" : draft === null ? "Change it" : "Edit the draft"}
        </button>
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
    </article>
  );
}

/** The process as a person reads it: each step, who does it, and what it waits
 *  for. Read-only — editing is a deliberate act behind a button. */
function StepList({ steps }: { steps: readonly StepDraft[] }) {
  if (steps.length === 0) return <p className="muted">No steps.</p>;
  return (
    <ol style={{ margin: "var(--s-2) 0 0", paddingLeft: "1.2rem" }}>
      {steps.map((s) => (
        <li key={s.key} style={{ marginBottom: 6 }}>
          <strong>{s.label || s.key}</strong>{" "}
          <span className="muted text-sm">
            · {EXECUTORS.find((e) => e.value === s.executor)?.label ?? s.executor}
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
      <button
        className="btn"
        onClick={() => {
          setOpen(true);
        }}
      >
        Write a new process
      </button>
    );
  }
  return (
    <div className="card">
      <h2 className="card-title">A new process</h2>
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
          },
        ]}
        note="Saved as a draft. Nothing follows it until you put it in force."
        onDone={() => {
          setOpen(false);
          onSaved();
        }}
        onError={onError}
      />
      <button
        className="btn" data-variant="secondary" data-size="sm"
        onClick={() => {
          setOpen(false);
        }}
      >
        Cancel
      </button>
    </div>
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
    const body = toBody(label, steps);
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

  return (
    <div style={{ marginTop: "var(--s-4)" }}>
      <div className="field-row">
        {templateKey === null && (
          <div style={{ flex: "1 1 200px" }}>
            <label className="label" htmlFor="wf-key">
              Handle
            </label>
            <input
              className="input"
              id="wf-key"
              value={key}
              placeholder="gst-monthly"
              onChange={(e) => {
                setKey(e.target.value);
              }}
            />
            <p className="field-hint">
              Lower case, permanent. A service points at this, and every job that ever ran
              resolves through it.
            </p>
          </div>
        )}
        <div style={{ flex: "2 1 260px" }}>
          <label className="label" htmlFor="wf-label">
            Name
          </label>
          <input
            className="input"
            id="wf-label"
            value={label}
            placeholder="GST monthly filing"
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
          <p className="field-hint">What a partner picks this process by.</p>
        </div>
      </div>

      {steps.map((step, index) => (
        <StepFields
          key={index}
          index={index}
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

      <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-4)" }}>
        <button className="btn" data-variant="secondary" data-size="sm" onClick={addStep}>
          Add a step
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          Save as a draft
        </button>
      </div>
      <p className="muted text-sm">
        {note}
      </p>
    </div>
  );
}

function StepFields({
  index,
  step,
  others,
  policies,
  onChange,
  onRemove,
}: {
  index: number;
  step: StepDraft;
  others: readonly string[];
  policies: readonly CheckRule[];
  onChange: (change: Partial<StepDraft>) => void;
  onRemove: () => void;
}) {
  const id = `step-${String(index)}`;
  return (
    <div
      className="card"
      style={{ marginBottom: "var(--s-2)", background: "var(--surface-sunk)" }}
    >
      <div className="field-row">
        <div style={{ flex: "3 1 240px" }}>
          <label className="label" htmlFor={`${id}-label`}>
            Step
          </label>
          <input
            className="input"
            id={`${id}-label`}
            value={step.label}
            placeholder="Reconcile against the books"
            onChange={(e) => {
              onChange({ label: e.target.value });
            }}
          />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label className="label" htmlFor={`${id}-key`}>
            Handle
          </label>
          <input
            className="input"
            id={`${id}-key`}
            value={step.key}
            placeholder="reconcile"
            onChange={(e) => {
              onChange({ key: e.target.value });
            }}
          />
          <p className="field-hint">Lower case. Never changes once work has run.</p>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="label" htmlFor={`${id}-executor`}>
            Who does it
          </label>
          <select
            className="select"
            id={`${id}-executor`}
            value={step.executor}
            style={{ width: "100%" }}
            onChange={(e) => {
              onChange({ executor: e.target.value as StepDraft["executor"] });
            }}
          >
            {EXECUTORS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {EXECUTORS.find((x) => x.value === step.executor)?.hint}
          </p>
        </div>
      </div>

      {others.length > 0 && (
        <div style={{ marginTop: "var(--s-2)" }}>
          <span className="label">Waits for</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
            {others.map((other) => (
              <label className="text-sm" key={other}>
                <input
                  type="checkbox"
                  checked={step.dependsOn.includes(other)}
                  onChange={(e) => {
                    onChange({
                      dependsOn: e.target.checked
                        ? [...step.dependsOn, other]
                        : step.dependsOn.filter((d) => d !== other),
                    });
                  }}
                />{" "}
                {other}
              </label>
            ))}
          </div>
          <p className="field-hint">
            Nothing ticked means it starts as soon as the work does. Two steps waiting for the
            same thing both start together.
          </p>
        </div>
      )}

      <div className="field-row">
        <div style={{ flex: "2 1 240px" }}>
          <label className="label" htmlFor={`${id}-fact`}>
            Only do this step when…
          </label>
          <select
            className="select"
            id={`${id}-fact`}
            value={step.conditionFact}
            style={{ width: "100%" }}
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
          </select>
        </div>
        {step.conditionFact !== "" && (
          <>
            <div style={{ flex: "0 1 140px" }}>
              {/* Reads as one sentence with the two selects around it — "…it"
                  + "is one of" + "…these". The labels are minimal because the
                  OPTIONS carry the words; they are still real labels rather
                  than a bare "…", because a screen reader gets nothing from an
                  ellipsis. */}
              <label className="label" htmlFor={`${id}-op`}>
                …it
              </label>
              <select
                className="select"
                id={`${id}-op`}
                value={step.conditionOp}
                style={{ width: "100%" }}
                onChange={(e) => {
                  onChange({ conditionOp: e.target.value as Operator });
                }}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label className="label" htmlFor={`${id}-value`}>
                {takesList(step.conditionOp) ? "…these" : "…this"}
              </label>
              <input
                className="input"
                id={`${id}-value`}
                value={step.conditionValue}
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
            </div>
          </>
        )}
      </div>
      {/* BELOW the row, not inside one of its columns. Inside, this paragraph
          made its own column six lines tall, and `.field-row`'s end-alignment
          alignment then pushed the two selects to the bottom of it — the three
          parts of one sentence stopped being on one line. Found by looking at
          the page, not by the types. */}
      {step.conditionFact !== "" && (
        <p className="field-hint" style={{ maxWidth: "62ch" }}>
          {OPERATORS.find((o) => o.value === step.conditionOp)?.hint}{" "}
          If the service does not state this at all, the step is KEPT — under every one of these,
          including the negative ones. A blank field must not quietly remove a step from a
          process.
        </p>
      )}

      <div style={{ marginTop: "var(--s-2)", maxWidth: 360 }}>
        <label className="label" htmlFor={`${id}-check`}>
          When it is done, who checks it?
        </label>
        <select
          className="select"
          id={`${id}-check`}
          value={step.verificationPolicyKey}
          style={{ width: "100%" }}
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
        </select>
        <p className="field-hint">
          {policies.length === 0
            ? "No rule has been put in force yet. Write one on Who checks work — until then a step is finished by whoever does it."
            : "Whoever does the work can never be the one who checks it. That is not a setting anywhere — the database refuses it."}
        </p>
      </div>

      <button className="btn" data-variant="destructive-quiet" data-size="sm" onClick={onRemove}>
        Remove this step
      </button>
    </div>
  );
}
