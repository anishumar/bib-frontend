"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, codeLabel } from "@/lib/api/client";
import type { ServiceAxis } from "@/lib/api/client";
import { Notice, Pill } from "@/components/ui";
import { Page, PageHeader } from "@/components/tw";
import { useSession } from "@/components/layout";
import { BuilderFacts, Stepper } from "@/components/proposal-builder/frame";
import { readCatalogue, readStep } from "@/components/proposal-builder/data";
import type { CatalogueService } from "@/components/proposal-builder/data";
import { LetterClientStep } from "@/components/letter-builder/client-step";
import { LetterServicesStep } from "@/components/letter-builder/services-step";
import { LetterPreviewStep } from "@/components/letter-builder/preview-step";
import { LETTER_BUILDER } from "@/components/letter-builder/data";
import { putLetter, useLetter } from "@/components/letter-builder/store";

/**
 * One draft letter in the builder: `?step=client|services|preview` (T6.18 S6).
 *
 * The step is in the URL and everything a step shows is the letter itself, read
 * through the store the document and the Send panel share, so a reload or a
 * colleague's link lands on the same step with the same lines. A letter that is
 * no longer a draft opens on its preview.
 */
export default function BuildLetterPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const letterId = params.letterId;
  const search = useSearchParams();
  const session = useSession();
  const { record, error, loaded, signedOut, reload } = useLetter(letterId);

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
  const isDraft = record?.letter.status === "draft" && record.letter.deletedAt === null;
  const step = isDraft || record === null ? readStep(search.get("step")) : "preview";
  const carriedPartially = search.get("carried") === "partial";

  if ((!loaded && record === null) || !catalogueRead) return <p className="muted">Loading…</p>;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such letter."}</Notice>
      </Page>
    );
  }

  const { letter } = record;
  return (
    <Page>
      <title>{`${letter.ref} · ${letter.title}`}</title>
      {/* Wave 4: no typewriter eyebrow; the facts are one line under the
          title, and a sent letter's status is a pill in words. */}
      <PageHeader
        title={letter.title}
        lede={
          <BuilderFacts
            reference={letter.ref}
            issuer={record.issuer.name}
            currency={letter.currency}
            status={
              !isDraft && (
                <Pill dot tone={letter.deletedAt === null ? "neutral" : "danger"}>
                  {letter.deletedAt === null ? codeLabel(letter.status) : "Deleted"}
                </Pill>
              )
            }
          />
        }
      />
      <Stepper current={step} proposalId={isDraft ? letter.id : null} kind={LETTER_BUILDER} />

      {error !== null && <Notice tone="danger">{error}</Notice>}
      {carriedPartially && (
        <Notice tone="warn" eyebrow="Some lines did not carry">
          <p>Not every line of the quote came across. Add what is missing before you send it.</p>
        </Notice>
      )}

      {step === "client" && (
        <LetterClientStep
          key={JSON.stringify(letter)}
          draft={record}
          prefillClientId={null}
          onSaved={(saved) => {
            putLetter(letterId, saved);
          }}
        />
      )}
      {step === "services" && (
        <LetterServicesStep
          record={record}
          catalogue={catalogue}
          axes={axes}
          canWrite={canWrite}
          onChanged={reload}
        />
      )}
      {step === "preview" && <LetterPreviewStep record={record} />}
    </Page>
  );
}
