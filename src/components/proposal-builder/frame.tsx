"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/cn";
import { Icon, Pill } from "@/components/ui";
import type { BuilderStep } from "./data";

const STEPS: readonly { step: BuilderStep; label: string }[] = [
  { step: "client", label: "Client" },
  { step: "services", label: "Services and scope" },
  { step: "preview", label: "Preview and send" },
];

/** Where a builder lives, so the proposal's and the letter's share one stepper. */
export interface BuilderKind {
  /** "/proposals" or "/engagement-letters". */
  readonly base: string;
  /** The stepper's accessible name. */
  readonly label: string;
  readonly steps?: readonly { step: BuilderStep; label: string }[];
}

const PROPOSAL_BUILDER: BuilderKind = { base: "/proposals", label: "Proposal steps" };

/**
 * Where the reader is among the three steps, and a way back to any of them.
 *
 * A step is a LINK once there is a draft to go back to: the step lives in the
 * URL (D14), so moving between them is navigation, and a reload or a shared
 * link lands on the same step. Before the draft exists (`proposalId` null) the
 * later steps have nothing to show, so they are drawn and not offered.
 */
export function Stepper({
  current,
  proposalId,
  kind = PROPOSAL_BUILDER,
}: {
  current: BuilderStep;
  /** The draft's id, or null before it exists. */
  proposalId: string | null;
  kind?: BuilderKind;
}) {
  const steps = kind.steps ?? STEPS;
  const at = steps.findIndex((s) => s.step === current);
  return (
    <nav aria-label={kind.label} className="builder-steps">
      <ol className="m-0 flex list-none items-center gap-2 p-0 sm:gap-3">
        {steps.map((s, i) => {
          const here = i === at;
          // A step before this one is behind the reader: "done" is what the
          // ok tone says, so a ticked circle there is not furniture.
          const done = i < at;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  here
                    ? "border-ink bg-ink text-surface"
                    : done
                      ? "border-ok bg-ok-wash text-ok-ink"
                      : "border-line bg-surface text-muted",
                )}
              >
                {done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-md", here ? "font-semibold text-ink" : done ? "text-ink-2 max-sm:sr-only" : "text-muted max-sm:sr-only")}>
                {s.label}
              </span>
            </>
          );
          return (
            <li key={s.step} className={cn("flex items-center gap-2 sm:gap-3", i > 0 && "flex-1")}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cn("h-0.5 min-w-3 flex-1 rounded-full", done || here ? "bg-ok" : "bg-line")}
                />
              )}
              {proposalId !== null && !here ? (
                <Link
                  href={`${kind.base}/${proposalId}/build?step=${s.step}` as Route}
                  className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1 no-underline hover:bg-surface-hover"
                >
                  {body}
                </Link>
              ) : (
                <span
                  className="flex shrink-0 items-center gap-2 px-2 py-1"
                  {...(here ? { "aria-current": "step" as const } : {})}
                >
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
 * THE FACTS UNDER A BUILDER'S TITLE (2026-10-12): the reference as a code
 * badge, then who issues it and in what currency, each a label and a value,
 * then the status when it is no longer a draft. It was one run-on sentence
 * ("RAJ · PR-2026-0005 · issued by 10x Global in INR. Open the proposal
 * page") repeating the client the title already names.
 */
export function BuilderFacts({
  reference,
  issuer,
  currency,
  status,
}: {
  reference: string;
  issuer: string;
  currency: string;
  status?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <Pill tone="code">{reference}</Pill>
      <span className="text-muted">
        Issued by <span className="font-semibold text-ink">{issuer}</span>
      </span>
      <span className="text-muted">
        Currency <span className="font-semibold text-ink">{currency}</span>
      </span>
      {status}
    </div>
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
    <div className="builder-footer z-[var(--z-sticky)] mt-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-md" role="status">
          {summary}
        </div>
        <div className="cluster">{children}</div>
      </div>
    </div>
  );
}
