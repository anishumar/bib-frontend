import { redirect } from "next/navigation";

/**
 * "Our companies" is part of Your firm now (the Wave 4 brief, 2026-09-28: the
 * two firm pages merged into one). The route stays so an old link or a
 * bookmark lands on the right section instead of a 404.
 */
export default function CompaniesPage(): never {
  redirect("/admin/firm#companies");
}
