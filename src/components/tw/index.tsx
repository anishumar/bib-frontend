import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The Tailwind-native layout primitives — `src/components/ui` re-expressed in
 * utilities, for screens that have been migrated.
 *
 * ── WHY THIS FOLDER EXISTS AT ALL ───────────────────────────────────────────
 *
 * The first rebuilt screen (`/calendar/preview`) hand-rolled its own header,
 * its own card and its own table row. That is fine once and is a disaster
 * twenty-six times: it is how a redesign ends up with twenty-six cards that
 * are nearly the same. The point of migrating to a utility framework is not
 * that every screen writes its own padding — it is that the padding is decided
 * once, here, and screens compose.
 *
 * ── THREE RULES THAT ARE NOT STYLING ────────────────────────────────────────
 *
 * 1. `Page` CARRIES `data-tw`, and that is load-bearing. Preflight is off for
 *    the app, so a bare `<button>` keeps the browser's own grey `outset`
 *    chrome; `tailwind.css` restores a reset inside `[data-tw]` only. A screen
 *    built on these primitives therefore starts with `<Page>` or its buttons
 *    come out looking like Windows 98. See the header of `tailwind.css`.
 *
 * 2. THE HEADING LADDER IS PART OF THE API, not a detail of it. `PageHeader`
 *    gives `h1`, `Section` gives `h2` at `level={2}` and `h3` otherwise, and
 *    `CardTitle` gives `h3`. These were INVERTED once already — h3 sections
 *    wrapping h2 cards — and a screen reader's heading list is how somebody
 *    who cannot see the layout navigates a page. The `level` prop exists so
 *    the ladder is chosen rather than inherited from where a component
 *    happened to be dropped.
 *
 * 3. NOTHING HERE INVENTS A VALUE. Every colour is a token name mapped in
 *    `tailwind.css`; spacing is the 1·2·3·4·6·8·12 ladder, which is the
 *    product's `--s-1`…`--s-7` exactly. A `p-5` here is the same mistake as a
 *    `15px` in `components.css`.
 *
 * These do NOT replace `@/components/ui`. Both vocabularies are live while the
 * migration runs, and which one a screen imports says how far it has been
 * moved.
 *
 * MIXING THE TWO IS FINE AT THE COMPONENT LEVEL and not at the element level,
 * which is a narrower rule than it first looked. Dropping a `<Tabs>` or a
 * `<Button>` from `@/components/ui` inside a `<Page>` works: `.tab` and `.btn`
 * set their own padding, background and border, so the scoped reset cannot
 * reach them and their unlayered rules win as usual — checked, not assumed.
 * What does NOT work is putting a utility on an element that already carries a
 * design-system class (`className="card p-4"`), because the class is unlayered
 * and the utility is not, so the utility silently does nothing.
 */

// ── The page ───────────────────────────────────────────────────────────────

export function Page({
  children,
  width,
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "wide" | undefined;
  className?: string | undefined;
}): JSX.Element {
  return (
    <main
      data-tw
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-6 py-8",
        width === "narrow" ? "max-w-[var(--main-w-narrow)]" : "max-w-[var(--main-w)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * The one `h1` on the screen, and the sentence under it.
 *
 * `lede` is capped at `--measure` because a line of prose running the full
 * width of a 1600px monitor is measurably harder to read, and this is the one
 * paragraph on most screens somebody actually reads rather than scans.
 */
export function PageHeader({
  eyebrow,
  title,
  titleMono,
  lede,
  actions,
}: {
  eyebrow?: string | undefined;
  title: string;
  /** For a title that IS an identifier — an invoice number, a reference. It
   *  gets the mono face the rest of the product gives a figure, without the
   *  caller passing markup into a heading that has exactly one job. */
  titleMono?: boolean;
  lede?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow !== undefined && (
          <p className="mb-1 text-xs uppercase tracking-[0.11em] text-faint">{eyebrow}</p>
        )}
        <h1 className={cn("text-2xl font-semibold text-ink", titleMono === true && "mono")}>
          {title}
        </h1>
        {lede !== undefined && (
          <div className="mt-2 max-w-[var(--measure)] text-sm text-muted">{lede}</div>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled band of the page. `level={2}` for a real section under the `h1`. */
export function Section({
  title,
  lede,
  level = 3,
  count,
  actions,
  children,
}: {
  title: string;
  lede?: ReactNode;
  level?: 2 | 3;
  /** How many rows are under this heading. Two rows and twenty read the same
   *  until you scroll, and the nav already states counts this way — so a
   *  section can say its own size without the reader going to find out. */
  count?: number | undefined;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="text-lg font-semibold text-ink">
            {title}
            {count !== undefined && (
              <span className="mono ml-2 text-sm font-normal text-faint">{count}</span>
            )}
          </Heading>
          {lede !== undefined && (
            <div className="mt-1 max-w-[var(--measure)] text-sm text-muted">{lede}</div>
          )}
        </div>
        {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string | undefined;
  /** Off when the card holds a full-bleed table, which brings its own padding. */
  padded?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-surface",
        padded ? "p-6" : "overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * `level` exists because a card is sometimes a SECTION of the page rather than
 * an item within one — four cards that are the page's four subjects want `h2`,
 * and four cards inside one section want `h3`. Defaulting to `h3` keeps the
 * common case right; passing `2` is how a screen says the card is a band of
 * the page. Getting this wrong inverts the ladder, which is how somebody
 * navigating by headings loses the shape of the screen.
 */
export function CardTitle({
  children,
  level = 3,
}: {
  children: ReactNode;
  level?: 2 | 3;
}): JSX.Element {
  const Heading = level === 2 ? "h2" : "h3";
  return <Heading className="text-lg font-semibold text-ink">{children}</Heading>;
}

// ── Figures ────────────────────────────────────────────────────────────────

/**
 * A headline number.
 *
 * `value` IS A STRING AND MUST STAY ONE. Money on the wire is a decimal string
 * and the browser never does arithmetic on it — see "Money never becomes a
 * number" in CLAUDE.md. Typing this as `string` is the cheapest place to stop
 * somebody passing a `Number()`.
 *
 * `note` is where a figure explains itself. A headline that silently drops
 * what it could not count is worse than no headline, so the caller is expected
 * to say what is behind it.
 */
export function Stat({
  label,
  value,
  note,
  tone,
}: {
  /** Omitted when a heading above the figure already names it — an empty
   *  string would leave a real element in the flow and a gap under it. */
  label?: string | undefined;
  value: string;
  note?: ReactNode;
  tone?: "danger" | "warn" | "muted";
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {label !== undefined && <p className="text-sm text-muted">{label}</p>}
      <p
        className={cn(
          "mono text-2xl",
          tone === "danger"
            ? "text-danger"
            : tone === "warn"
              ? "text-warn"
              : tone === "muted"
                ? "text-muted"
                : "text-ink",
        )}
      >
        {value}
      </p>
      {note !== undefined && <div className="text-sm text-muted">{note}</div>}
    </div>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────

/**
 * The wrapper is not optional.
 *
 * `min-width: max-content` on the table is what makes this scroll instead of
 * CRUSHING the columns on a narrow viewport — the note is written out in
 * `components.css` and cost somebody a cell collapsed to thirty pixels. The
 * page body must never scroll sideways; the table does.
 */
export function TableWrap({ children }: { children: ReactNode }): JSX.Element {
  return <div className="w-full overflow-x-auto">{children}</div>;
}

export function Table({ children }: { children: ReactNode }): JSX.Element {
  return (
    <table
      className={cn(
        "w-full min-w-max border-collapse text-md",
        // THE LAST ROW DRAWS NO RULE. `components.css` has always had this and
        // the first ported table did not, which left a stray line hanging
        // under the totals of an invoice with nothing beneath it. A rule
        // separates two rows; under the last one it separates a row from
        // nothing.
        "[&_tbody_tr:last-child_td]:border-b-0",
      )}
    >
      {children}
    </table>
  );
}

/** Column heads are the product's small-caps mono, which is how a head reads
 *  as a LABEL rather than as another row of data. */
export function Th({
  children,
  align = "left",
}: {
  children?: ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      scope="col"
      className={cn(
        "mono border-b border-line px-4 py-3 text-xs font-normal uppercase tracking-[0.11em] text-faint",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  colSpan,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  /** For the row that spans the table to say something about the whole of it —
   *  an empty state, or a note under the last row. */
  colSpan?: number | undefined;
  className?: string | undefined;
}): JSX.Element {
  return (
    <td
      {...(colSpan === undefined ? {} : { colSpan })}
      className={cn(
        "border-b border-line-soft px-4 py-3 align-top text-ink",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** The second line in a cell — a qualifier, not a value. */
export function Sub({ children }: { children: ReactNode }): JSX.Element {
  return <span className="mt-0.5 block text-xs text-muted">{children}</span>;
}

// ── Small pieces ───────────────────────────────────────────────────────────

/**
 * A status chip.
 *
 * `tone` is the whole point and it is deliberately short: colour in this
 * product means STATUS and nothing else, so there is no `brand` tone here and
 * there will not be one. `neutral` is the default because most chips are
 * labels, not alarms.
 */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger";
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-sm px-2 py-0.5 text-xs",
        tone === "ok"
          ? "bg-ok-wash text-ok-ink"
          : tone === "warn"
            ? "bg-warn-wash text-warn"
            : tone === "danger"
              ? "bg-danger-wash text-danger"
              : "bg-surface-sunk text-muted",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Something the screen needs to say. `tone` follows the product's rule that
 * "held up" is `warn` and never `danger`.
 */
export function Notice({
  children,
  tone = "info",
  eyebrow,
  actions,
  role,
}: {
  children: ReactNode;
  /** `ok` is for a thing that needs doing but is nobody's FAULT — the firm
   *  asking its client for a document is the ordinary business of an
   *  engagement, and a red panel on somebody's own page is an accusation. */
  tone?: "info" | "ok" | "warn" | "danger";
  eyebrow?: string | undefined;
  /** Sits on the RIGHT, on one line with the text where there is room. A
   *  button stacked under two lines of prose costs eighty pixels and reads as
   *  a separate step from the sentence that explains it. */
  actions?: ReactNode;
  role?: "alert" | "status";
}): JSX.Element {
  return (
    <div
      {...(role === undefined ? {} : { role })}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-md border-l-2 py-3 pl-4 pr-4 text-sm",
        tone === "danger"
          ? "border-l-danger bg-danger-wash text-danger"
          : tone === "warn"
            ? "border-l-warn bg-warn-wash text-warn"
            : tone === "ok"
              ? "border-l-ok bg-ok-wash text-ok-ink"
              : "border-l-line bg-surface-sunk text-muted",
      )}
    >
      <div className="min-w-0 max-w-[var(--measure)]">
        {eyebrow !== undefined && (
          <p className="mono mb-0.5 text-xs uppercase tracking-[0.11em] opacity-80">{eyebrow}</p>
        )}
        {children}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** An empty state that SAYS WHICH KIND OF EMPTY IT IS. Drawing "nothing here
 *  yet" and "nothing matches your filter" the same way is the screen declining
 *  to answer the only question the reader has. */
export function Empty({
  title,
  icon,
  children,
}: {
  title: string;
  /** From the product's own set — never a second icon library. */
  icon?: IconName | undefined;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="px-6 py-10 text-center">
      {icon !== undefined && <Icon name={icon} size={24} className="mx-auto mb-2 text-faint" />}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children !== undefined && (
        <div className="mx-auto mt-1 max-w-[var(--measure)] text-sm text-muted">{children}</div>
      )}
    </div>
  );
}
