import { useSyncExternalStore } from "react";

/**
 * Whether the reader has asked the system for less motion.
 *
 * The CSS side of this is the `prefers-reduced-motion` blocks in
 * `components.css`. This is the same question for the two things CSS cannot
 * stop on its own: a figure counting up and a chart drawing itself in, both
 * driven from script. Under reduced motion each shows its final state at once.
 *
 * Read through `useSyncExternalStore`, so it is right on the first client
 * render and follows the setting if it changes while the page is open. The
 * server has no reader to ask and answers `false`; every figure that uses this
 * arrives from the API after the page is in the browser anyway.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
