"use client";

/**
 * The client portal's own frame (T6.5).
 *
 * ── A SECOND AUDIENCE'S APP, NOT A SCREEN BOLTED ONTO THE WORKSPACE ───────
 *
 * The staff shell is a map of twenty-six screens and an org switcher. A
 * client's contact has one screen, one firm and, usually, one company: that nav
 * would be a column of links they can never open, and the first thing the
 * product would tell them is how much of it is not for them. So `AppShell`
 * treats `/portal` as bare and this renders instead — the same design language
 * (`.topbar`, `.brand`, `.page` unchanged), a different app.
 *
 * ── IT SAYS WHOSE FIRM AND WHOSE COMPANY, AND BOTH MATTER ────────────────
 *
 * A portal is a page about a client's own affairs sent by somebody else. Not
 * naming the firm leaves the reader with no idea who is doing the work, and not
 * naming the company is the failure a contact for two group companies hits on
 * their first visit: the same four filings, and no way to tell which set is on
 * screen. Both come from `/auth/me`, resolved once by the API.
 *
 * ── AND IT REFUSES TO RENDER FOR STAFF ───────────────────────────────────
 *
 * A colleague opening this URL is sent to the workspace rather than shown an
 * empty portal. `/api/v1/portal/home` answers them 403 for the same reason —
 * an empty page would read as "this client has nothing going on", which is a
 * wrong answer that looks like a right one.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { Principal } from "@/lib/api/client";
import { Button } from "@/components/ui";

const PortalSessionContext = createContext<Principal | null>(null);

/** Who is signed in, as the portal frame already knows it. `null` before
 *  `/auth/me` answers. */
export function usePortalSession(): Principal | null {
  return useContext(PortalSessionContext);
}

/**
 * The one route under `/portal` that must render with NO session.
 *
 * Accepting an invitation is what CREATES the session — the backend lists
 * `POST /api/v1/portal-invites/accept` as its fifth public path for exactly
 * that reason — so a frame that redirected an anonymous visitor to `/login`
 * would make the emailed link useless at the moment it is used.
 */
function isOpenRoute(pathname: string): boolean {
  return pathname === "/portal/accept-invite";
}

export function PortalFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const open = isOpenRoute(pathname);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) return;
    let live = true;
    void (async () => {
      const me = await api.GET("/api/v1/auth/me", {});
      if (!live) return;
      setPrincipal(me.data ?? null);
      setChecked(true);
    })();
    return () => {
      live = false;
    };
  }, [open, pathname]);

  useEffect(() => {
    if (open || !checked) return;
    // Not signed in → the ordinary sign-in page; there is only one.
    if (principal === null) {
      router.push("/login");
      return;
    }
    // Signed in as STAFF → the workspace. Not an error and not a refusal to
    // explain: a colleague who followed a client's link has simply opened the
    // wrong half of the product.
    if (principal.audience === "STAFF") router.push("/");
  }, [open, checked, principal, router]);

  if (open) return <div className="portal">{children}</div>;
  // Before the answer, and while a redirect is in flight, render the frame with
  // nothing in it rather than a flash of somebody else's page.
  if (!checked || principal === null || principal.audience === "STAFF") {
    return <div className="portal" />;
  }

  const companies = principal.portalScope ?? [];

  return (
    <PortalSessionContext.Provider value={principal}>
      <div className="portal">
        <header className="topbar">
          <Link href="/portal" className="brand">
            <span className="mark" aria-hidden="true">
              10x
            </span>
            <span className="brand-id">
              {/* The FIRM's name, not the product's. This page is a firm
                  talking to its client, and "BiB" means nothing to the reader.
                  `tenantName` is null only in a state that cannot normally
                  happen — a session pointed at a tenant row that is gone — and
                  the fallback is a sentence rather than an empty space. */}
              <b>{principal.tenantName ?? "Your accountants"}</b>
              <span>Client portal</span>
            </span>
          </Link>

          <div className="cluster tight">
            <span className="crumb">
              {/* WHICH COMPANY, by name. A contact granted two sees both, and
                  the one thing they must never have to guess is which set of
                  filings is on the page. Empty is not drawn here — the page
                  itself says what that means, at length, rather than the bar
                  saying it in three words. */}
              {companies.length > 0 && (
                <b>{companies.map((c) => c.clientName).join(" · ")}</b>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void (async () => {
                  // A real call: the session is server-side and revocable, so
                  // signing out is something the server does, not a local
                  // store being cleared.
                  await api.POST("/api/v1/auth/logout", {});
                  router.push("/login");
                })();
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        {children}
      </div>
    </PortalSessionContext.Provider>
  );
}
