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
            The book, the pipeline, what the firm has quoted, and what it has agreed.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <Link href="/clients">Clients →</Link>
            <Link href="/leads">Pipeline →</Link>
            <Link href="/proposals">Proposals →</Link>
            <Link href="/engagement-letters">Engagement letters →</Link>
            {/* Billing sits with the rest of the commercial work rather than
                under administration: raising an invoice and recording a payment
                are `party:write`, the same permission drafting takes. Only
                ISSUING and crediting need tenant:admin, and those gates live on
                the invoice itself. */}
            <Link href="/invoices">Invoices →</Link>
            <Link href="/receivables">Receivables →</Link>
            {/* Reading the catalogue is config:read — an associate quotes from
                it, so it is not an admin screen. Changing it is tenant:admin,
                and that half of the page appears only for somebody who holds it. */}
            {principal.permissions.includes("config:read") && (
              <Link href="/catalogue">Catalogue →</Link>
            )}
          </div>
        </div>
      )}

      {/* DELIVERY — the other half of the product, and until T2.7 it had no
          screen at all. `party:read` because a work board is what everybody on
          the delivery team looks at; the one act that changes something,
          ticking a step off, is gated on `work:write` inside the screen. */}
      {principal.permissions.includes("party:read") && (
        <div className="bib-card" style={{ marginTop: "var(--bib-gap-2)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Delivery</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            What a signed engagement turned into: the steps, who they are waiting on, and how
            far each piece of work has got.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            {/* TWO screens, and they answer two questions. The board is what is
                owed and whose it is — a client, a due date, a name. The engine
                is HOW it gets done: which process a job is walking and which
                step it is on. A firm that has published no process still has
                work, which is why the board comes first. */}
            <Link href="/work-items">Work board →</Link>
            <Link href="/work">The engine →</Link>
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
            Who works here, what their roles mean, and the rules documents and leads are
            written by.
          </p>
          <div className="bib-nav" style={{ marginBottom: 0 }}>
            <Link href="/admin/people">People →</Link>
            <Link href="/admin/roles">Roles →</Link>
            <Link href="/admin/grades">Grades →</Link>
            {/* The words the firm uses for work — the states a task moves
                through and how urgent it can be. An admin screen because the
                TICK BOXES on those rows decide what every task in that state
                must carry, and moving the statutory default changes the urgency
                of every filing raised afterwards. */}
            <Link href="/admin/work-vocabulary">Work states →</Link>
            {/* How the firm does its work — the steps a job walks. Without this
                screen the engine has no way in, which is what T2.7 shipped
                without and this closes. */}
            <Link href="/admin/workflows">Processes →</Link>
            {/* Two more things a firm decides for itself: the prose every new
                document is written with, and whose desk covers which country. */}
            <Link href="/admin/document-blocks">Standard prose →</Link>
            <Link href="/admin/territories">Territories →</Link>
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
