/**
 * "4 clients", "1 client", as ONE string (CA#47).
 *
 * Written in JSX as `{n} client{n === 1 ? "" : "s"}` the count, the word and
 * the "s" are separate text nodes, and inside a flex container with a gap
 * (every button, every stat note) each one became its own flex item: the
 * screen read "Load 4 client s". One string is one text node.
 */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${String(n)} ${n === 1 ? word : many}`;
}
