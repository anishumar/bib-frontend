"use client";

import { formatMoney } from "@/lib/api/client";
import type { ServiceAxis } from "@/lib/api/client";
import { Icon, NotSet, Pill } from "@/components/ui";
import { DeptChip } from "@/app/catalogue/parts";

/** The pieces the Client summary's two views share: "So far" and "Coming months". */

/** A line's Depts and the SPOCs on each, as both views read them. */
export interface LinePeople {
  readonly depts: readonly { readonly code: string; readonly name: string }[];
  readonly spocs: readonly { readonly userId: string; readonly name: string; readonly deptCode: string }[];
}

/** Each Dept of the work as its tinted chip (the Catalogue's), with its SPOCs. */
export function Spocs({ line: l, axes }: { line: LinePeople; axes: readonly ServiceAxis[] }) {
  if (l.depts.length === 0) return <span className="muted">No Dept</span>;
  return (
    <div className="cs-spocs">
      {l.depts.map((d) => {
        const people = l.spocs.filter((s) => s.deptCode === d.code);
        return (
          <span key={d.code} className="cs-spoc">
            {axes.length === 0 ? <Pill tone="code">{d.code}</Pill> : <DeptChip axes={axes} code={d.code} />}
            {people.length === 0 ? <NotSet>No SPOC</NotSet> : <span>{people.map((p) => p.name).join(", ")}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** The SPOCs in words, for the one line a phone shows under a service. */
export function spocWords(l: LinePeople): string | null {
  if (l.depts.length === 0) return null;
  return l.depts
    .map((d) => {
      const people = l.spocs.filter((s) => s.deptCode === d.code).map((s) => s.name);
      return `${d.code} ${people.length === 0 ? "no SPOC" : people.join(", ")}`;
    })
    .join(", ");
}

/** The chevron that opens or folds a client's services. */
export function FoldToggle({ open, client, onToggle }: { open: boolean; client: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="cs-toggle"
      aria-expanded={open}
      aria-label={`${open ? "Fold" : "Show"} the services of ${client}`}
      onClick={onToggle}
    >
      <Icon name="chevronDown" size={18} />
    </button>
  );
}

export function money(amount: string, currency: string): string {
  return formatMoney(amount, currency);
}

export function isZero(amount: string): boolean {
  return /^-?0*(\.0*)?$/.test(amount.trim());
}

export function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? "" : "s"}`;
}
