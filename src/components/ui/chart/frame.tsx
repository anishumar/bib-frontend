"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useReducedMotion } from "@/lib/reduced-motion";
import { Table, TableWrap, Td, Th } from "../table";
import { textWidth } from "./scale";

/**
 * The container's width and font, measured with a `ResizeObserver`, so the
 * drawing is laid out in real pixels at whatever width the card gives it and
 * the text is never scaled with it. Zero until the first measurement.
 */
export function useChartBox(): [RefObject<HTMLDivElement | null>, { width: number; font: string }] {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, font: "" });
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      const family = getComputedStyle(el).fontFamily;
      setBox((prev) => (prev.width === width && prev.font === family ? prev : { width, font: family }));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, box];
}

/**
 * Whether the chart has finished its one entrance. It draws itself in ONCE,
 * on first render (about 300ms, twice `--dur`); after that nothing animates,
 * so a bar that arrives with a refetch simply appears. Under reduced motion
 * it is settled from the start.
 */
export function useSettled(): boolean {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(true);
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return settled || reduced;
}

/** The small card under the pointer or the focused mark: the value first, in
 *  bold, and what it is under it, keyed by a short line in the series colour.
 *  Plain text children, so nothing in it is ever parsed as markup. */
export function ChartTip({
  value,
  label,
  detail,
  tone,
  left,
  top,
  place = "below",
}: {
  value: string;
  label: string;
  detail?: string | undefined;
  tone?: "muted" | "danger" | undefined;
  left: number;
  top: number;
  /** Whether `top` is the card's bottom edge (above the mark) or its top. */
  place?: "above" | "below";
}) {
  return (
    <div className="chart-tip" data-place={place} style={{ left, top }} aria-hidden="true">
      <span className="chart-key" {...(tone === undefined ? {} : { "data-tone": tone })} />
      <span className="chart-tip-body">
        <strong>{value}</strong>
        <span>{label}</span>
        {detail !== undefined && <span>{detail}</span>}
      </span>
    </div>
  );
}

/** How wide `ChartTip` will be, so a chart can keep it inside its box: the
 *  widest of its lines, plus the key and the padding (`.chart-tip`). */
export function tipWidth(font: string, lines: readonly (string | undefined)[]): number {
  const widest = Math.max(
    ...lines.map((l, i) => (l === undefined ? 0 : textWidth(l, `${i === 0 ? 600 : 400} 14px ${font}`))),
  );
  return Math.ceil(widest) + 40;
}

/** Every chart's numbers as a table, one click away, so a tooltip never
 *  gates a number. */
export function ChartTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
}) {
  return (
    <details className="disclosure chart-table">
      <summary>Show as a table</summary>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <Th key={c} {...(i === 0 ? {} : { align: "right" as const })}>
                  {c}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => (
                  <Td key={i} {...(i === 0 ? {} : { align: "right" as const, className: "nowrap" })}>
                    {cell}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </details>
  );
}

/** Keep a box `width` wide inside `[0, limit]`, centred on `x` where it can be. */
export function clampLeft(x: number, width: number, limit: number): number {
  return Math.max(0, Math.min(limit - width, x - width / 2));
}
