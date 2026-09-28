"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChartTable, ChartTip, clampLeft, tipWidth, useChartBox, useSettled } from "./frame";
import { onAxis, textWidth, unitsFor } from "./scale";

/** One point of a series: a month, most often. */
export interface AreaPoint {
  readonly key: string;
  /** Its full name, for the tooltip and the table: "September 2026". */
  readonly label: string;
  /** Its name on the axis: "Sep". */
  readonly tick: string;
  /** A decimal STRING, never a number. */
  readonly value: string;
  /** `value` printed: `formatMoney(value, currency)`. */
  readonly text: string;
}

const TICK = "400 14px";
const TOP = 30;
const X_AXIS = 26;

/**
 * A smooth path through the points that never overshoots them (Fritsch and
 * Carlson's monotone cubic): between two months the line stays between their
 * two values, so a month of nothing never dips the curve below zero.
 */
function monotonePath(xs: readonly number[], ys: readonly number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  const at = (i: number): [number, number] => [xs[i] ?? 0, ys[i] ?? 0];
  if (n === 1) return `M${String(at(0)[0])},${String(at(0)[1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    dx.push(x1 - x0);
    m.push((y1 - y0) / (x1 - x0));
  }
  const t: number[] = new Array<number>(n).fill(0);
  t[0] = m[0] ?? 0;
  t[n - 1] = m[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = m[i - 1] ?? 0;
    const b = m[i] ?? 0;
    t[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const s = m[i] ?? 0;
    if (s === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = (t[i] ?? 0) / s;
    const b = (t[i + 1] ?? 0) / s;
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      t[i] = tau * a * s;
      t[i + 1] = tau * b * s;
    }
  }
  let d = `M${String(at(0)[0])},${String(at(0)[1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    const third = (dx[i] ?? 0) / 3;
    d += `C${String(x0 + third)},${String(y0 + (t[i] ?? 0) * third)} ${String(x1 - third)},${String(
      y1 - (t[i + 1] ?? 0) * third,
    )} ${String(x1)},${String(y1)}`;
  }
  return d;
}

/**
 * One series over time, in shadcn's area-chart look, drawn as plain SVG with
 * no library: a 2px monotone line, a wash of the series colour under it fading
 * to nothing, a dot on the last point with its value, horizontal grid lines
 * and a few round ticks. `line` drops the wash.
 *
 * One series per chart, in `--chart-1`. Several series in several currencies
 * are several charts (small multiples), because they cannot share an axis.
 *
 * The pointer snaps a crosshair to the nearest point; each point is also a
 * keyboard stop, arrow keys between them, with the same tooltip. It reveals
 * itself once from the left, never under reduced motion, and its numbers are
 * one click away as a table.
 */
export function AreaChart({
  points,
  label,
  tickText,
  line = false,
  height = 180,
  columns,
}: {
  points: readonly AreaPoint[];
  /** The chart's name for a screen reader, usually its card's title. */
  label: string;
  /** The value axis's tick labels, e.g. `axisMoney`. */
  tickText?: (value: string) => string;
  /** A line only, with no wash under it. */
  line?: boolean;
  height?: number;
  /** The table view's two headings. */
  columns: readonly [string, string];
}) {
  const [ref, { width, font }] = useChartBox();
  const settled = useSettled();
  const [active, setActive] = useState<number | null>(null);
  const marks = useRef<(SVGCircleElement | null)[]>([]);
  const gradient = `chart-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const numbers = unitsFor(points.map((p) => p.value));

  function onKey(event: KeyboardEvent, i: number): void {
    const next =
      event.key === "ArrowRight"
        ? i + 1
        : event.key === "ArrowLeft"
          ? i - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : null;
    if (next === null || next < 0 || next >= points.length) return;
    event.preventDefault();
    marks.current[next]?.focus();
  }

  let drawing = null;
  if (numbers !== null && width > 0 && points.length > 0) {
    const { units, axis, tick } = numbers;
    const family = `${TICK} ${font}`;
    const ticks = axis.ticks.map((t) => ({ t, text: tickText === undefined ? "" : tickText(tick(t)) }));
    const gutter =
      tickText === undefined ? 0 : Math.ceil(Math.max(...ticks.map((t) => textWidth(t.text, family)))) + 12;
    // Room on the right for the end dot, and for the first and last month's
    // names to sit under their points.
    const right = 8;
    const plotW = Math.max(0, width - gutter - right);
    const plotH = height - TOP - X_AXIS;
    const baseY = TOP + plotH;
    const yOf = (pm: number): number => baseY - (pm / 1000) * plotH;
    const zeroY = yOf(onAxis(BigInt(0), axis));
    const n = points.length;
    const xs = points.map((_, i) => gutter + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)));
    const ys = units.map((u) => yOf(onAxis(u, axis)));
    const path = monotonePath(xs, ys);
    const lastX = xs[n - 1] ?? 0;
    const lastY = ys[n - 1] ?? 0;
    const firstX = xs[0] ?? 0;

    // Month names that fit: every k-th, counted back from the last, so the
    // latest month is always named.
    const tickW = Math.max(...points.map((p) => textWidth(p.tick, family))) + 12;
    const spacing = n === 1 ? plotW : plotW / (n - 1);
    const every = Math.max(1, Math.ceil(tickW / Math.max(1, spacing)));
    const named = points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => (n - 1 - i) % every === 0);

    const pick = (event: PointerEvent<SVGSVGElement>): void => {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.left;
      const i = n === 1 ? 0 : Math.round(((x - gutter) / Math.max(1, plotW)) * (n - 1));
      setActive(Math.max(0, Math.min(n - 1, i)));
    };

    const tip = active === null ? null : { p: points[active], x: xs[active] ?? 0, y: ys[active] ?? 0 };
    const lastText = points[n - 1]?.text ?? "";

    drawing = (
      <>
        <svg
          className="chart-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          role="group"
          aria-label={label}
          onPointerMove={pick}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="chart-fill-stop" data-at="top" />
              <stop offset="100%" className="chart-fill-stop" data-at="bottom" />
            </linearGradient>
          </defs>
          {ticks.map(({ t }) => {
            const y = Math.round(yOf(onAxis(t, axis))) + 0.5;
            return <line key={t.toString()} className="chart-grid" x1={gutter} x2={width} y1={y} y2={y} />;
          })}
          <g className="chart-reveal">
            {!line && n > 1 && (
              <path
                className="chart-area"
                fill={`url(#${gradient})`}
                d={`${path}L${String(lastX)},${String(zeroY)}L${String(firstX)},${String(zeroY)}Z`}
              />
            )}
            {n > 1 && <path className="chart-line" d={path} />}
            <circle className="chart-dot" cx={lastX} cy={lastY} r={4} />
          </g>
          {tip !== null && (
            <g className="chart-cross" aria-hidden="true">
              <line x1={Math.round(tip.x) + 0.5} x2={Math.round(tip.x) + 0.5} y1={TOP - 8} y2={baseY} />
              <circle className="chart-dot" cx={tip.x} cy={tip.y} r={4} />
            </g>
          )}
          {points.map((p, i) => (
            <circle
              key={p.key}
              ref={(el) => {
                marks.current[i] = el;
              }}
              className="chart-point"
              cx={xs[i]}
              cy={ys[i]}
              r={10}
              tabIndex={i === (active ?? n - 1) ? 0 : -1}
              role="img"
              aria-label={`${p.label}: ${p.text}`}
              onFocus={() => {
                setActive(i);
              }}
              onBlur={() => {
                setActive(null);
              }}
              onKeyDown={(e) => {
                onKey(e, i);
              }}
            />
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
        {named.map(({ p, i }) => {
          const w = textWidth(p.tick, family);
          return (
            <span
              key={p.key}
              className="chart-tick chart-tick-x"
              style={{ left: clampLeft(xs[i] ?? 0, w, width), top: baseY + 6 }}
              aria-hidden="true"
            >
              {p.tick}
            </span>
          );
        })}
        {tip === null && (
          <span
            className="chart-value chart-value-last"
            style={{ left: Math.max(textWidth(lastText, `600 14px ${font}`), lastX), top: lastY - 10 }}
            aria-hidden="true"
          >
            {lastText}
          </span>
        )}
        {tip !== null && tip.p !== undefined && (
          <ChartTip
            value={tip.p.text}
            label={tip.p.label}
            left={
              tip.x + 14 + tipWidth(font, [tip.p.text, tip.p.label]) <= width
                ? tip.x + 14
                : Math.max(0, tip.x - 14 - tipWidth(font, [tip.p.text, tip.p.label]))
            }
            top={TOP - 8}
          />
        )}
      </>
    );
  }

  return (
    <div className="chart" data-settled={settled ? "true" : undefined}>
      <div
        ref={ref}
        className="chart-plot"
        style={{ minHeight: height }}
        onPointerLeave={() => {
          setActive(null);
        }}
      >
        {drawing}
      </div>
      <ChartTable
        columns={columns}
        rows={points.map((p) => ({ key: p.key, cells: [p.label, p.text] }))}
      />
    </div>
  );
}
