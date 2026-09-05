"use client";

import { useEffect, useRef } from "react";

/**
 * Focus for a form that REPLACES the button that opened it.
 *
 * The shape this is for is everywhere in the admin screens:
 *
 *     {editing ? <TheForm onCancel={…} /> : <Button onClick={…}>Change it</Button>}
 *
 * It reads fine and it is broken for anyone not using a mouse. The button that
 * was focused is unmounted by its own click, React has nowhere to put focus,
 * and it lands on `<body>` — measured, both ways round: pressing Enter on
 * "Change it" and pressing Enter on the form's "Cancel" both throw the user to
 * the top of the document, so the next Tab walks the whole sidebar again to get
 * back to the thing they just opened.
 *
 * `aria-expanded` is NOT the answer here, and that is worth saying because it
 * is the reflex: `aria-expanded` describes a control that is still there with
 * something now shown beneath it. These controls are gone. What is owed is
 * where focus went, not what state a missing button is in.
 *
 * Usage — two refs and one call:
 *
 *     const { panel, trigger } = useSwapFocus(editing);
 *     …
 *     {editing ? (
 *       <div ref={panel} tabIndex={-1}>…the form…</div>
 *     ) : (
 *       <Button ref={trigger} onClick={…}>Change it</Button>
 *     )}
 *
 * DESTRUCTURE IT — `ref={swap.panel}` is a lint error (`react-hooks/refs`,
 * "cannot access refs during render"): the rule cannot tell reading a ref
 * OBJECT off a container from reading its `.current`, and it is right to be
 * strict about the second.
 *
 * `tabIndex={-1}` on the panel makes it focusable by script without adding a
 * tab stop. Focus lands on the panel rather than its first field on purpose:
 * a reader then announces the form's own heading and lede before its first
 * control, which is the order somebody would read it in.
 *
 * On close, `trigger.current` is the FRESHLY MOUNTED button, not a stale node —
 * React attaches refs during commit and effects run after, so by the time this
 * looks, the ref already points at the button that came back.
 */
export function useSwapFocus(open: boolean): {
  panel: React.RefObject<HTMLDivElement | null>;
  trigger: React.RefObject<HTMLButtonElement | null>;
} {
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const was = useRef(open);

  useEffect(() => {
    if (was.current === open) return;
    const opening = open;
    was.current = open;

    // ONLY IF FOCUS WAS LOST. A mouse user who clicked "Change it" and then
    // clicked into a different card must not have it snatched back, and this
    // is exactly the condition that separates the two: React parks focus on
    // `<body>` when it unmounts the focused element, and nowhere else does it
    // end up there on its own.
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;

    if (opening) panel.current?.focus();
    else trigger.current?.focus();
  }, [open]);

  return { panel, trigger };
}
