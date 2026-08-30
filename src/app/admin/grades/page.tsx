"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { StaffGrade } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
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
      <PageHeader
        eyebrow="Administration"
        title="Grades"
        lede="The firm's seniority ladder. A grade grants nothing — it exists for one comparison, the review rule that reads “Manager or above”."
        aside={<Pill tone="quiet">{grades.length} rungs</Pill>}
      />

      <ErrorNotice error={error} />

      <Stack gap="tight">
        <TableWrap>
          <Table>
          <thead>
            <tr>
              <Th>Rung</Th>
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
              <tr key={g.id} data-inactive={!g.isActive}>
                <Td>
                  <GradeName
                    key={`${g.id}:${g.name}`}
                    value={g.name}
                    disabled={busy === g.id}
                    onCommit={(name) => { rename(g.id, name); }}
                  />
                </Td>
                {/* The code never changes. It is the firm's stable handle for
                    the rung, and anything that has recorded it — an audit event,
                    an import script — would stop resolving if it moved. */}
                <Td>
                  <span className="mono muted">{g.code}</span>
                </Td>
                <Td>
                  <GradeRank
                    key={`${g.id}:${String(g.rank)}`}
                    value={g.rank}
                    disabled={busy === g.id}
                    onCommit={(rank) => { reRank(g.id, rank); }}
                  />
                </Td>
                <Td>
                  <Pill tone={g.isActive ? "accent" : "danger"}>
                    {g.isActive ? "in use" : "retired"}
                  </Pill>
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant={g.isActive ? "destructive-quiet" : "secondary"}
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
        <p className="field-hint">
          Rank 1 is the most junior, and a review rule like “Manager or above” compares it.
          Ranks need not be consecutive, and two rungs may share one. Retiring keeps a rung
          readable on everybody who holds it — it only stops being offered to anybody new.
        </p>
      </Stack>

      <AddGrade onAdded={() => void load()} onError={setError} />
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
  disabled,
  onCommit,
}: {
  value: string;
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
      size="sm"
      value={draft}
      disabled={disabled}
      aria-label="Grade name"
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
  disabled,
  onCommit,
}: {
  value: number;
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
      size="sm"
      type="number"
      min={1}
      value={draft}
      disabled={disabled}
      aria-label="Rank"
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
function AddGrade({
  onAdded,
  onError,
}: {
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("1");
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    const result = await api.POST("/api/v1/tenancy/grades", {
      body: { code, name, rank: Number(rank) },
    });
    setBusy(false);
    if (result.error) {
      onError(apiError(result.error).message);
      return;
    }
    setCode("");
    setName("");
    onAdded();
  }

  return (
    <Card>
      <CardHead title="Add a rung" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="stack">
          <FieldRow>
            <Field label="Name">
              <Input
                required
                value={name}
                placeholder="Article"
                onChange={(e) => { setName(e.target.value); }}
              />
            </Field>
            <Field label="Code" hint="Permanent once set.">
              <Input
                required
                value={code}
                placeholder="article"
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

          <div>
            <Button type="submit" loading={busy}>
              Add
            </Button>
            <p className="field-hint">
              The code is permanent and is how the rung is referred to everywhere else. To slot
              a rung in below an existing one, give it the rank you want and edit the ranks
              above it.
            </p>
          </div>
        </div>
      </form>
    </Card>
  );
}
