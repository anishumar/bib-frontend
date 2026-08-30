import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./class-names";

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
