import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AppShell, themeScript } from "@/components/layout";

/**
 * IBM Plex — the same faces 10x CRM uses. The two products are read on the
 * same day by the same people, and a different typeface is the first thing
 * that says "different system".
 *
 * Loaded through `next/font` rather than a stylesheet link: the files are
 * fetched at build time and served from this origin, so there is no
 * third-party connection on the critical path, no layout shift when the real
 * face arrives, and nothing for a blocked CDN to take down. The weights are
 * named exactly — every one the design system uses, and no others, because an
 * unused weight is a download nobody asked for.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  title: "BiB · 10X Workspace",
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
