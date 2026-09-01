"use client";

/**
 * Where an invitation lands (T6.5).
 *
 * The backend has emailed a link to this exact path since the invite flow
 * shipped — `identity/service.ts` builds `${base}/portal/accept-invite?token=…`
 * — and until now the page did not exist, so the one route out of "invited" and
 * into "signed in" ended on a 404. That is the gap this file closes.
 *
 * ── NO SESSION HERE, AND THAT IS THE POINT ────────────────────────────────
 *
 * The token IS the authorisation: whoever holds the link becomes that person by
 * setting a password. `POST /api/v1/portal-invites/accept` is the API's fifth
 * public path for exactly that reason, and `PortalFrame` treats this route as
 * open so an anonymous visitor is not bounced to `/login` at the moment the
 * link is being used.
 *
 * ── ONE CALL SETS THE PASSWORD AND OPENS THE SESSION ──────────────────────
 *
 * Deliberately, on the API's side: a route that only set the password would
 * leave somebody holding a spent token and a login screen, and one that only
 * signed them in is a magic link that leaves them with no password at all. So
 * success here means a session cookie already exists, and the next thing to do
 * is go to the portal.
 *
 * ── AND EVERY FAILURE READS THE SAME ──────────────────────────────────────
 *
 * Unknown, expired, already used and wrong-purpose all answer identically, so
 * nothing here can be used to discover whether an address has an account. The
 * message is shown VERBATIM for that reason — a friendlier local rewrite would
 * leak precisely what the API refused to say.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Button, Card, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

export default function AcceptInvitePage() {
  // `useSearchParams` needs a suspense boundary in the App Router, and a page
  // that reads a token from the query is the case it exists for.
  return (
    <Suspense fallback={<main className="signin" />}>
      <AcceptInvite />
    </Suspense>
  );
}

function AcceptInvite() {
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
    // locally also leaves the token unspent, so a mistyped confirmation costs
    // nothing.
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/portal-invites/accept", {
      body: { token, password },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    // The session cookie is already set. Straight in — asking somebody to sign
    // in again with the password they have just chosen is the product doubting
    // its own call.
    router.push("/portal");
  }

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">Client portal</p>
            <h1>Choose a password</h1>
          </div>

          <Card>
            {token === "" ? (
              /* A link with no token at all. Its own message, because it is a
                 different fault from a spent one and has a different fix:
                 something truncated the link, so the whole of it is what to
                 paste. */
              <Notice tone="warn" eyebrow="This link is incomplete">
                Open the link from your invitation email in full — it carries a code that this
                page needs. If it keeps failing, ask your accountants to send a new invitation.
              </Notice>
            ) : (
              <form onSubmit={onSubmit}>
                <FieldStack>
                  <Field
                    label="New password"
                    hint="Your accountants never see this and cannot read it."
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); }}
                    />
                  </Field>

                  <Field label="Type it again">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); }}
                    />
                  </Field>

                  <ErrorNotice error={error} />

                  <Button type="submit" loading={busy} block>
                    Set password and sign in
                  </Button>
                </FieldStack>
              </form>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
