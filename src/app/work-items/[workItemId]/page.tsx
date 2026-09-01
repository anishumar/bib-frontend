"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import { Card, CardHead, CardTitle, LinkButton, Switch, Td, Th } from "@/components/ui";
import type {
  ChecklistItem,
  Member,
  Principal,
  WorkItemChecker,
  WorkItemDetail,
  WorkItemReview,
  WorkVocabulary,
} from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { ClientAsks } from "./client-asks";
import { Documents } from "@/lib/ui/documents";

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

  if (!loaded) return <p className="muted">Loading…</p>;
  if (detail === null) {
    return (
      <Page>
        <div className="cluster">
          <Link href="/work-items">← Work</Link>
        </div>
        <p className="notice" data-tone="danger" role="alert">{error ?? "No such work item."}</p>
      </Page>
    );
  }

  const item = detail.item;
  const openReview = detail.reviews.find((r) => r.decision === "pending") ?? null;
  const canWrite = me?.permissions.includes("work:write") ?? false;

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title={<>{item.title}</>}
        lede={
          <>
            {item.clientName}
            {item.entityName !== null &&
              item.entityName !== item.clientName &&
              ` · ${item.entityName}`}
            {item.deptName !== null && ` · ${item.deptName}`}
          </>
        }
        /* The two things this item hangs off. Siblings, not breadcrumbs: the
           sidebar already says where you are, and these say what else to open. */
        aside={
          <>
            {item.jobId !== null && (
              <LinkButton size="sm" href={`/work/${item.jobId}`}>
                The process
              </LinkButton>
            )}
            <LinkButton size="sm" href={`/clients/${item.clientPartyId}`}>
              The client
            </LinkButton>
          </>
        }
      />
      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      <div className="card">
        <dl className="meta">
          <Fact label="State">
            <span
              className="pill"
              data-tone={
                item.state.isBlocked ? "danger" : item.state.isTerminal ? undefined : "accent"
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
              <span className="muted">Nobody</span>
            ) : (
              (item.assignee.displayName ?? item.assignee.email)
            )}
          </Fact>
          <Fact label="Due">
            {item.dueOn ?? "no date"}
            {item.slaDaysSnapshot !== null && (
              <span className="muted text-xs">
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
          <p className="notice">{item.assignmentNote}</p>
        )}
        {item.state.isBlocked && item.blockedReason !== null && (
          <p className="notice">
            <strong>Blocked:</strong> {item.blockedReason}
          </p>
        )}
        {item.blockedByOpen.length > 0 && (
          <p className="notice">
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

      {canWrite && (
        <ClientVisibility
          visible={item.isClientVisible}
          busy={busy === "visibility"}
          onChange={(isClientVisible) => {
            void act("visibility", () =>
              api.PATCH("/api/v1/work-items/{workItemId}", {
                params: { path: { workItemId } },
                body: { isClientVisible },
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

      {/* WHAT WE ARE WAITING ON THE CLIENT FOR (T6.6). Below the visibility
          switch on purpose: an ask about work the client cannot see never
          reaches them, and the panel says so when the switch is off. */}
      <ClientAsks
        workItemId={workItemId}
        canWrite={canWrite}
        isClientVisible={item.isClientVisible}
      />

      {/* ── THE FILES ON THIS TASK (T6.7) ───────────────────────────────────

          `subject_kind = 'work_item'` was added by migration 0063 so a client's
          uploaded answer files itself against the job that asked for it — *"the
          person who raised the ask is looking at the work item, and a file
          reachable only through the ask would not arrive where they are
          looking."* And then nothing on this page listed those files: the ask
          panel above names the filename of each response and there was no other
          reader at all.

          It is also where the CLIENT-VISIBILITY switch on each document lives.
          `is_client_visible` (0066) decides whether a file appears in the
          client's own portal library, enforced by a database policy — and T6.5
          named the failure this avoids on the flag one card above: *a flag the
          portal enforces and no screen can change is a wall built against a
          value nobody can move.*

          `partyId` is the task's CLIENT, so a file uploaded here belongs to them
          rather than to the firm — which is what makes the switch mean anything
          at all. */}
      <Documents
        subjectKind="work_item"
        subjectRef={workItemId}
        partyId={item.clientPartyId}
        canWrite={canWrite}
        emptyHint="Nothing filed against this task yet. A challan, an acknowledgement, the register the client sent — whatever somebody would go looking for a year from now."
      />

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
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
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
    <div className="card" style={{ marginTop: "var(--s-4)" }}>
      <h2 className="card-title">Move it</h2>
      <div className="field-row">
        <label className="label">
          State
          <select
            className="select"
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
          className="btn"
          // `.field-row` lays out its children on a `minmax(12rem, 1fr)` grid, which is right for the
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
        <label className="label">
          Why is it stuck?
          <textarea
            className="textarea"
            value={reason}
            rows={2}
            onChange={(e) => { setReason(e.target.value); }}
          />
          {/* The capture-or-lose half, said out loud. At the moment somebody
              blocks a task the reason is obvious to everybody in the room and
              nobody writes it down; a year later "are our delays ours or the
              client's" has no query that can answer it. */}
          <span className="field-hint">
            Required for this state, and it is the only thing that will ever explain the
            delay. It stays on the task and never enters the audit log — the log cannot be
            erased and this names people.
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * WHAT THE CLIENT SEES — the control behind `is_client_visible`.
 *
 * The column has existed since migration 0051, carrying the client's own words
 * (*"Clients would be able to see their tasks"*), and until T6.5 nothing read
 * it and no screen could set it: it was writable over HTTP and reachable from
 * nowhere. The portal is now its reader — enforced in the DATABASE, by a
 * restrictive policy (0062), so a portal read that forgets the filter still
 * cannot return an internal note — and this is its writer.
 *
 * A switch and not a checkbox in a form: it takes effect on the client's page
 * immediately, which is what a switch means and a Save button would misdescribe.
 * The sentence under it names the consequence in both directions, because the
 * cost of getting it wrong is asymmetric — a task wrongly hidden is a client
 * left in the dark, and a task wrongly shown is an internal note read by the
 * person it is about.
 */
function ClientVisibility({
  visible,
  busy,
  onChange,
}: {
  visible: boolean;
  busy: boolean;
  onChange: (visible: boolean) => void;
}) {
  return (
    <Card>
      <CardHead>
        <CardTitle>What the client sees</CardTitle>
      </CardHead>
      {/* The Switch carries its own label, so there is no <Field> around it —
          two labels on one control is what a screen reader reads out twice.
          The explanation goes under it as a hint, which is where every hint in
          this app goes. */}
      <Switch
        label="Show this on the client portal"
        checked={visible}
        disabled={busy}
        onChange={(e) => { onChange(e.target.checked); }}
      />
      <p className="field-hint">
        {visible
          ? "Their own contacts see this task, its status and — if it is held up — the reason recorded on it. They never see who it is assigned to, its priority, or the description above."
          : "Hidden from the client portal. This is where internal work about a client belongs: a write-off discussion, a quality review, a credit decision."}
      </p>
    </Card>
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
    <div className="card" style={{ marginTop: "var(--s-4)" }}>
      <h2 className="card-title">Whose desk</h2>
      <div className="field-row">
        <label className="label">
          Owner
          <select
            className="select"
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
          className="btn"
          style={{ flex: "0 0 auto" }}
          disabled={busy || userId === (currentUserId ?? "")}
          onClick={() => { onAssign(userId === "" ? null : userId); }}
        >
          Save
        </button>
      </div>
      <p className="field-hint">
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
    <div className="card" style={{ marginTop: "var(--s-4)" }}>
      <h2 className="card-title">
        Checklist{" "}
        <span className="annot text-sm">
          {done}/{lines.length}
        </span>
      </h2>
      {lines.length === 0 && (
        <p className="muted text-md">
          Nothing on it yet. This is the firm&rsquo;s own list for this task — separate from
          the process steps, which live on the job.
        </p>
      )}
      {lines.map((line) => (
        <div key={line.id} className="row" style={{ padding: "4px 0" }}>
          <label className="check">
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
              className="btn" data-variant="secondary" data-size="sm"
              disabled={busy === line.id}
              onClick={() => { onRemove(line.id); }}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {canWrite && (
        <div className="field-row">
          <input
            className="input"
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
            className="btn" data-variant="secondary" data-size="sm"
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
      <p className="field-hint">
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
    <div className="card" style={{ marginTop: "var(--s-4)" }}>
      <h2 className="card-title">Review</h2>

      {openReview === null ? (
        <>
          <p className="muted text-md">
            Nothing is waiting to be checked.
          </p>
          {canWrite && (
            <button className="btn" disabled={busy === "review"} onClick={onRequest}>
              Send for review
            </button>
          )}
        </>
      ) : (
        <DecideReview review={openReview} canWrite={canWrite} busy={busy} onDecide={onDecide} />
      )}

      {reviews.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <Th>Sent</Th>
              <Th>By</Th>
              <Th>Rule</Th>
              <Th>Outcome</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id}>
                <Td className="mono">{r.submittedAt.slice(0, 10)}</Td>
                {/* Null is a real answer: the task was unassigned when the check
                    opened, so nobody is recorded as having made it — and maker
                    != checker then has nothing to compare. */}
                <Td>{r.submittedByName ?? <span className="muted">nobody recorded</span>}</Td>
                <Td className="muted">{r.policyLabel ?? "no particular rule"}</Td>
                <Td>
                  <span
                    className="pill"
                    data-tone={
                      r.decision === "rejected"
                        ? "danger"
                        : r.decision === "pending"
                          ? "accent"
                          : undefined
                    }
                  >
                    {r.decision}
                  </span>
                </Td>
                <Td className="muted">{r.notes ?? "—"}</Td>
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
      <p className="notice">
        Waiting to be checked since {review.submittedAt.slice(0, 10)}
        {review.submittedByName !== null && `, made by ${review.submittedByName}`}
        {review.policyLabel !== null && ` · ${review.policyLabel}`}
      </p>

      {canWrite && (
        <>
          <label className="label">
            Note
            <textarea
              className="textarea"
              rows={2}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); }}
            />
            <span className="field-hint">
              Required when you send it back. Why work came back is the only thing that ever
              explains rework — marking the task done later erases that it was rejected at all.
            </span>
          </label>
          <div className="cluster" style={{ marginBottom: 0 }}>
            <button
              className="btn"
              disabled={busy === review.id}
              onClick={() => { onDecide(review.id, "approved", notes.trim() || null); }}
            >
              Approve
            </button>
            <button
              className="btn" data-variant="destructive-quiet" data-size="sm"
              disabled={busy === review.id || notes.trim() === ""}
              onClick={() => { onDecide(review.id, "rejected", notes.trim()); }}
            >
              Send back
            </button>
          </div>
        </>
      )}

      <details style={{ marginTop: "var(--s-4)" }}>
        <summary
          onClick={() => {
            if (checkers === null) void loadCheckers();
          }}
        >
          Who may check this?
        </summary>
        {checkers === null ? (
          <p className="muted text-sm">
            Loading…
          </p>
        ) : (
          <table className="table">
            <tbody>
              {checkers.map((c) => (
                <tr key={c.userId}>
                  <Td>{c.displayName}</Td>
                  <Td className="muted">{c.gradeName ?? "ungraded"}</Td>
                  <Td>
                    {c.eligible ? (
                      <span className="pill" data-tone="accent">
                        may check
                      </span>
                    ) : (
                      // The REASON, always. "You cannot check this" with no
                      // reason is how a person concludes the button is broken.
                      <span className="muted">{c.reason}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </>
  );
}
