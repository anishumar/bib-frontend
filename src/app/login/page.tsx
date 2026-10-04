"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { homeFor } from "@/lib/api/home";
import { PRODUCT_NAME } from "@/lib/brand";
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
  const emailRef = useRef<HTMLInputElement>(null);

  // ALREADY SIGNED IN (F31): opening this page with a live session goes
  // straight to that person's home rather than showing a form they do not
  // need. Anything but a clear "yes" (a 401, a busy API) leaves the form.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [me, mine] = await Promise.all([
          api.GET("/api/v1/auth/me", {}),
          api.GET("/api/v1/tenancy/me/memberships", {}),
        ]);
        if (!live || me.data === undefined || mine.data === undefined) return;
        router.replace(homeFor({ principal: me.data, memberships: mine.data.memberships }));
      } catch {
        // No answer: stay on the form.
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

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
    // No email yet: the browser's own "fill out this field" on the box. The
    // link used to be DISABLED until then, which drew it pale grey, and a
    // pale link on a sign-in page reads as broken (Wave 4).
    if (email === "") {
      emailRef.current?.reportValidity();
      emailRef.current?.focus();
      return;
    }
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
            <p className="eyebrow">{PRODUCT_NAME}</p>
            <h1>Sign in</h1>
          </div>

          <Card>
            <form onSubmit={onSubmit}>
              <FieldStack>
                <Field label="Email">
                  <Input
                    ref={emailRef}
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
                    If that address has an account, a sign-in link is on its way. It works once.
                  </Notice>
                ) : (
                  <Button
                    variant="link"
                    loading={linkBusy}
                    onClick={() => void sendLink()}
                  >
                    Email me a sign-in link instead
                  </Button>
                )}

                {/* AND THE OTHER THING THAT EMAIL FIXES, which is not the same
                    thing and used not to exist at all (0082).

                    A sign-in link gets somebody IN; it does not give them back
                    a password. That distinction is invisible to a colleague,
                    who mostly has no password anyway — and it is the whole
                    story for a client contact, who chose one on their
                    invitation, forgot it, and cannot be re-invited: the firm
                    re-issuing that invitation would be the firm resetting its
                    own client's password, which the API refuses on purpose.
                    Before this link they came back to this page and used the
                    sign-in link every time, forever.

                    It carries no state and does not need the email typed above
                    — the next page asks for it — so it is a plain navigation
                    rather than a third thing this form can submit. */}
                <Button
                  variant="link"
                  onClick={() => {
                    router.push("/auth/forgot-password");
                  }}
                >
                  Forgot your password?
                </Button>
              </FieldStack>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
