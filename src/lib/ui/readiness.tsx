"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Readiness, ReadinessLine } from "@/lib/api/client";
import {
  Card,
  CardHead,
  Pill,
  RowChevron,
  RowLink,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  ThChevron,
  Tr,
} from "@/components/ui";

/**
 * Setup readiness (V2.6): the card on Your firm, and the words for it.
 *
 * The API says WHICH line and WHAT is missing as codes; this file is the one
 * place they become words and links, so Your firm and My day can never phrase
 * one gap two ways. Every line links to the screen that fixes it, and a gap
 * about one client or one service links to that client or service.
 *
 * The ladder line asks only that a ladder is PUBLISHED. Which days go on it is
 * the firm's decision (D3, still open), so nothing here suggests any.
 */

type Key = ReadinessLine["key"];

const LABELS: Readonly<Record<Key, string>> = {
  deadlines: "Go-live day and financial year",
  reporting_lines: "Who reports to whom",
  request_routing: "Who picks up client requests",
  processes: "A process for every service",
  compliance_rules: "Filings confirmed and linked to services",
  ladders: "Escalation and reminder ladders",
  account_team: "Key Manager and SPOCs for every client",
  portal_contacts: "A portal login for every client",
};

const FIX: Readonly<Record<Key, Route>> = {
  deadlines: "/admin/firm#deadlines" as Route,
  reporting_lines: "/admin/people",
  request_routing: "/admin/structure",
  processes: "/admin/workflows",
  compliance_rules: "/admin/obligation-rules",
  ladders: "/admin/escalation-ladder",
  account_team: "/clients",
  portal_contacts: "/clients",
};

/** A firm-level gap, in words. */
const FIRM_GAP: Readonly<Record<string, string>> = {
  go_live_floor: "Go-live day not set",
  fiscal_year_start: "Financial year start not set",
  routing: "Not set: requests land on nobody's desk",
  confirmed_linked_rule: "No filing is confirmed and linked to a service yet",
  escalation: "Escalation ladder not published",
  chaser: "Reminders for papers you asked for not published",
  nudge: "Heads-up before a filing not published",
};

/** What one subject is missing, in words: "No Key Manager, no SPOC for FRC". */
function missingWords(missing: readonly string[]): string {
  const words = missing.map((m) => {
    if (m === "key_manager") return "no Key Manager";
    if (m.startsWith("spoc:")) return `no SPOC for ${m.slice("spoc:".length)}`;
    if (m === "manager") return "no manager";
    if (m === "process") return "no process";
    if (m === "published_process") return "process not published";
    if (m === "confirmed") return "linked, not confirmed";
    if (m === "portal_login") return "no portal login";
    return m;
  });
  const text = words.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Where one gap is fixed, when it is about one thing. */
function gapHref(key: Key, gap: ReadinessLine["gaps"][number]): Route | null {
  if ((key === "account_team" || key === "portal_contacts") && gap.id !== null) {
    return `/clients/${gap.id}` as Route;
  }
  if (key === "processes" && gap.ref !== null) return `/catalogue/${gap.ref}` as Route;
  if (key === "ladders" && (gap.missing[0] === "chaser" || gap.missing[0] === "nudge")) {
    return "/admin/client-reminders";
  }
  return null;
}

/** How many of the lines are done, for "Setup: 5 of 8". */
export function readinessCount(r: Readiness): { done: number; total: number } {
  return { done: r.lines.filter((l) => l.done).length, total: r.lines.length };
}

/** The most gaps a line lists before "and N more". */
const SHOWN = 3;

export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  const { done, total } = readinessCount(readiness);
  return (
    <Card id="setup">
      <CardHead
        level={2}
        title="Setup"
        aside={<Pill tone={done === total ? "ok" : "warn"}>{`${String(done)} of ${String(total)} done`}</Pill>}
      />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>What</Th>
              <Th>State</Th>
              <ThChevron />
            </tr>
          </thead>
          <tbody>
            {readiness.lines.map((line) => (
              <Tr key={line.key} linked>
                <Td>
                  <RowLink href={FIX[line.key]}>{LABELS[line.key]}</RowLink>
                  {line.gaps.slice(0, SHOWN).map((gap, i) => {
                    const href = gapHref(line.key, gap);
                    const words =
                      gap.name === ""
                        ? (FIRM_GAP[gap.missing[0] ?? ""] ?? missingWords(gap.missing))
                        : missingWords(gap.missing);
                    return (
                      <Sub key={`${gap.id ?? gap.ref ?? ""}-${String(i)}`}>
                        {gap.name === "" ? (
                          href === null ? words : <Link href={href}>{words}</Link>
                        ) : href === null ? (
                          <>
                            {gap.name}: {words.charAt(0).toLowerCase() + words.slice(1)}
                          </>
                        ) : (
                          <>
                            <Link href={href}>{gap.name}</Link>: {words.charAt(0).toLowerCase() + words.slice(1)}
                          </>
                        )}
                      </Sub>
                    );
                  })}
                  {line.gaps.length > SHOWN && <Sub>{`and ${String(line.gaps.length - SHOWN)} more`}</Sub>}
                  {!line.done && line.key === "reporting_lines" && line.context.length > 0 && (
                    <Sub>{`Your check rule "${line.context.join('", "')}" reads them.`}</Sub>
                  )}
                </Td>
                <Td className="nowrap">
                  <Pill dot tone={line.done ? "ok" : "warn"}>
                    {line.done ? "Done" : "To do"}
                  </Pill>
                </Td>
                <RowChevron />
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}
