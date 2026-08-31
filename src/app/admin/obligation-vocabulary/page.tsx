"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ObligationState, ResolutionOption } from "@/lib/api/client";
import { TableWrap, Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

/**
 * The firm's own words for its compliance calendar (T3.3).
 *
 * ── THIS SCREEN IS TWO YEARS OF PROMISE FINALLY KEPT ────────────────────────
 *
 * The obligation states have been ROWS since T3.2, held that way precisely so a
 * firm could rename them — and nothing could write them. Every refusal in the
 * product saying "mark another state as the missed one" was describing a
 * control that did not exist. The work board got `/admin/work-vocabulary`; this
 * vocabulary got nothing, and T3.3 adding two more flags and a whole new list
 * is what made the gap impossible to leave alone.
 *
 * ── THE TICK BOXES ARE MECHANISM, NOT LABELS ────────────────────────────────
 *
 * Every rule in this product reads these flags and never the name beside them,
 * which is exactly what makes renaming safe — and it is not hypothetical: the
 * app this was rebuilt from looked its states up by the literal strings
 * 'pending' and 'missed', so the first rename would have switched the nightly
 * sweep off in silence.
 *
 * Four of the boxes are DESTINATIONS — "a filing moves HERE when X happens" —
 * and a firm holds exactly one of each:
 *
 *   Starts here     where a generated filing begins.
 *   Filed here      where one lands when the work is finished.
 *   Missed here     where one goes when its legal deadline passes unfiled.
 *   Decided here    where one ends when a partner says it will never be filed.
 *
 * Two are DESCRIPTIONS of what is true once a filing is there — finished, and
 * needs a decision — and any number of states may carry those.
 *
 * ── WHAT IT REFUSES, AND WHY EACH REFUSAL NAMES A CONSEQUENCE ───────────────
 *
 * Unticking a destination would leave the firm with nowhere for something to
 * go, and each one breaks a different mechanism in silence: no starting state
 * and nothing can be generated, no missed state and no deadline ever reaches a
 * partner again. So the API refuses, and its message says what stops working —
 * and the move that DOES work is marking another one, which moves the flag in a
 * single step with no moment in between.
 *
 * There is no Delete, because there is no delete endpoint and no DELETE grant
 * behind it. A retired state is still carried by every filing sitting in it,
 * and a retired resolution option still EXPLAINS every decision recorded
 * against it.
 */
export default function ObligationVocabularyPage() {
  const router = useRouter();
  const [states, setStates] = useState<ObligationState[]>([]);
  const [options, setOptions] = useState<ResolutionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/obligation-vocabulary", {});
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setStates(result.data.states);
    setOptions(result.data.resolutionOptions);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      // The API's own sentence. It names which tick to move and what would stop
      // working — a partner rearranging their own vocabulary needs that, not a
      // constraint name.
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  if (!loaded) return <p className="muted">Loading&hellip;</p>;

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Compliance states and decisions"
        lede="The words your firm uses on its compliance calendar. Rename any of them, add your own, or change what they mean — the product reads the TICK BOXES and never the names, so nothing breaks when you rename one."
      />
      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      <div className="card">
        <h2 className="card-title">States a filing moves through</h2>
        <p className="field-hint">
          The four columns on the right are <strong>destinations</strong> &mdash; where a filing
          goes when something happens to it. Your firm has exactly one of each, and marking
          another moves it in one step.
        </p>
        <TableWrap>
          <table className="table">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th style={{ width: 90 }}>Order</Th>
              <Th>Finished</Th>
              <Th>Needs a decision</Th>
              <Th>Starts here</Th>
              <Th>Filed here</Th>
              <Th>Missed here</Th>
              <Th>Decided here</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {states.map((s) => (
              <tr key={s.id} data-inactive={!s.isActive}>
                <Td>
                  <CommitText
                    key={`${s.id}:${s.name}`}
                    value={s.name}
                    label="State name"
                    disabled={busy === s.id}
                    onCommit={(name) => {
                      void act(s.id, () => patchState(s.id, { name }));
                    }}
                  />
                </Td>
                {/* The code never changes. It is the firm's stable handle, and
                    an audit event that recorded it would stop resolving if it
                    moved. Nothing in the product compares it, which is what
                    makes the NAME free to change. */}
                <Td className="mono muted">{s.code}</Td>
                <Td>
                  <CommitNumber
                    key={`${s.id}:${String(s.sortOrder)}`}
                    value={s.sortOrder}
                    label="Sort order"
                    disabled={busy === s.id}
                    onCommit={(sortOrder) => {
                      void act(s.id, () => patchState(s.id, { sortOrder }));
                    }}
                  />
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${s.name} means finished`}
                    checked={s.isTerminal}
                    disabled={busy === s.id}
                    onChange={(e) => {
                      void act(s.id, () => patchState(s.id, { isTerminal: e.target.checked }));
                    }}
                  />
                </Td>
                {/* The one that puts a filing in front of a person. It is also
                    what makes "missed here" legal on this row — the API refuses
                    a missed state that asks nobody, because every overdue
                    filing would move there and be seen by no one. */}
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${s.name} needs somebody to decide what happens next`}
                    checked={s.needsDecision}
                    disabled={busy === s.id || s.isTerminal}
                    title={
                      s.isTerminal
                        ? "A finished state is not waiting on anybody."
                        : "A filing here waits for a person to choose what happens next."
                    }
                    onChange={(e) => {
                      void act(s.id, () => patchState(s.id, { needsDecision: e.target.checked }));
                    }}
                  />
                </Td>
                {/* RADIOS, not checkboxes, for all four destinations. A firm
                    holds exactly one of each, and a radio says that before
                    anybody clicks — a checkbox that refuses to be unticked
                    reads as broken. Marking another one clears the previous
                    holder in the same statement, so there is never a moment
                    where the firm has none. */}
                <DestinationCell
                  name="initial"
                  state={s}
                  checked={s.isInitial}
                  busy={busy === s.id}
                  legal={!s.isTerminal && !s.needsDecision}
                  why="New filings would be created already finished, or already in the decision queue."
                  onPick={() => { void act(s.id, () => patchState(s.id, { isInitial: true })); }}
                />
                <DestinationCell
                  name="filed"
                  state={s}
                  checked={s.isFiled}
                  busy={busy === s.id}
                  legal={s.isTerminal}
                  why="Only a finished state can be where a completed filing lands."
                  onPick={() => { void act(s.id, () => patchState(s.id, { isFiled: true })); }}
                />
                <DestinationCell
                  name="missed"
                  state={s}
                  checked={s.isMissed}
                  busy={busy === s.id}
                  legal={s.needsDecision}
                  why="Tick 'needs a decision' first, or an overdue filing would move here and nobody would be asked about it."
                  onPick={() => { void act(s.id, () => patchState(s.id, { isMissed: true })); }}
                />
                <DestinationCell
                  name="resolution"
                  state={s}
                  checked={s.isResolution}
                  busy={busy === s.id}
                  legal={s.isTerminal}
                  why="Only a finished state can be where a partner's decision ends a filing."
                  onPick={() => { void act(s.id, () => patchState(s.id, { isResolution: true })); }}
                />
                <Td>
                  {s.isActive ? (
                    <span className="pill" data-tone="accent">in use</span>
                  ) : (
                    <span className="pill">retired</span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    className="pill"
                    disabled={busy === s.id}
                    onClick={() => {
                      void act(s.id, () => patchState(s.id, { isActive: !s.isActive }));
                    }}
                  >
                    {s.isActive ? "Retire" : "Bring back"}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableWrap>
        <AddState
          busy={busy !== null}
          onAdd={(body) => {
            void act("new-state", () =>
              api.POST("/api/v1/obligation-vocabulary/states", { body }),
            );
          }}
        />
      </div>

      <div className="card">
        <h2 className="card-title">
          What may be decided about a missed deadline
        </h2>
        <p className="field-hint">
          When a legal deadline passes with nothing filed, a partner picks one of these and
          writes down <strong>why</strong>. The list is yours &mdash; and the four below came
          from the app this replaced, so they are marked{" "}
          <em>unconfirmed</em> until somebody here says they are right.
        </p>
        <TableWrap>
          <table className="table">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th style={{ width: 90 }}>Order</Th>
              <Th>What it does</Th>
              <Th>Confirmed</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.id} data-inactive={!o.isActive}>
                <Td>
                  <CommitText
                    key={`${o.id}:${o.name}`}
                    value={o.name}
                    label="Option name"
                    disabled={busy === o.id}
                    onCommit={(name) => {
                      void act(o.id, () => patchOption(o.id, { name }));
                    }}
                  />
                </Td>
                <Td className="mono muted">{o.code}</Td>
                <Td>
                  <CommitNumber
                    key={`${o.id}:${String(o.sortOrder)}`}
                    value={o.sortOrder}
                    label="Sort order"
                    disabled={busy === o.id}
                    onCommit={(sortOrder) => {
                      void act(o.id, () => patchOption(o.id, { sortOrder }));
                    }}
                  />
                </Td>
                {/* THE FORK, and it is a sentence rather than a tick box
                    labelled `closesWithoutFiling`. The two answers are the
                    whole design: one keeps the filing owed and sends the work
                    back, the other ends it forever. A partner picking an option
                    on the calendar should never have to know which is which. */}
                <Td>
                  <select
                    value={o.closesWithoutFiling ? "closes" : "refiles"}
                    aria-label={`What ${o.name} does to the filing`}
                    disabled={busy === o.id}
                    onChange={(e) => {
                      void act(o.id, () =>
                        patchOption(o.id, { closesWithoutFiling: e.target.value === "closes" }),
                      );
                    }}
                  >
                    <option value="refiles">The filing still happens, late</option>
                    <option value="closes">It will never be filed</option>
                  </select>
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${o.name} is confirmed by this firm`}
                    checked={o.status === "confirmed"}
                    disabled={busy === o.id}
                    title="Tick when somebody here has confirmed this really is one of your firm's answers."
                    onChange={(e) => {
                      void act(o.id, () =>
                        patchOption(o.id, {
                          status: e.target.checked ? "confirmed" : "unconfirmed",
                        }),
                      );
                    }}
                  />
                </Td>
                <Td>
                  {o.isActive ? (
                    <span className="pill" data-tone="accent">in use</span>
                  ) : (
                    <span className="pill">retired</span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    className="pill"
                    disabled={busy === o.id}
                    onClick={() => {
                      void act(o.id, () => patchOption(o.id, { isActive: !o.isActive }));
                    }}
                  >
                    {o.isActive ? "Retire" : "Bring back"}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableWrap>
        <AddOption
          busy={busy !== null}
          onAdd={(body) => {
            void act("new-option", () =>
              api.POST("/api/v1/obligation-vocabulary/resolution-options", { body }),
            );
          }}
        />
        {/* Said here rather than refused on the calendar with no explanation.
            Unlike the states there is deliberately no floor — the shipped four
            are somebody else's list and this firm's answer may be none of
            them — so an empty list is allowed and simply means nothing can be
            decided until one exists. */}
        {options.filter((o) => o.isActive).length === 0 && (
          <p className="notice" data-tone="danger" role="alert">
            You have no options in use, so nothing on the decision queue can be resolved.
          </p>
        )}
      </div>
    </Page>
  );
}

/**
 * One of the four destination radios.
 *
 * DISABLED rather than hidden when the flags would contradict, and the title
 * says why — the API refuses these pairs, and a control that vanishes reads as
 * a bug while one that explains itself reads as a rule.
 */
function DestinationCell({
  name,
  state,
  checked,
  busy,
  legal,
  why,
  onPick,
}: {
  name: string;
  state: ObligationState;
  checked: boolean;
  busy: boolean;
  legal: boolean;
  why: string;
  onPick: () => void;
}) {
  return (
    <Td>
      <input
        type="radio"
        name={name}
        aria-label={`${state.name} is the ${name} state`}
        checked={checked}
        disabled={busy || !state.isActive || (!legal && !checked)}
        title={legal ? undefined : why}
        onChange={onPick}
      />
    </Td>
  );
}

function patchState(
  stateId: string,
  body: {
    name?: string;
    sortOrder?: number;
    isTerminal?: boolean;
    needsDecision?: boolean;
    isInitial?: boolean;
    isFiled?: boolean;
    isMissed?: boolean;
    isResolution?: boolean;
    isActive?: boolean;
  },
): Promise<{ error?: unknown }> {
  return api.PATCH("/api/v1/obligation-vocabulary/states/{stateId}", {
    params: { path: { stateId } },
    body,
  });
}

function patchOption(
  optionId: string,
  body: {
    name?: string;
    sortOrder?: number;
    closesWithoutFiling?: boolean;
    status?: "unconfirmed" | "confirmed";
    isActive?: boolean;
  },
): Promise<{ error?: unknown }> {
  return api.PATCH("/api/v1/obligation-vocabulary/resolution-options/{optionId}", {
    params: { path: { optionId } },
    body,
  });
}

function CommitText({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  // Seeded once. The caller gives this a `key` derived from the committed
  // value, so a successful rename remounts it rather than syncing back through
  // an effect that would fight the user's typing.
  const [draft, setDraft] = useState(value);

  function commit(): void {
    const next = draft.trim();
    if (next === "" || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  }

  return (
    <input
      className="input"
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** The same, for a whole number. */
function CommitNumber({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  label: string;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  function commit(): void {
    const next = Number(draft);
    if (!Number.isInteger(next) || next === value) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  }

  return (
    <input
      className="input"
      value={draft}
      disabled={disabled}
      aria-label={label}
      inputMode="numeric"
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

function AddState({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (body: {
    code: string;
    name: string;
    sortOrder: number;
    isTerminal: boolean;
    needsDecision: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("60");
  const [isTerminal, setIsTerminal] = useState(false);
  const [needsDecision, setNeedsDecision] = useState(false);

  return (
    <details style={{ marginTop: "var(--s-4)" }}>
      <summary>Add a state</summary>
      <div className="field-row" style={{ marginTop: "var(--s-4)" }}>
        <label className="label">
          Name
          <input
            className="input"
            value={name}
            placeholder="Awaiting client"
            onChange={(e) => { setName(e.target.value); }}
          />
        </label>
        <label className="label">
          Code
          <input
            className="input"
            value={code}
            placeholder="awaiting_client"
            onChange={(e) => { setCode(e.target.value); }}
          />
        </label>
        <label className="label">
          Order
          <input
            className="input"
            value={sortOrder}
            inputMode="numeric"
            onChange={(e) => { setSortOrder(e.target.value); }}
          />
        </label>
      </div>
      {/* NONE OF THE FOUR DESTINATIONS IS OFFERED HERE, and that is the same
          judgement the work board's form makes. Marking a brand-new state as
          where filings start — or where missed ones go — silently moves the
          flag off whatever holds it today. That is a real change to how the
          nightly sweep behaves, and it belongs on the row where somebody can
          see what it replaces. */}
      <div className="field-row">
        <label className="check">
          <input
            type="checkbox"
            checked={isTerminal}
            onChange={(e) => {
              setIsTerminal(e.target.checked);
              if (e.target.checked) setNeedsDecision(false);
            }}
          />
          <span>Means finished</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={needsDecision}
            disabled={isTerminal}
            onChange={(e) => { setNeedsDecision(e.target.checked); }}
          />
          <span>Needs somebody to decide what happens next</span>
        </label>
      </div>
      <button
        className="btn"
        style={{ marginTop: "var(--s-4)" }}
        disabled={busy || name.trim() === "" || code.trim() === ""}
        onClick={() => {
          onAdd({
            code: code.trim(),
            name: name.trim(),
            sortOrder: Number.isInteger(Number(sortOrder)) ? Number(sortOrder) : 60,
            isTerminal,
            needsDecision: !isTerminal && needsDecision,
          });
          setName("");
          setCode("");
        }}
      >
        Add
      </button>
    </details>
  );
}

function AddOption({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (body: {
    code: string;
    name: string;
    closesWithoutFiling: boolean;
    sortOrder: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("50");
  const [closes, setCloses] = useState(false);

  return (
    <details style={{ marginTop: "var(--s-4)" }}>
      <summary>Add a decision</summary>
      <div className="field-row" style={{ marginTop: "var(--s-4)" }}>
        <label className="label">
          Name
          <input
            className="input"
            value={name}
            placeholder="Client deregistered mid-year"
            onChange={(e) => { setName(e.target.value); }}
          />
        </label>
        <label className="label">
          Code
          <input
            className="input"
            value={code}
            placeholder="client_deregistered"
            onChange={(e) => { setCode(e.target.value); }}
          />
        </label>
        <label className="label">
          Order
          <input
            className="input"
            value={sortOrder}
            inputMode="numeric"
            onChange={(e) => { setSortOrder(e.target.value); }}
          />
        </label>
        <label className="label">
          What it does
          <select
            className="input"
            value={closes ? "closes" : "refiles"}
            onChange={(e) => { setCloses(e.target.value === "closes"); }}
          >
            <option value="refiles">The filing still happens, late</option>
            <option value="closes">It will never be filed</option>
          </select>
        </label>
      </div>
      <button
        className="btn"
        style={{ marginTop: "var(--s-4)" }}
        disabled={busy || name.trim() === "" || code.trim() === ""}
        onClick={() => {
          onAdd({
            code: code.trim(),
            name: name.trim(),
            closesWithoutFiling: closes,
            sortOrder: Number.isInteger(Number(sortOrder)) ? Number(sortOrder) : 50,
          });
          setName("");
          setCode("");
        }}
      >
        Add
      </button>
      {/* There is deliberately no option meaning "ignore", and adding one would
          be a decision rather than a convenience: a passed legal deadline is a
          fork with consequences either way, and an option that let one be
          dismissed would hide the thing this queue exists to surface. */}
      <p className="field-hint">
        A new decision starts unconfirmed, like the shipped four. Nothing is ever deleted
        &mdash; retiring one keeps it on every decision already recorded against it.
      </p>
    </details>
  );
}
