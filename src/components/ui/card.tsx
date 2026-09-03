import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * The container almost everything sits in.
 *
 * `flush` is for a card whose content brings its own padding — a table, most
 * often. Without it a table inside a card is inset by the card's padding and
 * then again by its own cell padding, and the header row stops meeting the
 * card's edge.
 */
export function Card({
  children,
  flush = false,
  pad,
  className,
  ...rest
}: {
  children: ReactNode;
  flush?: boolean;
  pad?: "sm";
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className">) {
  return (
    <div
      {...rest}
      className={cx("card", className)}
      {...(flush ? { "data-flush": "true" } : {})}
      {...(pad === undefined ? {} : { "data-pad": pad })}
    >
      {children}
    </div>
  );
}

/**
 * A card's heading row: the title, and whatever sits opposite it.
 *
 * This is the shape that was written out by hand 59 times, as an `<h2>` with
 * `marginTop: 0` and `fontSize: 16` inline, before it had a name.
 *
 * ── THE TAG IS `h3`, AND IT USED TO BE `h2` ──────────────────────────────
 *
 * A card almost always sits INSIDE a `Section`, whose heading is an `h3` — so
 * the document outline read h3 > h2, a child ranking above its parent. Measured
 * on the client portal: twelve headings, and the two levels inverted at every
 * card. A screen reader's heading list is how somebody who cannot see the
 * layout navigates a page, and an inverted one tells them the cards are the
 * sections.
 *
 * **The change is visually a no-op**, which is why it was safe to make
 * everywhere at once rather than only where it was noticed: `.card-title` pins
 * `font-size: var(--t-lg)` itself, which is exactly what `base.css` gives an
 * `h3`. Nothing on any screen moves by a pixel.
 */
export function CardHead({
  title,
  /** Sits above the title, in the mono eyebrow face. */
  eyebrow,
  /** Sits opposite — a count, an action, a pill. */
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("card-head", className)}>
      <div>
        {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
        {title !== undefined && <h3 className="card-title">{title}</h3>}
        {children}
      </div>
      {aside !== undefined && <div className="cluster">{aside}</div>}
    </div>
  );
}

/** A card's own heading, when the surrounding row is not wanted. */
export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={cx("card-title", className)}>{children}</h3>;
}

/** A footer rule and the note or actions under it. */
export function CardFoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("card-foot", className)}>{children}</div>;
}
