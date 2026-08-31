"use client";

import Link from "next/link";
import type { Escalation } from "@/lib/api/client";
import { Card, Pill, Sub, Table, TableWrap, Td, Th, Tooltip } from "@/components/ui";
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
}: {
  rows: Escalation[];
  ladderPublished: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        {ladderPublished ? (
          <Empty title="Nothing has been escalated" icon="check">
            Every open task is inside the firm&rsquo;s own thresholds, and no filing has passed its
            internal target.
          </Empty>
        ) : (
          <Empty title="This firm has published no escalation ladder" icon="alert">
            Nothing is escalated because nothing is watching. The rungs — how many days, and who
            hears about it — are the firm&rsquo;s own, and nothing is set by default on purpose.
            Write them on <Link href="/admin/escalation-ladder">Escalation ladder</Link>.
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
        <Sub>
          <strong>{unreached}</strong> {unreached === 1 ? "notice" : "notices"} reached nobody —
          those rows say why, and they are the ones to look at first.
        </Sub>
      )}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>What</Th>
              <Th>For</Th>
              <Th>Rung</Th>
              <Th>Told</Th>
              <Th>Holding it</Th>
              <Th align="right">Days past</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <EscalationRow key={row.id} row={row} />
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

function EscalationRow({ row }: { row: Escalation }) {
  return (
    <tr>
      <Td>
        {/* A notice is about a task OR a filing, never both — the schema's own
            CHECK. The task has a page of its own; a filing's page is the
            calendar it lives on. Written as two links rather than one computed
            href because typed routes check the literal, which is the point of
            them. */}
        {row.workItemId !== null ? (
          <Link href={`/work-items/${row.workItemId}`}>{row.subjectTitle}</Link>
        ) : (
          <Link href="/calendar">{row.subjectTitle}</Link>
        )}
        <br />
        <Sub>{watchLabel(row.watch)}</Sub>
      </Td>
      <Td>
        {row.clientName ?? <span className="faint">—</span>}
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
            now. Never a code: the ladder is config the firm renames. */}
        <Pill tone="quiet">{row.rungLabel}</Pill>{" "}
        <Tooltip
          text={`The rung fired at ${String(row.afterDays)} day${row.afterDays === 1 ? "" : "s"} past, and that threshold is copied onto the row — editing the ladder later cannot make this notice look early.`}
        >
          <span className="faint mono">+{row.afterDays}d</span>
        </Tooltip>
      </Td>
      <Td>
        {row.raisedTo !== null ? (
          // The name, or the EMAIL when a firm has not set one — which is the
          // ordinary case at a real firm and is why the API sends both. A row
          // saying somebody was told without saying who is worse than one
          // saying nobody was. The audit trail states the same rule.
          (row.raisedTo.displayName ?? row.raisedTo.email)
        ) : row.minGradeRank !== null ? (
          // A RANK and not a person, deliberately: an escalation routed to one
          // partner dies while that partner is on leave.
          <Tooltip text="Addressed to a grade rather than one desk, so everybody senior enough sees it.">
            <Pill tone="accent">rank {row.minGradeRank}+</Pill>
          </Tooltip>
        ) : (
          <Tooltip text={row.note ?? "Nobody could be named."}>
            <Pill tone="danger">nobody</Pill>
          </Tooltip>
        )}
      </Td>
      <Td>
        {row.holder !== null ? (
          (row.holder.displayName ?? row.holder.email)
        ) : (
          <span className="faint">nobody</span>
        )}
      </Td>
      <Td align="right">
        <span className="mono">{row.daysPast}</span>
      </Td>
    </tr>
  );
}

/** What the rung was watching, in words. The three are genuinely different
 *  problems and a reader has to be able to tell them apart at a glance. */
function watchLabel(watch: Escalation["watch"]): string {
  switch (watch) {
    case "work_item_due":
      return "Past the turnaround the client was promised";
    case "work_item_unassigned":
      return "Nobody has picked this up";
    case "obligation_target":
      return "Past our own target — the statutory date is still ahead";
  }
}
