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
      </nav>
      {children}
    </div>
  );
}
