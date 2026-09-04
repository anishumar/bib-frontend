"use client";

import Link from "next/link";
import type { WorkItem, WorkItemState } from "@/lib/api/client";
import { Card, Pill, Tooltip } from "@/components/ui";
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
 *
 * ── WHY IT LOOKS THE WAY IT DOES ────────────────────────────────────────────
 *
 * A column is a sunk panel and a card lifts off it, because a board drawn as a
 * run of plain white cards on white paper has no shape to scan — the eye has to
 * read titles to find where one column stops. The styling is all in
 * `design/components.css` under "Work board"; this file names the classes and
 * decides WHICH FACT each of them carries, which is the part worth arguing
 * about. Every colour on a card is a status: the left edge is late / due today
 * / in review / done, the priority dot is the firm's own `rank`, and nothing is
 * tinted for being a card.
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
    <div className="board" role="list" aria-label="Work board, one column per state">
      {columns.map((state) => {
        const inColumn = items.filter((i) => i.state.id === state.id);
        // The tone is read off the FLAG, never a branch on the code — a firm
        // that renames "Blocked" keeps the red dot, which is the whole reason
        // the flag exists.
        const tone = state.isBlocked ? "danger" : state.isTerminal ? "neutral" : "accent";
        return (
          <section
            key={state.id}
            role="listitem"
            aria-label={state.name}
            className="board-col"
            data-tone={tone}
          >
            {/* The count sits NEXT TO the name, not at the far edge of the
                column. `space-between` put it there, and on a wide column the
                number ended up disconnected from the thing it counts — found by
                looking at the board, which is the only way this shows. */}
            <header className="board-col-head">
              <span className="board-col-dot" aria-hidden="true" />
              {/* The NAME the firm chose. */}
              <h2 className="board-col-name">{state.name}</h2>
              {/* THE DOT IS NEVER ALONE. What it means is also here in words,
                  because a board whose only signal is a hue fails the reader it
                  most needs to reach. */}
              {state.isBlocked && <span className="board-col-tag">stuck</span>}
              {state.isTerminal && <span className="board-col-tag">done</span>}
              {!state.isActive && <span className="board-col-tag">retired</span>}
              <span className="board-col-count">{inColumn.length}</span>
            </header>
            <div className="board-col-body">
              {!state.isActive && (
                <p className="wcard-note">
                  Retired — nothing new can be moved here, and what is here stays.
                </p>
              )}
              {inColumn.length === 0 ? (
                // Said, not blank. An empty column is an ANSWER — "nothing is
                // under review" — and a blank space reads as a rendering fault.
                <p className="board-col-empty">Nothing here</p>
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
 * Initials for the footer disc.
 *
 * Two letters at most — a middle name in the circle makes three that fit
 * nowhere and identify nobody better.
 *
 * THE DOMAIN AND THE DIGITS GO FIRST. Half this board's people are shown by
 * email, because `displayName` is optional and a seeded login has none: naively
 * split, `partner-1788079646@example.com` gives "PE" from the domain, or "P1"
 * from the timestamp, and a column of discs all reading "P1" is worse than no
 * disc at all. So: cut at the `@`, then keep only the parts that start with a
 * letter.
 */
function initials(name: string): string {
  const local = name.split("@")[0] ?? name;
  const words = local
    .trim()
    .split(/[\s._-]+/)
    .filter((p) => /^[a-z]/i.test(p));
  const letters = words.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
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
  const dueToday = item.dueOn === today && !item.state.isTerminal;

  /**
   * THE LEFT EDGE, and the one ladder that decides it. First match wins, and
   * the order is what somebody is looking for in the order they look:
   *
   *   done    finished work, only here because the switch is on — it steps back
   *   late    the reason this screen exists
   *   today   the one that becomes `late` overnight if nobody moves
   *   review  waiting on a checker, which is waiting on a PERSON, not a date
   *
   * Anything else gets the neutral edge. That is deliberate: an edge on every
   * card in four colours is a decoration, and the two that mean "act now" stop
   * carrying anything.
   */
  const flag = item.state.isTerminal
    ? "done"
    : overdue
      ? "late"
      : dueToday
        ? "today"
        : item.hasOpenReview
          ? "review"
          : "none";

  // 1 = MOST urgent, per the schema. The RANK, never the name — a firm that
  // calls rank 1 "Statutory" must not lose the dot for having renamed it.
  const rank = item.priority.rank <= 1 ? "top" : item.priority.rank <= 2 ? "high" : "normal";

  const who = item.assignee?.displayName ?? item.assignee?.email ?? null;

  return (
    <article className="wcard" data-flag={flag}>
      <h3 className="wcard-title">
        <Link href={`/work-items/${item.id}`}>{item.title}</Link>
      </h3>

      {/* WHO IT IS FOR — and the ENTITY, when the work is about one particular
          company. A group of four companies files four sets of returns, and
          four cards saying only "Kaveri Foods Group" are four identical cards. */}
      <p className="wcard-for" title={item.clientName}>
        {item.clientName}
        {item.entityName !== null && item.entityName !== item.clientName && (
          <> · {item.entityName}</>
        )}
      </p>

      <div className="wcard-meta">
        {item.dueOn === null ? (
          <Tooltip text="The firm has not stated a turnaround for this service">
            <span className="unstated">no date</span>
          </Tooltip>
        ) : (
          <span className="wcard-due" data-tone={overdue ? "danger" : dueToday ? "warn" : undefined}>
            {item.dueOn}
            {overdue && " · late"}
            {dueToday && " · today"}
          </span>
        )}

        {/* THE SEPARATION IS LOAD-BEARING. Run together, the line read
            "2026-05-22 · late High" — one phrase, with the priority looking like
            part of the lateness. The list view never showed this because its two
            facts sit in two table cells; on a card they share a line, and a card
            is what somebody scans fastest. The dot is what holds them apart now
            that the middot has gone. */}
        <span className="wcard-prio" data-rank={rank}>
          {item.priority.name}
        </span>

        {item.checklistTotal > 0 && (
          <span
            className="wcard-prog"
            title={`${String(item.checklistDone)} of ${String(item.checklistTotal)} steps ticked`}
          >
            <span className="wcard-prog-track">
              <span
                className="wcard-prog-fill"
                style={{ width: `${String((item.checklistDone / item.checklistTotal) * 100)}%` }}
              />
            </span>
            {item.checklistDone}/{item.checklistTotal}
          </span>
        )}

        {item.hasOpenReview && <Pill tone="accent">in review</Pill>}
      </div>

      <div className="wcard-foot" data-nobody={who === null ? "true" : undefined}>
        <span className="avatar" data-size="sm" aria-hidden="true">
          {who === null ? "—" : initials(who)}
        </span>
        <span className="who">{who ?? "Unassigned"}</span>
      </div>

      {/* THE SENTENCE. Without it an unassigned card is a card with a gap: "two
          SPOCs for FRC, pick one" and "nobody has got to it" look identical, and
          only one of them is somebody's to fix. */}
      {item.assignee === null && item.assignmentNote !== null && (
        <p className="wcard-note">{item.assignmentNote}</p>
      )}

      {item.state.isBlocked && item.blockedReason !== null && (
        <p className="wcard-note" data-tone="danger">
          {item.blockedReason}
        </p>
      )}
      {item.blockedByOpen.length > 0 && (
        <p className="wcard-note">
          Waiting on {item.blockedByOpen.map((b) => b.title).join(", ")}
        </p>
      )}
    </article>
  );
}
