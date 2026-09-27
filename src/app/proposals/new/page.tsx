"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/tw";
import { ClientStep } from "@/components/proposal-builder/client-step";
import { Stepper } from "@/components/proposal-builder/frame";

/**
 * A new proposal, step 1 of 3 (D14).
 *
 * `?clientPartyId=` (from a client's page) and `?leadId=` (from a lead's)
 * arrive with the client already chosen, so from either page the whole step is
 * one press of Next. Nothing is written until then: the draft, and for a new
 * prospect the lead, are created by that press.
 */
export default function NewProposalPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <NewProposal />
    </Suspense>
  );
}

function NewProposal() {
  const search = useSearchParams();
  return (
    <Page>
      <title>New proposal</title>
      <PageHeader
        eyebrow="New proposal"
        title="Who is it for?"
        lede="The client, which of your companies offers it, and the currency. Next saves a draft and takes you to the services."
      />
      <Stepper current="client" proposalId={null} />
      <ClientStep
        draft={null}
        prefillClientId={search.get("clientPartyId")}
        prefillLeadId={search.get("leadId")}
      />
    </Page>
  );
}
