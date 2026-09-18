"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import { Page, PageHeader, Section } from "@/components/layout";
import { ConfigHistory } from "@/lib/ui/config-history";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Notice,
  Pill,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  useSwapFocus,
} from "@/components/ui";

/**
 * What a CLIENT hears from the firm, and when (T4.4 and T6.7).
 *
 * ── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
 *
 * Both ladders were built, both are swept by the worker, both were published by
 * the demo seed — and neither had a screen. The only way a firm could change
 * either was the generic config API, which means a firm could not change them.
 * The client record READS the chaser ladder and names its rungs on the freeze
 * panel; nothing wrote it. A number that lands on a client and is settable only
 * by curl is the same trap this repo calls a control that looks live and is
 * inert, pointed the other way.
 *
 * ── TWO LADDERS, ONE SCREEN, AND THEY ARE NOT THE SAME LADDER ───────────────
 *
 * They are separate config kinds on purpose (0065 and 0067 argue it out) and
 * they stay separate here — separate entries, separate drafts, separate
 * publishes. What they share is the READER: a partner deciding how often this
 * firm speaks to the people who pay it is answering one question, and answering
 * it on two screens invites two different answers.
 *
 * The difference a firm has to see, which is why the two sections say it in
 * their own words rather than sharing one sentence:
 *
 *   the reminder ladder  counts FORWARD from the day the firm asked, wants
 *                        something back, and STOPS on a frozen client.
 *   the heads-up ladder  counts BACK from a date the LAW set, wants nothing
 *                        back, and a freeze does NOT stop it — a filing is
 *                        still due whatever the firm and the client are
 *                        arguing about.
 *
 * ── PUBLISHING, NOT SAVING ──────────────────────────────────────────────────
 *
 * The same two steps as `/admin/escalation-ladder`, `/catalogue` and
 * `/admin/verification`, and for a sharper reason than any of them: a
 * half-written ladder that started sending would send to somebody outside the
 * firm.
 *
 * ── AND NOTHING LEAVES THE BUILDING YET ─────────────────────────────────────
 *
 * There is no transport (P10 is Phase 7). A rung that fires RAISES a reminder
 * and the client's own portal shows it. The page says so once, at the top,
 * because a partner writing "A final reminder" is entitled to know that nobody
 * receives an email saying that.
 */

const KEY = "default";

interface Rung {
  key: string;
  days: number;
  label: string;
}

type Kind = "chaser" | "nudge";

/** Everything that differs between the two ladders, in one place — so the
 *  mechanism below is written once and neither ladder inherits a sentence that
 *  is only true of the other one. */
interface LadderSpec {
  kind: Kind;
  /** The field the days live in inside the stored body. The whole reason these
   *  are two kinds: one counts forward and one counts back, and a firm must
   *  never be asked to write a minus sign into a field called "after". */
  daysField: "afterDays" | "beforeDays";
  title: string;
  lede: ReactNode;
  /** Used in every `aria-label` on this section, because both forms can be open
   *  at once: without it, twenty controls and eight buttons answer to six
   *  names. The visible words never change. */
  rungNoun: string;
  rungNounCapitalised: string;
  ladderNoun: string;
  emptyTitle: string;
  emptyBody: string;
  daysLabel: string;
  /** The rule about the NUMBER — the sequence first, because that is the one
   *  that gets a ladder refused, and the meaning of 0 after it. One paragraph
   *  and not two: it is read once at the top of the form and pointed at from
   *  every rung, and two ideas about the same box are one answer. */
  daysHint: string;
  labelPlaceholder: string;
  keyPlaceholder: string;
  /** When a rung fires, in the firm's own words. */
  whenWords: (days: number) => string;
  /** The days a new rung starts at, given the ladder so far — ascending for one
   *  ladder and descending for the other, so "Add a rung" lands on a number the
   *  validator accepts rather than on a refusal. */
  nextDays: (rungs: Rung[]) => number;
}

const CHASER: LadderSpec = {
  kind: "chaser",
  daysField: "afterDays",
  title: "When we have asked and not had it back",
  lede: (
    <>
      Counted forward from the day the firm asked the client for something. A client whose
      reminders are <Link href="/clients">paused</Link> is not chased at all. You pause reminders
      on the client&rsquo;s own record, and the panel there shows these steps.
    </>
  ),
  rungNoun: "reminder",
  rungNounCapitalised: "Reminder",
  ladderNoun: "reminder ladder",
  emptyTitle: "No reminder ladder is published",
  emptyBody:
    "No client is reminded. If a client never answers a request, nobody is told, and somebody " +
    "has to spot it on the work board.",
  daysLabel: "How many days after we asked",
  daysHint:
    "The steps must go up in order, for example 3, then 7, then 15. A ladder written out of " +
    "order is not saved, so you can correct it. 0 means the same day you asked.",
  labelPlaceholder: "A gentle reminder",
  keyPlaceholder: "first",
  whenWords: (days) =>
    days === 0
      ? "The same day we asked"
      : `${String(days)} ${days === 1 ? "day" : "days"} after we asked`,
  nextDays: (rungs) => (rungs.length === 0 ? 3 : Math.max(...rungs.map((r) => r.days)) + 1),
};

const NUDGE: LadderSpec = {
  kind: "nudge",
  daysField: "beforeDays",
  title: "When a filing of theirs is coming up",
  lede: (
    <>
      Counted back from the legal due date on the{" "}
      <Link href="/calendar">compliance calendar</Link>. It is a heads-up only and asks the client
      for nothing. Pausing a client&rsquo;s reminders does not stop it, because the filing is
      still due.
    </>
  ),
  rungNoun: "heads-up",
  rungNounCapitalised: "Heads-up",
  ladderNoun: "heads-up ladder",
  emptyTitle: "No heads-up ladder is published",
  emptyBody:
    "No client is told that a filing is coming up. The date still shows on their portal, but " +
    "nothing draws their attention to it.",
  daysLabel: "How many days before it is due",
  daysHint:
    "The steps must count down to the deadline, for example 7, then 3, then 1. A ladder written " +
    "the other way round is not saved, so you can correct it. 0 means the day it is due.",
  labelPlaceholder: "A week to go",
  keyPlaceholder: "week",
  whenWords: (days) =>
    days === 0
      ? "The day it is due"
      : `${String(days)} ${days === 1 ? "day" : "days"} before it is due`,
  nextDays: (rungs) =>
    rungs.length === 0 ? 7 : Math.max(0, Math.min(...rungs.map((r) => r.days)) - 1),
};

/**
 * A stored body, read back. A malformed rung is DROPPED rather than defaulted —
 * the same fail-closed reading the domain takes, and for the same reason: a
 * rung whose days read as 0 because the number was unusable would tell a
 * partner this firm reminds its clients the instant it asks them anything.
 */
function readRungs(body: Record<string, unknown> | undefined, spec: LadderSpec): Rung[] {
  const raw = body?.["rungs"];
  if (!Array.isArray(raw)) return [];
  const rungs: Rung[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const days = r[spec.daysField];
    const key = r["key"];
    if (
      typeof key !== "string" ||
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < 0
    ) {
      continue;
    }
    const label = r["label"];
    rungs.push({
      key,
      days,
      label: typeof label === "string" && label.trim() !== "" ? label : key,
    });
  }
  // Sorted the way the ladder RUNS, so the table reads in the order a client
  // would experience it. The validator refuses a body written out of order, so
  // this only ever matters for one hand-edited earlier.
  return [...rungs].sort((a, b) => (spec.kind === "chaser" ? a.days - b.days : b.days - a.days));
}

export default function ClientRemindersPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Client reminders"
        lede="Set when your clients hear from the firm. There are two reminder ladders: one for something you asked for and have not received, and one for a filing of theirs that is coming up."
      />

      <Notice tone="neutral">
        <p>
          <strong>Nothing is sent until you publish a ladder, and nothing is set by default.</strong>{" "}
          Until then, no client is reminded of anything.
        </p>
        <p>
          <strong>Reminders are not emailed yet.</strong> When a step comes due, the reminder is
          raised and the client sees it on their own portal.
        </p>
      </Notice>

      <Ladder spec={CHASER} />
      <Ladder spec={NUDGE} />
    </Page>
  );
}

function Ladder({ spec }: { spec: LadderSpec }) {
  const router = useRouter();
  const [entry, setEntry] = useState<ConfigEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The form REPLACES the button that opens it, so focus has to be carried
  // across the swap by hand. See `useSwapFocus`.
  const { panel: editPanel, trigger: editTrigger } = useSwapFocus(editing);

  /**
   * THE REFUSAL LIVES IN THIS SECTION, not at the top of the page.
   *
   * Two ladders means the second form's Save sits a long way down, and the
   * sentence explaining the refusal — "rungs[1].beforeDays must be SMALLER than
   * the rung before it (3)" — is the only thing that says how to fix it. It
   * renders beside the form that caused it rather than under the other ladder's
   * name. Taking FOCUS is `ErrorNotice`'s own doing; see `useAppearFocus`.
   */
  function refuse(message: string): void {
    setError(message);
  }

  const load = useCallback(async (): Promise<void> => {
    const list = await api.GET("/api/v1/config/{kind}", {
      params: { path: { kind: spec.kind } },
    });
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setEntry(list.data.entries.find((e) => e.entry.key === KEY) ?? null);
    setError(null);
    setLoaded(true);
  }, [router, spec.kind]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function publish(version: number): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: spec.kind, key: KEY, version } },
    });
    setBusy(false);
    if (result.error) {
      refuse(apiError(result.error).message);
      return;
    }
    await load();
  }

  const inForce = readRungs(entry?.published?.body, spec);
  const draft = entry?.pendingDraft;
  const draftRungs = readRungs(draft?.body, spec);

  return (
    <Section title={spec.title} level={2}>
      <p className="lede">{spec.lede}</p>

      <ErrorNotice error={error} />

      {!loaded ? (
        <Loading label={`Loading the ${spec.ladderNoun}`} />
      ) : editing ? (
        <Card ref={editPanel} tabIndex={-1}>
          <CardTitle>{inForce.length === 0 ? "Write the ladder" : "A new version"}</CardTitle>
          <LadderForm
            spec={spec}
            initial={draftRungs.length > 0 ? draftRungs : inForce}
            isFirst={entry === null}
            onDone={() => {
              setEditing(false);
              void load();
            }}
            onCancel={() => {
              setEditing(false);
            }}
            onError={refuse}
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="row">
              <CardTitle>In force</CardTitle>
              <Button
                ref={editTrigger}
                size="sm"
                /* Both sections draw this button, and "New version" twice on one
                   page names neither of them. The visible word stays. */
                aria-label={
                  inForce.length === 0
                    ? `Write the ${spec.ladderNoun}`
                    : `A new version of the ${spec.ladderNoun}`
                }
                onClick={() => {
                  setEditing(true);
                }}
              >
                {inForce.length === 0 ? "Write the ladder" : "New version"}
              </Button>
            </div>
            {inForce.length === 0 ? (
              <Empty title={spec.emptyTitle} icon="alert">
                {spec.emptyBody}
              </Empty>
            ) : (
              <RungTable rungs={inForce} spec={spec} />
            )}
          </Card>

          {draft && (
            <Card>
              <div className="row">
                <div>
                  <CardTitle>
                    Draft <Pill tone="warn">not in force</Pill>
                  </CardTitle>
                  {/* A draft nobody published is a real state, and a firm needs
                      to see it rather than wonder why its edit did nothing. */}
                  <Sub>
                    Saved but not published. No client is being reminded on these numbers.
                  </Sub>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  aria-label={`Publish the ${spec.ladderNoun}`}
                  onClick={() => {
                    void publish(draft.version);
                  }}
                >
                  Publish
                </Button>
              </div>
              <RungTable rungs={draftRungs} spec={spec} />
            </Card>
          )}

          {/* Every reminder already sent carries the rung's short name, so a
              renamed rung does not rewrite the record. This says which LADDER
              was in force when it was sent. */}
          <ConfigHistory kind={spec.kind} entryKey={KEY} name={`the ${spec.ladderNoun}`} />
        </>
      )}
    </Section>
  );
}

function RungTable({ rungs, spec }: { rungs: Rung[]; spec: LadderSpec }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Called</Th>
            <Th>Kept on the record as</Th>
          </tr>
        </thead>
        <tbody>
          {rungs.map((r) => (
            <tr key={r.key}>
              <Td>{spec.whenWords(r.days)}</Td>
              <Td>
                <Pill tone="quiet">{r.label}</Pill>
              </Td>
              <Td>
                <span className="mono">{r.key}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function LadderForm({
  spec,
  initial,
  isFirst,
  onDone,
  onCancel,
  onError,
}: {
  spec: LadderSpec;
  initial: Rung[];
  isFirst: boolean;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [rungs, setRungs] = useState<Rung[]>(initial);
  const [busy, setBusy] = useState(false);
  /*
   * THE HINTS ARE POINTED AT BY HAND, and that is not a shortcut around
   * `<Field hint>`.
   *
   * A hint rendered INSIDE a field is a column of `.field-row`, which is
   * `align-items: end` — the field carrying it stands taller and its input
   * rides up above the ones beside it. So both paragraphs sit under the row,
   * and both are wired: one describes the number, the other describes TWO
   * fields at once, which is the case `<Field hint>` cannot express at all.
   *
   * ONE PARAGRAPH PER FORM, NOT PER RUNG, and that is a correction made by
   * looking at it. Both sentences are the same for every rung — unlike
   * `/admin/escalation-ladder`, whose hints change with the watch a rung is on
   * — so repeating them under each one printed the identical two lines three
   * times in a form and six times on a page. They are stated once at the top,
   * and every rung's controls point at them: an id may be referenced by any
   * number of elements, and a rule that does not change per rung should not be
   * re-read per rung either.
   */
  const uid = useId();

  function update(index: number, patch: Partial<Rung>): void {
    setRungs((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function add(): void {
    setRungs((rs) => [...rs, { key: "", label: "", days: spec.nextDays(rs) }]);
  }

  async function save(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    onError("");
    const body = {
      rungs: rungs.map((r) => ({
        key: r.key.trim(),
        label: r.label.trim(),
        [spec.daysField]: r.days,
      })),
    };
    const result = isFirst
      ? await api.POST("/api/v1/config/{kind}", {
          params: { path: { kind: spec.kind } },
          body: { key: KEY, body },
        })
      : await api.POST("/api/v1/config/{kind}/{key}/versions", {
          params: { path: { kind: spec.kind, key: KEY } },
          body: { body },
        });
    setBusy(false);
    if (result.error) {
      // Verbatim. The validator names the rung, the field and what was wrong,
      // and a local "invalid ladder" would throw away the only sentence that
      // says how to fix it.
      onError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  const incomplete =
    rungs.length === 0 || rungs.some((r) => r.key.trim() === "" || r.label.trim() === "");

  return (
    <div style={{ marginTop: "var(--s-4)" }}>
      <p className="field-hint" id={`${uid}-days`}>
        {spec.daysHint}
      </p>
      <p className="field-hint" id={`${uid}-naming`}>
        The name is what your colleagues see on a request&rsquo;s history. The short name is stored
        on every reminder this step has sent, so renaming the step later does not change old
        reminders. Changing the short name makes it a new step with no history.
      </p>

      {rungs.map((rung, index) => (
        /*
         * A <fieldset> so each rung's fields are a named GROUP, and the group
         * names the LADDER as well as the rung: both forms can be open at once,
         * and "What to call this rung" three times beside "What to call this
         * rung" three times is a page of controls under six names.
         *
         * `aria-label` rather than a <legend>, so nothing visible appears on a
         * card that did not ask for one. `.card` alone and NOT `card fieldset`:
         * `.fieldset` is declared after `.card` at the same specificity, so its
         * `border: 0; padding: 0` would win on order and strip the card.
         *
         * Positional, not `rung.key`: the short name is a box inside this very
         * group, so naming the group after it renames the group on every
         * keystroke.
         */
        <fieldset
          key={index}
          className="card"
          aria-label={`${spec.rungNounCapitalised} step ${String(index + 1)}`}
          style={{ marginTop: "var(--s-4)" }}
        >
          <FieldRow>
            <Field label={spec.daysLabel}>
              <Input
                type="number"
                min={0}
                aria-describedby={`${uid}-days`}
                value={rung.days}
                onChange={(e) => {
                  update(index, { days: Number(e.target.value) });
                }}
              />
            </Field>
            <Field label="What to call this step">
              <Input
                aria-describedby={`${uid}-naming`}
                value={rung.label}
                placeholder={spec.labelPlaceholder}
                onChange={(e) => {
                  update(index, { label: e.target.value });
                }}
              />
            </Field>
            <Field label="Short name">
              <Input
                aria-describedby={`${uid}-naming`}
                value={rung.key}
                placeholder={spec.keyPlaceholder}
                onChange={(e) => {
                  update(index, { key: e.target.value });
                }}
              />
            </Field>
          </FieldRow>
          {/* Its own line, not a column of the row: a `minmax(12rem, 1fr)`
              column stretches a button into a banner. */}
          <div className="row">
            <span />
            <Button
              variant="ghost"
              size="sm"
              /* Named itself. A group's name is announced on ENTERING the group
                 and is not prepended to a button, so six identical "Remove this
                 rung" across two open forms name nothing. */
              aria-label={`Remove ${spec.rungNoun} step ${String(index + 1)}`}
              onClick={() => {
                setRungs((rs) => rs.filter((_, i) => i !== index));
              }}
            >
              Remove this step
            </Button>
          </div>
        </fieldset>
      ))}

      <div className="row" style={{ marginTop: "var(--s-4)" }}>
        <span className="cluster tight">
          <Button variant="ghost" aria-label={`Add a ${spec.rungNoun} step`} onClick={add}>
            Add a step
          </Button>
        </span>
        <span className="cluster tight">
          <Button
            variant="ghost"
            aria-label={`Leave the ${spec.ladderNoun} as it is`}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || incomplete}
            aria-label={`Save the ${spec.ladderNoun} as a draft`}
            onClick={() => {
              void save();
            }}
          >
            {busy ? "Saving…" : "Save as a draft"}
          </Button>
        </span>
      </div>
      <p className="field-hint">
        Saving creates a draft. Nothing is sent from a draft until you publish it. The ladder in
        force is the one published last.
      </p>
    </div>
  );
}
