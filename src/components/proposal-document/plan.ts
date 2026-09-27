/**
 * How the proposal is ORGANISED: its sections, the letter each gets, and the
 * code each service prints under. The PDF decides this in `planProposal`
 * (`bib-backend/src/domain/proposal/document.ts`), and the preview must agree
 * with it line for line, so this is that function's three rules restated:
 *
 * 1. A Dept is a section, in the firm's Dept order, lettered A, B, … by RANK
 *    among the Depts this proposal uses. A code the firm keeps no row for
 *    prints under the code itself, after the named ones. A service with no
 *    Dept goes last, in "Other services" ("Services" when it is the only one).
 * 2. A service prints under its catalogue code ("H3"); one with no code is
 *    numbered in its section (B1), counting only those.
 * 3. Companies are named beside services only when the lines are for more
 *    than one.
 *
 * The Dept is the PINNED catalogue version's (`line.service.module`), exactly
 * as the renderer reads it. The one input the renderer has and this does not
 * is a RETIRED Dept's name: `/tenancy/axes` lists active Depts only, so a
 * proposal pinned to a retired one letters it after the named ones, under its
 * code. Every other proposal letters identically.
 */

import type { ProposalLine, ServiceAxis } from "@/lib/api/client";

export interface PlannedItem {
  /** "H3", or "B1" for a service with no code of its own. */
  readonly code: string;
  /** The company, when the proposal should say so; null means "do not print". */
  readonly subject: string | null;
  readonly line: ProposalLine;
}

export interface PlannedSection {
  /** "A". */
  readonly code: string;
  /** The Dept's name. */
  readonly title: string;
  readonly items: readonly PlannedItem[];
}

/** `sectionCode`: A … Z, then AA. */
export function sectionCode(index: number): string {
  let n = index;
  let code = "";
  do {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
}

export function planSections(
  lines: readonly ProposalLine[],
  depts: readonly Pick<ServiceAxis, "code" | "name" | "sortOrder">[],
): PlannedSection[] {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const deptOf = (l: ProposalLine): string | null => l.service?.module ?? null;

  const subjects = new Set(ordered.map((l) => l.entity?.displayName ?? ""));
  const nameSubjects = subjects.size > 1;

  const known = new Map(depts.map((d) => [d.code, d]));
  const used = [...new Set(ordered.map(deptOf).filter((c): c is string => c !== null))];
  const named = used
    .filter((c) => known.has(c))
    .sort((a, b) => {
      const da = known.get(a);
      const db = known.get(b);
      if (da === undefined || db === undefined) return 0;
      return da.sortOrder - db.sortOrder || da.name.localeCompare(db.name) || a.localeCompare(b);
    });
  const unnamed = used.filter((c) => !known.has(c)).sort((a, b) => a.localeCompare(b));
  const order: (string | null)[] = [...named, ...unnamed];
  if (ordered.some((l) => deptOf(l) === null)) order.push(null);

  return order.map((dept, index) => {
    const code = sectionCode(index);
    const title =
      dept === null
        ? order.length === 1
          ? "Services"
          : "Other services"
        : (known.get(dept)?.name ?? dept);
    let unnumbered = 0;
    const items = ordered
      .filter((l) => deptOf(l) === dept)
      .map((line): PlannedItem => {
        let itemCode = line.service?.ref ?? null;
        if (itemCode === null) {
          unnumbered += 1;
          itemCode = `${code}${String(unnumbered)}`;
        }
        return { code: itemCode, subject: nameSubjects ? (line.entity?.displayName ?? null) : null, line };
      });
    return { code, title, items };
  });
}
