import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The administration section: who works at the firm, what their roles mean, and
 * how senior they are.
 *
 * Several screens rather than one because they answer different questions and
 * are edited at different times — but they are the same subject, and the API
 * enforces that: every one needs `tenant:admin`, because between them they decide
 * what every role can do, who holds it, and who is senior enough to sign off
 * somebody else's work.
 *
 * BRAND is the firm's marks — logo, signature, letterhead — and it is here for
 * the same reason: they are per ISSUING ENTITY, so between this screen and the
 * issuing table they decide what a client actually receives.
 *
 * The last five are not about people at all: PROCESSES is how the firm does its
 * work — the steps a job walks, which is the thing that used to live only in a
 * partner's head. STRUCTURE is the firm's own Depts
 * and delivery teams and which of them splits a client's work, the STANDARD PROSE
 * is what every new document is written with, and TERRITORIES decide whose desk a
 * lead lands on. They are here because the API gates all of them on
 * `tenant:admin` for the same reason it gates roles — each one silently changes
 * what happens on work nobody has looked at yet.
 *
 * WHO CHECKS WORK sits beside PROCESSES because the two are read together: a
 * process says a step is reviewed, and a rule here says by whom. It is a
 * separate screen because it is a separate decision, made once and pointed at by
 * many processes — and because the one thing on it that is NOT configurable
 * (nobody may approve their own work) has to be stated somewhere a partner would
 * go looking for the switch.
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
        <Link href="/admin/structure">Structure</Link>
        <Link href="/admin/workflows">Processes</Link>
        <Link href="/admin/obligation-rules">Compliance rules</Link>
        <Link href="/admin/verification">Who checks work</Link>
        <Link href="/admin/document-blocks">Standard prose</Link>
        <Link href="/admin/brand">Brand</Link>
        <Link href="/admin/territories">Territories</Link>
      </nav>
      {children}
    </div>
  );
}
