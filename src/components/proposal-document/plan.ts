/**
 * How the proposal is ORGANISED: its sections, the letter each gets, and the
 * code each service prints under.
 *
 * Decided by the API, never here. `GET /proposals/{id}` carries `document`,
 * built by the same `planProposal` call the PDF renderer makes
 * (`bib-backend/src/domain/proposal/document.ts`): a Dept is a section,
 * lettered by rank among the Depts the proposal uses; a service prints under
 * its catalogue code, or is numbered in its section (B1); a company is named
 * only when the lines are for more than one. Restating those rules here would
 * be a second copy free to disagree with the paper, which is the one thing
 * the preview must not do.
 *
 * This only joins each planned item back to its line, for the texts and the
 * fee the document draws under it.
 */

import type { ProposalLine, ProposalRecord } from "@/lib/api/client";

export interface PlannedItem {
  /** "H3", or "B1" for a service with no code of its own. */
  readonly code: string;
  /** The company, when the proposal should say so; null means "do not print". */
  readonly subject: string | null;
  /** "A1" when this service reads "Included in A1" (0394). */
  readonly includedIn: string | null;
  readonly line: ProposalLine;
}

export interface PlannedSection {
  /** "A". */
  readonly code: string;
  /** The Dept's name. */
  readonly title: string;
  readonly items: readonly PlannedItem[];
}

export function planSections(record: ProposalRecord): PlannedSection[] {
  const lines = new Map(record.lines.map((l) => [l.id, l]));
  return record.document.sections.map((s) => ({
    code: s.code,
    title: s.title,
    // A planned item whose line is not in the same answer cannot happen (one
    // read builds both); skipping it keeps the page drawable if it ever did.
    items: s.items.flatMap((i) => {
      const line = lines.get(i.lineId);
      return line === undefined ? [] : [{ code: i.code, subject: i.subject, includedIn: i.includedIn, line }];
    }),
  }));
}
