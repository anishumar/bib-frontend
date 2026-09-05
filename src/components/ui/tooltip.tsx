"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./class-names";

/**
 * A hint on hover or focus.
 *
 * It must never carry anything that is not also available another way. A
 * tooltip is unreliable with assistive technology and it is nothing at all on
 * touch, so what it says has to be a NICETY — the full timestamp behind a
 * relative date, the hash behind a truncated one. A rule, a refusal or an
 * instruction goes on the page.
 *
 * ── IT WAS UNREACHABLE BY KEYBOARD FOR ITS WHOLE LIFE ─────────────────────
 *
 * `.tooltip:focus-within` has been in `components.css` since the component was
 * written, and it could never fire: every `<Tooltip>` in this app wraps a
 * `<Pill>` or a plain `<span>`, and nothing inside was focusable. The rule was
 * dead, the docstring promised "on hover or focus", and a keyboard user got
 * neither. Three sites lean on it for the only copy of an explanation — the
 * calendar's "unresolved service", and the two on the escalations table.
 *
 * So the CHILDREN now sit in their own focusable span. Three consequences,
 * each deliberate:
 *
 *   - **Every tooltip is a tab stop.** On `/work-items`, Escalated tab, that is
 *     56 more of them beside 56 that already existed. That cost was weighed and
 *     accepted: a stop that shows you something beats content you cannot reach.
 *   - **`aria-describedby`, not just proximity.** The text was already in the
 *     accessibility tree — it is `opacity: 0`, not hidden — so a reader met it
 *     in document order as loose words after a pill. Named as a DESCRIPTION it
 *     arrives attached to the thing it describes, which is the difference
 *     between "rank 3+ Addressed to a grade rather than one desk" and "rank 3+,
 *     button… Addressed to a grade rather than one desk".
 *   - **Escape dismisses it**, which WCAG 1.4.13 asks for and a CSS-only
 *     tooltip cannot do. Reset on blur and on leaving with the pointer, so the
 *     next visit starts clean.
 *
 * The one part of 1.4.13 NOT met is "hoverable" — `.tooltip-text` keeps
 * `pointer-events: none`, so a pointer cannot travel onto the bubble. Removing
 * that would make the bubble eat clicks aimed at whatever it floats over, and
 * on a dense table it floats over the row above. The keyboard path is what was
 * missing; this is a deliberate trade, not an oversight.
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
  const id = useId();
  const [dismissed, setDismissed] = useState(false);

  return (
    <span
      className={cx("tooltip", className)}
      {...(dismissed ? { "data-dismissed": "true" } : {})}
    >
      <span
        className="tooltip-trigger"
        /* `0`, so it is reached in reading order like everything else. A
           positive value would reorder the whole page. */
        tabIndex={0}
        aria-describedby={id}
        onKeyDown={(event) => {
          // Not `stopPropagation`: nothing else on these screens listens for
          // Escape, and swallowing it here would be a trap the day something
          // does.
          if (event.key === "Escape") setDismissed(true);
        }}
        onBlur={() => { setDismissed(false); }}
        onMouseLeave={() => { setDismissed(false); }}
      >
        {children}
      </span>
      <span className="tooltip-text" role="tooltip" id={id}>
        {text}
      </span>
    </span>
  );
}
