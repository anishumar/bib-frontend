"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/tw";
import { Stepper } from "@/components/proposal-builder/frame";
import { LetterClientStep } from "@/components/letter-builder/client-step";
import { LETTER_BUILDER } from "@/components/letter-builder/data";

/**
 * A new engagement letter, step 1 of 3 (T6.18 S6). `?clientPartyId=` (from a
 * client's page) arrives with the client chosen, so the step is one press of
 * Next. Nothing is written until then.
 */
export default function NewLetterPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <NewLetter />
    </Suspense>
  );
}

function NewLetter() {
  const search = useSearchParams();
  return (
    <Page>
      <title>New engagement letter</title>
      <PageHeader title="New engagement letter" />
      <Stepper current="client" proposalId={null} kind={LETTER_BUILDER} />
      <LetterClientStep draft={null} prefillClientId={search.get("clientPartyId")} />
    </Page>
  );
}
