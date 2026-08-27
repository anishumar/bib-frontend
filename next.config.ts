import type { NextConfig } from "next";

// The API is a separate service on a separate origin — see CLAUDE.md. This app
// talks to it over CORS with credentials, exactly as it will in production;
// there is deliberately no dev-only rewrite proxying /api to the backend.
//
// A proxy would make local development work under rules that do not apply
// anywhere else: same-origin, no preflight, no cookie policy to get right. The
// first environment to exercise the real rules would then be production.
const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
};

export default config;
