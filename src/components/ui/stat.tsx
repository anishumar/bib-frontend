import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * Counts, in one band rather than a row of hero tiles.
 *
 * The number is the loud part and the word is small, because the number is
 * what changes. Set in the mono face with `tabular-nums`, so a strip whose
 * figures tick over does not jitter.
 *
 * Tone reaches the card's border as well as the figure, so a count that
 * matters is visible before it is read — which is the only reason to spend
 * colour here at all.
 */
export function Strip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cx("strip", className)}>{children}</dl>;
}

export function Stat({
  label,
  value,
  /** The quiet half — "of 42", "this month". */
  note,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd {...(tone === undefined ? {} : { "data-tone": tone })}>
        {value}
        {note !== undefined && <small>{note}</small>}
      </dd>
    </div>
  );
}
