"use client";

import { Page, PageHeader } from "@/components/tw";
import { Button } from "@/components/ui";
import { ErrorState } from "@/components/states";

/**
 * THE APP'S FIRST ERROR BOUNDARY, and it is FinCompliance's (F0.8).
 *
 * The plan's ground rule 4: fin can fail without BiB failing. Fin is new, it
 * reads files clients send, and its answers will grow faster than anything
 * else in the product; a screen of it throwing must not take the workspace
 * with it. Next puts this component in place of the fin PAGE when one throws
 * while rendering, so the shell (sidebar, top bar, bell) and every other
 * screen keep working, and the reader is told so.
 *
 * Nowhere else has one yet, deliberately: a boundary is a promise about what
 * still works when something fails, and this is the one subject where that
 * promise has been made. A wider one belongs with a decision to make it.
 *
 * It sits INSIDE `app/fin/layout.tsx` (Next wraps a segment's pages and
 * nested layouts, never the layout beside it), so the status gate is not
 * covered and is kept to code that cannot throw.
 *
 * `retry` is Next 16.3's "try again": it re-renders the fin page (which reads
 * its data again on mount). `reset` would do the same here, and the docs ask
 * for `retry` (node_modules/next/dist/docs, error.md).
 *
 * The error's own words are kept for support, last and closed: a JavaScript
 * message means nothing to the person reading this, and is the first thing
 * somebody fixing it asks for.
 */
export default function FinError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Page>
      <PageHeader title="FinCompliance" />
      <ErrorState
        title="This FinCompliance screen stopped working"
        message="The rest of the workspace is not affected. Try again, or open another screen from the menu."
        onRetry={
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        }
      />
      <details className="disclosure">
        <summary>Details for support</summary>
        <p className="mono text-sm text-ink-2">
          {error.message}
          {error.digest !== undefined && ` (${error.digest})`}
        </p>
      </details>
    </Page>
  );
}
