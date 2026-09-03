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
 * **AND THEN A FIFTH, WHICH T6.7 HAD REFUSED — because the reason it refused
 * one stopped being true.** The rule was that a fifth link must displace one of
 * the four or admit it is the firm's convenience, and the status home carried
 * both request lanes on the grounds that *"what is outstanding between us"*
 * should be one answer rather than two screens. That argument was right and the
 * page still failed: measured on the seeded firm it had grown to **4,489px —
 * three and a half screens — with SEVEN top-level sections**, and "Ask the
 * firm" was three lines and a button buried 1,640px down between two others. A
 * client would never have found it. Being on the home page had stopped meaning
 * findable.
 *
 * So the two lanes moved TOGETHER onto `/portal/requests`, which keeps T6.7's
 * insight intact — they are still one answer, still side by side, just not
 * competing with four status lists for the same screen. And the fifth link
 * earns its place by the original test: it is the CLIENT's convenience, not the
 * firm's, and it carries a count so nothing has to be opened to be noticed.
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
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
 * How much is outstanding between the client and the firm.
 *
 * ── WHY THE FRAME HOLDS THIS AND NOT THE REQUESTS PAGE ───────────────────
 *
 * The badge is what makes moving the two lanes off the home page SAFE. Without
 * it the split would trade one problem for a worse one: today a client sees the
 * request buried in a long page, and afterwards they would see nothing at all
 * until they thought to click. A count in the rail is visible from every screen
 * in the portal, which is strictly more visible than the home page was.
 *
 * So it is fetched once, here, and shared — the requests page reads the same
 * numbers rather than counting them again, and `refresh` is what the page calls
 * after a client answers something so the rail stops claiming they still owe it.
 *
 * `awaitingYou` is the only one that becomes a badge. `withTheFirm` is here
 * because the requests page needs to know whether it has ANYTHING to show
 * before it says "nothing is waiting" — a page that draws that sentence above a
 * list of six sent requests is wrong in the way a reader notices immediately.
 */
export interface PortalRequestCount {
  /** Asks the firm has put to this client that nobody has answered. */
  readonly awaitingYou: number;
  /** Answered, and still open on the firm's side. */
  readonly withTheFirm: number;
  /** False until the read lands. A badge must not flash `0` on its way to `3`. */
  readonly loaded: boolean;
  /** Re-read, after the client has acted. */
  readonly refresh: () => void;
}

const PortalRequestCountContext = createContext<PortalRequestCount>({
  awaitingYou: 0,
  withTheFirm: 0,
  loaded: false,
  refresh: () => {
    // The default is only ever reached outside the frame, where there is
    // nothing to refresh. Silence is right; throwing would break a screen for
    // a reason that is not the reader's problem.
  },
});

export function usePortalRequestCount(): PortalRequestCount {
  return useContext(PortalRequestCountContext);
}

/**
 * The reader's own calendar day, from their own machine.
 *
 * Exported and used by every portal screen, because a UTC server is a day
 * behind a firm in India every morning until half past five — and this value
 * decides which grants are in force. It lived in three files before this;
 * a date rule copied is a date rule that drifts.
 */
export function browserDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/**
 * The whole of the client's product, in five lines.
 *
 * Ordered by what a client arrives WANTING rather than by what the firm finds
 * important: what is happening, then **what is wanted from me and what I want
 * back** — the only line here anybody has to ACT on, which is why it sits
 * second and carries a count — then the thing they hunt for, then money, then
 * the record.
 *
 * The bar for a sixth is unchanged and is the one the fifth had to clear: it
 * displaces one of these or admits it is the firm's convenience rather than the
 * client's. See the header for why this one cleared it.
 */
const NAV: readonly {
  href: Route;
  label: string;
  icon: IconName;
  /** Carries the outstanding count. A FLAG rather than a comparison against the
   *  href: `Route` is a generated union and matching it against a string
   *  literal is a type error the moment the route is renamed — which is exactly
   *  when a silent badge would be hardest to notice. */
  counted?: true;
}[] = [
  { href: "/portal" as Route, label: "What's happening", icon: "home" },
  { href: "/portal/requests" as Route, label: "Requests", icon: "inbox", counted: true },
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
  const [counts, setCounts] = useState<{ awaitingYou: number; withTheFirm: number } | null>(
    null,
  );

  // Only for a portal session, and only once the principal is known: `/auth/me`
  // is what says whether this reader is a client at all, and asking a STAFF
  // session for a client's asks is a 403 with nothing to show for it.
  const isPortal = principal !== null && principal.audience === "CLIENT_PORTAL";
  const loadCounts = useCallback(async (): Promise<void> => {
    if (!isPortal) return;
    const result = await api.GET("/api/v1/portal/asks", {
      params: { query: { asOf: browserDay() } },
    });
    // A FAILED READ LEAVES THE BADGE ABSENT, not zero. "Nothing is waiting on
    // you" is a claim, and this is the one place in the portal that makes it
    // without a page to explain itself on — so when the read did not land, the
    // rail says nothing at all and the requests page reports the error properly.
    if (result.error) return;
    setCounts({
      awaitingYou: result.data.awaitingYou.length,
      withTheFirm: result.data.withTheFirm.length,
    });
  }, [isPortal]);

  useEffect(() => {
    void (async () => {
      await loadCounts();
    })();
  }, [loadCounts]);

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

  const requestCount: PortalRequestCount = {
    awaitingYou: counts?.awaitingYou ?? 0,
    withTheFirm: counts?.withTheFirm ?? 0,
    loaded: counts !== null,
    refresh: () => {
      void loadCounts();
    },
  };

  return (
    <PortalSessionContext.Provider value={principal}>
      <PortalRequestCountContext.Provider value={requestCount}>
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
                  {/* THE ONLY COUNT IN THIS RAIL, and it uses `.nav-link .count`
                      which `layout.css` already styles — the portal's standing
                      rule is not one line of new CSS, and it holds here too.

                      Drawn only when there is something to draw: a `0` beside a
                      link is a number a reader has to read before learning it
                      meant nothing, and four of them would turn the rail into a
                      dashboard. Absent while the read is in flight, so it does
                      not flash zero on its way to three. */}
                  {item.counted === true &&
                    requestCount.loaded &&
                    requestCount.awaitingYou > 0 && (
                      <span className="count" aria-label={`${String(requestCount.awaitingYou)} waiting on you`}>
                        {requestCount.awaitingYou}
                      </span>
                    )}
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
      </PortalRequestCountContext.Provider>
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
