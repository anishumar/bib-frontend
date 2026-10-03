"use client";

import { Fragment, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ObligationRule, RuleCoverage } from "@/lib/api/client";
import { Cluster, Page, PageHeader, Row, Stack } from "@/components/layout";
import {
  Button,
  ErrorNotice,
  Input,
  Notice,
  Pill,
  scrollBelowBar,
  Sub,
  Table,
  TableWrap,
  Tabs,
  TabPanel,
  Td,
  Th,
  Tr,
  type PillTone,
  type TabItem,
} from "@/components/ui";
import {
  bodyOf,
  createBodyOf,
  describeDue,
  describeNextChange,
  describeRule,
  draftOf,
  Exceptions,
  MONTHS,
  RuleEditor,
  rulePackLabel,
  type RuleDraft,
} from "./rule-editor";
import { Supersede } from "./supersede";
import { longDay } from "@/lib/day";
import { plural } from "@/lib/plural";
import { countryName } from "@/lib/country";

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
 * switch, and nothing else — while the API had taken a full formula, a new rule
 * and exceptions since T3.2 with no caller anywhere. So the forty-seven were
 * never going to start generating however well the firm knew the answer, and
 * "config a partner can edit without a deploy" was true of three fields out of
 * twelve. The editor is `rule-editor.tsx`; what stays absent from it, and why,
 * is written there.
 *
 * ── EVERY WRITE SAYS WHAT IT DID TO THE CALENDAR ────────────────────────────
 *
 * Generation is idempotent and the sweep materialises a year ahead, so an edit
 * that did not restate would be invisible for twelve months. The API returns
 * what each write actually moved and this screen shows all three numbers —
 * including `locked`, the filings it could NOT touch because somebody has
 * already started them. A partial change reported as a whole one is how a
 * deadline moves without anybody being told.
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
 *
 * ── THIS IS THE LIBRARY, AND A SERVICE IS CHOSEN SOMEWHERE ELSE (T6.16) ─────
 *
 * Every rule the firm has, where each one is used, its exceptions and the
 * law-changed panel. What it no longer does is say WHICH SERVICE owes a rule:
 * that is `/catalogue`, the one place a filing meets a service, and a rule
 * used by no service adds nothing to the calendar at all (decision 1 of
 * T6.16). The old editor picker's blank answer meant "every service", which is
 * how 98 GST filings reached a bookkeeping-only client on 2026-09-18.
 *
 * So each row says where it is used, by NAME and linking to that service's
 * card, or says in words that nothing uses it. Confirming a rule here is still
 * possible and still means "checked against the statute", but it no longer
 * reaches any client on its own: adding a rule to a service in the catalogue
 * is what puts it on the calendar, and adding an unconfirmed one confirms it
 * in the same act, after the catalogue has shown its dates in words.
 */
export default function ObligationRulesPage() {
  // `useSearchParams` suspends during prerender; the boundary is the framework's
  // requirement rather than a loading state anybody will see.
  return (
    <Suspense
      fallback={
        <Page>
          <PageHeader title="Compliance rules" />
        </Page>
      }
    >
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
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Set only by an ARRIVAL at a chain whose every row is retired, so the
   *  link lands on something. Otherwise retired rules are the Retired tab. */
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState<RuleCoverage | "">("");
  const tabsId = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));
  const [creating, setCreating] = useState(false);
  /** Amending the open rule, rather than correcting it. Two different acts;
   *  see `supersede.tsx` for which is which. */
  const [amending, setAmending] = useState(false);
  /** The chain a link arrived for (`#rule-<lineageId>`): the catalogue's
   *  "Edit in the library" lands here. `seq` counts arrivals, so arriving at
   *  the same chain twice still scrolls twice. */
  const [arrival, setArrival] = useState<{ lineageId: string; seq: number } | null>(null);
  const hashRead = useRef(false);

  /** Arrive at the chain the address names, if this firm has it. A chain
   *  whose every row is retired is hidden by default, and a link that lands on
   *  nothing reads as a broken link, so the retired rows are shown for it. */
  const arrive = useCallback((list: readonly ObligationRule[]): void => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const lineageId = hash.startsWith("rule-") ? hash.slice("rule-".length) : "";
    const chain = list.filter((r) => r.lineageId === lineageId);
    if (chain.length === 0) return;
    if (!chain.some((r) => r.isActive)) setShowRetired(true);
    setArrival((a) => ({ lineageId, seq: (a?.seq ?? 0) + 1 }));
  }, []);

  /** Rule ids the caller arrived focused on — `/calendar`'s coverage panel
   *  linking to the exact rules blocking one engagement. */
  const focused = useMemo(() => {
    const raw = params.get("rules");
    return raw === null ? [] : raw.split(",").filter((s) => s.length > 0);
  }, [params]);

  const load = useCallback(async (): Promise<void> => {
    // Two reads, not three. The catalogue's service list was fetched only to
    // feed the editor's service picker, and that picker is gone (T6.16): where
    // a rule is used arrives on the rule itself, as `usedIn`, names included.
    const [res, me] = await Promise.all([
      api.GET("/api/v1/obligation-rules", {}),
      api.GET("/api/v1/auth/me", {}),
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
    setError(null);
    setLoaded(true);
    // THE LINK FROM THE CATALOGUE NAMES A CHAIN, and the browser's own jump
    // to it happened before any row existed. Read once, on the first answer,
    // so a later reload after a write never scrolls the page out from under
    // somebody.
    if (!hashRead.current) {
      hashRead.current = true;
      arrive(res.data.rules);
    }
  }, [router, arrive]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // AND A NEW HASH ON THIS PAGE. Changing only the fragment is a same-page
  // jump: the browser scrolls to the row itself, under the bar, and nothing
  // above runs again. Found by the check, which opened a second chain's link
  // on a library already showing the first and landed 63px under the bar.
  useEffect(() => {
    const onHash = (): void => { arrive(rules); };
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("hashchange", onHash); };
  }, [arrive, rules]);

  // Below the sticky top bar, the catalogue's own finding (`scrollBelowBar`):
  // the row's name is what the reader came to see, and a plain jump puts it
  // under the bar. Runs after the render that drew the arrived chain's rows.
  //
  // AND FOCUS GOES THERE (review, measured). The link pressed in the catalogue
  // is unmounted by the navigation, so focus fell to <body>: the first Tab
  // went to the top of the page and scrolled the row away, and reaching the
  // row by keyboard meant tabbing through every earlier row's controls. The
  // row itself takes focus (`tabIndex={-1}`, not a stop of its own), without
  // a second scroll, so the next Tab is its first control. Only on an ARRIVAL:
  // a reload after a write never sets one.
  useEffect(() => {
    if (arrival === null) return;
    const row = document.getElementById(`rule-${arrival.lineageId}`);
    if (row === null) return;
    scrollBelowBar(row);
    row.focus({ preventScroll: true });
  }, [arrival]);

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
        `${String(effect.locked)} left as ${effect.locked === 1 ? "it is" : "they are"}, ` +
          `because somebody has already started ${effect.locked === 1 ? "it" : "them"}`,
      );
    }
    setNotice(
      parts.length === 0
        ? `${prefix} Nothing on the calendar moved.`
        : `${prefix} ${parts.join("; ")}.`,
    );
  }

  async function patch(ruleId: string, body: Record<string, unknown>, said: string): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
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
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
    // No `serviceEntryIds`: the library writes a rule on no service. The one
    // body shape is `createBodyOf`, shared with the catalogue's writer.
    const res = await api.POST("/api/v1/obligation-rules", {
      body: createBodyOf(draft) as never,
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    setCreating(false);
    // A rule written HERE is on no service, so it adds nothing to the calendar
    // tonight or ever, until a service carries it (T6.16, decision 1). The old
    // sentence promised the nightly run would fill it, which is no longer true,
    // and a promise the sweep does not keep reads as a broken sweep.
    setNotice(
      "Saved. It is not used by any service yet, so it adds nothing to the calendar. " +
        "Add it to a service in the Catalogue, and that service's clients get its filings.",
    );
    await load();
  }

  async function addException(ruleId: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
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
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
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

  async function supersede(ruleId: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
    const res = await api.POST("/api/v1/obligation-rules/{ruleId}/supersede", {
      params: { path: { ruleId } },
      body: body as never,
    });
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setError(null);
    setAmending(false);
    // The successor becomes the open rule, because that is the one a partner is
    // now looking at — leaving the predecessor open would show the formula that
    // has just stopped applying.
    setEditing(res.data.rule.id);
    setDraft(draftOf(res.data.rule));
    report(res.data.effect, "Handed over.");
    await load();
  }

  async function seed(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL, not after it succeeds. `ErrorNotice` moves
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent → present transition or the press looks like it did nothing.
    setError(null);
    const res = await api.POST("/api/v1/obligation-rules/seed-india", {});
    setBusy(false);
    if (res.error) {
      setError(apiError(res.error).message);
      return;
    }
    setNotice(
      res.data.created === 0
        ? "Nothing to add. This firm already has the standard rules, and nothing you have confirmed was changed."
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
    .filter((r) => showRetired || filter === "retired" || r.isActive)
    .filter((r) => filter === "" || r.coverage === filter);

  // THE COUNTS ARE THE TABS (Wave 4). They were a paragraph of link-buttons
  // ("10 can compute a date but no service uses them: a filing goes on the
  // calendar only once...") above a "Show" select that did the same filtering
  // a second way. Same filter values, one control. A tab with nothing in it is
  // left out, except the four a partner looks for by name.
  const count = (c: RuleCoverage): number => counts.get(c) ?? 0;
  const filterTabs: TabItem<string>[] = [
    { value: "all", label: "All", count: rules.filter((r) => r.isActive).length },
    // "Producing dates 0" said nothing a partner could act on (F34): these
    // are the rules that put filings on the calendar.
    { value: "generating", label: "On the calendar", count: count("generating") },
    { value: "unlinked", label: "Not used by a service", count: count("unlinked") },
    ...(count("unconfirmed") > 0
      ? [{ value: "unconfirmed", label: "Not yet confirmed", count: count("unconfirmed") }]
      : []),
    { value: "needs_formula", label: "Waiting on a fact", count: count("needs_formula") },
    ...(count("event_driven") > 0
      ? [{ value: "event_driven", label: "Event-driven", count: count("event_driven") }]
      : []),
    ...(count("retired") > 0
      ? [{ value: "retired", label: "Retired", count: count("retired") }]
      : []),
  ];

  const open = editing === null ? null : (rules.find((r) => r.id === editing) ?? null);

  // ONE ANCHOR PER CHAIN, on its first row as shown: `#rule-<lineageId>`. A
  // chain's rows share a name and sit together, so landing on the first shows
  // them all. Keyed on the CHAIN rather than a row's id because "the law
  // changed" gives the chain a new newest row: a link naming the row it had
  // yesterday would land nowhere today.
  const anchored = new Set<string>();
  const anchorOf = (rule: ObligationRule): string | null => {
    if (anchored.has(rule.lineageId)) return null;
    anchored.add(rule.lineageId);
    return `rule-${rule.lineageId}`;
  };

  // The open rule's panel carries the page's notice and refusal while it is
  // open: it sits under its own row now, and a report at the top of a
  // fifty-row table is a report nobody sees.
  const messages = (
    <>
      <ErrorNotice error={error} />
      {notice !== null && <Notice tone="ok">{notice}</Notice>}
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Compliance rules"
        aside={
          mayWrite ? (
            <Button
              /* SAYS WHICH CANCEL. Open the new-rule form and there are two
                 buttons on screen saying only "Cancel" (this one, and the
                 form's own), and they do the same thing, which somebody moving
                 between buttons by name has no way to know. */
              {...(creating ? { "aria-label": "Cancel the new rule" } : {})}
              /* IT STAYS AND A FORM APPEARS UNDER IT, so the state is
                 announced: `aria-expanded`. See `src/design/README.md`. */
              aria-expanded={creating}
              variant={creating ? "secondary" : "primary"}
              onClick={() => {
                setEditing(null);
                setDraft(draftOf(null));
                setCreating((c) => !c);
              }}
            >
              {creating ? "Cancel" : "Write a rule"}
            </Button>
          ) : undefined
        }
      />

      <Stack>
        {open === null && messages}

        {focused.length > 0 && (
          <Notice tone="ok" eyebrow="From the calendar">
            <p>
              Showing the {plural(focused.length, "rule")} that blocked one
              engagement&rsquo;s calendar. {/* "and confirm it": answering a
              shipped rule leaves it unconfirmed, and it still puts nothing on
              the calendar. */}
              Give each one a formula and confirm it.{" "}
              <Link href="/admin/obligation-rules">Show every rule</Link>
            </p>
          </Notice>
        )}

        {loaded && rules.length === 0 && (
          <Notice eyebrow="No rules">
            <p>This firm has no compliance rules, so its calendar is empty.</p>
            {mayWrite && (
              <p>
                <Button onClick={() => void seed()} loading={busy}>
                  Load the India rule pack
                </Button>
              </p>
            )}
          </Notice>
        )}

        {creating && (
          <RuleEditor
            draft={draft}
            onChange={setDraft}
            rule={null}
            creating
            busy={busy}
            onSave={() => void create()}
            onCancel={() => { setCreating(false); }}
            // The form's own refusal replaces the page's last one, which
            // answered a different body (review).
            onRefused={() => { setError(null); }}
          />
        )}

        {rules.length > 0 && (
          <>
            <Tabs
              id={tabsId}
              label="Which rules"
              tabs={filterTabs}
              value={filter === "" ? "all" : filter}
              onChange={(v) => {
                setFilter(v === "all" ? "" : (v as RuleCoverage));
                setShowRetired(false);
              }}
            />
            {/* THE LINE AT THE TOP IS WHERE A SERVICE IS CHOSEN, because this
                screen used to be that place and a partner who remembers the
                old picker will look for it here first (T6.16). */}
            <p className="field-hint">
              {filter === "needs_formula"
                ? "Some never apply to your clients. It is fine to leave those."
                : filter === "generating" && count("generating") === 0
                  ? "None yet. A rule reaches the calendar once it has a date, is ticked Confirmed, and a service in the Catalogue uses it. "
                : filter === "unconfirmed"
                  ? "Nothing reaches the calendar from these until somebody confirms them."
                  : "A rule reaches clients once a service in the Catalogue uses it. "}
              {filter !== "needs_formula" && filter !== "unconfirmed" && (
                <Link href="/catalogue">Open the Catalogue</Link>
              )}
            </p>

            <TabPanel tabsId={tabsId} value={filter === "" ? "all" : filter}>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Filing</Th>
                      <Th>When</Th>
                      <Th>Start early</Th>
                      <Th>Confirmed</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((rule) => (
                      <Fragment key={rule.id}>
                        <RuleRow
                          rule={rule}
                          anchor={anchorOf(rule)}
                          arrived={arrival?.lineageId === rule.lineageId}
                          busy={busy}
                          mayWrite={mayWrite}
                          open={editing === rule.id}
                          onOpen={() => {
                            setCreating(false);
                            setAmending(false);
                            setEditing(editing === rule.id ? null : rule.id);
                            setDraft(draftOf(rule));
                          }}
                          onPatch={(body, said) => void patch(rule.id, body, said)}
                        />
                        {/* THE OPEN RULE, UNDER ITS OWN ROW (Wave 4). It was
                            drawn after the whole table, so pressing Edit on
                            row three opened a form fifty rows away, and the
                            next Tab from the button went to row four. */}
                        {open !== null && open.id === rule.id && (
                          <tr>
                            <td colSpan={5} className="bg-surface-sunk">
                              <div className="max-w-[56rem] whitespace-normal py-2">
                                <OpenRule
                                  open={open}
                                  messages={messages}
                                  draft={draft}
                                  setDraft={setDraft}
                                  busy={busy}
                                  mayWrite={mayWrite}
                                  amending={amending}
                                  setAmending={setAmending}
                                  onSave={() => void patch(open.id, bodyOf(draft), "Saved.")}
                                  onClose={() => { setEditing(null); }}
                                  onRefused={() => { setError(null); }}
                                  onAddException={(body) => void addException(open.id, body)}
                                  onWithdrawException={(m) => void withdrawException(open.id, m)}
                                  onSupersede={(body) => void supersede(open.id, body)}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </TabPanel>
          </>
        )}
      </Stack>
    </Page>
  );
}

/** The open rule: its formula, its exceptions and "the law changed". */
function OpenRule({
  open,
  messages,
  draft,
  setDraft,
  busy,
  mayWrite,
  amending,
  setAmending,
  onSave,
  onClose,
  onRefused,
  onAddException,
  onWithdrawException,
  onSupersede,
}: {
  open: ObligationRule;
  messages: React.ReactNode;
  draft: RuleDraft;
  setDraft: (d: RuleDraft) => void;
  busy: boolean;
  mayWrite: boolean;
  amending: boolean;
  setAmending: (a: boolean) => void;
  onSave: () => void;
  onClose: () => void;
  onRefused: () => void;
  onAddException: (body: Record<string, unknown>) => void;
  onWithdrawException: (periodEndMonth: number) => void;
  onSupersede: (body: Record<string, unknown>) => void;
}) {
  return (
    <Stack>
      <div>
        {/* h2, NOT h3. This panel is a section of the page, and the cards
            inside it (Exceptions, The law changed) are `CardTitle`s, which are
            h3. */}
        <h2>{open.name}</h2>
        <p className="sub">
          {countryName(open.jurisdiction)} &middot; {rulePackLabel(open.rulePack)}
        </p>
      </div>
      {messages}
      {/* A CONFIRMED rule is one somebody vouched for against the statute, so
          editing its formula is a different act from answering an unconfirmed
          one: named rather than refused, because a partner correcting their
          own mistake is allowed. */}
      {open.status === "confirmed" && (
        <Notice tone="warn" eyebrow="This rule is confirmed">
          Checked against the law. If one period is different, add an exception instead.
        </Notice>
      )}
      <RuleEditor
        draft={draft}
        onChange={setDraft}
        rule={open}
        creating={false}
        busy={busy}
        onSave={onSave}
        onCancel={onClose}
        onRefused={onRefused}
      />
      <Exceptions
        rule={open}
        busy={busy}
        mayWrite={mayWrite}
        onAdd={onAddException}
        onWithdraw={onWithdrawException}
      />
      {/* AMENDING IS OFFERED ONLY ON A RULE THAT IS STILL IN FORCE. A rule
          that already hands over on a day is not the one governing periods from
          then on, and superseding it a second time would leave two successors
          covering the same periods, which is two filings for one return. The
          API refuses it; this does not offer it, and says why instead. */}
      {mayWrite &&
        (open.effectiveTo !== null ? (
          <Notice eyebrow="This rule hands over">
            It governs periods up to {longDay(open.effectiveTo)}. Amend the later rule instead.
          </Notice>
        ) : amending ? (
          <Supersede
            rule={open}
            busy={busy}
            onSupersede={onSupersede}
            onCancel={() => { setAmending(false); }}
          />
        ) : (
          <Row>
            <span className="sub">Has the law itself changed from a date? That starts a new rule.</span>
            <Button variant="ghost" onClick={() => { setAmending(true); }}>
              The law changed
            </Button>
          </Row>
        ))}
    </Stack>
  );
}

function RuleRow({
  rule,
  anchor,
  arrived,
  busy,
  mayWrite,
  open,
  onOpen,
  onPatch,
}: {
  rule: ObligationRule;
  /** The chain's anchor id, on the chain's first row as shown; null on the
   *  rest, because an id is one element's. */
  anchor: string | null;
  /** A link arrived for this row's chain: every row of it is marked. */
  arrived: boolean;
  busy: boolean;
  mayWrite: boolean;
  open: boolean;
  onOpen: () => void;
  onPatch: (body: Record<string, unknown>, said: string) => void;
}) {
  const [lead, setLead] = useState(String(rule.leadTimeDays));
  /** Why the lead time cannot be set yet, in words, or null when it can. */
  const leadLocked = mayWrite && rule.coverage !== "generating" ? LEAD_LOCKED[rule.coverage] : null;

  // WHICH ROW TODAY'S FILINGS ARE DUE ON (T6.16 follow-up). The library lists
  // every row of a chain, and each row's formula is its own, which is what
  // Edit edits. What the rows did not say is which of them governs the period
  // containing the firm's today: after "the law changed from April 2027" both
  // read "producing dates", and a partner could not tell from the row that
  // September is still due on the 20th. So the row in force says what changes
  // next, and any other row says what today's filings follow instead.
  const today = rule.inForceToday;
  const governsToday = today !== null && today.ruleId === rule.id;
  const next = governsToday ? describeNextChange(rule) : null;
  // The "From April 2027" line names the day the row hands over on, so the
  // bare "hands over on" beside it would say one date twice.
  const handoverSaid = next !== null && rule.nextChange?.effectiveFrom === rule.effectiveTo;
  const elsewhere =
    today === null || governsToday ? null : otherRowToday(rule, today.effectiveFrom, today.dueRule);

  return (
    <Tr
      id={anchor ?? undefined}
      // Focusable by script only, so an arrival can put focus on the row
      // without adding a Tab stop to every row of the table.
      tabIndex={anchor === null ? undefined : -1}
      data-arrived={arrived ? "true" : undefined}
    >
      <Td>
        {/* CAPPED AT 18rem SO IT WRAPS (Wave 4). The reason sentences ran
            unwrapped and the table hid 1,432px of its columns at 1280. */}
        <div className="max-w-72 whitespace-normal">
          {rule.name}
          {/* The law's grouping, who it is filed with, and the country, on one
              line: "Authority" was a column of its own. */}
          <Sub>
            {[rule.module, rule.authority, rule.jurisdiction].filter((v) => v !== null && v !== "").join(" · ")}
          </Sub>
          {/* THE REASON, in place of a date. This is what a partner reads and
              answers; without it an undated rule is indistinguishable from a
              broken import. */}
          {rule.unresolvedReason !== null && <Sub>{rule.unresolvedReason}</Sub>}
          {rule.exceptions.length > 0 && (
            <Sub>
              {rule.exceptions
                .map((e) => `${MONTHS[e.periodEndMonth - 1] ?? "?"}: ${e.note}`)
                .join(" · ")}
            </Sub>
          )}
          {/* WHERE IT IS USED (T6.16), by the service's NAME and linking to
              its card in the catalogue, which is where it is added and
              removed. The empty case is words, not a blank: a rule on no
              service adds nothing to the calendar at all. Not said twice: a
              rule with a formula and no service already reads "Not used by a
              service" in its pill, and one waiting on a fact makes nothing
              whoever uses it (Wave 4, 46 identical lines on the shipped pack). */}
          {rule.usedIn.length > 0 ? (
            <Sub>
              Used in:{" "}
              {rule.usedIn.map((u, i) => (
                <span key={u.serviceEntryId}>
                  {i > 0 && ", "}
                  {/* The service's own page, on its filings tab (W4B). */}
                  <Link href={`/catalogue/${u.serviceKey}?tab=filings` as Route}>
                    {u.serviceName ?? u.serviceKey}
                  </Link>
                </span>
              ))}
            </Sub>
          ) : rule.coverage !== "unlinked" && rule.coverage !== "needs_formula" ? (
            <Sub>Not used by any service yet.</Sub>
          ) : null}
        </div>
      </Td>
      <Td>
        <div className="max-w-56 whitespace-normal">
          <Pill dot tone={TONE[rule.coverage]}>{LABEL[rule.coverage]}</Pill>
          {/* The formula as a sentence, in the sans face (Wave 4). */}
          <Sub>{describeRule(rule)}</Sub>
          {next !== null && <Sub>{next}</Sub>}
          {elsewhere !== null && <Sub>{elsewhere}</Sub>}
          {rule.instanceCount > 0 && (
            <Sub>
              {plural(rule.instanceCount, "filing")} made
            </Sub>
          )}
          {/* THE WINDOW, and it is not decoration. A rule that has handed over
              still says "producing dates", correctly, because it governs its
              own periods; without this line a partner would read it as live
              for periods it no longer covers. */}
          {rule.effectiveTo !== null && !handoverSaid && (
            <Sub>Hands over on {longDay(rule.effectiveTo)}</Sub>
          )}
          {rule.effectiveFrom !== null && <Sub>Governs periods from {longDay(rule.effectiveFrom)}</Sub>}
        </div>
      </Td>
      <Td>
        {/* T–X, and it is a BLANK rather than a guess. Every shipped rule is at
            zero, which means the task appears on the statutory date itself:
            this is the firm's own working practice and nobody has told us what
            it is. Commits on blur (every commit writes an audit event). */}
        <span className="nowrap">
          <Input
            type="number"
            size="sm"
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
            /* The aria-label names the rule: the same sentence on all 57 rows
               told a screen reader nothing about which rule it was changing.
               The title stays as the mouse-user's tooltip. */
            aria-label={`Lead time in days for ${rule.name}`}
            title="Days before the legal deadline that the work should start"
            {...(leadLocked === null ? {} : { "aria-describedby": `lead-why-${rule.id}` })}
          />{" "}
          days
        </span>
        {/* WHY it is greyed, in words (audit 2026-10-03, CA#25): it was
            disabled with no hint, and a partner could not tell it waits for
            the tick in the next column. */}
        {leadLocked !== null && (
          <span className="sub" id={`lead-why-${rule.id}`}>
            {leadLocked}
          </span>
        )}
      </Td>
      <Td>
        {/* The moment a date stops coming from a document and starts coming
            from the firm. Everything ships unconfirmed, India included. */}
        <label className="check nowrap">
          <input
            type="checkbox"
            /* The visible text is the VALUE, identical down the column; the
               label names the question and the rule. */
            aria-label={`Date checked against the statute for ${rule.name}`}
            checked={rule.status === "confirmed"}
            disabled={busy || !mayWrite}
            onChange={(e) => {
              onPatch(
                { status: e.target.checked ? "confirmed" : "unconfirmed" },
                e.target.checked ? "Confirmed." : "Marked as not yet checked.",
              );
            }}
          />
          <span
            title={
              rule.status === "confirmed"
                ? "A partner has checked this date against the statute."
                : "This date came from a document, not from the firm. Tick it once somebody has checked it."
            }
          >
            {rule.status === "confirmed" ? "Confirmed" : "Not yet"}
          </span>
        </label>
      </Td>
      <Td align="right">
        {mayWrite && (
          <Cluster>
            {/* NAMED BY THE RULE: fifty-seven of these read "Edit" and
                fifty-seven more read "Retire". */}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onOpen}
              aria-expanded={open}
              aria-label={`${open ? "Close" : "Edit"} the rule for ${rule.name}`}
              title="The formula, the exceptions, and what this rule is waiting for."
            >
              {open ? "Close" : "Edit"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => { onPatch({ isActive: !rule.isActive }, "Saved."); }}
              aria-label={`${rule.isActive ? "Retire" : "Reactivate"} the rule for ${rule.name}`}
              title={
                rule.isActive
                  ? "Stop generating. Filings already produced stay, because a retired rule still explains their dates."
                  : "Start generating again."
              }
            >
              {rule.isActive ? "Retire" : "Reactivate"}
            </Button>
          </Cluster>
        )}
      </Td>
    </Tr>
  );
}

/**
 * What a row that does NOT govern today says instead: which side of it today's
 * rule lies, and what that rule is due on. Both rows of a chain read "producing
 * dates", correctly, since each governs its own periods, so only this says
 * which one September's return follows. The comparison is of two period
 * starts as `YYYY-MM-DD` strings; which row governs today is the API's answer
 * (`inForceToday`), never worked out here.
 */
function otherRowToday(
  rule: ObligationRule,
  todayFrom: string | null,
  todayDue: ObligationRule["dueRule"],
): string {
  const due = describeDue({ recurrence: rule.recurrence, dueRule: todayDue });
  // A row with no start governs from the beginning, so it is never the later.
  const later = rule.effectiveFrom !== null && (todayFrom === null || rule.effectiveFrom > todayFrom);
  const lead = later
    ? "Not in force yet. Today's filings follow the earlier rule"
    : "No longer in force. Today's filings follow the later rule";
  return due === null ? `${lead}, which cannot work out a date yet.` : `${lead}: ${due}.`;
}

const LABEL: Record<RuleCoverage, string> = {
  generating: "On the calendar",
  needs_formula: "Waiting on a fact",
  event_driven: "Event-driven",
  unlinked: "Not used by a service",
  unconfirmed: "Not yet confirmed",
  retired: "Retired",
};

/** Only the actionable state is toned. "Waiting on a fact" gets the accent tone
 *  because it is the list worth clearing; "event-driven" gets none, because
 *  there is nothing for anybody to do about it yet. */
const TONE: Record<RuleCoverage, PillTone> = {
  generating: "neutral",
  needs_formula: "ok",
  event_driven: "neutral",
  // NOT toned, although it is most of the shipped pack's formulas. Whether a
  // service uses a filing is the firm's choice, not a job: a firm that does no
  // payroll rightly never adds the PF return to anything, and a tone would nag
  // it about work nobody should do (the same argument as the 47 above).
  unlinked: "neutral",
  // The other list worth clearing: a formula this system can run and nobody
  // has checked. It puts nothing on the calendar until somebody does.
  unconfirmed: "ok",
  retired: "danger",
};

/** Why "Start early" is greyed for a rule that does not produce dates yet. */
const LEAD_LOCKED: Readonly<Record<Exclude<ObligationRule["coverage"], "generating">, string>> = {
  unconfirmed: "Tick Confirmed first to set this.",
  needs_formula: "Give the rule a date first.",
  unlinked: "Add it to a service first.",
  event_driven: "Not used: it has no fixed date.",
  retired: "Retired.",
};
