"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ObligationRule, RuleCoverage } from "@/lib/api/client";
import { Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

/**
 * What the law asks of the firm's clients, and when (T3.2).
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
 * ── A REVISION IS A NEW ROW, WHICH IS WHY SO LITTLE IS EDITABLE ─────────────
 *
 * Jurisdiction, name and rule pack are a rule's IDENTITY, and every filing
 * already generated pins the row. Moving the identity would silently restate
 * why those filings were due when they were — so the form offers the lead time,
 * the confirmation and the retire switch, and a genuine revision is a new rule
 * under a new pack with the old one retired. The old row stays readable
 * forever, which is what lets a filing made last year explain its own date.
 */
export default function ObligationRulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<ObligationRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState<RuleCoverage | "">("");

  const load = useCallback(async (): Promise<void> => {
    const res = await api.GET("/api/v1/obligation-rules", {});
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
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function patch(ruleId: string, body: Record<string, unknown>): Promise<void> {
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
    .filter((r) => showRetired || r.isActive)
    .filter((r) => filter === "" || r.coverage === filter);

  return (
    <Page>
      <PageHeader
        eyebrow="Administration"
        title="Compliance rules"
        lede="What the law asks of a client, and when. The calendar is generated from these &mdash;
        nobody types a filing in, which is what stops it drifting from the statute."
      />

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}
      {notice !== null && <p className="field-hint">{notice}</p>}

      {loaded && rules.length === 0 && (
        <div className="notice">
          <p>
            <strong>This firm has no compliance rules, so its calendar is empty.</strong>
          </p>
          <p>
            New firms are given the India pack automatically. This one predates it.
          </p>
          <button type="button" onClick={() => void seed()} disabled={busy}>
            Load the India rule pack
          </button>
        </div>
      )}

      {rules.length > 0 && (
        <>
          <div className="notice" style={{ marginTop: "var(--s-4)" }}>
            <p>
              <strong>{counts.get("generating") ?? 0}</strong> of these produce dates.{" "}
              <strong>{counts.get("needs_formula") ?? 0}</strong>{" "}
              {(counts.get("needs_formula") ?? 0) === 1 ? "is" : "are"} waiting on a fact this
              system does not hold, and <strong>{counts.get("event_driven") ?? 0}</strong>{" "}
              {(counts.get("event_driven") ?? 0) === 1 ? "is" : "are"} triggered by something
              happening rather than by a period.
            </p>
            <p className="field-hint">
              That second number is not a fault list &mdash; it is the honest state of the
              firm&rsquo;s own specification. Each of those rules names the one thing it still
              needs.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "var(--s-4)",
              alignItems: "center",
              margin: "var(--s-4) 0",
            }}
          >
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as RuleCoverage | ""); }}
            >
              <option value="">Every rule</option>
              <option value="generating">Producing dates</option>
              <option value="needs_formula">Waiting on a fact</option>
              <option value="event_driven">Event-driven</option>
              <option value="retired">Retired</option>
            </select>
            <label className="check">
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
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <Th>Filing</Th>
                  <Th>Authority</Th>
                  <Th>When</Th>
                  <Th>Start early</Th>
                  <Th>Confirmed</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {shown.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} busy={busy} onPatch={patch} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}

function RuleRow({
  rule,
  busy,
  onPatch,
}: {
  rule: ObligationRule;
  busy: boolean;
  onPatch: (ruleId: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [lead, setLead] = useState(String(rule.leadTimeDays));

  return (
    <tr style={rule.isActive ? undefined : { opacity: 0.55 }}>
      <Td>
        {rule.name}
        {rule.module !== null && (
          <span className="muted text-xs" style={{ display: "block" }}>
            {rule.module}
          </span>
        )}
        {/* THE REASON, in place of a date. This is what a partner reads and
            answers; without it an undated rule is indistinguishable from a
            broken import. */}
        {rule.unresolvedReason !== null && <p className="field-hint">{rule.unresolvedReason}</p>}
        {rule.exceptions.length > 0 && (
          <p className="field-hint">
            {rule.exceptions.map((e) => `${MONTHS[e.periodEndMonth - 1] ?? "?"}: ${e.note}`).join(" · ")}
          </p>
        )}
      </Td>
      <Td>
        {rule.authority ?? <span className="muted">&mdash;</span>}
        <span className="muted text-xs" style={{ display: "block" }}>
          {rule.jurisdiction}
        </span>
      </Td>
      <Td>
        <span className="pill" style={{ whiteSpace: "nowrap" }} data-tone={TONE[rule.coverage]}>
          {LABEL[rule.coverage]}
        </span>
        <span className="mono text-xs" style={{ display: "block", margin: 0 }}>
          {describe(rule)}
        </span>
        {rule.instanceCount > 0 && (
          <span className="muted text-xs" style={{ display: "block" }}>
            {rule.instanceCount} filing{rule.instanceCount === 1 ? "" : "s"} generated
          </span>
        )}
      </Td>
      <Td>
        {/* T–X, and it is a BLANK rather than a guess. Every shipped rule is at
            zero, which means the task appears on the statutory date itself —
            visibly useless, and deliberately so: this is the firm's own working
            practice and nobody has told us what it is. */}
        <input
          type="number"
          min={0}
          value={lead}
          disabled={busy || rule.coverage !== "generating"}
          onChange={(e) => { setLead(e.target.value); }}
          onBlur={() => {
            const n = Number(lead);
            if (Number.isInteger(n) && n >= 0 && n !== rule.leadTimeDays) {
              void onPatch(rule.id, { leadTimeDays: n });
            }
          }}
          style={{ width: 64 }}
          title="Days before the legal deadline that the work should start"
        />
        <span className="muted text-xs" style={{ whiteSpace: "nowrap" }}> days</span>
      </Td>
      <Td>
        {/* The moment a date stops coming from a document and starts coming
            from the firm. Everything ships unconfirmed, India included. */}
        <label className="check">
          <input
            type="checkbox"
            checked={rule.status === "confirmed"}
            disabled={busy}
            onChange={(e) => {
              void onPatch(rule.id, { status: e.target.checked ? "confirmed" : "unconfirmed" });
            }}
          />
          {/* SHORT, because it wrapped to three lines beside the box and the
              column reads as a stack of fragments. The sentence lives in the
              tooltip; the cell says which of the two states this is. */}
          <span
            className="muted text-xs"
            style={{ whiteSpace: "nowrap" }}
            title={
              rule.status === "confirmed"
                ? "A partner has checked this date against the statute."
                : "This date came from a document, not from the firm. Tick it once somebody has checked it."
            }
          >
            {rule.status === "confirmed" ? "confirmed" : "not yet"}
          </span>
        </label>
      </Td>
      <Td style={{ textAlign: "right" }}>
        <button
          type="button"
          className="pill"
          disabled={busy}
          onClick={() => { void onPatch(rule.id, { isActive: !rule.isActive }); }}
          title={
            rule.isActive
              ? "Stop generating. Filings already produced stay, because a retired rule still explains their dates."
              : "Start generating again."
          }
        >
          {rule.isActive ? "Retire" : "Reactivate"}
        </button>
      </Td>
    </tr>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  needs_formula: "accent",
  event_driven: undefined,
  retired: "danger",
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

/** "20th", "1st", "3rd". A due date reads as a date to a partner, not as a
 *  field value. */
function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${String(n)}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${String(n)}${suffix}`;
}

const EVERY: Record<string, string> = {
  monthly: "Every month",
  quarterly: "Every quarter",
  half_yearly: "Twice a year",
  annual: "Once a year",
  event: "When it happens",
};
