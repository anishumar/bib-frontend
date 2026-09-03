import type { JSX } from "react";

/**
 * The three chevrons shadcn's Calendar needs, and nothing else.
 *
 * They are here rather than from `lucide-react` because `lucide-react` would
 * be a SECOND icon set in an app that already has one, and mixing stroke
 * weights is the single thing that makes an interface look assembled rather
 * than designed — the rule is written at the top of `@/components/ui/icon`.
 * Three glyphs is not worth a library.
 *
 * They are not IN that file either, for a duller reason: it belongs to another
 * developer's uncommitted work right now. When that lands, these three move
 * there and this file goes away.
 *
 * Same family as every other icon in the product, and that is the whole point:
 * 24-unit box, 1.75 stroke, round caps and joins, no fill, `currentColor`.
 */

function Chevron({
  d,
  className,
}: {
  d: string;
  className?: string | undefined;
}): JSX.Element {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: { className?: string | undefined }): JSX.Element {
  return <Chevron d="m15 18-6-6 6-6" className={className} />;
}

export function ChevronRightIcon({ className }: { className?: string | undefined }): JSX.Element {
  return <Chevron d="m9 18 6-6-6-6" className={className} />;
}

export function ChevronDownIcon({ className }: { className?: string | undefined }): JSX.Element {
  return <Chevron d="m5 9 7 7 7-7" className={className} />;
}
