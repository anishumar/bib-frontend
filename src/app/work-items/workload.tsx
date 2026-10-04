"use client";

import type { Colleague, WorkItem } from "@/lib/api/client";
import { colleagueLabel } from "@/lib/api/client";
import Link from "next/link";
import { Card, Table, TableWrap, Td, Th } from "@/components/ui";
import { Empty } from "@/components/states";

/**
 * WHO HAS HOW MUCH (audit 2026-10-03, CA#32).
 *
 * The roleplay's manager could not see who was overloaded: the board sliced the
 * work by Mine, Unassigned, To check, Escalated and All, and never by person.
 * This is one row per member of staff (and one for work on nobody's desk), with
 * the three numbers a manager balances on: open tasks, how many are late, and
 * how many are waiting for a check. A row's name opens All tasks filtered to
 * that person.
 *
 * Counted from the board's own read (every open task at the firm, one query),
 * so the numbers and the list a click opens cannot disagree. Tasks only: a
 * job's steps go with its task when the task is handed on.
 */
export function Workload({
  items,
  staff,
  today,
  onPick,
}: {
  items: readonly WorkItem[];
  staff: readonly Colleague[];
  today: string;
  /** Show All tasks for this person, or for nobody (`""`). */
  onPick: (userId: string) => void;
}) {
  const open = items.filter((i) => !i.state.isTerminal);
  type Row = { key: string; name: string; open: number; late: number; checking: number };
  const rows = new Map<string, Row>();
  for (const c of staff) {
    rows.set(c.userId, { key: c.userId, name: colleagueLabel(c), open: 0, late: 0, checking: 0 });
  }
  const nobody: Row = { key: "", name: "", open: 0, late: 0, checking: 0 };
  for (const i of open) {
    const id = i.assignee?.userId ?? null;
    let row = id === null ? nobody : rows.get(id);
    if (row === undefined && id !== null) {
      // On the desk of somebody no longer offered as a colleague (left the
      // firm): still counted, under the name the task carries.
      row = { key: id, name: i.assignee?.displayName ?? i.assignee?.email ?? "Somebody", open: 0, late: 0, checking: 0 };
      rows.set(id, row);
    }
    if (row === undefined) continue;
    row.open += 1;
    if (i.dueOn !== null && i.dueOn < today) row.late += 1;
    if (i.hasOpenReview) row.checking += 1;
  }
  const people = [...rows.values()].sort((a, b) => b.open - a.open || b.late - a.late || a.name.localeCompare(b.name));

  if (open.length === 0) {
    return (
      <Card>
        <Empty title="No open tasks" icon="board">
          Nobody has anything open right now.
        </Empty>
      </Card>
    );
  }

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Person</Th>
            <Th align="right">Open tasks</Th>
            <Th align="right">Late</Th>
            <Th align="right">Waiting for a check</Th>
          </tr>
        </thead>
        <tbody>
          {[...people, ...(nobody.open > 0 ? [nobody] : [])].map((r) => (
            <tr key={r.key === "" ? "nobody" : r.key}>
              <Td>
                {r.open === 0 ? (
                  <span>{r.name}</span>
                ) : (
                  /* A real link (it can open in a new tab), and in this tab it
                     switches the board in place rather than reloading it. */
                  <Link
                    href={{ pathname: "/work-items", query: { tab: "all", person: r.key } }}
                    onClick={(e) => {
                      e.preventDefault();
                      onPick(r.key);
                    }}
                  >
                    {r.key === "" ? "On nobody’s desk" : r.name}
                  </Link>
                )}
              </Td>
              <Td align="right">{r.open}</Td>
              <Td align="right">
                <span className={r.late > 0 ? "tone-danger" : undefined}>{r.late}</span>
              </Td>
              <Td align="right">{r.checking}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
