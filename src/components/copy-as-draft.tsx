"use client";

import Link from "next/link";
import type { Route } from "next";
import { Notice } from "@/components/ui";

/**
 * "COPY AS NEW DRAFT" (0316) — where a draft came from, and where a closed
 * document went.
 *
 * A proposal the client declined, or one that expired, and a letter that was
 * withdrawn, can be copied into a new draft so nobody types it again. Both
 * ends say so, by reference: the copy names the document it started from, and
 * the old one names every draft made from it, because "did we ever send them
 * a revised quote?" is asked from the old one.
 *
 * `partial` is set by the page that just made the copy (`?copied=partial` in
 * the URL, the letter page's `carried=partial` arrangement): which lines did
 * not come across is a fact about one act, not a property of the draft.
 */
export interface CopyEnd {
  readonly id: string;
  readonly ref: string;
  /** The status in words, as the page already prints it. */
  readonly statusWord: string;
}

export function CopyLineage({
  kind,
  from,
  copies,
  partial,
}: {
  kind: "proposal" | "letter";
  from: CopyEnd | null;
  copies: readonly CopyEnd[];
  partial: boolean;
}) {
  if (from === null && copies.length === 0) return null;
  const href = (id: string) =>
    (kind === "proposal" ? `/proposals/${id}` : `/engagement-letters/${id}`) as Route;
  const noun = kind === "proposal" ? "proposal" : "letter";

  return (
    <div className="stack tight max-w-[900px]">
      {from !== null && (
        <Notice tone={partial ? "warn" : "neutral"} eyebrow="Copied">
          <p>
            This draft was copied from <Link href={href(from.id)}>{from.ref}</Link> ({from.statusWord}).
            Change what the client asked for, then send it. {from.ref} stays exactly as it was.
          </p>
          {partial && (
            <p>
              Some of {from.ref} did not come across: a line whose company has been put away since
              {kind === "letter" && ", a term no longer in the library"}, or the person it was
              addressed to. Compare it with <Link href={href(from.id)}>{from.ref}</Link> and add what
              is missing before you send it.
            </p>
          )}
        </Notice>
      )}
      {copies.length > 0 && (
        <Notice tone="neutral" eyebrow="Copied to">
          <p>
            A new {noun} was started from this one:{" "}
            {copies.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={href(c.id)}>{c.ref}</Link> ({c.statusWord})
              </span>
            ))}
            .
          </p>
        </Notice>
      )}
    </div>
  );
}
