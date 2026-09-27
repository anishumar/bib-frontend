"use client";

/**
 * SENDING THE PROPOSAL (T6.18, D13) — by email, on WhatsApp, or as a PDF.
 *
 * Three ways out, all of them the API's own:
 *
 * - **Email.** `POST /proposals/{id}/send` with `{ email: { to, note } }`: bib
 *   emails the PDF of record with Accept and Decline buttons (0085). The box
 *   holds the person it is prepared for, when the firm has their email, before
 *   anybody presses.
 * - **WhatsApp.** The same send with no email gives back the share link, and
 *   the link opens `wa.me` with a short message and the link in it. The link is
 *   readable ONCE, in that answer (only its digest is stored), so WhatsApp is
 *   offered right there, and again after "Send again" issues a new one. With no
 *   phone on record it opens WhatsApp without a number and the person picks
 *   the chat.
 * - **PDF.** A draft renders one now; a sent proposal downloads the PDF of
 *   record, the one the client was sent, never a fresh render (which would
 *   read today's letterhead).
 *
 * After sending it records the client's answer when it arrived some other way
 * (a call, a meeting): Client accepted / Client declined, with the reason for
 * a decline, as the proposal page always has.
 *
 * Like the document, it takes only the id and reads the shared record, so the
 * document turns read-only the moment this sends.
 */

import { useEffect, useState } from "react";
import { api, apiError, downloadDocument } from "@/lib/api/client";
import type { ProposalEmailOutcome, ProposalRecord } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldStack,
  Icon,
  Input,
  Notice,
  Skeleton,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { useSession } from "@/components/layout";
import { browserDay, longDay, longInstant, longInstantTime } from "@/lib/day";
import { reloadProposal, useProposal } from "./store";
import { whatsAppMessage, whatsAppUrl } from "./words";

/** What the last send or reissue handed back: the link (readable only now)
 *  and what happened to the email, if one was asked for. */
interface Issued {
  readonly link: string;
  readonly email: ProposalEmailOutcome;
}

export function ProposalSendPanel({
  proposalId,
  onChanged,
}: {
  proposalId: string;
  /** Told after anything here changes the proposal. */
  onChanged?: () => void;
}) {
  const { record, loaded } = useProposal(proposalId);
  const session = useSession();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reach = useReach(record?.addressee?.id ?? null, record?.party.id ?? null);
  const phone = reach.phone;

  if (!loaded && record === null) {
    return (
      <Card>
        <Skeleton width="30%" height="1.2em" />
      </Card>
    );
  }
  if (record === null) return null;
  const { proposal } = record;
  // A draft deleted as a mistake is never sent and never answered.
  if (proposal.deletedAt !== null) return null;

  const may = (permission: string): boolean => session?.permissions.includes(permission) ?? false;
  const canWrite = may("party:write");
  const isDraft = proposal.status === "draft";
  // Whether any line gives a discount at all: a check for zero on the decimal
  // string, not arithmetic. Whether it is past the firm's limit is the API's
  // to say, and it says so when the send is refused.
  const discounted = record.lines.some(
    (l) => l.discountPercent !== null && !/^0+(\.0+)?$/.test(l.discountPercent),
  );

  async function run(key: string, call: () => Promise<string | null>): Promise<boolean> {
    setBusy(key);
    setError(null);
    const failure = await call();
    setBusy(null);
    if (failure !== null) {
      setError(failure);
      return false;
    }
    return true;
  }

  async function changed(): Promise<void> {
    await reloadProposal(proposalId);
    onChanged?.();
  }

  /** Send, or on a proposal already out, issue a new link (the old one dies).
   *  `to` null means no email: the link comes back for the firm to share. */
  function send(email: { to: string; note: string } | null, key: string): Promise<boolean> {
    return run(key, async () => {
      const body =
        email === null
          ? {}
          : { email: { to: email.to, ...(email.note === "" ? {} : { note: email.note }) } };
      const result = isDraft
        ? await api.POST("/api/v1/proposals/{proposalId}/send", { params: { path: { proposalId } }, body })
        : await api.POST("/api/v1/proposals/{proposalId}/reissue", { params: { path: { proposalId } }, body });
      if (result.error) return apiError(result.error).message;
      // The link comes back ONCE. There is nothing to re-fetch later, so it is
      // held here for as long as this screen is open.
      setIssued({ link: `${window.location.origin}/p/${result.data.shareToken}`, email: result.data.email });
      await changed();
      return null;
    });
  }

  function downloadPdf(): void {
    void run("pdf", async () => {
      const pinned = record?.sentPdf ?? null;
      if (pinned !== null) {
        return downloadDocument(pinned.documentId, pinned.filename, pinned.versionId);
      }
      const rendered = await api.POST("/api/v1/documents/render", {
        body: { kind: "proposal", subjectRef: proposalId },
      });
      if (rendered.error) return apiError(rendered.error).message;
      const version = rendered.data.latestVersion;
      onChanged?.();
      return downloadDocument(rendered.data.id, version.filename, version.id);
    });
  }

  function decide(decision: "accepted" | "rejected", declinedReason?: string): Promise<boolean> {
    return run(decision, async () => {
      const result = await api.POST("/api/v1/proposals/{proposalId}/decision", {
        params: { path: { proposalId } },
        body: { decision, ...(declinedReason === undefined || declinedReason === "" ? {} : { declinedReason }) },
      });
      if (result.error) return apiError(result.error).message;
      await changed();
      return null;
    });
  }

  const whatsApp = (link: string): string =>
    whatsAppUrl(
      phone,
      whatsAppMessage({
        addresseeName: record.addressee?.displayName ?? null,
        proposalRef: proposal.ref,
        title: proposal.title,
        firmName: record.issuingEntity.displayName,
        link,
      }),
    );

  return (
    <Card id={`send-${proposalId}`}>
      <CardTitle level={2}>{isDraft ? "Send it" : "Where it stands"}</CardTitle>
      <ErrorNotice error={error} />

      {!isDraft && <Standing record={record} />}

      {/* Only while the client can still answer: once they have, a card
          urging the firm to share the link would be telling it to do
          something that no longer means anything. */}
      {issued !== null && proposal.status === "sent" && (
        <IssuedLink
          issued={issued}
          whatsAppHref={whatsApp(issued.link)}
          hasPhone={phone !== null}
        />
      )}

      {isDraft && canWrite && (
        <div className="stack">
          {may("proposal:approve") && proposal.discountApprovedAt === null && discounted && (
            <p className="muted text-md">
              This proposal gives a discount. One past the firm&apos;s limit needs signing off
              before it can go out.{" "}
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "approve"}
                disabled={busy !== null}
                onClick={() => {
                  void run("approve", async () => {
                    const result = await api.POST("/api/v1/proposals/{proposalId}/discount-approval", {
                      params: { path: { proposalId } },
                    });
                    if (result.error) return apiError(result.error).message;
                    await changed();
                    return null;
                  });
                }}
              >
                Approve the discount
              </Button>
            </p>
          )}
          <EmailForm
            key={reach.email ?? "no-email"}
            defaultTo={record.addressee?.email ?? reach.email ?? ""}
            replyTo={record.preparedBy?.email ?? null}
            busy={busy}
            submitLabel="Send by email"
            onSend={(email) => send(email, "email")}
          />
          <div className="cluster">
            <Button
              variant="secondary"
              loading={busy === "whatsapp"}
              disabled={busy !== null}
              onClick={() => {
                void send(null, "whatsapp");
              }}
            >
              Send on WhatsApp
            </Button>
            <Button
              variant="secondary"
              loading={busy === "link"}
              disabled={busy !== null}
              onClick={() => {
                void send(null, "link");
              }}
            >
              Just give me the link
            </Button>
            <Button
              variant="secondary"
              icon={<Icon name="download" size={16} />}
              loading={busy === "pdf"}
              disabled={busy !== null}
              onClick={downloadPdf}
            >
              Download PDF
            </Button>
          </div>
          <p className="field-hint">
            WhatsApp and the link both send it: the proposal is marked sent, and you get a link
            the client opens to read it and accept or decline.
            {phone === null
              ? " No phone number is on record for the client, so WhatsApp opens and you pick the chat."
              : reach.phoneOf === "person"
                ? ` WhatsApp opens a chat with ${phone}.`
                : ` The person it is prepared for has no phone on record, so WhatsApp opens a chat with the company's number, ${phone}.`}
          </p>
        </div>
      )}

      {!isDraft && (
        <div className="cluster mt-4">
          <Button
            variant="secondary"
            size="sm"
            icon={<Icon name="download" size={16} />}
            loading={busy === "pdf"}
            disabled={busy !== null}
            onClick={downloadPdf}
          >
            {record.sentPdf !== null ? "Download the PDF the client was sent" : "Download PDF"}
          </Button>
        </div>
      )}

      {proposal.status === "sent" && canWrite && (
        <>
          <Decision busy={busy} onDecide={decide} />
          <SendAgain
            defaultTo={record.emails[0]?.to ?? record.addressee?.email ?? reach.email ?? ""}
            replyTo={record.preparedBy?.email ?? null}
            busy={busy}
            hasLink={issued !== null}
            onSend={(email, key) => send(email, key)}
          />
        </>
      )}
    </Card>
  );
}

/** Where the proposal can reach the client: an email for the send, a phone
 *  for WhatsApp, and whose each is. */
interface Reach {
  readonly email: string | null;
  readonly phone: string | null;
  /** "person": the addressee's own; "company": the client company's. */
  readonly phoneOf: "person" | "company" | null;
}

/**
 * The addressee's own email and phone (their primary identifiers in force
 * today), and where they have none, the CLIENT COMPANY's. The company fallback
 * is not a guess: a prospect typed into the builder keeps its email and phone
 * on the company, because the same address on the contact too would make every
 * later capture ambiguous (lead dedupe), so for them the company's is the only
 * one on record.
 */
function useReach(addresseeId: string | null, clientId: string | null): Reach {
  const [reach, setReach] = useState<{ key: string; value: Reach } | null>(null);
  const key = `${addresseeId ?? ""}|${clientId ?? ""}`;
  useEffect(() => {
    if (clientId === null) return;
    let live = true;
    const read = (partyId: string | null) =>
      partyId === null
        ? Promise.resolve(null)
        : api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId } } }).then((r) => r.data ?? null);
    void Promise.all([read(addresseeId), read(clientId)]).then(([person, company]) => {
      if (!live) return;
      const today = browserDay();
      const pick = (party: typeof person, type: "email" | "phone"): string | null => {
        const inForce = (party?.identifiers ?? []).filter(
          (i) => i.type === type && i.validFrom <= today && (i.validTo === null || i.validTo > today),
        );
        return (inForce.find((i) => i.isPrimary) ?? inForce[0])?.value ?? null;
      };
      const personPhone = pick(person, "phone");
      const companyPhone = pick(company, "phone");
      setReach({
        key: `${addresseeId ?? ""}|${clientId}`,
        value: {
          email: pick(person, "email") ?? pick(company, "email"),
          phone: personPhone ?? companyPhone,
          phoneOf: personPhone !== null ? "person" : companyPhone !== null ? "company" : null,
        },
      });
    });
    return () => {
      live = false;
    };
  }, [addresseeId, clientId]);
  return reach?.key === key ? reach.value : { email: null, phone: null, phoneOf: null };
}

/** What has happened since it went out: when, how often it was opened, every
 *  email, and for a decided proposal, the answer. */
function Standing({ record }: { record: ProposalRecord }) {
  const { proposal } = record;
  return (
    <div className="stack tight mb-4">
      <p className="text-md">
        {proposal.status === "sent" && "Sent, waiting for the client's answer."}
        {proposal.status === "accepted" && "The client accepted this proposal."}
        {proposal.status === "rejected" && "The client declined this proposal."}
        {proposal.status === "expired" && "This proposal expired before the client answered."}
        {proposal.sentAt !== null && ` Sent ${longInstant(proposal.sentAt)}.`}
        {proposal.validUntil !== null && ` Valid until ${longDay(proposal.validUntil)}.`}
      </p>
      {proposal.firstViewedAt !== null && (
        <p className="muted text-md">
          First opened {longInstant(proposal.firstViewedAt)} · {proposal.viewCount}{" "}
          {proposal.viewCount === 1 ? "view" : "views"}.
        </p>
      )}
      {proposal.status === "rejected" && (
        <p className="text-md">
          <span className="label">Why they said no: </span>
          {proposal.declinedReason ?? <span className="muted">Not recorded.</span>}
        </p>
      )}
      {record.emails.length > 0 && (
        <div>
          <h3 className="eyebrow">Emailed</h3>
          <ul className="mt-1">
            {record.emails.map((e) => (
              <li key={e.id} className="text-md">
                To <strong>{e.to}</strong> · {longInstantTime(e.sentAt)}
                {e.sentBy !== null && ` · by ${e.sentBy.displayName ?? e.sentBy.email}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The link just issued, what happened to the email, and the two ways to
 *  pass the link on. */
function IssuedLink({
  issued,
  whatsAppHref,
  hasPhone,
}: {
  issued: Issued;
  whatsAppHref: string;
  hasPhone: boolean;
}) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const email = issued.email;
  return (
    <div className="stack tight mb-4">
      {email?.status === "sent" && (
        <Notice tone="ok">
          Emailed to {email.to}, with the PDF and the Accept and Decline buttons. The link below is
          the one in the email.
        </Notice>
      )}
      {email?.status === "failed" && (
        <Notice tone="danger">
          The proposal is sent, but the email to {email.to} did not go: {email.reason}. Share the
          link below on WhatsApp or copy it, or use Send again once the problem is fixed.
        </Notice>
      )}
      {email === null && (
        <Notice tone="ok">
          Sent. Share this link with the client: it is shown only once, and Send again makes a new
          one (the old one then stops working).
        </Notice>
      )}
      <p className="mono text-md" style={{ wordBreak: "break-all" }} id="proposal-share-link">
        {issued.link}
      </p>
      <div className="cluster">
        <a
          className="btn"
          data-variant="primary"
          data-size="md"
          href={whatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open WhatsApp
        </a>
        <Button
          variant="secondary"
          aria-describedby="proposal-share-link"
          onClick={() => {
            void navigator.clipboard
              .writeText(issued.link)
              .then(() => {
                setCopied("done");
              })
              .catch(() => {
                setCopied("failed");
              });
          }}
        >
          {copied === "done" ? "Copied" : "Copy the link"}
        </Button>
        <span role="status" className="muted text-sm">
          {copied === "done"
            ? "On the clipboard."
            : copied === "failed"
              ? "Copying failed. Select the link above and copy it by hand."
              : hasPhone
                ? ""
                : "No phone on record: WhatsApp will ask which chat."}
        </span>
      </div>
    </div>
  );
}

function EmailForm({
  defaultTo,
  replyTo,
  busy,
  submitLabel,
  onSend,
}: {
  defaultTo: string;
  replyTo: string | null;
  busy: string | null;
  submitLabel: string;
  onSend: (email: { to: string; note: string }) => Promise<boolean>;
}) {
  return (
    <form
      action={(form) => {
        void onSend({
          to: String(form.get("to") ?? "").trim(),
          note: String(form.get("note") ?? "").trim(),
        });
      }}
    >
      <FieldStack>
        <Field
          label="Email it to"
          hint={
            "bib emails the PDF with Accept and Decline buttons, and the client answers on the " +
            "proposal's page with their name." +
            (replyTo === null ? "" : ` Replies go to ${replyTo}.`)
          }
        >
          <Input name="to" type="email" defaultValue={defaultTo} required maxLength={320} />
        </Field>
        <Field label="Your note" optional hint="Printed above the standard letter.">
          <Textarea name="note" rows={2} maxLength={2000} />
        </Field>
        <div className="cluster">
          <Button type="submit" loading={busy === "email"} disabled={busy !== null}>
            {submitLabel}
          </Button>
        </div>
      </FieldStack>
    </form>
  );
}

/** Client accepted / declined, for an answer given by phone or in a meeting.
 *  A decline asks why, because that is the half worth anything later. */
function Decision({
  busy,
  onDecide,
}: {
  busy: string | null;
  onDecide: (decision: "accepted" | "rejected", declinedReason?: string) => Promise<boolean>;
}) {
  const [declining, setDeclining] = useState(false);
  const { panel, trigger } = useSwapFocus(declining);
  return (
    <div className="mt-4 stack tight">
      <h3 className="eyebrow">The client&apos;s answer</h3>
      <p className="muted text-sm">
        The client can accept or decline on the proposal&apos;s own page. If they answered another
        way, a call or a meeting, record it here.
      </p>
      {declining ? (
        <div ref={panel} tabIndex={-1}>
          <form
            action={(form) => {
              void onDecide("rejected", String(form.get("declinedReason") ?? "").trim()).then((done) => {
                if (done) setDeclining(false);
              });
            }}
          >
            <FieldStack>
              <Field label="Why did they say no?" hint="In your own words. It cannot be added later.">
                <Textarea
                  name="declinedReason"
                  rows={2}
                  autoFocus
                  placeholder="Went with their existing auditor on price."
                />
              </Field>
              <div className="cluster">
                <Button variant="destructive-quiet" size="sm" type="submit" loading={busy === "rejected"} disabled={busy !== null}>
                  Record the decline
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setDeclining(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </FieldStack>
          </form>
        </div>
      ) : (
        <div className="cluster">
          <Button
            loading={busy === "accepted"}
            disabled={busy !== null}
            onClick={() => {
              void onDecide("accepted");
            }}
          >
            Client accepted
          </Button>
          <Button
            ref={trigger}
            variant="destructive-quiet"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              setDeclining(true);
            }}
          >
            Client declined
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A new link for a proposal already out: emailed, for WhatsApp, or bare. The
 * old link stops working, and the form says so. Behind a button: it is for the
 * day a client lost the email, not something every sent proposal carries open.
 */
function SendAgain({
  defaultTo,
  replyTo,
  busy,
  hasLink,
  onSend,
}: {
  defaultTo: string;
  replyTo: string | null;
  busy: string | null;
  /** A link from this visit is already on screen. */
  hasLink: boolean;
  onSend: (email: { to: string; note: string } | null, key: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const { panel, trigger } = useSwapFocus(open);
  return (
    <div className="mt-4 stack tight">
      <h3 className="eyebrow">Send again</h3>
      {!hasLink && (
        <p className="muted text-sm">
          The link was shown once, when it was sent. To share it on WhatsApp or anywhere else now,
          issue a new link here.
        </p>
      )}
      {open ? (
        <div ref={panel} tabIndex={-1} className="stack tight">
          <p className="muted text-md">
            This issues a new link. The link in any earlier email or message stops working.
          </p>
          <EmailForm
            defaultTo={defaultTo}
            replyTo={replyTo}
            busy={busy}
            submitLabel="Email a new link"
            onSend={(email) =>
              onSend(email, "email").then((done) => {
                if (done) setOpen(false);
                return done;
              })
            }
          />
          <div className="cluster">
            <Button
              variant="secondary"
              loading={busy === "whatsapp"}
              disabled={busy !== null}
              onClick={() => {
                void onSend(null, "whatsapp").then((done) => {
                  if (done) setOpen(false);
                });
              }}
            >
              New link for WhatsApp
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="cluster">
          <Button
            ref={trigger}
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              setOpen(true);
            }}
          >
            Send again
          </Button>
        </div>
      )}
    </div>
  );
}
