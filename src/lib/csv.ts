// A spreadsheet out of rows a screen already holds: CSV, opened by Excel.
//
// Three things decide whether the file is any good in Excel, and each is here
// on purpose:
//   - a UTF-8 BYTE ORDER MARK, or Excel reads the file as the system code page
//     and "₹", "Müller" and every Devanagari name come out as mojibake;
//   - CRLF line ends and RFC 4180 quoting (a cell with a comma, a quote or a
//     line break is quoted, a quote doubled);
//   - FORMULA INJECTION is defused: a cell starting with = + - @ (or a tab or
//     carriage return) is read by Excel as a formula, and a client's name is
//     text somebody typed. OWASP's rule: prefix such a cell with a single
//     quote. A NUMBER cell (an amount, a count) is left alone so it still
//     sums, which is why the caller says which cells are numbers.

/** A cell: text, or a number Excel should treat as one (a decimal string from
 *  the API, never a JS number, so nothing is rounded on the way). */
export type CsvCell = string | { readonly number: string } | null;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null) return "";
  const text = typeof value === "string" ? (FORMULA_START.test(value) ? `'${value}` : value) : value.number;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file's text, header first. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Hands the browser a .csv to save. */
export function downloadCsv(filename: string, rows: readonly (readonly CsvCell[])[]): void {
  const url = URL.createObjectURL(new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: Safari has cancelled a download whose object URL
  // was revoked synchronously (the same care as the document download).
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
