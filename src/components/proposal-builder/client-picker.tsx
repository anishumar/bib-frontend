"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui";

export interface PickableClient {
  readonly id: string;
  readonly name: string;
  readonly kind: "organization" | "person";
}

/**
 * A type-ahead over the firm's clients.
 *
 * A `<select>` of the whole book was the old control, and it had two faults:
 * a firm with four hundred clients scrolls past three hundred of them, and the
 * list opened on the FIRM ITSELF, because "10x Global" sorts above every
 * client. The caller hands this only the parties a proposal may be for, so
 * the firm's own companies are not in it at all.
 *
 * A real combobox: the arrow keys move through the matches, Enter takes the
 * highlighted one, Escape closes the list. With one match, Enter takes it, so
 * "type three letters, press Enter" chooses a client with no click at all.
 */
export function ClientPicker({
  clients,
  onPick,
  autoFocus,
}: {
  clients: readonly PickableClient[];
  onPick: (client: PickableClient) => void;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found =
      q === "" ? [...clients] : clients.filter((c) => c.name.toLowerCase().includes(q));
    // Names that START with what was typed first: "Cob" should put Cobalt
    // Foods above Acme Cobblers.
    found.sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
    return found.slice(0, 8);
  }, [clients, query]);

  const shown = open && matches.length > 0;
  const activeMatch = matches[Math.min(active, matches.length - 1)];

  function pick(c: PickableClient): void {
    setOpen(false);
    setQuery("");
    onPick(c);
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        {...(shown && activeMatch !== undefined
          ? { "aria-activedescendant": `${listId}-${activeMatch.id}` }
          : {})}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Start typing the client's name"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // After a click on an option has landed: the option takes the
          // mousedown, so the list is still there when its click arrives.
          window.setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (activeMatch !== undefined && (shown || matches.length === 1)) {
              e.preventDefault();
              pick(activeMatch);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Clients"
          className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 max-h-72 overflow-auto rounded-md border border-line bg-surface py-1 shadow-md"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-md",
                i === active ? "bg-surface-hover" : undefined,
              )}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
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
      )}
      {open && query.trim() !== "" && matches.length === 0 && (
        <p className="mt-1 text-sm text-muted" role="status">
          No client by that name. Choose New prospect to add them.
        </p>
      )}
    </div>
  );
}
