"use client";

import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, FirmEntity, ObligationRule, ServiceAxis } from "@/lib/api/client";
import { Notice } from "@/components/ui";
import { countryName } from "@/lib/country";
import { currencyFor } from "./service";

/**
 * What the service page and "Add a service" both read before the form can be
 * drawn, and the refusal note both show.
 */

export interface FormContext {
  /** The firm's Depts and teams: the full structure (retired rows marked) for
   *  an admin, else the active ones. */
  readonly axes: readonly ServiceAxis[];
  /** The firm's processes, for "How it is delivered". */
  readonly workflows: readonly ConfigEntry[];
  readonly companies: readonly FirmEntity[];
  readonly reportingCurrency: string;
  /** The whole catalogue: for the countries it already names, the currencies
   *  it already prices in, and the keys a new service must not reuse. */
  readonly services: readonly ConfigEntry[];
  /** The compliance library; null when this session may not read it. */
  readonly filings: readonly ObligationRule[] | null;
  /** The last read of the library failed for a reason that is not a
   *  permission (a throttle, a server error): see `ComplianceFilings`. */
  readonly filingsUnread: boolean;
}

/**
 * Six reads in parallel. `/tenancy/structure` is `tenant:admin` and answers
 * 403 to anybody else, which is not an error here: they get the active list
 * from `/tenancy/axes` (`party:read`) and cannot write anyway.
 */
export async function loadFormContext(): Promise<FormContext | { status: number; message: string }> {
  const [catalogue, structure, active, processes, companies, compliance] = await Promise.all([
    api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
    api.GET("/api/v1/tenancy/structure", {}),
    api.GET("/api/v1/tenancy/axes", {}),
    api.GET("/api/v1/config/{kind}", { params: { path: { kind: "workflow_template" } } }),
    api.GET("/api/v1/firm-entities", {}),
    // Every service's filings in one request, never one per service.
    api.GET("/api/v1/obligation-filings", {}),
  ]);
  if (catalogue.error) {
    return { status: catalogue.response.status, message: apiError(catalogue.error).message };
  }
  return {
    axes: structure.data?.axes ?? active.data?.axes ?? [],
    workflows: processes.data?.entries ?? [],
    companies: companies.data?.entities ?? [],
    reportingCurrency: companies.data?.reportingCurrency ?? "INR",
    services: catalogue.data.entries,
    // ONLY A 403 MEANS "YOUR ROLE CANNOT SEE": see `ComplianceFilings`.
    filings: compliance.data?.filings ?? null,
    filingsUnread: compliance.data === undefined && compliance.response.status !== 403,
  };
}

/** The countries offered as ticks: the firm's own companies' first, then any
 *  the catalogue already names, each once, by name. */
export function suggestedCountries(ctx: FormContext): string[] {
  const out = new Set<string>();
  for (const c of ctx.companies) if (c.jurisdiction !== null) out.add(c.jurisdiction);
  for (const e of ctx.services) {
    const j = (e.published ?? e.pendingDraft)?.body["jurisdictions"];
    if (Array.isArray(j)) for (const c of j) if (typeof c === "string") out.add(c.toUpperCase());
  }
  return [...out].sort((a, b) => countryName(a).localeCompare(countryName(b)));
}

/** Every currency the firm already uses, plus the one the form holds. */
export function currencyList(ctx: FormContext, current: string): string[] {
  const out = new Set<string>([current, ctx.reportingCurrency, "INR", "AED", "SGD", "USD"]);
  for (const c of ctx.companies) out.add(c.defaultCurrency);
  for (const e of ctx.services) {
    const price = (e.published ?? e.pendingDraft)?.body["listPrice"];
    if (typeof price === "object" && price !== null) {
      const cur = (price as Record<string, unknown>)["currency"];
      if (typeof cur === "string") out.add(cur.toUpperCase());
    }
  }
  return [...out].sort();
}

export function currencyOf(ctx: FormContext) {
  return (country: string | null): string => currencyFor(country, ctx.companies, ctx.reportingCurrency);
}

// ── Refusals ────────────────────────────────────────────────────────────────

export interface Failure {
  readonly at: string;
  readonly message: string;
  readonly reason: string | null;
}

export function failureOf(at: string, error: unknown): Failure {
  const envelope = apiError(error);
  return { at, message: envelope.message, reason: envelope.reason ?? null };
}

/**
 * What the API said, where it was said: next to the press that caused it, in
 * the API's own words. Several of these are the only place a firm learns a
 * rule ("frc" beside "FRC" splits a revenue report in two), and none is
 * improved by a local rewrite.
 */
export function FailureNote({ failure }: { failure: Failure }) {
  return (
    <Notice tone="danger">
      <p>{failure.message}</p>
    </Notice>
  );
}

// ── Arriving from "Add a service" ──────────────────────────────────────────

/** What "Add a service" hands the service's page when it lands there: the
 *  sentence it would have said, and each filing refused after the service
 *  went in. Carried in sessionStorage under `ARRIVAL_KEY.<key>`, read once. */
export interface Arrival {
  readonly sentence: string;
  readonly failed: readonly { readonly name: string; readonly message: string }[];
  /** "Add the service" put it in, and then its publish was refused: the
   *  API's sentence. The service is there as a draft. */
  readonly unpublished?: string | null;
}
export const ARRIVAL_KEY = "bib.catalogue.added";
