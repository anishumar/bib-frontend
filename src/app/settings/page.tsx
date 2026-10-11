"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout";
import { Loading } from "@/components/states";

/**
 * SETTINGS, the sidebar's one link to every settings screen (2026-10-10).
 *
 * Not a page of its own: it opens the first screen this login may change. An
 * administrator lands on Your firm, where Setup says what is left to do;
 * anybody else on Your account, the one setting that is theirs. The sidebar
 * shows the settings menu from here on, so the rest is one click away.
 */
export default function SettingsPage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session === null) return;
    router.replace(session.permissions.includes("tenant:admin") ? "/admin/firm" : "/account");
  }, [session, router]);

  return <Loading label="Opening settings" />;
}
