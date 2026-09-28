/**
 * The arithmetic behind a chart, and none of it is money as a JS number.
 *
 * Values arrive as decimal strings (the API's, or sums of them made with
 * `lib/money`). They become `bigint` units on ONE scale (`commonUnits`), the
 * axis is chosen on those units, and every position a chart draws is a PER
 * MILLE of the axis (`perMille`): a whole number from 0 to 1000, which is a
 * proportion, not an amount. The only numbers that reach the SVG are pixels.
 */
import { commonUnits, fromScaledUnits, perMille } from "@/lib/money";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

/** An axis on bigint units: its two ends and the round ticks between. */
export interface Axis {
  readonly lo: bigint;
  readonly hi: bigint;
  readonly ticks: readonly bigint[];
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return a <= ZERO ? -(-a / b) : (a + b - ONE) / b;
}

/** The smallest of 1, 2 or 5 times a power of ten that is at least `rough`,
 *  and never below `floor` (one whole unit: ticks are whole amounts). */
function niceStep(rough: bigint, floor: bigint): bigint {
  if (rough <= floor) return floor;
  const power = TEN ** BigInt(rough.toString().length - 1);
  for (const m of [1, 2, 5]) {
    const step = BigInt(m) * power;
    if (step >= rough) return step;
  }
  return TEN * power;
}

/**
 * A few round ticks from zero (or below it, for a net-negative month) to just
 * above the largest value: about four intervals, each 1, 2 or 5 times a power
 * of ten.
 */
export function axisFor(values: readonly bigint[], scale: number, intervals = 4): Axis {
  const whole = TEN ** BigInt(scale);
  const max = values.reduce((a, v) => (v > a ? v : a), ZERO);
  const min = values.reduce((a, v) => (v < a ? v : a), ZERO);
  if (max === ZERO && min === ZERO) return { lo: ZERO, hi: whole, ticks: [ZERO] };
  const step = niceStep(ceilDiv(max - min, BigInt(intervals)), whole);
  const hi = ceilDiv(max, step) * step;
  const lo = min < ZERO ? -ceilDiv(-min, step) * step : ZERO;
  const ticks: bigint[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

/** Where `value` sits on the axis, 0 at `lo` to 1000 at `hi`. */
export function onAxis(value: bigint, axis: Axis): number {
  return perMille(value - axis.lo, axis.hi - axis.lo);
}

/**
 * The values of a chart on one scale, with their axis. Null when a value is
 * not a plain decimal, and then the caller draws no chart: a chart that
 * guessed would be the one place on the page a figure was wrong.
 */
export function unitsFor(
  values: readonly string[],
): { units: bigint[]; scale: number; axis: Axis; tick: (t: bigint) => string } | null {
  const common = commonUnits(values);
  if (common === null) return null;
  const axis = axisFor(common.units, common.scale);
  return {
    ...common,
    axis,
    tick: (t: bigint) => fromScaledUnits(t, common.scale),
  };
}

/**
 * An amount SHORT, for an axis: "₹1 L", "₹2.5 L", "₹50K", "₹1.2 Cr" for rupees
 * (lakhs and crores, as the firm counts); "AED 50K", "USD 1.2M" otherwise.
 * One decimal at most, worked out on the `bigint` whole units, never through a
 * JS number. Only ever for ticks: a value a person reads is `formatMoney`.
 */
export function axisMoney(amount: string, currency: string): string {
  const m = /^(-?)(\d+)/.exec(amount);
  if (m === null) return `${currency} ${amount}`;
  const sign = m[1] ?? "";
  const whole = BigInt(m[2] ?? "0");
  const units: readonly [bigint, string][] =
    currency === "INR"
      ? [
          [BigInt(10000000), " Cr"],
          [BigInt(100000), " L"],
          [BigInt(1000), "K"],
        ]
      : [
          [BigInt(1000000000), "B"],
          [BigInt(1000000), "M"],
          [BigInt(1000), "K"],
        ];
  let figure = whole.toString();
  for (const [size, suffix] of units) {
    if (whole >= size) {
      const tenths = (whole * TEN) / size;
      const rest = tenths % TEN;
      figure = `${(tenths / TEN).toString()}${rest === ZERO ? "" : `.${rest.toString()}`}${suffix}`;
      break;
    }
  }
  return currency === "INR" ? `${sign}₹${figure}` : `${sign}${currency} ${figure}`;
}

// ── Text, measured ─────────────────────────────────────────────────────────
//
// Labels are HTML laid over the drawing, so the browser sets them at the real
// type size whatever the chart's width. Where the layout needs to know how
// wide one will be (the axis gutter, whether values fit over their bars) it
// asks a canvas, in the chart's own font.

let canvas: CanvasRenderingContext2D | null | undefined;

export function textWidth(text: string, font: string): number {
  if (canvas === undefined) canvas = document.createElement("canvas").getContext("2d");
  if (canvas === null) return text.length * 8;
  canvas.font = font;
  return canvas.measureText(text).width;
}
