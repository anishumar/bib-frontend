"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type {
  CalendarRow,
  CoverageGap,
  CoverageReason,
  DecisionRow,
  ResolutionOption,
} from "@/lib/api/client";
import { Cluster, Page, PageHeader, Stack } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import { Button, Card, CardHead, Checkbox, ErrorNotice, Input, LinkButton, Notice, Pill, Select, Sub, TabPanel, Table, TableWrap, Tabs, Td, Th, Tooltip } from "@/components/ui";
import { browserDay } from "@/lib/day";

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
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [options, setOptions] = useState<ResolutionOption[]>([]);
  const [tab, setTab] = useState<"due" | "decisions" | "coverage">("due");
  const tabsId = useId();
  const [includeSettled, setIncludeSettled] = useState(false);
  const [module, setModule] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass, so the coverage badge is right the moment the page
    // paints. A count that fills in a second later reads as "no gaps" to
    // somebody who glances and moves on — and this is the badge whose whole
    // job is to be noticed.
    const [calendar, coverage, queue, vocabulary] = await Promise.all([
      api.GET("/api/v1/calendar", {
        // The STRING the API documents, not a boolean. It used to take
        // `z.coerce.boolean()`, where "false" coerces to TRUE — so unticking
        // this box changed nothing at all, and the only reason nobody saw it is
        // that no calendar row could be terminal until filings could close.
        params: { query: { includeSettled: includeSettled ? "true" : "false", limit: 500 } },
      }),
      api.GET("/api/v1/calendar/coverage", {}),
      // THE BROWSER'S OWN CALENDAR DAY, not the server's. `daysLate` is
      // computed from it, and a UTC day is yesterday in India before 05:30 —
      // which would understate how late every filing is, every morning, on the
      // one screen whose job is saying exactly that.
      api.GET("/api/v1/calendar/decisions", { params: { query: { asOf: browserDay() } } }),
      api.GET("/api/v1/obligation-vocabulary", {}),
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
    setDecisions(queue.error ? [] : queue.data.rows);
    // Only the ones the firm still chooses. A retired option still EXPLAINS
    // decisions already recorded against it, so the row survives — it simply
    // does not appear in this picker.
    setOptions(vocabulary.error ? [] : vocabulary.data.resolutionOptions.filter((o) => o.isActive));
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
  const today = browserDay();

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title="Compliance calendar"
        lede="What each company owes, generated from the firm’s rules and the engagements it holds. Nobody types a row into this calendar — if anyone could, it could disagree with the statute."
      />

      <ErrorNotice error={error} />

      <Tabs
        id={tabsId}
        label="Calendar views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "due", label: "Due", count: rows.length },
          {
            value: "decisions",
            label: "Needs a decision",
            count: decisions.length,
            // TONED WHENEVER THERE IS ANYTHING IN IT, not only when selected.
            // Every other badge on this screen is a filter; this one is a queue
            // of decisions nobody has taken, and each row is a client's money
            // sitting undecided. It should be visible from across the room.
            ...(decisions.length > 0 ? { tone: "danger" as const } : {}),
          },
          { value: "coverage", label: "Not covered", count: gaps.length },
        ]}
      />

      <TabPanel tabsId={tabsId} value={tab}>
      {tab === "due" ? (
        <Stack>
          <Cluster gap="loose">
            <Checkbox
              label="Include filed and resolved"
              note="off by default — within a year those are almost the whole table and never the answer."
              checked={includeSettled}
              onChange={(e) => { setIncludeSettled(e.target.checked); }}
            />
            {modules.length > 0 && (
              <Select
                size="sm"
                aria-label="Authority"
                value={module}
                onChange={(e) => { setModule(e.target.value); }}
              >
                <option value="">Every authority</option>
                {modules.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            )}
          </Cluster>

          {!loaded ? (
            <Loading label="Loading the calendar" />
          ) : shown.length === 0 ? (
            <Card>
              <Empty title="Nothing is on the calendar" icon="calendar">
                {gaps.length > 0
                  ? `${String(gaps.length)} live ${gaps.length === 1 ? "engagement" : "engagements"} produced no filings.`
                  : "No live engagement is covered by a rule that can compute a date. Most of the shipped India pack is waiting on a fact the firm has not given yet."}
              </Empty>
              <Cluster align="end">
                {gaps.length > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setTab("coverage"); }}
                  >
                    See why
                  </Button>
                ) : (
                  <LinkButton size="sm" href="/admin/obligation-rules">
                    Open the rules
                  </LinkButton>
                )}
              </Cluster>
            </Card>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Filing</Th>
                    <Th>Company</Th>
                    <Th>Period</Th>
                    <Th>Start by</Th>
                    <Th>Legal deadline</Th>
                    <Th>State</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <CalendarLine key={row.id} row={row} today={today} />
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Stack>
      ) : tab === "decisions" ? (
        <DecisionsTab
          rows={decisions}
          options={options}
          loaded={loaded}
          onDecided={() => { void load(); }}
        />
      ) : (
        <CoverageTab gaps={gaps} loaded={loaded} />
      )}
      </TabPanel>
    </Page>
  );
}

function CalendarLine({ row, today }: { row: CalendarRow; today: string }) {
  const lateInternally = row.internalTargetOn < today && !row.isTerminal;
  const lateLegally = row.statutoryDueOn < today && row.filedOn === null && !row.isTerminal;

  return (
    <tr>
      <Td>
        {row.name}
        {row.authority !== null && <Sub>{row.authority}</Sub>}
        {/* SHOWN, never hidden. The date came from a document rather than from a
            partner ticking it against the statute, and a plausible-looking wrong
            due date is the dangerous kind precisely because nobody re-reads it. */}
        {row.ruleUnconfirmed && (
          <Sub>
            <Tooltip text={`Rule pack ${row.rulePack}`}>
              <Pill tone="warn">unconfirmed rule</Pill>
            </Tooltip>
          </Sub>
        )}
      </Td>
      <Td>
        {row.entityName ?? <span className="empty">&mdash;</span>}
        {/* The CLIENT under the entity, because a group of four companies files
            four sets of returns and the rows would otherwise be identical. */}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <Sub>{row.clientName}</Sub>
        )}
      </Td>
      <Td>
        <span className="mono">{row.periodLabel}</span>
      </Td>
      <Td>
        <span className={lateInternally ? "mono tone-danger" : "mono"}>
          {row.internalTargetOn}
        </span>
        {row.workItemId !== null && (
          <Sub>
            <Link href={`/work-items/${row.workItemId}`}>on the board &rarr;</Link>
          </Sub>
        )}
      </Td>
      <Td>
        <span className={lateLegally ? "mono tone-danger" : "mono"}>
          {row.statutoryDueOn}
          {lateLegally && " · missed"}
        </span>
      </Td>
      <Td>
        <Pill tone={row.needsDecision ? "danger" : row.isTerminal ? "neutral" : "accent"}>
          {row.stateName}
        </Pill>
        {/* WHEN, not just that. A row that says only "Filed" is one somebody
            has to open a task to date, and the gap between the legal deadline
            and this line is the whole question anybody asks of a closed filing.
            Nothing wrote this date until 0054 — every row read "Pending"
            forever, and this cell is where that shows. */}
        {row.filedOn !== null && (
          <Sub>
            <span className="mono">
              {row.filedOn}
              {row.filedOn > row.statutoryDueOn ? " · late" : ""}
            </span>
          </Sub>
        )}
      </Td>
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
  if (!loaded) return <Loading label="Checking coverage" />;
  if (gaps.length === 0) {
    return (
      <Card>
        <Empty title="Everything is covered" icon="check">
          Every live engagement produces filings. That means every service the firm is
          delivering is named by a rule that can compute a date.
        </Empty>
      </Card>
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
    <Stack>
      <p className="lede">
        These engagements are live and the calendar produced nothing for them.{" "}
        <strong>None of this is an error.</strong> Most advisory work has no compliance rule and
        never will; what matters is the ones that should have.
      </p>
      {[...byReason.entries()]
        .sort((a, b) => REASON_ORDER.indexOf(a[0]) - REASON_ORDER.indexOf(b[0]))
        .map(([reason, rows]) => (
          <Card key={reason}>
            <CardHead
              title={REASONS[reason].title}
              aside={<Pill tone="quiet">{rows.length}</Pill>}
            />
            <p className="field-hint">{REASONS[reason].what}</p>
            <TableWrap>
              <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Company</Th>
                  <Th>Service</Th>
                  <Th>Country</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.engagementId}>
                    <Td>{g.clientName ?? <span className="empty">&mdash;</span>}</Td>
                    <Td>{g.entityName ?? <span className="empty">&mdash;</span>}</Td>
                    <Td>
                      {g.serviceName ?? (
                        <Tooltip text="The catalogue version this engagement pinned could not be resolved">
                          <span className="unstated">unresolved service</span>
                        </Tooltip>
                      )}
                    </Td>
                    <Td>
                      {g.jurisdiction === null ? (
                        <Tooltip text="This company has no registered jurisdiction, so no rule can match it">
                          <span className="unstated">none</span>
                        </Tooltip>
                      ) : (
                        <Pill tone="code">{g.jurisdiction}</Pill>
                      )}
                    </Td>
                    <Td align="right">
                      {/* STRAIGHT TO THE RULES THAT BLOCKED THIS ONE ROW.
                          `blockedRuleIds` has been on this response since T3.2
                          and nothing read it, so every engagement here sent a
                          partner to a list of fifty-seven rules to find the two
                          that concerned them. The rules screen reads `?rules=`
                          and shows exactly those.

                          OFFERED ONLY WHERE THERE IS SOMETHING TO FIX, which
                          is what `where` already says. `nothing_due_yet` is
                          COVERED — its rules match and can compute dates, and
                          the window simply has not reached a period yet — so a
                          link calling them "the rules that blocked this" was a
                          false sentence about a healthy engagement. Found by
                          clicking it: the row said "covered, with nothing due
                          yet" and the link beside it said forty-seven rules
                          blocked it. */}
                      {g.blockedRuleIds.length > 0 &&
                        REASONS[reason].where?.href === "/admin/obligation-rules" && (
                        <LinkButton
                          variant="ghost"
                          size="sm"
                          href={`/admin/obligation-rules?rules=${g.blockedRuleIds.join(",")}`}
                        >
                          {g.blockedRuleIds.length} rule
                          {g.blockedRuleIds.length === 1 ? "" : "s"} &rarr;
                        </LinkButton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
              </Table>
            </TableWrap>
            {REASONS[reason].fix !== null && (
              <p className="field-hint">
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
          </Card>
        ))}
    </Stack>
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

/**
 * Deadlines that have passed, and what the firm decided about each (T3.3).
 *
 * ── AN EMPTY QUEUE IS THE GOOD CASE AND MUST READ AS ONE ────────────────────
 *
 * Every other empty state on this screen is ambiguous — nothing owed, or a rule
 * missing a fact. This one is not: nothing here means no statutory date has
 * passed undischarged, which is the firm doing its job.
 *
 * ── THE FORM IS COLLAPSED UNTIL SOMEBODY ACTS ───────────────────────────────
 *
 * The row itself is the information. A form open on every late filing turns a
 * list a partner can scan into a wall of controls, and the scan is what tells
 * them which one to open.
 *
 * ── AND THE REASON IS THE POINT OF THE FORM ─────────────────────────────────
 *
 * A single "Resolve" button would record that something was decided and lose
 * why. The option is what can be counted — "fourteen late fees this quarter" —
 * and the reason is what answers the client eighteen months later. The API
 * refuses a blank one, and so does the database.
 */
function DecisionsTab({
  rows,
  options,
  loaded,
  onDecided,
}: {
  rows: DecisionRow[];
  options: ResolutionOption[];
  loaded: boolean;
  onDecided: () => void;
}) {
  if (!loaded) return <Loading label="Loading the queue" />;

  if (rows.length === 0) {
    return (
      <Card>
        <Empty title="Nothing is waiting on a decision" icon="check">
          No statutory date has passed with the filing still open — and unlike an empty
          calendar, that is unambiguously the good case.
        </Empty>
      </Card>
    );
  }

  return (
    <Stack>
      <p className="lede">
        These deadlines have passed and nothing was filed. Each one is a choice with money on
        both sides, and <strong>the reason is what nobody remembers later</strong> — it is what
        answers the client who asks in eighteen months what the penalty was for.
      </p>
      {options.length === 0 && (
        <Notice tone="danger">
          <p>
            This firm has no resolution options, so nothing here can be decided.{" "}
            <Link href="/admin/obligation-vocabulary">Add one →</Link>
          </p>
        </Notice>
      )}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Filing</Th>
              <Th>Company</Th>
              <Th>Period</Th>
              <Th>Legal deadline</Th>
              <Th>Late by</Th>
              <Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <DecisionLine key={row.id} row={row} options={options} onDecided={onDecided} />
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Stack>
  );
}

function DecisionLine({
  row,
  options,
  onDecided,
}: {
  row: DecisionRow;
  options: ResolutionOption[];
  onDecided: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [optionId, setOptionId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = options.find((o) => o.id === optionId);

  async function record(): Promise<void> {
    setSaving(true);
    setError(null);
    const { error: err } = await api.POST("/api/v1/obligations/{obligationId}/resolve", {
      params: { path: { obligationId: row.id } },
      body: { resolutionOptionId: optionId, reason },
    });
    setSaving(false);
    if (err) {
      // The API's own sentence, not one invented here. It says which tick to
      // move or what is missing, in the firm's terms — and a 403 here means
      // the role may not decide, which is a real answer rather than a fault.
      setError(apiError(err).message);
      return;
    }
    setOpen(false);
    onDecided();
  }

  return (
    <tr>
      <Td>
        {row.name}
        {row.authority !== null && <Sub>{row.authority}</Sub>}
        {row.ruleUnconfirmed && (
          <Sub>
            <Pill tone="warn">unconfirmed rule</Pill>
          </Sub>
        )}
      </Td>
      <Td>
        {row.entityName ?? <span className="empty">—</span>}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <Sub>{row.clientName}</Sub>
        )}
      </Td>
      <Td>
        <span className="mono">{row.periodLabel}</span>
      </Td>
      <Td>
        <span className="mono">{row.statutoryDueOn}</span>
      </Td>
      <Td>
        <Pill tone="danger">
          {row.daysLate} {row.daysLate === 1 ? "day" : "days"}
        </Pill>
        {row.workItemId !== null && (
          <Sub>
            <Link href={`/work-items/${row.workItemId}`}>on somebody&rsquo;s desk →</Link>
          </Sub>
        )}
      </Td>
      <Td>
        {!open ? (
          <Button size="sm" variant="secondary" onClick={() => { setOpen(true); }}>
            Decide
          </Button>
        ) : (
          <div
            className="stack tight"
            /* A DEFINITE width, not a minimum. The table sizes itself to
               `max-content`, so a `min-width` here let the consequence sentence
               contribute its full unwrapped length to the column — the cell
               grew past the card and the sentence was clipped mid-word. A fixed
               width bounds that contribution and lets the sentence wrap inside
               the form, which is what it is for. */
            style={{ width: "18rem" }}
          >
            <Select
              size="sm"
              value={optionId}
              aria-label="What was decided"
              onChange={(e) => { setOptionId(e.target.value); }}
            >
              <option value="">What was decided…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.status === "unconfirmed" ? " (unconfirmed)" : ""}
                </option>
              ))}
            </Select>
            {/* WHERE IT GOES NEXT, said out loud before the click. The two
                answers are genuinely different — one keeps the filing owed and
                one ends it forever — and a partner should not have to know
                which option means which. */}
            {chosen !== undefined && (
              <p className="field-hint">
                {chosen.closesWithoutFiling
                  ? "This ENDS the filing. It will never be made, and the obligation closes."
                  : "The filing still has to happen. It goes back to be worked and filed late."}
              </p>
            )}
            <Input
              size="sm"
              value={reason}
              aria-label="Reason"
              placeholder="Why — client sent books late, portal was down…"
              onChange={(e) => { setReason(e.target.value); }}
            />
            <Cluster gap="tight">
              <Button
                size="sm"
                loading={saving}
                // Both are required by the API and by the database. Disabling
                // says so before the click rather than after it — but the
                // server's refusal is still what the message comes from.
                disabled={optionId === "" || reason.trim() === ""}
                onClick={() => { void record(); }}
              >
                Record decision
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setOpen(false); setError(null); }}
              >
                Cancel
              </Button>
            </Cluster>
            <ErrorNotice error={error} />
          </div>
        )}
      </Td>
    </tr>
  );
}
