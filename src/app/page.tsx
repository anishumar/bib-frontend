"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { Membership, Principal } from "@/lib/api/client";

/**
 * The workspace home, and T1.8's acceptance in one screen: the app boots,
 * authenticates, and makes a real authenticated call through the generated
 * client.
 *
 * It reads /auth/me and /tenancy/me/memberships — the org switcher's data.
 * Both go out with the session cookie; a 401 means the session is gone or was
 * revoked (the API re-checks the membership on EVERY request, so being removed
 * from a firm ends access here on the next call, not at expiry).
 */
export default function HomePage() {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const me = await api.GET("/api/v1/auth/me", {});
      if (!live) return;
      if (me.error) {
        // Not signed in is an ordinary state, not a failure to report.
        router.push("/login");
        return;
      }
      setPrincipal(me.data);

      const mine = await api.GET("/api/v1/tenancy/me/memberships", {});
      if (!live) return;
      if (mine.error) {
        setError(apiError(mine.error).message);
        return;
      }
      setMemberships(mine.data.memberships);
    })();

    return () => {
      live = false;
    };
  }, [router]);

  async function signOut(): Promise<void> {
    await api.POST("/api/v1/auth/logout", {});
    router.push("/login");
  }

  if (!principal) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <h1>10X Workspace</h1>

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Session</h2>
        <p className="bib-mono bib-muted" style={{ margin: 0 }}>
          user {principal.userId}
        </p>
        <p className="bib-mono bib-muted" style={{ margin: 0 }}>
          {principal.tenantId === null
            ? "no org selected — this session belongs to more than one firm"
            : `acting for ${principal.tenantId} as ${principal.role ?? "?"}`}
        </p>
        {principal.permissions.length > 0 && (
          <p className="bib-mono bib-muted" style={{ margin: 0 }}>
            may {principal.permissions.join(", ")}
          </p>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Memberships</h2>
        {error !== null && <p className="bib-error">{error}</p>}
        {memberships.length === 0 && error === null && (
          <p className="bib-muted" style={{ margin: 0 }}>No active memberships.</p>
        )}
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {memberships.map((m) => (
            <li key={m.id} className="bib-mono">
              {m.role} · {m.audience} · <span className="bib-muted">{m.tenantId}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* The commercial work. Offered to anyone who may read the firm's book,
          which is the permission the API actually gates the list on. */}
      {principal.permissions.includes("party:read") && (
        <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Commercial</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            The book, the pipeline, and what the firm has quoted.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <Link href="/clients">Clients →</Link>
            <Link href="/leads">Pipeline →</Link>
            <Link href="/proposals">Proposals →</Link>
            {/* Reading the catalogue is config:read — an associate quotes from
                it, so it is not an admin screen. Changing it is tenant:admin,
                and that half of the page appears only for somebody who holds it. */}
            {principal.permissions.includes("config:read") && (
              <Link href="/catalogue">Catalogue →</Link>
            )}
          </div>
        </div>
      )}

      {/* The whole trail names every client the firm has, which is why it is a
          ledger:read screen and not a general one. */}
      {principal.permissions.includes("ledger:read") && (
        <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Audit trail</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            Every state transition the firm has made. Append-only.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <Link href="/audit">Open the log →</Link>
          </div>
        </div>
      )}

      {/* Offered only to somebody who can actually use it. /auth/me now says
          what the session may DO, not only who it is, so this app no longer has
          to show everything and let the API refuse — which was accurate but is
          not the same as not offering it. */}
      {principal.permissions.includes("tenant:admin") && (
        <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Administration</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            Who works here, and what their roles mean.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <Link href="/admin/people">People →</Link>
            <Link href="/admin/roles">Roles →</Link>
          </div>
        </div>
      )}

      <button
        className="bib-button"
        style={{ marginTop: "var(--bib-gap-3)" }}
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </main>
  );
}
