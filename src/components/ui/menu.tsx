"use client";

import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * A dropdown, built on `<details>`.
 *
 * No open state, no click-outside listener, no Escape handler — the element
 * does all three, and the versions that do not use it always miss the third.
 * The one thing added here is closing after a choice, because `<details>` has
 * no concept of "a choice was made".
 *
 * For a menu of ACTIONS. A menu that picks a value is a `<Select>`, which is
 * better at it in every way that matters on a phone.
 */
export function Menu({
  trigger,
  children,
  align = "right",
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <details
      className={cx("menu", className)}
      onClick={(event) => {
        // A click on an item closes the menu; a click on the summary is the
        // element's own toggle and must be left alone.
        const el = event.currentTarget;
        if ((event.target as HTMLElement).closest(".menu-item") !== null) {
          el.open = false;
        }
      }}
    >
      <summary>{trigger}</summary>
      <div className={cx("menu-panel")} data-align={align} role="menu">
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={disabled}
      onClick={onClick}
      {...(tone === undefined ? {} : { "data-tone": tone })}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="menu-sep" />;
}
