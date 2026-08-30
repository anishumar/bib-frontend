"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./class-names";
import { Button } from "./button";

/**
 * A modal dialog, on the native `<dialog>` element.
 *
 * The browser already owns the focus trap, the Escape key, the inert
 * background, the top layer and the backdrop. Reimplementing those in React is
 * how a modal ends up keyboard-inaccessible — the hand-rolled version is
 * always missing the same three things, and nobody notices because nobody
 * tests it with the mouse put away.
 *
 * So this component's whole job is to keep the element's open state in step
 * with a React prop, and to make sure `onClose` fires however it was closed:
 * the close button, Escape, or a click on the backdrop.
 */
export function Dialog({
  open,
  onClose,
  title,
  /** Buttons. The confirming one goes last, where the eye ends up. */
  footer,
  children,
  size,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: "lg";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    // `showModal()` rather than `show()`: only the modal form makes the rest of
    // the page inert and puts this in the top layer.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={cx("dialog", className)}
      {...(size === undefined ? {} : { "data-size": size })}
      /* Fires for Escape too, which is why closing is handled here rather than
         on the button — otherwise Escape would close the element and leave the
         React state saying it is open. */
      onClose={onClose}
      /* The backdrop is part of the dialog element, so a click that lands on
         the element itself rather than its content is a click outside. */
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 className="card-title">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer !== undefined && <div className="dialog-foot">{footer}</div>}
    </dialog>
  );
}
