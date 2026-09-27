"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { api, apiError, formatCount, formatMoney } from "@/lib/api/client";
import type { ProposalEmailOutcome, ProposalRecord } from "@/lib/api/client";
import { Documents } from "@/lib/ui/documents";
import { SendByEmail } from "@/app/proposals/[proposalId]/delivery";
import type { EmailAsk } from "@/app/proposals/[proposalId]/delivery";
import { Card, CardTitle } from "@/components/tw";
import { Button, ErrorNotice, LinkButton, Notice } from "@/components/ui";
import { StickyFooter } from "./frame";
import { PER } from "./data";
import { FrequencyTotals } from "./totals";

/**
 * STEP 3, for now: what is on the proposal, the PDF, and Send.
 *
 * The in-app document preview (editable in place, D10) is being built beside
 * this and replaces the summary card when the two are joined. Send and the PDF
 * are the proposal page's own, reused, so the flow runs end to end today.
 */
export function PreviewStep({
  record,
  canWrite,
  canApprove,
  onChanged,
}: {
  record: ProposalRecord;
  canWrite: boolean;
  /** `proposal:approve`: whether to OFFER the discount sign-off. The API decides
   *  whether one is needed, and says so when Send is refused for it. */
  canApprove: boolean;
  onChanged: () => Promise<void>;
}) {
  const { proposal, lines } = record;
  const proposalId = proposal.id;
  const isDraft = proposal.status === "draft" && proposal.deletedAt === null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ProposalEmailOutcome>(null);
  const [copied, setCopied] = useState(false);
  /** Where to email it when the person it is prepared for has no address on
   *  file: a prospect typed in step 1 has theirs on the company, where the
   *  pipeline's dedup reads it. */
  const [clientEmail, setClientEmail] = useState<string | null>(null);

  useEffect(() => {
    if (record.addressee?.email !== undefined && record.addressee.email !== null) return;
    void (async () => {
      const profile = await api.GET("/api/v1/parties/{partyId}", {
        params: { path: { partyId: record.party.id } },
      });
      const email = profile.data?.identifiers.find((i) => i.type === "email" && i.validTo === null);
      setClientEmail(email?.value ?? null);
    })();
  }, [record.addressee, record.party.id]);

  const discounted = lines.some((l) => l.discountPercent !== null && !/^0*(\.0*)?$/.test(l.discountPercent));

  async function approve(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/proposals/{proposalId}/discount-approval", {
      params: { path: { proposalId } },
    });
    if (result.error) setError(apiError(result.error).message);
    else await onChanged();
    setBusy(false);
  }

  async function send(ask: EmailAsk): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/proposals/{proposalId}/send", {
      params: { path: { proposalId } },
      body:
        ask === null
          ? {}
          : { email: { to: ask.to, ...(ask.note === "" ? {} : { note: ask.note }) } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    // Shown ONCE: only the link's fingerprint is stored.
    setShareLink(`${window.location.origin}/p/${result.data.shareToken}`);
    setOutcome(result.data.email);
    await onChanged();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <ErrorNotice error={error} />

      <Card>
        <CardTitle level={2}>What the client will be offered</CardTitle>
        <p className="mt-1 text-sm text-muted">
          {record.party.displayName}, issued by {record.issuingEntity.displayName}, in{" "}
          {proposal.currency}.
          {record.addressee !== null && ` Prepared for ${record.addressee.displayName}.`}
        </p>
        <ul className="mt-3">
          {lines.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-soft py-2 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="mono mr-2 text-sm text-muted">{l.service?.ref ?? ""}</span>
                {l.description}
              </span>
              <span className="mono text-md">
                {l.unitAmount === null
                  ? "No fixed fee"
                  : `${formatMoney(l.unitAmount, l.currency)}${
                      l.billingFrequency === null ? "" : ` ${PER[l.billingFrequency]}`
                    }${formatCount(l.quantity) === "1" ? "" : ` × ${formatCount(l.quantity)}`}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {shareLink !== null && (
        <Card>
          <CardTitle level={2}>{outcome?.status === "sent" ? "Emailed" : "The link to send"}</CardTitle>
          {outcome?.status === "sent" && (
            <Notice tone="ok">Emailed to {outcome.to}, with the PDF and the Accept and Decline buttons.</Notice>
          )}
          {outcome?.status === "failed" && (
            <Notice tone="danger">
              The proposal is sent, but the email to {outcome.to} did not go: {outcome.reason}. Copy
              the link below and send it yourself.
            </Notice>
          )}
          <p className="mt-2 text-sm text-muted">
            Copy it now. It is shown only once; Send again on the proposal makes a new one.
          </p>
          <p className="mono mt-2 break-all" id="builder-share-link">
            {shareLink}
          </p>
          <div className="cluster mt-2">
            <Button
              variant="secondary"
              size="sm"
              aria-describedby="builder-share-link"
              onClick={() => {
                void navigator.clipboard.writeText(shareLink).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? "Copied" : "Copy the link"}
            </Button>
          </div>
        </Card>
      )}

      {isDraft && canWrite && (
        <Card>
          <CardTitle level={2}>Send it</CardTitle>
          {discounted && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">
                {proposal.discountApprovedAt === null
                  ? "A line is discounted. Above your firm's limit, a discount needs sign-off before it can be sent."
                  : "The discount is signed off."}
              </p>
              {proposal.discountApprovedAt === null && canApprove && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void approve();
                  }}
                >
                  Approve the discount
                </Button>
              )}
            </div>
          )}
          <div className="mt-3">
            <SendByEmail
              mode="send"
              defaultTo={record.addressee?.email ?? clientEmail ?? ""}
              replyTo={record.preparedBy?.email ?? null}
              busy={busy}
              onSend={(ask) => {
                void send(ask);
              }}
            />
          </div>
        </Card>
      )}

      {!isDraft && shareLink === null && (
        <Notice tone="ok">
          This proposal is {proposal.status}. <Link href={`/proposals/${proposalId}` as Route}>Open it</Link> to
          record the client&apos;s answer or send it again.
        </Notice>
      )}

      <Documents
        key={record.sentPdf?.versionId ?? "no-pdf-of-record"}
        subjectKind="proposal"
        subjectRef={proposalId}
        canWrite={canWrite && proposal.deletedAt === null}
        title="Proposal PDF"
        renderable="proposal"
        emptyHint="No PDF yet. Generate one to read the proposal as the client will."
      />

      <StickyFooter
        summary={<FrequencyTotals record={record} />}
      >
        <LinkButton variant="ghost" href={`/proposals/${proposalId}/build?step=services` as Route}>
          Back
        </LinkButton>
        <LinkButton variant="secondary" href={`/proposals/${proposalId}` as Route}>
          Open the proposal
        </LinkButton>
      </StickyFooter>
    </div>
  );
}
