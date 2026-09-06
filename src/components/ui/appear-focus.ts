"use client";

import { useEffect, useRef } from "react";

/**
 * Move focus to something the moment it has something to say.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * A refusal. `role="alert"` announces the sentence to a screen reader, and a
 * sighted keyboard or mouse user gets NOTHING: focus stays on the button they
 * pressed — which now looks like a button that did nothing — while the
 * explanation renders at the top of a page they are 3,000px down. Focusing the
 * notice scrolls it into view and puts the next Tab beside it.
 *
 * Measured before this existed: thirty screens rendered a refusal and THREE
 * moved focus to it, each having hand-rolled the same ref, `tabIndex={-1}` and
 * counter. It lives in one place now, and both notice vocabularies use it.
 *
 * ── WHEN IT FIRES, AND WHEN IT MUST NOT ─────────────────────────────────────
 *
 * On the message APPEARING and on it CHANGING — never on every render, which
 * would snatch focus back while somebody was typing the correction, and never
 * for a panel that is simply part of the page's resting state.
 *
 * Pressing a refused button twice re-focuses because every handler in this app
 * clears the message before it calls, so the second press is another absent →
 * present transition rather than the same string arriving twice. A handler that
 * does NOT clear first is the one case this cannot see, which is why clearing
 * is the house style rather than a nicety.
 *
 * `tabIndex={-1}` on the element is what makes it focusable without adding a
 * tab stop — the same half-fix the skip link needed. The caller owns that,
 * because the caller owns the markup.
 */
export function useAppearFocus(
  message: string | null,
  enabled = true,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const appeared = message !== null && message !== shown.current;
    shown.current = message;
    if (appeared && enabled) ref.current?.focus();
  }, [message, enabled]);

  return ref;
}
