"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CalendarRow } from "@/lib/api/client";
import { Icon } from "@/components/ui/icon";
import { Calendar, CalendarDayButton } from "@/components/shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/shadcn/command";
import { ChevronDownIcon } from "@/components/shadcn/chevron";
import { browserDay, localDate, longDay } from "@/lib/day";

/**
 * The compliance calendar as a MONTH — the second way to read the Due tab.
 *
 * ── WHY THIS EXISTS BESIDE THE LIST AND DOES NOT REPLACE IT ────────────────
 *
 * The table answers "what is owed", in the order work has to start, and it is
 * correct and it stays. What it cannot show is SHAPE, and shape is the other
 * question a compliance lead actually has: not what is owed but WHICH WEEK OF
 * THIS MONTH IS GOING TO HURT. Twelve filings sorted by date is a scroll; the
 * same twelve on a grid is a picture of the 15th with six on it.
 *
 * So the Due tab carries both, and the reader picks. Neither is a summary of
 * the other — they are two questions.
 *
 * ── WHAT IT INHERITS FROM THE SCREEN AROUND IT ─────────────────────────────
 *
 * `rows` arrives ALREADY FILTERED by the page: "include filed and resolved"
 * and the authority picker belong to the whole Due tab and apply to both
 * views. Duplicating them here would let the list and the grid disagree about
 * what they are showing, which is the one thing two views of one dataset must
 * never do.
 *
 * What is local is what only a grid needs: which of the two dates lays the
 * month out, and a company filter, which the list does not have.
 *
 * ── EVERYTHING THAT MAKES `/calendar` CORRECT IS STILL TRUE ────────────────
 *
 * READ-ONLY — no "add a filing", for the reason at the top of `page.tsx`.
 * BOTH DATES on every row: `internalTargetOn` is when work must START and is
 * the default axis because it is the actionable one; `statutoryDueOn` is what
 * the law says. UNCONFIRMED RULES stay marked.
 *
 * ── AND IT CARRIES ITS OWN `data-tw` ───────────────────────────────────────
 *
 * This is a Tailwind island inside a screen that has not been migrated, so it
 * cannot rely on `<Page>` from `@/components/tw` to opt it in. Without the
 * attribute the scoped preflight never reaches it and every button here keeps
 * the browser's own grey chrome — see the header of `tailwind.css`.
 */

// ── Dates ──────────────────────────────────────────────────────────────────
//
// THE ONE RULE THIS SCREEN COULD MOST EASILY BREAK. A `YYYY-MM-DD` from the
// API is a CALENDAR DAY — a statutory deadline — and it has no time and no
// zone. `new Date("2026-09-20")` parses it as UTC midnight, which prints as
// the 19th anywhere west of Greenwich and moves a filing deadline by a day.
//
// So: to PRINT a stored day, split the string and never build a Date at all.
// To do grid ARITHMETIC, build a LOCAL date with the numeric constructor —
// `new Date(y, m - 1, d)` is local midnight and reads back the same day.
// Those two functions look interchangeable and are not.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A local Date -> `YYYY-MM-DD`, reading the local fields back out. */
function dayKey(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first of the month a given day falls in, as a local Date. */
function firstOfMonth(day: string): Date {
  const d = localDate(day);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * WHAT DAY IT IS, READ AS EXTERNAL STATE — and it has to be.
 *
 * The clock is not React's. Calling `new Date()` while rendering means the
 * server answers with its own clock and zone and the browser answers with
 * another, the two HTML trees disagree, and React throws a hydration error —
 * which is exactly what this screen did on its first run, and what `/calendar`
 * did before it (T6.11). A UTC server is a different DAY from a firm in India
 * every morning, so this is not a millisecond of drift; it is the wrong date
 * on a screen whose entire subject is dates.
 *
 * So it is read through `useSyncExternalStore`, the same way the theme switch
 * reads `localStorage`: the server snapshot is `null`, because the server
 * genuinely cannot know, and the screen renders a placeholder until the
 * browser answers. The alternative — setting it in an effect — is the
 * cascading render React now warns about and this repo lints for.
 */
const subscribeNever = (): (() => void) => () => {};
const serverHasNoClock = (): null => null;

// ── Types ──────────────────────────────────────────────────────────────────

type Basis = "internal" | "statutory";

type DayLoad = { rows: CalendarRow[]; late: number };

function basisDay(row: CalendarRow, basis: Basis): string {
  return basis === "internal" ? row.internalTargetOn : row.statutoryDueOn;
}

/** Late against the date the grid is currently laid out by, so the colour on a
 *  cell always means the same thing as the axis the cell is on. */
function isLate(row: CalendarRow, basis: Basis, today: string): boolean {
  if (row.isTerminal) return false;
  return basis === "internal"
    ? row.internalTargetOn < today
    : row.statutoryDueOn < today && row.filedOn === null;
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function MonthView({
  rows,
  loaded,
}: {
  /** Already filtered by the Due tab's own controls — see the header. */
  rows: readonly CalendarRow[];
  loaded: boolean;
}) {
  const [basis, setBasis] = useState<Basis>("internal");
  const [company, setCompany] = useState<string | null>(null);

  const browserToday = useSyncExternalStore(subscribeNever, browserDay, serverHasNoClock);
  // Before the browser has answered, nothing can be late: every `x < ""` is
  // false. That is the correct thing to render on a server that does not know
  // what day it is where the reader is — not a guess at it.
  const today = browserToday ?? "";

  // The month the grid is on. Null until the clock is known, then the current
  // one, until the reader navigates — at which point their choice sticks.
  const [monthOverride, setMonthOverride] = useState<Date | null>(null);
  const month = monthOverride ?? (browserToday === null ? null : firstOfMonth(browserToday));

  const [selected, setSelected] = useState<string | null>(null);

  const companies = useMemo(
    () => [...new Set(rows.map((r) => r.entityName).filter((e): e is string => e !== null))].sort(),
    [rows],
  );

  const shown = useMemo(
    () => rows.filter((r) => company === null || r.entityName === company),
    [rows, company],
  );

  /** Every filing, bucketed by the day the grid is laid out on. */
  const byDay = useMemo(() => {
    const map = new Map<string, DayLoad>();
    for (const row of shown) {
      const key = basisDay(row, basis);
      const load = map.get(key) ?? { rows: [], late: 0 };
      load.rows.push(row);
      if (isLate(row, basis, today)) load.late += 1;
      map.set(key, load);
    }
    return map;
  }, [shown, basis, today]);

  const monthKey =
    month === null ? null : `${String(month.getFullYear())}-${pad(month.getMonth() + 1)}`;
  const monthRows = useMemo(
    () => (monthKey === null ? [] : shown.filter((r) => basisDay(r, basis).startsWith(monthKey))),
    [shown, basis, monthKey],
  );
  const monthLate = monthRows.filter((r) => isLate(r, basis, today)).length;

  const dueDays = useMemo(() => [...byDay.keys()].map(localDate), [byDay]);
  const lateDays = useMemo(
    () =>
      [...byDay.entries()]
        .filter(([, load]) => load.late > 0)
        .map(([key]) => localDate(key)),
    [byDay],
  );

  /** The day cell: the number, and under it how many filings land there.
   *  A count, not a dot — "the 15th" and "the 15th, eleven of them" are
   *  different facts and the second is the one that changes a week's plan. */
  const DayCell = useMemo(() => {
    return function DayCell(props: React.ComponentProps<typeof CalendarDayButton>) {
      const load = byDay.get(dayKey(props.day.date));
      return (
        <CalendarDayButton
          {...props}
          /* SELECTION IS A WASH, NOT A FILL, and both halves of that matter.
             shadcn fills the selected day with `bg-primary` — a saturated
             brand block. Two things wrong with it here. `--brand` is spent in
             exactly three places in this product (the mark, the sidebar, a
             screen's one committing action) and a selected date is none of
             them. And a solid maroon cell swallowed the count underneath,
             which is the one number the grid exists to show.

             `--brand-wash` on `--brand-ink` is what the sidebar already uses
             for the page you are on, so this is the product's own established
             way of saying "this is the one", and the count stays readable. */
          className="data-[selected-single=true]:bg-brand-wash data-[selected-single=true]:text-brand-ink data-[selected-single=true]:ring-1 data-[selected-single=true]:ring-brand"
        >
          {props.children}
          {load !== undefined && (
            <span className={load.late > 0 ? "text-danger" : "text-muted"}>
              {load.rows.length}
            </span>
          )}
        </CalendarDayButton>
      );
    };
  }, [byDay]);

  const selectedLoad = selected === null ? undefined : byDay.get(selected);

  return (
    /* `data-tw` opts this subtree into the scoped preflight in tailwind.css.
       The screen around it is not migrated, so nothing above supplies it. */
    <div data-tw className="flex flex-col gap-4">
      {/* Only what a GRID needs. "Include filed and resolved" and the
          authority picker are the Due tab's, and apply to the list too. */}
      <div className="flex flex-wrap items-center gap-3">
        <BasisToggle basis={basis} onChange={setBasis} />
        <Picker
          label="Company"
          value={company}
          options={companies}
          onChange={setCompany}
          allLabel="Every company"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[30rem_minmax(0,1fr)]">
        {/* ── The month ─────────────────────────────────────────────────── */}
        <section className="rounded-md border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-3">
            <h2 className="text-lg font-semibold text-ink">
              {month === null ? " " : `${MONTHS[month.getMonth()] ?? ""} ${String(month.getFullYear())}`}
            </h2>
            <p className="text-sm text-muted">
              {month === null || !loaded ? (
                "Loading the calendar…"
              ) : monthRows.length === 0 ? (
                "Nothing falls in this month"
              ) : (
                <>
                  <span className="text-ink">{monthRows.length}</span>
                  {monthRows.length === 1 ? " filing" : " filings"}
                  {monthLate > 0 && (
                    <>
                      {" · "}
                      <span className="text-danger">{monthLate} past the date</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          {month === null ? (
            /* The server does not know what day it is where the reader is, so
               it draws the shape and nothing else. Same markup on the first
               client render, which is what makes hydration agree. */
            <div
              aria-hidden="true"
              className="h-[22rem] w-full animate-pulse rounded-sm bg-surface-sunk"
            />
          ) : (
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonthOverride}
              selected={selected === null ? undefined : localDate(selected)}
              onSelect={(date) => {
                setSelected(date === undefined ? null : dayKey(date));
              }}
              showOutsideDays={false}
              className="w-full [--cell-size:--spacing(12)]"
              classNames={{
                /* TODAY, marked without spending a colour on it. shadcn fills
                   it with `bg-accent`, and this product has no neutral
                   highlight to lend that name — its accent is a STATUS. So
                   today is weight and a hairline instead: visible, and it
                   still means nothing about the filings on it. */
                today: "rounded-md font-semibold text-ink ring-1 ring-faint",
              }}
              modifiers={{ due: dueDays, late: lateDays }}
              modifiersClassNames={{
                due: "font-semibold",
                late: "text-danger",
              }}
              components={{ DayButton: DayCell }}
            />
          )}

          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
            The number under a date is how many filings land on it. Laid out by{" "}
            <span className="text-ink">
              {basis === "internal" ? "the firm’s own start date" : "the legal deadline"}
            </span>
            . Red means something on that day is already past it.
          </p>
        </section>

        {/* ── The day ───────────────────────────────────────────────────── */}
        <aside className="rounded-md border border-line bg-surface p-4">
          {selected === null ? (
            <div className="py-8 text-center">
              <Icon name="calendar" size={24} className="mx-auto mb-2 text-faint" />
              <p className="text-sm text-muted">
                Pick a day to see what is owed on it.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">{longDay(selected)}</h2>
              <p className="mb-4 text-sm text-muted">
                {selectedLoad === undefined
                  ? "Nothing is owed on this day."
                  : `${String(selectedLoad.rows.length)} ${
                      selectedLoad.rows.length === 1 ? "filing" : "filings"
                    }`}
              </p>
              <ul className="flex flex-col gap-3">
                {(selectedLoad?.rows ?? []).map((row) => (
                  <FilingCard key={row.id} row={row} basis={basis} today={today} />
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

/**
 * Which date the grid is laid out by.
 *
 * Not cosmetic. The two dates answer different questions — "when must we
 * start" and "when is the client's money at risk" — and a month view has to
 * pick one to position a filing on. Making the choice explicit is more honest
 * than picking silently, and it opens on the internal date to agree with the
 * list, which is ordered by it for the reason written on that screen.
 */
function BasisToggle({
  basis,
  onChange,
}: {
  basis: Basis;
  onChange: (b: Basis) => void;
}) {
  const options: { value: Basis; label: string }[] = [
    { value: "internal", label: "Start by" },
    { value: "statutory", label: "Legal deadline" },
  ];
  return (
    <div
      role="group"
      aria-label="Lay the month out by"
      className="inline-flex rounded-sm border border-line bg-surface-sunk p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={basis === o.value}
          onClick={() => { onChange(o.value); }}
          className={
            basis === o.value
              ? "rounded-sm bg-brand px-3 py-1.5 text-sm text-brand-on"
              : "rounded-sm px-3 py-1.5 text-sm text-muted hover:text-ink"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A searchable filter, on Popover + Command.
 *
 * This is the second thing shadcn actually buys here. A `<select>` is fine for
 * the four authorities in the demo firm and is not fine for a real one's
 * company list, where the control a person wants is "type three letters".
 */
function Picker({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm text-ink hover:bg-surface-hover"
        >
          <span className={value === null ? "text-muted" : undefined}>
            {value ?? allLabel}
          </span>
          <ChevronDownIcon className="size-4 text-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o}
                  value={o}
                  onSelect={() => { onChange(o); setOpen(false); }}
                >
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── One filing ─────────────────────────────────────────────────────────────

function FilingCard({
  row,
  basis,
  today,
}: {
  row: CalendarRow;
  basis: Basis;
  today: string;
}) {
  const lateInternally = row.internalTargetOn < today && !row.isTerminal;
  const lateLegally =
    row.statutoryDueOn < today && row.filedOn === null && !row.isTerminal;

  return (
    <li className="rounded-sm border border-line-soft bg-surface-sunk p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
          {row.authority !== null && (
            <p className="truncate text-xs text-muted">{row.authority}</p>
          )}
        </div>
        <span
          className={
            row.needsDecision
              ? "shrink-0 rounded-sm bg-danger-wash px-2 py-0.5 text-xs text-danger"
              : row.isTerminal
                ? "shrink-0 rounded-sm bg-surface px-2 py-0.5 text-xs text-muted"
                : "shrink-0 rounded-sm bg-ok-wash px-2 py-0.5 text-xs text-ok-ink"
          }
        >
          {row.stateName}
        </span>
      </div>

      <p className="mt-1 truncate text-xs text-muted">
        {row.entityName ?? "—"}
        {row.clientName !== null && row.clientName !== row.entityName && (
          <> &middot; {row.clientName}</>
        )}
      </p>

      {/* BOTH dates, always, whichever one the grid is laid out by. The one
          the grid is NOT using is the one a reader is most likely to have
          forgotten, so hiding it would be the wrong economy. */}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-faint">Start by</dt>
        <dt className="text-faint">Legal deadline</dt>
        <dd className={lateInternally ? "mono text-danger" : "mono text-ink"}>
          {row.internalTargetOn}
        </dd>
        <dd className={lateLegally ? "mono text-danger" : "mono text-ink"}>
          {row.statutoryDueOn}
          {lateLegally && " · missed"}
        </dd>
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="mono text-xs text-muted">{row.periodLabel}</span>
        {/* SHOWN, never hidden — same reason as on `/calendar`. The date came
            from a document rather than from a partner checking it against the
            statute, and the plausible-looking wrong one is the dangerous kind. */}
        {row.ruleUnconfirmed && (
          <span
            title={`Rule pack ${row.rulePack}`}
            className="rounded-sm bg-warn-wash px-2 py-0.5 text-xs text-warn"
          >
            unconfirmed rule
          </span>
        )}
        {row.workItemId !== null && (
          <Link
            href={`/work-items/${row.workItemId}`}
            className="ml-auto text-xs text-brand underline-offset-2 hover:underline"
          >
            on the board &rarr;
          </Link>
        )}
      </div>

      {basis === "statutory" && lateInternally && !lateLegally && (
        <p className="mt-2 text-xs text-warn">
          Past the firm&rsquo;s own start date, though the legal one has not arrived.
        </p>
      )}
    </li>
  );
}
