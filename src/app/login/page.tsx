"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, apiError } from "@/lib/api/client";

/**
 * Sign in.
 *
 * There is no token handling here and there cannot be: the API replies with an
 * httpOnly cookie, which no script can read. The browser holds it and sends it
 * on every subsequent call because the client sets credentials: "include".
 * That is the point of httpOnly — a cross-site script that runs on this page
 * still cannot steal the session.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: failed } = await api.POST("/api/v1/auth/login", {
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
    router.push("/");
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p className="bib-muted">10X Workspace</p>

      <form className="bib-card" onSubmit={onSubmit} style={{ marginTop: "var(--bib-gap-3)" }}>
        <div style={{ marginBottom: "var(--bib-gap-2)" }}>
          <label className="bib-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="bib-input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "var(--bib-gap-2)" }}>
          <label className="bib-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="bib-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error !== null && (
          <p className="bib-error" style={{ marginBottom: "var(--bib-gap-2)" }}>{error}</p>
        )}

        <button className="bib-button" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
