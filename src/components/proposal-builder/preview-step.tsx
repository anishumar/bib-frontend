"use client";

import { useState } from "react";
import type { Route } from "next";
import type { ProposalRecord } from "@/lib/api/client";
import { Button, Compose, Icon, LinkButton } from "@/components/ui";
import { ProposalPdf, ProposalSendPanel } from "@/components/proposal-document";
import { StickyFooter } from "./frame";
import { FrequencyTotals } from "./totals";

/**
 * STEP 3: the proposal as the client will read it, and sending it.
 *
 * The same two components the proposal page mounts: `<ProposalPdf>` draws
 * the PDF itself (2026-09-28) and, on a draft, lets any piece be changed ON the
 * page or from the "Edit" list beside it (a scope text, a fee, an exclusion), and
 * `<ProposalSendPanel>` sends it by email, on WhatsApp or as a bare link, and
 * downloads the PDF. Both read the builder's one record, so a fee changed in
 * the document is in the footer's total and in the PDF the panel sends.
 *
 * SENDING IS A COMPOSE PANEL (2026-10-13), docked bottom right like Gmail's
 * "New Message", opened by the footer's Send. It was a card at the foot of
 * the three pages, so the page had two Sends, and the footer's only scrolled
 * to the other. The footer's Send still does not send: the address, the note
 * and the channel are the panel's. The panel is not modal, so the PDF stays
 * readable while the email is written. Once sent, it shows the link and where
 * the proposal stands; closed, that moves under the pages as before.
 */
export function PreviewStep({ record }: { record: ProposalRecord }) {
  const { proposal } = record;
  const proposalId = proposal.id;
  const isDraft = proposal.status === "draft" && proposal.deletedAt === null;

  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <ProposalPdf proposalId={proposalId} editable />
      {!isDraft && !composing && (
        <div className="w-full max-w-[900px]">
          <ProposalSendPanel proposalId={proposalId} />
        </div>
      )}

      <Compose
        open={composing}
        title={isDraft ? `Send ${proposal.ref}` : `${proposal.ref} sent`}
        onClose={() => {
          setComposing(false);
        }}
      >
        <ProposalSendPanel proposalId={proposalId} bare />
      </Compose>

      <StickyFooter summary={<FrequencyTotals record={record} />}>
        {isDraft && (
          <LinkButton variant="ghost" href={`/proposals/${proposalId}/build?step=services` as Route}>
            Back
          </LinkButton>
        )}
        <LinkButton variant="secondary" href={`/proposals/${proposalId}` as Route}>
          Open the proposal page
        </LinkButton>
        {isDraft && (
          <Button
            type="button"
            icon={<Icon name="letters" size={16} />}
            aria-expanded={composing}
            onClick={() => {
              setComposing(true);
            }}
          >
            Send
          </Button>
        )}
      </StickyFooter>
    </div>
  );
}
