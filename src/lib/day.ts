/**
 * Days and instants — the four functions, and why two of them look
 * interchangeable and are not.
 *
 * These existed already: `browserDay` was written out SIX times across the app
 * and `longDay` NINE, in four different versions, and six more screens skipped
 * them and used a one-liner that is a day out. One concept with ten spellings
 * is how a rule that everybody agrees with stops being followed.
 *
 * ── THE DISTINCTION THE WHOLE FILE EXISTS FOR ───────────────────────────────
 *
 * A `YYYY-MM-DD` from this API is a CALENDAR DAY. A statutory deadline, an
 * invoice's due date. It has no time and no timezone, and it is the same day
 * for everybody who reads it.
 *
 * A `...At` field is an INSTANT — one moment, which lands on different days in
 * different places, and the reader's own local day is the right one to show.
 *
 * So:
 *
 *   longDay("2026-09-20")      -> SPLIT the string. Never build a Date.
 *   longInstant("2026-09-20T…") -> PARSE it. That is the point.
 *
 * `new Date("2026-09-20")` is UTC midnight, and prints as the 19th anywhere
 * west of Greenwich. On a screen about deadlines that is a wrong date, not a
 * rounding — see the note in bib-frontend/CLAUDE.md.
 */

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * THE READER'S OWN CALENDAR DAY, `YYYY-MM-DD`.
 *
 * Never `new Date().toISOString().slice(0, 10)`, which is the UTC day: a firm
 * in India is on tomorrow's date from 00:00 to 05:30 local every single
 * morning, so a comparison against the UTC day says an invoice due yesterday
 * is not overdue yet. Six screens shipped with that one-liner and this
 * function is what they should have called.
 */
export function browserDay(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A stored calendar day, printed. SPLIT — no Date is constructed at all, which
 * is the only way to be sure the timezone cannot move it.
 */
export function longDay(iso: string): string {
  const [year = "", month = "", day = ""] = iso.split("-");
  const name = SHORT_MONTHS[Number(month) - 1] ?? month;
  return `${day} ${name} ${year}`;
}

/**
 * An INSTANT, printed as the day it fell on WHERE THE READER IS. Parsing is
 * correct here and is the whole difference from `longDay` above: "the firm
 * replied on the 3rd" should mean the 3rd where you are reading it.
 *
 * Returns the input untouched if it will not parse, rather than the string
 * "Invalid Date" — a raw value at least tells somebody what arrived.
 */
export function longInstant(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A stored calendar day as a LOCAL Date, for arithmetic only — laying out a
 * month grid, stepping a week. `new Date(y, m - 1, d)` is local midnight and
 * reads its own fields back unchanged.
 *
 * Never use the result to PRINT the day: that is `longDay`, above. This exists
 * because a calendar grid genuinely needs Date objects, and that is the only
 * reason it exists.
 */
export function localDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
