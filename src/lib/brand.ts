/**
 * The product's name, in ONE place (audit 2026-10-03, CA#40).
 *
 * "10X Workspace" is the commissioned brand of the whole product, so it is the
 * one name every firm's staff see on the sign-in pages and the browser tab. It
 * is never a FIRM's name: anything scoped to one firm (the sidebar's mark, the
 * client portal, an invitation) shows that firm's own name and initials, read
 * off the session (`tenantName`), so a client of another firm never sees "10x"
 * and asks who that is.
 */
export const PRODUCT_NAME = "10X Workspace";

/** Words that say what a firm IS rather than who, so they make poor initials:
 *  "Sharma Mehta & Co LLP" is "SM", not "SC". */
const FILLER = new Set([
  "&",
  "and",
  "the",
  "co",
  "co.",
  "company",
  "llp",
  "llc",
  "ltd",
  "ltd.",
  "limited",
  "pvt",
  "pvt.",
  "private",
  "inc",
  "inc.",
  "associates",
]);

/**
 * Up to three characters for a firm's round mark.
 *
 * Two initials from the first two meaningful words ("Sharma Mehta & Co" → "SM").
 * A name that LEADS with a figure keeps that word whole, up to three characters
 * ("10x Global" → "10x"), because "1G" is nobody's name for them. A bracketed
 * aside ("(QA roleplay)") is not part of the name.
 */
export function firmInitials(name: string | null | undefined): string {
  if (name === null || name === undefined) return "?";
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w !== "" && !FILLER.has(w.toLowerCase()));
  const first = words[0];
  if (first === undefined) return "?";
  if (/^\d/.test(first)) return first.slice(0, 3);
  const letters = words
    .slice(0, 2)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").charAt(0))
    .join("");
  return letters === "" ? "?" : letters.toUpperCase();
}
