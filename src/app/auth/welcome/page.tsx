"use client";

/**
 * Where a NEW COLLEAGUE's welcome link lands (audit 2026-10-03, CA#38).
 *
 * The welcome used to sign them in and stop, and the only way to a password
 * was "Email me a link to set one" on Your account, which arrived as "Reset
 * your password" for a password they never had. So the first sign-in is now
 * "Choose your password": the link proves the mailbox, and the API sets the
 * password and opens the session in one call (`POST /auth/magic-link/redeem`
 * with a `password`).
 *
 * SKIPPING IS ALLOWED, because sign-in links are a way in for every account in
 * this product: the login page's "Email me a sign-in link" works whether or
 * not a password was ever set. Skip spends the same link without a password.
 *
 * Only a colleague with NO password is sent here. One who already has a
 * password (identity is global, so a second firm's welcome reaches them) gets
 * a plain sign-in link instead; if one of them lands here anyway, the API
 * refuses the password without spending the link, and Skip still works.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { homeFor } from "@/lib/api/home";
import { PRODUCT_NAME } from "@/lib/brand";
import { Button, Card, ErrorNotice, Field, FieldStack, Input, Notice } from "@/components/ui";

export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="signin" />}>
      <ChooseFirstPassword />
    </Suspense>
  );
}

function ChooseFirstPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"set" | "skip" | null>(null);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    // Checked here: the API is told one password and cannot know it was typed
    // twice. Failing locally leaves the link unspent.
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy("set");
    setError(null);
    const { data, error: failed } = await api.POST("/api/v1/auth/magic-link/redeem", {
      body: { token, password },
    });
    if (failed) {
      setError(apiError(failed).message);
      setBusy(null);
      return;
    }
    router.push(homeFor(data));
  }

  async function skip(): Promise<void> {
    setBusy("skip");
    setError(null);
    const { data, error: failed } = await api.POST("/api/v1/auth/magic-link/redeem", {
      body: { token },
    });
    if (failed) {
      setError(apiError(failed).message);
      setBusy(null);
      return;
    }
    router.push(homeFor(data));
  }

  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">{PRODUCT_NAME}</p>
            <h1>Choose your password</h1>
          </div>

          <Card>
            {token === "" ? (
              <Notice tone="warn" eyebrow="This link is incomplete">
                Open the full link from the email. If it keeps failing, ask for a sign-in link on
                the sign-in page.
              </Notice>
            ) : (
              <form onSubmit={onSubmit}>
                <FieldStack>
                  <Field label="Password" hint="At least 12 characters. A long phrase works best.">
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

                  <ErrorNotice error={error} />

                  <Button type="submit" loading={busy === "set"} disabled={busy === "skip"} block>
                    Set password and sign in
                  </Button>

                  <Button
                    variant="link"
                    loading={busy === "skip"}
                    disabled={busy === "set"}
                    onClick={() => void skip()}
                  >
                    Skip for now and sign in
                  </Button>
                </FieldStack>
              </form>
            )}
          </Card>

          <p className="muted">
            Skipped it? Use &ldquo;Email me a sign-in link&rdquo; on the sign-in page, or set a
            password later on Your account.
          </p>
        </div>
      </div>
    </main>
  );
}
