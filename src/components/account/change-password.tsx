"use client";

/**
 * Changing your own password — the same card for both audiences (0082).
 *
 * ── WHY ONE COMPONENT AND TWO ROUTES ──────────────────────────────────────
 *
 * The staff workspace and the client portal are two apps that share a design
 * language and nothing else, and everything else in this codebase keeps them
 * apart on purpose. This is the one screen where that would buy nothing: a
 * password belongs to the ACCOUNT, which is global (one login, however many
 * firms), and `POST /api/v1/auth/password` is on the portal's allowed list for
 * exactly that reason. Two copies of this form would be two places to get the
 * "signs you out everywhere else" warning wrong.
 *
 * The frames differ, so the ROUTES differ — `/account` sits inside `AppShell`,
 * `/portal/account` inside `PortalFrame` — and each passes its own wording for
 * the one sentence where the audiences genuinely differ.
 *
 * ── THE TWO STATES, AND WHY THE SCREEN HAS TO KNOW WHICH ──────────────────
 *
 * `principal.hasPassword` is on the wire because of this card. Most colleagues
 * at a firm have never had a password: they were added, the product emailed
 * them a sign-in link, and they have used links ever since. Showing all of them
 * a change form whose only possible outcome is a 409 would be the product
 * discovering its own state from a refusal — so an account with no password is
 * offered the thing that WILL work, which is the emailed link.
 *
 * And the first password is set that way rather than here on purpose. A session
 * is a bearer credential; one that could mint a password would outlive every
 * revocation the firm has, and the person it was taken from would have no
 * password of their own to notice had changed.
 */

import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Button, Card, CardHead, CardTitle, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

export function ChangePassword({
  hasPassword,
  email,
  /** What the "everywhere else" sentence should say. A colleague reads it as
   *  other browsers and a phone; a client contact may share the login with a
   *  colleague of their own, and being told plainly is the difference between
   *  a feature and a surprise. */
  elsewhere,
  /** Called after the password changes, so the page can re-read the principal:
   *  `hasPassword` has just become true and the session has been replaced. */
  onChanged,
}: {
  hasPassword: boolean;
  email: string | null;
  elsewhere: string;
  onChanged?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    // Locally, because the API is told one password and cannot know it was
    // typed twice — and failing here spends nothing.
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: failed } = await api.POST("/api/v1/auth/password", {
      body: { currentPassword: current, password: next },
    });
    setBusy(false);
    if (failed) {
      // Verbatim. Several of these are carefully worded — "that is the password
      // already on this account", "this account has no password yet" — and each
      // names the thing to do next.
      setError(apiError(failed).message);
      return;
    }
    // The cookie now carries a NEW session: the old one was revoked along with
    // every other. Nothing to do about that here — the browser has already been
    // handed the replacement — but the fields hold a password and must not.
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
    onChanged?.();
  }

  /** The way in for an account that has none: the same reset letter the sign-in
   *  page sends, asked for on the caller's own behalf. */
  async function emailSetupLink(): Promise<void> {
    if (email === null) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await api.POST("/api/v1/auth/password-reset", {
      body: { email },
    });
    setBusy(false);
    if (failed) {
      setError(apiError(failed).message);
      return;
    }
    setLinkSent(true);
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{hasPassword ? "Change your password" : "Set a password"}</CardTitle>
      </CardHead>

      {hasPassword ? (
        <form onSubmit={onSubmit}>
          <FieldStack>
            {/* No hint (Wave 4). Being signed in does not stand in for the
                current password: that stops a stolen session becoming a
                permanent one. */}
            <Field label="Current password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                }}
              />
            </Field>

            <Field
              label="New password"
              hint="At least 12 characters. A long phrase works best."
            >
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
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

            {/* Before it happens, not after. Everything else holding the old
                password stops working the moment this succeeds, which is the
                behaviour anybody changing a password wants and a surprise to
                anybody who did not know it was coming. */}
            <Notice tone="neutral">{elsewhere}</Notice>

            <ErrorNotice error={error} />

            {done ? (
              <Notice tone="ok" eyebrow="Changed">
                Your password has been changed. This tab is still signed in on a new session;
                everywhere else has been signed out.
              </Notice>
            ) : null}

            <Button type="submit" loading={busy}>
              Change password
            </Button>
          </FieldStack>
        </form>
      ) : (
        <FieldStack>
          {/* NOT a form. There is no current password to check, so this card
              cannot be the thing that sets the first one — see the note at the
              top of this file. */}
          <Notice tone="neutral" eyebrow="No password yet">
            You sign in with emailed links. To set a password, we email you a link.
          </Notice>

          <ErrorNotice error={error} />

          {linkSent ? (
            <Notice tone="ok" eyebrow="Check your email">
              A link to set a password is on its way to {email ?? "your address"}. It works
              once and stops working after half an hour.
            </Notice>
          ) : (
            <Button
              loading={busy}
              disabled={email === null}
              onClick={() => void emailSetupLink()}
            >
              Email me a link to set one
            </Button>
          )}
        </FieldStack>
      )}
    </Card>
  );
}
