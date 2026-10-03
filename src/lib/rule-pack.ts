/**
 * Where a filing rule came from, in words (CA#39).
 *
 * The pack is an internal key ("in-firm-sheet@2026.08", "firm@2026") and was
 * printed as-is under every rule's name and in the calendar's tooltips: it
 * named another firm's spreadsheet to every firm. A firm's own rules are
 * written under `firm@<year>` (see the rule editor's `firmRulePack`).
 */
export function rulePackLabel(pack: string): string {
  return pack.startsWith("firm@") ? "Written by your firm" : "Shipped with BiB";
}
