import type { JSX } from "react";
import { cx } from "./class-names";

/**
 * The icon set. All of it.
 *
 * Drawn here rather than pulled from a package: this many glyphs do not
 * justify a dependency, and inline SVG inherits `currentColor`, so an icon
 * inside a ghost button or an active nav link is one CSS rule instead of two
 * assets.
 *
 * ONE FAMILY: 24-unit box, 1.75 stroke, round caps and joins, no fills. Mixing
 * stroke weights is the single thing that makes an interface look assembled
 * rather than designed, and it happens the moment two people each pick their
 * own icon library. There is no second source — if a glyph is missing, it gets
 * drawn here, in this style.
 *
 * Every icon is `aria-hidden`. An icon is a picture of a thing that is already
 * named: the nav link has its label, the button has its text, the icon-only
 * button has an `aria-label`. Announcing the icon too reads the same thing
 * twice.
 */

const PATHS = {
  /* ── Navigation ──────────────────────────────────────────────────────── */
  home: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  clients: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </>
  ),
  pipeline: (
    <>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15 6h6v6" />
    </>
  ),
  proposals: (
    <>
      <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  letters: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="m4 6 8 6 8-6" />
    </>
  ),
  invoices: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  receivables: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  numbers: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  catalogue: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M4 5.5v16" />
      <path d="M8 8h7M8 12h5" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  engine: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 15h3" />
    </>
  ),
  audit: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  people: (
    <>
      <path d="M17 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
      <circle cx="10" cy="7.5" r="3.2" />
      <path d="M17 4.2a3.2 3.2 0 0 1 0 6.2M21 20v-1.6a3.4 3.4 0 0 0-2.5-3.3" />
    </>
  ),
  roles: (
    <>
      <path d="M12 3l7.5 3.5v5c0 4.3-3 8.2-7.5 9.5-4.5-1.3-7.5-5.2-7.5-9.5v-5Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </>
  ),
  grades: (
    <>
      <path d="M4 20h4V10H4zM10 20h4V4h-4zM16 20h4v-7h-4z" />
    </>
  ),
  structure: (
    <>
      <rect x="9" y="3" width="6" height="4.5" rx="1" />
      <rect x="2.5" y="16.5" width="6" height="4.5" rx="1" />
      <rect x="15.5" y="16.5" width="6" height="4.5" rx="1" />
      <path d="M12 7.5v5M5.5 16.5v-2.5h13v2.5" />
    </>
  ),
  processes: (
    <>
      <rect x="3" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="16" width="7" height="5" rx="1.5" />
      <path d="M6.5 8v6a2 2 0 0 0 2 2H14" />
    </>
  ),
  compliance: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="m9.5 14 1.8 1.8 3.4-3.6" />
    </>
  ),
  verification: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" />
    </>
  ),
  prose: (
    <>
      <path d="M4 5h16M4 10h16M4 15h11M4 20h7" />
    </>
  ),
  brand: (
    <>
      <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8Z" />
    </>
  ),
  territories: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </>
  ),
  files: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    </>
  ),

  /* ── Actions and states ──────────────────────────────────────────────── */
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  arrowLeft: <path d="M20 12H5M11 6l-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16" />,
  upload: <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 19h16" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" />
      <path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" />
      <path d="M3 4v5h5M21 20v-5h-5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M4.6 5h14.8L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    </>
  ),
  signout: (
    <>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="M15 16.5 19.5 12 15 7.5M19 12H9" />
    </>
  ),

  /* ── Theme switch ────────────────────────────────────────────────────── */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

/**
 * `size` is in pixels and defaults to 20 — the nav size, and the one that sits
 * correctly beside `--t-md` text. There is no size scale: an icon either
 * matches its text or it is the wrong icon.
 */
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      className={cx("icon", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
