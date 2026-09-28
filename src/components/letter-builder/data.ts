/**
 * What the letter builder shares between its steps (T6.18 S6).
 *
 * The catalogue, the firm's companies and the service rows are the proposal
 * builder's own (`@/components/proposal-builder`); this file only says where
 * the letter's builder lives and turns a letter's line into the shape those
 * rows draw.
 */

import type { FeeGroup, LetterLine } from "@/lib/api/client";
import type { BuilderKind } from "@/components/proposal-builder/frame";
import type { RowLine } from "@/components/proposal-builder/service-row";

export const LETTER_BUILDER: BuilderKind = {
  base: "/engagement-letters",
  label: "Letter steps",
  steps: [
    { step: "client", label: "Client" },
    { step: "services", label: "Services" },
    { step: "preview", label: "Preview and send" },
  ],
};

/**
 * A letter's line as a service row reads it. The catalogue's words for
 * "Back to standard" are the PINNED service's (the letter read carries them on
 * `service`), and a line a section pays for says which section.
 */
export function rowLineOf(line: LetterLine, groups: readonly FeeGroup[]): RowLine & { readonly source: LetterLine } {
  const standard = (key: "scope" | "clientObligations" | "volumeLimits" | "exclusions") =>
    line.service?.[key] ?? null;
  return {
    id: line.id,
    unitAmount: line.unitAmount,
    currency: line.currency,
    quantity: line.quantity,
    discountPercent: line.discountPercent,
    billingFrequency: line.billingFrequency,
    pricingNote: line.pricingNote,
    terms: {
      scope: { ...line.terms.scope, standard: standard("scope") },
      clientObligations: { ...line.terms.clientObligations, standard: standard("clientObligations") },
      volumeLimits: { ...line.terms.volumeLimits, standard: standard("volumeLimits") },
      exclusions: { ...line.terms.exclusions, standard: standard("exclusions") },
    },
    inSection:
      line.feeGroupId === null ? null : (groups.find((g) => g.id === line.feeGroupId)?.code ?? "?"),
    source: line,
  };
}

/** "Engagement Letter for Acme": the firm's own wording for a subject line. */
export function defaultTitle(clientName: string): string {
  return clientName === "" ? "" : `Engagement Letter for ${clientName}`;
}
