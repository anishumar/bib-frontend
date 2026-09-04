"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { WorkItemPriority, WorkItemState } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

/**
 * The firm's own words for work — the states a task moves through and how
 * urgent it can be (T3.1).
 *
 * ── THIS SCREEN IS THE WHOLE REASON THESE ARE ROWS ──────────────────────────
 *
 * The names came from a previous vendor's list and are still unconfirmed, even
 * for 10x. Asked about them the client said to get the system working and
 * settle the naming later — which costs nothing precisely because this is a
 * table: renaming a state, adding a ninth, or deciding statutory work is
 * Critical is an UPDATE somebody makes here, not a migration they ask an
 * engineer for.
 *
 * ── AND THE TICK BOXES ARE NOT LABELS ───────────────────────────────────────
 *
 * They are the MEANING. Every rule in the product reads these flags and never
 * the name beside them, which is what makes the renaming safe:
 *
 *   Starting   where new work begins. Exactly one, always.
 *   Finished   nothing further happens; the completion time is stamped.
 *   Blocked    a REASON becomes mandatory the moment anything enters it.
 *
 * So ticking "Blocked" on "Waiting for Client" starts demanding a sentence
 * there too, with no deploy — and each box says what it turns on rather than
 * naming itself, because "is_blocked" tells a partner nothing.
 *
 * ── WHAT IT REFUSES, AND WHY IT SAYS SO UP FRONT ────────────────────────────
 *
 * A firm may never end up with no starting state, no default priority, or no
 * statutory default — each would leave it unable to create a single task. The
 * API refuses those, and the screen explains the move that works instead
 * (marking another one) rather than letting somebody find out by being told no.
 *
 * There is no Delete, because there is no delete endpoint and no DELETE grant
 * behind it: a hundred tasks sitting in a state would lose it. Retiring keeps
 * the state readable everywhere it is held and only stops it being offered.
 */
export default function WorkVocabularyPage() {
  const router = useRouter();
  const [states, setStates] = useState<WorkItemState[]>([]);
  const [priorities, setPriorities] = useState<WorkItemPriority[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/work-vocabulary", {});
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
    setPriorities(result.data.priorities);
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
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <Page>
      <PageHeader
        eyebrow="How work runs"
        title="Work states and priorities"
        lede="The words your firm uses for work. Rename any of them, add your own, or change what
        they mean — the product reads the TICK BOXES and never the names, so nothing breaks
        when you rename one."
      />
      <ErrorNotice error={error} />

      <Card>
        <CardTitle level={2}>States</CardTitle>
        {/* The wrapper is not decoration. `.table` is `min-width: max-content`
            and `.tablewrap` carries the `contain: layout paint` that keeps that
            width off the PAGE — without one, this nine-column table pushed the
            document 771px sideways at 390 and 393px at 768. */}
        <TableWrap>
          <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th style={{ width: 90 }}>Order</Th>
              <Th>Starting</Th>
              <Th>Finished</Th>
              <Th>Done, not dropped</Th>
              <Th>Blocked</Th>
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
                    /* Named by the CODE, which is immutable and sits in the
                       next cell. "State name" was the same name on all eight
                       rows, and naming it after its own value would rename the
                       control on every keystroke. */
                    label={`Name of ${s.code}`}
                    disabled={busy === s.id}
                    onCommit={(name) => {
                      void act(s.id, () => patchState(s.id, { name }));
                    }}
                  />
                </Td>
                {/* The code never changes. It is the firm's stable handle, and
                    an audit event or an import that recorded it would stop
                    resolving if it moved. */}
                <Td className="mono muted">{s.code}</Td>
                <Td>
                  <CommitNumber
                    key={`${s.id}:${String(s.sortOrder)}`}
                    value={s.sortOrder}
                    label={`Order of ${s.code}`}
                    disabled={busy === s.id}
                    onCommit={(sortOrder) => {
                      void act(s.id, () => patchState(s.id, { sortOrder }));
                    }}
                  />
                </Td>
                <Td>
                  <input
                    type="radio"
                    name="initial"
                    aria-label={`${s.name} is the starting state`}
                    checked={s.isInitial}
                    disabled={busy === s.id || !s.isActive}
                    onChange={() => {
                      void act(s.id, () => patchState(s.id, { isInitial: true }));
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
                {/* Only meaningful on a state the firm calls finished, and
                    disabled otherwise rather than hidden — the API refuses the
                    pair and a control that vanishes reads as a bug. This is
                    what tells Completed from Cancelled: the compliance calendar
                    marks a filing filed from it, so ticking it on the wrong row
                    records a statutory return nobody made. */}
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${s.name} means the work was actually done`}
                    checked={s.isSuccess}
                    disabled={busy === s.id || !s.isTerminal}
                    title={
                      s.isTerminal
                        ? "The work was done, rather than abandoned. A filing is only marked filed from a state ticked here."
                        : "Only a finished state can mean the work was done."
                    }
                    onChange={(e) => {
                      void act(s.id, () => patchState(s.id, { isSuccess: e.target.checked }));
                    }}
                  />
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`${s.name} means blocked, and needs a reason`}
                    checked={s.isBlocked}
                    disabled={busy === s.id}
                    onChange={(e) => {
                      void act(s.id, () => patchState(s.id, { isBlocked: e.target.checked }));
                    }}
                  />
                </Td>
                <Td>
                  <Pill tone={s.isActive ? "ok" : "danger"}>
                    {s.isActive ? "in use" : "retired"}
                  </Pill>
                </Td>
                <Td align="right">
                  {/* Named by the state. Twelve buttons on this screen read
                      "Retire", and it is the destructive one. */}
                  <Button
                    size="sm"
                    variant={s.isActive ? "destructive-quiet" : "secondary"}
                    loading={busy === s.id}
                    aria-label={`${s.isActive ? "Retire" : "Bring back"} the state ${s.name}`}
                    onClick={() => {
                      void act(s.id, () => patchState(s.id, { isActive: !s.isActive }));
                    }}
                  >
                    {s.isActive ? "Retire" : "Bring back"}
                  </Button>
                </Td>
              </tr>
            ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="field-hint">
          <strong>Starting</strong> is where new work begins — exactly one, and marking another
          moves it. <strong>Finished</strong> stamps the completion time and takes the task off
          the open board. <strong>Blocked</strong> makes a written reason mandatory the moment
          anything enters that state, which is the only thing that ever explains a delay later.
          Retiring keeps a state readable on every task already in it; it just stops being
          offered.
        </p>
        <AddState
          busy={busy === "new-state"}
          onAdd={(body) => {
            void act("new-state", () =>
              api.POST("/api/v1/work-vocabulary/states", { body }),
            );
          }}
        />
      </Card>

      <Card>
        <CardTitle level={2}>Priorities</CardTitle>
        <TableWrap>
          <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th style={{ width: 90 }}>Rank</Th>
              <Th>Default</Th>
              <Th>Statutory</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {priorities.map((p) => (
              <tr key={p.id} data-inactive={!p.isActive}>
                <Td>
                  <CommitText
                    key={`${p.id}:${p.name}`}
                    value={p.name}
                    label={`Name of ${p.code}`}
                    disabled={busy === p.id}
                    onCommit={(name) => {
                      void act(p.id, () => patchPriority(p.id, { name }));
                    }}
                  />
                </Td>
                <Td className="mono muted">{p.code}</Td>
                <Td>
                  <CommitNumber
                    key={`${p.id}:${String(p.rank)}`}
                    value={p.rank}
                    label={`Rank of ${p.code}`}
                    disabled={busy === p.id}
                    onCommit={(rank) => {
                      void act(p.id, () => patchPriority(p.id, { rank }));
                    }}
                  />
                </Td>
                <Td>
                  <input
                    type="radio"
                    name="default-priority"
                    aria-label={`${p.name} is what ordinary work gets`}
                    checked={p.isDefault}
                    disabled={busy === p.id || !p.isActive}
                    onChange={() => {
                      void act(p.id, () => patchPriority(p.id, { isDefault: true }));
                    }}
                  />
                </Td>
                <Td>
                  <input
                    type="radio"
                    name="statutory-priority"
                    aria-label={`${p.name} is what statutory work gets`}
                    checked={p.isStatutoryDefault}
                    disabled={busy === p.id || !p.isActive}
                    onChange={() => {
                      void act(p.id, () => patchPriority(p.id, { isStatutoryDefault: true }));
                    }}
                  />
                </Td>
                <Td>
                  <Pill tone={p.isActive ? "ok" : "danger"}>
                    {p.isActive ? "in use" : "retired"}
                  </Pill>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant={p.isActive ? "destructive-quiet" : "secondary"}
                    loading={busy === p.id}
                    aria-label={`${p.isActive ? "Retire" : "Bring back"} the priority ${p.name}`}
                    onClick={() => {
                      void act(p.id, () => patchPriority(p.id, { isActive: !p.isActive }));
                    }}
                  >
                    {p.isActive ? "Retire" : "Bring back"}
                  </Button>
                </Td>
              </tr>
            ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="field-hint">
          Rank <strong>1 is the most urgent</strong>, and it is what the board sorts by — the
          names are yours. <strong>Default</strong> is what ordinary work is created with.{" "}
          <strong>Statutory</strong> is what work with a date set by LAW gets, which is your own
          rule made automatic — a filing does not need somebody to remember to mark it urgent.
          The two may be the same row if you do not want statutory work treated differently.
        </p>
        <AddPriority
          busy={busy === "new-priority"}
          onAdd={(body) => {
            void act("new-priority", () =>
              api.POST("/api/v1/work-vocabulary/priorities", { body }),
            );
          }}
        />
      </Card>
    </Page>
  );
}

function patchState(
  stateId: string,
  body: {
    name?: string;
    sortOrder?: number;
    isInitial?: boolean;
    isTerminal?: boolean;
    isBlocked?: boolean;
    isSuccess?: boolean;
    isActive?: boolean;
  },
): Promise<{ error?: unknown }> {
  return api.PATCH("/api/v1/work-vocabulary/states/{stateId}", {
    params: { path: { stateId } },
    body,
  });
}

function patchPriority(
  priorityId: string,
  body: {
    name?: string;
    rank?: number;
    isDefault?: boolean;
    isStatutoryDefault?: boolean;
    isActive?: boolean;
  },
): Promise<{ error?: unknown }> {
  return api.PATCH("/api/v1/work-vocabulary/priorities/{priorityId}", {
    params: { path: { priorityId } },
    body,
  });
}

/**
 * Text that commits on blur or Enter, not on every keystroke.
 *
 * Per-keystroke saving would write a row per letter into an append-only ledger,
 * which is how a rename becomes twelve audit events nobody can read past. The
 * same arrangement `/admin/grades` uses, for the same reason.
 */
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
    <Input
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
    // The API decides what a valid number is and says so in its own words; this
    // only avoids sending an obvious non-number back at it.
    if (!Number.isInteger(next) || next === value) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  }

  return (
    <Input
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
    sortOrder?: number;
    isTerminal?: boolean;
    isBlocked?: boolean;
    isSuccess?: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("90");
  const [isTerminal, setIsTerminal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  return (
    <details style={{ marginTop: "var(--s-4)" }}>
      <summary>Add a state</summary>
      {/* A GROUP, named, and with no legend so nothing moves on screen. Both
          forms on this page ask for a Name and a Code, and this page can have
          both of them open at once — "Name, edit" twice over identifies
          neither. The group is what tells them apart. */}
      <fieldset className="fieldset" aria-label="Add a state">
        <FieldStack>
          <FieldRow>
            <Field label="Name">
              <Input value={name} onChange={(e) => { setName(e.target.value); }} />
            </Field>
            <Field label="Code">
              <Input
                value={code}
                placeholder="with_auditor"
                onChange={(e) => { setCode(e.target.value); }}
              />
            </Field>
            <Field label="Order">
              <Input
                value={sortOrder}
                inputMode="numeric"
                onChange={(e) => { setSortOrder(e.target.value); }}
              />
            </Field>
          </FieldRow>
          {/* "Starting" is deliberately absent from this form. Marking a NEW
              state as the one work begins in would silently move it off
              whatever holds it today — a real change, and one somebody should
              make on the row where they can see what it replaces. */}
          <FieldRow>
            <Checkbox
              label="Means finished"
              checked={isTerminal}
              onChange={(e) => { setIsTerminal(e.target.checked); }}
            />
            {/* Offered only once "finished" is ticked, because the API refuses
                the other pair — and left unticked by default, which is the safe
                direction: a new terminal state nobody classified leaves an
                obligation OPEN and visible, rather than recording a filing that
                never happened. */}
            {isTerminal && (
              <Checkbox
                label="… and the work was DONE, not dropped"
                checked={isSuccess}
                onChange={(e) => { setIsSuccess(e.target.checked); }}
              />
            )}
            <Checkbox
              label="Means blocked — needs a written reason"
              checked={isBlocked}
              onChange={(e) => { setIsBlocked(e.target.checked); }}
            />
          </FieldRow>
          <div className="cluster">
            <Button
              disabled={busy || name.trim() === "" || code.trim() === ""}
              onClick={() => {
                onAdd({
                  code: code.trim(),
                  name: name.trim(),
                  sortOrder: Number.isInteger(Number(sortOrder)) ? Number(sortOrder) : 90,
                  isTerminal,
                  isBlocked,
                  isSuccess: isTerminal && isSuccess,
                });
                setName("");
                setCode("");
                setIsSuccess(false);
              }}
              aria-label="Add a work state"
            >
              Add
            </Button>
          </div>
        </FieldStack>
      </fieldset>
    </details>
  );
}

function AddPriority({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (body: { code: string; name: string; rank: number }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rank, setRank] = useState("5");

  return (
    <details style={{ marginTop: "var(--s-4)" }}>
      <summary>Add a priority</summary>
      <fieldset className="fieldset" aria-label="Add a priority">
        <FieldStack>
          <FieldRow>
            <Field label="Name">
              <Input value={name} onChange={(e) => { setName(e.target.value); }} />
            </Field>
            <Field label="Code">
              <Input
                value={code}
                placeholder="urgent"
                onChange={(e) => { setCode(e.target.value); }}
              />
            </Field>
            <Field label="Rank">
              <Input
                value={rank}
                inputMode="numeric"
                onChange={(e) => { setRank(e.target.value); }}
              />
            </Field>
          </FieldRow>
          {/* The Add button was the FOURTH CELL of that grid, so it was sized
              by the column and not by its own word: 268px against the 63px the
              same button measures on the state form above. A grid stretches
              what it is given. */}
          <div className="cluster">
            <Button
              disabled={busy || name.trim() === "" || code.trim() === ""}
              onClick={() => {
                onAdd({ code: code.trim(), name: name.trim(), rank: Number(rank) });
                setName("");
                setCode("");
              }}
              aria-label="Add a priority"
            >
              Add
            </Button>
          </div>
        </FieldStack>
      </fieldset>
      {/* Neither default is offered here, for the same reason "Starting" is not
          on the state form: moving one silently changes what every task created
          afterwards gets, and that belongs on the row beside what it replaces. */}
      <p className="field-hint">
        Ranks need not be consecutive, and two priorities may share one — nothing compares
        within a rank, only across.
      </p>
    </details>
  );
}
