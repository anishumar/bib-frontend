"use client";

import Link from "next/link";
import type { WorkItem, WorkItemState } from "@/lib/api/client";
import { Card, Pill, Sub, Tooltip } from "@/components/ui";
import { Empty } from "@/components/states";

/**
 * The work board as COLUMNS — one per state the firm has named (T6.1).
 *
 * ── THE COLUMNS ARE THE FIRM'S OWN ROWS, NEVER A LIST IN THIS FILE ──────────
 *
 * 0050 made states rows precisely so a firm could rename "Blocked" to "Stuck"
 * and add "Waiting on the auditor" without a deploy. A board with hardcoded
 * columns would take that back on the one screen where it shows most: the firm
 * would rename a state on `/admin/work-vocabulary` and find its board still
 * saying the old word, or worse, a column that silently holds nothing. So the
 * columns come from `GET /work-vocabulary` — `party:read`, the same permission
 * the board itself needs — ordered by the firm's own `sortOrder`.
 *
 * A state with NO items still gets its column. "Nothing is under review" is a
 * fact worth seeing, and a board whose shape changed as work moved would be
 * unreadable week to week — the same argument `/dashboard` makes for showing
 * every ageing band including the empty ones.
 *
 * ── THERE IS NO DRAG-AND-DROP, AND THAT IS A DECISION ───────────────────────
 *
 * Moving an item into a state the firm has flagged `is_blocked` REQUIRES a
 * written reason — the service refuses without one and so does a trigger, so a
 * drag would produce a refusal with nowhere to type the answer. And every state
 * change writes an audit event naming its actor, which is not something to make
 * one pixel of slippage away from.
 *
 * So a card is a LINK to the item, where the state picker already handles both:
 * it offers only active states, and it opens the reason box the moment the
 * selected state is a blocked one. A board that only reads is worth more than
 * one that writes carelessly.
 *
 * ── RETIRED STATES ARE NOT COLUMNS, BUT THEIR WORK STILL SHOWS ──────────────
 *
 * A firm may retire a state while a hundred items sit in it; nothing moves them
 * and nothing may, because `bib_app` holds no DELETE grant and the row is part
 * of why the work is where it is. A retired state therefore gets a column only
 * when something is actually IN it, marked so the reader knows why an item is
 * somewhere they cannot put anything new.
 */
export function WorkBoard({
  items,
  states,
  /** The BROWSER's calendar day. The API takes `asOf` for the same reason: a
   *  UTC day calls work due today "late" west of Greenwich and "not yet" east,
   *  and this board's whole job is saying what is late. */
  today,
  includeDone,
}: {
  items: WorkItem[];
  states: WorkItemState[];
  today: string;
  includeDone: boolean;
}) {
  const held = new Set(items.map((i) => i.state.id));

  const columns = states
    .filter((s) => {
      // Terminal states are hidden with the same switch that hides finished
      // work from the list — otherwise "Completed" is the widest column on
      // every board and the work in hand is squeezed out of view.
      if (s.isTerminal && !includeDone) return false;
      return s.isActive || held.has(s.id);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (columns.length === 0) {
    return (
      <Card>
        <Empty title="This firm has named no states" icon="board">
          The board&rsquo;s columns are the firm&rsquo;s own states. Add them on Work vocabulary.
        </Empty>
      </Card>
    );
  }

  return (
    <div
      role="list"
      aria-label="Work board, one column per state"
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(16rem, 1fr)",
        gap: "var(--s-4)",
        overflowX: "auto",
        paddingBottom: "var(--s-2)",
      }}
    >
      {columns.map((state) => {
        const inColumn = items.filter((i) => i.state.id === state.id);
        return (
          <section key={state.id} role="listitem" aria-label={state.name}>
            {/* The count sits NEXT TO the name, not at the far edge of the
                column. `space-between` put it there, and on a wide column the
                number ended up disconnected from the thing it counts — found by
                looking at the board, which is the only way this shows. */}
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-2)",
                marginBottom: "var(--s-2)",
              }}
            >
              {/* The NAME the firm chose, and the tone from the FLAG. A branch
                  on the code would go quiet the day somebody renames it. */}
              <Pill tone={state.isBlocked ? "danger" : state.isTerminal ? "neutral" : "accent"}>
                {state.name}
              </Pill>
              <span className="faint mono">{inColumn.length}</span>
            </header>
            {!state.isActive && (
              <Sub>Retired — nothing new can be moved here, and what is here stays.</Sub>
            )}
            <div style={{ display: "grid", gap: "var(--s-2)" }}>
              {inColumn.length === 0 ? (
                // Said, not blank. An empty column is an ANSWER — "nothing is
                // under review" — and a blank space reads as a rendering fault.
                <p className="empty">Nothing here</p>
              ) : (
                inColumn.map((item) => <WorkCard key={item.id} item={item} today={today} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One card.
 *
 * The same four things the row shows, in the order somebody scans them — what
 * it is, who it is for, whose it is, when it is due — because a card that
 * carried the checklist, the dependencies and the reviews as well would be a
 * board nobody reads. Everything else is on the item's own page.
 */
function WorkCard({ item, today }: { item: WorkItem; today: string }) {
  const overdue = item.dueOn !== null && item.dueOn < today && !item.state.isTerminal;

  return (
    <Card pad="sm">
      <div style={{ display: "grid", gap: "var(--s-1)" }}>
        <span className="cluster tight">
          <Link href={`/work-items/${item.id}`}>{item.title}</Link>
          {item.checklistTotal > 0 && (
            <span className="mono faint">
              {item.checklistDone}/{item.checklistTotal}
            </span>
          )}
          {item.hasOpenReview && <Pill tone="accent">in review</Pill>}
        </span>

        <Sub>
          {item.clientName}
          {/* The ENTITY, when the work is about one particular company. A group
              of four companies files four sets of returns, and four cards
              saying only "Kaveri Foods Group" are four identical cards. */}
          {item.entityName !== null && item.entityName !== item.clientName && (
            <> · {item.entityName}</>
          )}
        </Sub>

        <span className="cluster tight">
          {item.dueOn === null ? (
            <Tooltip text="The firm has not stated a turnaround for this service">
              <span className="unstated">no date</span>
            </Tooltip>
          ) : (
            <span className={overdue ? "mono tone-danger" : "mono"}>
              {item.dueOn}
              {overdue && " · late"}
            </span>
          )}
          {/* THE SEPARATOR IS LOAD-BEARING. Without it the line read
              "2026-05-22 · late High" — one phrase, with the priority looking
              like part of the lateness. The list view never showed this because
              its two facts sit in two table cells; on a card they share a line,
              and a card is what somebody scans fastest. */}
          <span className="faint">· {item.priority.name}</span>
        </span>

        {item.assignee === null ? (
          <>
            <span className="empty">Unassigned</span>
            {/* THE SENTENCE. Without it an unassigned card is a card with a gap:
                "two SPOCs for FRC, pick one" and "nobody has got to it" look
                identical, and only one of them is somebody's to fix. */}
            {item.assignmentNote !== null && <Sub>{item.assignmentNote}</Sub>}
          </>
        ) : (
          <Sub>{item.assignee.displayName ?? item.assignee.email}</Sub>
        )}

        {item.state.isBlocked && item.blockedReason !== null && (
          <Sub>{item.blockedReason}</Sub>
        )}
        {item.blockedByOpen.length > 0 && (
          <Sub>Waiting on {item.blockedByOpen.map((b) => b.title).join(", ")}</Sub>
        )}
      </div>
    </Card>
  );
}
