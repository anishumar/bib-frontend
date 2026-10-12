"use client";

/**
 * A COMPOSE PANEL, docked bottom right (2026-10-13): Gmail's "New Message".
 * The user asked for sending a proposal to work that way rather than as a form
 * at the foot of a long page.
 *
 * It is NOT modal, on purpose: the page behind it stays readable and usable,
 * so somebody can scroll the PDF to check a figure while the email is half
 * written. That is the difference from `<Dialog>`, which owns the page until
 * it closes. So it is a `role="dialog"` with `aria-modal="false"`, Escape
 * closes it, focus goes into it when it opens and back to whatever opened it
 * when it closes.
 *
 * Minimised, it is its title bar alone, still on screen, so a half-written
 * message is never lost by getting it out of the way. Below 40rem it takes the
 * width of the window.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { cx } from "./class-names";

export function Compose({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const [small, setSmall] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // Into it on opening, back to the opener on closing.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-compose-chrome])")?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cx("compose", small && "compose-small")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="compose-head">
        <h2 id={titleId} className="compose-title">
          {title}
        </h2>
        <button
          type="button"
          data-compose-chrome=""
          className="compose-chrome"
          aria-label={small ? `Open ${title}` : `Minimise ${title}`}
          aria-expanded={!small}
          onClick={() => {
            setSmall((s) => !s);
          }}
        >
          <Icon name="chevronDown" size={18} {...(small ? { className: "rotate-180" } : {})} />
        </button>
        <button
          type="button"
          data-compose-chrome=""
          className="compose-chrome"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      {!small && <div className="compose-body">{children}</div>}
    </div>
  );
}
