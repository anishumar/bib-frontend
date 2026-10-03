"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * A dropdown of ACTIONS, drawn in the browser's TOP LAYER (the Popover API).
 *
 * WHY THE TOP LAYER (CA#17, audit 2026-10-03). This was a `<details>` with an
 * absolutely placed panel, and every table wrapper clips what overflows it
 * (`.tablewrap` scrolls sideways and sets `contain: layout paint`, which is
 * what keeps a wide table off the page). So "More" on the last row of Your
 * firm's Companies opened a panel cut off at the card's edge: a ~10px strip of
 * "Logo and signature" and no "Standard wording" at all. A popover sits above
 * every ancestor's overflow and containment, so it is never clipped, wherever
 * the menu is put.
 *
 * `popover="auto"` brings light dismiss and Escape from the browser. Placed
 * under its button when it opens (and kept there while the page scrolls),
 * right-aligned by default, flipped above when there is no room below.
 * Choosing an item closes it.
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
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const place = useCallback((): void => {
    const b = button.current;
    const p = panel.current;
    if (b === null || p === null) return;
    const r = b.getBoundingClientRect();
    const gap = 4;
    const below = r.bottom + gap;
    const height = p.offsetHeight;
    const flip = below + height > window.innerHeight && r.top - gap - height > 0;
    p.style.top = `${String(flip ? r.top - gap - height : below)}px`;
    if (align === "right") {
      p.style.left = "auto";
      p.style.right = `${String(Math.max(8, document.documentElement.clientWidth - r.right))}px`;
    } else {
      p.style.right = "auto";
      p.style.left = `${String(Math.max(8, r.left))}px`;
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
  }, [place]);

  return (
    <span className={cx("menu", className)}>
      <button
        ref={button}
        type="button"
        className="menu-trigger"
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded="false"
      >
        {trigger}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="menu-panel"
        data-align={align}
        role="menu"
        onClick={(event) => {
          // A click on an item closes the menu once its own handler has run.
          if ((event.target as HTMLElement).closest(".menu-item") !== null) {
            panel.current?.hidePopover();
          }
        }}
      >
        {children}
      </div>
    </span>
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
