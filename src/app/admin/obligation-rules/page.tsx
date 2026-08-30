"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, ObligationRule, RuleCoverage } from "@/lib/api/client";
import {
  bodyOf,
  draftOf,
  Exceptions,
  MONTHS,
  ordinal,
  RuleEditor,
  type RuleDraft,
} from "./rule-editor";

/**
 * What the law asks of the firm's clients, and when (T3.2, completed by T6.4).
 *
 * ── THIS SCREEN IS THE WHOLE REASON THESE ARE ROWS ──────────────────────────
 *
 * Every date in the shipped India pack came from a PREVIOUS VENDOR'S document
 * and from the firm's own applicability sheet — not from a partner ticking it
 * against the statute. So everything ships `unconfirmed`, and confirming one is
 * an UPDATE somebody makes here rather than a migration they ask an engineer
 * for. The same goes for the lead time: T–X is the firm's own working practice,
 * it appears nowhere in the sheet, and every rule therefore ships at zero
 * because a guessed lead time is a commitment the firm never made.
 *
 * ── "NEEDS A FORMULA" IS NOT A FAILURE, AND MUST NOT LOOK LIKE ONE ──────────
 *
 * Forty-seven of the fifty-seven shipped rules cannot produce a date, and that
 * is the honest state of the firm's own specification rather than a bug. The
 * sheet says "within a statutory period after the AGM", "State-specific",
 * "within 7 working days" — each of which is a real obligation whose timing
 * depends on a fact this system does not hold.
 *
 * They are rows, with the reason on them, because the alternative the demo took
 * was to convert what it could and hand the rest back BY NAME in a log. A log
 * is not an answer. "We read your sheet, here is the one fact we still need for
 * AOC-4" is a far better question to put to a partner than "what is your
 * compliance calendar".
 *
 * ── AND UNTIL T6.4 THE FIRM COULD NOT ANSWER IT ─────────────────────────────
 *
 * The screen offered the lead time, the confirmation tick and the retire
 * switch, and nothing else — while the API had taken a full formula, a new
 * rule and exceptions since T3.2 with no caller anywhere. So the forty-seven
 * were never going to start generating however well the firm knew the answer,
 * and "config a partner can edit without a deploy" was true of three fields out
 * of twelve. The editor is `rule-editor.tsx`; what stays absent from it, and
 * why, is written there.
 *
 * ── THE COUNT IS A BUTTON, AND THAT IS THE WHOLE ONBOARDING DESIGN ──────────
 *
 * The alternative considered was a separate "answer these 47" checklist. It was
 * refused: a checklist measures COMPLETION, and completing this one is not the
 * goal — most firms will never answer rules their clients do not owe, so a
 * permanent 12/47 would read as a product nagging about work nobody should do.
 * What matters is the OUTCOME, and that already has a home: `/calendar`'s
 * coverage panel names the live engagements producing nothing and links here
 * with the exact blocked rules in `?rules=`. So the count filters, the deep
 * link focuses, and there is no third surface to keep true.
 */
export default function ObligationRulesPage() {
  // `useSearchParams` suspends during prerender; the boundary is the framework's
  // requirement, not a loading state anybody will see.
  return (
    <Suspense fallback={<main><h1>Compliance rules</h1></main>}>
      <Rules />
    </Suspense>
  );
}

/** What a write did to the calendar that already exists. Never inferred from a
 *  200: an edit that moved fourteen filings and one that moved none look
 *  identical otherwise, and only one of them is worth telling somebody about. */
interface Effect {
  restated: number;
  locked: number;
  spawned: number;
}

function Rules() {
  const router = useRouter();
  const params = useSearchParams();
  const [rules, setRules] = useState<ObligationRule[]>([]);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState<RuleCoverage | "">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));
  const [creating, setCreating] = useState(false);

  /** Rule ids the caller arrived focused on — `/calendar`'s coverage panel
   *  linking to the exact rules blocking one engagement. */
  const focused = useMemo(() => {
    const raw = params.get("rules");
    return raw === null ? [] : raw.split(",").filter((s) => s.length > 0);
  }, [params]);

  const load = useCallback(async (): Promise<void> => {
    const [res, me, catalogue] = await Promise.all([
      api.GET("/api/v1/obligation-rules", {}),
      api.GET("/api/v1/auth/me", {}),
      // `tenant:admin`, like the form it feeds. A reader without it gets no
      // list and no form, which is the same answer — `?? []` is the whole
      // handling, deliberately.
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
    ]);
    if (res.response.status === 401) {
      router.push("/login");
      return;
    }
    if (res.error) {
      setError(apiError(res.error).message);
      setLoaded(true);
      return;
    }
    setRules(res.data.rules);
    setPermissions(me.data?.permissions ?? []);
    setServices(catalogue.data?.entries ?? []);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const mayWrite = permissions.includes("tenant:admin");

  /** Every write reports what it did, and the wording says which half is which
   *  — a partner who reads "14 moved" and not "3 were left" has been told a
   *  partial change was a whole one. */
  function report(effect: Effect | undefined, prefix: string): void {
    if (!effect) {
      setNotice(prefix);
      return;
    }
    const parts: string[] = [];
    if (effect.spawned > 0) {
      parts.push(
        `${String(effect.spawned)} filing${effect.spawned === 1 ? "" : "s"} added to the calendar`,
      );
    }
    if (effect.restated > 0) {
      parts.push(`${String(effect.restated)} already there moved to the new date`);
    }
    if (effect.locked > 0) {
      parts.push(
        `${String(effect.locked)} left as ${effect.locked === 1 ? "it is" : "they are"} — ` +
          `somebody has already started ${effect.locked === 1 ? "it" : "them"}`,
      );
    }
    setNotice(parts.length === 0 ? `${prefix} Nothing on the calendar moved.` : `${prefix} ${parts.join("; ")}.`);
  }

  async function patch(ruleId: string, body: Record<string, unknown>, said: string): Promise<void> {
    setBusy(true);
    const res = await api.PATCH("/api/v1/obligation-rules/{ruleId}", {
      params: { path: { ruleId } },
      body: body as never,
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    report(res.data.effect, said);
    await load();
  }

  async function create(): Promise<void> {
    setBusy(true);
    const res = await api.POST("/api/v1/obligation-rules", {
      body: {
        ...bodyOf(draft),
        name: draft.name.trim(),
        jurisdiction: draft.jurisdiction.trim().toUpperCase(),
        rulePack: draft.rulePack.trim(),
        leadTimeDays: 0,
      } as never,
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    setCreating(false);
    // A new rule generates nothing on the way in — see the service. Say so,
    // rather than leaving somebody watching an empty calendar.
    setNotice(
      "Written. It produces no filings yet: add any exceptions first, then the nightly pass " +
        "puts it on the calendar — or save the formula again to fill it now.",
    );
    await load();
  }

  async function addException(ruleId: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    const res = await api.POST("/api/v1/obligation-rules/{ruleId}/exceptions", {
      params: { path: { ruleId } },
      body: body as never,
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    report(res.data.effect, "Exception added.");
    await load();
  }

  async function withdrawException(ruleId: string, periodEndMonth: number): Promise<void> {
    setBusy(true);
    const res = await api.DELETE("/api/v1/obligation-rules/{ruleId}/exceptions/{periodEndMonth}", {
      params: { path: { ruleId, periodEndMonth } },
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    report(res.data.effect, "Withdrawn, and that period is back under the rule's own formula.");
    await load();
  }

  async function seed(): Promise<void> {
    setBusy(true);
    const res = await api.POST("/api/v1/obligation-rules/seed-india", {});
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setNotice(
      res.data.created === 0
        ? "Nothing to add — this firm already holds the pack, and nothing it has confirmed was touched."
        : `Added ${String(res.data.created)} rules. Ten produce dates; the rest say what they are waiting for.`,
    );
    await load();
  }

  const counts = useMemo(() => {
    const by = new Map<RuleCoverage, number>();
    for (const r of rules) by.set(r.coverage, (by.get(r.coverage) ?? 0) + 1);
    return by;
  }, [rules]);

  const shown = rules
    .filter((r) => (focused.length === 0 ? true : focused.includes(r.id)))
    .filter((r) => showRetired || r.isActive)
    .filter((r) => filter === "" || r.coverage === filter);

  return (
    <main>
      <h1>Compliance rules</h1>
      <p className="bib-muted">
        What the law asks of a client, and when. The calendar is generated from these &mdash;
        nobody types a filing in, which is what stops it drifting from the statute.
      </p>

      {error !== null && <p className="bib-error">{error}</p>}
      {notice !== null && <p className="bib-hint">{notice}</p>}

      {focused.length > 0 && (
        <div className="bib-callout">
          <p style={{ margin: 0 }}>
            <strong>
              Showing the {focused.length} rule{focused.length === 1 ? "" : "s"} that blocked one
              engagement&rsquo;s calendar.
            </strong>{" "}
            Give each one a formula and its filings appear.
          </p>
          <Link href="/admin/obligation-rules">Show every rule</Link>
        </div>
      )}

      {loaded && rules.length === 0 && (
        <div className="bib-callout">
          <p style={{ marginTop: 0 }}>
            <strong>This firm has no compliance rules, so its calendar is empty.</strong>
          </p>
          <p>New firms are given the India pack automatically. This one predates it.</p>
          {mayWrite && (
            <button type="button" onClick={() => void seed()} disabled={busy}>
              Load the India rule pack
            </button>
          )}
        </div>
      )}

      {rules.length > 0 && (
        <>
          <div className="bib-callout" style={{ marginTop: "var(--bib-gap-2)" }}>
            <p style={{ margin: 0 }}>
              <strong>{counts.get("generating") ?? 0}</strong> of these produce dates.{" "}
              {/* THE COUNT IS THE CONTROL. It was a number for three tasks and
                  the list it described was four clicks away — so the one thing
                  this screen exists to get answered was the hardest thing on it
                  to reach. */}
              <button
                type="button"
                className="bib-pill"
                data-tone={(counts.get("needs_formula") ?? 0) > 0 ? "live" : undefined}
                onClick={() => { setFilter(filter === "needs_formula" ? "" : "needs_formula"); }}
              >
                {counts.get("needs_formula") ?? 0} waiting on a fact
              </button>{" "}
              &mdash; each names the one thing it still needs, and you can answer it here. And{" "}
              <strong>{counts.get("event_driven") ?? 0}</strong>{" "}
              {(counts.get("event_driven") ?? 0) === 1 ? "is" : "are"} triggered by something
              happening rather than by a period.
            </p>
            <p className="bib-hint" style={{ marginBottom: 0 }}>
              That second number is not a fault list &mdash; it is the honest state of the
              firm&rsquo;s own specification, and a firm whose clients never owe those filings is
              right to leave them unanswered.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "var(--bib-gap-2)",
              alignItems: "center",
              margin: "var(--bib-gap-2) 0",
            }}
          >
            <select
              className="bib-select"
              value={filter}
              onChange={(e) => { setFilter(e.target.value as RuleCoverage | ""); }}
            >
              <option value="">Every rule</option>
              <option value="generating">Producing dates</option>
              <option value="needs_formula">Waiting on a fact</option>
              <option value="event_driven">Event-driven</option>
              <option value="retired">Retired</option>
            </select>
            <label className="bib-check">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => { setShowRetired(e.target.checked); }}
              />
              <span>
                Show retired rules. A retired rule still explains an old filing&rsquo;s date, so
                it is never deleted.
              </span>
            </label>
            {mayWrite && (
              <button
                type="button"
                className="bib-button-quiet"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setEditing(null);
                  setDraft(draftOf(null));
                  setCreating((c) => !c);
                }}
              >
                {creating ? "Cancel" : "Write a rule"}
              </button>
            )}
          </div>

          {creating && (
            <RuleEditor
              draft={draft}
              onChange={setDraft}
              services={services}
              rule={null}
              creating
              busy={busy}
              onSave={() => void create()}
              onCancel={() => { setCreating(false); }}
            />
          )}

          <div className="bib-card">
            <table className="bib-table">
              <thead>
                <tr>
                  <th>Filing</th>
                  <th>Authority</th>
                  <th>When</th>
                  <th>Start early</th>
                  <th>Confirmed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    busy={busy}
                    mayWrite={mayWrite}
                    open={editing === rule.id}
                    onOpen={() => {
                      setCreating(false);
                      setEditing(editing === rule.id ? null : rule.id);
                      setDraft(draftOf(rule));
                    }}
                    onPatch={(body, said) => void patch(rule.id, body, said)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {editing !== null && (() => {
            const rule = rules.find((r) => r.id === editing);
            if (!rule) return null;
            return (
              <>
                <h3 style={{ marginBottom: 0 }}>{rule.name}</h3>
                <p className="bib-muted" style={{ marginTop: 4 }}>
                  {rule.jurisdiction} &middot; <span className="bib-mono">{rule.rulePack}</span>
                  {rule.status === "confirmed" && (
                    <>
                      {" "}&mdash; this rule is <strong>confirmed</strong>. If the law changed for
                      one period, add an exception rather than editing the formula: an exception
                      says which period is different and leaves the other eleven explaining
                      themselves.
                    </>
                  )}
                </p>
                <RuleEditor
                  draft={draft}
                  onChange={setDraft}
                  services={services}
                  rule={rule}
                  creating={false}
                  busy={busy}
                  onSave={() => void patch(rule.id, bodyOf(draft), "Saved.")}
                  onCancel={() => { setEditing(null); }}
                />
                <Exceptions
                  rule={rule}
                  busy={busy}
                  mayWrite={mayWrite}
                  onAdd={(body) => void addException(rule.id, body)}
                  onWithdraw={(m) => void withdrawException(rule.id, m)}
                />
              </>
            );
          })()}
        </>
      )}
    </main>
  );
}

function RuleRow({
  rule,
  busy,
  mayWrite,
  open,
  onOpen,
  onPatch,
}: {
  rule: ObligationRule;
  busy: boolean;
  mayWrite: boolean;
  open: boolean;
  onOpen: () => void;
  onPatch: (body: Record<string, unknown>, said: string) => void;
}) {
  const [lead, setLead] = useState(String(rule.leadTimeDays));

  return (
    <tr data-inactive={rule.isActive ? undefined : "true"}>
      <td>
        {rule.name}
        {rule.module !== null && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            {rule.module}
          </span>
        )}
        {/* THE REASON, in place of a date. This is what a partner reads and
            answers; without it an undated rule is indistinguishable from a
            broken import. */}
        {rule.unresolvedReason !== null && <p className="bib-hint">{rule.unresolvedReason}</p>}
        {rule.exceptions.length > 0 && (
          <p className="bib-hint">
            {rule.exceptions
              .map((e) => `${MONTHS[e.periodEndMonth - 1] ?? "?"}: ${e.note}`)
              .join(" · ")}
          </p>
        )}
      </td>
      <td>
        {rule.authority ?? <span className="bib-muted">&mdash;</span>}
        <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
          {rule.jurisdiction}
        </span>
      </td>
      <td>
        <span className="bib-pill" style={{ whiteSpace: "nowrap" }} data-tone={TONE[rule.coverage]}>
          {LABEL[rule.coverage]}
        </span>
        <span className="bib-mono" style={{ display: "block", fontSize: 12, margin: 0 }}>
          {describe(rule)}
        </span>
        {rule.instanceCount > 0 && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            {rule.instanceCount} filing{rule.instanceCount === 1 ? "" : "s"} generated
          </span>
        )}
      </td>
      <td>
        {/* T–X, and it is a BLANK rather than a guess. Every shipped rule is at
            zero, which means the task appears on the statutory date itself —
            visibly useless, and deliberately so: this is the firm's own working
            practice and nobody has told us what it is. */}
        <input
          type="number"
          min={0}
          value={lead}
          disabled={busy || !mayWrite || rule.coverage !== "generating"}
          onChange={(e) => { setLead(e.target.value); }}
          onBlur={() => {
            const n = Number(lead);
            if (Number.isInteger(n) && n >= 0 && n !== rule.leadTimeDays) {
              onPatch({ leadTimeDays: n }, "Lead time saved.");
            }
          }}
          style={{ width: 64 }}
          title="Days before the legal deadline that the work should start"
        />
        <span className="bib-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}> days</span>
      </td>
      <td>
        {/* The moment a date stops coming from a document and starts coming
            from the firm. Everything ships unconfirmed, India included. */}
        <label className="bib-check">
          <input
            type="checkbox"
            checked={rule.status === "confirmed"}
            disabled={busy || !mayWrite}
            onChange={(e) => {
              onPatch(
                { status: e.target.checked ? "confirmed" : "unconfirmed" },
                e.target.checked ? "Confirmed." : "Marked as not yet checked.",
              );
            }}
          />
          {/* SHORT, because it wrapped to three lines beside the box and the
              column reads as a stack of fragments. The sentence lives in the
              tooltip; the cell says which of the two states this is. */}
          <span
            className="bib-muted"
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            title={
              rule.status === "confirmed"
                ? "A partner has checked this date against the statute."
                : "This date came from a document, not from the firm. Tick it once somebody has checked it."
            }
          >
            {rule.status === "confirmed" ? "confirmed" : "not yet"}
          </span>
        </label>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {mayWrite && (
          <>
            <button
              type="button"
              className="bib-pill"
              disabled={busy}
              onClick={onOpen}
              title="The formula, the exceptions, and what this rule is waiting for."
            >
              {open ? "Close" : "Edit"}
            </button>{" "}
            <button
              type="button"
              className="bib-pill"
              disabled={busy}
              onClick={() => { onPatch({ isActive: !rule.isActive }, "Saved."); }}
              title={
                rule.isActive
                  ? "Stop generating. Filings already produced stay, because a retired rule still explains their dates."
                  : "Start generating again."
              }
            >
              {rule.isActive ? "Retire" : "Reactivate"}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

const LABEL: Record<RuleCoverage, string> = {
  generating: "producing dates",
  needs_formula: "waiting on a fact",
  event_driven: "event-driven",
  retired: "retired",
};

/** Only the actionable state is toned. "Waiting on a fact" gets the live tone
 *  because it is the list worth clearing; "event-driven" gets none, because
 *  there is nothing for anybody to do about it yet. */
const TONE: Record<RuleCoverage, string | undefined> = {
  generating: undefined,
  needs_formula: "live",
  event_driven: undefined,
  retired: "revoked",
};

/**
 * The formula, in words.
 *
 * A partner has to be able to check this against the statute without knowing
 * what `dueMonthOffset` means. The first version of this function was written
 * blind and produced "Once a year, day 15 3 months after" and "When it happens,
 * 30 days after the period ends" — both grammatical nonsense, and the second
 * one factually wrong as well, because an event-driven rule has no period to
 * count from. Reading the page is what found them; the types were happy.
 *
 * The editor shows the same sentence live, from the DRAFT — `describeDraft` in
 * `rule-editor.tsx` — so a partner reads what they are about to save before
 * saving it rather than after. Two copies, deliberately: one describes a saved
 * rule and one an unsaved draft, and merging them would mean building a fake
 * rule out of form state to render a sentence.
 */
function describe(rule: ObligationRule): string {
  const every = EVERY[rule.recurrence] ?? rule.recurrence;
  if (rule.dueRule === null) return every;

  // An EVENT rule counts from the event, never from a period — it does not have
  // one. Saying "after the period ends" there would describe a mechanism that
  // does not exist.
  const from = rule.recurrence === "event" ? "the event" : "the period ends";

  if (rule.dueRule.kind === "days_after") {
    return `${every} · ${String(rule.dueRule.dueDaysAfter ?? 0)} days after ${from}`;
  }

  const offset = rule.dueRule.dueMonthOffset ?? 0;
  const day = ordinal(rule.dueRule.dueDayOfMonth ?? 1);
  if (offset === 0) return `${every} · the ${day} of the month the period ends in`;
  if (offset === 1) return `${every} · the ${day} of the following month`;
  return `${every} · the ${day}, ${String(offset)} months after ${from}`;
}

const EVERY: Record<string, string> = {
  monthly: "Every month",
  quarterly: "Every quarter",
  half_yearly: "Twice a year",
  annual: "Once a year",
  event: "When it happens",
};
