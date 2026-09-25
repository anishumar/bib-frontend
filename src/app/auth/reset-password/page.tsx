"use client";

/**
 * Where a reset link lands (0082).
 *
 * The path and the query name are NOT chosen here — the backend composes the
 * letter as `${appBaseUrl}/auth/reset-password?token=…`, so this route exists at
 * that address and reads that parameter. Anything else and every reset link the
 * product has ever sent would 404 at the worst possible moment: in front of
 * somebody who is already locked out.
 *
 * ── NO SESSION, AND THE TOKEN IS THE AUTHORISATION ────────────────────────
 *
 * Whoever holds this link becomes that person by choosing a password, which is
 * why the API's public list argues for it at length. `/auth/` is a bare route
 * in `AppShell`, so an anonymous visitor is not bounced to `/login` at the
 * moment the link is being used.
 *
 * ── ONE CALL REPLACES THE PASSWORD AND OPENS THE SESSION ──────────────────
 *
 * Deliberately, on the API's side, and for the reason the invitation page gives:
 * a route that only set the password would leave somebody holding a spent token
 * and a login screen. So success here means the session cookie already exists
 * and the next thing to do is go in — asking somebody to sign in again with the
 * password they chose four seconds ago is the product doubting its own call.
 *
 * ── IT IS A FORM, NOT AN EFFECT ───────────────────────────────────────────
 *
 * The difference from `/auth/magic-link`, and it matters. That page spends its
 * token on mount, which is why it needs a ref to survive React's double-mount
 * and a mail scanner's pre-fetch. This one cannot be spent by arriving: nothing
 * is sent until somebody types a password and submits. A scanner that follows
 * the link reads a form and burns nothing.
 *
 * ── AND EVERY FAILURE READS THE SAME ──────────────────────────────────────
 *
 * Unknown, expired, already used and wrong-purpose all answer identically, so
 * nothing here can be used to discover whether an address has an account. The
 * message is shown VERBATIM for that reason.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { homeFor } from "@/lib/api/home";
import { Button, Card, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

export default function ResetPasswordPage() {
  // `useSearchParams` needs a suspense boundary in the App Router, and a page
  // that reads a token from the query is the case it exists for.
  return (
    <Suspense fallback={<main className="signin" />}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    // Checked HERE and not by the API, because the two are different questions:
    // the API is told one password and cannot know it was typed twice. Failing
    // locally also leaves the token UNSPENT, so a mistyped confirmation costs
    // nothing — which matters more here than anywhere, because the person is
    // locked out and the link is the only way back.
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: failed } = await api.POST("/api/v1/auth/password-reset/confirm", {
      body: { token, password },
    });
    if (failed) {
      setError(apiError(failed).message);
      setBusy(false);
      return;
    }
    // TWO AUDIENCES RESET THEIR PASSWORDS HERE, and only one of them belongs in
    // the workspace — the same rule the login form and the magic link follow.
    // A client contact sent to `/` lands on the staff home with an empty
    // sidebar and every screen behind it answering 403.
    router.push(homeFor(data));
  }

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">10X Workspace</p>
            <h1>Choose a new password</h1>
          </div>

          <Card>
            {token === "" ? (
              /* A link with no token at all. Its own message, because it is a
                 different fault from a spent one and has a different fix:
                 something truncated the link, so the whole of it is what to
                 paste. */
              <Notice tone="warn" eyebrow="This link is incomplete">
                Open the full link from the email. It carries a code this page needs. If it
                keeps failing, ask for a new link from the sign-in page.
              </Notice>
            ) : (
              <form onSubmit={onSubmit}>
                <FieldStack>
                  <Field
                    label="New password"
                    hint="At least 12 characters. Length is the only rule — a long passphrase beats a short one with symbols."
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                      }}
                    />
                  </Field>

                  <Field label="Type it again">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                      }}
                    />
                  </Field>

                  {/* Said before it happens, not after. Every other session
                      this account holds dies the moment this succeeds, which is
                      the right behaviour and a surprise to anybody signed in on
                      a phone — and it is also the sentence that makes the
                      feature useful to somebody resetting BECAUSE they think
                      another person is in there. */}
                  <Notice tone="neutral">
                    Setting this signs you out everywhere else and signs you in here.
                  </Notice>

                  <ErrorNotice error={error} />

                  <Button type="submit" loading={busy} block>
                    Set password and sign in
                  </Button>
                </FieldStack>
              </form>
            )}
          </Card>

          {/* THE COMMONEST WAY TO MEET THE REFUSAL ABOVE, found on the first
              walk: somebody asks for a link, the letter is slow, they ask again
              — and then open the FIRST letter, because it is higher up the
              inbox. Asking again cancels every earlier link on purpose (two
              live password setters in one mailbox is the thing being
              prevented), so the fix is always the same and worth saying before
              anybody needs it. Said here and not in the API's message, because
              only RESET links behave this way; sign-in links do not cancel
              each other. */}
          <p className="muted">
            Asked for more than one link? Only the most recent one works — each new request
            cancels the ones before it.
          </p>
          <Button
            variant="link"
            onClick={() => {
              router.push("/auth/forgot-password");
            }}
          >
            Ask for a new link
          </Button>
        </div>
      </div>
    </main>
  );
}
