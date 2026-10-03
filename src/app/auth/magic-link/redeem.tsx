"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import { homeFor } from "@/lib/api/home";
import { PRODUCT_NAME } from "@/lib/brand";
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

  /**
   * WHETHER THIS TOKEN HAS ALREADY BEEN SPENT BY THIS PAGE.
   *
   * The link is single use — that is the whole security property — and this
   * effect is what spends it. `reactStrictMode` is on, so in development React
   * mounts, unmounts and remounts every component to surface exactly this kind
   * of bug: the effect ran twice, the FIRST call consumed the link and set the
   * session cookie, the second was told "this link no longer works", and the
   * page showed that message to somebody who was, at that moment, signed in.
   *
   * `live` did not help. It guards the RESPONSE, and the damage is done by the
   * REQUEST — a cancelled continuation does not un-spend a token. So the guard
   * has to sit before the call and survive the unmount, which is what a ref
   * initialised outside React's render cycle does.
   *
   * It is not only a development story. Anything that fetches a link in a page
   * and then follows it burns a real user's token the same way: a mail client
   * that pre-renders, a scanner that executes JavaScript, a browser restoring a
   * tab. The person then arrives at a link that "no longer works" and has no
   * idea why.
   */
  const spent = useRef(false);

  useEffect(() => {
    if (missing) return;
    if (spent.current) return;
    spent.current = true;
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
      // THE SAME RULE THE PASSWORD FORM USES, and it did not used to be. This
      // pushed `/` unconditionally, so a client contact who signed in with the
      // link their firm emailed them landed in the staff workspace — an empty
      // sidebar, every screen answering 403, and false empty states beside the
      // refusals. Two doors into one building; only one of them knew which
      // floor you belong on. See `homeFor`.
      router.push(homeFor(result.data));
    })();
    return () => {
      live = false;
    };
  }, [token, missing, router]);

  const message = missing ? "This link is incomplete. Open the full link from your email." : error;
  if (message === null) return <Loading label="Signing you in" />;

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">{PRODUCT_NAME}</p>
            <h1>This link no longer works</h1>
          </div>
          <Card>
            <p>{message}</p>
          </Card>
          <Button variant="secondary" onClick={() => { router.push("/login"); }}>
            Back to sign in
          </Button>
        </div>
      </div>
    </main>
  );
}
