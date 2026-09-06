import type { NextConfig } from "next";

// The API is a separate service on a separate origin — see CLAUDE.md. This app
// talks to it over CORS with credentials, exactly as it will in production;
// there is deliberately no dev-only rewrite proxying /api to the backend.
//
// A proxy would make local development work under rules that do not apply
// anywhere else: same-origin, no preflight, no cookie policy to get right. The
// first environment to exercise the real rules would then be production.

/**
 * Where the API lives, as the browser sees it — for the Content-Security-Policy.
 *
 * The policy names every origin this page may talk to, and the API is a
 * DIFFERENT origin by design, so `connect-src` has to say so or the browser
 * blocks every call this app makes. It is read from the same variable the
 * client already uses, so the two cannot disagree; the fallback is the local
 * backend, which is what `npm run dev` expects.
 */
const API_ORIGIN = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:8080";

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` on scripts is not laziness and not permanent: Next's App
 * Router inlines its own hydration bootstrap, and a nonce for it needs a
 * middleware that rewrites the header per request, which is a change with its
 * own failure modes. What the policy DOES buy today, without one, is the part
 * that mattered in the audit:
 *
 *   `frame-ancestors 'none'` — this workspace can no longer be framed, so it
 *   cannot be clickjacked. There was nothing at all before, not even
 *   X-Frame-Options.
 *
 *   `connect-src` naming exactly one API origin — a script that did run could
 *   not exfiltrate to a host of its choosing.
 *
 *   `form-action 'self'` and `base-uri 'self'` — no injected form or <base>
 *   can redirect a submission somewhere else.
 *
 * `style-src` allows inline because the design system sets CSS custom
 * properties on elements, and `img-src data:` because icons and the theme
 * script use data URIs.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN}`,
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  /**
   * `x-powered-by: Next.js` off.
   *
   * It names the framework and therefore the class of advisory that applies to
   * this deployment, to anybody who sends one request. It buys the reader
   * nothing.
   */
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        // Every route, including the ones that render no session. A header set
        // per page is a header a new page forgets.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Belt and braces with `frame-ancestors` above, for anything that
          // still reads the older header.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          /**
           * NO REFERRER, and this one is load-bearing rather than hygiene.
           *
           * Every credential link in this product arrives with its token in the
           * URL: `?token=` for sign-in, welcome and invite, and `/p/<token>`
           * for a shared proposal. Any request this page makes carries a
           * Referer by default — so the token would travel to the API on every
           * call made from that page, and into the logs at the other end.
           *
           * `no-referrer` costs nothing here: nothing in this app needs to know
           * which of its own pages a request came from.
           */
          { key: "Referrer-Policy", value: "no-referrer" },
          /**
           * Features this app does not use, refused for everything including
           * itself. A workspace for accountants has no business asking for a
           * camera, and saying so means an injected script cannot either.
           */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ]);
  },
};

export default config;
