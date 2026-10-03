/**
 * A short name (the API's `key`) made from a title (audit 2026-10-03, CA#26).
 *
 * Every process, step and review rule needs a lower-case handle that never
 * changes once work has run, and the screens asked a partner to type one:
 * "Short name, lower case, cannot change later". A person thinks in the title,
 * so the handle is made from it and stays editable for somebody who wants it.
 *
 * Two shapes, because the API checks two:
 *   entry   a process or a rule: starts with a letter, words joined by "-",
 *           at most 64 characters;
 *   step    a step inside a process: 2 to 40 characters, letters, digits,
 *           "-" and "_", not starting or ending with "-".
 * A title that leaves nothing usable (all punctuation, or another script)
 * becomes `fallback`. `taken` is what is already in use in the same list, and a
 * clash gets "-2", "-3".
 */
export function shortNameFrom(
  title: string,
  shape: "entry" | "step",
  fallback: string,
  taken: readonly string[] = [],
): string {
  const max = shape === "entry" ? 64 : 40;
  let base = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (shape === "entry") base = base.replace(/^[0-9-]+/, "");
  if (base.length < 2) base = fallback;
  base = trimTo(base, max);
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${String(n)}`;
    const candidate = `${trimTo(base, max - suffix.length)}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function trimTo(text: string, max: number): string {
  return text.slice(0, max).replace(/-+$/, "");
}
