import { redirect } from "next/navigation";

/**
 * `/` sends staff to the Work board (V1.1, 2026-09-28).
 *
 * It was the AI Copilot, which cannot answer anything yet, so every partner,
 * manager and associate started the day on a screen saying "Not live yet". The
 * Copilot moved to `/copilot`. A CLIENT never gets here: sign-in sends them to
 * `/portal` (`homeFor`), and the shell sends a portal session there from any
 * staff route.
 */
export default function Home(): never {
  redirect("/work-items");
}
