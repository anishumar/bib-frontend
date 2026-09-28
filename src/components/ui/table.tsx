import type { ComponentProps, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cx } from "./class-names";
import { Icon } from "./icon";

/**
 * A table, and the box it scrolls inside.
 *
 * COMPOSABLE PARTS rather than a `columns` prop, because the tables in this
 * product are not lists of strings — a cell holds a select that changes a
 * role, a pill and a second line of email, a button whose label depends on the
 * row. A data-driven table would be fought on every screen.
 *
 * What is NOT left to the caller is the frame: `<TableWrap>` is mandatory, and
 * it is the thing the old markup never had. A seven-column table on a phone
 * must scroll inside its own box; without that the whole page scrolls sideways
 * and takes the navigation with it.
 */
export function TableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("tablewrap", className)}>{children}</div>;
}

export function Table({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<React.TableHTMLAttributes<HTMLTableElement>, "className">) {
  return (
    <table {...rest} className={cx("table", className)}>
      {children}
    </table>
  );
}

export type CellAlign = "left" | "right" | "center";

/**
 * A header cell. `align="right"` on the header and the cells under it is how a
 * column of figures gets to read as a column.
 */
export function Th({
  children,
  align,
  className,
  ...rest
}: {
  children?: ReactNode;
  align?: CellAlign;
  className?: string;
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, "className" | "align">) {
  return (
    <th
      {...rest}
      className={className}
      {...(align === undefined ? {} : { "data-align": align })}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  className,
  ...rest
}: {
  children?: ReactNode;
  align?: CellAlign;
  className?: string;
} & Omit<TdHTMLAttributes<HTMLTableCellElement>, "className" | "align">) {
  return (
    <td
      {...rest}
      className={className}
      {...(align === undefined ? {} : { "data-align": align })}
    >
      {children}
    </td>
  );
}

/**
 * A body row.
 *
 * `linked` makes the WHOLE ROW open the item: put exactly one `<RowLink>` in
 * it (the first cell's main text, as a rule) and its stretched `::after`
 * covers the row. The link stays one real link to a keyboard and a screen
 * reader, which a row with an `onClick` would not be, and any other control
 * in the row (a select, a button) is lifted above it by the stylesheet so it
 * can still be used.
 *
 * `inactive` dims a row that is no longer in force. Prefer a pill that says
 * the state on a new screen (the Wave 4 brief keeps closed rows at full ink);
 * the prop exists for the screens that have not moved yet.
 */
export function Tr({
  children,
  linked = false,
  inactive = false,
  className,
  ...rest
}: {
  children: ReactNode;
  linked?: boolean;
  inactive?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLTableRowElement>, "className">) {
  return (
    <tr
      {...rest}
      className={className}
      {...(linked ? { "data-linked": "true" } : {})}
      {...(inactive ? { "data-inactive": "true" } : {})}
    >
      {children}
    </tr>
  );
}

/**
 * The one link in a `<Tr linked>` row. Its text is the row's name, so a
 * screen reader's list of links reads as a list of the items.
 */
export function RowLink<T extends string>({
  href,
  children,
  className,
  ...rest
}: {
  /* Generic over the route, as `LinkButton` is, so a dynamic route like
     `/leads/${id}` satisfies the typed-routes check. */
  href: Route<T>;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<typeof Link<T>>, "href" | "className" | "children">) {
  return (
    <Link {...rest} href={href} className={cx("row-link", className)}>
      {children}
    </Link>
  );
}

/** The quiet chevron cell at the end of a linked row, and the empty head
 *  cell above it. Decoration: the row's link already says where it goes. */
export function RowChevron() {
  return (
    <td className="row-chevron" aria-hidden="true">
      <Icon name="chevronRight" size={18} />
    </td>
  );
}
export function ThChevron() {
  return (
    <th className="row-chevron">
      <span className="sr-only">Open</span>
    </th>
  );
}

/** The quiet second line in a cell — an email under a name, a code under a
 *  label. A `<span class="sub">` by hand was the commonest one-off in the app. */
export function Sub({ children }: { children: ReactNode }) {
  return <span className="sub">{children}</span>;
}

/**
 * The row a table shows when it has none.
 *
 * Inside the table rather than instead of it, so the column headers stay put —
 * they say what WOULD be here, which is most of what somebody looking at an
 * empty screen needs to know.
 */
export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <p className="empty">{children}</p>
      </td>
    </tr>
  );
}
