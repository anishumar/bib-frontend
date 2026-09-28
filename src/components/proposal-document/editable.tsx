"use client";

/**
 * EDIT IN PLACE (D10) — one piece of the proposal document, written where it
 * is read.
 *
 * The piece reads as the document reads. A pencil shows on hover and whenever
 * the pencil itself has keyboard focus (and always on a screen with no hover,
 * where it would otherwise never show). Pressing it, or clicking the piece,
 * turns the piece into a box holding its words. It saves when focus leaves the
 * box or on Ctrl/Cmd+Enter; Escape puts the words back. A refusal is shown
 * right beside the box, in the API's own words, and the box stays open with
 * what was typed in it.
 *
 * ## Why the refusal is not an `ErrorNotice`
 *
 * `ErrorNotice` takes focus when it appears (`useAppearFocus`), which is right
 * for a card whose button is out of sight. Here the refusal sits directly under
 * the box, and taking focus from the box would BLUR it, and blurring saves:
 * a refusal would fire the same save again, forever. So this is a plain
 * `role="alert"` beside the box: announced, and focus stays where the person is.
 *
 * ## Where focus goes afterwards
 *
 * Back to the pencil after a KEYBOARD exit (Ctrl+Enter, Escape), so somebody
 * working through the document by keyboard keeps their place. Never after a
 * blur: the person has clicked somewhere else on purpose, and pulling focus
 * back would undo that click.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Icon, cx } from "@/components/ui";

/** What a save answers: null when the API took it, else its sentence. */
export type SaveOutcome = string | null;

export function EditableText({
  label,
  value,
  editable,
  onSave,
  children,
  multiline = true,
  inputType = "text",
  required = false,
  maxLength,
  placeholder,
  className,
  initiallyEditing = false,
  onClose,
  actions,
}: {
  /** What this piece is, for the pencil's name ("Edit the Background") and the
   *  box's label. Plain words, the thing a person would call it. */
  label: string;
  /** The words as saved. Null or "" is an empty piece. */
  value: string | null;
  /** Whether to offer the pencil at all. */
  editable: boolean;
  /** Saves `next` (already trimmed). Resolves null when it worked. */
  onSave: (next: string) => Promise<SaveOutcome>;
  /** How the piece reads when it is not being edited. */
  children: ReactNode;
  /** A paragraph-sized box, or one line. */
  multiline?: boolean;
  /** For a one-line piece: "date" draws the browser's date picker. */
  inputType?: "text" | "date";
  /** A blank save is refused here before any request, with a sentence. */
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  /** Open with the box already showing: a NEW line being written. */
  initiallyEditing?: boolean;
  /** Told when the box closes, saved or not. */
  onClose?: () => void;
  /** More small buttons beside the pencil (striking a line off). */
  actions?: ReactNode;
}) {
  const [editing, setEditing] = useState(initiallyEditing);
  const [draft, setDraft] = useState(initiallyEditing ? (value ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  /** Set by a keyboard exit, read once the pencil is back. */
  const refocus = useRef(false);
  /** A save already under way: a blur arriving while Ctrl+Enter is saving
   *  must not send it twice. */
  const saving = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      // Only if focus was LOST with the box (React parks it on <body>): if the
      // person has already moved on to another piece, it stays there.
      const active = document.activeElement;
      if (active === null || active === document.body) pencil.current?.focus();
    }
  }, [editing]);

  // The box opens at the height of what it holds, and grows as it is typed in,
  // so a long exclusion is never read through a two-line slot.
  useLayoutEffect(() => {
    const el = box.current;
    if (!editing || !multiline || el === null) return;
    el.style.height = "auto";
    el.style.height = `${String(el.scrollHeight + 2)}px`;
  }, [editing, multiline, draft]);

  function open(): void {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel(byKeyboard: boolean): void {
    refocus.current = byKeyboard;
    setError(null);
    setEditing(false);
    onClose?.();
  }

  async function save(byKeyboard: boolean): Promise<void> {
    if (saving.current) return;
    const next = draft.trim();
    // Nothing changed: closing is all there is to do. Not a request, and not
    // an "edited" mark on a line nobody changed.
    if (next === (value ?? "").trim()) {
      cancel(byKeyboard);
      return;
    }
    if (required && next === "") {
      setError(`${label} cannot be empty. Press Escape to keep what it said.`);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    const outcome = await onSave(next);
    saving.current = false;
    setBusy(false);
    if (outcome !== null) {
      setError(outcome);
      return;
    }
    refocus.current = byKeyboard;
    setEditing(false);
    onClose?.();
  }

  if (!editable) return <div className={className}>{children}</div>;

  if (editing) {
    const shared = {
      ref: box,
      value: draft,
      autoFocus: true,
      disabled: busy,
      "aria-label": label,
      "aria-invalid": error !== null,
      maxLength,
      placeholder,
      onChange: (e: { target: { value: string } }) => {
        setDraft(e.target.value);
      },
      onBlur: () => {
        void save(false);
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel(true);
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void save(true);
        } else if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          void save(true);
        }
      },
    };
    const boxClass = "block w-full rounded-sm border border-brand bg-surface px-3 py-2 text-ink outline-none";
    return (
      <div className={cx("relative", className)}>
        {multiline ? (
          <textarea {...shared} rows={2} className={cx(boxClass, "resize-none leading-relaxed")} />
        ) : (
          <input {...shared} type={inputType} className={boxClass} />
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span role="status">
            {busy
              ? "Saving…"
              : multiline
                ? "Saves when you click away or press Ctrl+Enter. Esc keeps what it said."
                : "Saves when you click away or press Enter. Esc keeps what it said."}
          </span>
          {/* On mouse DOWN, not click: a click would blur the box first, and
              blurring saves. */}
          <button
            type="button"
            className="text-xs text-brand underline"
            onMouseDown={(e) => {
              e.preventDefault();
              cancel(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <EditablePieceShell
      className={cx("cursor-text", className)}
      onOpen={open}
      pencilRef={pencil}
      pencilLabel={`Edit ${label}`}
      actions={actions}
    >
      {children}
    </EditablePieceShell>
  );
}

/** The small square buttons beside a piece: shown on hover, on their own
 *  keyboard focus, and always where there is no hover. */
export const PIECE_BUTTON = cx(
  "flex h-8 w-8 items-center justify-center rounded-sm text-muted",
  "opacity-0 transition-opacity hover:bg-surface",
  "group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
);

/**
 * A piece as it reads, with its buttons at its top-right INSIDE its own box:
 * the text keeps clear of them, so nothing sits over the words and nothing
 * hangs off the page's edge.
 */
export function EditablePieceShell({
  className,
  onOpen,
  pencilRef,
  pencilLabel,
  actions,
  children,
}: {
  className?: string;
  onOpen: () => void;
  pencilRef: Ref<HTMLButtonElement>;
  pencilLabel: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "group relative -mx-2 rounded-sm px-2 transition-colors hover:bg-surface-hover",
        actions === undefined ? "pr-12" : "pr-[calc(var(--s-7)+var(--s-5))]",
        className,
      )}
      onClick={(e) => {
        // A link or a button inside the piece keeps its own click.
        if ((e.target as HTMLElement).closest("a, button") === null) onOpen();
      }}
    >
      {children}
      <div className="absolute right-1 top-0 flex items-center gap-1">
        {actions}
        <button
          ref={pencilRef}
          type="button"
          aria-label={pencilLabel}
          title={pencilLabel}
          onClick={onOpen}
          className={cx(PIECE_BUTTON, "hover:text-brand")}
        >
          <Icon name="pencil" size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * The same, for a piece chosen from a list — who the proposal is prepared for,
 * who prepared it. It saves the moment a choice is made; Escape or leaving it
 * closes it unchanged.
 */
export function EditableChoice({
  label,
  value,
  options,
  editable,
  onSave,
  children,
  className,
  initiallyEditing = false,
  onClose,
}: {
  label: string;
  /** The chosen option's value; "" is the empty choice. */
  value: string;
  options: readonly { value: string; label: string }[];
  editable: boolean;
  onSave: (next: string) => Promise<SaveOutcome>;
  children: ReactNode;
  className?: string;
  /** Open with the list already showing: a popover on the PDF (2026-09-28). */
  initiallyEditing?: boolean;
  /** Told when the list closes, chosen or not. */
  onClose?: () => void;
}) {
  const [editing, setEditingState] = useState(initiallyEditing);
  const setEditing = (next: boolean): void => {
    setEditingState(next);
    if (!next) onClose?.();
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      // Only if focus was LOST with the box (React parks it on <body>): if the
      // person has already moved on to another piece, it stays there.
      const active = document.activeElement;
      if (active === null || active === document.body) pencil.current?.focus();
    }
  }, [editing]);

  if (!editable) return <div className={className}>{children}</div>;

  if (editing) {
    return (
      <div className={className}>
        <select
          autoFocus
          aria-label={label}
          aria-invalid={error !== null}
          disabled={busy}
          defaultValue={value}
          className="block w-full rounded-sm border border-brand bg-surface px-3 py-2 text-ink outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              refocus.current = true;
              setError(null);
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (!busy && error === null) setEditing(false);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setBusy(true);
            setError(null);
            void onSave(next).then((outcome) => {
              setBusy(false);
              if (outcome !== null) {
                setError(outcome);
                return;
              }
              refocus.current = true;
              setEditing(false);
            });
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p role="status" className="mt-1 text-xs text-muted">
          {busy ? "Saving…" : "Saves as soon as you choose. Esc keeps it as it is."}
        </p>
        {error !== null && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <EditablePieceShell
      className={cx("cursor-pointer", className)}
      onOpen={() => {
        setError(null);
        setEditing(true);
      }}
      pencilRef={pencil}
      pencilLabel={`Change ${label}`}
    >
      {children}
    </EditablePieceShell>
  );
}
