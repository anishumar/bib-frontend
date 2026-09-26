"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ObligationRule, RuleCoverage } from "@/lib/api/client";
import { Cluster, Page, PageHeader, Row, Stack } from "@/components/layout";
import {
  Button,
  Card,
  Checkbox,
  ErrorNotice,
  Field,
  Input,
  Notice,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  type PillTone,
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
  type RuleDraft,
} from "./rule-editor";
import { Supersede } from "./supersede";
import { longDay } from "@/lib/day";

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
          <PageHeader eyebrow="How work runs" title="Compliance rules" />
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
  const [showRetired, setShowRetired] = useState(false);
  const [filter, setFilter] = useState<RuleCoverage | "">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));
  const [creating, setCreating] = useState(false);
  /** Amending the open rule, rather than correcting it. Two different acts;
   *  see `supersede.tsx` for which is which. */
  const [amending, setAmending] = useState(false);

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
    .filter((r) => showRetired || r.isActive)
    .filter((r) => filter === "" || r.coverage === filter);

  const open = editing === null ? null : (rules.find((r) => r.id === editing) ?? null);

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Compliance rules"
        lede={
          /* THE LINE AT THE TOP IS WHERE A SERVICE IS CHOSEN, because this
             screen used to be that place and a partner who remembers the old
             picker will look for it here first. */
          <>
            What the law requires of each client, and by when: your firm&rsquo;s library of
            compliance filings, so nobody has to type a filing in by hand. A filing reaches a
            client only once it is added to one of your services in the{" "}
            <Link href="/catalogue">Catalogue</Link>.
          </>
        }
      />

      <Stack>
        <ErrorNotice error={error} />
        {notice !== null && <Notice tone="ok">{notice}</Notice>}

        {focused.length > 0 && (
          <Notice tone="ok" eyebrow="FROM THE CALENDAR">
            <p>
              <strong>
                Showing the {focused.length} rule{focused.length === 1 ? "" : "s"} that blocked one
                engagement&rsquo;s calendar.
              </strong>{" "}
              {/* "and confirm it", because answering a shipped rule leaves it
                  unconfirmed and it still puts nothing on the calendar. The
                  sentence said only "give it a formula" and was half true. */}
              Give each one a formula and confirm it, and its filings appear.
            </p>
            <p>
              <Link href="/admin/obligation-rules">Show every rule</Link>
            </p>
          </Notice>
        )}

        {loaded && rules.length === 0 && (
          <Notice eyebrow="NO RULES">
            <p>
              <strong>This firm has no compliance rules, so its calendar is empty.</strong>
            </p>
            <p>New firms get the India rule pack automatically. This firm was set up before that.</p>
            {mayWrite && (
              <p>
                <Button onClick={() => void seed()} loading={busy}>
                  Load the India rule pack
                </Button>
              </p>
            )}
          </Notice>
        )}

        {rules.length > 0 && (
          <>
            <Notice>
              <p>
                <strong>{counts.get("generating") ?? 0}</strong> of these produce dates.{" "}
                {/* A RULE NO SERVICE USES ADDS NOTHING (T6.16, decision 1).
                    Before it, a pack row named no service and "no service"
                    meant EVERY service, so confirming one reached every client
                    in its country. Now every shipped rule with a formula lands
                    here until a service in the catalogue carries it, which is
                    also where an unconfirmed one gets confirmed. So the count
                    is a control, and the sentence says where the fix is. */}
                <Button
                  variant="link"
                  onClick={() => { setFilter(filter === "unlinked" ? "" : "unlinked"); }}
                >
                  {counts.get("unlinked") ?? 0} can compute a date but no service uses them
                </Button>
                : a filing goes on the calendar only once it is added to a service in the{" "}
                <Link href="/catalogue">Catalogue</Link>, and adding one there confirms it.{" "}
                {/* A rule a service uses and nobody has confirmed is still
                    possible: somebody can untick the box below after adding it.
                    Rare, so it is mentioned only when it is true. */}
                {(counts.get("unconfirmed") ?? 0) > 0 && (
                  <>
                    <Button
                      variant="link"
                      onClick={() => { setFilter(filter === "unconfirmed" ? "" : "unconfirmed"); }}
                    >
                      {counts.get("unconfirmed") ?? 0} used by a service but not yet confirmed
                    </Button>
                    : nothing goes on the calendar from those until somebody here checks them
                    against the law.{" "}
                  </>
                )}
                {/* THE COUNT IS THE CONTROL. It was a number for three tasks
                    and the list it described was four clicks away — so the one
                    thing this screen exists to get answered was the hardest
                    thing on it to reach. */}
                <Button
                  variant="link"
                  onClick={() => { setFilter(filter === "needs_formula" ? "" : "needs_formula"); }}
                >
                  {counts.get("needs_formula") ?? 0} waiting on a fact
                </Button>
                : each one says what it still needs, and you can answer it here. And{" "}
                <strong>{counts.get("event_driven") ?? 0}</strong>{" "}
                {(counts.get("event_driven") ?? 0) === 1 ? "is" : "are"} triggered by an event
                rather than by a period.
              </p>
              <p className="field-hint">
                That second number is not a list of faults. Some filings never apply to your
                clients, and it is fine to leave those rules unanswered.
              </p>
            </Notice>

            {/* The FILTER and the one action on a line, the option under them.
                Both in one `Cluster` pushed "Write a rule" onto its own line
                the moment the checkbox's sentence wrapped, which reads as a
                button somebody forgot to place. Found by looking at it. */}
            <Row align="end">
              {/* IN A `Field`, like every other Select in this app. A bare one
                  is `width: 100%` by design — right inside a form, and here it
                  filled the row and pushed the button onto its own line. The
                  label is the other half of the fix: a filter with no label is
                  a control a screen reader announces as "combo box". */}
              <Field label="Show">
                <Select
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value as RuleCoverage | ""); }}
                >
                  <option value="">Every rule</option>
                  <option value="generating">Producing dates</option>
                  <option value="unlinked">Not used by any service</option>
                  <option value="unconfirmed">Not yet confirmed</option>
                  <option value="needs_formula">Waiting on a fact</option>
                  <option value="event_driven">Event-driven</option>
                  <option value="retired">Retired</option>
                </Select>
              </Field>
              {mayWrite && (
                <Button
                  variant="secondary"
                  /* SAYS WHICH CANCEL. Open the new-rule form and there are two
                     buttons on screen saying only "Cancel" — this one at the
                     top of the page and the form's own at the bottom of it —
                     and they do the same thing, which somebody moving between
                     buttons by name has no way to know. The visible word is
                     unchanged. */
                  {...(creating ? { "aria-label": "Cancel the new rule" } : {})}
                  /* IT STAYS AND A FORM APPEARS UNDER IT, so the state is
                     announced. The flipping label already says it to somebody
                     reading; `aria-expanded` is what says it to somebody
                     arriving on the control. See `src/design/README.md`. */
                  aria-expanded={creating}
                  onClick={() => {
                    setEditing(null);
                    setDraft(draftOf(null));
                    setCreating((c) => !c);
                  }}
                >
                  {creating ? "Cancel" : "Write a rule"}
                </Button>
              )}
            </Row>
            <Checkbox
              checked={showRetired}
              onChange={(e) => { setShowRetired(e.target.checked); }}
              label="Show retired rules"
              note="a retired rule still explains an old filing's date, so it is kept rather than deleted"
            />

            {creating && (
              <RuleEditor
                draft={draft}
                onChange={setDraft}
                rule={null}
                creating
                busy={busy}
                onSave={() => void create()}
                onCancel={() => { setCreating(false); }}
              />
            )}

            <Card flush>
              <TableWrap>
                <Table>
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
                      <RuleRow
                        key={rule.id}
                        rule={rule}
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
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>

            {open !== null && (
              <Stack>
                <div>
                  {/* h2, NOT h3. This panel is a section of the page, and the
                      cards inside it — Exceptions, The law changed — are
                      `CardTitle`s, which are h3. At h3 the rule's own name
                      ranked EQUAL to the cards under it, and the ladder went
                      h1 -> h3 with nothing between. Neither was ever seen,
                      because this panel only exists once a rule row is open
                      and no sweep had opened one. */}
                  <h2 style={{ marginBottom: 4 }}>{open.name}</h2>
                  <p className="muted">
                    {open.jurisdiction} &middot; <span className="mono">{open.rulePack}</span>
                  </p>
                </div>
                {/* A CONFIRMED rule is one somebody vouched for against the
                    statute, so editing its formula is a different act from
                    answering an unconfirmed one — named rather than refused,
                    because a partner correcting their own mistake is allowed. */}
                {open.status === "confirmed" && (
                  <Notice tone="warn" eyebrow="THIS RULE IS CONFIRMED">
                    Somebody has checked this date against the law. If the law changed for one
                    period only, add an exception rather than editing the formula. An exception
                    says which period is different and leaves the others as they are.
                  </Notice>
                )}
                <RuleEditor
                  draft={draft}
                  onChange={setDraft}
                  rule={open}
                  creating={false}
                  busy={busy}
                  onSave={() => void patch(open.id, bodyOf(draft), "Saved.")}
                  onCancel={() => { setEditing(null); }}
                />
                <Exceptions
                  rule={open}
                  busy={busy}
                  mayWrite={mayWrite}
                  onAdd={(body) => void addException(open.id, body)}
                  onWithdraw={(m) => void withdrawException(open.id, m)}
                />
                {/* AMENDING IS OFFERED ONLY ON A RULE THAT IS STILL IN FORCE.
                    A rule that already hands over on a day is not the one
                    governing periods from then on, and superseding it a second
                    time would leave two successors covering the same periods —
                    which is two filings for one return. The API refuses it;
                    this does not offer it, and says why instead. */}
                {mayWrite &&
                  (open.effectiveTo !== null ? (
                    <Notice eyebrow="THIS RULE HANDS OVER">
                      It governs periods up to {longDay(open.effectiveTo)}, and a later rule governs from
                      then on. Amend that later rule instead. This row stays as it is, because it
                      explains why the filings it produced were due when they were.
                    </Notice>
                  ) : amending ? (
                    <Supersede
                      rule={open}
                      busy={busy}
                      onSupersede={(body) => void supersede(open.id, body)}
                      onCancel={() => { setAmending(false); }}
                    />
                  ) : (
                    <Row>
                      <span className="faint">
                        Has the law itself changed from a date? That is not an edit. It keeps
                        this rule and starts a new one.
                      </span>
                      <Button variant="ghost" onClick={() => { setAmending(true); }}>
                        The law changed
                      </Button>
                    </Row>
                  ))}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Page>
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
    <tr style={rule.isActive ? undefined : { opacity: 0.55 }}>
      <Td>
        {rule.name}
        {rule.module !== null && <Sub>{rule.module}</Sub>}
        {/* THE REASON, in place of a date. This is what a partner reads and
            answers; without it an undated rule is indistinguishable from a
            broken import. */}
        {rule.unresolvedReason !== null && <p className="cell-note">{rule.unresolvedReason}</p>}
        {rule.exceptions.length > 0 && (
          <p className="cell-note">
            {rule.exceptions
              .map((e) => `${MONTHS[e.periodEndMonth - 1] ?? "?"}: ${e.note}`)
              .join(" · ")}
          </p>
        )}
        {/* WHERE IT IS USED (T6.16), by the service's NAME and linking to its
            card in the catalogue, which is where it is added and removed. The
            empty case is a SENTENCE, not a blank: a rule on no service adds
            nothing to the calendar at all, and a blank cell would let a
            confirmed, formula-bearing rule look as though it were working. */}
        <p className="cell-note">
          {rule.usedIn.length === 0 ? (
            "Not used by any service, so it adds nothing to the calendar."
          ) : (
            <>
              Used in:{" "}
              {rule.usedIn.map((u, i) => (
                <span key={u.serviceEntryId}>
                  {i > 0 && ", "}
                  <Link href={`/catalogue#service-${u.serviceKey}`}>
                    {u.serviceName ?? u.serviceKey}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
      </Td>
      <Td>
        {rule.authority ?? <span className="muted">not stated</span>}
        <Sub>{rule.jurisdiction}</Sub>
      </Td>
      <Td>
        <Pill tone={TONE[rule.coverage]}>{LABEL[rule.coverage]}</Pill>
        <span className="mono text-xs" style={{ display: "block", margin: 0 }}>
          {describeRule(rule)}
        </span>
        {next !== null && (
          <span className="mono text-xs" style={{ display: "block", margin: 0 }}>
            {next}
          </span>
        )}
        {elsewhere !== null && <Sub>{elsewhere}</Sub>}
        {rule.instanceCount > 0 && (
          <Sub>
            {rule.instanceCount} filing{rule.instanceCount === 1 ? "" : "s"} generated
          </Sub>
        )}
        {/* THE WINDOW, and it is not decoration. A rule that has handed over
            still says "producing dates" — correctly, because it governs its own
            periods — so without this line a partner would read it as live for
            periods it no longer covers, and go looking for a bug. */}
        {rule.effectiveTo !== null && !handoverSaid && (
          <Sub>hands over on {longDay(rule.effectiveTo)}</Sub>
        )}
        {rule.effectiveFrom !== null && <Sub>governs periods from {longDay(rule.effectiveFrom)}</Sub>}
      </Td>
      <Td>
        {/* T–X, and it is a BLANK rather than a guess. Every shipped rule is at
            zero, which means the task appears on the statutory date itself —
            visibly useless, and deliberately so: this is the firm's own working
            practice and nobody has told us what it is. */}
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
          /* `title` alone was the accessible name here, and a title is the last
             fallback the name computation reaches — it is not offered on touch,
             many browsers never show it on keyboard focus, and a screen reader
             may be set to ignore it. Worse, it is the SAME sentence on all 57
             rows: tabbing down the column announced one identical phrase over
             and over with nothing to say which rule was being changed. The
             aria-label names the rule; the title stays as the sighted
             mouse-user's tooltip, which is the job it is good at. */
          aria-label={`Lead time in days for ${rule.name}`}
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
            /* Same problem, same fix: the visible text beside the box is
               "confirmed" / "not yet", which is the VALUE and not the
               question, and it is identical down the column. */
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
      <Td align="right">
        {mayWrite && (
          <Cluster>
            {/* NAMED BY THE RULE. Fifty-seven of these read "Edit" and
                fifty-seven more read "Retire" — the same shape the checkboxes
                in this row were fixed for, and the buttons were left behind
                because the probe only ever counted `input`/`select`/`textarea`.
                A `<fieldset>`'s name does not get prepended to a BUTTON the way
                a field's label does, so a group cannot rescue these. */}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onOpen}
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
    </tr>
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
  generating: "producing dates",
  needs_formula: "waiting on a fact",
  event_driven: "event-driven",
  unlinked: "not used by any service",
  unconfirmed: "not yet confirmed",
  retired: "retired",
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
