"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, StaffGrade } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Notice,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  useSwapFocus,
} from "@/components/ui";

/**
 * When the firm hears that its own work has gone quiet (T4.5).
 *
 * ── WHY THIS SCREEN IS THE FEATURE ──────────────────────────────────────────
 *
 * The sweep is twenty lines of arithmetic over dates the product already holds.
 * What makes it worth anything is that the NUMBERS are the firm's — and nothing
 * is set by default, on purpose. A ladder this product invented would fire on
 * thresholds nobody agreed to, and the failure mode of that is not noise: it
 * teaches everybody to ignore the one queue whose entire value is being
 * believed. So a firm with no ladder escalates nobody, and the queue on
 * `/work-items` says exactly that rather than looking empty and healthy.
 *
 * ── THE THREE WATCHES ARE THREE DIFFERENT PROBLEMS ──────────────────────────
 *
 * Past the promised turnaround · nobody has picked it up · past our own target
 * on a filing. Each is anchored to a date the product ALREADY holds, and that
 * is the constraint that keeps the whole feature honest — an escalation counted
 * from a deadline this software made up would be one nobody could argue with or
 * check. There is no "add a date" here and there must not be.
 *
 * ── PUBLISHING, NOT SAVING ──────────────────────────────────────────────────
 *
 * The same two steps `/catalogue`, `/admin/workflows` and `/admin/verification`
 * use. A draft is not in force and the card says which is which — and unlike a
 * role, a ladder is written over several sittings and a half-written one must
 * not start telling partners things.
 *
 * Editing it later is safe in the one way that matters: a notice already raised
 * carries the threshold it fired at, copied onto the row, so shortening the
 * ladder tomorrow cannot make yesterday's escalation look early.
 */

const KEY = "default";

/** The three things a rung can watch, with what each one MEANS to a reader. The
 *  values are the API's closed set; a rung naming anything else is refused at
 *  the write, which is where it should be. */
const WATCHES = [
  {
    value: "work_item_due",
    label: "A task is past its due date",
    detail:
      "The turnaround the client was promised, copied onto the task when it was created. A task " +
      "whose service states no turnaround has no due date at all and this watch skips it.",
  },
  {
    value: "work_item_unassigned",
    label: "Nobody has picked a task up",
    detail:
      "Counted from the day it appeared. The router leaves a task unassigned rather than " +
      "guessing a SPOC, so this is the queue that quietly grows when a client has none.",
  },
  {
    value: "obligation_target",
    label: "A filing is past our own target",
    detail:
      "The T–X date on the compliance calendar, while the statutory date is still ahead. This " +
      "is the warning that exists so a deadline is never actually missed — once the statutory " +
      "date passes, the filing goes to the partner decision queue instead.",
  },
] as const;

const TARGETS = [
  {
    value: "assignee",
    label: "Whoever holds it",
    detail: "A nudge rather than an escalation. Nothing happens if nobody holds it.",
  },
  {
    value: "manager",
    label: "Their manager",
    detail:
      "Read from who reports to whom on the roster. Somebody with no manager recorded there " +
      "means this rung reaches nobody — the queue says so on the row rather than going quiet.",
  },
  {
    value: "grade_at_least",
    // SHORT, because choosing it adds a fourth column to the row and the select
    // narrows: "Everybody at a grade and above" rendered as "Everybody at a
    // grade and abo". Found by opening the form, not by typechecking it.
    label: "A grade and above",
    detail:
      "Not one person — the whole rung sees it. An escalation sent to a single partner is one " +
      "that dies while that partner is on leave.",
  },
] as const;

type Watch = (typeof WATCHES)[number]["value"];
type Target = (typeof TARGETS)[number]["value"];

interface Rung {
  key: string;
  label: string;
  watch: Watch;
  afterDays: number;
  notify: Target;
  minGradeRank: number | null;
}

function readRungs(body: Record<string, unknown> | undefined): Rung[] {
  const raw = body?.["rungs"];
  if (!Array.isArray(raw)) return [];
  const rungs: Rung[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const watch = r["watch"];
    const notify = r["notify"];
    if (typeof watch !== "string" || !WATCHES.some((w) => w.value === watch)) continue;
    if (typeof notify !== "string" || !TARGETS.some((t) => t.value === notify)) continue;
    rungs.push({
      key: typeof r["key"] === "string" ? r["key"] : "",
      label: typeof r["label"] === "string" ? r["label"] : "",
      watch: watch as Watch,
      afterDays: typeof r["afterDays"] === "number" ? r["afterDays"] : 0,
      notify: notify as Target,
      minGradeRank: typeof r["minGradeRank"] === "number" ? r["minGradeRank"] : null,
    });
  }
  return rungs;
}

export default function EscalationLadderPage() {
  const router = useRouter();
  const [entry, setEntry] = useState<ConfigEntry | null>(null);
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The ladder form REPLACES the button that opens it, so focus has to be
  // carried across the swap by hand. See `useSwapFocus`.
  const { panel: editPanel, trigger: editTrigger } = useSwapFocus(editing);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass. The ladder is not decoration: a rung addressed to a
    // grade is chosen BY GRADE and stored as the rank, so a screen without the
    // firm's own ladder would be asking a partner to type a number.
    const [list, ladder] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "escalation" } } }),
      api.GET("/api/v1/tenancy/grades", {}),
    ]);
    if (list.response.status === 401 || ladder.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setEntry(list.data.entries.find((e) => e.entry.key === KEY) ?? null);
    // A failure here is not fatal — an admin can still read the ladder. It only
    // stops a NEW grade rung being written, and the form says so rather than
    // offering an empty picker.
    if (!ladder.error) setGrades(ladder.data.grades);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function publish(version: number): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "escalation", key: KEY, version } },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  if (!loaded) return <Loading label="Loading the ladder" />;

  const inForce = readRungs(entry?.published?.body);
  const draft = entry?.pendingDraft;
  const draftRungs = readRungs(draft?.body);

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Escalation ladder"
        lede={
          <>
            When the firm hears that its own work has gone quiet. What is escalated shows on the{" "}
            <Link href="/work-items">work board</Link>, under Escalated.
          </>
        }
      />

      <ErrorNotice error={error} />

      <Notice tone="neutral">
        <p>
          <strong>Nothing here fires until you publish it, and nothing is set by default.</strong>{" "}
          A firm with no ladder escalates nobody — which is deliberate, because a threshold this
          product invented would be one nobody agreed to. Editing the ladder later is safe: every
          notice keeps the threshold it actually fired at, so shortening a rung tomorrow cannot
          make yesterday&rsquo;s escalation look early.
        </p>
      </Notice>

      {editing ? (
        <Card ref={editPanel} tabIndex={-1}>
          <h2 className="card-title">{inForce.length === 0 ? "Write the ladder" : "A new version"}</h2>
          <LadderForm
            initial={draftRungs.length > 0 ? draftRungs : inForce}
            grades={grades}
            isFirst={entry === null}
            onDone={() => {
              setEditing(false);
              void load();
            }}
            onCancel={() => { setEditing(false); }}
            onError={setError}
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="row">
              <h2 className="card-title">In force</h2>
              <Button ref={editTrigger} size="sm" onClick={() => { setEditing(true); }}>
                {inForce.length === 0 ? "Write the ladder" : "New version"}
              </Button>
            </div>
            {inForce.length === 0 ? (
              <Empty title="No ladder is published" icon="alert">
                Nothing is being watched. Until a rung is published, an overdue task and a filing
                past its internal target both pass in silence.
              </Empty>
            ) : (
              <RungTable rungs={inForce} grades={grades} />
            )}
          </Card>

          {draft && (
            <Card>
              <div className="row">
                <div>
                  <h2 className="card-title">
                    Draft <Pill tone="warn">not in force</Pill>
                  </h2>
                  {/* A draft that was never published is a real state, and a
                      firm needs to see it rather than wonder why its edit did
                      nothing. /catalogue makes the same point. */}
                  <Sub>Written and not published — nothing is escalating on these numbers.</Sub>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => { void publish(draft.version); }}
                >
                  Publish
                </Button>
              </div>
              <RungTable rungs={draftRungs} grades={grades} />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}

function RungTable({ rungs, grades }: { rungs: Rung[]; grades: StaffGrade[] }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>After</Th>
            <Th>Who hears</Th>
            <Th>Called</Th>
          </tr>
        </thead>
        <tbody>
          {rungs.map((r) => (
            <tr key={r.key}>
              <Td>{WATCHES.find((w) => w.value === r.watch)?.label ?? r.watch}</Td>
              <Td>
                <span className="mono">{r.afterDays}</span> {r.afterDays === 1 ? "day" : "days"}
              </Td>
              <Td>{targetWords(r, grades)}</Td>
              <Td>
                <Pill tone="quiet">{r.label}</Pill>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** Who a rung reaches, in the firm's own words. A rank is shown as the GRADE
 *  that holds it where one does — a partner reads "Partner and above", not
 *  "rank 40" — and falls back to the number when the ladder has moved under it,
 *  because the stored rank is what the sweep actually compares. */
function targetWords(rung: Rung, grades: StaffGrade[]): string {
  if (rung.notify === "assignee") return "Whoever holds it";
  if (rung.notify === "manager") return "Their manager";
  const named = grades
    .filter((g) => rung.minGradeRank !== null && g.rank === rung.minGradeRank)
    .map((g) => g.name)[0];
  return named !== undefined
    ? `${named} and above`
    : `Grade rank ${String(rung.minGradeRank ?? 0)} and above`;
}

function LadderForm({
  initial,
  grades,
  isFirst,
  onDone,
  onCancel,
  onError,
}: {
  initial: Rung[];
  grades: StaffGrade[];
  isFirst: boolean;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [rungs, setRungs] = useState<Rung[]>(initial);
  const [busy, setBusy] = useState(false);

  // Retired rungs are not offered. Somebody who holds one keeps it and still
  // satisfies a threshold written against it — that is the point of retiring
  // rather than deleting — but writing a NEW rung against a grade the firm has
  // moved on from is a stale choice nobody meant.
  const offered = grades.filter((g) => g.isActive);

  function update(index: number, patch: Partial<Rung>): void {
    setRungs((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function add(): void {
    setRungs((rs) => [
      ...rs,
      {
        key: `rung-${String(rs.length + 1)}`,
        label: "",
        watch: "work_item_due",
        afterDays: 1,
        notify: "assignee",
        minGradeRank: null,
      },
    ]);
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
        watch: r.watch,
        afterDays: r.afterDays,
        notify: r.notify,
        // The RANK, resolved from the grade the firm picked, because a
        // published body is frozen and re-resolving a code later would answer
        // an old question with today's ladder. `/admin/verification` stores it
        // the same way, for the same reason.
        ...(r.notify === "grade_at_least" ? { minGradeRank: r.minGradeRank } : {}),
      })),
    };
    const result = isFirst
      ? await api.POST("/api/v1/config/{kind}", {
          params: { path: { kind: "escalation" } },
          body: { key: KEY, body },
        })
      : await api.POST("/api/v1/config/{kind}/{key}/versions", {
          params: { path: { kind: "escalation", key: KEY } },
          body: { body },
        });
    setBusy(false);
    if (result.error) {
      // Verbatim. The validator names the rung, the field and what was wrong —
      // "rungs[2].afterDays must be greater than the rung before it on the same
      // watch (3)" — and a local "invalid ladder" would throw away the only
      // sentence that says how to fix it.
      onError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  const incomplete =
    rungs.length === 0 ||
    rungs.some(
      (r) =>
        r.key.trim() === "" ||
        r.label.trim() === "" ||
        (r.notify === "grade_at_least" && r.minGradeRank === null),
    );

  return (
    <div style={{ marginTop: "var(--s-4)" }}>
      {rungs.map((rung, index) => (
        /*
         * A <fieldset> so each rung's fields are a named GROUP.
         *
         * Measured with the form open: 37 controls answering to five names —
         * "When", "After how many days", "Who hears about it", "What to call
         * this rung" and "Short name", each SEVEN times, once per rung. Every
         * one of those names is right and none of them says which rung.
         *
         * `aria-label` rather than a <legend>, so no visible caption appears on
         * a card that did not ask for one. `.card` alone and NOT `card
         * fieldset`: `.fieldset` is declared after `.card` in components.css at
         * the same specificity, so its `border: 0; padding: 0` would win on
         * order and strip the card. `.card` already carries the `min-width: 0`
         * a <fieldset> needs.
         *
         * Positional, not `rung.key`: the short name is one of the fields
         * inside, so naming the group after it would rename the group as
         * somebody types into it.
         */
        <fieldset
          key={index}
          className="card"
          aria-label={`Rung ${String(index + 1)}`}
          style={{ marginTop: "var(--s-4)" }}
        >
          <FieldRow>
            <Field label="When">
              <Select
                value={rung.watch}
                onChange={(e) => {
                  const watch = e.target.value as Watch;
                  // The one combination that can never do anything: watching
                  // unassigned work and notifying its assignee — there is never
                  // one, which is what "unassigned" means. The API refuses it;
                  // moving off it here means a partner meets a working form
                  // rather than a rejection.
                  update(index, {
                    watch,
                    ...(watch === "work_item_unassigned" && rung.notify === "assignee"
                      ? { notify: "manager" as Target }
                      : {}),
                  });
                }}
              >
                {WATCHES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="After how many days">
              <Input
                type="number"
                min={0}
                value={rung.afterDays}
                onChange={(e) => { update(index, { afterDays: Number(e.target.value) }); }}
              />
            </Field>
            <Field label="Who hears about it">
              <Select
                value={rung.notify}
                onChange={(e) => {
                  const notify = e.target.value as Target;
                  update(index, {
                    notify,
                    minGradeRank: notify === "grade_at_least" ? rung.minGradeRank : null,
                  });
                }}
              >
                {TARGETS.filter(
                  (t) => !(rung.watch === "work_item_unassigned" && t.value === "assignee"),
                ).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            {rung.notify === "grade_at_least" && (
              <Field label="From which grade">
                <Select
                  value={rung.minGradeRank === null ? "" : String(rung.minGradeRank)}
                  onChange={(e) => {
                    update(index, {
                      minGradeRank: e.target.value === "" ? null : Number(e.target.value),
                    });
                  }}
                >
                  <option value="">Choose a grade…</option>
                  {offered.map((g) => (
                    <option key={g.id} value={g.rank}>
                      {g.name} and above
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FieldRow>
          {/* The hint goes UNDER the row, never inside a column of it:
              `.field-row` is align-items:end, so a field carrying a hint stands
              taller and its input rides up above the ones beside it. This app
              has learnt that twice. */}
          {/* TWO facts, kept apart. Concatenated they read as one run-on
              paragraph about nothing in particular — what the rung WATCHES and
              who it TELLS are separate answers and a reader is checking one at
              a time. */}
          <p className="field-hint">
            {WATCHES.find((w) => w.value === rung.watch)?.detail}
          </p>
          <p className="field-hint">
            {TARGETS.find((t) => t.value === rung.notify)?.detail}
          </p>

          {/* NO HINTS INSIDE THIS ROW. `.field-row` is `align-items: end`, so a
              field carrying a hint stands taller and its INPUT rides up above
              the ones beside it — two boxes at two different heights. This app
              has now made that mistake three times and this one was caught by
              opening the page, exactly as the other two were. */}
          <FieldRow>
            <Field label="What to call this rung">
              <Input
                value={rung.label}
                placeholder="Tell their manager"
                onChange={(e) => { update(index, { label: e.target.value }); }}
              />
            </Field>
            <Field label="Short name">
              <Input
                value={rung.key}
                placeholder="manager"
                onChange={(e) => { update(index, { key: e.target.value }); }}
              />
            </Field>
          </FieldRow>
          <p className="field-hint">
            The rung&rsquo;s NAME is what somebody reads on the queue. Its short name is kept on
            every notice this rung has ever raised, so renaming the one does not rewrite the
            other.
          </p>
          {/* Its own line, not a column of the row. The reason written here
              before was wrong in its detail — `.field-row` is a GRID, not
              flex, and `flex: 1 1 160px` on its children is read by nothing —
              but the conclusion held: a `minmax(12rem, 1fr)` column stretches
              a button into a banner just as surely. */}
          <div className="row">
            <span />
            <Button
              variant="ghost"
              size="sm"
              /* Seven identical "Remove this rung". A group's name is announced
                 on entering the group and is not prepended to a button, so this
                 one is named itself — it is the press that destroys work. */
              aria-label={`Remove rung ${String(index + 1)}`}
              onClick={() => { setRungs((rs) => rs.filter((_, i) => i !== index)); }}
            >
              Remove this rung
            </Button>
          </div>
        </fieldset>
      ))}

      {grades.length === 0 && (
        <Notice tone="warn">
          <p>
            This firm has no grade ladder, so a rung cannot be addressed to a grade. Set one up on{" "}
            <Link href="/admin/grades">Grades</Link> first.
          </p>
        </Notice>
      )}

      <div className="row" style={{ marginTop: "var(--s-4)" }}>
        <span className="cluster tight">
          <Button variant="ghost" onClick={add}>
            Add a rung
          </Button>
        </span>
        <span className="cluster tight">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy || incomplete} onClick={() => { void save(); }}>
            {busy ? "Saving…" : "Save as a draft"}
          </Button>
        </span>
      </div>
      <p className="field-hint">
        Saving writes a draft. Nothing escalates on it until it is published — the ladder in force
        is whatever was published last.
      </p>
    </div>
  );
}
