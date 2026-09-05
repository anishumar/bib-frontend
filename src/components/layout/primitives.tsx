import type { ReactNode } from "react";
import { cx } from "@/components/ui/class-names";

/**
 * The layout primitives.
 *
 * These exist to take three decisions away from screens: how wide a page is,
 * how far its content sits from the edge, and how much space goes between two
 * things. Those are properties of the APPLICATION — a screen that sets them
 * has decided on behalf of every other screen without being able to see them,
 * which is how one page ends up with 24px of padding and the next with 37.
 */

/**
 * The page canvas. Every route's outermost element.
 *
 * `narrow` for a page that is mostly prose or a single form — 46rem is where a
 * line of text stops being comfortable. `wide` for a board or a table that
 * genuinely wants the whole window.
 */
export function Page({
  children,
  width,
  className,
}: {
  children: ReactNode;
  width?: "narrow" | "wide";
  className?: string;
}) {
  return (
    <main
      /* THE TARGET OF THE SKIP LINK in both shells. One id, because there
         is one `<main>` on a page and `Page` is the only thing that renders
         it — see `app-shell.tsx` for why the link exists. */
      id="page"
      /* `-1` so the skip link can actually PUT FOCUS HERE. Without it the
         browser scrolls to `#page` and leaves focus on the link, so the next
         Tab carries on from the sidebar — the link moves the view and not the
         keyboard, which is the half-fix that makes a skip link look like it
         works. It adds no tab stop. */
      tabIndex={-1}
      className={cx("page", width === undefined ? undefined : width, className)}
    >
      <div className="stack loose">{children}</div>
    </main>
  );
}

/**
 * How every page opens: an eyebrow, a title, a lede, and whatever sits
 * opposite.
 *
 * This is most of what makes 35 screens feel like one product. The eyebrow
 * says which part of the workspace you are in, the title says which screen,
 * and the lede says what the screen is FOR — which several of these pages need
 * badly, because "Structure" and "Processes" do not explain themselves.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  /** Actions, a count, a status — sits opposite the title. */
  aside,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lede !== undefined && <p className="lede">{lede}</p>}
        {children}
      </div>
      {aside !== undefined && <div className="cluster">{aside}</div>}
    </div>
  );
}

/**
 * Things down the page at one gap.
 *
 * The default (`--s-4`) is the gap between related blocks; `loose` separates
 * sections; `tight` is for a label and the thing it labels.
 */
export function Stack({
  children,
  gap,
  className,
  ...rest
}: {
  children: ReactNode;
  gap?: "tight" | "snug" | "loose";
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className">) {
  return (
    <div {...rest} className={cx("stack", gap, className)}>
      {children}
    </div>
  );
}

/** A heading and the thing opposite it, baseline-aligned, wrapping on narrow. */
export function Row({
  children,
  /**
   * Align the BOTTOMS rather than the baselines.
   *
   * `.row` aligns on the baseline, which is right when both sides are text.
   * It is wrong when one side is a `Field` — label above control — because
   * the baseline it finds is the LABEL's, so the control ends up 41px below
   * the button beside it and tab order walks back up the page to reach it.
   * Measured on /admin/obligation-rules, whose filter and "Write a rule" are
   * meant to be one line.
   */
  align,
  className,
}: {
  children: ReactNode;
  align?: "end";
  className?: string;
}) {
  return (
    <div className={cx("row", align === "end" ? "align-end" : undefined, className)}>
      {children}
    </div>
  );
}

/** Things beside each other that wrap: buttons, pills, filters. */
export function Cluster({
  children,
  gap,
  align,
  className,
}: {
  children: ReactNode;
  gap?: "tight" | "loose";
  align?: "end";
  className?: string;
}) {
  return <div className={cx("cluster", gap, align, className)}>{children}</div>;
}

/**
 * Columns that collapse on their own.
 *
 * `auto-fit` with a minimum, so there is no breakpoint to pick and no screen
 * inventing its own. Two columns become one when one stops fitting, which is a
 * better rule than any width somebody would have guessed.
 */
export function Grid({
  children,
  min = "wide",
  className,
}: {
  children: ReactNode;
  /** `wide` fits cards; `narrow` fits stat tiles and short fields. */
  min?: "wide" | "narrow";
  className?: string;
}) {
  return (
    <div className={cx(min === "wide" ? "grid-2" : "grid-3", className)}>{children}</div>
  );
}

/**
 * A heading and its content, with the gap between them decided once.
 *
 * `level` exists because the SCALE IS THE HIERARCHY (`base.css` says so) and a
 * section is not always at the same depth. It defaults to 3, which is every
 * screen that existed before it was added, and the client portal passes 2 —
 * there the sections are the page's top-level structure and their headings
 * should look like it. Two values only: an `h4` section under an `h3` one is a
 * nesting this layout has no room for, and `h1` belongs to `PageHeader`.
 */
export function Section({
  title,
  aside,
  children,
  className,
  level = 3,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("section", className)}>
      {(title !== undefined || aside !== undefined) && (
        <header>
          {title !== undefined && (level === 2 ? <h2>{title}</h2> : <h3>{title}</h3>)}
          {aside !== undefined && <div className="cluster">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
