"use client";

/**
 * Where somebody goes when they cannot get in (0082).
 *
 * ── WHAT THIS CLOSES, AND FOR WHOM ────────────────────────────────────────
 *
 * Two different dead ends, both reached from the same page:
 *
 *   A CLIENT CONTACT chose their password once, on the invitation link, and
 *   that link is spent. Forgetting it used to be final — the firm cannot
 *   re-invite them (the API refuses, on purpose: a firm that could re-issue an
 *   invitation could reset its own client's password), and the sign-in link
 *   gets them in without fixing anything, so the same wall is there next time.
 *
 *   A COLLEAGUE usually has no password at all — the firm adds them and the
 *   product emails a sign-in link — so this is also where a FIRST password gets
 *   set. Nothing on this page says which of the two is happening, because the
 *   API will not say either.
 *
 * ── THE ANSWER IS THE SAME SENTENCE WHATEVER HAPPENED ─────────────────────
 *
 * 202 for an address with an account, 202 for one without, 202 for a
 * deactivated login, 202 when the relay is down. The endpoint must not reveal
 * who banks with the firm — a client list is exactly what is being protected —
 * and it holds every one of those answers to the same constant time so it
 * cannot be asked with a stopwatch either. So there is no "we found your
 * account" here and there never will be: a friendlier confirmation is precisely
 * the leak the 202 exists to prevent.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { PRODUCT_NAME } from "@/lib/brand";
import { Button, Card, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failed } = await api.POST("/api/v1/auth/password-reset", {
      body: { email },
    });
    setBusy(false);
    // The only failure reachable here is a malformed address or the network —
    // the API answers 202 to everything else by design. Shown verbatim, like
    // every other refusal in this app.
    if (failed) {
      setError(apiError(failed).message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">{PRODUCT_NAME}</p>
            <h1>Reset your password</h1>
          </div>

          <Card>
            {sent ? (
              <div className="stack tight">
                <Notice tone="ok" eyebrow="Check your email">
                  If that address has an account, a reset link is on its way. It works once,
                  for half an hour. Asking again cancels it, so open the newest email.
                </Notice>
                {/* Not a dead end. Somebody whose letter does not arrive has to
                    be able to try a different address without going back
                    through the sign-in page to find this one again. */}
                <Button
                  variant="link"
                  onClick={() => {
                    setSent(false);
                  }}
                >
                  Use a different address
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <FieldStack>
                  <Field
                    label="Email"
                    hint="The address the firm has for you."
                  >
                    <Input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                      }}
                    />
                  </Field>

                  <ErrorNotice error={error} />

                  <Button type="submit" loading={busy} block>
                    Email me a reset link
                  </Button>
                </FieldStack>
              </form>
            )}
          </Card>

          <Button
            variant="link"
            onClick={() => {
              router.push("/login");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </div>
    </main>
  );
}
