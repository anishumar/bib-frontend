"use client";

import type { ProposalRecord } from "@/lib/api/client";
import { Card, CardTitle, Meta, MetaItem } from "@/components/ui";
import { longInstantTime } from "@/lib/day";

/**
 * THE CLIENT'S OWN ANSWER (0085) — who, the words they ticked, when, through
 * which email, from where, and the fingerprint of the PDF they were answering.
 *
 * Only for an answer given on the link. An answer a colleague recorded has no
 * evidence of this kind, and the History names that colleague.
 */
export function ClientAnswer({ answer }: { answer: NonNullable<ProposalRecord["clientDecision"]> }) {
  const accepted = answer.decision === "accepted";
  return (
    <Card>
      <CardTitle level={2}>
        {accepted ? "Accepted by the client" : "Declined by the client"}
      </CardTitle>
      <p className="muted text-md">
        Given on the proposal&apos;s own page. This is the record of who answered, and what they
        were shown.
      </p>
      <Meta>
        <MetaItem label="Name they typed">{answer.signerName}</MetaItem>
        <MetaItem label="When">{longInstantTime(answer.decidedAt)}</MetaItem>
        <MetaItem label="Through">
          {answer.emailedTo === null ? (
            <span className="text-sm text-muted">a link shared outside bib</span>
          ) : (
            <>the email to {answer.emailedTo}</>
          )}
        </MetaItem>
      </Meta>
      {answer.statement !== null && (
        <>
          <h3 className="eyebrow mt-4">Statement they ticked</h3>
          <p>&ldquo;{answer.statement}&rdquo;</p>
        </>
      )}
      <h3 className="eyebrow mt-4">Evidence</h3>
      <ul className="text-md">
        <li>
          PDF fingerprint (SHA-256):{" "}
          {answer.pdf === null ? (
            <span className="muted">no PDF could be filed</span>
          ) : (
            <span className="mono" style={{ wordBreak: "break-all" }}>
              {answer.pdf.contentHash}
            </span>
          )}
        </li>
        <li>
          Address: <span className="mono">{answer.ipAddress ?? "not known"}</span>
        </li>
        <li>
          Browser: <span className="muted">{answer.userAgent ?? "not known"}</span>
        </li>
      </ul>
    </Card>
  );
}
