"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, PROPOSAL_STATUS_WORDS } from "@/lib/api/client";
import type { ServiceAxis } from "@/lib/api/client";
import { Notice, Pill } from "@/components/ui";
import { Page, PageHeader } from "@/components/tw";
import { useSession } from "@/components/layout";
import { putProposal, useProposal } from "@/components/proposal-document";
import { BuilderFacts, Stepper } from "@/components/proposal-builder/frame";
import { ClientStep } from "@/components/proposal-builder/client-step";
import { ServicesStep } from "@/components/proposal-builder/services-step";
import { PreviewStep } from "@/components/proposal-builder/preview-step";
import { readCatalogue, readStep } from "@/components/proposal-builder/data";
import type { CatalogueService } from "@/components/proposal-builder/data";

/**
 * One draft in the builder: `?step=client|services|preview` (D14).
 *
 * The step is in the URL and everything the step shows is the proposal itself,
 * read from the API, so a reload or a colleague's link lands on the same step
 * with the same lines. A proposal that has been sent opens on the preview:
 * there is nothing left to build.
 *
 * ONE READ FOR ALL THREE STEPS. The record is the shared one the document and
 * the Send panel read (`useProposal`), so an edit in the step 3 preview, a
 * line ticked in step 2 and the footer's totals are the same answer: a write
 * that returns the whole record puts it in, every other write reads again.
 */
export default function BuildProposalPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const router = useRouter();
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const search = useSearchParams();
  const session = useSession();
  const { record, error, loaded, signedOut, reload } = useProposal(proposalId);

  const [catalogue, setCatalogue] = useState<CatalogueService[]>([]);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [catalogueRead, setCatalogueRead] = useState(false);

  useEffect(() => {
    if (signedOut) router.push("/login");
  }, [signedOut, router]);

  useEffect(() => {
    void (async () => {
      const [services, structure] = await Promise.all([
        api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
        api.GET("/api/v1/tenancy/axes", {}),
      ]);
      if (services.data) setCatalogue(readCatalogue(services.data.entries));
      if (structure.data) setAxes(structure.data.axes);
      setCatalogueRead(true);
    })();
  }, []);

  const canWrite = session?.permissions.includes("party:write") ?? false;
  const isDraft = record?.proposal.status === "draft" && record.proposal.deletedAt === null;
  // A sent proposal has nothing left to build: it opens on its preview.
  const step = isDraft || record === null ? readStep(search.get("step")) : "preview";

  if ((!loaded && record === null) || !catalogueRead) return <p className="muted">Loading…</p>;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such proposal."}</Notice>
      </Page>
    );
  }

  const { proposal } = record;
  return (
    <Page>
      <title>{`${proposal.ref} · ${proposal.title}`}</title>
      {/* Wave 4: no typewriter eyebrow; the facts are one line under the
          title, and a sent proposal's status is a pill in words. */}
      <PageHeader
        title={proposal.title}
        lede={
          <BuilderFacts
            reference={proposal.ref}
            issuer={record.issuingEntity.displayName}
            currency={proposal.currency}
            status={
              !isDraft && (
                <Pill dot tone={proposal.deletedAt === null ? "neutral" : "danger"}>
                  {proposal.deletedAt === null ? PROPOSAL_STATUS_WORDS[proposal.status] : "Deleted"}
                </Pill>
              )
            }
          />
        }
      />
      <Stepper current={step} proposalId={isDraft ? proposal.id : null} />

      {error !== null && <Notice tone="danger">{error}</Notice>}

      {step === "client" && (
        <ClientStep
          // The step copies the draft into its boxes once, when it mounts. A
          // read that brings a different head (a colleague changed it, or the
          // cached record was older than this visit) mounts it again, so the
          // boxes never show a proposal that is not the one on file.
          key={JSON.stringify(proposal)}
          draft={record}
          prefillClientId={null}
          prefillLeadId={null}
          onSaved={(saved) => {
            putProposal(proposalId, saved);
          }}
        />
      )}
      {step === "services" && (
        <ServicesStep
          record={record}
          catalogue={catalogue}
          axes={axes}
          canWrite={canWrite}
          onChanged={reload}
        />
      )}
      {step === "preview" && <PreviewStep record={record} />}
    </Page>
  );
}
