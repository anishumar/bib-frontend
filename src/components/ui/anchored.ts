"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Put a popover panel under its button, and KEEP IT ON THE SCREEN.
 *
 * ── WHY THIS IS A SHARED HOOK AND NOT A LINE IN `Menu` ────────────────────
 *
 * It was a line in `Menu`. The notification bell drew its panel a different
 * way — a `<details>` with the panel as a plain child — and `.menu-panel` is
 * `position: fixed; inset: auto`, which pins an element at the place it WOULD
 * have been in the flow. The bell sits at the right-hand end of the top bar,
 * so a 26rem panel started at the bell and ran straight off the right edge of
 * the window: the title was cut, the rows were unreachable, and nothing
 * scrolled to them because a fixed box does not widen the page.
 *
 * One panel placed by the browser's top layer and one placed by hand is the
 * bug. So the placement lives here, both callers use it, and anything hung off
 * a button in the future gets the same behaviour for free.
 *
 * ── WHAT IT GUARANTEES ────────────────────────────────────────────────────
 *
 * The panel is under its button (above it when there is no room below and
 * there is room above), aligned to the button's near edge, and then PULLED
 * BACK inside the window on both axes — never nearer than 8px to any edge. A
 * panel wider or taller than the window lands at that margin rather than
 * half-off, which is the one case the old code could not express at all.
 *
 * It also keeps `aria-expanded` on the button in step with the popover, so a
 * screen reader is told the same thing the eye is.
 */
export function useAnchoredPanel<Button extends HTMLElement, Panel extends HTMLElement>(
  align: "left" | "right",
  /** Run when the panel OPENS — the bell loads its rows here. */
  onOpen?: () => void,
): { button: RefObject<Button | null>; panel: RefObject<Panel | null> } {
  /* THE REFS ARE THE HOOK'S OWN, not arguments. Placing the panel means
     writing to `panel.current.style`, and the React Compiler refuses to let a
     hook modify what was handed to it — correctly: a hook that writes through
     a caller's ref is a hook whose effect on the caller cannot be read from
     the call. So the caller takes them back and attaches them. */
  const button = useRef<Button>(null);
  const panel = useRef<Panel>(null);

  const place = useCallback((): void => {
    const b = button.current;
    const p = panel.current;
    if (b === null || p === null) return;

    const r = b.getBoundingClientRect();
    const gap = 4; // between the button and the panel
    const edge = 8; // the closest the panel ever comes to a window edge
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = p.offsetWidth;
    const h = p.offsetHeight;

    // Below the button; above it only when below does not fit and above does.
    const below = r.bottom + gap;
    const flipped = below + h > vh && r.top - gap - h > 0;
    const top = flipped ? r.top - gap - h : below;
    p.style.top = `${String(Math.max(edge, Math.min(top, vh - h - edge)))}px`;

    // `Math.max(edge, …)` keeps the near edge in; `Math.min(…, vw - w - edge)`
    // keeps the FAR edge in. A panel too wide for the window gets `edge`
    // from both, which is the margin, not the middle of nowhere.
    if (align === "right") {
      p.style.left = "auto";
      p.style.right = `${String(Math.min(Math.max(edge, vw - r.right), Math.max(edge, vw - w - edge)))}px`;
    } else {
      p.style.right = "auto";
      p.style.left = `${String(Math.min(Math.max(edge, r.left), Math.max(edge, vw - w - edge)))}px`;
    }
  }, [align]);

  useEffect(() => {
    const p = panel.current;
    if (p === null) return;
    const follow = (): void => {
      place();
    };
    const toggled = (event: Event): void => {
      const open = (event as ToggleEvent).newState === "open";
      button.current?.setAttribute("aria-expanded", String(open));
      if (open) {
        place();
        onOpen?.();
        // `true` — capture, so a panel over a scrolling CARD follows it too,
        // not only the window.
        window.addEventListener("scroll", follow, true);
        window.addEventListener("resize", follow);
      } else {
        window.removeEventListener("scroll", follow, true);
        window.removeEventListener("resize", follow);
      }
    };
    p.addEventListener("toggle", toggled);
    return () => {
      p.removeEventListener("toggle", toggled);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [place, onOpen]);

  return { button, panel };
}
