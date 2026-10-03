"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import type {
  Colleague,
  Escalation,
  PartySummary,
  Principal,
  WorkItem,
  WorkItemCheckRow,
  WorkItemState,
} from "@/lib/api/client";
import { Page, PageHeader, useNavCounts } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Select,
  Notice,
  NotSet,
  Pill,
  RowChevron,
  RowLink,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  ThChevron,
  Tr,
} from "@/components/ui";
import { WorkBoard } from "./board";
import { CheckQueue } from "./checks";
import { EscalationQueue, escalatedSubjects } from "./escalations";
import { Workload } from "./workload";
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
 * MINE is what somebody opens in the morning. UNASSIGNED is the one that
 * matters most and would not exist on a naive board: when the router cannot
 * find the client's SPOC for a Dept, or finds two, the item lands here with a
 * SENTENCE saying which. EVERYTHING is the delivery meeting's view.
 *
 * TO CHECK and ESCALATED are not the board sliced at all — they are different
 * KINDS of row (a check waiting on somebody; the record that somebody was told)
 * so each has its own renderer and the Board/List toggle is hidden while either
 * is open. To check is the whole FIRM's queue, never "mine".
 *
 * ── OVERDUE FIRST, AND THE DAY IS THE BROWSER'S ─────────────────────────────
 *
 * The API orders the board and takes `asOf` to decide what is late. The browser
 * sends its LOCAL calendar day, because a server in UTC is a day behind a firm
 * in India every morning.
 *
 * ── NOTHING HERE COMPARES A STATE'S CODE ────────────────────────────────────
 *
 * States and priorities are ROWS the firm owns and may rename. So this screen
 * reads the FLAGS — `isBlocked`, `isTerminal` — and prints the NAME.
 *
 * ── THE WAVE 4 SHAPE (2026-09-28) ───────────────────────────────────────────
 *
 * New task is the one brand button and opens a dialog (it was a disclosure card
 * above the tabs). No eyebrow and no lede; the Jobs link is the sidebar's. The
 * list is whole-row links, and a long routing note wraps in its cell: before,
 * one "Raised by hand with no Dept…" sentence made the Whose desk column so wide
 * that Due, State and Priority sat 1168px off the right edge at 1280.
 *
 * ── A DATED LIST FIRST, AND THE PLACE IS IN THE URL (V1.2, 2026-09-28) ──────
 *
 * It opened as the board, one column per state, and at 1440 the fifth column
 * (Blocked) was off the right edge: the walk found a critical, late GSTR-3B
 * waiting on the client in exactly that column. So it opens as the LIST now,
 * overdue first and then by due date, and being stuck is a flag on the row
 * (the state in danger tone with its reason, or "Waiting on" another task),
 * never a column somebody has to scroll to. The board is one click away.
 * `?tab=&view=` hold the place, so Back from a task lands where you were.
 *
 * ── BY PERSON, AND COUNTS THAT SAY WHAT THEY COUNT (audit 2026-10-03) ───────
 *
 * A manager could not see who was overloaded (CA#32): By person is one row per
 * colleague with their open, late and waiting-for-a-check tasks, and a name
 * opens All tasks filtered to them (`?person=`, kept in the URL like the tab).
 * "Escalated 45" sat beside "Everything 26" (F28): one counted notices, the
 * other tasks. Every tab now counts pieces of work: Escalated counts the tasks
 * and filings escalated, and its panel says how many notices that was.
 */
export default function WorkItemsPage() {
  // `useSearchParams` suspends during prerender; the boundary is the
  // framework's requirement, and it shows the page's own loading line.
  return (
    <Suspense fallback={<Loading label="Loading the board" />}>
      <WorkBoardPage />
    </Suspense>
  );
}

const TABS = ["mine", "unassigned", "checks", "escalated", "people", "all"] as const;
type BoardTab = (typeof TABS)[number];
type BoardView = "board" | "list";

function WorkBoardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reportCounts = useNavCounts();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [checks, setChecks] = useState<WorkItemCheckRow[]>([]);
  const [me, setMe] = useState<Principal | null>(null);
  // The URL is where the place is KEPT (Back returns to it); this state is what
  // the screen reads, so two quick clicks never read a URL that is mid-update.
  const [tab, setTab] = useState<BoardTab>(() => TABS.find((t) => t === params.get("tab")) ?? "mine");
  /** T4.5's queue. A different KIND of row from the three tabs beside it — the
   *  record that somebody was TOLD about work, not the work. */
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  /** Whether the firm has published a ladder at all. Without it an empty queue
   *  at a firm that never wrote one is indistinguishable from everything being
   *  on time, and only one of those means the product is doing anything. */
  const [ladderPublished, setLadderPublished] = useState(false);
  const tabsId = useId();
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [staff, setStaff] = useState<Colleague[]>([]);
  const [includeDone, setIncludeDone] = useState(false);
  /** The firm's own states, which are the board's COLUMNS. */
  const [states, setStates] = useState<WorkItemState[]>([]);
  /**
   * BOARD OR LIST, and it is a VIEW rather than another tab: the tabs are
   * different QUESTIONS, this is the same question drawn two ways, and a tab
   * would have left "Mine, as a board" nowhere to live. The LIST by default.
   */
  const [view, setView] = useState<BoardView>(() => (params.get("view") === "board" ? "board" : "list"));
  /** All tasks of one person (a user id), of nobody (`""`), or everybody
   *  (null). CA#32: picked from By person or the filter on All tasks. */
  const [person, setPerson] = useState<string | null>(() => params.get("person"));
  /**
   * Tab and view, written into the URL with `history.replaceState`: not a
   * history entry of its own, so Back from a task returns to this exact place.
   * `router.replace` was the first version, and it is a transition: pressing
   * Everything and then Board quickly wrote `?tab=mine&view=board`, because
   * the second press read the tab before the first had landed. Found by the walk.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === tab && q.get("view") === view && q.get("person") === person) return;
    q.set("tab", tab);
    q.set("view", view);
    if (person === null) q.delete("person");
    else q.set("person", person);
    window.history.replaceState(null, "", `${pathname}?${q.toString()}`);
  }, [tab, view, person, pathname]);
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // THE CALLER'S CALENDAR DAY. `toISOString().slice(0, 10)` here would be the
    // UTC day and would call a filing due today "overdue" for anybody west of
    // Greenwich, and "not yet" for anybody east.
    const now = new Date();
    const asOf = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Everything in one pass, so the tab counts are right the moment the page
    // paints and agree with each other. The API's own `mine=true` filter is not
    // used for the same reason: three queries disagree while one is in flight.
    const [board, queue, principal, book, roster, vocabulary, escalated] = await Promise.all([
      api.GET("/api/v1/work-items", {
        params: { query: { asOf, includeDone: includeDone ? "true" : "false" } },
      }),
      api.GET("/api/v1/work-item-checks", {}),
      api.GET("/api/v1/auth/me", {}),
      // For the New task form. `party:read`, the same permission the board
      // itself takes, so anybody who can see this screen can fill it in.
      api.GET("/api/v1/parties", {}),
      // The colleagues PICKER, not the roster: names and rungs of active staff
      // on `party:read` (the roster is `tenant:admin`). It also names the
      // grades, which is how an escalation sent to "rank 10 or above" reads as
      // "Partner or above".
      api.GET("/api/v1/tenancy/colleagues", {}),
      api.GET("/api/v1/work-vocabulary", {}),
      // T4.5. The WHOLE firm's, never `mine=true`: a queue narrowed to what you
      // personally may act on hides that six tasks have been escalated for a
      // week because nobody senior enough looked.
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
    // The sidebar's count is what is on YOUR desk (V2.1), as the Mine tab says.
    if (!principal.error && !includeDone) {
      reportCounts({
        "/work-items": board.data.items.filter((i) => i.assignee?.userId === principal.data.userId).length,
      });
    }
    setParties(book.data?.parties ?? []);
    setStaff(roster.data?.colleagues ?? []);
    // A refusal empties a queue tab rather than blanking the page.
    setChecks(queue.error ? [] : queue.data.checks);
    setStates(vocabulary.data?.states ?? []);
    setEscalations(escalated.error ? [] : escalated.data.rows);
    setLadderPublished(escalated.error ? false : escalated.data.ladderPublished);
    setError(null);
    setLoaded(true);
  }, [router, includeDone, reportCounts]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading the board" />;

  // Filtered in the browser rather than re-fetched per tab: the whole board is
  // one query already. THE BROWSER'S CALENDAR DAY, the value `asOf` sends.
  const now = new Date();
  const localToday = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const mine = items.filter((i) => i.assignee !== null && i.assignee.userId === me?.userId);
  // The viewer's own share of the check queue. The queue itself is never
  // filtered by this, but the notice has to say what waits on the reader.
  const mineToCheck = checks.filter((c) => c.viewer.eligible).length;
  const unassigned = items.filter((i) => i.assignee === null);
  // All tasks, narrowed to one person when one is picked (CA#32).
  const everyone =
    person === null
      ? items
      : items.filter((i) => (person === "" ? i.assignee === null : i.assignee?.userId === person));
  const shown = datedOrder(
    tab === "mine" ? mine : tab === "unassigned" ? unassigned : everyone,
    localToday,
  );
  // Rank -> the firm's name for it, from the grades its active staff hold.
  const gradeNames = new Map<number, string>();
  for (const c of staff) {
    if (c.gradeRank !== null && c.gradeName !== null) gradeNames.set(c.gradeRank, c.gradeName);
  }
  // Offered from what /auth/me says the session holds. Somebody without
  // `work:write` still gets an accurate refusal from the API.
  const mayRaise = me?.permissions.includes("work:write") === true;

  return (
    <Page>
      <PageHeader
        title="Work board"
        aside={
          mayRaise ? (
            <Button
              onClick={() => {
                setRaising(true);
              }}
            >
              New task
            </Button>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      {/* Not on the To check tab itself, where it would repeat the tab. */}
      {checks.length > 0 && tab !== "checks" && (
        <Notice tone="warn">
          <p>
            <strong>{checks.length}</strong>{" "}
            {checks.length === 1 ? "task is" : "tasks are"} waiting to be checked
            {mineToCheck > 0 && <>, {mineToCheck} of them yours</>}.{" "}
            {/* It used to link to `checks[0]`, the oldest, and there was no way
                to reach the second: the tab is the list. */}
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setTab("checks");
              }}
            >
              Open the queue
            </Button>
          </p>
        </Notice>
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
          // Pieces of WORK, like every other tab, not notices (F28).
          { value: "escalated", label: "Escalated", count: escalatedSubjects(escalations) },
          { value: "people", label: "By person" },
          { value: "all", label: "All tasks", count: items.length },
        ]}
      />

      {/* Neither control means anything on the two QUEUES: neither has a board
          shape, and neither lists finished work. */}
      {tab !== "escalated" && tab !== "checks" && tab !== "people" && (
        <div className="row">
          <span className="cluster">
            <Checkbox
              label="Include finished work"
              checked={includeDone}
              onChange={(e) => {
                setIncludeDone(e.target.checked);
              }}
            />
            {/* WHOSE TASKS (CA#32), on All tasks: Mine and Unassigned are
                already one desk each. */}
            {tab === "all" && staff.length > 0 && (
              <Select
                size="sm"
                aria-label="Whose tasks"
                value={person ?? "*"}
                onChange={(e) => {
                  setPerson(e.target.value === "*" ? null : e.target.value);
                }}
              >
                <option value="*">Everybody&rsquo;s tasks</option>
                <option value="">On nobody&rsquo;s desk</option>
                {staff.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {colleagueLabel(c)}
                  </option>
                ))}
              </Select>
            )}
          </span>
          {/* A pair of toggle buttons rather than a `<Tabs>`: the same panel
              drawn two ways, not navigation between panels. */}
          <span className="cluster tight">
            <Button
              variant={view === "board" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "board"}
              onClick={() => {
                setView("board");
              }}
            >
              Board
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === "list"}
              onClick={() => {
                setView("list");
              }}
            >
              List
            </Button>
          </span>
        </div>
      )}

      <TabPanel tabsId={tabsId} value={tab}>
        {tab === "checks" ? (
          <CheckQueue
            checks={checks}
            today={localToday}
            onDecided={() => void load()}
            onError={setError}
          />
        ) : tab === "escalated" ? (
          <EscalationQueue
            rows={escalations}
            ladderPublished={ladderPublished}
            gradeNames={gradeNames}
          />
        ) : tab === "people" ? (
          <Workload
            items={items}
            staff={staff}
            today={localToday}
            onPick={(userId) => {
              setPerson(userId);
              setTab("all");
            }}
          />
        ) : shown.length === 0 ? (
          <Card>
            <Empty title={emptyTitle(tab)} icon="board">
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
                  <Th>Task</Th>
                  <Th>Client</Th>
                  <Th>Whose desk</Th>
                  <Th>Due</Th>
                  <Th>State</Th>
                  <ThChevron />
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

      {mayRaise && (
        <NewTaskDialog
          open={raising}
          parties={parties}
          staff={staff}
          onClose={() => {
            setRaising(false);
          }}
          onRaised={() => {
            setRaising(false);
            void load();
          }}
        />
      )}
    </Page>
  );
}

/**
 * OVERDUE FIRST, THEN BY DUE DATE (V1.2). Late work at the top, oldest first;
 * then the rest by date; work with no due date last. Priority breaks a tie
 * (the RANK, 1 = most urgent), then the title, so the order never shuffles
 * between two loads of the same board.
 */
function datedOrder(list: readonly WorkItem[], today: string): WorkItem[] {
  const late = (i: WorkItem): boolean =>
    i.dueOn !== null && i.dueOn < today && !i.state.isTerminal;
  return [...list].sort((a, b) => {
    const byLate = Number(late(b)) - Number(late(a));
    if (byLate !== 0) return byLate;
    if (a.dueOn !== b.dueOn) {
      if (a.dueOn === null) return 1;
      if (b.dueOn === null) return -1;
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    if (a.priority.rank !== b.priority.rank) return a.priority.rank - b.priority.rank;
    return a.title.localeCompare(b.title);
  });
}

/** Neither queue tab reaches these — each writes its own empty state. */
function emptyTitle(tab: BoardTab): string {
  if (tab === "mine") return "Nothing on your desk";
  if (tab === "unassigned") return "Everything has an owner";
  return "No tasks yet";
}
function emptyMessage(tab: BoardTab): string {
  if (tab === "mine") return "Tasks come to you as a client's SPOC, or when someone assigns you one.";
  // The good state: an empty unassigned queue means the router placed
  // everything, which means the firm's SPOCs are recorded.
  if (tab === "unassigned") return "Every task is on someone's desk.";
  return "Tasks appear when a signed engagement starts, or when you add one with New task.";
}

/**
 * One row of the list.
 *
 * The four things a person scans for, in the order they scan them: what it is,
 * who it is for, whose it is, when it is due. The whole row opens the task; the
 * checklist, dependencies and reviews are on its page.
 */
function WorkRow({ item, today }: { item: WorkItem; today: string }) {
  const overdue = item.dueOn !== null && item.dueOn < today && !item.state.isTerminal;
  const dueToday = item.dueOn === today && !item.state.isTerminal;
  // 1 = MOST urgent, per the schema: the RANK, never the name. Only the two
  // urgent ranks are said on the row; normal priority is the default and a
  // column of "Medium" was a column nobody read.
  const urgent = item.priority.rank <= 2;
  // On an ASSIGNED task the note is the owner rule's hand-out sentence (T6.17);
  // the list says so in three words and the card and the task page say it in
  // full. Anything else a note might say is shown as written.
  const handOut = item.assignee !== null && item.assignmentNote?.includes("hand out") === true;

  return (
    <Tr linked>
      <Td>
        <span className="cell-text" data-size="narrow">
          <RowLink href={`/work-items/${item.id}`}>{item.title}</RowLink>
        </span>
        {item.hasOpenReview && <Pill tone="ok">In review</Pill>}
        {urgent && (
          <Sub>
            <span className={item.priority.rank <= 1 ? "tone-danger" : "tone-warn"}>
              {item.priority.name} priority
            </span>
          </Sub>
        )}
        {item.checklistTotal > 0 && (
          <Sub>{`${String(item.checklistDone)} of ${String(item.checklistTotal)} ticked`}</Sub>
        )}
        {/* WHY IT IS STUCK, under the task rather than in the State column: a
            reason is free text, and a third wrapped column is what the list
            cannot fit at 1280. In the danger tone, with the State pill beside
            it: this pair IS the Blocked flag the board's hidden fifth column
            used to be (V1.2). */}
        {item.state.isBlocked && item.blockedReason !== null && (
          <Sub>
            <span className="cell-text tone-danger" data-size="narrow">
              {item.blockedReason}
            </span>
          </Sub>
        )}
        {/* What this item is WAITING ON, because "why has nobody started this"
            is what a board is asked. Warn, not danger: held up, not wrong. */}
        {item.blockedByOpen.length > 0 && (
          <Sub>
            <span className="cell-text tone-warn" data-size="narrow">
              Waiting on {item.blockedByOpen.map((b) => b.title).join(", ")}
            </span>
          </Sub>
        )}
      </Td>
      <Td>
        <span className="cell-text" data-size="narrow">
          {item.clientName}
        </span>
        {/* The ENTITY, when the work is about one particular company: a group of
            four companies files four sets of returns (G0.1). */}
        {item.entityName !== null && item.entityName !== item.clientName && (
          <Sub>{item.entityName}</Sub>
        )}
      </Td>
      <Td>
        {item.assignee === null ? (
          <NotSet>Nobody yet</NotSet>
        ) : (
          (item.assignee.displayName ?? item.assignee.email)
        )}
        {/* THE SENTENCE on an unassigned task: "two SPOCs for FRC, pick one"
            and "nobody has got to it" must not look identical. */}
        {item.assignmentNote !== null &&
          (handOut ? (
            <Sub>To hand out</Sub>
          ) : (
            <Sub>
              <span className="cell-text" data-size="narrow">
                {item.assignmentNote}
              </span>
            </Sub>
          ))}
      </Td>
      <Td className="nowrap">
        {item.dueOn === null ? (
          // Not a blank: a service whose SLA the firm has not stated produces
          // work with no deadline, and inventing one would set a priority.
          <NotSet>No due date</NotSet>
        ) : (
          <>
            <span className={overdue ? "tone-danger" : dueToday ? "tone-warn" : undefined}>
              {longDay(item.dueOn)}
            </span>
            {overdue && <Sub>Late</Sub>}
            {dueToday && <Sub>Today</Sub>}
          </>
        )}
      </Td>
      <Td className="nowrap">
        {/* The NAME the firm chose, and the tone from the FLAG. */}
        <Pill
          dot
          tone={item.state.isBlocked ? "danger" : item.state.isTerminal ? "neutral" : "ok"}
        >
          {item.state.name}
        </Pill>
      </Td>
      <RowChevron />
    </Tr>
  );
}

/**
 * New task, in a dialog.
 *
 * NO PRIORITY FIELD, deliberately, and the same call 10x CRM made on the same
 * screen: the one thing the firm said about priority is that statutory
 * deadlines are high anyway. So the tick decides it and the API resolves the
 * firm's own statutory default (`isStatutoryDefault` on a priority row).
 */
function NewTaskDialog({
  open,
  parties,
  staff,
  onClose,
  onRaised,
}: {
  open: boolean;
  parties: readonly PartySummary[];
  staff: readonly Colleague[];
  onClose: () => void;
  onRaised: () => void;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const dueOn = String(form.get("dueOn") ?? "");
    const assigneeUserId = String(form.get("assigneeUserId") ?? "");
    const result = await api.POST("/api/v1/work-items", {
      body: {
        clientPartyId: String(form.get("clientPartyId")),
        title: String(form.get("title")),
        isStatutoryDue: form.get("isStatutoryDue") === "on",
        // SENT, never left to a default (V1.4): the box is what the person saw.
        isClientVisible: form.get("isClientVisible") === "on",
        // Omitted rather than sent as null when empty: absent means "the API
        // decides", which for the assignee is the SPOC router and for the due
        // date is the service's own SLA. Null would say "there is none".
        ...(dueOn === "" ? {} : { dueOn }),
        ...(assigneeUserId === "" ? {} : { assigneeUserId }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    onRaised();
  }

  return (
    <Dialog
      open={open}
      size="lg"
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="New task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Add task
          </Button>
        </>
      }
    >
      <form
        id={formId}
        action={(f) => {
          void submit(f);
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <FieldRow>
            <Field label="Client">
              <Select name="clientPartyId" required defaultValue="">
                <option value="" disabled>
                  Choose a client
                </option>
                {/* NOT the firm's own companies (F14, CA#59): they are who
                    does the work, never whom it is for. */}
                {parties
                  .filter((party) => !party.isOwnCompany)
                  .map((party) => (
                    <option key={party.id} value={party.id}>
                      {party.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="What has to be done">
              <Input name="title" required autoFocus placeholder="e.g. GSTR-3B filing, August 2026" />
            </Field>
          </FieldRow>
          <FieldRow>
            {/* Only when the picker loaded; `party:read`, like the board. */}
            {staff.length > 0 && (
              <Field label="Whose desk" optional>
                {/* A task raised here is not routed: with nobody picked it
                    waits on the Unassigned tab. The empty option said "The
                    client's SPOC", which the API never did for a hand-raised
                    task. */}
                <Select name="assigneeUserId" defaultValue="">
                  <option value="">Nobody yet</option>
                  {staff.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {colleagueLabel(m)}
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
            note="Gets the firm's statutory priority."
          />
          {/* UNTICKED BY DEFAULT (V1.4). A task raised here is often an internal
              note, and it used to reach the client's portal unless somebody
              remembered to untick this. The API's default is `false` too. */}
          <Checkbox
            name="isClientVisible"
            label="Show to the client"
            note="The client sees it on their portal."
          />
        </FieldStack>
      </form>
    </Dialog>
  );
}
