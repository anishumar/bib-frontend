/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately the whole of it. A design system does not need `clsx` — the
 * variants here are data attributes, not class lists, so the only thing left
 * to join is a component's own class and the caller's optional one.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
