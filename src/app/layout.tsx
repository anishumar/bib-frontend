import type { Metadata } from "next";
import { IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { AppShell, themeScript } from "@/components/layout";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Source Sans 3 for everything a person reads, and IBM Plex Mono for true code
 * only (an id in a support disclosure). The Wave 4 brief (2026-09-28): the
 * people using this are mostly over 35, at a desktop, reading figures all day,
 * and Source Sans was drawn for legibility and has tabular figures. `latin-ext`
 * is not optional: that subset is where the rupee sign lives.
 *
 * Italic is loaded, not synthesised: a placeholder and "Not set" are both
 * italic, and a slanted regular is the browser guessing.
 *
 * No `weight`: Source Sans 3 is a variable font, one file per subset covering
 * 200–900, so the 400/600/700 we use all come from it. Naming the weights makes
 * Google list that same file once per weight, and Turbopack's production build
 * fails on the repeat ("next/font/google queries have exactly one entry") —
 * `next dev` does not, which is how it got past the branch's own checks.
 *
 * Loaded through `next/font` rather than a stylesheet link: the files are
 * fetched at build time and served from this origin, so there is no
 * third-party connection on the critical path, no layout shift when the real
 * face arrives, and nothing for a blocked CDN to take down.
 */
const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `BiB · ${PRODUCT_NAME}`,
  description: "Business in a Box: the staff workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `suppressHydrationWarning` is the other half of the theme script below:
       it deliberately sets an attribute the server did not render, which is
       precisely the case that warning exists for. */
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before the first paint. Without it a dark
            user gets a white flash on every navigation to a fresh document. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
