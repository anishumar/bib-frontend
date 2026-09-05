"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "./class-names";

/**
 * One set of tabs, replacing three.
 *
 * There were three implementations before this: buttons styled primary /
 * secondary on `/work-items`, the same trick inside a different wrapper on
 * `/work`, and pills carrying a tone attribute on `/calendar`. They looked
 * different from each other, and none of them was a tablist — no `role`, no
 * `aria-selected`, no arrow keys. A keyboard user tabbed through every option
 * one at a time and was told they were buttons.
 *
 * This is data-driven rather than composed, unlike `<Table>`, because every
 * tab in this product is a label and a count. When one needs more than that,
 * that is the moment to reach for composition — not before.
 *
 * The generic keeps `value` and `onChange` tied to the tab list: passing a
 * value that is not one of the tabs is a compile error, which is what the
 * three hand-rolled versions could not offer.
 *
 * `id` is REQUIRED rather than generated, and that is deliberate: it is the
 * only thing tying a tab to the panel it controls. It is also what a page
 * OWES this component: `<Tabs>` alone cannot tell whether a `<TabPanel>` was
 * rendered, so a page that draws tab content as loose siblings leaves even the
 * selected tab's `aria-controls` pointing at nothing. Generating it here would
 * mean `<TabPanel>` had to be told a value it could not see, and the failure —
 * `aria-controls` pointing at nothing — is invisible to everyone who is not
 * using a screen reader. Put `const tabs = useId()` on the page and hand it to
 * both.
 */
export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown quietly beside the label. A number, and only a number. */
  count?: number;
  /**
   * Tone the count carries WHATEVER tab is selected.
   *
   * Normally a count is quiet until its tab is current, because most tabs are
   * filters and a permanently coloured badge is noise. This is for the one that
   * is not a filter but a QUEUE — undecided client money on the compliance
   * calendar — where the whole job of the number is to be noticed from across
   * the room before anybody has clicked anything.
   *
   * Set it only when the count is non-zero: a toned zero is a firm being told
   * off for having nothing wrong.
   */
  tone?: "warn" | "danger";
}

export function Tabs<T extends string>({
  id,
  tabs,
  value,
  onChange,
  /** Names the tablist for a screen reader — "Work views", "Invoice sections". */
  label,
  className,
}: {
  /** Shared with every `<TabPanel>` this controls. Use `useId()`. */
  id: string;
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const base = id;
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Arrow keys move between tabs; Home and End jump to the ends.
   *
   * This is what `role="tablist"` PROMISES, so implementing it is not an
   * extra — a tablist that does not do it is a lie told to assistive
   * technology. Focus follows selection, which is correct for tabs whose
   * panels are already rendered.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((t) => t.value === value);
    if (index < 0) return;

    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;

    event.preventDefault();
    const target = tabs[next];
    if (target === undefined) return;
    onChange(target.value);
    // Move focus with the selection, so the next Tab key leaves the tablist
    // from where the user actually is.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${base}-${target.value}`)}`)
      ?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx("tabs", className)}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${base}-${tab.value}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            /* ONLY THE SELECTED TAB CLAIMS A PANEL. Every page here renders
               one `<TabPanel>` — the current one — so pointing the other tabs
               at `…-panel` ids that are not in the document made four of the
               six tablists in the app carry a dangling `aria-controls`. A
               reference to nothing is worse than no reference: the attribute
               promises a relationship and then breaks it, and the failure is
               invisible to anyone not using a screen reader. */
            {...(selected ? { "aria-controls": `${base}-${tab.value}-panel` } : {})}
            /* Only the selected tab is in the tab order. The arrow keys reach
               the others — that is the roving-tabindex pattern a tablist is
               required to implement. */
            tabIndex={selected ? 0 : -1}
            onClick={() => { onChange(tab.value); }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cx("count", tab.tone === undefined ? undefined : `tone-${tab.tone}`)}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel a tab controls.
 *
 * `tabsId` is the same string given to `<Tabs id>`. That pairing is what makes
 * `aria-controls` point at something real.
 */
export function TabPanel({
  tabsId,
  value,
  children,
}: {
  tabsId: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div
      id={`${tabsId}-${value}-panel`}
      role="tabpanel"
      aria-labelledby={`${tabsId}-${value}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
