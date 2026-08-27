import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiB — 10X Workspace",
  description: "Business in a Box: the staff workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="bib-shell">{children}</div>
      </body>
    </html>
  );
}
