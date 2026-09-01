"use client";

/**
 * The client portal's own frame (T6.5, re-shaped at T6.7).
 *
 * ── A SECOND AUDIENCE'S APP, NOT A SCREEN BOLTED ONTO THE WORKSPACE ───────
 *
 * That part has not changed and will not: `AppShell` treats `/portal` as bare
 * and this renders instead. What HAS changed twice is how much furniture the
 * client's half of the product earns, and it is worth recording both turns
 * because the second one reverses the first.
 *
 * **T6.5 said: no nav at all.** A client's contact had ONE screen, one firm and
 * usually one company. A column of links would have been a column of links they
 * could not follow, and the first thing the product would have told them is how
 * much of it is not for them.
 *
 * **T6.7 gave it four tabs**, because the library only works if a client can
 * reach it, and one reachable by scrolling past four sections of today's news is
 * not self-serve.
 *
 * **AND THEN LOOKING AT IT SETTLED IT (Shrestha, 2026-09-01): "everything looks
 * messy".** The tab strip ran the full width of the window with four small
 * labels jammed at the far left, above a centred column of content — so the
 * navigation and the thing it navigated did not line up, and the page read as
 * something half-built rather than as an app. Four sections is enough to deserve
 * a real frame, and the staff shell already IS that frame.
 *
 * So the portal is now `.shell` + `.sidebar` + `.main`, reusing every class the
 * workspace uses — `.brand`, `.nav`, `.nav-link`, `.nav-icon`, `.sidebar-foot`,
 * `.who`, `.avatar`, `.topbar`, `.crumb` — with **not one line of new CSS**.
 * That is the rule `.portal` itself was written under, applied properly this
 * time: *a different audience, not a different design language, and a client who
 * is also a colleague must not feel they have opened somebody else's product.*
 *
 * ── WHAT IT DELIBERATELY DOES NOT COPY FROM THE STAFF SHELL ──────────────
 *
 * The staff sidebar is twenty-six links in collapsible groups over a search box,
 * plus a firm switcher. This one is FOUR FLAT LINKS and none of that:
 *
 * · **No groups.** Four items have no structure to hide.
 * · **No search box.** Searching four things is furniture that implies there is
 *   more behind it. The library has its own search, over the thing a client
 *   actually hunts through.
 * · **No firm switcher.** A contact belongs to one firm's portal; a client of
 *   two firms has two logins at two addresses.
 * · **ICONS, though — and the staff nav's own rule says why.** *"An icon
 *   separates things sitting beside each other at the same level"*, which is
 *   exactly what a flat list of four is; it is nested CHILDREN that carry none.
 *
 * ── IT SAYS WHOSE FIRM AND WHOSE COMPANY, AND BOTH STILL MATTER ──────────
 *
 * A portal is a page about a client's own affairs sent by somebody else. Not
 * naming the firm leaves the reader with no idea who is doing the work, and not
 * naming the company is the failure a contact for two group companies hits on
 * their first visit: the same four filings, and no way to tell which set is on
 * screen. The firm is the brand block, the companies are under the reader's own
 * name and in the topbar crumb.
 *
 * ── AND IT REFUSES TO RENDER FOR STAFF ───────────────────────────────────
 *
 * A colleague opening this URL is sent to the workspace rather than shown an
 * empty portal. `/api/v1/portal/home` answers them 403 for the same reason — an
 * empty page would read as "this client has nothing going on", which is a wrong
 * answer that looks like a right one.
 */

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { Principal } from "@/lib/api/client";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icon";
import { ThemeSwitch } from "@/components/layout/theme";

const PortalSessionContext = createContext<Principal | null>(null);

/** Who is signed in, as the portal frame already knows it. `null` before
 *  `/auth/me` answers. */
export function usePortalSession(): Principal | null {
  return useContext(PortalSessionContext);
}

/**
 * The whole of the client's product, in four lines.
 *
 * Ordered by what a client arrives WANTING rather than by what the firm finds
 * important: what is happening and what is wanted from me first (they are one
 * screen), then the thing they hunt for, then money, then the record. There is
 * deliberately no fifth — every addition here has to displace one of these four
 * or admit it is the firm's convenience rather than the client's.
 */
const NAV: readonly { href: Route; label: string; icon: IconName }[] = [
  { href: "/portal" as Route, label: "What's happening", icon: "home" },
  { href: "/portal/documents" as Route, label: "Documents", icon: "files" },
  { href: "/portal/invoices" as Route, label: "Invoices", icon: "invoices" },
  { href: "/portal/month" as Route, label: "Month by month", icon: "calendar" },
];

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

  // ACCEPTING AN INVITATION HAS NO FRAME AT ALL, and keeps `.portal`: there is
  // no session yet, so there is nothing to put in a sidebar and nobody to name
  // in it. The sign-in page makes the same choice from the other end.
  if (open) return <div className="portal">{children}</div>;

  // Before the answer, and while a redirect is in flight, render nothing rather
  // than a flash of somebody else's page.
  if (!checked || principal === null || principal.audience === "STAFF") {
    return <div className="portal" />;
  }

  const companies = principal.portalScope ?? [];
  const whose = companies.map((c) => c.clientName).join(" · ");

  return (
    <PortalSessionContext.Provider value={principal}>
      <div className="shell">
        <aside className="sidebar">
          {/* THE FIRM'S NAME, not the product's. This page is a firm talking to
              its client, and "BiB" means nothing to the reader. `tenantName` is
              null only in a state that cannot normally happen — a session
              pointed at a tenant row that is gone — and the fallback is a
              sentence rather than an empty space. */}
          <Link href="/portal" className="brand">
            <span className="mark" aria-hidden="true">
              10x
            </span>
            <span className="brand-id">
              <b>{principal.tenantName ?? "Your accountants"}</b>
              <span>Client portal</span>
            </span>
          </Link>

          {/* NO SEARCH BOX ABOVE THIS, and no groups inside it — see the header.
              Four items have no structure to hide, and a search over four things
              implies there is more behind it. */}
          <nav className="nav" aria-label="Your portal">
            {NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link nav-top"
                  aria-current={current ? "page" : undefined}
                >
                  <Icon name={item.icon} className="nav-icon" />
                  <span className="label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            {/* WHO IS SIGNED IN. The second line is the COMPANY and not a role,
                which is where this differs from the staff shell on purpose: a
                client contact's role (`client_contact` / `client_viewer`) is the
                FIRM's word for what they may do, and printing it would show
                somebody a label about their own permissions that they cannot act
                on. Which company they are looking at is the fact they need — and
                it is how a contact for two group companies tells one set of
                filings from another.

                Empty is a REAL state and gets its own sentence: invited, and
                granted nothing yet. The page itself says that at length; this
                says it in four words so the rail never looks broken. */}
            <div className="who">
              <span className="avatar" aria-hidden="true">
                {initials(principal.displayName ?? principal.email ?? "Client")}
              </span>
              <span className="who-id">
                <span className="n">
                  {principal.displayName ?? principal.email ?? "Signed in"}
                </span>
                <span className="r">{whose === "" ? "No company shared yet" : whose}</span>
              </span>
            </div>
            <Button
              variant="link"
              icon={<Icon name="signout" size={15} />}
              onClick={() => {
                void (async () => {
                  // A real call: the session is server-side and revocable, so
                  // signing out is something the server does, not a local store
                  // being cleared.
                  await api.POST("/api/v1/auth/logout", {});
                  router.push("/login");
                })();
              }}
            >
              Sign out
            </Button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            {/* The firm and the companies again, for the reader whose eyes are
                on the CONTENT rather than on the rail. The staff topbar carries
                the same pair for the same reason. */}
            <p className="crumb">
              <b>{principal.tenantName ?? "Your accountants"}</b>
              {whose !== "" && ` · ${whose}`}
            </p>
            <ThemeSwitch />
          </header>
          {children}
        </div>
      </div>
    </PortalSessionContext.Provider>
  );
}

/**
 * Which link is the current one.
 *
 * `/portal` is matched EXACTLY and everything else by prefix: without that the
 * home link is current on every page, because every path in this app starts
 * with it. The same off-by-one the staff sidebar solves, met here in two lines
 * rather than by reaching for a router helper.
 */
function isCurrent(pathname: string, href: string): boolean {
  return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
}

/** Two letters for the avatar. `displayName` is nullable and genuinely empty at
 *  real firms, so the email is the fallback — and it is the LOCAL part that gets
 *  cut, because "me" tells a reader something and "@c" does not. */
function initials(who: string): string {
  const name = who.includes("@") ? (who.split("@")[0] ?? who) : who;
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase();
}
