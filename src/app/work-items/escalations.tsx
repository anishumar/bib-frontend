"use client";

import Link from "next/link";
import type { Escalation } from "@/lib/api/client";
import { Card, NotSet, Pill, Sub, Table, TableWrap, Td, Th, Tooltip } from "@/components/ui";
import { Empty } from "@/components/states";

/**
 * What the firm's own escalation ladder has raised (T4.5).
 *
 * ── IT IS A QUEUE, NOT A FILTER, AND THERE IS NOTHING TO CLICK ──────────────
 *
 * Every other tab on this screen is the same work, sliced. This one is a
 * different KIND of row: not a task, but the record that somebody was told
 * about one. There is deliberately no dismiss, no snooze and no acknowledge —
 * a notice ends when the WORK moves, which the API resolves as a join. A button
 * that emptied this list without anything actually happening would turn the one
 * screen whose whole value is being believed into decoration.
 *
 * So the only control on a row is a link to the thing itself. That is the point:
 * the way to clear an escalation is to do the work.
 *
 * ── AN EMPTY QUEUE HAS TWO MEANINGS AND THE SCREEN SAYS WHICH ───────────────
 *
 * Nothing escalated because everything is on time, and nothing escalated
 * because the firm has never published a ladder, look identical — and only one
 * of them means the product is doing anything. `ladderPublished` is why the
 * empty state has two versions, and the second one names the screen that fixes
 * it. `/calendar`'s coverage tab exists for exactly this reason.
 *
 * ── "NOBODY" IS THE MOST IMPORTANT ROW HERE ─────────────────────────────────
 *
 * A rung can fire and reach no one: nobody holds the work, nobody is recorded
 * above them, or no active member holds the rank the rung names. The notice
 * still fires and it is marked, loudly, because that row is the one somebody
 * has to act on — everything else already has a name against it.
 */
export function EscalationQueue({
  rows,
  ladderPublished,
  gradeNames,
}: {
  rows: Escalation[];
  ladderPublished: boolean;
  /** Rank -> the firm's name for that rung, from the colleagues list (the
   *  grades route is `tenant:admin`). A rank nobody holds today has no name
   *  here and reads as a level number instead. */
  gradeNames: ReadonlyMap<number, string>;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        {ladderPublished ? (
          <Empty title="Nothing has been escalated" icon="check">
            Every open task and filing is within your firm&rsquo;s limits.
          </Empty>
        ) : (
          <Empty title="No escalation ladder yet" icon="alert">
            Nothing is escalated until you set one up on{" "}
            <Link href="/admin/escalation-ladder">Escalation ladder</Link>.
          </Empty>
        )}
      </Card>
    );
  }

  // Told NOBODY: no person and no rank. Read off the two fields the notice
  // actually carries rather than off `raisedTo`, which is also null when an
  // account no longer resolves — a different fact, and not one to report as an
  // unreachable escalation.
  const unreached = rows.filter((r) => r.raisedToUserId === null && r.minGradeRank === null).length;

  return (
    <>
      {unreached > 0 && (
        <p className="text-md">
          <strong className="tone-danger">{unreached}</strong>{" "}
          {unreached === 1 ? "notice" : "notices"} reached nobody. Look at those first.
        </p>
      )}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Task or filing</Th>
              <Th>Client</Th>
              <Th>Rung</Th>
              <Th>Told</Th>
              <Th align="right">Days late</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EscalationRow key={row.id} row={row} gradeNames={gradeNames} />
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

function EscalationRow({
  row,
  gradeNames,
}: {
  row: Escalation;
  gradeNames: ReadonlyMap<number, string>;
}) {
  return (
    <tr>
      <Td>
        {/* A notice is about a task OR a filing, never both — the schema's own
            CHECK. The task has a page of its own; a filing's page is the
            calendar it lives on. Written as two links rather than one computed
            href because typed routes check the literal, which is the point of
            them. */}
        {row.workItemId !== null ? (
          <span className="cell-text" data-size="narrow">
            <Link href={`/work-items/${row.workItemId}`}>{row.subjectTitle}</Link>
          </span>
        ) : (
          <span className="cell-text" data-size="narrow">
            <Link href="/calendar">{row.subjectTitle}</Link>
          </span>
        )}
        <Sub>{watchLabel(row.watch)}</Sub>
      </Td>
      <Td>
        {/* A filing has no client (it is owed by the entity), so it reads
            "Not set" rather than borrowing the entity's name. */}
        {row.clientName ?? <NotSet />}
        {/* The COMPANY, beneath whoever is billed. A group of four files four
            sets of returns (G0.1), and without this the queue read as wrong:
            a row titled "TDS deposit — Lakeview Logistics" over a cell saying
            "Lakeview Foods" looks like a mismatch until you know one is who
            pays and the other is who files. The board shows it the same way. */}
        {row.entityName !== null && row.entityName !== row.clientName && (
          <Sub>{row.entityName}</Sub>
        )}
      </Td>
      <Td>
        {/* The firm's own word for the rung, resolved from the ladder in force
            now, and its threshold AS IT WAS when it fired (snapshotted on the
            row, so a later ladder edit never restates it). */}
        <span className="cell-text" data-size="narrow">
          {row.rungLabel}
        </span>
        <Sub>{`After ${String(row.afterDays)} ${row.afterDays === 1 ? "day" : "days"}`}</Sub>
      </Td>
      <Td>
        {row.raisedTo !== null ? (
          // The name, or the EMAIL when a firm has not set one — which is the
          // ordinary case at a real firm and is why the API sends both.
          (row.raisedTo.displayName ?? row.raisedTo.email)
        ) : row.minGradeRank !== null ? (
          // A RANK and not a person, deliberately: an escalation routed to one
          // partner dies while that partner is on leave.
          <Tooltip text="Everyone at this level or above sees it.">
            <span>
              {gradeNames.get(row.minGradeRank) ?? `Level ${String(row.minGradeRank)}`} or above
            </span>
          </Tooltip>
        ) : (
          <Tooltip text={row.note ?? "Nobody could be named."}>
            <Pill dot tone="danger">
              Nobody
            </Pill>
          </Tooltip>
        )}
        {/* WHOSE DESK the work is on, said only when it is not the person who
            was told (a rung that tells the assignee would say one name twice).
            It was its own column, and the table hid 160px at 1280. */}
        {row.holder === null ? (
          <Sub>Desk: nobody</Sub>
        ) : row.holder.userId !== row.raisedToUserId ? (
          <Sub>{`Desk: ${row.holder.displayName ?? row.holder.email}`}</Sub>
        ) : null}
      </Td>
      <Td align="right">
        {row.daysPast}
      </Td>
    </tr>
  );
}

/** What the rung was watching, in words. The three are genuinely different
 *  problems and a reader has to be able to tell them apart at a glance. */
function watchLabel(watch: Escalation["watch"]): string {
  switch (watch) {
    case "work_item_due":
      return "Past its due date";
    case "work_item_unassigned":
      return "Nobody has picked it up";
    case "obligation_target":
      return "Past our target date";
  }
}
