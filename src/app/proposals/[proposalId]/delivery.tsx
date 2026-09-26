"use client";

import { useState } from "react";
import type { ProposalRecord } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  Field,
  FieldStack,
  Input,
  Meta,
  MetaItem,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { longInstantTime } from "@/lib/day";

/** What a send asks for: an email, or — null — only the link. */
export type EmailAsk = { to: string; note: string } | null;

/**
 * SENDING BY EMAIL (0085) — the form under "Send it", and under "Send again".
 *
 * bib emails the PDF of record with Accept and Decline buttons, and the client
 * answers on the proposal's page with their name. "Without email" is the old
 * behaviour, kept: the link comes back once and the firm sends it however it
 * likes — a WhatsApp message is a real channel in this market.
 *
 * The address is judged by the API, which names what is wrong with it; the
 * browser's own `type="email"` check only catches the obvious before a round
 * trip. The address is IN the box before anybody presses — the person it was
 * prepared for, when the firm holds their email — never a default nobody saw.
 */
export function SendByEmail({
  mode,
  defaultTo,
  replyTo,
  busy,
  onSend,
}: {
  /** First send of a draft, or a new link for a proposal already out. */
  mode: "send" | "again";
  defaultTo: string;
  /** The colleague a reply reaches — said in the hint, so it is not a surprise. */
  replyTo: string | null;
  busy: boolean;
  onSend: (ask: EmailAsk) => void;
}) {
  return (
    <form
      action={(form) => {
        onSend({
          to: String(form.get("to") ?? "").trim(),
          note: String(form.get("note") ?? "").trim(),
        });
      }}
    >
      <FieldStack>
        <Field
          label="Email it to"
          hint={
            `bib emails the PDF with Accept and Decline buttons; the client answers on the ` +
            `proposal's page with their name.` +
            (replyTo === null ? "" : ` Replies go to ${replyTo}.`)
          }
        >
          <Input name="to" type="email" defaultValue={defaultTo} required maxLength={320} />
        </Field>
        <Field label="Your note" optional hint="Printed above the standard letter.">
          <Textarea name="note" rows={3} maxLength={2000} />
        </Field>
        {mode === "again" && (
          <p className="muted text-md">
            This issues a new link. The link in any earlier email stops working.
          </p>
        )}
        <div className="cluster">
          <Button type="submit" loading={busy} disabled={busy}>
            {mode === "send" ? "Send by email" : "Email a new link"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              onSend(null);
            }}
          >
            {mode === "send" ? "Send without email" : "New link only"}
          </Button>
        </div>
      </FieldStack>
    </form>
  );
}

/**
 * "Send again", behind a button — the form is for the day a client lost the
 * email or a second person needs it, not something every sent proposal should
 * carry open.
 */
export function SendAgain({
  defaultTo,
  replyTo,
  busy,
  onSend,
}: {
  defaultTo: string;
  replyTo: string | null;
  busy: boolean;
  onSend: (ask: EmailAsk) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  // The button replaces itself with the form, so focus is handed over and back.
  const { panel, trigger } = useSwapFocus(open);
  if (!open) {
    return (
      <Button
        ref={trigger}
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setOpen(true);
        }}
      >
        Send again
      </Button>
    );
  }
  return (
    <div ref={panel} tabIndex={-1} className="mt-4">
      <SendByEmail
        mode="again"
        defaultTo={defaultTo}
        replyTo={replyTo}
        busy={busy}
        onSend={(ask) => {
          void onSend(ask).then((done) => {
            if (done) setOpen(false);
          });
        }}
      />
      <div className="cluster mt-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Every email bib sent it in, newest first. */
export function EmailHistory({ emails }: { emails: ProposalRecord["emails"] }) {
  if (emails.length === 0) return null;
  return (
    <div className="mt-4 mb-4">
      <h3 className="eyebrow">Emailed</h3>
      <ul className="mt-1">
        {emails.map((e) => (
          <li key={e.id} className="text-md">
            To <strong>{e.to}</strong> · {longInstantTime(e.sentAt)}
            {e.sentBy !== null && ` · by ${e.sentBy.displayName ?? e.sentBy.email}`}
            <span className="muted text-sm">
              {" "}
              · PDF <span className="mono" title={e.pdfContentHash}>{e.pdfContentHash.slice(0, 12)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
