/**
 * What the proposal builder reads, read once and shaped for its three steps.
 *
 * Nothing here decides a rule the API owns. The issuer a country maps to is the
 * firm's own preference rows; the currency a document may be in is refused or
 * accepted by the API; the list price is the catalogue's. This file only turns
 * those reads into the shapes the screens draw.
 */

import { api } from "@/lib/api/client";
import type { ConfigEntry, ServiceAxis } from "@/lib/api/client";

// ── The firm's own companies ────────────────────────────────────────────────

/** One of the firm's own companies, as the "Issued by" picker offers it. */
export interface FirmEntity {
  readonly partyId: string;
  readonly name: string;
  /** Where it is registered. Null for a company with no registration recorded,
   *  which is every firm's seeded default until somebody registers it. */
  readonly jurisdiction: string | null;
  readonly defaultCurrency: string;
}

export interface FirmEntities {
  readonly entities: readonly FirmEntity[];
  /** Client country (ISO, or `*`) to the company that issues to it. */
  readonly routes: ReadonlyMap<string, string>;
  /** The firm's own books are kept in this currency. A document in any other
   *  one carries an exchange rate back to it. */
  readonly reportingCurrency: string;
}

/**
 * THE CURRENCY A COMPANY QUOTES IN, BY DEFAULT (D1).
 *
 * Interim: the API's own copy of this rule arrives with `GET /firm-entities`
 * (T6.18 backend, item 4) as `defaultCurrency`, and this map goes the day that
 * route is in the generated client. Until then it is the four countries the
 * decision names, and the firm's reporting currency for everything else.
 */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  IN: "INR",
  AE: "AED",
  SG: "SGD",
  US: "USD",
};

/** Interim, like the map above: the reporting currency is not on any staff
 *  route yet. Every firm on BiB today keeps its books in rupees. */
const REPORTING_CURRENCY = "INR";

export function currencyFor(jurisdiction: string | null, reporting: string): string {
  return (jurisdiction === null ? undefined : COUNTRY_CURRENCY[jurisdiction]) ?? reporting;
}

/**
 * The firm's companies, read off its preference rows: every company named by a
 * row is one of the firm's own (that is what `crm.is_firm_entity` says), and
 * the rows themselves are the routing rule.
 */
export async function loadFirmEntities(): Promise<FirmEntities | { error: unknown }> {
  const result = await api.GET("/api/v1/firm-entities/preferences", {});
  if (result.error) return { error: result.error };
  const reportingCurrency = REPORTING_CURRENCY;
  const byId = new Map<string, FirmEntity>();
  const routes = new Map<string, string>();
  for (const p of result.data.preferences) {
    routes.set(p.clientJurisdiction, p.firmEntityPartyId);
    if (!byId.has(p.firmEntity.id)) {
      byId.set(p.firmEntity.id, {
        partyId: p.firmEntity.id,
        name: p.firmEntity.displayName,
        jurisdiction: p.firmEntity.jurisdiction,
        defaultCurrency: currencyFor(p.firmEntity.jurisdiction, reportingCurrency),
      });
    }
  }
  const entities = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { entities, routes, reportingCurrency };
}

/**
 * Which company issues to a client in this country (D4): the firm's row for
 * that country, else its `*` fallback. Null only for a firm with no rows at
 * all, which provisioning never leaves.
 */
export function issuerFor(firm: FirmEntities, clientCountry: string | null): FirmEntity | null {
  const id =
    (clientCountry === null ? undefined : firm.routes.get(clientCountry)) ?? firm.routes.get("*");
  return firm.entities.find((e) => e.partyId === id) ?? firm.entities[0] ?? null;
}

// ── The catalogue ───────────────────────────────────────────────────────────

export type Recurrence = "one_time" | "monthly" | "quarterly" | "annually" | "custom";

const RECURRENCES: readonly Recurrence[] = ["one_time", "monthly", "quarterly", "annually", "custom"];

/** A published service, with the fields the picker draws. */
export interface CatalogueService {
  readonly key: string;
  /** The PUBLISHED version: what a new line is pinned to. */
  readonly versionId: string;
  /** The firm's own code, "H1" / "R10". */
  readonly ref: string | null;
  readonly name: string;
  /** Dept code. */
  readonly module: string | null;
  /** Delivery team code. */
  readonly group: string | null;
  /** Where it is offered; empty means everywhere. */
  readonly jurisdictions: readonly string[];
  readonly recurrence: Recurrence | null;
  readonly listPrice: { readonly amount: string; readonly currency: string } | null;
  readonly pricingNote: string | null;
  readonly scope: string | null;
  readonly clientObligations: string | null;
  readonly volumeLimits: string | null;
  readonly exclusions: string | null;
}

/** A body read defensively: a published body is frozen, and a field it never
 *  carried is "not stated", never a default. */
export function readCatalogue(entries: readonly ConfigEntry[]): CatalogueService[] {
  const out: CatalogueService[] = [];
  for (const e of entries) {
    const published = e.published;
    if (published === null) continue;
    const body = published.body;
    const text = (key: string): string | null => {
      const v = body[key];
      return typeof v === "string" && v.trim() !== "" ? v : null;
    };
    const rawPrice = body["listPrice"];
    const price =
      typeof rawPrice === "object" && rawPrice !== null ? (rawPrice as Record<string, unknown>) : null;
    const amount = price?.["amount"];
    const currency = price?.["currency"];
    const rawJ = body["jurisdictions"];
    const rawR = body["recurrence"];
    out.push({
      key: e.entry.key,
      versionId: published.id,
      ref: text("ref"),
      name: text("name") ?? e.entry.key,
      module: text("module"),
      group: text("group"),
      jurisdictions: Array.isArray(rawJ)
        ? rawJ.filter((j): j is string => typeof j === "string").map((j) => j.toUpperCase())
        : [],
      recurrence: RECURRENCES.find((r) => r === rawR) ?? null,
      listPrice:
        typeof amount === "string" && typeof currency === "string" ? { amount, currency } : null,
      pricingNote: text("pricingNote"),
      scope: text("scope"),
      clientObligations: text("clientObligations"),
      volumeLimits: text("volumeLimits"),
      exclusions: text("exclusions"),
    });
  }
  return out;
}

/** Every country the catalogue names, in the order a reader expects: the
 *  issuer's first, then alphabetical by code. */
export function catalogueCountries(services: readonly CatalogueService[]): string[] {
  const set = new Set<string>();
  for (const s of services) for (const j of s.jurisdictions) set.add(j);
  return [...set].sort();
}

/** What shows under a country chip: the services offered there, and the ones
 *  offered everywhere (D3). */
export function offeredIn(services: readonly CatalogueService[], country: string): CatalogueService[] {
  return services.filter((s) => s.jurisdictions.length === 0 || s.jurisdictions.includes(country));
}

// ── Grouping by Dept, then delivery team ───────────────────────────────────

export interface DeptGroup {
  readonly code: string | null;
  readonly name: string;
  readonly teams: readonly {
    readonly code: string | null;
    readonly name: string | null;
    readonly services: readonly CatalogueService[];
  }[];
}

/**
 * The picker's sections: by Dept in the firm's own order, then by delivery team
 * as a sub-heading, then by the service's code. A service naming no Dept goes
 * last under "Other services" rather than disappearing.
 */
export function groupByDept(
  services: readonly CatalogueService[],
  axes: readonly ServiceAxis[],
): DeptGroup[] {
  const depts = axes.filter((a) => a.axis === "dept").sort((a, b) => a.sortOrder - b.sortOrder);
  const teams = axes.filter((a) => a.axis === "team");
  const teamName = (code: string | null): string | null =>
    code === null ? null : (teams.find((t) => t.code === code)?.name ?? code);
  const byCode = (a: CatalogueService, b: CatalogueService): number =>
    (a.ref ?? "").localeCompare(b.ref ?? "", undefined, { numeric: true }) ||
    a.name.localeCompare(b.name);

  const deptOrder: (string | null)[] = depts.map((d) => d.code);
  for (const s of services) {
    if (s.module !== null && !deptOrder.includes(s.module)) deptOrder.push(s.module);
  }
  deptOrder.push(null);

  const out: DeptGroup[] = [];
  for (const code of deptOrder) {
    const mine = services.filter((s) => s.module === code).sort(byCode);
    if (mine.length === 0) continue;
    const teamCodes: (string | null)[] = [];
    for (const s of mine) if (!teamCodes.includes(s.group)) teamCodes.push(s.group);
    // Services with no team first, directly under the Dept, then each team.
    teamCodes.sort((a, b) => (a === null ? -1 : b === null ? 1 : (teamName(a) ?? "").localeCompare(teamName(b) ?? "")));
    out.push({
      code,
      name:
        code === null
          ? "Other services"
          : (depts.find((d) => d.code === code)?.name ?? code),
      teams: teamCodes.map((t) => ({
        code: t,
        name: teamName(t),
        services: mine.filter((s) => s.group === t),
      })),
    });
  }
  return out;
}

// ── Words ───────────────────────────────────────────────────────────────────

/** How often a fee falls due, after the amount: "INR 50,000 / month". */
export const PER: Readonly<Record<Recurrence, string>> = {
  one_time: "one-time",
  monthly: "/ month",
  quarterly: "/ quarter",
  annually: "/ year",
  custom: "",
};

/** The frequency as a reader picks it. */
export const FREQUENCY_LABELS: Readonly<Record<Recurrence, string>> = {
  one_time: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Yearly",
  custom: "Custom",
};

export const FREQUENCIES: readonly Recurrence[] = RECURRENCES;

/** The builder's three steps, as the URL names them. */
export type BuilderStep = "client" | "services" | "preview";

export function readStep(raw: string | null): BuilderStep {
  return raw === "client" || raw === "preview" ? raw : "services";
}
