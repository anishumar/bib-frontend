"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@/components/ui";
import type { ButtonProps } from "@/components/ui";

/**
 * A SECOND PRESS BEFORE AN ACT THAT CANNOT BE TAKEN BACK (V1.3).
 *
 * Issuing an invoice, cancelling one, sending or withdrawing a letter, marking
 * a client's answer, archiving a client, ending an assignment, revoking
 * access, finishing a step: each was one click, and only "Delete a mistake"
 * asked first. This is that pattern (`delete-mistake.tsx`) made shared: the
 * first press says in plain words what will happen, and only the second press
 * does it.
 *
 * ── A DIALOG, NOT A SWAP IN PLACE ──────────────────────────────────────────
 *
 * DeleteMistake replaces its button with the warning because it owns a whole
 * card. These buttons sit in page headers, table rows, menus and dense
 * clusters, where a warning swapped in would push the row apart. So the
 * confirmation is the native `<dialog>` (`Dialog`), which already owns the
 * focus trap, Escape and the inert page behind it. (The lead's stage select
 * keeps its own in-place panel, because closing a lead as lost also asks why.)
 *
 * ── THE PAGE'S HANDLER RUNS ONLY AFTER THE SECOND PRESS ────────────────────
 *
 * `onConfirm` is the page's own handler, unchanged: its busy state, its error
 * notice and its reload stay where they were. The dialog closes FIRST and then
 * calls it, so an error notice the page shows is not behind an open modal.
 * "Go back", Escape and a click outside send nothing at all.
 *
 * ── KEYBOARD AND FOCUS ─────────────────────────────────────────────────────
 *
 * Opening puts focus on "Go back", the safe answer: a held Enter or a
 * double-click on the trigger cannot land on the confirming button. Closing
 * puts focus back where it came from (the dialog is unmounted, which leaves
 * focus on `<body>` otherwise); from a menu that has closed, on the menu's own
 * button.
 */
export interface ConfirmDialogProps {
  open: boolean;
  /** Closed without confirming: "Go back", Escape or a click outside. */
  onClose: () => void;
  /** The question, e.g. "Issue INV/2026-27/0004?" */
  title: ReactNode;
  /** What will happen, in plain words. One or two sentences. */
  consequence: ReactNode;
  /** The confirming button, e.g. "Issue it". */
  confirmLabel: string;
  /** Red confirming button for an act that removes or voids something. */
  destructive?: boolean;
  /** The page's own handler. Runs after the dialog has closed. */
  onConfirm: () => void;
  /** Where focus goes back to when the dialog closes. */
  returnFocusTo: HTMLElement | null;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  consequence,
  confirmLabel,
  destructive = false,
  onConfirm,
  returnFocusTo,
}: ConfirmDialogProps) {
  const back = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Held from the moment it opens: a page that keeps the target in the same
  // state as `open` clears both at once when it closes.
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      target.current = returnFocusTo;
      // The Dialog's own effect has already called showModal() (a child's
      // effects run first), so the button is focusable now.
      back.current?.focus();
    } else if (wasOpen.current) {
      restoreFocus(target.current);
    }
    wasOpen.current = open;
    // Only the open/closed edge; `returnFocusTo` is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={title} footer={
      <>
        <Button ref={back} variant="ghost" onClick={onClose}>
          Go back
        </Button>
        <Button
          variant={destructive ? "destructive" : "primary"}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </>
    }>
      <div className="stack tight">{consequence}</div>
    </Dialog>
  );
}

/** Only when focus was lost (it is on `<body>`), so a click elsewhere is not
 *  snatched back. Into a closed menu, the menu's own button takes it. */
function restoreFocus(to: HTMLElement | null): void {
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  if (to === null || !to.isConnected) return;
  const menu = to.closest("details");
  const target = menu !== null && !menu.open ? menu.querySelector("summary") : to;
  target?.focus();
}

export interface ConfirmActionProps extends Omit<ButtonProps, "onClick" | "ref" | "children" | "title"> {
  /** The trigger's visible label, e.g. "Issue". */
  children: ReactNode;
  title: ReactNode;
  consequence: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  /**
   * Asked before the dialog opens; false keeps it shut. A form's submit uses
   * it for `reportValidity()`, so an empty required field is pointed at
   * before anybody is asked to confirm a send that would be refused.
   */
  beforeOpen?: () => boolean;
}

/** A button that asks before it acts: the trigger plus its `ConfirmDialog`. */
export function ConfirmAction({
  children,
  title,
  consequence,
  confirmLabel,
  destructive = false,
  onConfirm,
  beforeOpen,
  ...trigger
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <Button
        {...trigger}
        ref={setOpener}
        aria-haspopup="dialog"
        onClick={() => {
          if (beforeOpen === undefined || beforeOpen()) setOpen(true);
        }}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={title}
        consequence={consequence}
        confirmLabel={confirmLabel}
        destructive={destructive}
        onConfirm={onConfirm}
        returnFocusTo={opener}
      />
    </>
  );
}
