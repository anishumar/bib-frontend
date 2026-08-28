/**
 * The vocabulary a RECORD screen is written in.
 *
 * A record — a catalogue service, a clause — is a handful of short facts plus a
 * few blocks of the firm's OWN PROSE, and the two want opposite layouts. Facts
 * read as a grid of label/value pairs. Prose reads as a paragraph, with the
 * firm's line breaks intact, because "under 1,000 entries; under 8 bank
 * accounts" is what protects the firm in a dispute and a table cell is where it
 * goes to become unreadable.
 *
 * The other reason this is a component rather than markup repeated per field:
 * ABSENT HAS EXACTLY ONE RENDERING. Every optional field on a config body means
 * "the firm has not stated this", and a screen that shows that as an empty cell
 * — or worse, as a zero — is claiming something the record does not say.
 * `NotStated` is the one place that sentence is written.
 */
import type { ReactNode } from "react";

/**
 * What a field says when the record does not state it.
 *
 * Never an empty cell. Blank reads as "nothing to see here"; the true answer is
 * "nobody has said", and on a catalogue the difference is the difference
 * between a service with no SLA and a service somebody forgot to fill in. The
 * caller may say it more precisely — "no SLA stated", "no list price" — but it
 * always says something.
 */
export function NotStated({ children }: { children?: ReactNode }) {
  return <span className="bib-unstated">{children ?? "not stated"}</span>;
}

/** A grid of label/value pairs. `<div>` inside `<dl>` is how HTML groups one
 *  term with its definition, and it is what makes the grid possible. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="bib-facts">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bib-fact">
      <dt className="bib-label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One block of the firm's own words, under the heading a reader knows it by and
 * the field name a writer knows it by.
 *
 * The field name is on the screen on purpose: this is the configuration
 * registry with its commercial hat on, an engagement letter is assembled from
 * these four blocks by name, and somebody deciding whether a sentence belongs
 * in `scope` or in `exclusions` is better served by being told which is which.
 *
 * `white-space: pre-wrap` in the stylesheet keeps the line breaks the firm
 * typed. These blocks are semicolon-separated lists at least as often as they
 * are sentences, and re-flowing them would be the screen quietly editing what
 * the firm wrote.
 */
export function Prose({
  heading,
  field,
  text,
}: {
  heading: string;
  field: string;
  text: string | null;
}) {
  return (
    <section className="bib-prose">
      <h4>
        {heading} <span className="bib-mono">{field}</span>
      </h4>
      {text === null ? (
        <p>
          <NotStated />
        </p>
      ) : (
        <p>{text}</p>
      )}
    </section>
  );
}
