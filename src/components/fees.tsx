"use client";

/**
 * THE FEE AXIS ON A SCREEN (audit 2026-10-03, F10 / F33).
 *
 * The API redacts money to `null` for a login that cannot see fees, and the
 * same `null` means "nobody has set one" for everybody else. The session's
 * `commercialVisibility` is what tells the two apart, so a hidden amount reads
 * "Hidden" and never "Not set" (which says the firm forgot), and a screen does
 * not offer an act that writes money to somebody the API will refuse.
 */
import type { ReactNode } from "react";
import { useSession } from "@/components/layout/app-shell";
import { NotSet } from "@/components/ui";
import { formatMoney } from "@/lib/api/client";

/**
 * Whether the signed-in login sees fees. `null` until the shell has read
 * `/auth/me`: a screen then offers nothing that writes money, and says nothing
 * about an amount yet.
 */
export function useSeesFees(): boolean | null {
  const session = useSession();
  if (session === null) return null;
  return session.commercialVisibility === true;
}

/** What a money value reads when the API sent none. */
export function MissingMoney({ seesFees, unset }: { seesFees: boolean | null; unset?: ReactNode }) {
  if (seesFees === false) return <NotSet>Hidden</NotSet>;
  return <NotSet>{unset ?? "Not set"}</NotSet>;
}

/**
 * An amount, or what its absence means for THIS login: "Hidden" when it may
 * not see fees, `unset` ("Not set" by default) when nobody has set one.
 */
export function Money({
  amount,
  currency,
  unset,
}: {
  amount: string | null | undefined;
  currency: string;
  unset?: ReactNode;
}) {
  const seesFees = useSeesFees();
  if (amount === null || amount === undefined) return <MissingMoney seesFees={seesFees} unset={unset} />;
  return <>{formatMoney(amount, currency)}</>;
}
