"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { Principal, WorkItem, WorkItemReview } from "@/lib/api/client";

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
 * ── THE THREE TABS ARE THREE DIFFERENT JOBS ─────────────────────────────────
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
  const [checks, setChecks] = useState<WorkItemReview[]>([]);
  const [me, setMe] = useState<Principal | null>(null);
  const [tab, setTab] = useState<"mine" | "unassigned" | "all">("mine");
  const [includeDone, setIncludeDone] = useState(false);
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
    const [board, queue, principal] = await Promise.all([
      api.GET("/api/v1/work-items", {
        params: { query: { asOf, includeDone: includeDone ? "true" : "false" } },
      }),
      api.GET("/api/v1/work-item-checks", {}),
      api.GET("/api/v1/auth/me", {}),
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
    // The review queue is `party:read` like the board, but a role that can read
    // one and not the other is possible in principle — so a refusal here empties
    // the tab rather than blanking the page.
    setChecks(queue.error ? [] : queue.data.checks);
    setError(null);
    setLoaded(true);
  }, [router, includeDone]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  // Filtered in the browser rather than re-fetched per tab: the whole board is
  // one query already, and three round trips to move between tabs would make
  // the counts disagree with the rows for as long as one was in flight.
  const mine = items.filter((i) => i.assignee !== null && i.assignee.userId === me?.userId);
  const unassigned = items.filter((i) => i.assignee === null);
  const shown = tab === "mine" ? mine : tab === "unassigned" ? unassigned : items;

  return (
    <main>
      <div className="bib-nav">
        <Link href="/">← Home</Link>
        <Link href="/work">The engine →</Link>
      </div>
      <h1>Work</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-nav" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <button
          type="button"
          className={tab === "mine" ? "bib-button" : "bib-button-quiet"}
          onClick={() => { setTab("mine"); }}
        >
          Mine ({mine.length})
        </button>
        <button
          type="button"
          className={tab === "unassigned" ? "bib-button" : "bib-button-quiet"}
          onClick={() => { setTab("unassigned"); }}
        >
          Unassigned ({unassigned.length})
        </button>
        <button
          type="button"
          className={tab === "all" ? "bib-button" : "bib-button-quiet"}
          onClick={() => { setTab("all"); }}
        >
          Everything ({items.length})
        </button>
      </div>

      <label className="bib-check" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <input
          type="checkbox"
          checked={includeDone}
          onChange={(e) => { setIncludeDone(e.target.checked); }}
        />
        <span>
          Include finished work. Off by default — a board of everything the firm has ever
          done is not a board.
        </span>
      </label>

      {checks.length > 0 && (
        <div className="bib-callout" style={{ marginBottom: "var(--bib-gap-2)" }}>
          <strong>{checks.length}</strong>{" "}
          {checks.length === 1 ? "task is" : "tasks are"} waiting to be checked.{" "}
          {/* The whole firm's, not "mine". Under a rank threshold there is no
              "mine", and a filtered queue hides that six tasks have waited a
              week because nobody senior enough has looked. */}
          <Link href={`/work-items/${checks[0]?.workItemId ?? ""}`}>Open the oldest →</Link>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="bib-muted">{emptyMessage(tab)}</p>
      ) : (
        <div className="bib-card">
          <table className="bib-table">
            <thead>
              <tr>
                <th>What</th>
                <th>For</th>
                <th>Who</th>
                <th>Due</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <WorkRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function emptyMessage(tab: "mine" | "unassigned" | "all"): string {
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
function WorkRow({ item }: { item: WorkItem }) {
  const today = new Date();
  const localToday = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const overdue = item.dueOn !== null && item.dueOn < localToday && !item.state.isTerminal;

  return (
    <tr>
      <td>
        <Link href={`/work-items/${item.id}`}>{item.title}</Link>
        {item.checklistTotal > 0 && (
          <span className="bib-muted" style={{ fontSize: 12, marginLeft: 6 }}>
            {item.checklistDone}/{item.checklistTotal}
          </span>
        )}
        {item.hasOpenReview && (
          <span className="bib-pill" data-tone="live" style={{ marginLeft: 6 }}>
            in review
          </span>
        )}
        {/* What this item is WAITING ON. Shown on the row and not only on the
            page, because "why has nobody started this" is the question a board
            is being asked when somebody scrolls past it for the third day. */}
        {item.blockedByOpen.length > 0 && (
          <p className="bib-hint">
            Waiting on {item.blockedByOpen.map((b) => b.title).join(", ")}
          </p>
        )}
      </td>
      <td>
        {item.clientName}
        {/* The ENTITY, when the work is about one particular company. A group of
            four companies files four sets of returns (G0.1), and a row that
            said only "Kaveri Foods Group" would be four identical rows. */}
        {item.entityName !== null && item.entityName !== item.clientName && (
          <span className="bib-muted" style={{ display: "block", fontSize: 12 }}>
            {item.entityName}
          </span>
        )}
      </td>
      <td>
        {item.assignee === null ? (
          <>
            <span className="bib-muted">—</span>
            {/* THE SENTENCE. Without it this cell is a dash and the queue is a
                pile: "two SPOCs for FRC, pick one" and "nobody has got to it"
                look identical, and only one of them is somebody's to fix. */}
            {item.assignmentNote !== null && <p className="bib-hint">{item.assignmentNote}</p>}
          </>
        ) : (
          (item.assignee.displayName ?? item.assignee.email)
        )}
      </td>
      <td>
        {item.dueOn === null ? (
          // Not a blank. A service whose SLA the firm has not stated produces
          // work with no deadline, which is a real state — and inventing one
          // would be this product setting a priority the firm never set.
          <span className="bib-muted" title="The firm has not stated a turnaround for this service">
            no date
          </span>
        ) : (
          <span className={overdue ? "bib-mono bib-error" : "bib-mono"} style={{ margin: 0 }}>
            {item.dueOn}
            {overdue && " · late"}
          </span>
        )}
      </td>
      <td>
        {/* The NAME the firm chose, and the tone from the FLAG. A branch on the
            code would go quiet the day somebody renames it. */}
        <span
          className="bib-pill"
          // `nowrap` because "Not Started" wrapped inside the pill and rendered
          // as a broken circle — the firm names these and a two-word name is
          // the ordinary case, not an edge one. Found by opening the page.
          style={{ whiteSpace: "nowrap" }}
          data-tone={item.state.isBlocked ? "revoked" : item.state.isTerminal ? undefined : "live"}
        >
          {item.state.name}
        </span>
        {item.state.isBlocked && item.blockedReason !== null && (
          <p className="bib-hint">{item.blockedReason}</p>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        <span className="bib-muted" style={{ fontSize: 12 }}>
          {item.priority.name}
        </span>
      </td>
    </tr>
  );
}
