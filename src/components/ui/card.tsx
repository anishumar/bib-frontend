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
        {title !== undefined && <h2 className="card-title">{title}</h2>}
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
  return <h2 className={cx("card-title", className)}>{children}</h2>;
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
