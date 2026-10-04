"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api/client";
import type { Membership, Principal } from "@/lib/api/client";
import { PRODUCT_NAME, firmInitials } from "@/lib/brand";
import { readSession, retryDelayMs } from "@/lib/session";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ThemeSwitch } from "./theme";
import { NotificationBell } from "@/components/notify/bell";

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

/* ── Sidebar counts (V2.1) ──────────────────────────────────────────────────
 * The number beside Work board, Jobs and Client requests: what is on YOUR
 * desk there. The shell fetches nothing for them: My day already holds every
 * one of those lists, and the pages themselves hold their own, so whichever
 * loaded last REPORTS its count here. A count nobody has reported yet is not
 * drawn, never drawn as 0.
 */
type NavCounts = Partial<Record<"/work-items" | "/work" | "/client-requests", number>>;

const NavCountsContext = createContext<(counts: NavCounts) => void>(() => undefined);

/** Report what is on the reader's desk, for the sidebar. */
export function useNavCounts(): (counts: NavCounts) => void {
  return useContext(NavCountsContext);
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
  /** A few words after the label, in the muted count style ("Not live yet"). */
  note?: string;
}

interface NavGroup {
  label: string;
  /**
   * Open until the reader closes it, wherever they are (V1.1: Delivery). The
   * group holding the current page still opens on its own as well.
   */
  openByDefault?: boolean;
  /**
   * The group's own icon, shown on the row that opens it.
   *
   * A collapsed group is one line, and a line of text with no mark is the
   * hardest thing on a sidebar to find twice. The icon is what somebody aims
   * at the second time they come looking for the same section.
   */
  icon: IconName;
  items: NavItem[];
}

/**
 * Two letters for the avatar disc.
 *
 * THE DOMAIN AND THE DIGITS GO FIRST, the same rule the work board's cards
 * follow: half the people here are shown by email, because `displayName` is
 * optional and a seeded login has none. Split naively,
 * `partner-1788079646@10xglobal.in` gives "P1" from the timestamp, and a
 * sidebar reading "P1" identifies nobody.
 */
function initials(who: string | null): string {
  if (who === null) return "?";
  const local = who.split("@")[0] ?? who;
  const words = local
    .trim()
    .split(/[\s._-]+/)
    .filter((p) => /^[a-z]/i.test(p));
  const letters = words.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

const GROUPS: NavGroup[] = [
  {
    /* Where staff land (V2.1): everything on their desk, by date. First, and a
       plain link, because it is the screen a sidebar is most used to reach. */
    label: "My day",
    icon: "home",
    items: [{ href: "/", label: "My day", icon: "home" }],
  },
  /* NO AI COPILOT LINK until it can answer (CA#51). It sat in every staff
     member's menu reading "Not live yet", which says nothing anybody can use.
     The page still exists at /copilot; put the link back here, as
     `{ label: "Workspace", icon: "copilot", items: [{ href: "/copilot",
     label: "AI Copilot", icon: "copilot" }] }`, the day it goes live. */
  {
    /* The book, the pipeline, what the firm has quoted and what it has agreed. */
    label: "Commercial",
    icon: "pipeline",
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
         `party:write` (and, since the 2026-10-03 audit, a login that sees
         fees). Issuing and crediting are `invoice:issue` (0335), and those
         gates live on the invoice. */
      { href: "/invoices", label: "Invoices", icon: "invoices", needs: "party:read" },
      /* What each client owes: nothing on it is not money, so a login that
         cannot see fees is not offered it (F33/CA#54). The invoices list
         stays: an invoice's number and status are not money. */
      {
        href: "/receivables",
        label: "Receivables",
        icon: "receivables",
        needs: "party:read",
        when: (p) => p.commercialVisibility === true,
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
    /* What a signed engagement turned into. Open by default (V1.1): it is
       where the day's work is, and a sidebar with every group shut hid it. */
    label: "Delivery",
    icon: "board",
    openByDefault: true,
    items: [
      { href: "/work-items", label: "Work board", icon: "board", needs: "party:read" },
      { href: "/work", label: "Jobs", icon: "engine", needs: "party:read" },
      {
        href: "/calendar",
        label: "Compliance calendar",
        icon: "calendar",
        needs: "party:read",
      },
      // T6.8 — work that arrived from the OTHER direction. It sits in Delivery
      // rather than Commercial because a client asking for a copy of something
      // is asking the firm to DO something, which is what this section is; and
      // it is a top-level screen rather than a panel on the client page because
      // there is no routing — nobody is assigned one, so a firm-wide list IS
      // the screen.
      {
        href: "/client-requests",
        label: "Client requests",
        icon: "inbox",
        needs: "party:read",
      },
    ],
  },
  {
    label: "Record",
    icon: "audit",
    items: [{ href: "/audit", label: "Audit trail", icon: "audit", needs: "ledger:read" }],
  },
  {
    /*
     * ── THE ADMIN SCREENS ARE THREE SUBJECTS, NOT ONE ────────────────────
     *
     * They were one group of thirteen, on the true but unhelpful ground that
     * every one of them needs `tenant:admin`. That is a fact about the API and
     * not about what a partner is looking for: thirteen labels in a column is
     * read top to bottom every time, because "Grades" and "Calendar words" sit
     * the same distance apart as "Grades" and "Roles".
     *
     * And the permission is not lost by splitting. It was never carrying the
     * information anyway — somebody who can see any of these can see all of
     * them, and somebody who cannot sees none. Grouping by it grouped by the
     * one thing every reader already knows about themselves.
     *
     * THREE and not four: the compliance rules belong with the process rather
     * than in a calendar group of their own, because at a CA firm a rule IS
     * how work runs — it is the thing that puts the work on the board.
     *
     * They stay TOP-LEVEL rather than becoming a third tier under
     * Administration. Three levels in a sidebar means two clicks to reach a
     * screen and a chevron whose meaning changes with depth; the whole point
     * of this change was making the map shallower.
     */
    label: "The firm",
    icon: "people",
    items: [
      /* The firm on paper, ONE link (the Wave 4 brief, 2026-09-28): its
         companies and which one quotes which country, who signs, from which
         day deadlines count, and the discount limit. It was two links, "The
         firm itself" and "Our companies", and the first repeated the second. */
      { href: "/admin/firm", label: "Your firm", icon: "structure", needs: "tenant:admin" },
      { href: "/admin/people", label: "People", icon: "people", needs: "tenant:admin" },
      { href: "/admin/roles", label: "Roles", icon: "roles", needs: "tenant:admin" },
      { href: "/admin/grades", label: "Grades", icon: "grades", needs: "tenant:admin" },
      {
        href: "/admin/structure",
        label: "Structure",
        icon: "structure",
        needs: "tenant:admin",
      },
      /* Whose desk covers which country. Here rather than under Commercial
         because it is the firm describing ITSELF — the same axis Structure is
         on — even though what reads it is lead assignment. */
      {
        href: "/admin/territories",
        label: "Territories",
        icon: "territories",
        needs: "tenant:admin",
      },
    ],
  },
  {
    /* In the order the work actually moves: what puts it on the board, what it
       is called while it is there, and who signs it off or hears that nobody
       has. */
    label: "How work runs",
    icon: "processes",
    items: [
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
        href: "/admin/workflows",
        label: "Processes",
        icon: "processes",
        needs: "tenant:admin",
      },
      {
        href: "/admin/work-vocabulary",
        label: "Work states",
        icon: "prose",
        needs: "tenant:admin",
      },
      {
        href: "/admin/verification",
        label: "Who checks work",
        icon: "verification",
        needs: "tenant:admin",
      },
      // T4.5. Beside "Who checks work" rather than under Delivery, and for the
      // same reason: both are the firm writing down a rule about its own
      // people, not a view of its work.
      {
        href: "/admin/escalation-ladder",
        label: "Escalation ladder",
        icon: "alert",
        needs: "tenant:admin",
      },
      /* T4.4 and T6.7, and it sits directly under the escalation ladder because
         it is the SAME mechanism pointed the other way: rungs, thresholds in
         days, nothing set by default. That one is the firm telling itself its
         work has gone quiet; this one is the firm speaking to a client. Reading
         them as a pair is how somebody notices that the outward one lands on
         people who do not work here. */
      {
        href: "/admin/client-reminders",
        label: "Client reminders",
        icon: "refresh",
        needs: "tenant:admin",
      },
    ],
  },
  {
    /* What a client actually receives: the words on it and the mark at the top
       of it. Two screens, and a real subject — small is not the same as
       miscellaneous. */
    label: "Documents",
    icon: "prose",
    items: [
      {
        href: "/admin/document-blocks",
        label: "Standard prose",
        icon: "prose",
        needs: "tenant:admin",
      },
      /* The clauses a letter is built from (W4B): here beside the prose rather
         than on the Catalogue, which is what the firm SELLS. Read on
         `config:read`, like the Catalogue it came from, so an associate
         drafting a letter can still read them; writing is tenant:admin. */
      {
        href: "/admin/standard-terms",
        label: "Standard terms",
        icon: "letters",
        needs: "config:read",
      },
      { href: "/admin/brand", label: "Brand", icon: "brand", needs: "tenant:admin" },
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
  //
  // `/portal` is the CLIENT's app (T6.5), and it brings its own frame. A
  // client has one screen and no map, so a sidebar listing twenty-six staff
  // screens they can never open is furniture — the same argument this function
  // already makes about the sign-in page. It is not "bare" in the sense the
  // others are: `src/app/portal/layout.tsx` is what renders around it.
  return (
    pathname === "/login" ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/")
  );
}

/**
 * What is on screen for the instant between deciding to leave and leaving.
 *
 * Deliberately says almost nothing. It stands in for a page the reader may not
 * see, so anything specific here would be either a promise about where they are
 * going or a statement about a firm that is not theirs.
 */
/**
 * The API is busy (429) or out of reach, and we do not yet know who is
 * reading. Calm, one line, and a way to try at once (F15).
 */
function Busy({ seconds, onRetry }: { seconds: number; onRetry: () => void }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        font: "inherit",
      }}
    >
      <div role="status" style={{ textAlign: "center", display: "grid", gap: "var(--s-3, 12px)" }}>
        <p>
          The workspace is busy. Trying again in {seconds} {seconds === 1 ? "second" : "seconds"}.
        </p>
        <div>
          <Button variant="secondary" onClick={onRetry}>
            Try now
          </Button>
        </div>
      </div>
    </main>
  );
}

function Leaving() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        color: "var(--muted-foreground, #667085)",
        font: "inherit",
      }}
    >
      <p>One moment…</p>
    </main>
  );
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

/** The reported count for a sidebar link, or undefined: nothing reported yet,
 *  or nothing on the reader's desk there (a 0 is not drawn). */
function countFor(counts: NavCounts, href: string): number | undefined {
  const n = counts[href as keyof NavCounts];
  return n === undefined || n === 0 ? undefined : n;
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
  /**
   * The API was busy or unreachable on the last read (F15): how many reads in
   * a row have failed that way, and when the next one is due. Null when the
   * last read got an answer. Never a reason to sign anybody out: see
   * `@/lib/session`.
   */
  const [busy, setBusy] = useState<{ attempt: number; retryMs: number } | null>(null);
  /** Bumped to ask again: by the backoff timer, or by "Try now". */
  const [retryTick, setRetryTick] = useState(0);
  /**
   * What the sidebar's search box holds.
   *
   * It filters the map of the product rather than searching the firm's DATA —
   * this is "where is the screen that does X", which is the question twenty-six
   * links in a column cannot answer. A client, a filing or an invoice is found
   * on the screen that lists them.
   */
  const [query, setQuery] = useState("");
  /**
   * Groups the reader has opened or closed BY HAND, keyed by label.
   *
   * Absent means "not touched", which is not the same as closed: an untouched
   * group opens on its own when the page you are on lives inside it. That
   * asymmetry is the whole behaviour — the sidebar shows you where you are
   * without being told to, and stops guessing the moment you disagree with it.
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /** What the pages last reported is on the reader's desk (V2.1). */
  const [counts, setCounts] = useState<NavCounts>({});
  const reportCounts = useCallback((next: NavCounts) => {
    setCounts((was) => ({ ...was, ...next }));
  }, []);
  const searchRef = useRef<HTMLInputElement>(null);

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
        readSession(),
        api.GET("/api/v1/tenancy/me/memberships", {}).catch(() => null),
      ]);
      if (!live) return;
      // ONLY A 401 SIGNS ANYBODY OUT (F15). A 429, a 5xx or no answer at all
      // keeps whatever was known and asks again after a backoff; on a first
      // load that shows "busy, retrying" instead of the sign-in form.
      const membershipsFailed = mine === null || (mine.error !== undefined && mine.response.status !== 401);
      if (me.kind === "busy" || (me.kind === "in" && membershipsFailed)) {
        const waitMs = me.kind === "busy" ? me.waitMs : 0;
        setBusy((was) => {
          const attempt = was === null ? 0 : was.attempt + 1;
          return { attempt, retryMs: retryDelayMs(attempt, waitMs) };
        });
        return;
      }
      setBusy(null);
      // Not signed in is an ordinary state here, not a failure to report.
      setPrincipal(me.kind === "in" ? me.principal : null);
      setMemberships(mine?.data?.memberships ?? []);
      setChecked(true);
    })();
    return () => {
      live = false;
    };
  }, [bare, pathname, retryTick]);

  // The backoff: ask again once the wait is over. One timer at a time; a new
  // answer (or leaving the page) clears it.
  useEffect(() => {
    if (busy === null) return;
    const timer = window.setTimeout(() => { setRetryTick((n) => n + 1); }, busy.retryMs);
    return () => { window.clearTimeout(timer); };
  }, [busy]);

  /**
   * WHICH APP IS THIS PERSON IN — the gate that was only ever a sidebar filter.
   *
   * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
   *
   * This product is B2B2C: a firm's staff and a firm's CLIENTS both sign in
   * here, and the API knows the difference — gate 2 refuses a CLIENT_PORTAL
   * session on every staff route. What the browser did with that refusal was
   * the problem. Signed in as a client contact, `/` rendered "Staff workspace",
   * `/clients` rendered the firm's client book with its "Add to the book" form,
   * and `/admin/people` rendered the roster page with role and surface pickers.
   * Every list was empty because the API answered 403 — so beside the refusal
   * the page also said "Nobody in the book yet" and "0 on the roster", which
   * are not refusals, they are FACTS, and they were false ones about somebody
   * else's firm.
   *
   * No data leaked: the API refused every read and every write. What leaked was
   * the shape of the firm's internal tooling, to somebody outside the firm, with
   * untrue statements attached. Only the sidebar was filtered, and a filtered
   * sidebar is a suggestion — the URL bar is not.
   *
   * ── AND WHY IT LIVES HERE ─────────────────────────────────────────────────
   *
   * Because every page already re-implements the OTHER half of this: each one
   * fetches `/auth/me` and pushes to `/login` on a 401, twenty-five times over.
   * A page that forgets stays open. The shell is the one component every staff
   * screen renders inside and the one place that already knows who is signed
   * in, so both halves are decided here: no session goes to the sign-in page,
   * and the wrong AUDIENCE goes to the app it belongs to.
   *
   * A portal contact whose session has not picked a firm yet has a null
   * audience, so the membership list answers instead — a login with no staff
   * membership has no business being offered the staff workspace whatever its
   * current audience says.
   */
  const wrongApp =
    !bare &&
    checked &&
    principal !== null &&
    (principal.audience === "CLIENT_PORTAL" ||
      (principal.audience === null &&
        staffMemberships(memberships).length === 0 &&
        memberships.length > 0));

  /** Signed out, on a route that needs a session. */
  const signedOut = !bare && checked && principal === null;

  useEffect(() => {
    if (wrongApp) router.replace("/portal");
  }, [wrongApp, router]);

  useEffect(() => {
    // `replace`, not `push`: a sign-in page you can go BACK from into a screen
    // that will bounce you again is a loop with a history entry per lap.
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);

  /* Ctrl/Cmd+K puts the cursor in the search box from anywhere in the product.
     The shortcut is in the placeholder rather than only here, because a
     shortcut nobody is told about is one nobody uses. */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

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

  // The wrong app, or no session at all. The effects above are already
  // navigating; what matters here is that the page underneath is NOT rendered
  // in the meantime. Returning `children` would draw the staff screen — forms,
  // headings, empty states and all — for the fraction of a second before the
  // route changes, which is the whole of what was wrong and is not made right
  // by being brief.
  if (wrongApp || signedOut) return <Leaving />;

  // Busy before we have ever known who this is: say so and keep trying,
  // rather than drawing a screen that does not know whose it is. Once a
  // principal is known, a busy re-read on navigation keeps it silently.
  if (!checked && busy !== null) {
    return (
      <Busy
        seconds={Math.ceil(busy.retryMs / 1000)}
        onRetry={() => { setRetryTick((n) => n + 1); }}
      />
    );
  }

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
  if (
    principal !== null &&
    principal.tenantId === null &&
    staffMemberships(memberships).length > 0
  ) {
    return (
      <ChooseFirm
        memberships={staffMemberships(memberships)}
        switching={switching}
        onChoose={(id) => void switchTenant(id)}
        onSignOut={() => void signOut()}
      />
    );
  }

  const needle = query.trim().toLowerCase();
  const groups = principal === null ? [] : GROUPS.map((g) => {
    const allowed = g.items.filter((i) => visible(i, principal));
    return {
      label: g.label,
      icon: g.icon,
      openByDefault: g.openByDefault === true,
      /**
       * How many screens this section holds for this reader, BEFORE the search.
       *
       * The search must not restructure the sidebar. Deciding "is this a
       * dropdown or a plain link" from the FILTERED count did exactly that:
       * typing "escal" turned Administration into a top-level "Escalation
       * ladder" link, so the one thing a result should tell you — which
       * section it lives in — was the thing the search removed. Found by
       * typing into it.
       */
      size: allowed.length,
      items: allowed.filter(
        (i) =>
          needle === "" ||
          i.label.toLowerCase().includes(needle) ||
          // THE PATH IS A NAME TOO, and matching it costs no data to keep in
          // step. Renaming the sections left "admin" finding NOTHING while
          // thirteen screens still lived at /admin/*, which is the word half
          // the firm will reach for first; "obligation" likewise finds
          // Calendar words, whose label says nothing about obligations.
          i.href.toLowerCase().includes(needle) ||
          // The GROUP's name matches too, so typing "admin" finds the whole of
          // Administration rather than the two screens whose own labels happen
          // to contain the word.
          //
          // BUT ONLY WHERE THE NAME IS ON SCREEN. A one-screen group renders as
          // a plain link and its label is never drawn, so matching it produced
          // a result the reader could not account for: typing "work" returned
          // Home, because Home lives in a section called "Workspace". A search
          // hit that cannot explain itself is the same fault as one that moves
          // the furniture.
          (allowed.length > 1 && g.label.toLowerCase().includes(needle)),
      ),
    };
  }).filter((g) => g.items.length > 0);

  /*
   * THE PAGE MOUNTS ONCE.
   *
   * Until `/auth/me` answered, this used to return the page bare and then,
   * once it had, the page again inside the frame. A different parent is a
   * different tree to React, so every page was built twice on every load:
   * its "Loading" came up twice, it fetched its data twice, and a count-up ran
   * twice. The frame is now there from the first render and the page sits in
   * the same place in it throughout; what waits for the answer is only what
   * needs it, the links and the account. They come in a beat late rather than
   * as a skeleton, for the reason the old comment gave: a nav that appears and
   * then loses half its links reads as a bug.
   */
  return (
    <SessionContext.Provider value={principal}>
      <NavCountsContext.Provider value={reportCounts}>
      <div className="shell">
        {/* TWENTY-ONE TAB STOPS STOOD BETWEEN THE PAGE AND THE KEYBOARD.
            Measured: the sidebar is 14 to 21 stops depending on which
            groups are open, and every one of them came before `<main>` on
            every route and after every navigation. Somebody working this
            product from the keyboard was walking the whole menu to reach
            the screen they had just opened.

            It is invisible until it is focused, which is the point: it
            costs a sighted mouse user nothing and it is the first thing a
            keyboard user meets. */}
        <a href="#page" className="skip-link">
          Skip to the page
        </a>
        <aside className="sidebar">
          {/* THE FIRM'S OWN MARK (CA#40). The badge read "10x" on every
              firm's workspace; it is now this firm's initials and name, and
              the product's name sits under it. */}
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true">
              {firmInitials(principal?.tenantName)}
            </span>
            <span className="brand-id">
              <b>{principal?.tenantName ?? PRODUCT_NAME}</b>
              <span>{PRODUCT_NAME}</span>
            </span>
          </Link>

          <div className="nav-search">
            <Icon name="search" size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              placeholder="Search menu…  Ctrl+K"
              aria-label="Search the menu"
            />
          </div>

          {principal !== null && (
            <>
              <nav className="nav" aria-label="Sections">
                {groups.map((group) => {
                  const here = group.items.some((i) => isCurrent(pathname, i.href));
                  /* A SEARCH OPENS EVERYTHING, and it has to: a result hidden
                     inside a collapsed group is a search that answered and did not
                     show you. Otherwise the reader's own choice wins, and where
                     they have not made one, the group holding the current page is
                     open. */
                  const expanded =
                    needle !== "" || (toggled[group.label] ?? (here || group.openByDefault));

                  /* A group with ONE screen is not a dropdown. Home behind a
                     chevron is a click added to reach the thing a sidebar is most
                     often used to reach. Read from `size` and never from what the
                     search left behind — see the note on `size`. */
                  const solo = group.size === 1 ? group.items[0] : undefined;
                  if (solo !== undefined) {
                    return (
                      <Link
                        key={group.label}
                        href={solo.href}
                        className="nav-link nav-top"
                        {...(isCurrent(pathname, solo.href)
                          ? { "aria-current": "page" as const }
                          : {})}
                      >
                        <Icon name={solo.icon} className="nav-icon" />
                        <span className="label">{solo.label}</span>
                        {solo.note !== undefined && <span className="count">{solo.note}</span>}
                      </Link>
                    );
                  }

                  return (
                    <div key={group.label} className="nav-group" data-here={here || undefined}>
                      <button
                        type="button"
                        className="nav-link nav-top nav-group-head"
                        aria-expanded={expanded}
                        aria-controls={`nav-${group.label}`}
                        onClick={() => {
                          setToggled((t) => ({ ...t, [group.label]: !expanded }));
                        }}
                      >
                        <Icon name={group.icon} className="nav-icon" />
                        <span className="label">{group.label}</span>
                        <Icon name="chevronDown" size={14} className="nav-chevron" />
                      </button>
                      {expanded && (
                        <div className="nav-children" id={`nav-${group.label}`}>
                          {group.items.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="nav-link"
                              /* The current page is stated with `aria-current`, so
                                 the styling and the announcement cannot drift
                                 apart. */
                              {...(isCurrent(pathname, item.href)
                                ? { "aria-current": "page" as const }
                                : {})}
                            >
                              <span className="label">{item.label}</span>
                              {item.note !== undefined && <span className="count">{item.note}</span>}
                              {countFor(counts, item.href) !== undefined && (
                                <span className="count">{countFor(counts, item.href)}</span>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* A search that found nothing has to SAY so. An empty column reads
                    as a sidebar that broke. */}
                {groups.length === 0 && (
                  <p className="nav-empty">
                    No screen matches <b>{query.trim()}</b>.
                  </p>
                )}
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
                        {m.tenantName ?? m.tenantId.slice(0, 8)} · {m.role}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
                {/* WHO IS SIGNED IN, and it used to say WHAT they are. The block
                    rendered the role on both lines' worth of meaning — "partner /
                    Signed in" — which is the same words under every partner's
                    avatar at the firm, and the product telling somebody what they
                    ARE rather than who they are.

                    The name comes first, the email is the fallback (`displayName`
                    is nullable and genuinely empty at real firms), and the ROLE
                    moves to the second line where it belongs — it is a fact about
                    this membership, and it is what the second line was for. */}
                <div className="who">
                  <span className="avatar" aria-hidden="true">
                    {initials(principal.displayName ?? principal.email ?? principal.role)}
                  </span>
                  <span className="who-id">
                    <span className="n">
                      {principal.displayName ?? principal.email ?? "Signed in"}
                    </span>
                    <span className="r">
                      {principal.tenantId === null
                        ? "No firm selected"
                        : (principal.role ?? "No role")}
                    </span>
                  </span>
                </div>
                {/* YOUR account, not the firm's roster. Everything about a person
                    that the FIRM decides — role, grade, reporting line, access —
                    is /admin/people behind `tenant:admin`. A password is the one
                    fact about a login that belongs to the person holding it, so it
                    is reached from here rather than from the map of the product,
                    and it needs no permission at all. */}
                <Button
                  variant="link"
                  icon={<Icon name="lock" size={15} />}
                  onClick={() => {
                    router.push("/account");
                  }}
                >
                  Your account
                </Button>
                <Button
                  variant="link"
                  icon={<Icon name="signout" size={15} />}
                  onClick={() => void signOut()}
                >
                  Sign out
                </Button>
              </div>
            </>
          )}
        </aside>

        <div className="main">
          <header className="topbar">
            <p className="crumb">
              <b>BiB</b>
              {/* THE FIRM'S NAME, not the first eight characters of its uuid.
                  That is what stood here, and it identified the firm to the
                  database and to nobody else. The id is still the fallback for
                  the state that should not happen — a session pointed at a
                  tenant row that has gone — because a bar that silently drops
                  the firm is worse than one showing a uuid. */}
              {principal !== null && principal.tenantId !== null && (
                <>
                  {" · "}
                  {principal.tenantName === null ? (
                    <span className="mono">{principal.tenantId.slice(0, 8)}</span>
                  ) : (
                    principal.tenantName
                  )}
                </>
              )}
              {principal?.commercialVisibility === true && " · fees visible"}
            </p>
            <div className="topbar-tools">
              {/* Only once a firm is chosen: every notification is a firm's. */}
              {principal !== null && principal.tenantId !== null && (
                <NotificationBell enabled />
              )}
              <ThemeSwitch />
            </div>
          </header>
          {children}
        </div>
      </div>
      </NavCountsContext.Provider>
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
            <p className="eyebrow">{PRODUCT_NAME}</p>
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
                {/* This is the screen the whole argument is about: a person is
                    being asked to CHOOSE a firm, and until the name was on the
                    wire the choice read "partner · b35c4196" against "manager ·
                    7f0a21c4". Nobody can answer that. */}
                {m.tenantName ?? m.tenantId.slice(0, 8)} · {m.role}
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
