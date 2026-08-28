// The typed API client.
//
// Every type in here is GENERATED from the backend's own /openapi.json
// (`npm run api:generate`), which is itself generated from the zod schemas that
// validate the requests. So a route's shape has exactly one definition, in the
// backend, and this app cannot disagree with it — a renamed field is a
// compile error here rather than an undefined at runtime.
//
// Regenerating after an API change is one command, and it is the whole reason
// the seam is worth having.
import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * The API's origin — a DIFFERENT one from this app's, always.
 *
 * That is the arrangement in every environment, not a local quirk, so the app
 * is written for it from the first line: credentials are sent explicitly, and
 * the origin must be on the backend's BIB_CORS_ORIGINS allowlist or the browser
 * discards the response before this code sees it.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export const api = createClient<paths>({
  baseUrl,
  // The session is an httpOnly cookie the API sets. httpOnly means no script
  // can read it — including this one — so it is never handled here, only sent.
  // Without `include` the browser withholds it on a cross-origin call and every
  // authenticated request silently becomes anonymous.
  credentials: "include",
});

/** The shapes the app actually names, pulled off the generated schema so they
 *  track the API rather than being retyped by hand. */
export type Principal = paths["/api/v1/auth/me"]["get"]["responses"][200]["content"]["application/json"];
export type Membership =
  paths["/api/v1/tenancy/me/memberships"]["get"]["responses"][200]["content"]["application/json"]["memberships"][number];

/** One row of the firm's roster — a membership with the person behind it. */
export type Member =
  paths["/api/v1/tenancy/members"]["get"]["responses"][200]["content"]["application/json"]["members"][number];

/** A configured thing and whatever it currently says. `published` is null when
 *  only drafts exist, which is a state the screens have to show. */
export type ConfigEntry =
  paths["/api/v1/config/{kind}"]["get"]["responses"][200]["content"]["application/json"]["entries"][number];

/** The product's closed permission set, with what each one means. Fetched
 *  rather than retyped: a hardcoded copy would drift from what the API actually
 *  checks, and on this screen that means offering a permission that grants
 *  nothing or hiding one that grants everything. */
export type PermissionInfo =
  paths["/api/v1/config/permissions"]["get"]["responses"][200]["content"]["application/json"]["permissions"][number];

/**
 * A role's body, as the registry stores it.
 *
 * The registry keeps bodies as free-form JSON on purpose — each kind has its own
 * shape and they grow as their consumers land — so the generated schema types
 * this as an object of unknowns and the shape for ONE kind is read here. Narrow
 * defensively: this is data the API validated on the way in, but the type system
 * cannot know that.
 */
export interface RoleBody {
  readonly label: string;
  readonly permissions: readonly string[];
}

export function readRoleBody(body: Record<string, unknown> | undefined): RoleBody {
  const label = body?.["label"];
  const permissions = body?.["permissions"];
  return {
    label: typeof label === "string" ? label : "",
    permissions: Array.isArray(permissions)
      ? permissions.filter((p): p is string => typeof p === "string")
      : [],
  };
}

/** The one error shape the API emits — every failure, every route. */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly reason?: string;
}

/** Narrows openapi-fetch's error union to the envelope the backend documents. */
export function apiError(error: unknown): ApiError {
  const envelope = (error as { error?: ApiError } | undefined)?.error;
  return envelope ?? { code: "INTERNAL", message: "the API could not be reached" };
}
