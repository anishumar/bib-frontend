"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/cn";
import type { BuilderStep } from "./data";

const STEPS: readonly { step: BuilderStep; label: string }[] = [
  { step: "client", label: "Client" },
  { step: "services", label: "Services and scope" },
  { step: "preview", label: "Preview and send" },
];

/**
 * Where the reader is among the three steps, and a way back to any of them.
 *
 * A step is a LINK once there is a draft to go back to: the step lives in the
 * URL (D14), so moving between them is navigation, and a reload or a shared
 * link lands on the same step. Before the draft exists (`proposalId` null) the
 * later steps have nothing to show, so they are drawn and not offered.
 */
export function Stepper({ current, proposalId }: { current: BuilderStep; proposalId: string | null }) {
  return (
    <nav aria-label="Proposal steps">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => {
          const here = s.step === current;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                  here ? "border-ink bg-ink text-surface" : "border-line text-muted",
                )}
              >
                {i + 1}
              </span>
              <span className={cn("text-md", here ? "font-semibold text-ink" : "text-muted")}>
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.step} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden="true" className="h-px w-6 bg-line" />
              )}
              {proposalId !== null && !here ? (
                <Link
                  href={`/proposals/${proposalId}/build?step=${s.step}` as Route}
                  className="flex items-center gap-2 rounded-sm px-1 no-underline hover:bg-surface-hover"
                >
                  {body}
                </Link>
              ) : (
                <span className="flex items-center gap-2 px-1" {...(here ? { "aria-current": "step" as const } : {})}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The bar that stays at the bottom of the window while the step scrolls: what
 * the proposal adds up to so far on the left, Back and Next on the right.
 *
 * Sticky rather than fixed, so it sits in the page's own column and never
 * covers the sidebar, and it scrolls away with the page when the page ends.
 */
export function StickyFooter({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-[var(--z-sticky)] -mx-2 mt-4 border-t border-line bg-paper px-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-md" role="status">
          {summary}
        </div>
        <div className="cluster">{children}</div>
      </div>
    </div>
  );
}
