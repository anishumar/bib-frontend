import { notFound } from "next/navigation";
import { CopilotChat } from "./copilot-chat";

/**
 * NOT SHOWN UNTIL IT CAN ANSWER (S7, 2026-10-05). The AI Copilot has no model
 * behind it yet (memory: parked), and the page said "Not live yet" to every
 * staff role. Unreleased features are not shown: the sidebar link was already
 * taken out (CA#51), and the URL now answers 404 as well. The firm has no
 * copilot switch yet, so the deployment holds it: `NEXT_PUBLIC_BIB_COPILOT=on`
 * shows the page, and nothing sets it.
 *
 * The screen itself is kept in `copilot-chat.tsx`, built and type-checked, so
 * the day the API exists the switch goes on and the sidebar entry (see the
 * comment in `app-shell.tsx`) goes back.
 */
const COPILOT_LIVE = process.env.NEXT_PUBLIC_BIB_COPILOT === "on";

export default function CopilotPage() {
  if (!COPILOT_LIVE) notFound();
  return <CopilotChat />;
}
