"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, VERIFICATION_RULES } from "@/lib/api/client";
import type { ConfigEntry, StaffGrade, VerificationRule } from "@/lib/api/client";
import { Button, Card, CardTitle, ErrorNotice, Notice, useSwapFocus } from "@/components/ui";
import { CheckRuleForm, readPolicyBody } from "@/lib/ui/check-rule-form";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";

/**
 * Who may check somebody else's work.
 *
 * ── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
 *
 * One rule on this page is NOT here: whoever did the work can never be the
 * person who approves it. That is a CHECK constraint in the database, it holds
 * against a script and an import as well as against this app, and no firm may
 * switch it off. The banner says so, because a control somebody thinks is a
 * setting is a control they will look for a way around.
 *
 * Everything else IS the firm's, and that is the whole reason for the screen.
 * The client gave two different answers on two different days — "Manager or
 * above is fine" (a grade) and "manager means engagement manager" (a person) —
 * and they are not the same rule. Picking one on the firm's behalf would be us
 * choosing its maker-checker control.
 *
 * ── AND WHY IT IS A LIST, NOT ONE SETTING ───────────────────────────────────
 *
 * SQC 1, which is what a CA firm is actually audited against, wants an
 * engagement quality control reviewer to be independent of the engagement team —
 * the opposite of a reporting line, where your reviewer is your own manager. So
 * a firm doing both an ordinary manager review and an EQCR sign-off needs two
 * rules inside one process, and a step on /admin/workflows names the one that
 * governs it.
 *
 * ── PUBLISHING, NOT SAVING ──────────────────────────────────────────────────
 *
 * The same two-step /catalogue and /admin/workflows use, and for a stronger
 * reason than either: a check PINS the rule that was in force when it opened, so
 * raising the bar this afternoon leaves this morning's open checks approvable by
 * the people already looking at them — and an audit asking "who was allowed to
 * approve this in March" gets March's answer. A draft is not in force and the
 * card says which is which.
 */

export default function VerificationPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<ConfigEntry[]>([]);
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The form below REPLACES the button that opens it, so focus has to be
  // carried across the swap by hand. See `useSwapFocus`.
  const { panel: addPanel, trigger: addTrigger } = useSwapFocus(adding);

  const load = useCallback(async (): Promise<void> => {
    // Both in one pass. The ladder is not decoration here: a rank threshold is
    // chosen BY GRADE and stored as the rank, so a screen without the ladder
    // would be asking a partner to type a number.
    const [list, ladder] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "verification_policy" } } }),
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
    setPolicies(list.data.entries);
    // The ladder failing is not fatal — an admin can still read the rules that
    // exist. It only stops a NEW rank threshold being written, and the form says
    // so rather than offering an empty picker.
    if (!ladder.error) setGrades(ladder.data.grades);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function publish(key: string, version: number): Promise<void> {
    setBusy(`publish:${key}`);
    setError(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "verification_policy", key, version } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  if (!loaded) return <Loading />;

  return (
    <Page>
      {/* No lede (Wave 4): each process step names the rule that checks it,
          on Processes, so one process can have a manager review and a
          separate partner sign-off. "Write a rule" is the one brand button;
          the form takes its place while open (`useSwapFocus`). */}
      <PageHeader
        title="Who checks the work"
        aside={
          adding ? undefined : (
            <Button ref={addTrigger} onClick={() => { setAdding(true); }}>
              Write a rule
            </Button>
          )
        }
      />

      {/* NOT a setting, and the screen has to say so where somebody would look
          for the switch. */}
      {/* A raw `<div className="notice">` holding ONE SENTENCE with a
          `<strong>` and an `<em>` in it. `.notice` is `display: flex`, so each
          run of that sentence became a column — the bold clause, then the
          prose, then the word "else" alone, then "may check it" — four
          newspaper columns of one paragraph, measured 83px and 30px wide.
          `Notice` puts its children in `.notice-body`, where prose belongs. */}
      <Notice className="measure">
        {/* Not a setting and cannot be switched off; it holds against
            imports and automated actions too (a database CHECK). */}
        <p>
          <strong>Nobody can ever approve their own work.</strong> Below you choose who{" "}
          <em>else</em> may check it.
        </p>
      </Notice>

      <ErrorNotice error={error} />

      {adding && (
        <Card ref={addPanel} tabIndex={-1}>
          <CardTitle level={2}>A new rule</CardTitle>
          <CheckRuleForm
            policyKey={null}
            grades={grades}
            takenKeys={policies.map((p) => p.entry.key)}
            onDone={() => {
              setAdding(false);
              void load();
            }}
            onCancel={() => { setAdding(false); }}
            onError={setError}
          />
        </Card>
      )}

      {policies.length === 0 ? (
        <p className="max-w-[64ch]">
          No rule yet. Until there is one, a step is finished by whoever does it.
        </p>
      ) : (
        policies.map((p) => (
          <PolicyCard
            key={p.entry.key}
            entry={p}
            grades={grades}
            busy={busy}
            onPublish={publish}
            onSaved={() => void load()}
            onError={setError}
          />
        ))
      )}

    </Page>
  );
}

function ruleLabel(rule: VerificationRule): string {
  return VERIFICATION_RULES.find((r) => r.value === rule)?.label ?? rule;
}

/** One rule, what it says now, and whether that is actually in force. */
function PolicyCard({
  entry,
  grades,
  busy,
  onPublish,
  onSaved,
  onError,
}: {
  entry: ConfigEntry;
  grades: StaffGrade[];
  busy: string | null;
  onPublish: (key: string, version: number) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Same swap as the page-level "Write a rule": the form takes the button's
  // place, so focus has to be handed over. See `useSwapFocus`.
  const { panel: editPanel, trigger: editTrigger } = useSwapFocus(editing);
  const inForce = readPolicyBody(entry.published?.body);
  const draft = entry.pendingDraft;

  return (
    <Card>
      <div className="row">
        <div>
          <CardTitle level={2}>
            {inForce?.label ?? readPolicyBody(draft?.body)?.label ?? entry.entry.key}
          </CardTitle>

        </div>
      </div>

      {inForce === null ? (
        // A rule somebody wrote and never published is a real state, and hiding
        // it would leave a partner sure they had set something they had not.
        <p style={{ marginTop: "var(--s-4)" }}>
          <strong>Not in force.</strong> Until it is, anybody but the doer may check.
        </p>
      ) : (
        <dl className="meta" data-layout="list" style={{ marginTop: "var(--s-4)" }}>
          <dt>Who may check</dt>
          <dd>{ruleLabel(inForce.rule)}</dd>
          {inForce.minGradeRank !== null && (
            <>
              <dt>From grade</dt>
              <dd>
                {grades.find((g) => g.code === inForce.minGradeCode)?.name ??
                  inForce.minGradeCode ??
                  `rank ${String(inForce.minGradeRank)}`}{" "}
                and above
              </dd>
            </>
          )}
        </dl>
      )}

      {draft && (
        <Notice className="mt-4">
          <p>
            <strong>A change is saved, not in force.</strong> Open checks keep their rule.
          </p>
          <div className="cluster mt-2">
            <Button
              disabled={busy === `publish:${entry.entry.key}`}
              onClick={() => { onPublish(entry.entry.key, draft.version); }}
            >
              Put it in force
            </Button>
          </div>
        </Notice>
      )}

      {editing ? (
        <div ref={editPanel} tabIndex={-1}>
          <CheckRuleForm
            policyKey={entry.entry.key}
            initial={inForce ?? readPolicyBody(draft?.body)}
            grades={grades}
            onDone={() => {
              setEditing(false);
              onSaved();
            }}
            onCancel={() => { setEditing(false); }}
            onError={onError}
          />
        </div>
      ) : (
        <Button
          ref={editTrigger}
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => { setEditing(true); }}
        >
          Change it
        </Button>
      )}
    </Card>
  );
}
