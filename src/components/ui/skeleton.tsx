import { cx } from "./class-names";

/**
 * A placeholder the size of what is coming.
 *
 * Sized by the caller in `ch` or `rem` so it occupies roughly what the real
 * content will — that is the whole job. A skeleton that is the wrong size is
 * worse than a spinner, because the page jumps when the data lands.
 *
 * `aria-hidden`, and the region around it carries `aria-busy`: a screen reader
 * should hear "loading", once, not a description of grey rectangles.
 */
export function Skeleton({
  width = "100%",
  height = "1em",
  className,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <span
      className={cx("skeleton", className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** A few lines of placeholder text, for a card that is still loading. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className="stack tight" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height="0.9em" />
      ))}
    </span>
  );
}
