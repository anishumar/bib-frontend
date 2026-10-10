"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/layout";
import { Page, PageHeader } from "@/components/tw";
import { Button } from "@/components/ui";
import { Denied, Empty, ErrorState, Loading } from "@/components/states";
import { useFinStatus } from "@/lib/fin";

/**
 * FinCompliance's screens, and the gate in front of them (F0.8).
 *
 * The sidebar offers these screens only while `GET /fin/status` answers 200,
 * but a URL can be typed, bookmarked or shared to a colleague at a firm that
 * has not switched FinCompliance on. Every fin route under it would then answer
 * 404 and the page would be an error about nothing, so the gate answers first,
 * in words: not switched on for this firm, not for this role, or not reachable
 * just now. It reads the same once-per-session answer the sidebar does
 * (`@/lib/fin`), so the two can never disagree.
 *
 * `error.tsx` beside this file is the app's first error boundary. It sits
 * INSIDE this layout (Next wraps a segment's pages, not its own layout), so
 * the gate is not covered by it and is kept to code that cannot throw.
 */
export default function FinLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  const fin = useFinStatus(session);

  if (fin.kind === "on") return <>{children}</>;

  if (fin.kind === "checking") {
    return (
      <Page>
        <Loading label="Loading FinCompliance" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="FinCompliance" />
      {fin.why === "not_enabled" && (
        <Empty icon="lock" title="FinCompliance is not switched on for this firm." />
      )}
      {fin.why === "no_permission" && (
        <Denied permission="books:read">
          Your role does not let you see a client&apos;s books in FinCompliance.
        </Denied>
      )}
      {fin.why === "unreachable" && (
        <ErrorState
          title="FinCompliance did not answer"
          message="The rest of the workspace is working. Try again in a moment."
          onRetry={
            <Button variant="secondary" onClick={fin.retry}>
              Try again
            </Button>
          }
        />
      )}
    </Page>
  );
}
