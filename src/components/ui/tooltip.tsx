import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * A hint on hover or focus.
 *
 * It must never carry anything that is not also available another way. A
 * tooltip is invisible to touch and unreliable with assistive technology, so
 * what it says has to be a NICETY — the full timestamp behind a relative date,
 * the hash behind a truncated one. A rule, a refusal or an instruction goes on
 * the page.
 */
export function Tooltip({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("tooltip", className)}>
      {children}
      <span className="tooltip-text" role="tooltip">
        {text}
      </span>
    </span>
  );
}
