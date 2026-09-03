import type { JSX } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * The chevrons shadcn's Calendar imports, wired to this product's own icons.
 *
 * Not `lucide-react`: a second icon set in an app that already has one is the
 * thing that makes an interface look assembled rather than designed, and the
 * rule is written at the top of `@/components/ui/icon`. Three glyphs was never
 * worth a library.
 *
 * TWO OF THE THREE ALREADY EXISTED and were duplicated here by mistake first
 * time round — `chevronDown` and `chevronRight` have been in `icon.tsx` all
 * along. They are delegated to now, so there is one definition of each shape.
 * Only `chevronLeft` is genuinely missing, and it is drawn below in the same
 * family: 24-unit box, 1.75 stroke, round caps and joins, no fill,
 * `currentColor`.
 *
 * When `icon.tsx` is next free — it belongs to another developer's uncommitted
 * work right now — `chevronLeft` moves there and this file becomes a re-export
 * or goes away entirely.
 */

const SIZE = 16;

export function ChevronDownIcon({
  className,
}: {
  className?: string | undefined;
}): JSX.Element {
  return <Icon name="chevronDown" size={SIZE} {...(className === undefined ? {} : { className })} />;
}

export function ChevronRightIcon({
  className,
}: {
  className?: string | undefined;
}): JSX.Element {
  return <Icon name="chevronRight" size={SIZE} {...(className === undefined ? {} : { className })} />;
}

/** The one that is not in `icon.tsx` yet. Mirror of `chevronRight`. */
export function ChevronLeftIcon({
  className,
}: {
  className?: string | undefined;
}): JSX.Element {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m15 19-7-7 7-7" />
    </svg>
  );
}
