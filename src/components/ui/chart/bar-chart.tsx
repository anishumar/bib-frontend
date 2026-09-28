"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChartTable, ChartTip, clampLeft, tipWidth, useChartBox, useSettled } from "./frame";
import { onAxis, textWidth, unitsFor } from "./scale";

/**
 * One bar: what it is called, its value as a decimal STRING (the API's, or a
 * sum made with `lib/money`), and that value as the screen prints it.
 */
export interface BarDatum {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** `value` printed: `formatMoney(value, currency)`. */
  readonly text: string;
  /** A second line in the tooltip and a column in the table, e.g. "3 invoices". */
  readonly detail?: string;
  /** A STATUS colour for this bar, where the colour means something. Without
   *  one the bar is the series colour, `--chart-1`. */
  readonly tone?: "muted" | "danger";
}

const TICK = "400 14px";
const VALUE = "600 14px";
const NAME = "400 15px";
/** Vertical: the drawing's height, and the room kept above it for values. */
const HEIGHT = 240;
const HEADROOM = 26;
/** Horizontal: one row per bar. */
const PITCH = 36;
/** The thickest a bar gets, and the least gap between two. */
const BAR = 28;
const GAP = 2;
const RADIUS = 4;

/** A bar rounded at its data end and square at the baseline. */
function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  end: "top" | "right",
): string {
  if (w <= 0 || h <= 0) return "";
  if (end === "top") {
    const r = Math.min(RADIUS, w / 2, h);
    return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
  }
  const r = Math.min(RADIUS, h / 2, w);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
}

/**
 * Bars, in shadcn's chart look, drawn as plain SVG with no library: vertical
 * (a category axis along the bottom, round value ticks up the side, horizontal
 * grid lines only) or horizontal (names down the left, largest first as the
 * caller orders them).
 *
 * The geometry is a per mille of the axis, worked out on `bigint`; every
 * figure shown is the caller's `text`. Each bar is a keyboard stop (arrow keys
 * between them) and shows the same tooltip as the pointer. It grows in once
 * from the baseline, never under reduced motion, and its numbers are one click
 * away as a table.
 */
export function BarChart({
  data,
  label,
  orientation = "vertical",
  tickText,
  columns,
  legend,
}: {
  data: readonly BarDatum[];
  /** The chart's name for a screen reader, usually its card's title. */
  label: string;
  orientation?: "vertical" | "horizontal";
  /** The value axis's tick labels (vertical only), e.g. `axisMoney`. */
  tickText?: (value: string) => string;
  /** The table view's headings: what a bar is, its value, and its detail. */
  columns: readonly string[];
  /** A key to the status colours, when the bars carry them. */
  legend?: readonly { tone: "muted" | "danger"; label: string }[];
}) {
  const [ref, { width, font }] = useChartBox();
  const settled = useSettled();
  const [active, setActive] = useState<number | null>(null);
  const marks = useRef<(SVGRectElement | null)[]>([]);
  const numbers = unitsFor(data.map((d) => d.value));
  const vertical = orientation === "vertical";

  function onKey(event: KeyboardEvent, i: number): void {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? i + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? i - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? data.length - 1
              : null;
    if (next === null || next < 0 || next >= data.length) return;
    event.preventDefault();
    marks.current[next]?.focus();
  }

  let drawing = null;
  if (numbers !== null && width > 0 && data.length > 0) {
    const { units, axis, tick } = numbers;
    const family = `${TICK} ${font}`;
    const valueFont = `${VALUE} ${font}`;
    const focusIndex = active ?? 0;

    if (vertical) {
      const ticks = axis.ticks.map((t) => ({ t, text: tickText === undefined ? "" : tickText(tick(t)) }));
      const gutter =
        tickText === undefined ? 0 : Math.ceil(Math.max(...ticks.map((t) => textWidth(t.text, family)))) + 12;
      const plotW = Math.max(0, width - gutter);
      const plotH = HEIGHT - HEADROOM;
      const slot = plotW / data.length;
      const barW = Math.max(2, Math.min(BAR, slot - GAP));
      const baseY = HEADROOM + plotH;
      const yOf = (pm: number): number => baseY - (pm / 1000) * plotH;
      const valuesFit = data.every((d) => textWidth(d.text, valueFont) + 4 <= slot);
      const bars = data.map((d, i) => {
        const cx = gutter + slot * (i + 0.5);
        const pm = onAxis(units[i] ?? BigInt(0), axis);
        const top = yOf(Math.max(pm, onAxis(BigInt(0), axis)));
        return { d, i, cx, x: cx - barW / 2, y: top, h: Math.max(0, baseY - top) };
      });
      const tip = active === null ? null : bars[active];

      drawing = (
        <>
          <svg
            className="chart-svg"
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
            role="group"
            aria-label={label}
          >
            {ticks.map(({ t }) => {
              const y = Math.round(yOf(onAxis(t, axis))) + 0.5;
              return <line key={t.toString()} className="chart-grid" x1={gutter} x2={width} y1={y} y2={y} />;
            })}
            {bars.map((b) => (
              <g key={b.d.key}>
                <rect
                  ref={(el) => {
                    marks.current[b.i] = el;
                  }}
                  className="chart-hit"
                  x={gutter + slot * b.i}
                  y={HEADROOM}
                  width={slot}
                  height={plotH}
                  tabIndex={b.i === focusIndex ? 0 : -1}
                  role="img"
                  aria-label={`${b.d.label}: ${b.d.text}${b.d.detail === undefined ? "" : `, ${b.d.detail}`}`}
                  data-active={active === b.i ? "true" : undefined}
                  onPointerEnter={() => {
                    setActive(b.i);
                  }}
                  onFocus={() => {
                    setActive(b.i);
                  }}
                  onBlur={() => {
                    setActive(null);
                  }}
                  onKeyDown={(e) => {
                    onKey(e, b.i);
                  }}
                />
                <path
                  className="chart-bar"
                  data-grow="y"
                  {...(b.d.tone === undefined ? {} : { "data-tone": b.d.tone })}
                  d={barPath(b.x, b.y, barW, b.h, "top")}
                />
              </g>
            ))}
          </svg>
          {tickText !== undefined &&
            ticks.map(({ t, text }) => (
              <span
                key={t.toString()}
                className="chart-tick chart-tick-y"
                style={{ top: yOf(onAxis(t, axis)), width: gutter - 8 }}
              >
                {text}
              </span>
            ))}
          {valuesFit &&
            bars
              .filter((b) => (units[b.i] ?? BigInt(0)) !== BigInt(0))
              .map((b) => (
              <span
                key={b.d.key}
                className="chart-value"
                style={{ left: b.cx, top: b.y - 4 }}
                aria-hidden="true"
              >
                {b.d.text}
              </span>
            ))}
          <div className="chart-cats" style={{ marginLeft: gutter }} aria-hidden="true">
            {data.map((d) => (
              <span key={d.key}>{d.label}</span>
            ))}
          </div>
          {tip !== null && tip !== undefined && (
            <ChartTip
              value={tip.d.text}
              label={tip.d.label}
              detail={tip.d.detail}
              tone={tip.d.tone}
              left={clampLeft(tip.cx, tipWidth(font, [tip.d.text, tip.d.label, tip.d.detail]), width)}
              // Above the bar while there is room; over a tall bar's top when not.
              {...(tip.y > 84 ? { top: tip.y - 8, place: "above" as const } : { top: tip.y + 8 })}
            />
          )}
        </>
      );
    } else {
      const names = Math.min(
        Math.ceil(Math.max(...data.map((d) => textWidth(d.label, `${NAME} ${font}`)))) + 16,
        Math.floor(width * 0.4),
      );
      const areaW = Math.max(0, width - names);
      const valueW = Math.ceil(Math.max(...data.map((d) => textWidth(d.text, valueFont)))) + 10;
      const longest = Math.max(12, areaW - valueW);
      const height = PITCH * data.length;
      const thick = Math.min(BAR, PITCH - GAP);
      const bars = data.map((d, i) => {
        const pm = onAxis(units[i] ?? BigInt(0), axis);
        const len = Math.max(0, (pm / 1000) * longest);
        return { d, i, y: i * PITCH + (PITCH - thick) / 2, len };
      });
      const tip = active === null ? null : bars[active];

      drawing = (
        <>
          <svg
            className="chart-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
            role="group"
            aria-label={label}
          >
            {bars.map((b) => (
              <g key={b.d.key}>
                <rect
                  ref={(el) => {
                    marks.current[b.i] = el;
                  }}
                  className="chart-hit"
                  x={0}
                  y={b.i * PITCH}
                  width={width}
                  height={PITCH}
                  tabIndex={b.i === focusIndex ? 0 : -1}
                  role="img"
                  aria-label={`${b.d.label}: ${b.d.text}${b.d.detail === undefined ? "" : `, ${b.d.detail}`}`}
                  data-active={active === b.i ? "true" : undefined}
                  onPointerEnter={() => {
                    setActive(b.i);
                  }}
                  onFocus={() => {
                    setActive(b.i);
                  }}
                  onBlur={() => {
                    setActive(null);
                  }}
                  onKeyDown={(e) => {
                    onKey(e, b.i);
                  }}
                />
                <path
                  className="chart-bar"
                  data-grow="x"
                  {...(b.d.tone === undefined ? {} : { "data-tone": b.d.tone })}
                  d={barPath(names, b.y, b.len, thick, "right")}
                />
              </g>
            ))}
          </svg>
          {bars.map((b) => (
            <span
              key={b.d.key}
              className="chart-name"
              style={{ top: b.i * PITCH, height: PITCH, width: names - 12 }}
              aria-hidden="true"
            >
              {b.d.label}
            </span>
          ))}
          {bars.map((b) => (
            <span
              key={b.d.key}
              className="chart-value chart-value-end"
              style={{ left: names + b.len + 6, top: b.i * PITCH + PITCH / 2 }}
              aria-hidden="true"
            >
              {b.d.text}
            </span>
          ))}
          {tip !== null && tip !== undefined && (
            <ChartTip
              value={tip.d.text}
              label={tip.d.label}
              detail={tip.d.detail}
              tone={tip.d.tone}
              left={clampLeft(
                names + tip.len / 2,
                tipWidth(font, [tip.d.text, tip.d.label, tip.d.detail]),
                width,
              )}
              top={tip.y + thick + 6}
            />
          )}
        </>
      );
    }
  }

  const hasDetail = data.some((d) => d.detail !== undefined);
  return (
    <div className="chart" data-settled={settled ? "true" : undefined}>
      <div
        ref={ref}
        className="chart-plot"
        style={{ minHeight: vertical ? HEIGHT : PITCH * data.length }}
        onPointerLeave={() => {
          setActive(null);
        }}
      >
        {drawing}
      </div>
      {legend !== undefined && (
        <ul className="chart-legend">
          {legend.map((l) => (
            <li key={l.tone}>
              <span className="chart-swatch" data-tone={l.tone} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <ChartTable
        columns={hasDetail ? columns : columns.slice(0, 2)}
        rows={data.map((d) => ({
          key: d.key,
          cells: hasDetail ? [d.label, d.text, d.detail ?? ""] : [d.label, d.text],
        }))}
      />
    </div>
  );
}
