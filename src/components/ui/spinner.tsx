import { cx } from "./class-names";

/**
 * A working indicator.
 *
 * Sized in `em` and coloured from `currentColor`, so it takes the type size
 * and ink of whatever it is dropped into and never needs a size prop for the
 * common case — inside a button it is button-sized, in a table cell it is
 * cell-sized.
 *
 * `aria-hidden` because a spinner is a picture of a state, not the statement
 * of one. Whatever is loading says so in words: a `<Button loading>` keeps its
 * label, and `<Loading>` has a caption. Announcing this too would read the
 * same fact twice.
 */
export function Spinner({ className }: { className?: string }) {
  return <span className={cx("spinner", className)} aria-hidden="true" />;
}
