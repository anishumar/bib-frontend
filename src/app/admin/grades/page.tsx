"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { StaffGrade } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import {
  Button,
  Dialog,
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
  useSwapFocus,
} from "@/components/ui";

/**
 * The firm's seniority ladder.
 *
 * A THIRD axis, and the reason it has its own screen rather than living beside
 * roles: a role says what somebody may REACH, a grade says how SENIOR they are,
 * and they are edited at different times by different reasoning. Who is on which
 * rung is /admin/people; what the rungs ARE is here.
 *
 * The ladder exists for one comparison — the firm's review rule is "Manager or
 * above" — so `rank` is shown as the plain number it is. This screen does not
 * interpret it, and deliberately does not offer to renumber the ladder for you:
 * inserting a rung is a few edits, and a bulk reorder that guessed which rungs
 * to shift would be making a decision about the firm's own hierarchy.
 *
 * Retiring is never deleting, and the screen says so. A rung somebody held is
 * part of why they were allowed to approve something, so it stays readable
 * forever — it just stops being offered to anybody new. There is no delete
 * button because there is no delete endpoint, and there is no delete endpoint
 * because the app role holds no DELETE grant on the table.
 */
export default function GradesPage() {
  const router = useRouter();
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const ladder = await api.GET("/api/v1/tenancy/grades", {});
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (ladder.response.status === 401) {
      router.push("/login");
      return;
    }
    if (ladder.error) {
      setError(apiError(ladder.error).message);
      setLoaded(true);
      return;
    }
    setGrades(ladder.data.grades);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every mutation funnels through here so one place owns the busy flag, the
   *  error message and the reload. */
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

  function rename(gradeId: string, name: string): void {
    void act(gradeId, () =>
      api.PUT("/api/v1/tenancy/grades/{gradeId}", {
        params: { path: { gradeId } },
        body: { name },
      }),
    );
  }

  function reRank(gradeId: string, rank: number): void {
    void act(gradeId, () =>
      api.PUT("/api/v1/tenancy/grades/{gradeId}", {
        params: { path: { gradeId } },
        body: { rank },
      }),
    );
  }

  function setActive(gradeId: string, isActive: boolean): void {
    void act(gradeId, () =>
      api.PUT("/api/v1/tenancy/grades/{gradeId}/active", {
        params: { path: { gradeId } },
        body: { isActive },
      }),
    );
  }

  if (!loaded) return <Loading label="Loading the ladder" />;

  return (
    <Page>
      {/* No lede (Wave 4): the seniority ladder, most junior first, read by
          the firm's "Manager or above" review rule. Add a grade is the one
          brand button and opens a dialog. */}
      <PageHeader title="Grades" aside={<AddGrade onAdded={() => void load()} />} />

      <ErrorNotice error={error} />

      <Stack gap="tight">
        <TableWrap>
          <Table>
          <thead>
            <tr>
              <Th>Grade</Th>
              <Th>Code</Th>
              <Th>Rank</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id}>
                <Td>
                  <GradeName
                    key={`${g.id}:${g.name}`}
                    value={g.name}
                    /* Named by the CODE — immutable, and in the next cell.
                       "Grade name" was the same name on all ten rows, and this
                       is the field that changes the name, so naming it after
                       its own value would rename the control as it is typed. */
                    label={`Name of ${g.code}`}
                    disabled={busy === g.id}
                    onCommit={(name) => { rename(g.id, name); }}
                  />
                </Td>
                {/* The code never changes. It is the firm's stable handle for
                    the rung, and anything that has recorded it — an audit event,
                    an import script — would stop resolving if it moved. */}
                <Td>{g.code}</Td>
                <Td>
                  <GradeRank
                    key={`${g.id}:${String(g.rank)}`}
                    value={g.rank}
                    label={`Rank of ${g.code}`}
                    disabled={busy === g.id}
                    onCommit={(rank) => { reRank(g.id, rank); }}
                  />
                </Td>
                <Td>
                  <Pill dot tone={g.isActive ? "ok" : "danger"}>
                    {g.isActive ? "In use" : "Retired"}
                  </Pill>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant={g.isActive ? "destructive-quiet" : "secondary"}
                    /* Ten buttons reading "Retire" and nothing else. The visible
                       word stays short because the column is narrow; the name
                       says which grade it retires. */
                    aria-label={`${g.isActive ? "Retire" : "Bring back"} ${g.name}`}
                    loading={busy === g.id}
                    onClick={() => { setActive(g.id, !g.isActive); }}
                  >
                    {g.isActive ? "Retire" : "Bring back"}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
          </Table>
        </TableWrap>
        {/* Ranks need not be consecutive, and two grades may share one.
            Retiring keeps a grade on whoever holds it; it only stops being
            offered to anybody new. */}
        <p className="field-hint">
          Click a name or rank to change it. Rank 1 is the most junior.
        </p>
      </Stack>
    </Page>
  );
}

/**
 * A name that commits on blur or Enter, not on every keystroke.
 *
 * Per-keystroke saving would write a row per letter into an append-only ledger,
 * which is how a rename becomes twelve audit events nobody can read past.
 */
function GradeName({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  /** The control's accessible name. Required, not optional: a cell in a table
   *  has no <label> over it and a column heading is not one, so the caller has
   *  to say which row this is. */
  label: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
  // Seeded once. The caller gives this component a `key` derived from the
  // committed value, so a successful rename remounts it with the new text
  // rather than syncing it back through an effect — which would fight the
  // user's typing and is what react-hooks/set-state-in-effect is warning about.
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
      variant="quiet"
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

/** The same, for the number the whole table exists to compare. */
function GradeRank({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  /** See GradeName. */
  label: string;
  disabled: boolean;
  onCommit: (rank: number) => void;
}) {
  // Seeded once, remounted by `key` when the committed rank changes — see the
  // note on GradeName.
  const [draft, setDraft] = useState(String(value));

  function commit(): void {
    const next = Number(draft);
    // The API is the one that decides what a valid rank is and says so in its
    // own words; this only avoids sending an obvious non-number back at it.
    if (!Number.isInteger(next) || next === value) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  }

  return (
    <Input
      variant="quiet"
      type="number"
      min={1}
      className="max-w-24"
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

/**
 * Adding a rung the firm's starting ladder did not have.
 *
 * This is the case that made the screen worth building: the firm has real
 * designations its own hierarchy never ranked — Article, Intern, Trainee, Head —
 * and the product deliberately refuses to guess where they sit, because a
 * plausible wrong rank is indistinguishable from a real one and this is the
 * number that decides who may sign off a statutory filing.
 */
function AddGrade({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const { trigger } = useSwapFocus(open);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("1");
  const [busy, setBusy] = useState(false);
  // The refusal is shown IN the dialog, beside the form that caused it.
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  async function submit(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    setError(null);
    const result = await api.POST("/api/v1/tenancy/grades", {
      body: { code, name, rank: Number(rank) },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setCode("");
    setName("");
    setOpen(false);
    onAdded();
  }

  return (
    <>
      <Button ref={trigger} onClick={() => { setOpen(true); }}>
        Add a grade
      </Button>
      <Dialog
        open={open}
        onClose={() => { setOpen(false); }}
        title="Add a grade"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); }}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={busy}>
              Add
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldStack>
            <FieldRow>
              <Field label="Name">
                <Input
                  required
                  autoFocus
                  value={name}
                  placeholder="e.g. Article"
                  onChange={(e) => { setName(e.target.value); }}
                />
              </Field>
              <Field label="Code">
                <Input
                  required
                  value={code}
                  placeholder="e.g. article"
                  onChange={(e) => { setCode(e.target.value); }}
                />
              </Field>
              <Field label="Rank">
                <Input
                  type="number"
                  min={1}
                  required
                  value={rank}
                  onChange={(e) => { setRank(e.target.value); }}
                />
              </Field>
            </FieldRow>
            {/* UNDER the row (the FieldRow rule). To slot a grade in below an
                existing one, give it that rank and edit the ranks above. */}
            <p className="field-hint">The code cannot change later. Rank 1 is the most junior.</p>
            <ErrorNotice error={error} />
          </FieldStack>
        </form>
      </Dialog>
    </>
  );
}
