"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type {
  Escalation,
  Member,
  PartySummary,
  Principal,
  WorkItem,
  WorkItemCheckRow,
  WorkItemState,
} from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Select,
  Icon,
  LinkButton,
  Notice,
  Pill,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  Tooltip,
} from "@/components/ui";
import { WorkBoard } from "./board";
import { CheckQueue } from "./checks";
import { EscalationQueue } from "./escalations";
import { longDay } from "@/lib/day";

/**
 * The board — what is owed, whose it is, and what is late (T3.1).
 *
 * The OTHER half of `/work`. That screen shows the ENGINE: which template a job
 * is walking and which step it is on. This shows the work as a person
 * experiences it — a client, a due date, a name, and a state in the firm's own
 * words. They are two screens because they answer two questions, and because a
 * firm that has published no process still has work: ad hoc work has no job at
 * all and is still owned, still due and still reviewable.
 *
 * ── THE TABS ARE FIVE DIFFERENT JOBS ────────────────────────────────────────
 *
 * MINE is what somebody opens in the morning.
 *
 * UNASSIGNED is the one that matters most and would not exist on a naive board.
 * When a filing is spawned, the router looks up the client's SPOC for that Dept
 * — and it deliberately refuses to guess when the firm has recorded none, or has
 * recorded two. Those items land here with a SENTENCE saying which, because a
 * queue of rows with no explanation is a pile nobody clears.
 *
 * EVERYTHING is the delivery meeting's view.
 *
 * TO CHECK and ESCALATED are not the board sliced at all — they are different
 * KINDS of row (a check waiting on somebody; the record that somebody was told)
 * so each has its own renderer and the Board/List toggle is hidden while either
 * is open. To check is the whole FIRM's queue, never "mine": under a rank
 * threshold there is no "mine", and a list narrowed to what the viewer may take
 * hides that six tasks have waited a week because nobody senior enough has
 * looked.
 *
 * ── OVERDUE FIRST, AND THE DAY IS THE BROWSER'S ─────────────────────────────
 *
 * The API orders the board and takes `asOf` to decide what is late. The browser
 * sends its LOCAL calendar day, because the server's is not the firm's: a server
 * in UTC is a day behind a firm in India every morning, and this product has
 * already shipped that bug once — a client assigned at 04:11 was missing from
 * its holder's own book until the afternoon.
 *
 * ── NOTHING HERE COMPARES A STATE'S CODE ────────────────────────────────────
 *
 * States and priorities are ROWS the firm owns, and it may rename any of them
 * from /admin/work-vocabulary without a deploy. So this screen reads the FLAGS
 * — `isBlocked`, `isTerminal` — and prints the NAME. A branch on
 * `code === "blocked"` would break the first time somebody used that freedom,
 * silently, which is the exact failure the flags exist to prevent.
 */
export default function WorkItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [checks, setChecks] = useState<WorkItemCheckRow[]>([]);
  const [me, setMe] = useState<Principal | null>(null);
  const [tab, setTab] = useState<"mine" | "unassigned" | "checks" | "escalated" | "all">(
    "mine",
  );
  /** T4.5's queue. A different KIND of row from the three tabs beside it — the
   *  record that somebody was TOLD about work, not the work — which is why it
   *  gets its own state and its own renderer rather than a filter over `items`. */
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  /** Whether the firm has published a ladder at all. Without it an empty queue
   *  at a firm that never wrote one is indistinguishable from everything being
   *  on time, and only one of those means the product is doing anything. */
  const [ladderPublished, setLadderPublished] = useState(false);
  const tabsId = useId();
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [staff, setStaff] = useState<Member[]>([]);
  const [includeDone, setIncludeDone] = useState(false);
  /** The firm's own states, which are the board's COLUMNS. `party:read`, the
   *  same permission this screen already needs, so every viewer gets them. */
  const [states, setStates] = useState<WorkItemState[]>([]);
  /**
   * BOARD OR LIST, and it is a VIEW rather than a fourth tab.
   *
   * The three tabs are three different QUESTIONS — whose desk, nobody's desk,
   * everybody's desk. Board-and-list is a different axis entirely: the same
   * question, drawn two ways. A fourth tab would have meant six combinations
   * expressed as four, and "Mine, as a board" would have had nowhere to live.
   *
   * The board is the DEFAULT because that is what this screen is called and
   * what it is for. The list is what you switch to when you want a hundred rows
   * sorted by date rather than a picture of where the work is stuck.
   */
  const [view, setView] = useState<"board" | "list">("board");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // THE CALLER'S CALENDAR DAY. `toISOString().slice(0, 10)` here would be the
    // UTC day and would call a filing due today "overdue" for anybody west of
    // Greenwich, and "not yet" for anybody east — see the note at the top.
    const now = new Date();
    const asOf = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Both in one pass, so the tab counts are right the moment the page paints.
    // A badge that fills in a second later reads as "nothing to check" to
    // somebody who glances and moves on.
    // The principal comes along because "mine" is a comparison against the
    // signed-in person's id. The API's own `mine=true` filter exists and is not
    // used here on purpose: the tab COUNTS have to agree with each other, and
    // three separate queries would disagree for as long as one was in flight.
    const [board, queue, principal, book, roster, vocabulary, escalated] = await Promise.all([
      api.GET("/api/v1/work-items", {
        params: { query: { asOf, includeDone: includeDone ? "true" : "false" } },
      }),
      api.GET("/api/v1/work-item-checks", {}),
      api.GET("/api/v1/auth/me", {}),
      // For the "raise a task" form. `party:read`, the same permission the
      // board itself takes, so anybody who can see this screen can fill it in.
      api.GET("/api/v1/parties", {}),
      // The roster is `tenant:admin` while raising a task is only `work:write`
      // — so this is ASKED FOR and allowed to fail. A delivery manager gets the
      // form without an assignee picker rather than no form at all; the item is
      // raised unassigned, which is a state the board already has a tab for.
      api.GET("/api/v1/tenancy/members", {}),
      // The board's COLUMNS. `party:read`, so everybody who can see this screen
      // gets them — and in the same pass as the items, because a board that
      // paints its cards before its columns has no shape to paint them into.
      api.GET("/api/v1/work-vocabulary", {}),
      // T4.5. The WHOLE firm's, never `mine=true`: a queue narrowed to what you
      // personally may act on hides that six tasks have been escalated for a
      // week because nobody senior enough looked, which is the failure the
      // ladder exists to surface. Same argument the review queue above makes.
      api.GET("/api/v1/escalations", {}),
    ]);
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (board.response.status === 401 || queue.response.status === 401) {
      router.push("/login");
      return;
    }
    if (board.error) {
      setError(apiError(board.error).message);
      setLoaded(true);
      return;
    }
    setItems(board.data.items);
    setMe(principal.error ? null : principal.data);
    setParties(book.data?.parties ?? []);
    setStaff(
      (roster.data?.members ?? []).filter(
        (m) => m.membership.isActive && m.membership.audience === "STAFF",
      ),
    );
    // The review queue is `party:read` like the board, but a role that can read
    // one and not the other is possible in principle — so a refusal here empties
    // the tab rather than blanking the page.
    setChecks(queue.error ? [] : queue.data.checks);
    setStates(vocabulary.data?.states ?? []);
    // A refusal empties the tab rather than blanking the page — the review
    // queue's arrangement, for the same reason.
    setEscalations(escalated.error ? [] : escalated.data.rows);
    setLadderPublished(escalated.error ? false : escalated.data.ladderPublished);
    setError(null);
    setLoaded(true);
  }, [router, includeDone]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading the board" />;

  // Filtered in the browser rather than re-fetched per tab: the whole board is
  // one query already, and three round trips to move between tabs would make
  // the counts disagree with the rows for as long as one was in flight.
  // THE BROWSER'S CALENDAR DAY, computed once for the page. `toISOString()`
  // here would be the UTC day, which calls work due today "late" west of
  // Greenwich and "not yet" east — and saying what is late is this screen's
  // whole job. The same value the request already sends as `asOf`.
  const now = new Date();
  const localToday = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const mine = items.filter((i) => i.assignee !== null && i.assignee.userId === me?.userId);
  // The viewer's own share of the check queue. The queue itself is never
  // filtered by this — see the note on the tab — but the banner has to be able
  // to say what is actually waiting on the person reading it.
  const mineToCheck = checks.filter((c) => c.viewer.eligible).length;
  const unassigned = items.filter((i) => i.assignee === null);
  const shown = tab === "mine" ? mine : tab === "unassigned" ? unassigned : items;

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title="Work board"
        lede="What is owed and whose it is. The engine — which process a job is walking, and which step it is on — is its own screen."
        aside={
          <LinkButton size="sm" href="/work" iconAfter={<Icon name="arrowRight" size={15} />}>
            The engine
          </LinkButton>
        }
      />

      <ErrorNotice error={error} />

      {checks.length > 0 && (
        <Notice tone="warn">
          <p>
            <strong>{checks.length}</strong>{" "}
            {checks.length === 1 ? "task is" : "tasks are"} waiting to be checked
            {/* How many of them are the VIEWER's, because that is the half they
                can do something about — and the other half is still counted,
                because this queue is the whole firm's on purpose. */}
            {mineToCheck > 0 && <> — {mineToCheck} of them yours</>}.{" "}
            {/* It used to link to `checks[0]`, the oldest, and there was no way
                to reach the second: the tab is the list. */}
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setTab("checks");
              }}
            >
              Open the queue →
            </Button>
          </p>
        </Notice>
      )}

      {/* Offered from what /auth/me says the session holds. Somebody without
          `work:write` still gets an accurate refusal from the API — but not
          offering it is not the same as refusing it afterwards. */}
      {me?.permissions.includes("work:write") === true && (
        <RaiseTask
          parties={parties}
          staff={staff}
          onRaised={() => void load()}
          onError={setError}
        />
      )}

      <Tabs
        id={tabsId}
        label="Work board views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "mine", label: "Mine", count: mine.length },
          { value: "unassigned", label: "Unassigned", count: unassigned.length },
          { value: "checks", label: "To check", count: checks.length },
          { value: "escalated", label: "Escalated", count: escalations.length },
          { value: "all", label: "Everything", count: items.length },
        ]}
      />

      {/* Neither control means anything on the two QUEUES. A notice about
          finished work is not in the escalation list at all (the API drops it
          by the join); a check that has been decided is not in the review queue
          either — and neither has a board shape to be drawn in. */}
      {tab !== "escalated" && tab !== "checks" && (
      <div className="row">
        <Checkbox
          label="Include finished work"
          note="off by default — a board of everything the firm has ever done is not a board."
          checked={includeDone}
          onChange={(e) => { setIncludeDone(e.target.checked); }}
        />
        {/* A pair of buttons rather than a `<Tabs>`: this is not navigation
            between panels, it is the same panel drawn two ways, and a tablist
            announces itself as a set of pages. `aria-pressed` says what it
            actually is — a toggle that is currently on. */}
        <span className="cluster tight">
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === "board"}
            onClick={() => { setView("board"); }}
          >
            Board
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === "list"}
            onClick={() => { setView("list"); }}
          >
            List
          </Button>
        </span>
      </div>
      )}

      <TabPanel tabsId={tabsId} value={tab}>
        {/* The escalation queue is not the board sliced — it is a different
            kind of row, so it gets its own renderer rather than being forced
            through the board or the list. Board/List does not apply to it and
            the toggle above is hidden while it is open. */}
        {tab === "checks" ? (
          <CheckQueue
            checks={checks}
            today={localToday}
            onDecided={() => void load()}
            onError={setError}
          />
        ) : tab === "escalated" ? (
          <EscalationQueue rows={escalations} ladderPublished={ladderPublished} />
        ) : shown.length === 0 ? (
          <Card>
            <Empty title="Nothing here" icon="board">
              {emptyMessage(tab)}
            </Empty>
          </Card>
        ) : view === "board" ? (
          <WorkBoard items={shown} states={states} today={localToday} includeDone={includeDone} />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>What</Th>
                  <Th>For</Th>
                  <Th>Who</Th>
                  <Th>Due</Th>
                  <Th>State</Th>
                  <Th align="right">Priority</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <WorkRow key={item.id} item={item} today={localToday} />
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </TabPanel>
    </Page>
  );
}

/** Neither queue tab reaches this — each writes its own. `EscalationQueue` has
 *  two, because "nothing is late" and "nothing is watching" are different facts
 *  and only one of them is good news; `CheckQueue`'s says how work gets there. */
function emptyMessage(tab: "mine" | "unassigned" | "checks" | "escalated" | "all"): string {
  if (tab === "mine") {
    return (
      "Nothing is on your desk. Work arrives here when an engagement is released and you " +
      "are the client's SPOC for that department, or when somebody assigns you a task."
    );
  }
  if (tab === "unassigned") {
    // The good state, and worth saying so: an empty unassigned queue means the
    // router placed everything, which means the firm's SPOCs are recorded.
    return "Everything has an owner. That means every client has a SPOC for the work it buys.";
  }
  return (
    "No work yet. It appears when an engagement letter is signed and its advance is " +
    "recorded — that is what starts the engine — or when somebody raises a task by hand."
  );
}

/**
 * One row.
 *
 * The four things a person actually scans for, in the order they scan them:
 * what it is, who it is for, whose it is, and when it is due. Everything else —
 * the checklist, the dependencies, the reviews — is on the item's own page,
 * because a board that showed all of it would be a board nobody reads.
 */
function WorkRow({ item, today }: { item: WorkItem; today: string }) {
  const overdue = item.dueOn !== null && item.dueOn < today && !item.state.isTerminal;

  return (
    <tr>
      <Td>
        <span className="cluster tight">
          <Link href={`/work-items/${item.id}`}>{item.title}</Link>
          {item.checklistTotal > 0 && (
            <span className="mono faint">
              {item.checklistDone}/{item.checklistTotal}
            </span>
          )}
          {item.hasOpenReview && <Pill tone="accent">in review</Pill>}
        </span>
        {/* What this item is WAITING ON. Shown on the row and not only on the
            page, because "why has nobody started this" is the question a board
            is being asked when somebody scrolls past it for the third day. */}
        {item.blockedByOpen.length > 0 && (
          <Sub>Waiting on {item.blockedByOpen.map((b) => b.title).join(", ")}</Sub>
        )}
      </Td>
      <Td>
        {item.clientName}
        {/* The ENTITY, when the work is about one particular company. A group of
            four companies files four sets of returns (G0.1), and a row that
            said only "Kaveri Foods Group" would be four identical rows. */}
        {item.entityName !== null && item.entityName !== item.clientName && (
          <Sub>{item.entityName}</Sub>
        )}
      </Td>
      <Td>
        {item.assignee === null ? (
          <>
            <span className="empty">—</span>
            {/* THE SENTENCE. Without it this cell is a dash and the queue is a
                pile: "two SPOCs for FRC, pick one" and "nobody has got to it"
                look identical, and only one of them is somebody's to fix. */}
            {item.assignmentNote !== null && <Sub>{item.assignmentNote}</Sub>}
          </>
        ) : (
          (item.assignee.displayName ?? item.assignee.email)
        )}
      </Td>
      <Td>
        {item.dueOn === null ? (
          // Not a blank. A service whose SLA the firm has not stated produces
          // work with no deadline, which is a real state — and inventing one
          // would be this product setting a priority the firm never set.
          <Tooltip text="The firm has not stated a turnaround for this service">
            <span className="unstated">no date</span>
          </Tooltip>
        ) : (
          <span className={overdue ? "mono tone-danger" : "mono"}>
            {longDay(item.dueOn)}
            {overdue && " · late"}
          </span>
        )}
      </Td>
      <Td>
        {/* The NAME the firm chose, and the tone from the FLAG. A branch on the
            code would go quiet the day somebody renames it. */}
        {/* `Pill` never wraps — the firm names these states itself and a
            two-word name is the ordinary case, not an edge one. It rendered as
            a broken circle before the component owned that rule. */}
        <Pill
          tone={item.state.isBlocked ? "danger" : item.state.isTerminal ? "neutral" : "accent"}
        >
          {item.state.name}
        </Pill>
        {item.state.isBlocked && item.blockedReason !== null && (
          <Sub>{item.blockedReason}</Sub>
        )}
      </Td>
      <Td align="right">
        <span className="faint">{item.priority.name}</span>
      </Td>
    </tr>
  );
}

/**
 * Raise a task by hand.
 *
 * The board's own empty state has always said work arrives "when somebody
 * raises a task by hand" — and until now nothing could. This is that.
 *
 * NO PRIORITY FIELD, deliberately, and the same call 10x CRM made on the same
 * screen: the one thing the firm said about priority is that statutory
 * deadlines are high anyway. So the tick decides it and the API resolves the
 * firm's own statutory default — a priority row carries `isStatutoryDefault`
 * for exactly this. A box here would be somebody setting it wrongly on the
 * other ninety tasks.
 *
 * A `<details>` so it is collapsed by default. The board is the screen; this is
 * something you occasionally do to it.
 */
function RaiseTask({
  parties,
  staff,
  onRaised,
  onError,
}: {
  parties: readonly PartySummary[];
  staff: readonly Member[];
  onRaised: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    onError("");
    const dueOn = String(form.get("dueOn") ?? "");
    const assigneeUserId = String(form.get("assigneeUserId") ?? "");
    const result = await api.POST("/api/v1/work-items", {
      body: {
        clientPartyId: String(form.get("clientPartyId")),
        title: String(form.get("title")),
        isStatutoryDue: form.get("isStatutoryDue") === "on",
        // Omitted rather than sent as null when empty: absent means "the API
        // decides", which for the assignee is the SPOC router and for the due
        // date is the service's own SLA. Sending null would be this screen
        // saying "there is none", which is a different claim.
        ...(dueOn === "" ? {} : { dueOn }),
        ...(assigneeUserId === "" ? {} : { assigneeUserId }),
      },
    });
    setBusy(false);
    if (result.error) {
      onError(apiError(result.error).message);
      return;
    }
    if (detailsRef.current !== null) detailsRef.current.open = false;
    onRaised();
  }

  return (
    <details ref={detailsRef} className="card disclosure">
      <summary>New task</summary>
      <form action={(f) => void submit(f)}>
        <div className="stack">
          <FieldRow>
            <Field label="Client">
              <Select name="clientPartyId" required defaultValue="">
                <option value="" disabled>
                  Choose a client
                </option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="What has to be done">
              <Input name="title" required placeholder="GSTR-3B filing — August 2026" />
            </Field>
            {/* Only when the roster loaded. Raising a task is `work:write`; the
                roster is `tenant:admin`, so this field is simply absent for
                somebody who may do the first and not the second. */}
            {staff.length > 0 && (
              <Field label="Assign to" optional>
                <Select name="assigneeUserId" defaultValue="">
                  <option value="">Let the router decide</option>
                  {staff.map((m) => (
                    <option key={m.membership.userId} value={m.membership.userId}>
                      {m.displayName ?? m.email}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Due" optional>
              <Input name="dueOn" type="date" />
            </Field>
          </FieldRow>

          <Checkbox
            name="isStatutoryDue"
            label="Statutory deadline"
            note="the firm's statutory priority is applied; there is no priority to pick."
          />

          <div>
            <Button type="submit" loading={busy}>
              Raise task
            </Button>
            {staff.length === 0 && (
              <p className="field-hint">
                Unassigned. Work is routed to the client&rsquo;s SPOC for the department it
                belongs to.
              </p>
            )}
          </div>
        </div>
      </form>
    </details>
  );
}
