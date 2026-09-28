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
      {/* Wave 4: the title says what the page is; "Who is it for?" is the
          first card's own question, so it is not said twice. */}
      <PageHeader title="New proposal" />
      <Stepper current="client" proposalId={null} />
      <ClientStep
        draft={null}
        prefillClientId={search.get("clientPartyId")}
        prefillLeadId={search.get("leadId")}
      />
    </Page>
  );
}
