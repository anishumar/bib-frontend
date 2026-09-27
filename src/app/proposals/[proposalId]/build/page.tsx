"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ProposalRecord, ServiceAxis } from "@/lib/api/client";
import { Notice, Pill } from "@/components/ui";
import { Page, PageHeader } from "@/components/tw";
import { useSession } from "@/components/layout";
import { Stepper } from "@/components/proposal-builder/frame";
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

  const [record, setRecord] = useState<ProposalRecord | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueService[]>([]);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    const one = await api.GET("/api/v1/proposals/{proposalId}", {
      params: { path: { proposalId } },
    });
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      return;
    }
    setRecord(one.data);
    setError(null);
  }, [proposalId, router]);

  useEffect(() => {
    void (async () => {
      const [, services, structure] = await Promise.all([
        reload(),
        api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
        api.GET("/api/v1/tenancy/axes", {}),
      ]);
      if (services.data) setCatalogue(readCatalogue(services.data.entries));
      if (structure.data) setAxes(structure.data.axes);
      setLoaded(true);
    })();
  }, [reload]);

  const canWrite = session?.permissions.includes("party:write") ?? false;
  const isDraft = record?.proposal.status === "draft" && record.proposal.deletedAt === null;
  // A sent proposal has nothing left to build: it opens on its preview.
  const step = isDraft || record === null ? readStep(search.get("step")) : "preview";

  if (!loaded) return <p className="muted">Loading…</p>;
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
      <PageHeader
        eyebrow={
          <span>
            <span className="mono">{proposal.ref}</span> · {record.party.displayName}
          </span>
        }
        title={proposal.title}
        lede={
          <span>
            Issued by {record.issuingEntity.displayName} in {proposal.currency}.{" "}
            {!isDraft && (
              <>
                <Pill tone="neutral">{proposal.deletedAt === null ? proposal.status : "deleted"}</Pill>{" "}
              </>
            )}
            <Link href={`/proposals/${proposal.id}` as Route}>Open the proposal page</Link>
          </span>
        }
      />
      <Stepper current={step} proposalId={isDraft ? proposal.id : null} />

      {error !== null && <Notice tone="danger">{error}</Notice>}

      {step === "client" && (
        <ClientStep draft={record} prefillClientId={null} prefillLeadId={null} />
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
      {step === "preview" && (
        <PreviewStep
          record={record}
          canWrite={canWrite}
          canApprove={session?.permissions.includes("proposal:approve") ?? false}
          onChanged={reload}
        />
      )}
    </Page>
  );
}
