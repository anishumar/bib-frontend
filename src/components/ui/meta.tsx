import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * Label-and-value pairs — the shape a RECORD is read in.
 *
 * A record is a handful of short facts, and a table cell is where a short fact
 * goes to become unreadable. `<dl>` with a `<div>` per pair is how HTML groups
 * a term with its definition, and it is what makes the grid possible.
 *
 * `layout="list"` reads DOWN the page instead. Use it for a record with two or
 * three facts: the grid's `auto-fit` spreads two items across the full width
 * and strands them at opposite edges.
 */
export function Meta({
  children,
  layout,
  className,
}: {
  children: ReactNode;
  layout?: "list";
  className?: string;
}) {
  return (
    <dl
      className={cx("meta", className)}
      {...(layout === undefined ? {} : { "data-layout": layout })}
    >
      {children}
    </dl>
  );
}

export function MetaItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * What a field says when the record does not state it.
 *
 * NEVER an empty cell. Blank reads as "nothing to see here"; the true answer
 * is "nobody has said", and on a catalogue that is the difference between a
 * service with no SLA and a service somebody forgot to fill in. The caller may
 * say it more precisely — "no SLA stated", "no list price" — but it always
 * says something.
 *
 * This is the single reason `<Meta>` is a component rather than markup
 * repeated per field: absent has exactly one rendering, written here once.
 */
export function NotStated({ children }: { children?: ReactNode }) {
  return <span className="unstated">{children ?? "not stated"}</span>;
}

/**
 * One block of the firm's OWN words, under the heading a reader knows it by
 * and the field name a writer knows it by.
 *
 * The field name is on the screen on purpose: an engagement letter is
 * assembled from these blocks BY NAME, and somebody deciding whether a
 * sentence belongs in `scope` or in `exclusions` is better served by being
 * told which is which.
 *
 * The text is `pre-wrap` so the line breaks the firm typed survive. These
 * blocks are semicolon-separated lists at least as often as they are
 * sentences, and re-flowing them would be the screen quietly editing what the
 * firm wrote.
 */
export function Prose({
  heading,
  field,
  text,
}: {
  heading: string;
  /** The API field this prose lives in. Shown in the mono face beside it. */
  field?: string;
  text: string | null;
}) {
  return (
    <section className="prose">
      <h4>
        {heading}
        {field !== undefined && <span className="mono"> {field}</span>}
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

export function ProseGrid({ children }: { children: ReactNode }) {
  return <div className="prose-grid">{children}</div>;
}
