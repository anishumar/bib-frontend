"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import { Button, Card } from "@/components/ui";
import { Loading } from "@/components/states";

/**
 * Where a magic link lands.
 *
 * The path and the query name are NOT chosen here — the backend composes the
 * email as `${appBaseUrl}/auth/magic-link?token=…`, so this route exists at
 * that address and reads that parameter. Anything else and every link the
 * product has ever sent would 404.
 *
 * The token is spent by POSTing it: the API sets the session cookie and this
 * page never sees it, which is the same arrangement the password sign-in has.
 * That is why redemption is a call rather than a redirect.
 */
export function RedeemMagicLink() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);

  // A link with no token is knowable at render time, so it is decided here
  // rather than in the effect — an effect that sets state synchronously is a
  // cascading render, and this needs no round trip to know the answer.
  const missing = token === null || token === "";

  useEffect(() => {
    if (missing) return;
    let live = true;
    void (async () => {
      const result = await api.POST("/api/v1/auth/magic-link/redeem", {
        body: { token: token as string },
      });
      if (!live) return;
      if (result.error) {
        // A spent link, an expired one and an invented one all say the same
        // thing, because the API answers all three the same way. Telling them
        // apart would confirm to whoever holds a wrong token that a real one of
        // that shape existed.
        setError(apiError(result.error).message);
        return;
      }
      // Home, not a firm-scoped screen: this account may belong to more than
      // one firm, in which case the session has no tenant yet and the shell
      // has to ask which before anything else will load.
      router.push("/");
    })();
    return () => {
      live = false;
    };
  }, [token, missing, router]);

  const message = missing ? "This link is missing its token." : error;
  if (message === null) return <Loading label="Signing you in" />;

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">10X Workspace</p>
            <h1>This link no longer works</h1>
          </div>
          <Card>
            <p className="muted">{message}</p>
          </Card>
          <Button variant="secondary" onClick={() => { router.push("/login"); }}>
            Back to sign in
          </Button>
        </div>
      </div>
    </main>
  );
}
