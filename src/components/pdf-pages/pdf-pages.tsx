"use client";

/**
 * THE DOCUMENT, AS THE PDF (2026-09-28): the server's PDF drawn page by page
 * on `<canvas>` with pdf.js. Every screen that shows a proposal or a letter as
 * a document draws THIS, so what a person reads, edits and sends is the one
 * layout the renderer has (see "The preview IS the PDF" in CLAUDE.md).
 *
 * - Each page is a white sheet with a soft shadow, fitted to the column's width
 *   and drawn at `devicePixelRatio`, with "Page 2 of 6" under it.
 * - A new PDF is drawn off-screen and swapped in whole: the old pages stay up
 *   until the new ones are ready, so an edit never blanks the document.
 * - Where the renderer reported an editable piece (`anchors`), an invisible
 *   hotspot sits over it: a soft outline and a pencil on hover, and a click
 *   opens that piece's editor in `popover`, under the piece.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon, Skeleton, SkeletonText, cx } from "@/components/ui";
import { OPEN_OPTIONS, loadPdfJs } from "./load";

/** Where the renderer drew one editable piece: PDF points from the page's
 *  top-left, one rectangle per page it touched. The API's `DocumentAnchor`. */
export interface PageAnchor {
  readonly key: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DrawnPage {
  readonly canvas: HTMLCanvasElement;
  /** The page's size in PDF points. */
  readonly width: number;
  readonly height: number;
}

/** A4 in points, for the skeleton before anything is drawn. */
const A4 = { width: 595.28, height: 841.89 };
/** Room around a hotspot, in CSS pixels, so a one-line piece is easy to hit. */
const PAD = 4;

export function PdfPages({
  data,
  label,
  anchors = [],
  describe,
  activeKey = null,
  onPick,
  onHover,
  updating = false,
  popover = null,
}: {
  /** The PDF's bytes. Null until the first arrives: page-shaped skeletons. */
  data: Uint8Array | null;
  /** What the pages are, for a screen reader: "Proposal PR-2026-0007". */
  label: string;
  anchors?: readonly PageAnchor[];
  /** A hotspot's name ("Edit the Background"), or null for a piece that has
   *  no editor here. No `describe` draws no hotspots at all. */
  describe?: (key: string) => string | null;
  /** The piece to show outlined: the one being edited, or hovered in the list. */
  activeKey?: string | null;
  onPick?: (anchor: PageAnchor) => void;
  onHover?: (key: string | null) => void;
  /** A new PDF is on its way: a quiet "Updating…" over the pages. */
  updating?: boolean;
  /** An editor, opened under the anchor it was picked from. */
  popover?: { anchor: PageAnchor; node: ReactNode } | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState<readonly DrawnPage[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const generation = useRef(0);

  // The column's width, followed as it changes (a drawer opening, a window
  // resized). Drawing waits for a width, so nothing is drawn at 0 then again.
  useLayoutEffect(() => {
    const el = frame.current;
    if (el === null) return;
    const measure = () => {
      setWidth(Math.floor(el.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Draw the bytes at this width. A later call wins: an earlier one still
  // drawing sees the generation move and stops, and its pages are dropped.
  useEffect(() => {
    if (data === null || width === 0) return;
    const mine = ++generation.current;
    const timer = window.setTimeout(() => {
      void draw(data, width, () => generation.current !== mine).then(
        (drawn) => {
          if (drawn === null || generation.current !== mine) return;
          setPages(drawn);
          setFailure(null);
        },
        (err: unknown) => {
          if (generation.current !== mine) return;
          setFailure(err instanceof Error ? err.message : String(err));
        },
      );
      // A resize settles before redrawing; new bytes draw at once.
    }, pages.length === 0 ? 0 : 120);
    return () => {
      window.clearTimeout(timer);
    };
    // `pages.length` only chooses the delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width]);

  const total = pages.length;
  return (
    <section aria-label={label} aria-busy={updating || total === 0} className="relative flex w-full flex-col gap-2">
      {/* Measures the width only; out of the flow, so the first page starts at
          the top of the column, level with the Edit panel. */}
      <div ref={frame} className="absolute inset-x-0 top-0" aria-hidden="true" />
      {failure !== null && total === 0 && (
        <p role="alert" className="text-sm text-danger">
          The PDF could not be drawn here: {failure}
        </p>
      )}
      {total === 0 ? (
        <PageSkeletons width={width} />
      ) : (
        pages.map((page, i) => {
          const scale = width / page.width;
          const number = i + 1;
          const here = anchors.filter((a) => a.page === number);
          const open = popover !== null && popover.anchor.page === number ? popover : null;
          return (
            <div key={number} className="flex flex-col items-center gap-2">
              <div
                className="relative bg-surface shadow-md"
                style={{ width: `${String(width)}px`, height: `${String(Math.round(page.height * scale))}px` }}
              >
                <CanvasSlot canvas={page.canvas} />
                {describe !== undefined &&
                  here.map((a, j) => (
                    <Hotspot
                      key={`${a.key}-${String(j)}`}
                      anchor={a}
                      scale={scale}
                      label={describe(a.key)}
                      active={activeKey === a.key}
                      onPick={onPick}
                      onHover={onHover}
                    />
                  ))}
                {open !== null && (
                  <PopoverAt anchor={open.anchor} scale={scale} pageWidth={width}>
                    {open.node}
                  </PopoverAt>
                )}
              </div>
              <p className="text-sm text-muted">
                Page {number} of {total}
              </p>
            </div>
          );
        })
      )}
      {updating && total > 0 && (
        <p
          role="status"
          className="pointer-events-none sticky bottom-4 mx-auto -mt-10 rounded-sm border border-line bg-surface px-3 py-1 text-sm text-ink-2 shadow-md"
        >
          Updating…
        </p>
      )}
    </section>
  );
}

/** Every page of the document, drawn to canvases off-screen at this width. */
async function draw(
  data: Uint8Array,
  width: number,
  cancelled: () => boolean,
): Promise<DrawnPage[] | null> {
  const lib = await loadPdfJs();
  // A COPY: the worker takes the buffer it is given, and the caller keeps its own.
  const task = lib.getDocument({ ...OPEN_OPTIONS, data: data.slice() });
  const pdf = await task.promise;
  try {
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const out: DrawnPage[] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      if (cancelled()) return null;
      const page = await pdf.getPage(n);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / natural.width) * ratio });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.setAttribute("aria-hidden", "true");
      await page.render({ canvas, viewport }).promise;
      out.push({ canvas, width: natural.width, height: natural.height });
      page.cleanup();
    }
    return out;
  } finally {
    void task.destroy();
  }
}

function CanvasSlot({ canvas }: { canvas: HTMLCanvasElement }) {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = slot.current;
    if (el === null) return;
    el.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={slot} className="absolute inset-0" />;
}

function Hotspot({
  anchor,
  scale,
  label,
  active,
  onPick,
  onHover,
}: {
  anchor: PageAnchor;
  scale: number;
  label: string | null;
  active: boolean;
  onPick: ((anchor: PageAnchor) => void) | undefined;
  onHover: ((key: string | null) => void) | undefined;
}) {
  if (label === null) return null;
  return (
    <button
      type="button"
      // The list beside the pages is the keyboard's way in; a hotspot per
      // piece in the tab order would be fifty stops through a document.
      tabIndex={-1}
      aria-label={label}
      title={label}
      data-anchor={anchor.key}
      className={cx(
        "group/spot absolute cursor-pointer rounded-sm border-2 border-transparent bg-transparent p-0",
        "transition-colors hover:border-brand hover:bg-brand-wash/40",
        active && "border-brand bg-brand-wash/40",
      )}
      style={{
        left: `${String(anchor.x * scale - PAD)}px`,
        top: `${String(anchor.y * scale - PAD)}px`,
        width: `${String(anchor.width * scale + PAD * 2)}px`,
        height: `${String(anchor.height * scale + PAD * 2)}px`,
      }}
      onClick={() => onPick?.(anchor)}
      onMouseEnter={() => onHover?.(anchor.key)}
      onMouseLeave={() => onHover?.(null)}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brand-on shadow-md",
          "opacity-0 transition-opacity group-hover/spot:opacity-100",
          active && "opacity-100",
        )}
      >
        <Icon name="pencil" size={14} />
      </span>
    </button>
  );
}

/**
 * An editor, under the piece it was opened from (or above it, near the foot of
 * a page), inside the page's own box so it scrolls with the page. Escape and a
 * press outside are the editor's to handle: every editor here saves on blur
 * and puts things back on Escape, and closes itself either way.
 */
function PopoverAt({
  anchor,
  scale,
  pageWidth,
  children,
}: {
  anchor: PageAnchor;
  scale: number;
  pageWidth: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = Math.min(460, pageWidth - 16);
  const left = Math.max(8, Math.min(anchor.x * scale - PAD, pageWidth - width - 8));
  const below = (anchor.y + anchor.height) * scale + PAD + 6;

  const bringIntoView = useCallback(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(bringIntoView, [bringIntoView]);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Edit this part"
      className="absolute z-20 rounded-md border border-line bg-surface p-3 text-ink shadow-md"
      style={{ left: `${String(left)}px`, top: `${String(below)}px`, width: `${String(width)}px` }}
    >
      {children}
    </div>
  );
}

function PageSkeletons({ width }: { width: number }) {
  const w = width === 0 ? 600 : width;
  const h = Math.round((w * A4.height) / A4.width);
  return (
    <>
      {[1, 2].map((n) => (
        <div
          key={n}
          aria-hidden="true"
          className="flex flex-col gap-6 bg-surface p-12 shadow-md"
          style={{ width: `${String(w)}px`, height: `${String(h)}px` }}
        >
          <Skeleton width="45%" height="1.6em" />
          <SkeletonText lines={4} />
          <Skeleton width="30%" height="1.2em" />
          <SkeletonText lines={6} />
        </div>
      ))}
    </>
  );
}
