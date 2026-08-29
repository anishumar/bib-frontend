import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The administration section: who works at the firm, what their roles mean, and
 * how senior they are.
 *
 * Three screens rather than one because they answer different questions and are
 * edited at different times — but they are the same subject, and the API
 * enforces that: all three need `tenant:admin`, because between them they decide
 * what every role can do, who holds it, and who is senior enough to sign off
 * somebody else's work.
 *
 * The last two are not about people at all: the STANDARD PROSE is what every new
 * document is written with, and TERRITORIES decide whose desk a lead lands on.
 * They are here because the API gates both on `tenant:admin` for the same reason
 * it gates roles — each one silently changes what happens on work nobody has
 * looked at yet.
 *
 * Roles and grades are deliberately not one screen. A role is what somebody may
 * REACH and it grants permissions; a grade is how SENIOR they are and it grants
 * nothing — it exists for one comparison, the firm's "Manager or above" review
 * rule. Merging them would suggest a promotion changes what you can open.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/admin/people">People</Link>
        <Link href="/admin/roles">Roles</Link>
        <Link href="/admin/grades">Grades</Link>
        <Link href="/admin/document-blocks">Standard prose</Link>
        <Link href="/admin/territories">Territories</Link>
      </nav>
      {children}
    </div>
  );
}
