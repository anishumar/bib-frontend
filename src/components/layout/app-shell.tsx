"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api/client";
import type { Membership, Principal } from "@/lib/api/client";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ThemeSwitch } from "./theme";

/**
 * The frame every signed-in page sits in.
 *
 * Navigation used to be repeated inline at the top of each page, and that is
 * exactly what it cost: the admin screens had one nav, the commercial screens
 * another, and the workspace home was the only route between them. Every page
 * decided for itself where you could go next, so where you could go depended
 * on where you already were.
 *
 * Signed out there is no frame at all. The sign-in page is its own thing, and
 * a sidebar full of links you cannot follow is furniture.
 */

/* ── Session ────────────────────────────────────────────────────────────────
 * The shell has to read `/auth/me` to know which links to offer, so it shares
 * the answer rather than making every page ask again. Pages that already do
 * their own fetch keep working — this is offered, not imposed.
 */

const SessionContext = createContext<Principal | null>(null);

/** Who is signed in, as the shell already knows it. `null` before it answers. */
export function useSession(): Principal | null {
  return useContext(SessionContext);
}

/* ── The map of the product ─────────────────────────────────────────────────
 * ONE definition of what this workspace contains, and the permission each part
 * needs. It sits here because it is a fact about the application, not about
 * any screen — and because a link offered to somebody the API will refuse is
 * just a slower 403.
 */

interface NavItem {
  /* `Route` rather than `string`: this project has `typedRoutes` on, so a link
     to a page that does not exist is a compile error here rather than a 404
     somebody finds in production. */
  href: Route;
  label: string;
  icon: IconName;
  /** The permission the API gates this route on. */
  needs?: string;
  /** An extra condition beyond a permission. */
  when?: (p: Principal) => boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: "/", label: "Home", icon: "home" }],
  },
  {
    /* The book, the pipeline, what the firm has quoted and what it has agreed. */
    label: "Commercial",
    items: [
      { href: "/clients", label: "Clients", icon: "clients", needs: "party:read" },
      { href: "/leads", label: "Pipeline", icon: "pipeline", needs: "party:read" },
      { href: "/proposals", label: "Proposals", icon: "proposals", needs: "party:read" },
      {
        href: "/engagement-letters",
        label: "Engagement letters",
        icon: "letters",
        needs: "party:read",
      },
      /* Billing sits with the commercial work rather than under
         administration: raising an invoice and recording a payment are
         `party:write`, the same permission drafting takes. Only ISSUING and
         crediting need tenant:admin, and those gates live on the invoice. */
      { href: "/invoices", label: "Invoices", icon: "invoices", needs: "party:read" },
      {
        href: "/receivables",
        label: "Receivables",
        icon: "receivables",
        needs: "party:read",
      },
      /* The FEE AXIS, not the role. Commercial visibility is a flag on the
         membership and is orthogonal to what somebody may reach — a manager
         who may read every client is not automatically somebody who may see
         what the firm earns. */
      {
        href: "/dashboard",
        label: "The firm's numbers",
        icon: "numbers",
        needs: "party:read",
        when: (p) => p.commercialVisibility === true,
      },
      /* Reading the catalogue is config:read — an associate quotes from it, so
         it is not an admin screen. Changing it is tenant:admin. */
      { href: "/catalogue", label: "Catalogue", icon: "catalogue", needs: "config:read" },
    ],
  },
  {
    /* What a signed engagement turned into. */
    label: "Delivery",
    items: [
      { href: "/work-items", label: "Work board", icon: "board", needs: "party:read" },
      { href: "/work", label: "The engine", icon: "engine", needs: "party:read" },
      {
        href: "/calendar",
        label: "Compliance calendar",
        icon: "calendar",
        needs: "party:read",
      },
    ],
  },
  {
    label: "Record",
    items: [{ href: "/audit", label: "Audit trail", icon: "audit", needs: "ledger:read" }],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/people", label: "People", icon: "people", needs: "tenant:admin" },
      { href: "/admin/roles", label: "Roles", icon: "roles", needs: "tenant:admin" },
      { href: "/admin/grades", label: "Grades", icon: "grades", needs: "tenant:admin" },
      {
        href: "/admin/structure",
        label: "Structure",
        icon: "structure",
        needs: "tenant:admin",
      },
      {
        href: "/admin/work-vocabulary",
        label: "Work states",
        icon: "prose",
        needs: "tenant:admin",
      },
      {
        href: "/admin/workflows",
        label: "Processes",
        icon: "processes",
        needs: "tenant:admin",
      },
      {
        href: "/admin/obligation-rules",
        label: "Compliance rules",
        icon: "compliance",
        needs: "tenant:admin",
      },
      // T3.3's screen. Beside the rules rather than under Delivery: the rules
      // say WHAT is owed and when, this says what the firm CALLS the states a
      // filing moves through — both are the firm describing its own calendar.
      {
        href: "/admin/obligation-vocabulary",
        label: "Calendar words",
        icon: "prose",
        needs: "tenant:admin",
      },
      {
        href: "/admin/verification",
        label: "Who checks work",
        icon: "verification",
        needs: "tenant:admin",
      },
      {
        href: "/admin/document-blocks",
        label: "Standard prose",
        icon: "prose",
        needs: "tenant:admin",
      },
      { href: "/admin/brand", label: "Brand", icon: "brand", needs: "tenant:admin" },
      {
        href: "/admin/territories",
        label: "Territories",
        icon: "territories",
        needs: "tenant:admin",
      },
    ],
  },
];

/** Routes that get no frame: nobody is signed in, or nobody needs to be. */
function isBare(pathname: string): boolean {
  // `/p/[token]` is the client-facing proposal view. It has no session at all
  // — the token IS the authorisation — so a workspace sidebar on it would be
  // both useless and a leak of the firm's internal structure.
  // `/auth/magic-link` is where a sign-in link lands: there is no session yet
  // — spending the token is what creates one — so a workspace frame around it
  // would be a frame with nothing behind it.
  return pathname === "/login" || pathname.startsWith("/p/") || pathname.startsWith("/auth/");
}

/**
 * Is this nav entry the page we are on?
 *
 * A detail page keeps its section lit, so this is a prefix match — but the
 * prefix has to end on a PATH BOUNDARY. A bare `startsWith` lights "The engine"
 * (`/work`) whenever you are on the work board (`/work-items`), because one
 * string does begin with the other. Two sections highlighted at once tells the
 * reader they are in a place they are not.
 */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function visible(item: NavItem, p: Principal): boolean {
  if (item.needs !== undefined && !p.permissions.includes(item.needs)) return false;
  if (item.when !== undefined && !item.when(p)) return false;
  return true;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const bare = isBare(pathname);

  useEffect(() => {
    // Nothing to ask on a bare route, and nothing to record either: the render
    // below returns before it ever reads `checked`.
    if (bare) return;
    let live = true;
    void (async () => {
      // Both in one round trip. The memberships are not a nicety: until the
      // session has picked one of them, `tenantId` is null and every
      // tenant-scoped route answers 403 — so this is what the shell needs to
      // know whether it can show the workspace at all.
      const [me, mine] = await Promise.all([
        api.GET("/api/v1/auth/me", {}),
        api.GET("/api/v1/tenancy/me/memberships", {}),
      ]);
      if (!live) return;
      // Not signed in is an ordinary state here, not a failure to report. The
      // shell does NOT redirect: the page is already doing that, and two
      // racing redirects is how a login loop starts.
      setPrincipal(me.data ?? null);
      setMemberships(mine.data?.memberships ?? []);
      setChecked(true);
    })();
    return () => {
      live = false;
    };
  }, [bare, pathname]);

  const signOut = useCallback(async (): Promise<void> => {
    await api.POST("/api/v1/auth/logout", {});
    router.push("/login");
  }, [router]);

  /**
   * Point the session at one firm.
   *
   * The session is server-side, so this is a real call and not a local
   * preference — the API re-checks the membership and rewrites the cookie. The
   * whole app is then re-fetched, because every screen's data was scoped to the
   * firm we just stopped being.
   */
  const switchTenant = useCallback(
    async (tenantId: string): Promise<void> => {
      setSwitching(tenantId);
      const result = await api.POST("/api/v1/auth/switch-tenant", { body: { tenantId } });
      if (result.error) {
        setSwitching(null);
        return;
      }
      setPrincipal(result.data);
      setSwitching(null);
      // `refresh()` alone would keep this component's state; the screens below
      // hold their own copies of firm-scoped data and have to ask again.
      router.refresh();
      router.push("/");
    },
    [router],
  );

  if (bare) return <>{children}</>;

  // Until `/auth/me` answers, render the page without chrome rather than a
  // skeleton sidebar. A nav that appears and then loses half its links reads
  // as a bug; a nav that arrives a beat late reads as loading.
  if (!checked || principal === null) return <>{children}</>;

  /*
   * THE LOCKOUT.
   *
   * An account in more than one firm signs in with no firm selected — the API
   * says so itself: "More than one entry means no tenant is active yet — call
   * switch-tenant." Until one is picked, `tenantId` is null and every
   * tenant-scoped route answers 403, so there is no workspace to show and no
   * screen behind this that would work.
   *
   * So this replaces the app rather than sitting inside it. It is the one
   * screen in the product that is not optional.
   */
  if (principal.tenantId === null && staffMemberships(memberships).length > 0) {
    return (
      <ChooseFirm
        memberships={staffMemberships(memberships)}
        switching={switching}
        onChoose={(id) => void switchTenant(id)}
        onSignOut={() => void signOut()}
      />
    );
  }

  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => visible(i, principal)),
  })).filter((g) => g.items.length > 0);

  return (
    <SessionContext.Provider value={principal}>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true">
              10x
            </span>
            <span className="brand-id">
              <b>BiB</b>
              <span>Staff workspace</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Sections">
            {groups.map((group) => (
              <div key={group.label} className="nav">
                <p className="nav-label">{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-link"
                    /* The current page is stated with `aria-current`, so the
                       styling and the announcement cannot drift apart. */
                    {...(isCurrent(pathname, item.href)
                      ? { "aria-current": "page" as const }
                      : {})}
                  >
                    <Icon name={item.icon} className="nav-icon" />
                    <span className="label">{item.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="sidebar-foot">
            {/* Offered only when there is more than one firm to be in. A
                switcher with one entry is furniture that implies a choice the
                account does not have. */}
            {staffMemberships(memberships).length > 1 && (
              <Menu
                align="left"
                trigger={
                  <span className="nav-link">
                    <Icon name="structure" className="nav-icon" />
                    <span className="label">Switch firm</span>
                    <Icon name="chevronDown" size={14} />
                  </span>
                }
              >
                {staffMemberships(memberships).map((m) => (
                  <MenuItem
                    key={m.id}
                    disabled={m.tenantId === principal.tenantId || switching !== null}
                    onClick={() => void switchTenant(m.tenantId)}
                  >
                    {m.tenantId === principal.tenantId ? "✓ " : ""}
                    {m.role} · <span className="mono">{m.tenantId.slice(0, 8)}</span>
                  </MenuItem>
                ))}
              </Menu>
            )}
            <div className="who">
              <span className="avatar" aria-hidden="true">
                {(principal.role ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="who-id">
                <span className="n">{principal.role ?? "No role"}</span>
                <span className="r">
                  {principal.tenantId === null ? "No firm selected" : "Signed in"}
                </span>
              </span>
            </div>
            <Button
              variant="link"
              icon={<Icon name="signout" size={15} />}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <p className="crumb">
              <b>BiB</b>
              {principal.tenantId !== null && (
                <>
                  {" · "}
                  <span className="mono">{principal.tenantId.slice(0, 8)}</span>
                </>
              )}
              {principal.commercialVisibility === true && " · fees visible"}
            </p>
            <ThemeSwitch />
          </header>
          {children}
        </div>
      </div>
    </SessionContext.Provider>
  );
}

/**
 * The firms this account can actually WORK in.
 *
 * A `CLIENT_PORTAL` membership is filtered out on purpose: the audience gate
 * runs before the role gate and admits a portal session only to its own
 * sign-in and org-switch routes, so switching into one here would land
 * somebody in a workspace where every screen answers 403. Offering it would be
 * offering a dead end.
 */
function staffMemberships(all: readonly Membership[]): Membership[] {
  return all.filter((m) => m.audience === "STAFF");
}

/**
 * Pick a firm. The whole screen, because nothing else works until it is done.
 *
 * There is no firm NAME to show — `/tenancy/me/memberships` returns the id, the
 * role and the audience, and nothing else. So this shows the role, which is the
 * one human fact available, and the id in the mono face beneath it. Inventing a
 * label here would be inventing it per firm, per session, from nothing.
 */
function ChooseFirm({
  memberships,
  switching,
  onChoose,
  onSignOut,
}: {
  memberships: readonly Membership[];
  switching: string | null;
  onChoose: (tenantId: string) => void;
  onSignOut: () => void;
}) {
  return (
    <main className="signin">
      <div>
        <div className="stack loose">
          <div>
            <p className="eyebrow">10X Workspace</p>
            <h1>Choose a firm</h1>
            <p className="lede">
              This account belongs to more than one firm, so the session has not picked one yet.
              Everything in the workspace is scoped to a firm, which is why this comes first.
            </p>
          </div>

          <div className="stack tight">
            {memberships.map((m) => (
              <Button
                key={m.id}
                variant="secondary"
                block
                loading={switching === m.tenantId}
                disabled={switching !== null && switching !== m.tenantId}
                onClick={() => { onChoose(m.tenantId); }}
              >
                {m.role} · <span className="mono">{m.tenantId.slice(0, 8)}</span>
              </Button>
            ))}
          </div>

          <Button variant="link" onClick={onSignOut}>
            Sign out instead
          </Button>
        </div>
      </div>
    </main>
  );
}
