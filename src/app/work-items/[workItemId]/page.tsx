"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type {
  ChecklistItem,
  Member,
  Principal,
  WorkItemChecker,
  WorkItemDetail,
  WorkItemReview,
  WorkVocabulary,
} from "@/lib/api/client";

/**
 * One work item — the page where it is actually worked (T3.1).
 *
 * Everything a board row deliberately does not carry: the checklist, what it is
 * waiting on, and every review it has been through including the ones that sent
 * it back.
 *
 * ── THE STATE PICKER IS THE FIRM'S OWN VOCABULARY ───────────────────────────
 *
 * It offers `/api/v1/work-vocabulary`, not a hard-coded list, and reads the
 * FLAGS on each row rather than its code. That is what makes the promise real:
 * a firm renames "Blocked" to "Stuck" on /admin/work-vocabulary and this screen
 * keeps demanding a reason, because the demand is keyed on `isBlocked`.
 *
 * The reason box therefore appears when the SELECTED state is flagged blocked —
 * for whatever the firm has called it, including a second state it flagged
 * itself. Asking for it here rather than letting the API refuse is not a
 * duplicated rule: the API refuses regardless, and a person who has already
 * clicked Save has lost the sentence they were about to write.
 *
 * ── WHAT IS NOT OFFERED, AND WHY ────────────────────────────────────────────
 *
 * There is no "approve and mark done" button. Nothing says which of the firm's
 * terminal states an approval should move work into — a firm has at least two,
 * Completed and Cancelled — and picking one would be this product deciding what
 * approval MEANS. So the two acts are separate and the screen shows both.
 *
 * ── AND THE REVIEW SECTION SHOWS REJECTIONS ─────────────────────────────────
 *
 * All of them, newest first. A list of only the open one makes work that came
 * back twice read as work that sailed through, which is the single most
 * misleading thing this page could do.
 */
export default function WorkItemPage() {
  const router = useRouter();
  const params = useParams<{ workItemId: string }>();
  const workItemId = params.workItemId;

  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [vocabulary, setVocabulary] = useState<WorkVocabulary | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [me, setMe] = useState<Principal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [item, vocab, people, principal] = await Promise.all([
      api.GET("/api/v1/work-items/{workItemId}", { params: { path: { workItemId } } }),
      api.GET("/api/v1/work-vocabulary", {}),
      // The roster is `tenant:admin`, and this page is `party:read`. So the
      // assignee picker is offered only to somebody who can actually read the
      // list — the SAME honest gap the pipeline's owner dropdown and the account
      // team form already have, left consistent with them rather than widened
      // here on a whim. Everything else on the page works either way.
      api.GET("/api/v1/tenancy/members", {}),
      api.GET("/api/v1/auth/me", {}),
    ]);
    if (item.response.status === 401) {
      router.push("/login");
      return;
    }
    if (item.error) {
      setError(apiError(item.error).message);
      setLoaded(true);
      return;
    }
    setDetail(item.data);
    setVocabulary(vocab.error ? null : vocab.data);
    setRoster(people.error ? [] : people.data.members);
    setMe(principal.error ? null : principal.data);
    setError(null);
    setLoaded(true);
  }, [router, workItemId]);

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

  if (!loaded) return <p className="bib-muted">Loading…</p>;
  if (detail === null) {
    return (
      <main>
        <div className="bib-nav">
          <Link href="/work-items">← Work</Link>
        </div>
        <p className="bib-error">{error ?? "No such work item."}</p>
      </main>
    );
  }

  const item = detail.item;
  const openReview = detail.reviews.find((r) => r.decision === "pending") ?? null;
  const canWrite = me?.permissions.includes("work:write") ?? false;

  return (
    <main>
      <div className="bib-nav">
        <Link href="/work-items">← Work</Link>
        {item.jobId !== null && <Link href={`/work/${item.jobId}`}>The process →</Link>}
        <Link href={`/clients/${item.clientPartyId}`}>The client →</Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>{item.title}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {item.clientName}
        {item.entityName !== null && item.entityName !== item.clientName && ` · ${item.entityName}`}
        {item.deptName !== null && ` · ${item.deptName}`}
      </p>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card">
        <dl className="bib-facts">
          <Fact label="State">
            <span
              className="bib-pill"
              data-tone={
                item.state.isBlocked ? "revoked" : item.state.isTerminal ? undefined : "live"
              }
            >
              {item.state.name}
            </span>
          </Fact>
          <Fact label="Priority">{item.priority.name}</Fact>
          <Fact label="Owner">
            {/* "Nobody", and nothing else. The REASON is the callout below —
                printing it here too made the fact grid six lines tall and said
                the same sentence twice, which is what opening the page found. */}
            {item.assignee === null ? (
              <span className="bib-muted">Nobody</span>
            ) : (
              (item.assignee.displayName ?? item.assignee.email)
            )}
          </Fact>
          <Fact label="Due">
            {item.dueOn ?? "no date"}
            {item.slaDaysSnapshot !== null && (
              <span className="bib-muted" style={{ fontSize: 12 }}>
                {" "}
                {/* The SNAPSHOT, and the page says it is one. A catalogue
                    revision must not make finished work retroactively late, so
                    this is the number that applied when the work was raised —
                    not what the service says today. */}
                (SLA {item.slaDaysSnapshot} days, as it stood when this was raised)
              </span>
            )}
          </Fact>
          {item.isStatutoryDue && (
            <Fact label="Deadline">
              Statutory — the date comes from the law, not from the firm
            </Fact>
          )}
          <Fact label="Client can see this">{item.isClientVisible ? "Yes" : "No"}</Fact>
        </dl>

        {item.assignee === null && item.assignmentNote !== null && (
          <p className="bib-callout">{item.assignmentNote}</p>
        )}
        {item.state.isBlocked && item.blockedReason !== null && (
          <p className="bib-callout">
            <strong>Blocked:</strong> {item.blockedReason}
          </p>
        )}
        {item.blockedByOpen.length > 0 && (
          <p className="bib-callout">
            Cannot start until {item.blockedByOpen.map((b) => b.title).join(", ")}{" "}
            {item.blockedByOpen.length === 1 ? "is" : "are"} finished.
          </p>
        )}
      </div>

      {canWrite && vocabulary !== null && (
        <MoveState
          vocabulary={vocabulary}
          currentStateId={item.state.id}
          busy={busy === "state"}
          onMove={(stateId, blockedReason) => {
            void act("state", () =>
              api.POST("/api/v1/work-items/{workItemId}/state", {
                params: { path: { workItemId } },
                body: { stateId, blockedReason },
              }),
            );
          }}
        />
      )}

      {canWrite && roster.length > 0 && (
        <Assign
          roster={roster}
          currentUserId={item.assignee?.userId ?? null}
          busy={busy === "assign"}
          onAssign={(assigneeUserId) => {
            void act("assign", () =>
              api.POST("/api/v1/work-items/{workItemId}/assignee", {
                params: { path: { workItemId } },
                body: { assigneeUserId },
              }),
            );
          }}
        />
      )}

      <Checklist
        lines={detail.checklist}
        canWrite={canWrite}
        busy={busy}
        onAdd={(label) => {
          void act("checklist", () =>
            api.POST("/api/v1/work-items/{workItemId}/checklist", {
              params: { path: { workItemId } },
              body: { label },
            }),
          );
        }}
        onTick={(checklistItemId, done) => {
          void act(checklistItemId, () =>
            api.POST("/api/v1/work-items/{workItemId}/checklist/{checklistItemId}", {
              params: { path: { workItemId, checklistItemId } },
              body: { done },
            }),
          );
        }}
        onRemove={(checklistItemId) => {
          void act(checklistItemId, () =>
            api.DELETE("/api/v1/work-items/{workItemId}/checklist/{checklistItemId}", {
              params: { path: { workItemId, checklistItemId } },
            }),
          );
        }}
      />

      <Reviews
        reviews={detail.reviews}
        openReview={openReview}
        canWrite={canWrite}
        busy={busy}
        onRequest={() => {
          void act("review", () =>
            api.POST("/api/v1/work-items/{workItemId}/review", {
              params: { path: { workItemId } },
              body: {},
            }),
          );
        }}
        onDecide={(approvalId, decision, notes) => {
          void act(approvalId, () =>
            api.POST("/api/v1/work-item-checks/{approvalId}/decide", {
              params: { path: { approvalId } },
              body: { decision, notes },
            }),
          );
        }}
      />
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bib-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The state picker.
 *
 * Offers only ACTIVE states — a retired one still renders everywhere it is held
 * but is not offered for a move, which is the difference between retiring and
 * deleting. And the reason box is keyed on the selected state's `isBlocked`
 * FLAG, so it follows the firm's own configuration rather than a name this
 * screen knows.
 */
function MoveState({
  vocabulary,
  currentStateId,
  busy,
  onMove,
}: {
  vocabulary: WorkVocabulary;
  currentStateId: string;
  busy: boolean;
  onMove: (stateId: string, blockedReason: string | null) => void;
}) {
  const [stateId, setStateId] = useState(currentStateId);
  const [reason, setReason] = useState("");
  const target = vocabulary.states.find((s) => s.id === stateId) ?? null;
  const needsReason = target?.isBlocked ?? false;

  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Move it</h2>
      <div className="bib-field-row">
        <label className="bib-label">
          State
          <select
            className="bib-select"
            value={stateId}
            onChange={(e) => { setStateId(e.target.value); }}
          >
            {vocabulary.states
              .filter((s) => s.isActive || s.id === currentStateId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="bib-button"
          // `.bib-field-row > *` is `flex: 1 1 160px`, which is right for the
          // control beside it and turns a button into a banner. Found by
          // opening the page.
          style={{ flex: "0 0 auto" }}
          disabled={busy || stateId === currentStateId || (needsReason && reason.trim() === "")}
          onClick={() => { onMove(stateId, needsReason ? reason.trim() : null); }}
        >
          Save
        </button>
      </div>

      {needsReason && (
        <label className="bib-label" style={{ marginTop: "var(--bib-gap-2)" }}>
          Why is it stuck?
          <textarea
            className="bib-textarea"
            value={reason}
            rows={2}
            onChange={(e) => { setReason(e.target.value); }}
          />
          {/* The capture-or-lose half, said out loud. At the moment somebody
              blocks a task the reason is obvious to everybody in the room and
              nobody writes it down; a year later "are our delays ours or the
              client's" has no query that can answer it. */}
          <span className="bib-hint">
            Required for this state, and it is the only thing that will ever explain the
            delay. It stays on the task and never enters the audit log — the log cannot be
            erased and this names people.
          </span>
        </label>
      )}
    </div>
  );
}

/** Whose desk it is on. Offered only where the roster is readable — see the
 *  note in `load`. */
function Assign({
  roster,
  currentUserId,
  busy,
  onAssign,
}: {
  roster: Member[];
  currentUserId: string | null;
  busy: boolean;
  onAssign: (userId: string | null) => void;
}) {
  const [userId, setUserId] = useState(currentUserId ?? "");

  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Whose desk</h2>
      <div className="bib-field-row">
        <label className="bib-label">
          Owner
          <select
            className="bib-select"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); }}
          >
            <option value="">Nobody</option>
            {roster
              // Only people who still work here. A revoked membership stays on
              // the roster — it is the record that they did — but offering it
              // would produce the API's refusal, and offering what will fail is
              // just a slower error.
              .filter((m) => m.membership.isActive)
              .map((m) => (
                <option key={m.membership.userId} value={m.membership.userId}>
                  {m.displayName ?? m.email}
                </option>
              ))}
          </select>
        </label>
        <button
          className="bib-button"
          style={{ flex: "0 0 auto" }}
          disabled={busy || userId === (currentUserId ?? "")}
          onClick={() => { onAssign(userId === "" ? null : userId); }}
        >
          Save
        </button>
      </div>
      <p className="bib-hint">
        Work spawned from an engagement arrives on the client&rsquo;s SPOC for that
        department automatically. Changing it here is an override, and the trail records it
        as one.
      </p>
    </div>
  );
}

/** The steps this filing actually takes, in the firm's own order. */
function Checklist({
  lines,
  canWrite,
  busy,
  onAdd,
  onTick,
  onRemove,
}: {
  lines: readonly ChecklistItem[];
  canWrite: boolean;
  busy: string | null;
  onAdd: (label: string) => void;
  onTick: (id: string, done: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = lines.filter((l) => l.doneAt !== null).length;

  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>
        Checklist{" "}
        <span className="bib-muted" style={{ fontWeight: 400, fontSize: 13 }}>
          {done}/{lines.length}
        </span>
      </h2>
      {lines.length === 0 && (
        <p className="bib-muted" style={{ fontSize: 14 }}>
          Nothing on it yet. This is the firm&rsquo;s own list for this task — separate from
          the process steps, which live on the job.
        </p>
      )}
      {lines.map((line) => (
        <div key={line.id} className="bib-row-between" style={{ padding: "4px 0" }}>
          <label className="bib-check">
            <input
              type="checkbox"
              checked={line.doneAt !== null}
              disabled={!canWrite || busy === line.id}
              onChange={(e) => { onTick(line.id, e.target.checked); }}
            />
            <span data-inactive={line.doneAt !== null}>{line.label}</span>
          </label>
          {canWrite && line.doneAt === null && (
            <button
              className="bib-button-quiet"
              disabled={busy === line.id}
              onClick={() => { onRemove(line.id); }}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {canWrite && (
        <div className="bib-field-row" style={{ marginTop: "var(--bib-gap-2)" }}>
          <input
            className="bib-input"
            value={draft}
            placeholder="Add a line"
            aria-label="New checklist line"
            onChange={(e) => { setDraft(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() !== "") {
                onAdd(draft.trim());
                setDraft("");
              }
            }}
          />
          <button
            className="bib-button-quiet"
            style={{ flex: "0 0 auto" }}
            disabled={busy === "checklist" || draft.trim() === ""}
            onClick={() => {
              onAdd(draft.trim());
              setDraft("");
            }}
          >
            Add
          </button>
        </div>
      )}
      {/* A ticked line cannot be removed, and the screen says so before somebody
          goes looking for the button. The tick is the record that a person did
          something and it lives nowhere else. */}
      <p className="bib-hint">
        A ticked line cannot be removed — untick it first if it was ticked by mistake.
      </p>
    </div>
  );
}

/** Every review this task has been through, newest first. */
function Reviews({
  reviews,
  openReview,
  canWrite,
  busy,
  onRequest,
  onDecide,
}: {
  reviews: readonly WorkItemReview[];
  openReview: WorkItemReview | null;
  canWrite: boolean;
  busy: string | null;
  onRequest: () => void;
  onDecide: (approvalId: string, decision: "approved" | "rejected", notes: string | null) => void;
}) {
  return (
    <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Review</h2>

      {openReview === null ? (
        <>
          <p className="bib-muted" style={{ fontSize: 14 }}>
            Nothing is waiting to be checked.
          </p>
          {canWrite && (
            <button className="bib-button" disabled={busy === "review"} onClick={onRequest}>
              Send for review
            </button>
          )}
        </>
      ) : (
        <DecideReview review={openReview} canWrite={canWrite} busy={busy} onDecide={onDecide} />
      )}

      {reviews.length > 0 && (
        <table className="bib-table" style={{ marginTop: "var(--bib-gap-2)" }}>
          <thead>
            <tr>
              <th>Sent</th>
              <th>By</th>
              <th>Rule</th>
              <th>Outcome</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id}>
                <td className="bib-mono">{r.submittedAt.slice(0, 10)}</td>
                {/* Null is a real answer: the task was unassigned when the check
                    opened, so nobody is recorded as having made it — and maker
                    != checker then has nothing to compare. */}
                <td>{r.submittedByName ?? <span className="bib-muted">nobody recorded</span>}</td>
                <td className="bib-muted">{r.policyLabel ?? "no particular rule"}</td>
                <td>
                  <span
                    className="bib-pill"
                    data-tone={
                      r.decision === "rejected"
                        ? "revoked"
                        : r.decision === "pending"
                          ? "live"
                          : undefined
                    }
                  >
                    {r.decision}
                  </span>
                </td>
                <td className="bib-muted">{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The open check, and the two buttons.
 *
 * The eligible-checkers list is fetched lazily, when somebody expands it: it is
 * the whole roster with a verdict each, and it is only interesting when the
 * answer is "not you".
 */
function DecideReview({
  review,
  canWrite,
  busy,
  onDecide,
}: {
  review: WorkItemReview;
  canWrite: boolean;
  busy: string | null;
  onDecide: (approvalId: string, decision: "approved" | "rejected", notes: string | null) => void;
}) {
  const [notes, setNotes] = useState("");
  const [checkers, setCheckers] = useState<WorkItemChecker[] | null>(null);

  async function loadCheckers(): Promise<void> {
    const result = await api.GET("/api/v1/work-item-checks/{approvalId}/checkers", {
      params: { path: { approvalId: review.id } },
    });
    setCheckers(result.error ? [] : result.data.checkers);
  }

  return (
    <>
      <p className="bib-callout">
        Waiting to be checked since {review.submittedAt.slice(0, 10)}
        {review.submittedByName !== null && `, made by ${review.submittedByName}`}
        {review.policyLabel !== null && ` · ${review.policyLabel}`}
      </p>

      {canWrite && (
        <>
          <label className="bib-label">
            Note
            <textarea
              className="bib-textarea"
              rows={2}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); }}
            />
            <span className="bib-hint">
              Required when you send it back. Why work came back is the only thing that ever
              explains rework — marking the task done later erases that it was rejected at all.
            </span>
          </label>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <button
              className="bib-button"
              disabled={busy === review.id}
              onClick={() => { onDecide(review.id, "approved", notes.trim() || null); }}
            >
              Approve
            </button>
            <button
              className="bib-button-quiet bib-button-danger"
              disabled={busy === review.id || notes.trim() === ""}
              onClick={() => { onDecide(review.id, "rejected", notes.trim()); }}
            >
              Send back
            </button>
          </div>
        </>
      )}

      <details style={{ marginTop: "var(--bib-gap-2)" }}>
        <summary
          onClick={() => {
            if (checkers === null) void loadCheckers();
          }}
        >
          Who may check this?
        </summary>
        {checkers === null ? (
          <p className="bib-muted" style={{ fontSize: 13 }}>
            Loading…
          </p>
        ) : (
          <table className="bib-table">
            <tbody>
              {checkers.map((c) => (
                <tr key={c.userId}>
                  <td>{c.displayName}</td>
                  <td className="bib-muted">{c.gradeName ?? "ungraded"}</td>
                  <td>
                    {c.eligible ? (
                      <span className="bib-pill" data-tone="live">
                        may check
                      </span>
                    ) : (
                      // The REASON, always. "You cannot check this" with no
                      // reason is how a person concludes the button is broken.
                      <span className="bib-muted">{c.reason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </>
  );
}
