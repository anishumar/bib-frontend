import { Suspense } from "react";
import { RedeemMagicLink } from "./redeem";
import { Loading } from "@/components/states";

/**
 * `useSearchParams` opts a route into request-time rendering, and Next requires
 * the boundary to be explicit rather than inferred — hence the Suspense wrapper
 * around a client child rather than one `"use client"` page.
 */
export default function MagicLinkPage() {
  return (
    <Suspense fallback={<Loading label="Signing you in" />}>
      <RedeemMagicLink />
    </Suspense>
  );
}
