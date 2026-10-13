"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { Button, Pill } from "@/components/ui";

/**
 * THE HEIGHT LEFT IN THE WINDOW below `ref`'s top, less the page's own space
 * under it. The sections area takes exactly that on a wide screen and scrolls
 * inside itself, so the client's name and its buttons stay where they are
 * instead of sliding up under the top bar. Measured, not a constant, because
 * what sits above (a notice, a wrapped name) changes its top.
 *
 * `ready` is false until the element exists (the page shows Loading first).
 */
export function useFillWindow(ref: RefObject<HTMLElement | null>, ready: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ready || el === null) return;
    function measure(): void {
      if (el === null) return;
      const box = el.getBoundingClientRect();
      const top = box.top + window.scrollY;
      // The page's padding under the area: the same whatever the area's height.
      const below = document.documentElement.scrollHeight - (box.bottom + window.scrollY);
      setHeight(Math.max(320, Math.floor(window.innerHeight - top - Math.max(0, below))));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, ready]);
  return height;
}

/**
 * A form that is shown straight away while there is nothing to show instead,
 * and behind one button once there is (Wave 4: a value that is set reads as
 * the value with Change; one that is not shows its form). No disclosure
 * triangle: the reader already chose this section, so a second fold to open
 * is a click that says nothing.
 *
 * `children` gets `done` (call it once a save went through) and `cancel`, a
 * button to put beside Save, or null while the form cannot be folded away.
 */
export function FormOrButton({
  folded,
  label,
  children,
}: {
  /** True when the card already shows a value, so the form waits behind `label`. */
  folded: boolean;
  label: string;
  children: (form: { done: () => void; cancel: ReactNode }) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  if (folded && !editing) {
    return (
      <div className="card-foot">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(true);
          }}
        >
          {label}
        </Button>
      </div>
    );
  }
  const cancel = folded ? (
    <Button
      variant="ghost"
      onClick={() => {
        setEditing(false);
      }}
    >
      Cancel
    </Button>
  ) : null;
  return (
    <div className="card-foot">
      {children({
        done: () => {
          setEditing(false);
        },
        cancel,
      })}
    </div>
  );
}

/**
 * THE CLIENT PAGE, ONE SECTION AT A TIME.
 *
 * The page was ten cards stacked, about 3,300px at 1440, so a partner looking
 * for the TDS rate scrolled past the account team, advances, portal and
 * reminders to reach it. Now a grouped list sits beside the content, like a
 * settings page, and only the chosen section is drawn.
 *
 * The choice is in the URL (`?section=`), written with `history.replaceState`
 * as the work board writes its tab: a reload or a pasted link lands on the
 * same section. `#tds`, which the invoice page links to, still opens Billing.
 */
export interface ClientSection {
  readonly key: string;
  readonly label: string;
  /** A word beside the label for something that needs doing, e.g. "To do". */
  readonly flag?: string;
}

export interface ClientSectionGroup {
  readonly label: string;
  readonly items: readonly ClientSection[];
}

/** Old in-page anchors, mapped to the section that now holds them. */
const HASH_TO_SECTION: Readonly<Record<string, string>> = { tds: "billing" };

export function useClientSection(groups: readonly ClientSectionGroup[]): {
  readonly section: string;
  readonly choose: (key: string) => void;
} {
  const keys = groups.flatMap((g) => g.items.map((i) => i.key));
  const [asked, setAsked] = useState<string | null>(null);

  // Read once, after mount: the URL is the browser's, and reading it during
  // render would differ between the server's pass and the browser's.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("section");
    const fromHash = HASH_TO_SECTION[window.location.hash.slice(1)] ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable here
    setAsked(fromQuery ?? fromHash);
  }, []);

  const section = asked !== null && keys.includes(asked) ? asked : (keys[0] ?? "");

  function choose(key: string): void {
    setAsked(key);
    const q = new URLSearchParams(window.location.search);
    q.set("section", key);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }

  return { section, choose };
}

export function ClientSectionNav({
  groups,
  section,
  onChoose,
}: {
  groups: readonly ClientSectionGroup[];
  section: string;
  onChoose: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Client sections"
      // On a wide screen the area beside it has the window's height (see
      // useFillWindow), so the nav fills it and scrolls inside itself only if
      // it is the taller. `flex-nowrap` there: a capped column that may wrap
      // puts its groups in a second column, off the side.
      className="flex flex-wrap gap-x-6 gap-y-3 lg:min-h-0 lg:flex-col lg:flex-nowrap lg:gap-5 lg:overflow-y-auto lg:p-1"
    >
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          {/* A group's name is a label, not a link: small capitals, spaced
              and quiet, so it never reads as one more item beside them. */}
          <p className="m-0 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.label}</p>
          {/* Indented under its label with a rule, as the main sidebar draws
              its groups: the rule is what reads as "these belong to that". */}
          <ul className="m-0 flex list-none flex-wrap gap-1 pl-0 lg:ml-3 lg:flex-col lg:border-l lg:border-line lg:pl-2">
            {g.items.map((item) => {
              const current = item.key === section;
              return (
                <li key={item.key}>
                  {/* A real link, so it can be opened in a new tab; a plain
                      click changes the section in place. */}
                  <a
                    href={`?section=${item.key}`}
                    aria-current={current ? "page" : undefined}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      onChoose(item.key);
                    }}
                    className={
                      "flex min-h-11 items-center justify-between gap-2 rounded-sm px-3 text-md no-underline lg:min-h-9 " +
                      (current
                        ? "bg-surface-hover font-semibold text-ink"
                        : "text-ink hover:bg-surface-hover")
                    }
                  >
                    {item.label}
                    {item.flag !== undefined && <Pill tone="warn">{item.flag}</Pill>}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
