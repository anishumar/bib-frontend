"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { CalendarRow, CoverageGap, CoverageReason } from "@/lib/api/client";

/**
 * The compliance calendar — what the firm's clients owe, and by when (T3.2).
 *
 * ── THIS SCREEN IS READ-ONLY, AND THAT IS THE DESIGN ────────────────────────
 *
 * There is no "add a filing" button and there will not be one. Every row here
 * falls out of three things that already exist: which entities there are, what
 * each one bought, and what the law says about that combination. If a person
 * could type a row in, the calendar could drift from the statute — and then it
 * is the Excel this product replaces, only now inside Postgres.
 *
 * What a person changes is the RULES, at /admin/obligation-rules.
 *
 * ── TWO DATES, AND THE ONE THAT IS ACTIONABLE IS NOT THE LEGAL ONE ──────────
 *
 * `statutoryDueOn` is what the law says; missing it is the client's money.
 * `internalTargetOn` is the firm's own T–X. The list is ordered by the internal
 * one because that is when work has to START — a list sorted by the legal
 * deadline tells you when you are already too late.
 *
 * ── AN EMPTY CALENDAR IS NEVER LEFT UNEXPLAINED ─────────────────────────────
 *
 * The second tab is the reason. A firm that opens this screen and sees nothing
 * has to be able to tell "nothing is owed" from "a rule is missing a fact" from
 * "the software is broken", and only one of those is anybody's to fix. Every
 * coverage row names a reason and none of them is an error — most advisory work
 * legitimately has no compliance rule at all.
 */
export default function CalendarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [tab, setTab] = useState<"due" | "coverage">("due");
  const [includeSettled, setIncludeSettled] = useState(false);
  const [module, setModule] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass, so the coverage badge is right the moment the page
    // paints. A count that fills in a second later reads as "no gaps" to
    // somebody who glances and moves on — and this is the badge whose whole
    // job is to be noticed.
    const [calendar, coverage] = await Promise.all([
      api.GET("/api/v1/calendar", {
        // The STRING the API documents, not a boolean. It used to take
        // `z.coerce.boolean()`, where "false" coerces to TRUE — so unticking
        // this box changed nothing at all, and the only reason nobody saw it is
        // that no calendar row could be terminal until filings could close.
        params: { query: { includeSettled: includeSettled ? "true" : "false", limit: 500 } },
      }),
      api.GET("/api/v1/calendar/coverage", {}),
    ]);

    if (calendar.response.status === 401 || coverage.response.status === 401) {
      router.push("/login");
      return;
    }
    if (calendar.error) {
      setError(apiError(calendar.error).message);
      setLoaded(true);
      return;
    }
    setRows(calendar.data.rows);
    setGaps(coverage.error ? [] : coverage.data.gaps);
    setError(null);
    setLoaded(true);
  }, [router, includeSettled]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const modules = [...new Set(rows.map((r) => r.module).filter((m): m is string => m !== null))];
  const shown = module === "" ? rows : rows.filter((r) => r.module === module);

  // THE CALLER'S CALENDAR DAY, never `toISOString().slice(0, 10)`. The UTC day
  // is yesterday in India before 05:30, and this screen's whole job is saying
  // what is late.
  const now = new Date();
  const today = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">Home</Link>
        <Link href="/work-items">Board</Link>
        <Link href="/clients">Clients</Link>
        <Link href="/admin/obligation-rules">Compliance rules</Link>
      </nav>

      <h1>Compliance calendar</h1>
      <p className="bib-muted">
        What each company owes, generated from the firm&rsquo;s rules and the engagements it
        holds. Nobody types a row into this calendar &mdash; if anyone could, it could disagree
        with the statute.
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-nav" style={{ marginTop: "var(--bib-gap-2)" }}>
        <button
          type="button"
          className="bib-pill"
          data-tone={tab === "due" ? "live" : undefined}
          onClick={() => { setTab("due"); }}
        >
          Due ({rows.length})
        </button>
        <button
          type="button"
          className="bib-pill"
          // The gap count is TONED only when there is something to look at, so
          // a clean firm does not carry a permanent amber badge.
          data-tone={tab === "coverage" ? "live" : undefined}
          onClick={() => { setTab("coverage"); }}
        >
          Not covered ({gaps.length})
        </button>
      </div>

      {tab === "due" ? (
        <>
          <div style={{ display: "flex", gap: "var(--bib-gap-2)", alignItems: "center", margin: "var(--bib-gap-2) 0" }}>
            <label className="bib-check">
              <input
                type="checkbox"
                checked={includeSettled}
                onChange={(e) => { setIncludeSettled(e.target.checked); }}
              />
              <span>
                Include filed and resolved. Off by default &mdash; within a year those are
                almost the whole table and never the answer.
              </span>
            </label>
            {modules.length > 0 && (
              <select value={module} onChange={(e) => { setModule(e.target.value); }}>
                <option value="">Every authority</option>
                {modules.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>

          {!loaded ? (
            <p className="bib-muted">Loading&hellip;</p>
          ) : shown.length === 0 ? (
            <div className="bib-callout">
              <p style={{ marginTop: 0 }}>
                <strong>Nothing is on the calendar.</strong>
              </p>
              <p style={{ marginBottom: 0 }}>
                {gaps.length > 0 ? (
                  <>
                    {gaps.length} live {gaps.length === 1 ? "engagement" : "engagements"} produced
                    no filings.{" "}
                    <button
                      type="button"
                      className="bib-pill"
                      onClick={() => { setTab("coverage"); }}
                    >
                      See why &rarr;
                    </button>
                  </>
                ) : (
                  <>
                    No live engagement is covered by a rule that can compute a date. Check{" "}
                    <Link href="/admin/obligation-rules">the rules</Link> &mdash; most of the
                    shipped India pack is waiting on a fact the firm has not given yet.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="bib-card">
              <table className="bib-table">
                <thead>
                  <tr>
                    <th>Filing</th>
                    <th>Company</th>
                    <th>Period</th>
                    <th>Start by</th>
                    <th>Legal deadline</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <CalendarLine key={row.id} row={row} today={today} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <CoverageTab gaps={gaps} loaded={loaded} />
      )}
    </main>
  );
}

function CalendarLine({ row, today }: { row: CalendarRow; today: string }) {
  const lateInternally = row.internalTargetOn < today && !row.isTerminal;
  const lateLegally = row.statutoryDueOn < today && row.filedOn === null && !row.isTerminal;

  return (
    <tr>
      <td>
        {row.name}
        {row.authority !== null && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            {row.authority}
          </span>
        )}
        {/* SHOWN, never hidden. The date came from a document rather than from a
            partner ticking it against the statute, and a plausible-looking wrong
            due date is the dangerous kind precisely because nobody re-reads it. */}
        {row.ruleUnconfirmed && (
          <span className="bib-pill" style={{ marginLeft: 6 }} title={`Rule pack ${row.rulePack}`}>
            unconfirmed rule
          </span>
        )}
      </td>
      <td>
        {row.entityName ?? <span className="bib-muted">&mdash;</span>}
        {/* The CLIENT under the entity, because a group of four companies files
            four sets of returns and the rows would otherwise be identical. */}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            {row.clientName}
          </span>
        )}
      </td>
      <td className="bib-mono">{row.periodLabel}</td>
      <td>
        <span className={lateInternally ? "bib-mono bib-error" : "bib-mono"} style={{ margin: 0 }}>
          {row.internalTargetOn}
        </span>
        {row.workItemId !== null && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            <Link href={`/work-items/${row.workItemId}`}>on the board &rarr;</Link>
          </span>
        )}
      </td>
      <td>
        <span className={lateLegally ? "bib-mono bib-error" : "bib-mono"} style={{ margin: 0 }}>
          {row.statutoryDueOn}
          {lateLegally && " · missed"}
        </span>
      </td>
      <td>
        <span
          className="bib-pill"
          style={{ whiteSpace: "nowrap" }}
          data-tone={row.needsDecision ? "revoked" : row.isTerminal ? undefined : "live"}
        >
          {row.stateName}
        </span>
        {/* WHEN, not just that. A row that says only "Filed" is one somebody
            has to open a task to date, and the gap between the legal deadline
            and this line is the whole question anybody asks of a closed filing.
            Nothing wrote this date until 0054 — every row read "Pending"
            forever, and this cell is where that shows. */}
        {row.filedOn !== null && (
          <span className="bib-muted bib-mono" style={{ display: "block", fontSize: 12 }}>
            {row.filedOn}
            {row.filedOn > row.statutoryDueOn ? " · late" : ""}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Why the calendar produced nothing for an engagement.
 *
 * NOT AN ERROR LIST, and it must not read as one. The commonest reason is that
 * the engagement is advisory work with no compliance rule at all, which is
 * entirely normal. What this screen prevents is the OTHER case looking the
 * same: a rule the firm has not finished writing, which is silence a partner
 * would otherwise never see.
 */
function CoverageTab({ gaps, loaded }: { gaps: CoverageGap[]; loaded: boolean }) {
  if (!loaded) return <p className="bib-muted">Loading&hellip;</p>;
  if (gaps.length === 0) {
    return (
      <p className="bib-muted" style={{ marginTop: "var(--bib-gap-2)" }}>
        Every live engagement produces filings. That means every service the firm is delivering
        is named by a rule that can compute a date.
      </p>
    );
  }

  // Grouped by reason, because the reasons are FOUR DIFFERENT JOBS and only two
  // of them are anybody's to do. A flat list would make a partner read fifty
  // rows to find the three that matter.
  const byReason = new Map<CoverageReason, CoverageGap[]>();
  for (const g of gaps) {
    byReason.set(g.reason, [...(byReason.get(g.reason) ?? []), g]);
  }

  return (
    <div style={{ marginTop: "var(--bib-gap-2)" }}>
      <p className="bib-muted">
        These engagements are live and the calendar produced nothing for them.{" "}
        <strong>None of this is an error.</strong> Most advisory work has no compliance rule and
        never will; what matters is the ones that should have.
      </p>
      {[...byReason.entries()]
        .sort((a, b) => REASON_ORDER.indexOf(a[0]) - REASON_ORDER.indexOf(b[0]))
        .map(([reason, rows]) => (
          <div className="bib-card" key={reason} style={{ marginTop: "var(--bib-gap-2)" }}>
            <h2 style={{ marginTop: 0 }}>
              {REASONS[reason].title} <span className="bib-muted">({rows.length})</span>
            </h2>
            <p className="bib-hint">{REASONS[reason].what}</p>
            <table className="bib-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Company</th>
                  <th>Service</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.engagementId}>
                    <td>{g.clientName ?? <span className="bib-muted">&mdash;</span>}</td>
                    <td>{g.entityName ?? <span className="bib-muted">&mdash;</span>}</td>
                    <td>
                      {g.serviceName ?? (
                        <span className="bib-muted" title="The catalogue version this engagement pinned could not be resolved">
                          unresolved service
                        </span>
                      )}
                    </td>
                    <td className="bib-mono">
                      {g.jurisdiction ?? (
                        <span
                          className="bib-muted"
                          title="This company has no registered jurisdiction, so no rule can match it"
                        >
                          none
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {REASONS[reason].fix !== null && (
              <p className="bib-hint">
                {REASONS[reason].fix}
                {/* The link goes where the FIX is, which is not always the rules
                    screen: an unregistered company is fixed on its own client
                    page. Sending everybody to the rules would be sending most
                    of them to the wrong place. */}
                {REASONS[reason].where !== null && (
                  <>
                    {" "}
                    <Link href={REASONS[reason].where.href}>
                      {REASONS[reason].where.label} &rarr;
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

/** Most-actionable first. `no_rule_names_this_service` is last on purpose: it is
 *  the ordinary state of advisory work and is the longest list at every firm. */
const REASON_ORDER: CoverageReason[] = [
  "entity_not_registered",
  "rules_need_a_formula",
  "rules_retired",
  "no_rule_for_jurisdiction",
  "nothing_due_yet",
  "no_rule_names_this_service",
];

interface ReasonCopy {
  title: string;
  what: string;
  /** What to do next, or null when there is genuinely nothing to do. */
  fix: string | null;
  /** Where to do it. Not always the rules screen. Typed routes, so a screen
   *  that gets renamed is a compile error here rather than a dead link. */
  where: { href: "/clients" | "/admin/obligation-rules"; label: string } | null;
}

const REASONS: Record<CoverageReason, ReasonCopy> = {
  entity_not_registered: {
    title: "This company has no registered country",
    what:
      "A rule matches an entity's own jurisdiction exactly, so a company nobody has registered " +
      "as a legal entity matches nothing at all — whatever rules the firm holds. This was the " +
      "commonest reason on the first firm this screen was opened against.",
    fix: "Register the company with its country and entity type.",
    where: { href: "/clients", label: "Open the book" },
  },
  rules_need_a_formula: {
    title: "A rule exists and cannot work out a date yet",
    what:
      "The firm's own sheet describes the timing in words this system cannot turn into a day — " +
      "\"within a statutory period after the AGM\", \"State-specific\", \"7 working days\". " +
      "Each rule says exactly what it is waiting for.",
    fix: "This is the list worth clearing: one fact each, and the filings start appearing.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  rules_retired: {
    title: "Every matching rule has been retired",
    what:
      "Somebody switched these off. Anything they already produced still stands — a retired " +
      "rule still explains an old filing's date — but nothing new is generated.",
    fix: "Reactivate one, or add its replacement under a new rule pack.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  no_rule_for_jurisdiction: {
    title: "A rule names this service, but not this country",
    what:
      "The rule reaches a different jurisdiction from the one this company is registered in. " +
      "A rule matches the entity's own country exactly.",
    fix: "Add the rule for this country, or widen the existing one.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  nothing_due_yet: {
    title: "Covered, with nothing due in the window yet",
    what:
      "Rules match and can compute dates, but every period they would produce falls before the " +
      "engagement began — a filing that fell due before the firm was appointed is not the " +
      "firm's. This clears itself next period.",
    fix: null,
    where: null,
  },
  no_rule_names_this_service: {
    title: "No compliance rule names this service",
    what:
      "The ordinary case, and usually the right one: advisory work, an incorporation, a " +
      "one-off report. Nothing recurring is owed to an authority, so there is nothing to " +
      "generate.",
    fix: null,
    where: null,
  },
};
