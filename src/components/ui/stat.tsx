import type { ReactNode } from "react";
import { cx } from "./class-names";
import { CountUp, type Figure } from "./count-up";

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

/**
 * The figure COUNTS UP once when it first appears (Wave 5): a number `value`
 * on its own, an amount when the caller names it with `figure`. What is
 * printed at rest is still `value`, character for character.
 */
export function Stat({
  label,
  value,
  /** The quiet half — "of 42", "this month". */
  note,
  tone,
  figure,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ok" | "warn" | "danger";
  /** What `value` prints, as a figure to count up to: `{ amount, currency }`
   *  for money (the API's decimal string, never a number). A number `value`
   *  needs none. */
  figure?: Figure;
}) {
  const shown =
    figure !== undefined ? (
      <CountUp figure={figure} {...(typeof value === "string" ? { final: value } : {})} />
    ) : typeof value === "number" ? (
      <CountUp figure={{ count: value }} final={String(value)} />
    ) : (
      value
    );
  return (
    <div>
      <dt>{label}</dt>
      <dd {...(tone === undefined ? {} : { "data-tone": tone })}>
        {shown}
        {note !== undefined && <small>{note}</small>}
      </dd>
    </div>
  );
}
