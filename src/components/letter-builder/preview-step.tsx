"use client";

import type { Route } from "next";
import type { LetterRecord } from "@/lib/api/client";
import { Button, LinkButton } from "@/components/ui";
import { Documents } from "@/lib/ui/documents";
import { useSession } from "@/components/layout";
import { StickyFooter } from "@/components/proposal-builder/frame";
import { LetterPdf } from "./letter-pdf";
import { LetterSendPanel } from "./send-panel";
import { LetterTotals } from "./totals";

/**
 * STEP 3: the letter as the client will sign it — its own PDF, edited on the
 * page (2026-09-28) — and sending it. The files panel below keeps every PDF
 * filed for it.
 *
 * The footer's Send takes the reader to the Send panel rather than sending: who
 * signs and where the envelope goes are the panel's to decide.
 */
export function LetterPreviewStep({ record }: { record: LetterRecord }) {
  const session = useSession();
  const { letter } = record;
  const letterId = letter.id;
  const isDraft = letter.status === "draft" && letter.deletedAt === null;

  return (
    <div className="flex flex-col gap-6">
      <LetterPdf letterId={letterId} editable />
      <div className="w-full max-w-[900px]">
        <LetterSendPanel letterId={letterId} />
      </div>
      <div className="w-full max-w-[900px]">
        <Documents
          key={letter.status}
          subjectKind="engagement_letter"
          subjectRef={letterId}
          canWrite={(session?.permissions.includes("party:write") ?? false) && letter.deletedAt === null}
          title="Letter PDF"
          renderable="engagement_letter"
          wentOut={letter.status !== "draft"}
          emptyHint="No PDF yet. Make a draft copy to read the letter on paper."
        />
      </div>

      <StickyFooter summary={<LetterTotals record={record} />}>
        {isDraft && (
          <LinkButton variant="ghost" href={`/engagement-letters/${letterId}/build?step=services` as Route}>
            Back
          </LinkButton>
        )}
        <LinkButton variant="secondary" href={`/engagement-letters/${letterId}` as Route}>
          Open the letter page
        </LinkButton>
        {isDraft && (
          <Button
            type="button"
            onClick={() => {
              const panel = document.getElementById(`send-${letterId}`);
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
