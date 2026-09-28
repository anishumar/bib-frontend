/**
 * A catalogue service, read and written by the Catalogue's screens: the list
 * (`/catalogue`), a service's own page (`/catalogue/[serviceKey]`) and "Add a
 * service" (`/catalogue/new`). One file, so the three cannot read a body, word
 * a price or decide a status three ways.
 *
 * WHY A BODY IS READ BY HAND. The registry stores a body as free-form JSON, so
 * the OpenAPI document types it as `{ [key: string]: unknown }` and no field
 * name here exists in `schema.d.ts`: `npm run typecheck` cannot catch a
 * misspelt one. The API is the check instead: it refuses an unknown key
 * outright rather than storing it, and the screens show that refusal verbatim.
 *
 * NULL IS A REAL ANSWER. Every field but the name falls back to null rather
 * than to a value, mirroring the backend's own reader: `slaDays: null` is not
 * zero and `recurrence: null` is not one_time, and a screen that rendered
 * either as a default would be inventing a commitment out of silence.
 *
 * `client.ts` has a `readServiceBody` for the name and the price, and the
 * proposal builder reads its own `CatalogueService`; this is the FULL record,
 * beside the only screens that show one.
 */

import type { ConfigEntry, ConfigVersion, FirmEntity, ServiceAxis } from "@/lib/api/client";
import { formatMoney } from "@/lib/api/client";
import { cleanAmount } from "@/lib/money";
import { countryName } from "@/lib/country";

export const BILLING_BASES = ["fixed", "hourly", "retainer", "per_unit"] as const;
export const RECURRENCES = ["one_time", "monthly", "quarterly", "annually", "custom"] as const;
export type BillingBasis = (typeof BILLING_BASES)[number];
export type Recurrence = (typeof RECURRENCES)[number];

/** The words for the product's own two enums (brief §8.7: "Retainer",
 *  "Monthly", never the code). */
export const BASIS_WORDS: Readonly<Record<BillingBasis, string>> = {
  fixed: "Fixed fee",
  hourly: "Hourly rate",
  retainer: "Retainer",
  per_unit: "Per unit",
};
export const RECURRENCE_WORDS: Readonly<Record<Recurrence, string>> = {
  one_time: "One time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Yearly",
  custom: "Custom",
};

/** "/ month" after a price. A one-time or custom service says so in its own
 *  words; no recurrence stated says nothing rather than guessing. */
const PER: Readonly<Record<Recurrence, string>> = {
  one_time: "one time",
  monthly: "/ month",
  quarterly: "/ quarter",
  annually: "/ year",
  custom: "",
};

export interface ServiceRecord {
  readonly name: string;
  /** The firm's OWN code ("R12"), printed on proposals. Not the entry key. */
  readonly ref: string | null;
  /** Stored and shown when set; no screen or document reads either. */
  readonly description: string | null;
  readonly category: string | null;
  /** The Dept code. */
  readonly module: string | null;
  /** The delivery team code. */
  readonly group: string | null;
  /** Where it is offered; empty means everywhere. */
  readonly jurisdictions: readonly string[];
  readonly billingBasis: BillingBasis | null;
  readonly recurrence: Recurrence | null;
  readonly slaDays: number | null;
  readonly listPrice: { readonly amount: string; readonly currency: string } | null;
  readonly pricingNote: string | null;
  readonly scope: string | null;
  readonly clientObligations: string | null;
  readonly volumeLimits: string | null;
  readonly exclusions: string | null;
  /** The process every job for this service follows (T2.7). A key: the
   *  catalogue points at the firm's CURRENT process, the job pins a version. */
  readonly workflowTemplateKey: string | null;
}

export function readServiceRecord(body: Record<string, unknown> | undefined): ServiceRecord {
  const jurisdictions = body?.["jurisdictions"];
  const slaDays = body?.["slaDays"];
  return {
    name: readText(body?.["name"]) ?? "",
    ref: readText(body?.["ref"]),
    description: readText(body?.["description"]),
    category: readText(body?.["category"]),
    module: readText(body?.["module"]),
    group: readText(body?.["group"]),
    jurisdictions: Array.isArray(jurisdictions)
      ? jurisdictions.filter((j): j is string => typeof j === "string").map((j) => j.toUpperCase())
      : [],
    billingBasis: readOneOf(body?.["billingBasis"], BILLING_BASES),
    recurrence: readOneOf(body?.["recurrence"], RECURRENCES),
    slaDays:
      typeof slaDays === "number" && Number.isInteger(slaDays) && slaDays >= 0 ? slaDays : null,
    listPrice: readListPrice(body?.["listPrice"]),
    pricingNote: readText(body?.["pricingNote"]),
    scope: readText(body?.["scope"]),
    clientObligations: readText(body?.["clientObligations"]),
    volumeLimits: readText(body?.["volumeLimits"]),
    exclusions: readText(body?.["exclusions"]),
    workflowTemplateKey: readText(body?.["workflowTemplateKey"]),
  };
}

/** A stored string, or null when there is nothing to print. Blank collapses
 *  to null: absent and "" are the same fact to every reader here. */
function readText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** A value outside the closed set is not rendered as itself: these sets are
 *  branched on, so a hand-edited body naming something else said nothing. */
function readOneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function readListPrice(raw: unknown): { amount: string; currency: string } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const price = raw as Record<string, unknown>;
  const amount = price["amount"];
  const currency = price["currency"];
  return typeof amount === "string" && typeof currency === "string"
    ? { amount, currency: currency.toUpperCase() }
    : null;
}

// ── One row of the catalogue ────────────────────────────────────────────────

/**
 * Where a service stands, as the list's pill says it (brief §8.1).
 *
 * `draft` counts only when it is NEWER than what is in force. Publishing the
 * newest of two drafts leaves the older one a draft forever (the registry has
 * no discard), and the list's `pendingDraft` is the newest draft left, so a
 * draft older than the published version is history, not a pending change.
 */
export type ServiceStatus = "live" | "draft" | "changes";

export interface ServiceRow {
  /** The catalogue ENTRY's id: what a compliance filing is linked to (T6.16). */
  readonly id: string;
  readonly key: string;
  readonly published: ConfigVersion | null;
  /** A draft waiting to be published, newer than the published version. */
  readonly draft: ConfigVersion | null;
  readonly status: ServiceStatus;
  /** What is in force, or the draft when nothing ever was. */
  readonly body: ServiceRecord;
  /** The body the next edit starts from: the pending draft, else what is in
   *  force. */
  readonly working: ServiceRecord;
}

export function rowOf(entry: ConfigEntry): ServiceRow {
  return rowFrom(entry.entry, entry.published, entry.pendingDraft);
}

/** The same row from a service's whole history (`GET /config/service/{key}`),
 *  newest first, which is what the service's own page reads. */
export function rowFromHistory(
  entry: ConfigEntry["entry"],
  versions: readonly ConfigVersion[],
): ServiceRow {
  const published = versions.find((v) => v.status === "published") ?? null;
  const draft = versions.find((v) => v.status === "draft") ?? null;
  return rowFrom(entry, published, draft);
}

function rowFrom(
  entry: ConfigEntry["entry"],
  published: ConfigVersion | null,
  newestDraft: ConfigVersion | null,
): ServiceRow {
  const draft =
    newestDraft !== null && (published === null || newestDraft.version > published.version)
      ? newestDraft
      : null;
  const status: ServiceStatus = published === null ? "draft" : draft === null ? "live" : "changes";
  const body = readServiceRecord((published ?? draft)?.body);
  return {
    id: entry.id,
    key: entry.key,
    published,
    draft,
    status,
    body,
    working: draft === null ? body : readServiceRecord(draft.body),
  };
}

export const STATUS_WORDS: Readonly<Record<ServiceStatus, string>> = {
  live: "Live",
  draft: "Draft",
  changes: "Unpublished changes",
};

/** What a service is called on screen: its name, or its key for a body that
 *  somehow has none (a hand edit), rather than a blank. */
export function nameOf(row: ServiceRow): string {
  return row.body.name === "" ? row.key : row.body.name;
}

// ── Words ───────────────────────────────────────────────────────────────────

/** "AED 4,000 / month", "₹15,000 one time", or null when there is no list
 *  price. INR in lakhs whatever the browser (`formatMoney`). */
export function priceWords(body: ServiceRecord): string | null {
  if (body.listPrice === null) return null;
  const money = formatMoney(body.listPrice.amount, body.listPrice.currency);
  const per = body.recurrence === null ? "" : PER[body.recurrence];
  return per === "" ? money : `${money} ${per}`;
}

/** "India, Singapore", or "Everywhere" for a service offered in every
 *  country (an empty list). */
export function countriesWords(codes: readonly string[]): string {
  return codes.length === 0 ? "Everywhere" : codes.map(countryName).join(", ");
}

/** The turnaround, or null when nobody committed to one. Null is NOT zero:
 *  zero is a commitment to the day itself. */
export function turnaroundWords(days: number | null, recurrence: Recurrence | null): string | null {
  if (days === null) return null;
  const recurring = recurrence === "monthly" || recurrence === "quarterly" || recurrence === "annually";
  if (days === 0) return recurring ? "Due the day each period ends" : "Due on the day the letter is signed";
  const unit = days === 1 ? "day" : "days";
  return recurring ? `${String(days)} ${unit} after each period ends` : `${String(days)} ${unit} from signing`;
}

// ── Depts ───────────────────────────────────────────────────────────────────

/** 1 to 4: which of the category tints a Dept wears (`--cat-1…4`). */
export type CatTint = 1 | 2 | 3 | 4;

/**
 * A Dept's tint, by its place in the firm's own order: the first three Depts
 * get the three tints, anything else (a fourth Dept, a code no longer on the
 * list) the spare. A GROUP colour, never a state: see the colour rule in
 * CLAUDE.md. Null for a service filed under no Dept.
 */
export function deptTint(axes: readonly ServiceAxis[], code: string | null): CatTint | null {
  if (code === null) return null;
  const depts = axes.filter((a) => a.axis === "dept").sort((a, b) => a.sortOrder - b.sortOrder);
  const at = depts.findIndex((d) => d.code === code);
  return at === 0 ? 1 : at === 1 ? 2 : at === 2 ? 3 : 4;
}

/** A Dept or team code as the firm names it, or the code itself. */
export function axisName(
  axes: readonly ServiceAxis[],
  axis: "dept" | "team",
  code: string | null,
): string | null {
  if (code === null) return null;
  return axes.find((a) => a.axis === axis && a.code === code)?.name ?? code;
}

/** Depts first in the firm's own order, then by the firm's code (numeric, so
 *  H2 before H10), then by name; a service with no Dept goes last. */
export function catalogueOrder(axes: readonly ServiceAxis[]) {
  const depts = axes.filter((a) => a.axis === "dept").sort((a, b) => a.sortOrder - b.sortOrder);
  const rank = (code: string | null): number => {
    if (code === null) return Number.MAX_SAFE_INTEGER;
    const at = depts.findIndex((d) => d.code === code);
    return at === -1 ? depts.length : at;
  };
  return (a: ServiceRow, b: ServiceRow): number =>
    rank(a.body.module) - rank(b.body.module) ||
    (a.body.module ?? "").localeCompare(b.body.module ?? "") ||
    (a.body.ref ?? "~").localeCompare(b.body.ref ?? "~", undefined, { numeric: true }) ||
    nameOf(a).localeCompare(nameOf(b));
}

// ── Currency ────────────────────────────────────────────────────────────────

/** D1: the four countries whose currency the product already knows. */
const KNOWN: Readonly<Record<string, string>> = { IN: "INR", AE: "AED", SG: "SGD", US: "USD" };

/**
 * The currency a service offered in this country is priced in by default: the
 * firm's own company there quotes in its currency (the API decides that, once),
 * else D1's four, else the firm's books currency. It is only a default: the
 * form lets the partner change it.
 */
export function currencyFor(
  country: string | null,
  companies: readonly FirmEntity[],
  reportingCurrency: string,
): string {
  if (country === null) return reportingCurrency;
  return (
    companies.find((c) => c.jurisdiction === country)?.defaultCurrency ??
    KNOWN[country] ??
    reportingCurrency
  );
}

// ── Writing a body ──────────────────────────────────────────────────────────

/** What the service form holds: every box as the partner typed it. */
export interface ServiceDraft {
  name: string;
  ref: string;
  module: string;
  group: string;
  jurisdictions: string[];
  workflowTemplateKey: string;
  slaDays: string;
  amount: string;
  currency: string;
  recurrence: string;
  billingBasis: string;
  pricingNote: string;
  scope: string;
  clientObligations: string;
  volumeLimits: string;
  exclusions: string;
}

export type ScopeField = "scope" | "clientObligations" | "volumeLimits" | "exclusions";

/** The four blocks, in the order a letter reads them. */
export const SCOPE_BLOCKS: readonly {
  readonly field: ScopeField;
  readonly heading: string;
  readonly placeholder: string;
}[] = [
  { field: "scope", heading: "What we do", placeholder: "e.g. Monthly management accounts and a board pack." },
  {
    field: "clientObligations",
    heading: "What the client does",
    placeholder: "e.g. Bank statements and invoices by the 5th.",
  },
  { field: "volumeLimits", heading: "What the price assumes", placeholder: "e.g. Up to 1,000 entries a month." },
  { field: "exclusions", heading: "What is not included", placeholder: "e.g. Statutory audit. Litigation support." },
];

export function draftOf(record: ServiceRecord | null, currency: string): ServiceDraft {
  return {
    name: record?.name ?? "",
    ref: record?.ref ?? "",
    module: record?.module ?? "",
    group: record?.group ?? "",
    jurisdictions: [...(record?.jurisdictions ?? [])],
    workflowTemplateKey: record?.workflowTemplateKey ?? "",
    slaDays: record?.slaDays === null || record === null ? "" : String(record.slaDays),
    amount: record?.listPrice?.amount.replace(/\.0+$/, "") ?? "",
    currency: record?.listPrice?.currency ?? currency,
    recurrence: record?.recurrence ?? "",
    billingBasis: record?.billingBasis ?? "fixed",
    pricingNote: record?.pricingNote ?? "",
    scope: record?.scope ?? "",
    clientObligations: record?.clientObligations ?? "",
    volumeLimits: record?.volumeLimits ?? "",
    exclusions: record?.exclusions ?? "",
  };
}

/**
 * A service body from the form.
 *
 * ONLY FIELDS WITH A VALUE. The API refuses an unknown key outright and an
 * EMPTY prose block by name, so a blank box is sent as nothing at all. That
 * also makes clearing a box on an edit mean what it looks like: the new
 * version does not state it.
 *
 * `module`, `group` and `ref` go through VERBATIM: the API demands their
 * canonical form at the write, and quietly upper-casing here would hide that
 * rule from the person who typed "frc".
 *
 * `kept` carries the two fields no form shows (description, category): nothing
 * reads them, but an edit must not silently drop what a body already says.
 */
export function bodyOf(d: ServiceDraft, kept: ServiceRecord | null): Record<string, unknown> {
  const body: Record<string, unknown> = { name: d.name.trim(), billingBasis: d.billingBasis };
  const put = (field: string, value: string): void => {
    const v = value.trim();
    if (v !== "") body[field] = v;
  };
  if (d.ref !== "") body["ref"] = d.ref;
  if (d.module !== "") body["module"] = d.module;
  if (d.group !== "") body["group"] = d.group;
  if (d.recurrence !== "") body["recurrence"] = d.recurrence;
  if (d.workflowTemplateKey !== "") body["workflowTemplateKey"] = d.workflowTemplateKey;
  put("pricingNote", d.pricingNote);
  for (const b of SCOPE_BLOCKS) put(b.field, d[b.field]);
  if (kept?.description != null) body["description"] = kept.description;
  if (kept?.category != null) body["category"] = kept.category;
  if (d.jurisdictions.length > 0) body["jurisdictions"] = d.jurisdictions.map((j) => j.toUpperCase());
  // A day count is a NUMBER, unlike money. Anything that is not a whole
  // number goes through as typed, so the API refuses it by name.
  const sla = d.slaDays.trim();
  if (sla !== "") body["slaDays"] = /^\d+$/.test(sla) ? Number(sla) : sla;
  // Half a price is refused, so the currency travels with the amount. Null
  // means "we quote it", never zero.
  const amount = cleanAmount(d.amount);
  if (amount !== "") body["listPrice"] = { amount, currency: d.currency.toUpperCase() };
  return body;
}

/** The fields the form checks before any call, in the words beside each box.
 *  What only the API knows (a code format, a retired Dept) still arrives as
 *  its own sentence. */
export function refusalsOf(d: ServiceDraft): Partial<Record<"name" | "amount" | "slaDays", string>> {
  const out: Partial<Record<"name" | "amount" | "slaDays", string>> = {};
  if (d.name.trim() === "") out.name = "Give the service a name, e.g. UAE bookkeeping.";
  const amount = cleanAmount(d.amount);
  if (amount !== "" && !/^\d+(\.\d{1,2})?$/.test(amount)) out.amount = "Numbers only, e.g. 25,000.";
  const sla = d.slaDays.trim();
  if (sla !== "" && !/^\d+$/.test(sla)) out.slaDays = "Whole days only, e.g. 10.";
  return out;
}

/**
 * The entry key for a new service: made from its name, because the key is a
 * handle the partner never needs to see (brief §8.7) and every document pins
 * through it. Lower case, starting with a letter, words joined by "-", at most
 * 64 characters, and unique among `taken`. "new" is kept free for
 * `/catalogue/new`.
 */
export function keyFrom(name: string, taken: ReadonlySet<string>): string {
  let base = name
    .toLowerCase()
    .normalize("NFKD")
    // The accents NFKD split off go, rather than becoming a "-" each:
    // "Société" is "societe", not "socie-te".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
    .replace(/-+$/, "");
  if (base === "" || !/^[a-z]/.test(base)) base = `service-${base}`.replace(/-+$/, "");
  if (base === "new") base = "new-service";
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${String(n)}`;
  return key;
}

// ── What changed between two versions ─────────────────────────────────────

/** How a code reads: the firm's own names for its Depts, teams and processes,
 *  which the page has and this file does not. */
export interface Namer {
  readonly dept: (code: string) => string;
  readonly team: (code: string) => string;
  readonly process: (key: string) => string;
}

/** Every field a person reads, in the order the page shows them. */
function fields(n: Namer): readonly { readonly label: string; readonly words: (b: ServiceRecord) => string | null }[] {
  return [
    { label: "Name", words: (b) => (b.name === "" ? null : b.name) },
    { label: "Code", words: (b) => b.ref },
    { label: "Dept", words: (b) => (b.module === null ? null : n.dept(b.module)) },
    { label: "Delivery team", words: (b) => (b.group === null ? null : n.team(b.group)) },
    { label: "Offered in", words: (b) => countriesWords(b.jurisdictions) },
    { label: "Price", words: (b) => priceWords(b) },
    { label: "Charged as", words: (b) => (b.billingBasis === null ? null : BASIS_WORDS[b.billingBasis]) },
    { label: "How often", words: (b) => (b.recurrence === null ? null : RECURRENCE_WORDS[b.recurrence]) },
    { label: "Pricing note", words: (b) => b.pricingNote },
    { label: "Turnaround", words: (b) => turnaroundWords(b.slaDays, b.recurrence) },
    {
      label: "How it is delivered",
      words: (b) => (b.workflowTemplateKey === null ? null : n.process(b.workflowTemplateKey)),
    },
    ...SCOPE_BLOCKS.map((s) => ({ label: s.heading, words: (b: ServiceRecord) => b[s.field] })),
  ];
}

/** Long text is named, not quoted: a paragraph before and after is a diff
 *  nobody reads in a row. */
const LONG = new Set<string>(SCOPE_BLOCKS.map((s) => s.heading));

export interface Change {
  readonly label: string;
  /** "SGD 900 / quarter", or null for "Not set", or undefined for a long text
   *  whose words are not repeated. */
  readonly before?: string | null;
  readonly after?: string | null;
}

export function changesBetween(before: ServiceRecord, after: ServiceRecord, names: Namer): Change[] {
  const out: Change[] = [];
  for (const f of fields(names)) {
    const a = f.words(before);
    const b = f.words(after);
    if (a === b) continue;
    out.push(LONG.has(f.label) ? { label: f.label } : { label: f.label, before: a, after: b });
  }
  return out;
}
