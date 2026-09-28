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
import { MonthView } from "./month-view";
import { Empty, Loading } from "@/components/states";
import { Button, Card, CardHead, Checkbox, ErrorNotice, Input, LinkButton, Notice, NotSet, Pill, Select, Sub, TabPanel, Table, TableWrap, Tabs, Td, Th, Tooltip } from "@/components/ui";
import { browserDay, longDay } from "@/lib/day";

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
 * What a person changes is the RULES, and since T6.16 in two places: what a
 * filing says (its formula, its exceptions) in the library at
 * /admin/obligation-rules, and which services owe it in /catalogue, the one
 * place a filing meets a service. A rule no service uses puts nothing here.
 *
 * ── A FILING TAKEN OFF IS NOT SHOWN, AND THE API IS WHAT HIDES IT ───────────
 *
 * Removing a filing from a service in the catalogue WITHDRAWS its upcoming
 * rows nobody had started. They are kept and marked, never deleted, and every
 * read this screen makes (the list, coverage, the decisions) leaves them out on
 * the server. Nothing here filters them, deliberately: a second filter in the
 * browser is a second answer to "what is on the calendar", and the two drift.
 * A count of what was taken off is not shown here; the catalogue says it at
 * the moment it happens, which is when somebody can do something about it.
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
 *
 * ── THE WAVE 4 SHAPE (2026-09-28) ───────────────────────────────────────────
 *
 * No eyebrow and no lede: the paragraphs that explained where rows come from,
 * why a coverage gap is not an error and why a decision needs a reason are one
 * line each now, placed where the reader acts, and the reasoning is here and in
 * CLAUDE.md. Dates and periods are the sans face (no mono); states are pills
 * with a dot, in sentence case.
 */
export default function CalendarPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [options, setOptions] = useState<ResolutionOption[]>([]);
  const [tab, setTab] = useState<"due" | "decisions" | "coverage">("due");
  /* MONTH FIRST, and the list is one click away.
     The two answer different questions — "what is owed", which the list is
     better at, and "which week of this month is going to hurt", which only a
     grid can show — so neither replaces the other. The grid leads because the
     second question is the one a scroll cannot answer at all. */
  const [view, setView] = useState<"month" | "list">("month");
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
      <PageHeader title="Compliance calendar" />

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
              checked={includeSettled}
              onChange={(e) => { setIncludeSettled(e.target.checked); }}
            />
            {modules.length > 0 && (
              /* BOXED, because `.select` is `width: 100%` — it is built to fill
                 a `<Field>`, and dropped straight into a `.cluster` it took the
                 full 1,168px of the content column with four options in it.
                 A layout utility is safe here even though this screen is not
                 migrated: `data-tw` gates the RESET, not the utilities. */
              <div className="w-56">
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
              </div>
            )}
            {/* The design system's Button, not a Tailwind one: this screen is
                not migrated, so a bare styled button here would come out with
                the browser's own chrome — preflight is off outside `data-tw`. */}
            <Cluster>
              <Button
                size="sm"
                variant={view === "month" ? "secondary" : "ghost"}
                aria-pressed={view === "month"}
                onClick={() => { setView("month"); }}
              >
                Month
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                aria-pressed={view === "list"}
                onClick={() => { setView("list"); }}
              >
                List
              </Button>
            </Cluster>
          </Cluster>

          {!loaded ? (
            <Loading label="Loading the calendar" />
          ) : shown.length === 0 ? (
            <Card>
              <Empty title="Nothing is on the calendar" icon="calendar">
                {gaps.length > 0
                  ? `${String(gaps.length)} live ${gaps.length === 1 ? "engagement" : "engagements"} produced no filings.`
                  : "A filing reaches a client once it is on a service they bought, in the Catalogue."}
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
                  /* The CATALOGUE, not the rules (T6.16). With no gaps and
                     nothing on the calendar, what is missing is a filing on a
                     service, and that is added in one place only. */
                  <LinkButton size="sm" href="/catalogue">
                    Open the Catalogue
                  </LinkButton>
                )}
              </Cluster>
            </Card>
          ) : view === "month" ? (
            <MonthView rows={shown} loaded={loaded} />
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
  // COMPARED as ISO, PRINTED as prose. The ordering below is string ordering on
  // `YYYY-MM-DD`, which is why it is correct and must stay on the raw value;
  // only what a reader sees changes. All three are `date` columns, so `longDay`
  // — it SPLITS the string and never builds a Date, because `new Date("2026-09-20")`
  // is UTC midnight and prints as the 19th west of Greenwich, which moves a
  // statutory deadline by a day.
  const lateInternally = row.internalTargetOn < today && !row.isTerminal;
  const lateLegally = row.statutoryDueOn < today && row.filedOn === null && !row.isTerminal;
  // What this row IS, for the link at the end of it — see below.
  const about = [row.name, row.entityName, row.periodLabel].filter(Boolean).join(", ");

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
              <Pill tone="warn">Unconfirmed rule</Pill>
            </Tooltip>
          </Sub>
        )}
      </Td>
      <Td>
        {row.entityName ?? <NotSet />}
        {/* The CLIENT under the entity, because a group of four companies files
            four sets of returns and the rows would otherwise be identical. */}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <Sub>{row.clientName}</Sub>
        )}
      </Td>
      <Td className="nowrap">{row.periodLabel}</Td>
      <Td className="nowrap">
        <span className={lateInternally ? "tone-danger" : undefined}>
          {longDay(row.internalTargetOn)}
        </span>
        {row.workItemId !== null && (
          <Sub>
            {/* ELEVEN OF THESE ON ONE SCREEN, all saying "on the board". A link
                list is how somebody who cannot see the table navigates it, and
                eleven identical entries going to eleven different work items
                tell them nothing. The visible words do not change. */}
            <Link href={`/work-items/${row.workItemId}`} aria-label={`${about}: open on the work board`}>
              On the board
            </Link>
          </Sub>
        )}
      </Td>
      <Td className="nowrap">
        <span className={lateLegally ? "tone-danger" : undefined}>
          {longDay(row.statutoryDueOn)}
        </span>
        {lateLegally && <Sub>Missed</Sub>}
      </Td>
      <Td>
        <Pill dot tone={row.needsDecision ? "danger" : row.isTerminal ? "neutral" : "ok"}>
          {row.stateName}
        </Pill>
        {/* WHEN, not just that. A row that says only "Filed" is one somebody
            has to open a task to date, and the gap between the legal deadline
            and this line is the whole question anybody asks of a closed filing.
            Nothing wrote this date until 0054 — every row read "Pending"
            forever, and this cell is where that shows. */}
        {row.filedOn !== null && (
          <Sub>
            {`Filed ${longDay(row.filedOn)}`}
            {row.filedOn > row.statutoryDueOn ? ", late" : ""}
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
          Every live engagement produces filings.
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
      {/* SAID OUT LOUD, in one line: none of these is an error, and most
          advisory work legitimately owes no filing at all. */}
      <p className="text-md">
        Live engagements with no filings. Not an error: most advisory work has none.
      </p>
      {[...byReason.entries()]
        .sort((a, b) => REASON_ORDER.indexOf(a[0]) - REASON_ORDER.indexOf(b[0]))
        .map(([reason, rows]) => (
          <Card key={reason}>
            <CardHead
              level={2}
              title={REASONS[reason].title}
              aside={<Pill>{rows.length}</Pill>}
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
                    <Td>{g.clientName ?? <NotSet />}</Td>
                    <Td>{g.entityName ?? <NotSet />}</Td>
                    <Td>
                      {g.serviceName ?? (
                        <Tooltip text="The catalogue entry this engagement was quoted from could not be found">
                          <NotSet>Service not found</NotSet>
                        </Tooltip>
                      )}
                    </Td>
                    <Td>
                      {g.jurisdiction === null ? (
                        <Tooltip text="No registered country, so no rule can match it">
                          <NotSet />
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
                          {g.blockedRuleIds.length === 1 ? "" : "s"}
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
                    <Link href={REASONS[reason].where.href}>{REASONS[reason].where.label}</Link>
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
  "rules_unconfirmed",
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
   *  that gets renamed is a compile error here rather than a dead link.
   *  `/catalogue` joined the list with T6.16: which services owe a filing is
   *  set there and only there, so two of these fixes live in the catalogue
   *  and pointing them at the library would send a partner to a screen that
   *  no longer has the control. */
  where: { href: "/clients" | "/admin/obligation-rules" | "/catalogue"; label: string } | null;
}

/**
 * The reasons in words. The CODES predate T6.16 and keep their names, so
 * `no_rule_names_this_service` now means "no filing is on this service in the
 * catalogue": a rule reaches an engagement only through a filing linked to the
 * service it bought, and "names" was the old single-service picker's word.
 */
const REASONS: Record<CoverageReason, ReasonCopy> = {
  entity_not_registered: {
    title: "This company has no registered country",
    what: "A filing matches a company by its registered country.",
    fix: "Register the company with its country and entity type.",
    where: { href: "/clients", label: "Open the book" },
  },
  rules_need_a_formula: {
    title: "A filing on this service cannot work out a date yet",
    what: "Its timing is in words, not a date. Each rule says what it needs.",
    // "and confirm it": answering a shipped rule leaves it unconfirmed, and an
    // unconfirmed rule still puts nothing on the calendar.
    fix: "Clear these first: answer each rule's one fact, then confirm it.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  rules_unconfirmed: {
    title: "A filing could work out the dates, but nobody has confirmed it",
    what: "Not yet checked against the law, so it adds nothing yet.",
    // The LIBRARY, not the catalogue. Adding a filing to a service confirms
    // it, so this state means somebody unticked it afterwards, and the tick is
    // on the library's row.
    fix: "Confirm it in the rules once someone has checked it.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  rules_retired: {
    title: "Every filing on this service has been retired",
    what: "Past filings stand; nothing new is added.",
    fix: "Reactivate one in the rules, or add its replacement in the Catalogue.",
    where: { href: "/admin/obligation-rules", label: "Open the rules" },
  },
  no_rule_for_jurisdiction: {
    title: "A filing is on this service, but not for this country",
    what: "Its filings are for a different country from this company's.",
    // A rule's country is part of what it IS and cannot be edited, so the old
    // "or widen the existing one" offered something no screen can do.
    fix: "Write the filing for this country on the service in the Catalogue.",
    where: { href: "/catalogue", label: "Open the Catalogue" },
  },
  nothing_due_yet: {
    title: "Covered, with nothing due in the window yet",
    what: "Every period so far ended before the engagement began. It clears next period.",
    fix: null,
    where: null,
  },
  no_rule_names_this_service: {
    title: "No filing is on this service",
    what: "The usual case for advisory or one-off work.",
    // A fix now, and a conditional one. Before T6.16 a rule on no service
    // reached every service, so this list really was only advisory work. Now
    // it is ALSO every service the firm has not yet given its filings, and the
    // sentence has to say where that is done without calling advisory work a
    // fault.
    fix: "If it does owe a filing, add it to the service in the Catalogue.",
    where: { href: "/catalogue", label: "Open the Catalogue" },
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
          No legal deadline has passed with a filing still open.
        </Empty>
      </Card>
    );
  }

  return (
    <Stack>
      {/* One line. The reason is what answers a client eighteen months later,
          which is why the form asks for it (and the API and a CHECK refuse a
          blank one). */}
      <p className="text-md">Deadlines passed with nothing filed. Decide each one, and say why.</p>
      {options.length === 0 && (
        <Notice tone="danger">
          <p>
            No decision options are set up yet.{" "}
            <Link href="/admin/obligation-vocabulary">Add one</Link>
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
  const consequenceId = useId();

  const chosen = options.find((o) => o.id === optionId);
  // WHAT THIS ROW IS. Nine rows draw nine of every control below, and any
  // number of them can be open at once — `open` is per row. Filing the wrong
  // decision against the wrong return is not a typo; it closes a statutory
  // obligation that is still owed.
  const about = [row.name, row.entityName, row.periodLabel].filter(Boolean).join(", ");

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
            <Pill tone="warn">Unconfirmed rule</Pill>
          </Sub>
        )}
      </Td>
      <Td>
        {row.entityName ?? <NotSet />}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <Sub>{row.clientName}</Sub>
        )}
      </Td>
      <Td className="nowrap">{row.periodLabel}</Td>
      <Td className="nowrap">{longDay(row.statutoryDueOn)}</Td>
      <Td>
        <Pill tone="danger">
          {row.daysLate} {row.daysLate === 1 ? "day" : "days"}
        </Pill>
        {row.workItemId !== null && (
          <Sub>
            {/* Named by the row, for the reason the "on the board" link on the
                Due tab is: nine rows, nine identical link names. */}
            <Link
              href={`/work-items/${row.workItemId}`}
              aria-label={`${[row.name, row.entityName, row.periodLabel]
                .filter(Boolean)
                .join(", ")}: open the task`}
            >
              Open the task
            </Link>
          </Sub>
        )}
      </Td>
      <Td>
        {!open ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Decide: ${about}`}
            onClick={() => { setOpen(true); }}
          >
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
              aria-label={`What was decided: ${about}`}
              /* CONDITIONAL: the consequence sentence below is only drawn once
                 an option is chosen, and a describedby naming an element that
                 is not rendered describes nothing. */
              {...(chosen === undefined ? {} : { "aria-describedby": consequenceId })}
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
              <p id={consequenceId} className="field-hint">
                {chosen.closesWithoutFiling
                  ? "This ends the filing. It will never be made, and the obligation closes."
                  : "The filing still has to happen. It goes back to be worked and filed late."}
              </p>
            )}
            <Input
              size="sm"
              value={reason}
              aria-label={`Reason: ${about}`}
              placeholder="e.g. The client sent the books late"
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
                aria-label={`Record decision: ${about}`}
                onClick={() => { void record(); }}
              >
                Record decision
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Cancel the decision on ${about}`}
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
