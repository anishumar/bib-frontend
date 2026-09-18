"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import {
  Button,
  cx,
  Field,
  FieldStack,
  Input,
  LinkButton,
  Meta,
  MetaItem,
  Select,
  Switch,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import type {
  ChecklistItem,
  Member,
  Principal,
  WorkItem,
  WorkItemChecker,
  WorkItemDependency,
  WorkItemDetail,
  WorkItemReview,
  WorkVocabulary,
} from "@/lib/api/client";
import {
  Card,
  CardTitle,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { browserDay, longDay, longInstant } from "@/lib/day";
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

  /**
   * Every mutation funnels through here so one place owns the busy flag, the
   * error message and the reload.
   *
   * IT RETURNS WHETHER IT WORKED, and that is not bookkeeping. A panel that
   * closes its own form on submit closes it on a REFUSAL too — measured on the
   * dependency picker: the API refused a cycle, the sentence rendered at the
   * top of a 3,000px page, and the form the reader would have corrected it in
   * had already gone. Callers that do not care go on writing `void act(…)`.
   */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      // `setError(null)` above is what makes a REPEAT press re-focus: the
      // notice moves focus when a message appears, so the second press has to
      // be another absent → present transition rather than the same string
      // arriving twice.
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await load();
    setBusy(null);
    return true;
  }

  if (!loaded) return <p className="muted">Loading…</p>;
  if (detail === null) {
    return (
      <Page>
        <div className="cluster">
          <Link href="/work-items">← Work board</Link>
        </div>
        <Notice tone="danger" role="alert">{error ?? "No such task."}</Notice>
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
      <title>{`${item.title} · ${item.clientName}`}</title>

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
                The job
              </LinkButton>
            )}
            <LinkButton size="sm" href={`/clients/${item.clientPartyId}`}>
              The client
            </LinkButton>
          </>
        }
      />
      {/* A REFUSAL TAKES FOCUS, and `ErrorNotice` is where that now lives — the
          ref, the `tabIndex={-1}` and the "only when it appears" rule were
          hand-rolled here first, then measured across the app: thirty screens
          rendered a refusal and three moved focus to it. */}
      <ErrorNotice error={error} />

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
                (turnaround of {item.slaDaysSnapshot} days, as set when this task was raised)
              </span>
            )}
          </MetaItem>
          {item.isStatutoryDue && (
            <MetaItem label="Deadline">
              Legal deadline. The date comes from the law, not from the firm.
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
        emptyHint="Nothing filed on this task yet. Add the challan, the acknowledgement or the register the client sent, so it can be found a year from now."
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

      {/* WHAT THIS WAITS ON. The checklist above is what is INSIDE this task;
          this is what is outside it, and it is the thing that decides whether
          the task can be started at all. `detail.dependencies` has been on the
          wire since T3.1 and no screen has ever drawn it. */}
      <Dependencies
        workItemId={workItemId}
        clientPartyId={item.clientPartyId}
        deps={detail.dependencies}
        canWrite={canWrite}
        busy={busy}
        onAdd={(dependsOnWorkItemId) =>
          act("dependency", () =>
            api.POST("/api/v1/work-items/{workItemId}/dependencies", {
              params: { path: { workItemId } },
              body: { dependsOnWorkItemId },
            }),
          )
        }
        onRemove={(dependencyId) => {
          void act(dependencyId, () =>
            api.DELETE("/api/v1/work-items/{workItemId}/dependencies/{dependencyId}", {
              params: { path: { workItemId, dependencyId } },
            }),
          );
        }}
      />

      <Reviews
        reviews={detail.reviews}
        openReview={openReview}
        openReviewViewer={detail.openReviewViewer}
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

  /**
   * RE-SYNC WHEN THE ITEM MOVES UNDER US, and it now does.
   *
   * `useState(currentStateId)` reads the prop ONCE, at mount, and this
   * component never unmounts — so anything that changed the state from
   * somewhere else left the picker showing the old one. It was latent until
   * 0073: sending a task for review MOVES it into the firm's "with a checker"
   * state, and walking that found the picker still reading "Not Started" on an
   * item the API had already put in "Under Review". The whole point of that
   * change is that the screen stops disagreeing with the record, so a stale
   * picker undoes it exactly.
   *
   * React's own recipe for adjusting state to a prop — compare against what was
   * last seen and set during render — rather than an effect (which renders the
   * wrong value once first) or a `key` on the parent (which remounts, blurring
   * whatever had focus). Only the SELECTION is reset: a half-typed block reason
   * belongs to the person typing it.
   */
  const [seenStateId, setSeenStateId] = useState(currentStateId);
  if (seenStateId !== currentStateId) {
    setSeenStateId(currentStateId);
    setStateId(currentStateId);
  }
  const target = vocabulary.states.find((s) => s.id === stateId) ?? null;
  const needsReason = target?.isBlocked ?? false;

  return (
    <Card>
      <CardTitle level={2}>Change state</CardTitle>
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
          hint="Required for this state. Say what is holding it up. The note stays on the task and is not written to the audit trail."
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
          ? "The client's contacts see this task, its status and, if it is held up, the reason recorded on it. They never see who it is assigned to or its priority."
          : "Hidden from the client portal. Use this for internal work about a client, such as a write-off discussion, a quality review or a credit decision."}
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
        A task created from an engagement goes to the client&rsquo;s SPOC for that Dept on its
        own. Changing it here overrides that, and the change is recorded.
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
          Nothing on it yet. This is your firm&rsquo;s own to-do list for this task. The process
          steps are on the job.
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
        A ticked line cannot be removed. Untick it first if it was ticked by mistake.
      </p>
    </Card>
  );
}

/** Every review this task has been through, newest first. */
function Reviews({
  reviews,
  openReview,
  openReviewViewer,
  canWrite,
  busy,
  onRequest,
  onDecide,
}: {
  reviews: readonly WorkItemReview[];
  openReview: WorkItemReview | null;
  /** The API's verdict on whether the CALLER may decide the open review. Null
   *  when there is none open. */
  openReviewViewer: WorkItemDetail["openReviewViewer"];
  canWrite: boolean;
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
          viewer={openReviewViewer}
          canWrite={canWrite}
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
                <Td className="muted">{r.notes ?? "no note"}</Td>
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
  viewer,
  canWrite,
  busy,
  onDecide,
}: {
  review: WorkItemReview;
  viewer: WorkItemDetail["openReviewViewer"];
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
      <Notice>
        Waiting to be checked since {longInstant(review.submittedAt)}
        {review.submittedByName !== null && `, made by ${review.submittedByName}`}
        {review.policyLabel !== null && ` · ${review.policyLabel}`}
      </Notice>

      {/* THE WHOLE RULE, FROM THE API — and it used to be a third of it.
          This screen derived maker != checker from `submittedBy` and could see
          nothing else, so a Manager who was not senior enough, or who was not
          on the firm's ladder at all, was offered a button whose only outcome
          was a 403. The queue screen has shown the full verdict since T2.9
          because `/work-item-checks` sends one per row; the same person, asking
          the same question, got two different answers depending on which screen
          they were standing on. `openReviewViewer` closes that, and it is the
          queue's own computation rather than a second copy of it.

          IT SAYS WHY rather than greying the button out. "You did this work"
          and "nobody has put you on the ladder" are different problems and only
          one of them is the reader's to fix — the API returns the sentence, and
          this prints it. */}
      {canWrite && viewer !== null && !viewer.eligible && (
        /* THE API'S SENTENCE ALONE. It ended "…Somebody else on the list
           below has to" while the local rule was the only thing here, and the
           API's own maker sentence already ends "Somebody else has to — that is
           the rule the firm is audited on" — so the two ran together and said
           it twice, which is this repo's oldest bug in its newest costume.
           Every message in `INELIGIBILITY_MESSAGES` is a complete sentence, and
           the list of who CAN is a disclosure directly beneath this. */
        <Notice tone="warn">{viewer.reason ?? "You cannot check this one."}</Notice>
      )}

      {canWrite && (viewer === null || viewer.eligible) && (
        <>
          {/* Measured on the page: this control's accessible NAME was
              "NoteRequired when you send it back. Why work came back is the only
              thing that ever explains rework…" — the whole paragraph, read back
              on every focus, because the <span> sat inside the <label>. As a
              `hint` it is a description, which is what it is. */}
          <Field
            label="Note"
            hint="Required when you send it back. Say what needs fixing, so the reason stays on record."
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
                  <Td className="muted">{c.gradeName ?? "no grade set"}</Td>
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

/**
 * WHAT THIS TASK WAITS ON — add one, and lift one (T3.1's last unrendered read).
 *
 * ## It had no screen at all, and the read had no reader
 *
 * `POST /work-items/{id}/dependencies` and its DELETE shipped with the module,
 * `WorkItemDetail.dependencies` came back on every read of this page, and
 * nothing rendered any of it. So "the annual filing waits on twelve monthly
 * ones" — the API's own example — was a curl command, and the only place the
 * relationship surfaced was a refusal when somebody tried to start the task.
 *
 * ## The API is the thing that refuses, and its sentences are shown verbatim
 *
 * Three refusals live behind these two buttons and none of them is
 * re-implemented here:
 *
 * - **A cycle.** Direct or through a chain, and the service walks the firm's
 *   whole edge list to find it — reachability is not expressible as a CHECK, so
 *   the database catches only the self-edge. A picker cannot prevent this
 *   without duplicating that walk in the browser, which is a second answer to a
 *   question that must only have one.
 * - **A duplicate.** "this item already waits on that one".
 * - **Starting while it still waits.** Moving out of the starting state is
 *   refused while any blocker is unfinished — and moving straight to a terminal
 *   state is still allowed, because cancelling something that never started is
 *   a real act. That refusal arrives on the state picker, not here, and this
 *   panel is what explains it.
 *
 * ## Finished blockers are shown, and shown as finished
 *
 * A dependency does not disappear when the thing it waits on is done — it
 * becomes the record of what this task used to wait on. Drawing it like a live
 * one would put a reason in front of somebody to lift a dependency that is not
 * costing anything; hiding it would make the history vanish. `dependsOnIsTerminal`
 * is the FLAG, so a firm that calls its finished state "Filed" gets the right
 * answer without this screen knowing the word.
 *
 * ## The picker offers this client's OTHER work, and nothing else
 *
 * A firm's board is thousands of rows and a `<select>` over it is not a choice
 * anybody can make. The dependency that actually gets recorded is between two
 * pieces of work for the same client — the API's own example is one company's
 * twelve monthly returns and its annual one — so the list is
 * `?clientPartyId=…&includeDone=true`, minus this item and minus what it
 * already waits on. **A dependency across two clients cannot be recorded from
 * this screen**, and that is a real limit rather than an oversight: the
 * alternative is a picker nobody can read, and the route is still there for the
 * day somebody needs one.
 */
function Dependencies({
  workItemId,
  clientPartyId,
  deps,
  canWrite,
  busy,
  onAdd,
  onRemove,
}: {
  workItemId: string;
  clientPartyId: string;
  deps: readonly WorkItemDependency[];
  canWrite: boolean;
  busy: string | null;
  /** Resolves true when the API accepted it. The form stays open otherwise —
   *  see the note on the `action` below. */
  onAdd: (dependsOnWorkItemId: string) => Promise<boolean>;
  onRemove: (dependencyId: string) => void;
}) {
  const [candidates, setCandidates] = useState<WorkItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const { panel: formRef, trigger: openRef } = useSwapFocus(adding);

  /**
   * The candidate list, loaded when the FORM opens and not when the select is
   * focused.
   *
   * A native `<select>` opens the instant it is clicked, so options fetched on
   * its own focus arrive after the reader is already looking at an empty list —
   * `/client-requests` shipped that bug and this is the same shape. Opening the
   * disclosure is the earliest honest moment, and it is a whole interaction
   * ahead of the click.
   */
  async function open(): Promise<void> {
    setAdding(true);
    if (candidates !== null) return;
    const result = await api.GET("/api/v1/work-items", {
      params: {
        query: {
          clientPartyId,
          // Finished work is offered too. It records what this task used to
          // wait on, which is a legitimate thing to write down after the fact,
          // and the option says so rather than the list quietly being short.
          includeDone: "true",
          asOf: browserDay(),
        },
      },
    });
    setCandidates(result.error ? [] : result.data.items);
  }

  const already = new Set(deps.map((d) => d.dependsOnWorkItemId));
  const offerable = (candidates ?? []).filter(
    (i) => i.id !== workItemId && !already.has(i.id),
  );
  const open_ = deps.filter((d) => !d.dependsOnIsTerminal);

  return (
    <Card>
      <CardTitle level={2}>
        What this waits on{" "}
        {deps.length > 0 && (
          <span className="annot text-sm">
            {open_.length}/{deps.length} still open
          </span>
        )}
      </CardTitle>
      <p className="muted text-md">
        Use this when one task cannot start until another is finished, for example an annual
        filing that waits on twelve monthly ones. While anything here is unfinished, this task
        cannot be moved out of its starting state. It can still be cancelled.
      </p>

      {deps.length === 0 ? (
        <p className="muted text-md">
          Nothing. This can be started whenever somebody picks it up.
        </p>
      ) : (
        deps.map((d) => (
          <div key={d.id} className="row py-1">
            <span>
              <Link href={`/work-items/${d.dependsOnWorkItemId}`}>{d.dependsOnTitle}</Link>{" "}
              {/* THE FIRM'S OWN WORD FOR THE STATE, with the tone taken from
                  the FLAG. Nothing here compares a state code — a firm may call
                  its finished state anything, and `/work-items` and this page
                  must not disagree about which of its own states means done. */}
              <Pill tone={d.dependsOnIsTerminal ? "ok" : "warn"}>{d.dependsOnStateName}</Pill>
            </span>
            {canWrite && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === d.id}
                /* NAMED BY WHAT IT WAITS ON. A task waiting on four things
                   draws four of these and the visible word never changes. */
                aria-label={`Stop waiting on ${d.dependsOnTitle}`}
                onClick={() => {
                  onRemove(d.id);
                }}
              >
                Remove
              </Button>
            )}
          </div>
        ))
      )}

      {canWrite &&
        (adding ? (
          <div ref={formRef} tabIndex={-1}>
            <form
              style={{ marginTop: "var(--s-3)" }}
              /* CLOSES ONLY ON SUCCESS. A form that closes on submit closes
                 on a REFUSAL too, and the API refuses a cycle through a chain —
                 which is not something a picker could have prevented. Measured:
                 the sentence rendered at the top of the page and the form the
                 reader would have corrected it in had already gone. */
              action={(form) => {
                const id = String(form.get("dependsOn") ?? "");
                if (id === "") return;
                void onAdd(id).then((ok) => {
                  if (ok) setAdding(false);
                });
              }}
            >
              <fieldset className="fieldset" aria-label="Make this task wait on another">
                <FieldStack>
                  <Field
                    label="Wait on"
                    hint="Only this client's other tasks are listed. A task for another client cannot be chosen here."
                  >
                    {/* NO PRE-SELECTED TASK. A dependency recorded against
                        whatever sorted first is a wrong fact rather than a
                        typo, and it is one that stops work. */}
                    <Select name="dependsOn" required defaultValue="" disabled={candidates === null}>
                      <option value="" disabled>
                        {candidates === null
                          ? "Loading this client's work…"
                          : offerable.length === 0
                            ? "Nothing left to wait on"
                            : "Choose a task"}
                      </option>
                      {offerable.map((i) => (
                        /* PARENTHESES, NOT AN EM DASH. A calendar-raised
                           title is already "TDS deposit — Cobalt Logistics
                           Private Limited — Jul 2026", so a dash before the
                           state made it read as a fourth part of the title. */
                        <option key={i.id} value={i.id}>
                          {i.title} ({i.state.name})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="cluster">
                    <Button type="submit" loading={busy === "dependency"}>
                      {busy === "dependency" ? "Adding…" : "Make it wait"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setAdding(false);
                      }}
                    >
                      Cancel
                    </Button>
                    {/* THE REFUSAL IS BETTER THAN ANY PICKER. A loop through a
                        chain is not visible in a dropdown, and the service
                        walks the firm's whole edge list to find one — so the
                        screen says the check exists rather than pretending to
                        have prevented it. The sentence itself is rendered raw
                        by the page's error notice. */}
                    <p className="field-hint">
                      Two tasks cannot wait on each other, directly or through a chain. That
                      would mean neither could ever start.
                    </p>
                  </div>
                </FieldStack>
              </fieldset>
            </form>
          </div>
        ) : (
          <div className="cluster" style={{ marginTop: "var(--s-3)" }}>
            <Button
              ref={openRef}
              variant="secondary"
              size="sm"
              onClick={() => {
                void open();
              }}
            >
              Make it wait on something
            </Button>
          </div>
        ))}
    </Card>
  );
}
