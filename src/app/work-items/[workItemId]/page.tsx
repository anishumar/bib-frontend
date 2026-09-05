"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import {
  Button,
  cx,
  Field,
  Input,
  LinkButton,
  Meta,
  MetaItem,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import type {
  ChecklistItem,
  Member,
  Principal,
  WorkItemChecker,
  WorkItemDetail,
  WorkItemReview,
  WorkVocabulary,
} from "@/lib/api/client";
import {
  Card,
  CardTitle,
  Notice,
  Page,
  PageHeader,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { longDay, longInstant } from "@/lib/day";
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
        <Notice tone="danger" role="alert">{error ?? "No such work item."}</Notice>
      </Page>
    );
  }

  const item = detail.item;
  const openReview = detail.reviews.find((r) => r.decision === "pending") ?? null;
  const canWrite = me?.permissions.includes("work:write") ?? false;

  return (
    <Page>
      {/* The tab carries the identifier, the same as the proposal and the
          engagement letter. Walked with several tabs open and this one was
          "BiB — 10X Workspace" while its neighbours said which document they
          were: the tab strip is how a person finds their way back. */}
      <title>{`${item.title} — ${item.clientName}`}</title>

      <PageHeader
        eyebrow="Delivery"
        title={item.title}
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
        actions={
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
      {error !== null && (
        <Notice tone="danger" role="alert">{error}</Notice>
      )}

      <Card>
        <Meta>
          <MetaItem label="State">
            {/* `ok`, not `accent`. In `components/tw` "accent" is shadcn's hover
                ground; this product's status teal is `ok`, and confusing the
                two has painted a status colour onto furniture three times. */}
            <Pill
              tone={
                item.state.isBlocked ? "danger" : item.state.isTerminal ? "neutral" : "ok"
              }
            >
              {item.state.name}
            </Pill>
          </MetaItem>
          <MetaItem label="Priority">{item.priority.name}</MetaItem>
          <MetaItem label="Owner">
            {/* "Nobody", and nothing else. The REASON is the callout below —
                printing it here too made the fact grid six lines tall and said
                the same sentence twice, which is what opening the page found. */}
            {item.assignee === null ? (
              <span className="muted">Nobody</span>
            ) : (
              (item.assignee.displayName ?? item.assignee.email)
            )}
          </MetaItem>
          <MetaItem label="Due">
            {item.dueOn === null ? "no date" : longDay(item.dueOn)}
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
          </MetaItem>
          {item.isStatutoryDue && (
            <MetaItem label="Deadline">
              Statutory — the date comes from the law, not from the firm
            </MetaItem>
          )}
          <MetaItem label="Client can see this">{item.isClientVisible ? "Yes" : "No"}</MetaItem>
        </Meta>

        {item.assignee === null && item.assignmentNote !== null && (
          <Notice>{item.assignmentNote}</Notice>
        )}
        {/* `warn`, not `danger`: held up is not the same as wrong, and this
            product's rule is that a block is warn. */}
        {item.state.isBlocked && item.blockedReason !== null && (
          <Notice tone="warn">
            <strong>Blocked:</strong> {item.blockedReason}
          </Notice>
        )}
        {item.blockedByOpen.length > 0 && (
          <Notice tone="warn">
            Cannot start until {item.blockedByOpen.map((b) => b.title).join(", ")}{" "}
            {item.blockedByOpen.length === 1 ? "is" : "are"} finished.
          </Notice>
        )}
      </Card>

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
        meUserId={me?.userId ?? null}
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
    <Card>
      <CardTitle level={2}>Move it</CardTitle>
      <div className="field-row">
        <Field label="State">
          <Select
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
          </Select>
        </Field>
        <Button
          /* The diagnosis on the line that used to be here was right and the
             cure was not: `.field-row` IS a `minmax(12rem, 1fr)` grid, and that
             is exactly why `flex: 0 0 auto` did nothing about it — `flex` is
             read by flex containers only. Measured on the page, this button was
             551px wide, the banner the old comment was trying to prevent.
             `justify-self` is the grid property that means the same thing: 68px.
             A utility rather than an inline style: `.btn` never declares
             `justify-self`, so there is nothing unlayered for it to lose to. */
          className="justify-self-start"
          /* Two cards on this screen each have a "Save". They do different
             things to different fields and the word alone says neither. */
          aria-label="Save the new state"
          disabled={busy || stateId === currentStateId || (needsReason && reason.trim() === "")}
          onClick={() => {
            onMove(stateId, needsReason ? reason.trim() : null);
          }}
        >
          Save
        </Button>
      </div>

      {needsReason && (
        /* The capture-or-lose half, said out loud. At the moment somebody
           blocks a task the reason is obvious to everybody in the room and
           nobody writes it down; a year later "are our delays ours or the
           client's" has no query that can answer it.

           It was a <span> INSIDE the <label>, which makes the whole paragraph
           part of the control's NAME — a screen reader reads the lot back as
           the field's name every time focus lands on it. As a `hint` it is a
           description instead, which is what it is. */
        <Field
          label="Why is it stuck?"
          hint="Required for this state, and it is the only thing that will ever explain the delay. It stays on the task and never enters the audit log — the log cannot be erased and this names people."
        >
          <Textarea
            value={reason}
            rows={2}
            onChange={(e) => { setReason(e.target.value); }}
          />
        </Field>
      )}
    </Card>
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
      <CardTitle level={2}>What the client sees</CardTitle>
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
    <Card>
      <CardTitle level={2}>Whose desk</CardTitle>
      <div className="field-row">
        <Field label="Owner">
          <Select
            value={userId}
            aria-describedby="assign-hint"
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
          </Select>
        </Field>
        <Button
          className="justify-self-start"
          aria-label="Save whose desk this sits on"
          disabled={busy || userId === (currentUserId ?? "")}
          onClick={() => {
            onAssign(userId === "" ? null : userId);
          }}
        >
          Save
        </Button>
      </div>
      {/* Below the row, so it stays the width of the card rather than of one
          grid column — pointed at from the select by id instead of being its
          `hint`. */}
      <p className="field-hint" id="assign-hint">
        Work spawned from an engagement arrives on the client&rsquo;s SPOC for that
        department automatically. Changing it here is an override, and the trail records it
        as one.
      </p>
    </Card>
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
    <Card>
      <CardTitle level={2}>
        Checklist{" "}
        <span className="annot text-sm">
          {done}/{lines.length}
        </span>
      </CardTitle>
      {lines.length === 0 && (
        <p className="muted text-md">
          Nothing on it yet. This is the firm&rsquo;s own list for this task — separate from
          the process steps, which live on the job.
        </p>
      )}
      {lines.map((line) => (
        <div key={line.id} className="row py-1">
          <label className="check">
            <input
              type="checkbox"
              checked={line.doneAt !== null}
              disabled={!canWrite || busy === line.id}
              onChange={(e) => {
                onTick(line.id, e.target.checked);
              }}
            />
            {/* A ticked line is STRUCK THROUGH and dimmed. It carried
                `data-inactive`, which is styled by `.table tbody tr[data-inactive]`
                and by nothing else — on a <span> that selector never matches, so
                a line somebody had ticked measured opacity 1 and the same ink as
                one nobody had touched. The checkbox was the only difference on a
                list whose whole job is what is left to do. */}
            <span className={cx(line.doneAt !== null && "text-muted line-through")}>
              {line.label}
            </span>
          </label>
          {canWrite && line.doneAt === null && (
            /* NAMED BY THE LINE. A checklist is a LIST — five lines draw five
               buttons saying only "Remove", and the demo's checklist is empty,
               which is why no sweep has seen them. The label is what the row
               is, and nothing on this screen renames a line. */
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === line.id}
              aria-label={`Remove "${line.label}" from the checklist`}
              onClick={() => {
                onRemove(line.id);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      {canWrite && (
        <div className="field-row">
          <Input
            value={draft}
            placeholder="Add a line"
            aria-label="New checklist line"
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() !== "") {
                onAdd(draft.trim());
                setDraft("");
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            disabled={busy === "checklist" || draft.trim() === ""}
            onClick={() => {
              onAdd(draft.trim());
              setDraft("");
            }}
          >
            Add
          </Button>
        </div>
      )}
      {/* A ticked line cannot be removed, and the screen says so before somebody
          goes looking for the button. The tick is the record that a person did
          something and it lives nowhere else. */}
      <p className="field-hint">
        A ticked line cannot be removed — untick it first if it was ticked by mistake.
      </p>
    </Card>
  );
}

/** Every review this task has been through, newest first. */
function Reviews({
  reviews,
  openReview,
  canWrite,
  meUserId,
  busy,
  onRequest,
  onDecide,
}: {
  reviews: readonly WorkItemReview[];
  openReview: WorkItemReview | null;
  canWrite: boolean;
  meUserId: string | null;
  busy: string | null;
  onRequest: () => void;
  onDecide: (approvalId: string, decision: "approved" | "rejected", notes: string | null) => void;
}) {
  return (
    <Card>
      <CardTitle level={2}>Review</CardTitle>

      {openReview === null ? (
        <>
          <p className="muted text-md">
            Nothing is waiting to be checked.
          </p>
          {canWrite && (
            <div className="cluster">
              <Button disabled={busy === "review"} onClick={onRequest}>
                Send for review
              </Button>
            </div>
          )}
        </>
      ) : (
        <DecideReview
          review={openReview}
          canWrite={canWrite}
          meUserId={meUserId}
          busy={busy}
          onDecide={onDecide}
        />
      )}

      {reviews.length > 0 && (
        <TableWrap>
        <Table>
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
                {/* `longInstant`, not `.slice(0, 10)`. Slicing an ISO instant
                    takes the UTC day, and a check submitted at 00:20 in Delhi
                    is 18:50 UTC the day BEFORE. The same class of bug this repo
                    has now fixed on eleven screens. */}
                <Td className="mono">{longInstant(r.submittedAt)}</Td>
                {/* Null is a real answer: the task was unassigned when the check
                    opened, so nobody is recorded as having made it — and maker
                    != checker then has nothing to compare. */}
                <Td>{r.submittedByName ?? <span className="muted">nobody recorded</span>}</Td>
                <Td className="muted">{r.policyLabel ?? "no particular rule"}</Td>
                <Td>
                  {/* `approved` is the OK one. This column read the other way
                      round — `pending` in the product's status teal and
                      `approved` in grey — so the outcome that means "somebody
                      signed this off" was the quietest thing in the column and
                      the one that means "nobody has looked yet" was the
                      reassuring one. Waiting is `warn`, which is what "held up"
                      is everywhere else in this product. */}
                  <Pill
                    tone={
                      r.decision === "rejected"
                        ? "danger"
                        : r.decision === "approved"
                          ? "ok"
                          : "warn"
                    }
                  >
                    {r.decision}
                  </Pill>
                </Td>
                <Td className="muted">{r.notes ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        </TableWrap>
      )}
    </Card>
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
  meUserId,
  busy,
  onDecide,
}: {
  review: WorkItemReview;
  canWrite: boolean;
  meUserId: string | null;
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
      <Notice>
        Waiting to be checked since {longInstant(review.submittedAt)}
        {review.submittedByName !== null && `, made by ${review.submittedByName}`}
        {review.policyLabel !== null && ` · ${review.policyLabel}`}
      </Notice>

      {/* MAKER IS NEVER CHECKER, and this screen used to offer Approve to the
          one person guaranteed to be refused by it — the person whose name is
          in the sentence directly above. Walked: pressing it returned "the
          person who did the work can never be the person who checks it", which
          is a good sentence to read AFTER a mistake and a poor thing to make
          somebody press a button to find out.

          It SAYS why rather than greying the button out, which is the shape the
          API asks for in its own words on `WorkItemCheckViewer`: "you did this
          work" and "nobody has put you on the ladder" are different problems
          and only one of them is the viewer's to fix.

          THIS ONLY COVERS MAKER-CHECKER. The queue screen shows the full
          verdict because `/work-item-checks` sends one per row; the work item's
          own `reviews` carry `submittedBy` and no `viewer`, so the ladder and
          grade rules are still only discovered by pressing. Adding `viewer` to
          `WorkItemReview` is the backend change that would close it. */}
      {canWrite && meUserId !== null && review.submittedBy === meUserId && (
        <Notice tone="warn">
          You made this work, so you cannot be the one who checks it. Somebody else on the list
          below has to.
        </Notice>
      )}

      {canWrite && !(meUserId !== null && review.submittedBy === meUserId) && (
        <>
          {/* Measured on the page: this control's accessible NAME was
              "NoteRequired when you send it back. Why work came back is the only
              thing that ever explains rework…" — the whole paragraph, read back
              on every focus, because the <span> sat inside the <label>. As a
              `hint` it is a description, which is what it is. */}
          <Field
            label="Note"
            hint="Required when you send it back. Why work came back is the only thing that ever explains rework — marking the task done later erases that it was rejected at all."
          >
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); }}
            />
          </Field>
          <div className="cluster">
            <Button
              disabled={busy === review.id}
              onClick={() => {
                onDecide(review.id, "approved", notes.trim() || null);
              }}
            >
              Approve
            </Button>
            <Button
              variant="destructive-quiet"
              size="sm"
              disabled={busy === review.id || notes.trim() === ""}
              onClick={() => {
                onDecide(review.id, "rejected", notes.trim());
              }}
            >
              Send back
            </Button>
          </div>
        </>
      )}

      <details className="mt-4">
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
          <TableWrap>
          <Table>
            <tbody>
              {checkers.map((c) => (
                <tr key={c.userId}>
                  <Td>{c.displayName}</Td>
                  <Td className="muted">{c.gradeName ?? "ungraded"}</Td>
                  <Td>
                    {c.eligible ? (
                      <Pill tone="ok">may check</Pill>
                    ) : (
                      // The REASON, always. "You cannot check this" with no
                      // reason is how a person concludes the button is broken.
                      <span className="muted">{c.reason}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </TableWrap>
        )}
      </details>
    </>
  );
}
