"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, ObligationRule, RuleCoverage } from "@/lib/api/client";
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
  draftOf,
  Exceptions,
  MONTHS,
  ordinal,
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
    setNotice(
      parts.length === 0
        ? `${prefix} Nothing on the calendar moved.`
        : `${prefix} ${parts.join("; ")}.`,
    );
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

  async function supersede(ruleId: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
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

  const open = editing === null ? null : (rules.find((r) => r.id === editing) ?? null);

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Compliance rules"
        lede="What the law asks of a client, and when. The calendar is generated from these — nobody types a filing in, which is what stops it drifting from the statute."
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
              Give each one a formula and its filings appear.
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
            <p>New firms are given the India pack automatically. This one predates it.</p>
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
                {/* THE COUNT IS THE CONTROL. It was a number for three tasks
                    and the list it described was four clicks away — so the one
                    thing this screen exists to get answered was the hardest
                    thing on it to reach. */}
                <Button
                  variant="link"
                  onClick={() => { setFilter(filter === "needs_formula" ? "" : "needs_formula"); }}
                >
                  {counts.get("needs_formula") ?? 0} waiting on a fact
                </Button>{" "}
                &mdash; each names the one thing it still needs, and you can answer it here. And{" "}
                <strong>{counts.get("event_driven") ?? 0}</strong>{" "}
                {(counts.get("event_driven") ?? 0) === 1 ? "is" : "are"} triggered by something
                happening rather than by a period.
              </p>
              <p className="field-hint">
                That second number is not a fault list &mdash; it is the honest state of the
                firm&rsquo;s own specification, and a firm whose clients never owe those filings is
                right to leave them unanswered.
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
              note="a retired rule still explains an old filing's date, so it is never deleted"
            />

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
                    Somebody has checked this date against the statute. If the law changed for one
                    PERIOD, add an exception rather than editing the formula: an exception says
                    which period is different and leaves the other eleven explaining themselves.
                  </Notice>
                )}
                <RuleEditor
                  draft={draft}
                  onChange={setDraft}
                  services={services}
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
                      then on. Amend that one — this row stays exactly as it is, because it is
                      still why the filings it produced were due when they were.
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
                        Has the law itself changed from a date? That is not an edit &mdash; it
                        keeps this rule and starts a new one.
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
      </Td>
      <Td>
        {rule.authority ?? <span className="muted">&mdash;</span>}
        <Sub>{rule.jurisdiction}</Sub>
      </Td>
      <Td>
        <Pill tone={TONE[rule.coverage]}>{LABEL[rule.coverage]}</Pill>
        <span className="mono text-xs" style={{ display: "block", margin: 0 }}>
          {describe(rule)}
        </span>
        {rule.instanceCount > 0 && (
          <Sub>
            {rule.instanceCount} filing{rule.instanceCount === 1 ? "" : "s"} generated
          </Sub>
        )}
        {/* THE WINDOW, and it is not decoration. A rule that has handed over
            still says "producing dates" — correctly, because it governs its own
            periods — so without this line a partner would read it as live for
            periods it no longer covers, and go looking for a bug. */}
        {rule.effectiveTo !== null && <Sub>hands over on {longDay(rule.effectiveTo)}</Sub>}
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

const LABEL: Record<RuleCoverage, string> = {
  generating: "producing dates",
  needs_formula: "waiting on a fact",
  event_driven: "event-driven",
  retired: "retired",
};

/** Only the actionable state is toned. "Waiting on a fact" gets the accent tone
 *  because it is the list worth clearing; "event-driven" gets none, because
 *  there is nothing for anybody to do about it yet. */
const TONE: Record<RuleCoverage, PillTone> = {
  generating: "neutral",
  needs_formula: "ok",
  event_driven: "neutral",
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
