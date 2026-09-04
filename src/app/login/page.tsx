"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { SignInResponse } from "@/lib/api/client";
import { Button, Card, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

/**
 * Sign in.
 *
 * There is no token handling here and there cannot be: the API replies with an
 * httpOnly cookie, which no script can read. The browser holds it and sends it
 * on every subsequent call because the client sets credentials: "include".
 * That is the point of httpOnly — a cross-site script that runs on this page
 * still cannot steal the session.
 *
 * No app shell either. `AppShell` treats this route as bare, because a sidebar
 * full of links you cannot follow is furniture.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: failed } = await api.POST("/api/v1/auth/login", {
      body: { email, password },
    });

    if (failed) {
      // The API answers the same way for an unknown email and a wrong password,
      // deliberately — it must not confirm who holds an account here. So this
      // shows what it said rather than guessing at something friendlier.
      setError(apiError(failed).message);
      setBusy(false);
      return;
    }
    // TWO AUDIENCES SIGN IN HERE, and only one of them belongs in the
    // workspace. A client contact sent to `/` lands on the staff home with an
    // empty sidebar and every screen behind it answering 403 — the audience
    // gate working exactly as designed, and reading as a broken app.
    router.push(homeFor(data));
  }

  /**
   * Which half of the product this login belongs to.
   *
   * `principal.audience` answers it whenever a firm has been chosen. It is NULL
   * for somebody who belongs to more than one, because no membership is active
   * yet — so the memberships decide, and only when every one of them is a
   * portal login. Somebody who is a colleague at one firm and a client's
   * contact at another goes to the workspace and switches org from there:
   * guessing the portal for them would put the narrower app in front of the
   * wider need.
   */
  function homeFor(result: SignInResponse | undefined): "/" | "/portal" {
    if (result === undefined) return "/";
    if (result.principal.audience === "CLIENT_PORTAL") return "/portal";
    if (result.principal.audience !== null) return "/";
    const all = result.memberships;
    return all.length > 0 && all.every((m) => m.audience === "CLIENT_PORTAL") ? "/portal" : "/";
  }

  /**
   * Email a single-use link instead.
   *
   * The API answers 202 whether or not the address has an account, because the
   * endpoint must not reveal who banks with the firm — so this says the same
   * sentence either way. A friendlier "we found your account" would leak
   * exactly what the 202 is protecting, and a firm's client list is the thing
   * being protected.
   *
   * This is what the People screen has always promised: "they sign in with a
   * magic link from the login page."
   */
  async function sendLink(): Promise<void> {
    setLinkBusy(true);
    setError(null);
    const { error: failed } = await api.POST("/api/v1/auth/magic-link", {
      body: { email },
    });
    setLinkBusy(false);
    if (failed) {
      setError(apiError(failed).message);
      return;
    }
    setLinkSent(true);
  }

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">10X Workspace</p>
            <h1>Sign in</h1>
          </div>

          <Card>
            <form onSubmit={onSubmit}>
              <FieldStack>
                <Field label="Email">
                  <Input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); }}
                  />
                </Field>

                <Field label="Password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); }}
                  />
                </Field>

                <ErrorNotice error={error} />

                <Button type="submit" loading={busy} block>
                  Sign in
                </Button>

                {linkSent ? (
                  <Notice tone="ok" eyebrow="Check your email">
                    If that address has an account here, a sign-in link is on its way. It works
                    once and expires.
                  </Notice>
                ) : (
                  <Button
                    variant="link"
                    loading={linkBusy}
                    /* An email is required for this and the browser will not
                       enforce it — this is not the form's submit. */
                    disabled={email === ""}
                    onClick={() => void sendLink()}
                  >
                    Email me a sign-in link instead
                  </Button>
                )}
              </FieldStack>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
