"use client";

/**
 * EDITING ON THE PDF (2026-09-28): the pages, a popover over the page for the
 * piece clicked, and the same pieces listed in an "Edit" panel beside the pages
 * (a dialog on a narrow screen).
 *
 * The list is for the keyboard and screen readers, and for any piece the page
 * does not show (an empty Background prints nothing, so there is nothing to
 * click on). A hotspot clicked scrolls the list to its piece; a piece hovered
 * or focused in the list outlines its hotspots.
 *
 * Every editor here is the one the HTML document used (`EditableText`,
 * `EditableChoice`, `EditableFee`, `NoteList`), saving through the same
 * routes; only where it is shown changed.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Dialog, Icon, cx } from "@/components/ui";
import { PdfPages } from "./pdf-pages";
import type { PageAnchor } from "./pdf-pages";

/** One piece of the document a person may change. */
export interface Piece {
  /** The anchor key the renderer reports for it (`proposal.background`). */
  readonly key: string;
  /** What the hotspot and the popover call it: "Edit the Background". */
  readonly label: string;
  /** How it reads in the list: its words, with the pencil that opens it. */
  readonly listed: ReactNode;
  /** Its editor, already open, for the popover. `close` is called when it is
   *  done (saved, or put back). */
  readonly editor: (close: () => void) => ReactNode;
}

export interface PieceGroup {
  readonly title: string;
  readonly pieces: readonly Piece[];
  /** Anything else the group offers (adding a line). */
  readonly extra?: ReactNode;
}

export function PdfWorkspace({
  label,
  data,
  anchors,
  updating,
  groups,
  above,
  below,
}: {
  label: string;
  data: Uint8Array | null;
  anchors: readonly PageAnchor[];
  updating: boolean;
  /** Null: a document nobody may change here. No hotspots, no list. */
  groups: readonly PieceGroup[] | null;
  /** One quiet line over the pages (a missing cover). */
  above?: ReactNode;
  /** One quiet line under them (the day a draft is dated). */
  below?: ReactNode;
}) {
  const [open, setOpen] = useState<PageAnchor | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const byKey = useMemo(() => {
    const map = new Map<string, Piece>();
    for (const g of groups ?? []) for (const p of g.pieces) map.set(p.key, p);
    return map;
  }, [groups]);

  const describe = useCallback((key: string) => byKey.get(key)?.label ?? null, [byKey]);

  /** Close THIS popover only: an editor that finishes saving after another
   *  piece was clicked must not close the new one. */
  const closer = useCallback(
    (anchor: PageAnchor) => () => {
      setOpen((current) => (current === anchor ? null : current));
    },
    [],
  );

  function pick(anchor: PageAnchor): void {
    setOpen(anchor);
    setActive(anchor.key);
    const row = list.current?.querySelector<HTMLElement>(`[data-piece="${CSS.escape(anchor.key)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /** From the list: outline the piece on the page, and bring it into view. */
  function show(key: string, scroll: boolean): void {
    setActive(key);
    if (!scroll) return;
    const spot = document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(key)}"]`);
    spot?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const piece = open === null ? null : (byKey.get(open.key) ?? null);
  const editable = groups !== null;

  const listed = (
    <PieceList groups={groups ?? []} active={active} onShow={show} onLeave={() => setActive(null)} />
  );

  return (
    <div
      className={cx(
        "grid w-full items-start gap-6",
        editable ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1",
      )}
    >
      <div className="flex min-w-0 max-w-[900px] flex-col gap-3">
        {(above !== undefined || editable) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-2">{above}</div>
            {editable && (
              // On a WRAPPER: `.btn` declares its own display, and an unlayered
              // class beats the `xl:hidden` utility on the property it sets.
              <span className="xl:hidden">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDrawer(true);
                  }}
                >
                  <Icon name="pencil" size={16} /> Edit
                </Button>
              </span>
            )}
          </div>
        )}
        <PdfPages
          data={data}
          label={label}
          anchors={anchors}
          {...(editable ? { describe } : {})}
          activeKey={active}
          onPick={pick}
          onHover={(key) => {
            setActive(key ?? (open === null ? null : open.key));
          }}
          updating={updating}
          popover={
            open === null || piece === null
              ? null
              : {
                  anchor: open,
                  node: (
                    <div
                      className="flex flex-col gap-2"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") closer(open)();
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-2">{piece.label}</p>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-sm text-muted hover:bg-surface-hover"
                          aria-label="Close"
                          // The press blurs an open box first, and a blur saves:
                          // closing keeps what was typed, as clicking away does.
                          onClick={closer(open)}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                      {piece.editor(closer(open))}
                    </div>
                  ),
                }
          }
        />
        {below !== undefined && <div className="text-sm text-muted">{below}</div>}
      </div>

      {editable && (
        <aside
          ref={list}
          aria-label="Edit"
          className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto rounded-md border border-line bg-surface p-4 xl:block"
        >
          <h2 className="mb-3 text-lg font-semibold">Edit</h2>
          {listed}
        </aside>
      )}
      {editable && (
        <Dialog
          open={drawer}
          onClose={() => {
            setDrawer(false);
          }}
          title="Edit"
        >
          {listed}
        </Dialog>
      )}
    </div>
  );
}

function PieceList({
  groups,
  active,
  onShow,
  onLeave,
}: {
  groups: readonly PieceGroup[];
  active: string | null;
  onShow: (key: string, scroll: boolean) => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h3 className="text-md font-semibold text-brand-ink">{g.title}</h3>
          {g.pieces.map((p) => (
            <div
              key={p.key}
              data-piece={p.key}
              className={cx("rounded-sm", active === p.key && "bg-brand-wash/40")}
              onMouseEnter={() => {
                onShow(p.key, false);
              }}
              onMouseLeave={onLeave}
              onFocus={() => {
                onShow(p.key, true);
              }}
            >
              {p.listed}
            </div>
          ))}
          {g.extra}
        </section>
      ))}
    </div>
  );
}
