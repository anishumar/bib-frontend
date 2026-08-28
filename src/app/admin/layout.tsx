import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The administration section: who works at the firm, and what their roles mean.
 *
 * Two screens rather than one because they answer different questions and are
 * edited at different times — but they are the same subject, and the API
 * enforces that: both halves need `tenant:admin`, because between them they
 * decide what every role can do AND who holds it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/admin/people">People</Link>
        <Link href="/admin/roles">Roles</Link>
      </nav>
      {children}
    </div>
  );
}
