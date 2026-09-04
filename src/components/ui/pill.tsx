import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * A status chip.
 *
 * The tones are a CLOSED SET and every one of them is defined. The stylesheet
 * this replaces had screens asking for `active` and `neutral`, neither of
 * which existed — so a live membership and a revoked one rendered identically,
 * and the roster's one visual signal said nothing.
 *
 * `code` is not a status: it is an identifier set in the mono face — a role
 * key, a service code, a jurisdiction. It is here rather than in a component
 * of its own because it is the same chip shape and it is what a screen reaches
 * for beside a real status.
 */
/**
 * `accent` was here and is deliberately GONE.
 *
 * It is shadcn's neutral hover ground under Tailwind, and this product's
 * status teal is `ok`. The two render identically — `components.css` has
 * always declared them as one rule — so nothing ever looked wrong, and the
 * wrong name spread to ten call sites and 76 elements on screen. It is a real
 * bug the moment a screen moves to `components/tw`, whose `Pill` has no
 * `accent` tone at all: the pill silently loses its colour.
 *
 * Taking it out of the union makes `tone="accent"` a compile error. The CSS
 * selector stays as a safety net for any raw `data-tone` written by hand.
 */
export type PillTone = "neutral" | "ok" | "warn" | "danger" | "quiet" | "code";

export function Pill({
  children,
  tone = "neutral",
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "className">) {
  return (
    <span {...rest} className={cx("pill", className)} data-tone={tone}>
      {children}
    </span>
  );
}
