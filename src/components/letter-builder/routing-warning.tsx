"use client";

import Link from "next/link";
import type { LetterDeptRouting, LetterRouting } from "@/lib/api/client";
import { Notice } from "@/components/tw";

/**
 * THE SEND WARNING (T6.17, decided 2026-09-27: a warning, never a refusal).
 *
 * When the letter is signed, each line's work goes to the client's SPOC for
 * its Dept. A Dept with no SPOC sends it to the client's Key Manager, or to
 * the person who signs for the firm, to HAND OUT, and the person sending should
 * know that while naming a SPOC on the client's page still changes it. The API
 * answers with the same owner rule the signed letter's work is routed by, so
 * the names here are the desks the work will land on today.
 *
 * Nothing is said when every Dept has a SPOC. Send is never disabled by this.
 */
export function RoutingWarning({
  routing,
  client,
}: {
  routing: LetterRouting;
  client: { id: string; displayName: string };
}) {
  const gaps = routing.depts.filter((d) => d.how !== "spoc");
  if (gaps.length === 0) return null;
  return (
    <Notice tone="warn" role="status" eyebrow="Some of this work has no SPOC">
      <div>
        <p>
          {`When this letter is signed, each service's work goes to ${client.displayName}'s SPOC for its Dept. Not all of it has one:`}
        </p>
        <ul className="mt-2 list-disc pl-5">
          {gaps.map((d) => (
            <li key={d.deptCode ?? "none"}>{routingSentence(d)}</li>
          ))}
        </ul>
        <p className="mt-2">
          Name a SPOC on <Link href={`/clients/${client.id}`}>{client.displayName}&apos;s page</Link>{" "}
          (Account team) to send it straight to them. You can still send the letter as it is.
        </p>
      </div>
    </Notice>
  );
}

/** One Dept's line of the warning: which work, why it has no SPOC, whose desk it goes to. */
function routingSentence(d: LetterDeptRouting): string {
  const services = d.lines.map((l) => l.name).join(", ");
  const what =
    d.reason === "no_dept"
      ? `${services}: the service is not filed under a Dept`
      : d.reason === "unknown_dept"
        ? `${services}: the service names Dept ${d.deptCode ?? ""}, which is not one of the firm's Depts`
        : `${d.deptName ?? d.deptCode ?? "This Dept"} (${services}): no SPOC on this client`;
  const who =
    d.how === "key_manager"
      ? `so the work will go to ${d.ownerName ?? "the client's Key Manager"}, the Key Manager, to hand out.`
      : d.how === "partner"
        ? d.ownerName === null
          ? "and no Key Manager, so the work will go to the person who signs for the firm, to hand out."
          : `and no Key Manager, so the work will go to ${d.ownerName}, who signs for the firm, to hand out.`
        : "no Key Manager, and nobody named to sign for the firm, so nobody will get the work until somebody hands it out.";
  return `${what}, ${who}`;
}
