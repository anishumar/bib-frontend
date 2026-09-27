"use client";

import type { Route } from "next";
import type { ProposalRecord } from "@/lib/api/client";
import { Button, LinkButton } from "@/components/ui";
import { ProposalDocument, ProposalSendPanel } from "@/components/proposal-document";
import { StickyFooter } from "./frame";
import { FrequencyTotals } from "./totals";

/**
 * STEP 3: the proposal as the client will read it, and sending it.
 *
 * The same two components the proposal page mounts: `<ProposalDocument>`
 * draws it in the PDF's own order and, on a draft, lets any piece be changed
 * where it is read (a scope text, a fee, an exclusion, D10), and
 * `<ProposalSendPanel>` sends it by email, on WhatsApp or as a bare link, and
 * downloads the PDF. Both read the builder's one record, so a fee changed in
 * the document is in the footer's total and in the PDF the panel sends.
 *
 * The footer's Send does not send. It takes the reader to the panel with the
 * address box focused: the address, the note and the choice of channel are
 * the panel's, and one button deciding all three for them would be a send
 * nobody saw coming.
 */
export function PreviewStep({ record }: { record: ProposalRecord }) {
  const { proposal } = record;
  const proposalId = proposal.id;
  const isDraft = proposal.status === "draft" && proposal.deletedAt === null;

  return (
    <div className="flex flex-col gap-6">
      <ProposalDocument proposalId={proposalId} editable />
      <div className="w-full max-w-[900px]">
        <ProposalSendPanel proposalId={proposalId} />
      </div>

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
            onClick={() => {
              const panel = document.getElementById(`send-${proposalId}`);
              panel?.scrollIntoView({ behavior: "smooth", block: "start" });
              panel?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
            }}
          >
            Send
          </Button>
        )}
      </StickyFooter>
    </div>
  );
}
