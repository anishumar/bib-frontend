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

const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A stored calendar day as the MONTH it opens, `April 2027`. Split, like
 * `longDay`, for the same reason.
 *
 * For a day that STARTS a period, which is what a rule's `effectiveFrom` is:
 * "From April 2027: the 22nd of the following month" is how a partner says a
 * law change, and "From 01 Apr 2027" reads as though the day itself mattered.
 * A day that is not the 1st does not name a month and gets `longDay` instead;
 * the caller decides, because only it knows whether the day starts anything.
 */
export function monthYear(iso: string): string {
  const [year = "", month = ""] = iso.split("-");
  return `${LONG_MONTHS[Number(month) - 1] ?? month} ${year}`;
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
  if (Number.isNaN(at.getTime())) return iso;
  // Formatted BY HAND, in the same shape as `longDay`, and not through
  // `toLocaleDateString`. Two reasons, and both showed up on screen:
  //
  //   - `{ day: "numeric" }` gives "3 Sep 2026" where `longDay` gives
  //     "03 Sep 2026", so the same kind of fact came out two widths and a
  //     column of dates went ragged.
  //   - with an `undefined` locale the ORDER is the reader's, so the same
  //     instant reads "03 Sep 2026" in London and "Sep 03, 2026" in New York
  //     — on a product that prints every other date one way.
  //
  // The parsing above is still the whole point: it is an instant, and the day
  // it fell on where the reader is, is the right one.
  return `${pad(at.getDate())} ${SHORT_MONTHS[at.getMonth()] ?? ""} ${String(at.getFullYear())}`;
}

/**
 * An INSTANT with its time of day, where the reader is, and the zone NAMED —
 * for the one kind of record where the minute matters: evidence, like a
 * client's answer to a proposal (0085). The day part is `longInstant`'s, so it
 * reads like every other date; the zone is the reader's own, said out loud,
 * because "17:02" alone means something different in every office.
 */
export function longInstantTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `${longInstant(iso)}, ${time}${zone === undefined ? "" : ` ${zone}`}`;
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

/**
 * The calendar day an INSTANT fell on, where the reader is, as `YYYY-MM-DD`.
 *
 * The bridge between the two halves of this module, and it exists because one
 * real value needs to cross: an engagement letter with no stated start begins
 * on the day it was SIGNED, and `signed_at` is a `timestamptz` while
 * `effective_from` is a `date`. The screen picks whichever it has and prints
 * both the same way, so the instant has to become a day first.
 *
 * `.slice(0, 10)` is what that was, and it is the UTC day — yesterday in India
 * for anything signed after 05:30, which is most of a working morning. This
 * reads the local fields instead, exactly as `browserDay` does for today.
 *
 * PRINT the result with `longDay`, never with `longInstant`: by the time it is
 * a day it is a day, and parsing it again would put the timezone back.
 */
export function instantDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * An instant WITH its time, where the reader is — `04 Sep 2026 19:36`.
 *
 * The audit trail is the one screen that needs the clock and not just the day:
 * "who changed this, and in what order" is the question it answers, and two
 * events on one afternoon are the same row without it.
 *
 * It was `occurredAt.slice(0, 16).replace("T", " ")`, which is `2026-09-04
 * 19:36` — the UTC clock, printed with nothing saying so. A reader in India
 * takes that for local and is five and a half hours out, which on an audit
 * trail can put an event on the wrong side of a deadline. This parses, like
 * `longInstant`, and prints the day in the same shape every other date on the
 * product uses.
 */
export function longMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${longInstant(iso)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * How many calendar days `day` is before `today`, both `YYYY-MM-DD`: 1 for
 * yesterday, 0 for today, negative for a day still to come. SPLIT and counted
 * on UTC midnights, where every day is exactly one day long, so neither the
 * reader's zone nor a clock change can move it. Pass `browserDay()` as
 * `today`: lateness counts from the reader's own calendar day.
 */
export function daysBefore(day: string, today: string): number {
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((utc(today) - utc(day)) / 86_400_000);
}
