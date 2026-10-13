"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Input, useFieldWiring } from "@/components/ui";

export interface PickableClient {
  readonly id: string;
  readonly name: string;
  readonly kind: "organization" | "person";
}

/**
 * CHOOSE A CLIENT (2026-10-10): a button that reads like a select and shows
 * the client chosen, never a text box with a cursor in it once one is. A click
 * opens a panel under it: a search box at the top, and EVERY client below in a
 * list that scrolls with its bar showing. It listed the first eight and had no
 * way to reach the ninth, which a firm with two hundred clients would never
 * have found.
 *
 * Keyboard: Enter, Space or ArrowDown on the button opens it; in the search,
 * the arrows move, Enter takes the highlighted client, Escape closes and puts
 * focus back on the button.
 */
export function ClientPicker({
  clients,
  onPick,
  autoFocus,
  selected,
}: {
  clients: readonly PickableClient[];
  onPick: (client: PickableClient) => void;
  /** Open the list on arrival: nothing is chosen yet and this is the first
   *  thing to do on the page. */
  autoFocus?: boolean;
  /** The chosen client's name, shown on the button. */
  selected?: string | undefined;
}) {
  const field = useFieldWiring();
  const listId = useId();
  const [open, setOpen] = useState(autoFocus === true);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q === "" ? [...clients] : clients.filter((c) => c.name.toLowerCase().includes(q));
    // Names that START with what was typed first: "Cob" puts Cobalt Foods
    // above Acme Cobblers.
    found.sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
    return found;
  }, [clients, query]);

  // The search takes focus as the panel opens.
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  // A click anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent): void {
      if (wrap.current !== null && !wrap.current.contains(e.target as Node)) close(false);
    }
    document.addEventListener("mousedown", away);
    return () => {
      document.removeEventListener("mousedown", away);
    };
  }, [open]);

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${String(active)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close(refocus: boolean): void {
    setOpen(false);
    setQuery("");
    setActive(0);
    if (refocus) button.current?.focus();
  }

  function pick(c: PickableClient): void {
    close(true);
    onPick(c);
  }

  const activeMatch = matches[Math.min(active, matches.length - 1)];

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        id={field.id}
        aria-describedby={field.describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn("select text-left", selected === undefined && "text-muted italic")}
        onClick={() => {
          if (open) close(false);
          else setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected ?? "Choose a client"}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 rounded-md border border-line bg-surface p-2 shadow-md">
          <Input
            ref={search}
            role="combobox"
            aria-label="Search clients"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            {...(activeMatch !== undefined ? { "aria-activedescendant": `${listId}-${activeMatch.id}` } : {})}
            autoComplete="off"
            placeholder="e.g. Kaveri Foods"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (activeMatch !== undefined) pick(activeMatch);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close(true);
              }
            }}
          />
          {matches.length === 0 ? (
            <p className="m-0 px-2 pt-3 pb-1 text-sm text-muted" role="status">
              No client by that name. Choose New prospect to add them.
            </p>
          ) : (
            <>
              <ul
                ref={list}
                id={listId}
                role="listbox"
                aria-label="Clients"
                className="client-picker-list m-0 mt-2 max-h-64 list-none overflow-y-auto p-0"
              >
                {matches.map((c, i) => (
                  <li
                    key={c.id}
                    id={`${listId}-${c.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={c.name === selected}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-md",
                      i === active ? "bg-surface-hover" : undefined,
                      c.name === selected ? "font-semibold" : undefined,
                    )}
                    onMouseEnter={() => {
                      setActive(i);
                    }}
                    onClick={() => {
                      pick(c);
                    }}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.kind === "person" && <span className="text-xs text-muted">a person</span>}
                  </li>
                ))}
              </ul>
              <p className="m-0 px-2 pt-2 text-xs text-muted">
                {matches.length} {matches.length === 1 ? "client" : "clients"}
                {query.trim() === "" ? "" : " found"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
