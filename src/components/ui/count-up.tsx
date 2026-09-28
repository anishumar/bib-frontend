"use client";

import { useEffect, useRef, useState } from "react";
import { formatCount, formatMoney } from "@/lib/api/client";
import { fromScaledUnits, scaledUnits } from "@/lib/money";
import { useReducedMotion } from "@/lib/reduced-motion";

/**
 * What a headline figure IS, as opposed to how it is printed: an amount in a
 * currency (a decimal string off the wire) or a count.
 */
export type Figure =
  | { readonly amount: string; readonly currency: string }
  | { readonly count: number | string };

function rawOf(figure: Figure): string {
  return "amount" in figure ? figure.amount : String(figure.count);
}

function textOf(figure: Figure, value: string): string {
  return "amount" in figure ? formatMoney(value, figure.currency) : formatCount(value);
}

/** `--dur-count` from `tokens.css`, so the length lives with the other
 *  durations. 500ms if it cannot be read. */
function countDuration(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dur-count").trim();
  const ms = /^(\d+(?:\.\d+)?)ms$/.exec(raw);
  return ms === null ? 500 : Number(ms[1]);
}

/**
 * A headline figure that counts up from nothing ONCE, when it first appears
 * (Wave 5: "decent, not bold").
 *
 * - **Once.** On mount, never again: a refetch or a re-render shows the new
 *   value at once. A number that re-ran every time the page reloaded its data
 *   would read as the number changing.
 * - **Money never becomes a JS number, not even here.** Each frame is the
 *   amount in whole units at its own scale (`scaledUnits`, a `bigint`) times an
 *   eased per-mille step, turned back into a decimal string and printed by the
 *   same `formatMoney` as everything else, so the Indian grouping holds on every
 *   frame. The last frame IS the final text.
 * - **Nothing beside it moves.** The final text sits invisibly in the same grid
 *   cell and the counting text is laid over it, so the width is the final
 *   width from the first frame.
 * - **A screen reader hears the final value only**; the frames are hidden
 *   from it.
 * - **Reduced motion shows the final value at once.**
 *
 * `final` is what to print at rest when the caller already has it (`<Stat>`
 * passes its own `value`, so wiring the count-up in changes nothing it prints).
 */
export function CountUp({ figure, final }: { figure: Figure; final?: string }) {
  const reduced = useReducedMotion();
  const raw = rawOf(figure);
  const endText = final ?? textOf(figure, raw);

  // The figure as it is NOW, for the frames to aim at: if the value changes
  // while it is still counting, the count ends on the new value.
  const target = useRef({ figure, raw, reduced });
  useEffect(() => {
    target.current = { figure, raw, reduced };
  });

  const [frame, setFrame] = useState<string | null>(() => {
    if (reduced) return null;
    const parsed = scaledUnits(raw);
    return parsed === null ? null : textOf(figure, fromScaledUnits(BigInt(0), parsed.scale));
  });

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const duration = countDuration();
    const tick = (now: number): void => {
      const { figure: f, raw: r, reduced: still } = target.current;
      const parsed = scaledUnits(r);
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      if (still || parsed === null || t >= 1) {
        setFrame(null);
        return;
      }
      // Eased out (cubic): quick at first, settling onto the figure.
      const step = Math.round((1 - (1 - t) ** 3) * 1000);
      const units = (parsed.units * BigInt(step)) / BigInt(1000);
      setFrame(textOf(f, fromScaledUnits(units, parsed.scale)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  if (frame === null) return <span className="countup">{endText}</span>;
  return (
    <span className="countup">
      <span className="sr-only">{endText}</span>
      <span className="countup-rest" aria-hidden="true">
        {endText}
      </span>
      <span className="countup-frame" aria-hidden="true">
        {frame}
      </span>
    </span>
  );
}
