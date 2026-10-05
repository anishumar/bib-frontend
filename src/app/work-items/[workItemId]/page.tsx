"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BillEarly } from "@/components/bill-early";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import {
  Button,
  cx,
  Dialog,
  Field,
  FieldStack,
  Input,
  LinkButton,
  Meta,
  MetaItem,
  NotSet,
  Select,
  Switch,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import type {
  ChecklistItem,
  Colleague,
  Principal,
  ReviewRule,
  LinkableFiling,
  TaskFiling,
  WorkItem,
  WorkItemChecker,
  WorkItemDependency,
  WorkItemDetail,
  WorkItemNote,
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
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { browserDay, longDay, longInstant } from "@/lib/day";
import { ClientAsks } from "./client-asks";
import { Documents } from "@/lib/ui/documents";
import { keepTyped } from "@/lib/ui/keep-typed";
import { allPortalDays, PortalDates, portalDaysToday } from "@/lib/ui/portal-dates";

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
 * ── THE REVIEW CLOSES THE LOOP (audit 2026-10-03) ───────────────────────────
 *
 * Approving FINISHES the task: the API moves it to the firm's finished-and-done
 * state (CA#28), so Send for review is not offered again on finished work. Send
 * for review waits for the checklist (CA#30), carries a note for the checker,
 * and is checked under the firm's own rule (CA#27): the dialog says which, or
 * asks when the firm has several. Work sent back says so at the top, with the
 * checker's note, until it is sent again (CA#29).
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
  const [roster, setRoster] = useState<Colleague[]>([]);
  const [me, setMe] = useState<Principal | null>(null);
  const [filing, setFiling] = useState<TaskFiling | null>(null);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // How many of the job's steps went with the task on the last hand-over, so
  // the person handing it out sees the job moved, not only the card.
  const [stepsHandedOver, setStepsHandedOver] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [item, vocab, people, principal, filingRead, rulesRead] = await Promise.all([
      api.GET("/api/v1/work-items/{workItemId}", { params: { path: { workItemId } } }),
      api.GET("/api/v1/work-vocabulary", {}),
      // The colleagues PICKER (`party:read`, like this page), not the roster
      // (`tenant:admin`). Names and rungs, no emails.
      api.GET("/api/v1/tenancy/colleagues", {}),
      api.GET("/api/v1/auth/me", {}),
      // The filing this task files, and the company's open ones (CA#36).
      api.GET("/api/v1/work-items/{workItemId}/filing", { params: { path: { workItemId } } }),
      // The firm's rules for who checks work, for Send for review (CA#27).
      api.GET("/api/v1/review-rules", {}),
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
    setRoster(people.error ? [] : people.data.colleagues);
    setMe(principal.error ? null : principal.data);
    setFiling(filingRead.error ? null : filingRead.data);
    setRules(rulesRead.error ? [] : rulesRead.data.rules);
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
   * closes its own form on submit closes it on a REFUSAL too. Callers that do
   * not care go on writing `void act(…)`.
   */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    // Cleared first, so a REPEAT refusal is a second appearance and takes focus.
    setError(null);
    const result = await call();
    if (result.error) {
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
  const openLines = detail.checklist.filter((l) => l.doneAt === null);
  const finished = item.state.isTerminal;
  // The reviews, and WHERE they go: at the bottom as history, or straight under
  // the details while a check is open, because Approve is then the page's act.
  const reviews = (
    <Reviews
      reviews={detail.reviews}
      openReview={openReview}
      openReviewViewer={detail.openReviewViewer}
      openLines={openLines.length}
      canWrite={canWrite}
      busy={busy}
      filesOnDone={filing?.filesOnDone ?? []}
      onDecide={(approvalId, decision, notes, filedOn) => {
        void act(approvalId, () =>
          api.POST("/api/v1/work-item-checks/{approvalId}/decide", {
            params: { path: { approvalId } },
            body: { decision, notes, ...(filedOn === undefined ? {} : { filedOn }) },
          }),
        );
      }}
    />
  );

  return (
    <Page>
      {/* The tab carries the identifier, the same as the proposal and the
          engagement letter: the tab strip is how a person finds their way back. */}
      <title>{`${item.title} · ${item.clientName}`}</title>

      <PageHeader
        title={item.title}
        /* Who it is for, in one line: data, not an explanation. */
        lede={
          <>
            {item.clientName}
            {item.entityName !== null &&
              item.entityName !== item.clientName &&
              ` · ${item.entityName}`}
            {item.deptName !== null && ` · ${item.deptName}`}
          </>
        }
        /* The two things this item hangs off, and the page's one brand action:
           sending the work for review, while nothing is waiting to be checked
           and the work is not finished. Once a check is open, Approve in the
           Reviews card is the action. */
        actions={
          <>
            {item.jobId !== null && (
              <LinkButton size="sm" variant="ghost" href={`/work/${item.jobId}`}>
                The job
              </LinkButton>
            )}
            <LinkButton size="sm" variant="ghost" href={`/clients/${item.clientPartyId}`}>
              The client
            </LinkButton>
            {canWrite && openReview === null && !finished && (
              <Button
                disabled={busy === "review"}
                onClick={() => {
                  setSending(true);
                }}
              >
                Send for review
              </Button>
            )}
          </>
        }
      />
      {/* A REFUSAL TAKES FOCUS, and `ErrorNotice` is where that lives. */}
      <ErrorNotice error={error} />
      {/* A task finished before its bill date: offer the bill now (Q071 b). */}
      {finished && <BillEarly workItemId={item.id} canWrite={me?.permissions.includes("party:write") ?? false} />}

      {/* SENT BACK (CA#29): said first, with the checker's note, until the work
          goes to be checked again. */}
      {item.sentBack !== null && (
        <Notice tone="warn">
          <p>
            <strong>
              Sent back
              {item.sentBack.decidedByName === null ? "" : ` by ${item.sentBack.decidedByName}`} on{" "}
              {longInstant(item.sentBack.decidedAt)}
            </strong>
            {item.sentBack.notes !== null && <>: {item.sentBack.notes}</>}
          </p>
          <p className="text-sm">Fix what it says, then send it for review again.</p>
        </Notice>
      )}

      <Details
        item={item}
        canWrite={canWrite}
        vocabulary={vocabulary}
        roster={roster}
        busy={busy}
        stepsHandedOver={stepsHandedOver}
        filesOnDone={filing?.filesOnDone ?? []}
        onMove={(stateId, blockedReason, filedOn) =>
          act("state", () =>
            api.POST("/api/v1/work-items/{workItemId}/state", {
              params: { path: { workItemId } },
              body: { stateId, blockedReason, ...(filedOn === undefined ? {} : { filedOn }) },
            }),
          )
        }
        onVisibility={(isClientVisible) => {
          void act("visibility", () =>
            api.PATCH("/api/v1/work-items/{workItemId}", {
              params: { path: { workItemId } },
              body: { isClientVisible },
            }),
          );
        }}
        onAssign={(assigneeUserId) => {
          setStepsHandedOver(null);
          let handed = 0;
          void act("assign", async () => {
            const result = await api.POST("/api/v1/work-items/{workItemId}/assignee", {
              params: { path: { workItemId } },
              body: { assigneeUserId },
            });
            handed = result.data?.stepsHandedOver ?? 0;
            return result;
          }).then((ok) => {
            if (ok && handed > 0) setStepsHandedOver(handed);
          });
        }}
      />

      {openReview !== null && reviews}

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

      <Notes
        notes={detail.notes}
        canWrite={canWrite}
        busy={busy === "note"}
        onAdd={(body) =>
          act("note", () =>
            api.POST("/api/v1/work-items/{workItemId}/notes", {
              params: { path: { workItemId } },
              body: { body },
            }),
          )
        }
      />

      {/* THE FILING THIS TASK FILES (CA#36). Completing the task marks it
          filed on the calendar and the client's portal. */}
      {filing !== null && (
        <Filing
          filing={filing}
          workItemId={workItemId}
          company={item.entityName ?? item.clientName}
          canWrite={canWrite}
          busy={busy === "filing"}
          onLink={(obligationId) =>
            act("filing", () =>
              api.PUT("/api/v1/work-items/{workItemId}/filing", {
                params: { path: { workItemId } },
                body: { obligationId },
              }),
            )
          }
          onUnlink={() => {
            void act("filing", () =>
              api.DELETE("/api/v1/work-items/{workItemId}/filing", { params: { path: { workItemId } } }),
            );
          }}
        />
      )}

      {/* WHAT THIS WAITS ON. The checklist is what is INSIDE this task; this is
          what is outside it, and it decides whether the task can start. */}
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

      {/* WHAT WE ARE WAITING ON THE CLIENT FOR (T6.6). Below the visibility
          switch: an ask about work the client cannot see never reaches them,
          and the panel says so when the switch is off. */}
      <ClientAsks
        workItemId={workItemId}
        canWrite={canWrite}
        isClientVisible={item.isClientVisible}
      />

      {/* ── THE FILES ON THIS TASK (T6.7) ─────────────────────────────────── */}
      <Documents
        subjectKind="work_item"
        subjectRef={workItemId}
        partyId={item.clientPartyId}
        canWrite={canWrite}
        emptyHint="Nothing filed yet. Add the challan, acknowledgement or register here."
      />

      {openReview === null && reviews}

      <SendForReview
        open={sending}
        rules={rules}
        openLines={openLines.map((l) => l.label)}
        busy={busy === "review"}
        onClose={() => {
          setSending(false);
        }}
        onSend={(policyKey, note) => {
          void act("review", () =>
            api.POST("/api/v1/work-items/{workItemId}/review", {
              params: { path: { workItemId } },
              body: { ...(policyKey === null ? {} : { policyKey }), note },
            }),
          ).then((ok) => {
            if (ok) setSending(false);
          });
        }}
      />
    </Page>
  );
}

/**
 * SEND FOR REVIEW, in a dialog (audit 2026-10-03).
 *
 * Three things a person must see before the work leaves their desk, none of
 * which the one-click button said: which of the firm's rules checks it (CA#27,
 * the firm's own, never "anyone but you" when the firm has one), that the
 * checklist is finished (CA#30, the API refuses otherwise and this says which
 * lines), and a box for what to tell the checker (CA#30).
 */
function SendForReview({
  open,
  rules,
  openLines,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  rules: readonly ReviewRule[];
  openLines: readonly string[];
  busy: boolean;
  onClose: () => void;
  onSend: (policyKey: string | null, note: string | null) => void;
}) {
  const formId = useId();
  const [note, setNote] = useState("");
  const [rule, setRule] = useState("");
  const blocked = openLines.length > 0;
  const mustPick = rules.length > 1;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send for review"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={blocked || (mustPick && rule === "")}>
            Send for review
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked || (mustPick && rule === "")) return;
          onSend(mustPick ? rule : null, note.trim() === "" ? null : note.trim());
        }}
      >
        <FieldStack>
          {blocked && (
            <Notice tone="warn">
              <p>
                {openLines.length === 1
                  ? "One checklist line is not ticked:"
                  : `${String(openLines.length)} checklist lines are not ticked:`}{" "}
                {openLines.slice(0, 5).join(", ")}
                {openLines.length > 5 ? ` and ${String(openLines.length - 5)} more` : ""}.
              </p>
              <p className="text-sm">Tick them, or remove a line that does not apply, first.</p>
            </Notice>
          )}
          {rules.length === 0 ? (
            <p className="text-md">Anyone at the firm except you can check it.</p>
          ) : rules.length === 1 ? (
            <p className="text-md">
              Checked under your firm&rsquo;s rule: <strong>{rules[0]?.label}</strong>.
            </p>
          ) : (
            <Field label="Who checks it" hint="Your firm has more than one rule.">
              <Select
                value={rule}
                required
                onChange={(e) => {
                  setRule(e.target.value);
                }}
              >
                <option value="" disabled>
                  Choose a rule
                </option>
                {rules.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Note for the checker" optional>
            <Textarea
              rows={3}
              value={note}
              maxLength={2000}
              placeholder="e.g. Two purchase bills were added late, see sheet 2"
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}

/**
 * THE TASK AT A GLANCE, and the three things you change about it.
 *
 * ── STATE AND WHOSE DESK SAVE WHEN PICKED (audit 2026-10-03, CA#30) ─────────
 *
 * They each needed a separate Save, while the client-portal switch and the
 * checklist saved at once: one card, two behaviours, and a changed select that
 * nobody saved read as done. Both now save the moment a choice is made. The one
 * exception is a state the firm marks BLOCKED, which owes a reason: picking it
 * opens the reason box, and that box's Save moves it.
 */
function Details({
  item,
  canWrite,
  vocabulary,
  roster,
  busy,
  stepsHandedOver,
  filesOnDone,
  onMove,
  onVisibility,
  onAssign,
}: {
  item: WorkItemDetail["item"];
  canWrite: boolean;
  vocabulary: WorkVocabulary | null;
  roster: Colleague[];
  busy: string | null;
  stepsHandedOver: number | null;
  /** Q084: the returns finishing this task would file; each asks its portal day. */
  filesOnDone: readonly LinkableFiling[];
  onMove: (stateId: string, blockedReason: string | null, filedOn?: Record<string, string>) => Promise<boolean>;
  onVisibility: (visible: boolean) => void;
  onAssign: (userId: string | null) => void;
}) {
  const currentStateId = item.state.id;
  const currentUserId = item.assignee?.userId ?? null;
  // A BLOCKED state picked and waiting for its reason. Null otherwise: every
  // other pick has already been saved.
  const [blockedPick, setBlockedPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // Q084: a DONE state picked on a task that files returns, waiting for the
  // day each was filed on the portal.
  const [donePick, setDonePick] = useState<string | null>(null);
  const [portalDays, setPortalDays] = useState<Record<string, string>>({});
  const mayMove = canWrite && vocabulary !== null;
  const mayAssign = canWrite && roster.length > 0;
  const shownStateId = blockedPick ?? donePick ?? currentStateId;
  const blockedTarget = vocabulary?.states.find((s) => s.id === blockedPick) ?? null;
  const doneTarget = vocabulary?.states.find((s) => s.id === donePick) ?? null;

  return (
    <Card>
      <Meta>
        <MetaItem label="State">
          {mayMove ? (
            <Select
              variant="quiet"
              aria-label="State"
              value={shownStateId}
              disabled={busy === "state"}
              onChange={(e) => {
                const next = vocabulary.states.find((s) => s.id === e.target.value);
                if (next === undefined) return;
                if (next.id === currentStateId) {
                  setBlockedPick(null);
                  setDonePick(null);
                  return;
                }
                if (next.isBlocked) {
                  setBlockedPick(next.id);
                  setDonePick(null);
                  return;
                }
                setBlockedPick(null);
                if (next.isTerminal && next.isSuccess && filesOnDone.length > 0) {
                  setDonePick(next.id);
                  setPortalDays(portalDaysToday(filesOnDone));
                  return;
                }
                setDonePick(null);
                void onMove(next.id, null);
              }}
            >
              {vocabulary.states
                .filter((s) => s.isActive || s.id === currentStateId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          ) : (
            <Pill
              dot
              tone={item.state.isBlocked ? "danger" : item.state.isTerminal ? "neutral" : "ok"}
            >
              {item.state.name}
            </Pill>
          )}
        </MetaItem>
        <MetaItem label="Whose desk">
          {mayAssign ? (
            <Select
              variant="quiet"
              aria-label="Whose desk"
              aria-describedby="assign-hint"
              value={currentUserId ?? ""}
              disabled={busy === "assign"}
              onChange={(e) => {
                onAssign(e.target.value === "" ? null : e.target.value);
              }}
            >
              <option value="">Nobody</option>
              {/* Active staff only, already: the API leaves out a revoked
                  membership, because offering it would produce a refusal. */}
              {roster.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {colleagueLabel(m)}
                </option>
              ))}
            </Select>
          ) : item.assignee === null ? (
            <NotSet>Nobody</NotSet>
          ) : (
            (item.assignee.displayName ?? item.assignee.email)
          )}
        </MetaItem>
        <MetaItem label="Due">
          {item.dueOn === null ? <NotSet>No due date</NotSet> : longDay(item.dueOn)}
          {/* The SNAPSHOT: a catalogue revision must not make finished work
              retroactively late. */}
          {item.slaDaysSnapshot !== null && (
            <Sub>{`${String(item.slaDaysSnapshot)}-day turnaround`}</Sub>
          )}
          {item.isStatutoryDue && <Sub>Legal deadline</Sub>}
        </MetaItem>
        <MetaItem label="Priority">{item.priority.name}</MetaItem>
        <MetaItem label="Client portal">
          {canWrite ? (
            <Switch
              label={item.isClientVisible ? "Shown" : "Hidden"}
              /* The visible word is the STATE; the name says what it does. */
              aria-label="Show this on the client portal"
              checked={item.isClientVisible}
              disabled={busy === "visibility"}
              aria-describedby="visibility-hint"
              onChange={(e) => {
                onVisibility(e.target.checked);
              }}
            />
          ) : item.isClientVisible ? (
            "Shown"
          ) : (
            "Hidden"
          )}
          <Sub>
            <span id="visibility-hint">
              {item.isClientVisible ? "Never shows whose desk or priority." : "The client cannot see it."}
            </span>
          </Sub>
        </MetaItem>
      </Meta>

      {blockedTarget !== null && mayMove && (
        /* A `hint`, not a span in the label: a label's text is the control's
           NAME and a screen reader would read the whole sentence on focus. */
        <form
          className="stack tight"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim() === "") return;
            void onMove(blockedTarget.id, reason.trim()).then((ok) => {
              if (ok) {
                setBlockedPick(null);
                setReason("");
              }
            });
          }}
        >
          <Field label={`Why is it ${blockedTarget.name.toLowerCase()}?`} hint="Required. It stays on the task.">
            <Textarea
              value={reason}
              rows={2}
              autoFocus
              placeholder="e.g. Waiting for the client's revised challan"
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </Field>
          <div className="cluster">
            <Button type="submit" size="sm" disabled={busy === "state" || reason.trim() === ""}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setBlockedPick(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {doneTarget !== null && mayMove && (
        <form
          className="stack tight"
          onSubmit={(e) => {
            e.preventDefault();
            void onMove(doneTarget.id, null, portalDays).then((ok) => {
              if (ok) setDonePick(null);
            });
          }}
        >
          <PortalDates filings={filesOnDone} value={portalDays} onChange={setPortalDays} />
          <div className="cluster">
            <Button type="submit" size="sm" disabled={busy === "state" || !allPortalDays(filesOnDone, portalDays)}>
              {`Mark ${doneTarget.name.toLowerCase()}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDonePick(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {mayAssign && (
        <p className="field-hint" id="assign-hint">
          Handing it on also hands over the job&rsquo;s untaken steps, where grade allows.
        </p>
      )}
      {stepsHandedOver !== null && (
        <p className="text-md" role="status">
          {stepsHandedOver === 1
            ? "1 step of this job went with it."
            : `${String(stepsHandedOver)} steps of this job went with it.`}
        </p>
      )}

      {/* On an unassigned task it says why nobody has it; on a Key Manager's or
          the signing partner's desk it says the task came to them to hand out,
          and why (the owner rule, 2026-09-27). A hand move clears it. */}
      {item.assignmentNote !== null && <Notice>{item.assignmentNote}</Notice>}
      {/* `warn`, not `danger`: held up is not the same as wrong. */}
      {item.state.isBlocked && item.blockedReason !== null && (
        <Notice tone="warn">
          <strong>{item.state.name}:</strong> {item.blockedReason}
        </Notice>
      )}
      {item.blockedByOpen.length > 0 && (
        <Notice tone="warn">
          Cannot start until {item.blockedByOpen.map((b) => b.title).join(", ")}{" "}
          {item.blockedByOpen.length === 1 ? "is" : "are"} finished.
        </Notice>
      )}
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
      <div className="row">
        <CardTitle level={2}>Checklist</CardTitle>
        {lines.length > 0 && (
          <span className="text-md">{`${String(done)} of ${String(lines.length)} ticked`}</span>
        )}
      </div>
      {lines.length === 0 && <p className="text-md">Nothing on it yet.</p>}
      {lines.map((line) => (
        <div key={line.id} className="cluster py-1">
          <label className="check">
            <input
              type="checkbox"
              checked={line.doneAt !== null}
              disabled={!canWrite || busy === line.id}
              onChange={(e) => {
                onTick(line.id, e.target.checked);
              }}
            />
            <span className={cx(line.doneAt !== null && "text-muted line-through")}>
              {line.label}
            </span>
          </label>
          {canWrite && line.doneAt === null && (
            <Button
              variant="ghost"
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
            placeholder="e.g. Pull the trial balance"
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
      {lines.length > 0 && done < lines.length && (
        <p className="field-hint">Every line is ticked before the task goes for review.</p>
      )}
      {lines.some((l) => l.doneAt !== null) && (
        <p className="field-hint">Untick a line to remove it.</p>
      )}
    </Card>
  );
}

/**
 * NOTES ON THE TASK (audit 2026-10-03, CA#30): "challan shared on WhatsApp".
 * Oldest first, each with who and when. A note is never edited; a correction is
 * a second note. Staff only: the client portal never shows them.
 */
function Notes({
  notes,
  canWrite,
  busy,
  onAdd,
}: {
  notes: readonly WorkItemNote[];
  canWrite: boolean;
  busy: boolean;
  onAdd: (body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Card>
      <CardTitle level={2}>Notes</CardTitle>
      {notes.length === 0 ? (
        <p className="text-md">No notes yet.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {notes.map((n) => (
            <li key={n.id} className="border-t border-line py-2 first:border-t-0">
              <p className="m-0 whitespace-pre-wrap">{n.body}</p>
              <p className="m-0 text-sm text-ink-2">
                {n.authorName ?? "Somebody"} · {longInstant(n.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <form
          className="stack tight mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = draft.trim();
            if (body === "") return;
            void onAdd(body).then((ok) => {
              if (ok) setDraft("");
            });
          }}
        >
          <Field label="Add a note" hint="Your colleagues see it. The client does not.">
            <Textarea
              rows={2}
              value={draft}
              maxLength={2000}
              placeholder="e.g. Challan shared with the client on WhatsApp"
              onChange={(e) => {
                setDraft(e.target.value);
              }}
            />
          </Field>
          <div className="cluster">
            <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={draft.trim() === ""}>
              Add note
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/**
 * THE FILING THIS TASK FILES (audit 2026-10-03, CA#36).
 *
 * The roleplay firm approved "File GSTR-3B for September" and the calendar and
 * the client's portal still said Pending. Linking makes this task the one that
 * files it: completing the task marks the filing filed, as completing the
 * calendar's own task does, and the calendar raises no second task for it.
 *
 * A PERIOD JOB'S TASK FILES ITS PERIOD (Q063): finishing "GST · Sep 2026"
 * files that month's open returns on a rule its service carries, and they are
 * listed here (`filedHere`); reopening the task un-files exactly those. A
 * filing filed by a task other than this one says which.
 */
function Filing({
  filing,
  workItemId,
  company,
  canWrite,
  busy,
  onLink,
  onUnlink,
}: {
  filing: TaskFiling;
  workItemId: string;
  company: string;
  canWrite: boolean;
  busy: boolean;
  onLink: (obligationId: string) => Promise<boolean>;
  onUnlink: () => void;
}) {
  const [choice, setChoice] = useState("");
  const linked = filing.linked;
  if (linked === null && filing.open.length === 0 && filing.filedHere.length === 0) return null;
  const byOther =
    linked !== null && linked.filedByWorkItemId !== null && linked.filedByWorkItemId !== workItemId
      ? linked
      : null;
  return (
    <Card>
      <CardTitle level={2}>{filing.filedHere.length > 1 ? "Filings" : "Filing"}</CardTitle>
      {filing.filedHere.length > 0 && (
        <div className="stack tight">
          <p className="m-0">Completing this task filed:</p>
          <ul className="m-0 stack tight">
            {filing.filedHere.map((f) => (
              <li key={f.obligationId} className="cluster">
                <strong>{`${f.name} · ${f.periodLabel}`}</strong>
                {f.filedOn !== null && <Pill dot tone="ok">{`Filed ${longDay(f.filedOn)}`}</Pill>}
              </li>
            ))}
          </ul>
          <p className="m-0 text-ink-2">
            {`Reopening the task marks ${filing.filedHere.length === 1 ? "it" : "them"} not filed.`}
          </p>
        </div>
      )}
      {filing.filedHere.length > 0 && linked === null ? null : linked !== null ? (
        <div className="cluster">
          <p className="m-0">
            This task files <strong>{`${linked.name} · ${linked.periodLabel}`}</strong>, due{" "}
            {longDay(linked.statutoryDueOn)}.{" "}
            {linked.filedOn !== null ? (
              <Pill dot tone="ok">{`Filed ${longDay(linked.filedOn)}`}</Pill>
            ) : (
              <span className="text-ink-2">Completing the task marks it filed.</span>
            )}
          </p>
          {byOther !== null && byOther.filedByWorkItemId !== null && (
            <p className="m-0 text-ink-2">
              Filed by{" "}
              <Link href={`/work-items/${byOther.filedByWorkItemId}`}>
                {byOther.filedByTitle ?? "another task"}
              </Link>
              . This task can be closed.
            </p>
          )}
          {canWrite && linked.filedOn === null && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onUnlink}>
              Not this filing
            </Button>
          )}
        </div>
      ) : canWrite ? (
        <form
          className="stack tight"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice === "") return;
            void onLink(choice).then((ok) => {
              if (ok) setChoice("");
            });
          }}
        >
          <Field
            label="Which filing does this task file?"
            hint={`Open filings for ${company} with no task yet. Completing this task marks the one you pick filed.`}
            optional
          >
            <Select
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
              }}
            >
              <option value="">Not a filing</option>
              {filing.open.map((f) => (
                <option key={f.obligationId} value={f.obligationId}>
                  {`${f.name} · ${f.periodLabel} (due ${longDay(f.statutoryDueOn)})`}
                </option>
              ))}
            </Select>
          </Field>
          <div className="cluster">
            <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={choice === ""}>
              Link the filing
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-md">Not linked to a filing.</p>
      )}
    </Card>
  );
}

/** Every review this task has been through, newest first. */
function Reviews({
  reviews,
  openReview,
  openReviewViewer,
  openLines,
  canWrite,
  busy,
  filesOnDone,
  onDecide,
}: {
  reviews: readonly WorkItemReview[];
  openReview: WorkItemReview | null;
  /** The API's verdict on whether the CALLER may decide the open review. Null
   *  when there is none open. */
  openReviewViewer: WorkItemDetail["openReviewViewer"];
  /** Checklist lines still unticked: Approve waits for them (CA#30). */
  openLines: number;
  canWrite: boolean;
  busy: string | null;
  filesOnDone: readonly LinkableFiling[];
  onDecide: (
    approvalId: string,
    decision: "approved" | "rejected",
    notes: string | null,
    filedOn?: Record<string, string>,
  ) => void;
}) {
  // Nothing sent for review yet: no card at all. Send for review is the
  // page's own button, top right.
  if (openReview === null && reviews.length === 0) return null;
  return (
    <Card>
      <CardTitle level={2}>Reviews</CardTitle>

      {openReview === null ? null : (
        <DecideReview
          review={openReview}
          viewer={openReviewViewer}
          openLines={openLines}
          canWrite={canWrite}
          busy={busy}
          filesOnDone={filesOnDone}
          onDecide={onDecide}
        />
      )}

      {reviews.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Sent</Th>
                <Th>Done by</Th>
                <Th>Rule</Th>
                <Th>Outcome</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  {/* `longInstant`, not `.slice(0, 10)`: slicing an ISO instant
                      takes the UTC day. */}
                  <Td>{longInstant(r.submittedAt)}</Td>
                  <Td>{r.submittedByName ?? <NotSet>Nobody recorded</NotSet>}</Td>
                  <Td>{r.policyLabel ?? "Anyone but the maker"}</Td>
                  <Td>
                    <Pill
                      dot
                      tone={
                        r.decision === "rejected"
                          ? "danger"
                          : r.decision === "approved"
                            ? "ok"
                            : "warn"
                      }
                    >
                      {DECISION_WORDS[r.decision]}
                    </Pill>
                  </Td>
                  {/* BOTH NOTES IN ONE COLUMN, each wrapping: two sentence
                      columns side by side pushed the second off the card at
                      1280. The maker's, said when sending, then the checker's. */}
                  <Td>
                    {r.requestNote === null && r.notes === null ? (
                      <NotSet>No note</NotSet>
                    ) : (
                      <span className="cell-text" data-size="narrow">
                        {r.requestNote !== null && (
                          <span className="block">
                            <strong>Sent with:</strong> {r.requestNote}
                          </span>
                        )}
                        {r.notes !== null && (
                          <span className="block">
                            <strong>Checker:</strong> {r.notes}
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
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
 * "Who may check this?" is loaded when it is OPENED, by the disclosure's own
 * toggle (CA#48). It was loaded from a click on the summary and a failed read
 * was never caught, so a refusal or a dropped connection left "Loading…" on
 * screen for good. A failure now says so and offers to try again.
 */
function DecideReview({
  review,
  viewer,
  openLines,
  canWrite,
  busy,
  filesOnDone,
  onDecide,
}: {
  review: WorkItemReview;
  viewer: WorkItemDetail["openReviewViewer"];
  openLines: number;
  canWrite: boolean;
  busy: string | null;
  filesOnDone: readonly LinkableFiling[];
  onDecide: (
    approvalId: string,
    decision: "approved" | "rejected",
    notes: string | null,
    filedOn?: Record<string, string>,
  ) => void;
}) {
  const [notes, setNotes] = useState("");
  // Q084: approving finishes the task, so it files its returns: their portal days.
  const [portalDays, setPortalDays] = useState<Record<string, string>>(() => portalDaysToday(filesOnDone));
  const [checkers, setCheckers] = useState<WorkItemChecker[] | "failed" | null>(null);

  async function loadCheckers(): Promise<void> {
    setCheckers(null);
    try {
      const result = await api.GET("/api/v1/work-item-checks/{approvalId}/checkers", {
        params: { path: { approvalId: review.id } },
      });
      setCheckers(result.error ? "failed" : result.data.checkers);
    } catch {
      setCheckers("failed");
    }
  }

  return (
    <>
      <p className="text-md">
        Waiting to be checked since {longInstant(review.submittedAt)}
        {review.submittedByName !== null && `, done by ${review.submittedByName}`}
        {review.policyLabel !== null && ` · ${review.policyLabel}`}
      </p>
      {review.requestNote !== null && (
        <p className="text-md">
          <strong>Their note:</strong> {review.requestNote}
        </p>
      )}

      {/* THE WHOLE RULE, FROM THE API, and the sentence it gives. */}
      {canWrite && viewer !== null && !viewer.eligible && (
        <Notice tone="warn">{viewer.reason ?? "You cannot check this one."}</Notice>
      )}

      {canWrite && (viewer === null || viewer.eligible) && (
        <>
          {filesOnDone.length > 0 && (
            <PortalDates filings={filesOnDone} value={portalDays} onChange={setPortalDays} />
          )}
          <Field label="Note" hint="Required to send it back.">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
            />
          </Field>
          <div className="cluster">
            <Button
              disabled={busy === review.id || openLines > 0 || !allPortalDays(filesOnDone, portalDays)}
              onClick={() => {
                onDecide(
                  review.id,
                  "approved",
                  notes.trim() || null,
                  filesOnDone.length > 0 ? portalDays : undefined,
                );
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
          {openLines > 0 ? (
            <p className="field-hint">
              {openLines === 1
                ? "A checklist line is not ticked. Send it back so it can be finished."
                : `${String(openLines)} checklist lines are not ticked. Send it back so they can be finished.`}
            </p>
          ) : (
            <p className="field-hint">Approving marks the task done.</p>
          )}
        </>
      )}

      <details
        className="mt-3"
        onToggle={(e) => {
          if (e.currentTarget.open && (checkers === null || checkers === "failed")) void loadCheckers();
        }}
      >
        <summary>Who may check this?</summary>
        {checkers === null ? (
          <p className="muted text-sm">Loading…</p>
        ) : checkers === "failed" ? (
          <p className="text-sm">
            The list did not load.{" "}
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                void loadCheckers();
              }}
            >
              Try again
            </Button>
          </p>
        ) : checkers.length === 0 ? (
          <p className="text-sm">Nobody at the firm can check it yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <tbody>
                {checkers.map((c) => (
                  <tr key={c.userId}>
                    <Td>{c.displayName}</Td>
                    <Td>{c.gradeName ?? <NotSet>No grade</NotSet>}</Td>
                    <Td>
                      {c.eligible ? (
                        <Pill dot tone="ok">
                          Can check
                        </Pill>
                      ) : (
                        // The REASON, always. "You cannot check this" with no
                        // reason is how a person concludes the button is broken.
                        <span className="text-ink-2">{c.reason}</span>
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
 * The API is the thing that refuses (a cycle, a duplicate, starting while it
 * still waits), and its sentences are shown verbatim. Finished blockers are
 * shown, and shown as finished. The picker offers this client's OTHER work.
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
  /** Resolves true when the API accepted it. The form stays open otherwise. */
  onAdd: (dependsOnWorkItemId: string) => Promise<boolean>;
  onRemove: (dependencyId: string) => void;
}) {
  const [candidates, setCandidates] = useState<WorkItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const { panel: formRef, trigger: openRef } = useSwapFocus(adding);

  /** Loaded when the FORM opens, a whole interaction ahead of the select. */
  async function open(): Promise<void> {
    setAdding(true);
    if (candidates !== null) return;
    const result = await api.GET("/api/v1/work-items", {
      params: {
        query: {
          clientPartyId,
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
      <div className="row">
        <CardTitle level={2}>Waits on</CardTitle>
        {deps.length > 0 && (
          <span className="text-md">{`${String(open_.length)} of ${String(deps.length)} still open`}</span>
        )}
      </div>

      {deps.length === 0 ? (
        <p className="text-md">Nothing. It can start any time.</p>
      ) : (
        deps.map((d) => (
          <div key={d.id} className="cluster py-1">
            <span>
              <Link href={`/work-items/${d.dependsOnWorkItemId}`}>{d.dependsOnTitle}</Link>{" "}
              <Pill dot tone={d.dependsOnIsTerminal ? "ok" : "warn"}>
                {d.dependsOnStateName}
              </Pill>
            </span>
            {canWrite && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy === d.id}
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
              /* CLOSES ONLY ON SUCCESS: a refusal keeps the form to correct. */
              onSubmit={(event) => keepTyped(event, (form) => {
                const id = String(form.get("dependsOn") ?? "");
                if (id === "") return;
                void onAdd(id).then((ok) => {
                  if (ok) setAdding(false);
                });
              })}
            >
              <fieldset className="fieldset" aria-label="Make this task wait on another">
                <FieldStack>
                  <Field label="Wait on" hint="Only this client's other tasks are listed.">
                    <Select name="dependsOn" required defaultValue="" disabled={candidates === null}>
                      <option value="" disabled>
                        {candidates === null
                          ? "Loading this client's work…"
                          : offerable.length === 0
                            ? "Nothing left to wait on"
                            : "Choose a task"}
                      </option>
                      {offerable.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.title} ({i.state.name})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="cluster">
                    <Button type="submit" variant="secondary" loading={busy === "dependency"}>
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
                    <p className="field-hint">Two tasks cannot wait on each other.</p>
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
              Add a task it waits on
            </Button>
          </div>
        ))}
    </Card>
  );
}

/** A check's outcome in words: `rejected` is the checker's "Send back". */
const DECISION_WORDS: Record<WorkItemReview["decision"], string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Sent back",
};
