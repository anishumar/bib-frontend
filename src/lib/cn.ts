import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Join class names, and let the LAST Tailwind utility win.
 *
 * This is the helper every shadcn component is written against, so it has to
 * exist under this name for one to be dropped in unedited.
 *
 * The part that earns its keep is `twMerge`. `clsx` alone would produce
 * `"p-4 p-2"`, which resolves by stylesheet order rather than by the order the
 * caller wrote — so a component's default would beat the override passed into
 * it, at random. `twMerge` drops the earlier of any two utilities that set the
 * same property, which is what makes `<Button className="p-2">` mean what it
 * looks like it means.
 *
 * NOT a replacement for `cx` in `@/components/ui/class-names`. That one joins
 * the hand-written design-system classes and knows nothing about Tailwind's
 * conflict rules; this one is for Tailwind and shadcn. Two vocabularies, two
 * joiners, until the first is gone.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
