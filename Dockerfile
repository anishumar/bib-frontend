# The bib workspace (Next.js App Router), built to a standalone server.
#
# Same Node as the backend — 22.22.1, pinned to bib-backend/.nvmrc — even though
# this package's engines floor is only >=20. One toolchain across both repos
# means one thing to upgrade and one class of "works on the API box" to rule
# out.
ARG NODE_IMAGE=node:22.22.1-bookworm-slim

# ── ON PLATFORM ──────────────────────────────────────────────────────────────
#
# Cloud Run runs linux/amd64 and nothing else, so a build started on an arm64
# Mac must pass --platform=linux/amd64. Cloud Build is already amd64, so the
# flag costs nothing there.
#
# The backend Dockerfile explains why it does not use the faster cross-build
# shape (build the dependency tree natively on $BUILDPLATFORM, copy it into an
# amd64 runtime): $BUILDPLATFORM needs BuildKit, which the deploy pipeline's
# docker builder does not enable. This image has a second, independent reason
# that would stand even if BuildKit were switched on. Next compiles with a
# per-platform SWC binary, Tailwind v4 brings lightningcss, and standalone
# output is a FILE TRACE — whatever the server actually loads gets copied,
# native binaries included. A tree built on arm64 and run on amd64 produces an
# image that builds green, pushes green, and dies on the first request with
# "invalid ELF header". So this build runs on the target platform throughout,
# and that is not negotiable here the way it is over there.
FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Plain `npm ci`, and NODE_ENV is deliberately still unset here. Setting it to
# production before this line would omit devDependencies — which for a Next app
# means typescript, tailwindcss and @tailwindcss/postcss, i.e. the build itself.
RUN npm ci

COPY next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs ./
COPY src ./src

# THE API ORIGIN IS FROZEN HERE, AND THIS IS THE ONE THING ABOUT THIS IMAGE
# WORTH UNDERSTANDING BEFORE CHANGING ANYTHING.
#
# NEXT_PUBLIC_API_BASE_URL is inlined at build time in two places, not one. The
# obvious one is the client bundle. The one that catches people is
# next.config.ts, which reads the same variable to build `connect-src` in the
# Content-Security-Policy — and Next evaluates headers() during the build and
# writes the result into .next/routes-manifest.json.
#
# That second copy is why the usual runtime workaround does not work. Shipping a
# placeholder and sed-ing the JS chunks at container start leaves the CSP
# pointing at the placeholder, so the browser blocks every call the rewritten
# bundle makes. It does not present as a misconfiguration; it presents as an app
# whose network requests intermittently fail for no stated reason.
#
# So the origin has to be known before the image is built, which means it cannot
# be the *.run.app URL Cloud Run generates after the first deploy. The answer is
# to reserve the name instead of waiting for one: a global external Application
# Load Balancer fronting the API on api.<domain>, with the DNS record created
# before this image is ever built. The frontend then builds against a name we
# own and has no dependency on the backend having been deployed even once — and
# the same name is what BIB_CORS_ORIGINS needs anyway, since validateServer
# demands an exact https origin.
#
# Passed as: docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.<domain>
ARG NEXT_PUBLIC_API_BASE_URL

# Checked here rather than trusted, because every way of getting this wrong
# fails silently at build time and loudly in a browser. Unset is the worst of
# them: next.config.ts falls back to http://localhost:8080, so the build
# succeeds and ships a workspace whose CSP permits exactly one origin, the one
# nobody can reach.
RUN case "$NEXT_PUBLIC_API_BASE_URL" in \
      "") echo "FATAL: NEXT_PUBLIC_API_BASE_URL is unset."; \
          echo "  it is baked into the client bundle AND into the CSP connect-src at build time,"; \
          echo "  so it cannot be supplied at container start."; \
          echo "  expected: an https origin with no trailing slash and no path, e.g. https://api.example.com"; \
          exit 1 ;; \
      https://*/ ) echo "FATAL: NEXT_PUBLIC_API_BASE_URL is '$NEXT_PUBLIC_API_BASE_URL' — it must not end in '/'."; \
          echo "  a trailing slash becomes a PATH in the CSP connect-src directive, which stops it matching"; \
          echo "  the API origin at all, and doubles the slash in every request the client builds."; \
          echo "  expected: https://api.example.com"; \
          exit 1 ;; \
      https://*) : ;; \
      *) echo "FATAL: NEXT_PUBLIC_API_BASE_URL is '$NEXT_PUBLIC_API_BASE_URL'."; \
         echo "  expected: an https:// origin. The session cookie is Secure and the API refuses"; \
         echo "  non-https origins in BIB_CORS_ORIGINS, so an http:// or localhost value here"; \
         echo "  produces a workspace that cannot authenticate against the API it names."; \
         exit 1 ;; \
    esac

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# next build sets this itself, but next.config.ts reads process.env.NODE_ENV at
# module load to choose between the strict and the 'unsafe-eval' script-src.
# Setting it before the build removes any question about which one ends up in
# the shipped header.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# The runtime stage copies .next/standalone, which Next only produces when
# next.config.ts sets `output: "standalone"`. Without it the COPY below fails on
# a missing path, which is a confusing way to learn that a config change was
# reverted. Say it here instead.
RUN [ -f .next/standalone/server.js ] || { \
      echo "FATAL: the build produced no .next/standalone/server.js"; \
      echo "  next.config.ts must set output: \"standalone\" — the runtime image has no"; \
      echo "  node_modules of its own and nothing to run without it."; \
      exit 1; \
    }

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next's standalone server reads PORT and HOSTNAME and defaults to
# localhost:3000. Cloud Run sends requests to 8080 and discards anything bound
# to the loopback — a container listening on 127.0.0.1 looks, from outside,
# exactly like a container that never started.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# The standalone trace: server.js plus only the node_modules the routes actually
# load. No devDependencies and no npm install in this stage at all.
COPY --from=build --chown=node:node /app/.next/standalone ./
# .next/static is deliberately NOT part of that trace — Next assumes a CDN
# serves it — so it is copied in by hand. Leave this out and the app renders
# once, unstyled, with every chunk 404ing.
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# There is no `public` directory in this app, so the line every Next Dockerfile
# has here is absent on purpose rather than forgotten — COPY of a missing path
# fails the build. If one is ever added, it belongs here, copied to ./public.

# The baked API origin, recorded where it can be read back.
#
# It is the one property of this image that cannot be inspected from the outside
# and cannot be changed from the outside either — it is compiled into the bundle
# and into the CSP. Without a label the only way to answer "which API is this
# image pointing at" is to start it and watch a browser fail, so the answer is
# written down at build time instead. ARG is re-declared because build args do
# not cross stage boundaries.
ARG NEXT_PUBLIC_API_BASE_URL
LABEL dev.bib.api-base-url="$NEXT_PUBLIC_API_BASE_URL"
LABEL org.opencontainers.image.title="bib-frontend"

EXPOSE 8080

# uid 1000, present in the official Node images. Cloud Run silently falls back
# to root for a user name it cannot resolve, so a typo would not announce itself.
USER node

# Exec form: node is PID 1 and receives SIGTERM directly. Shell form would put
# /bin/sh in front of it, and under Cloud Run's second-generation execution
# environment the container process is the init process, which has no default
# signal dispositions — that shell would neither die nor forward, and every
# revision replacement would end in a SIGKILL ten seconds later with in-flight
# requests dropped rather than drained.
CMD ["node", "server.js"]
