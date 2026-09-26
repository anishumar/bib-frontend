/**
 * Scroll something into view BELOW the sticky top bar.
 *
 * `scrollIntoView({ block: "start" })`, a plain `#anchor` and `focus()` all put
 * the target's top edge at the top of the window, which is under the bar. The
 * catalogue's "Used in" links found it first (T6.16): the one thing a reader
 * arriving on a service card needs to see, which service it is, was the thing
 * hidden. The library's rows and a form's first refused field have the same
 * shape, so it lives here rather than on the catalogue.
 *
 * The bar's height is MEASURED, not typed: it follows the theme and the phone
 * layout, and a number here would drift from both. The breathing room is
 * `--s-4`, read from the tokens rather than invented.
 *
 * Takes an element id or the element. Answers whether there was anything to
 * scroll to, because a caller landing on a hash has to know whether the thing
 * it names is on the page yet.
 */
export function scrollBelowBar(target: string | Element): boolean {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (element === null) return false;
  const bar = document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0;
  const root = getComputedStyle(document.documentElement);
  const room = parseFloat(root.getPropertyValue("--s-4")) * parseFloat(root.fontSize) || 0;
  window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - bar - room });
  return true;
}
