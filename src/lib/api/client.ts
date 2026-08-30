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

/** One row of the firm's roster — a membership with the person behind it, and
 *  the rung they sit on. */
export type Member =
  paths["/api/v1/tenancy/members"]["get"]["responses"][200]["content"]["application/json"]["members"][number];

/**
 * A rung of the firm's own hierarchy.
 *
 * A THIRD axis, independent of role and of fee visibility: the role says what
 * somebody may REACH, the grade says how SENIOR they are. It exists for one
 * comparison — the firm's review rule is "Manager or above" — which is why
 * `rank` is a plain integer and why nothing in this app interprets it.
 */
export type StaffGrade =
  paths["/api/v1/tenancy/grades"]["get"]["responses"][200]["content"]["application/json"]["grades"][number];

/**
 * One entry on a firm's own Dept or delivery-team list (G2.4).
 *
 * `code` is the join and never moves — every published service body names it,
 * and those bodies are frozen. `name` is what people read and is freely
 * editable. The two axes are INDEPENDENT, never nested: one delivery team
 * commonly works under several Depts.
 */
export type ServiceAxis =
  paths["/api/v1/tenancy/structure"]["get"]["responses"][200]["content"]["application/json"]["axes"][number];

/** Which of the firm's two lists a row is on. */
export type ServiceAxisKind = ServiceAxis["axis"];

/** How a firm cuts ONE client's work into separate jobs — `none` by default,
 *  which keeps it all in one job and is what most firms want. */
export type WorkSplitAxis =
  paths["/api/v1/tenancy/structure"]["get"]["responses"][200]["content"]["application/json"]["workSplitAxis"];

/** A unit of delivery work — what the engine owes a client, and how far it has
 *  got. Created by the scheduler when a contract activates (T2.6). */
export type Job =
  paths["/api/v1/jobs"]["get"]["responses"][200]["content"]["application/json"]["jobs"][number];

/**
 * One step of one job's process (T2.7).
 *
 * `status` carries the two distinctions that matter on a work board: `blocked`
 * means waiting for a PERSON, and `skipped` is not `done` — the step will not
 * happen and `outcomeNote` says why.
 */
export type JobStep =
  paths["/api/v1/jobs/{jobId}/steps"]["get"]["responses"][200]["content"]["application/json"]["steps"][number];

/**
 * What a machine produced for one step, and how sure it was (T2.8).
 *
 * `AgentProposal`, not `Proposal` — this product already has proposals, the
 * priced document a firm sends a prospect, and a second meaning of the word
 * would be a trap for whoever reads this file next.
 *
 * Null on a step where no machine answered, and null once one committed on its
 * own: in that case the work is simply done and there is nothing to decide.
 */
export type AgentProposal = NonNullable<JobStep["proposal"]>;

/**
 * One check on one step — work waiting for somebody else to look at it (T2.9).
 *
 * `viewer` is the SIGNED-IN person's own verdict on this row, computed by the
 * API against the firm's published rule. The queue is deliberately NOT filtered
 * to what the viewer may take, so a screen reads `viewer.eligible` to decide
 * whether to offer the button and `viewer.reason` to say why not.
 */
export type StepCheck =
  paths["/api/v1/checks"]["get"]["responses"][200]["content"]["application/json"]["checks"][number];

/** Why one person may not check one thing. A closed set, because each one is a
 *  sentence a screen has to say out loud. */
export type CheckIneligibility = NonNullable<StepCheck["viewer"]["reason"]>;

/** How a firm decides who may check work. The three the founder chooses
 *  between on /admin/verification. */
export type VerificationRule = NonNullable<StepCheck["rule"]>;

/** A member of staff, and whether they may check one particular thing. The
 *  WHOLE roster comes back with a verdict each — see /admin/verification. */
export type PossibleChecker =
  paths["/api/v1/checks/{approvalId}/checkers"]["get"]["responses"][200]["content"]["application/json"]["checkers"][number];

/**
 * What each refusal SAYS, to the person refused.
 *
 * Retyped from the API's own vocabulary rather than fetched, unlike
 * `PermissionInfo` — and the difference is deliberate. A permission's meaning is
 * a fact about what the server will DO, so a stale copy would mislead about
 * access. These are the same sentence said in a smaller space: the API sends
 * the full prose in its 403, which is what a person sees when they actually try.
 * This is the shorter form a table cell has room for.
 */
export const CHECK_INELIGIBILITY: Readonly<Record<CheckIneligibility, string>> = {
  IS_THE_MAKER: "You did this work",
  NO_WORK_PERMISSION: "Their role cannot complete work",
  BELOW_GRADE: "Below the grade this step is checked at",
  UNGRADED: "Not on the firm's ladder yet",
  NOT_THE_MAKERS_MANAGER: "Not the maker's manager",
};

/** What each rule means, in the words the founder's screen offers it in. */
export const VERIFICATION_RULES: readonly {
  readonly value: VerificationRule;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "rank_threshold",
    label: "Anybody senior enough",
    detail:
      "Anybody at or above a grade you choose may check the work. Nobody waits on one " +
      "particular person.",
  },
  {
    value: "reporting_line",
    label: "The maker's own manager",
    detail:
      "Only the person they report to may check it. The tightest rule — and it stops the " +
      "morning that manager is on leave, because nobody else becomes eligible.",
  },
  {
    value: "reporting_line_or_rank",
    label: "Their manager, or anybody senior enough",
    detail:
      "Their own manager normally, and anybody at or above a grade you choose when that " +
      "person is away.",
  },
];

/**
 * One row on the work board — what is owed and whose it is (T3.1).
 *
 * The other half of `Job`. A JOB is HOW work gets done: which template, which
 * steps, which agent. A WORK ITEM is WHAT is owed and WHOSE it is — a client, a
 * due date, a person, and a state in the firm's OWN words. They are linked by
 * `jobId` and either can be null: ad hoc work has no process, and a merged job
 * puts several work items on several desks.
 */
export type WorkItem =
  paths["/api/v1/work-items"]["get"]["responses"][200]["content"]["application/json"]["items"][number];

/** A work item with everything its own page shows. */
export type WorkItemDetail =
  paths["/api/v1/work-items/{workItemId}"]["get"]["responses"][200]["content"]["application/json"];

export type ChecklistItem = WorkItemDetail["checklist"][number];
export type WorkItemReview = WorkItemDetail["reviews"][number];

/**
 * A state a work item can be in — ONE ROW of the firm's own vocabulary.
 *
 * Read the FLAGS, never the code. `isBlocked` is what makes a reason mandatory,
 * `isTerminal` is what "finished" means, `isInitial` is where new work starts —
 * and the firm may rename any of them from /admin/work-vocabulary without a
 * deploy, which is the whole reason these are rows. A screen that branched on
 * `code === "blocked"` would break the first time somebody used that freedom.
 */
export type WorkItemState = WorkItem["state"];

/** How urgent, as a row. `rank` is what sorts — 1 is most urgent — and the name
 *  is display. */
export type WorkItemPriority = WorkItem["priority"];

/** The firm's whole vocabulary, retired rows included: an admin needs to see
 *  what was stopped and be able to bring it back. */
export type WorkVocabulary =
  paths["/api/v1/work-vocabulary"]["get"]["responses"][200]["content"]["application/json"];

/** A member of staff, and whether they may check one particular work item. The
 *  same rule a process step's check uses. */
export type WorkItemChecker =
  paths["/api/v1/work-item-checks/{approvalId}/checkers"]["get"]["responses"][200]["content"]["application/json"]["checkers"][number];

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

/** A proposal as a LIST shows it: the money, the client, and how many lines. */
export type ProposalSummary =
  paths["/api/v1/proposals"]["get"]["responses"][200]["content"]["application/json"]["proposals"][number];

/** One proposal in full: its lines, each with the catalogue version it was
 *  PINNED to, and the totals the database computed. */
export type ProposalRecord =
  paths["/api/v1/proposals/{proposalId}"]["get"]["responses"][200]["content"]["application/json"];

export type ProposalLine = ProposalRecord["lines"][number];

/** What the RECIPIENT of a share link reads. A different shape from the staff
 *  one, deliberately — it carries none of the firm's insides. */
export type SharedProposal =
  paths["/api/v1/proposals/shared"]["post"]["responses"][200]["content"]["application/json"];

/** A party, for a list or the client picker on a new proposal. */
export type PartySummary =
  paths["/api/v1/parties"]["get"]["responses"][200]["content"]["application/json"]["parties"][number];

/** Party 360: the party, its identifiers, and its effective-dated
 *  relationships. */
export type PartyProfile =
  paths["/api/v1/parties/{partyId}"]["get"]["responses"][200]["content"]["application/json"];

export type PartyIdentifier = PartyProfile["identifiers"][number];
export type PartyRelationship = PartyProfile["relationships"][number];

/**
 * Who at the firm owns a client, as it stood on one day (G3.2).
 *
 * `inForce` is the account team on `onDate`; `all` is every assignment the
 * client has ever had. Both come back on one request, which is what makes the
 * "as of" box on the client screen a filter rather than a round trip.
 */
export type AccountTeam =
  paths["/api/v1/parties/{partyId}/assignments"]["get"]["responses"][200]["content"]["application/json"];

export type ClientAssignment = AccountTeam["all"][number];
export type AssignmentRole = ClientAssignment["role"];

/** One client on the signed-in person's book, with every role they hold over
 *  it — a partner is commonly the Key Manager AND a Dept's SPOC on the same
 *  client, and this is one row either way. */
export type OwnedClient =
  paths["/api/v1/my-clients"]["get"]["responses"][200]["content"]["application/json"]["clients"][number];

/** One row of the pipeline: the opportunity, the prospect it is about, and
 *  whose desk it is on. */
export type LeadRecord =
  paths["/api/v1/leads"]["get"]["responses"][200]["content"]["application/json"]["leads"][number];

export type LeadStage = LeadRecord["lead"]["stage"];
export type LeadSource = LeadRecord["lead"]["source"];

/**
 * The closed sets, read off the generated schema rather than retyped.
 *
 * The API owns these — they are domain rules, not presentation — and a
 * hardcoded copy here would drift the day a stage is added. `satisfies` makes a
 * value that is not one of them a compile error.
 */
export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  // `abandoned` is a REAL stage, not a shade of `lost`, and the distinction is
  // the whole reason it exists: went quiet is a FOLLOW-UP problem, chose a
  // competitor is a PRICING problem, and a firm that files both as "lost"
  // destroys the only signal that tells its two fixable failures apart.
  "abandoned",
] as const satisfies readonly LeadStage[];

export const LEAD_SOURCES = [
  "referral",
  "inbound",
  "outbound",
  "event",
  "partner",
  "other",
] as const satisfies readonly LeadSource[];

/** Stages a lead never leaves. Reaching one closes the opportunity; a prospect
 *  who comes back is a NEW lead, which is what the API's one-open-lead-per-party
 *  rule leaves room for. */
export const TERMINAL_STAGES: readonly LeadStage[] = ["converted", "lost", "abandoned"];

/**
 * The two ways an opportunity ends without a win, and the only two stages the
 * API accepts a reason on.
 *
 * It REFUSES one anywhere else — a reason on a converted lead is a fact about
 * nothing — so a control that offered the box on `qualified` would be offering
 * a slower error. Required on both, symmetrically: making it optional on
 * `abandoned` would put a friction gradient between them, and the cheapest way
 * past a text box is to file a competitor loss as "went quiet".
 */
const CLOSED_UNWON_STAGES: readonly LeadStage[] = ["lost", "abandoned"];

export function recordsLostReason(stage: LeadStage): boolean {
  return CLOSED_UNWON_STAGES.includes(stage);
}

export type IdentifierType =
  NonNullable<
    paths["/api/v1/parties/{partyId}/identifiers"]["post"]["requestBody"]
  >["content"]["application/json"]["type"];

/**
 * A service's body, as the catalogue stores it.
 *
 * The registry keeps bodies as free-form JSON — each kind has its own shape and
 * they grow as their consumers land — so the generated schema types this as an
 * object of unknowns and the shape for ONE kind is read here, defensively. Same
 * treatment as readRoleBody above, for the same reason.
 */
export interface ServiceBody {
  readonly name: string;
  readonly listPrice: { readonly amount: string; readonly currency: string } | null;
}

export function readServiceBody(body: Record<string, unknown> | undefined): ServiceBody {
  const name = body?.["name"];
  const raw = body?.["listPrice"];
  const price = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const amount = price?.["amount"];
  const currency = price?.["currency"];
  return {
    name: typeof name === "string" ? name : "",
    listPrice:
      typeof amount === "string" && typeof currency === "string" ? { amount, currency } : null,
  };
}

/**
 * An amount, for a person to read.
 *
 * The API sends money as a decimal STRING and this app keeps it one all the way
 * to the screen. `Intl.NumberFormat.format` accepts a decimal string and
 * formats it EXACTLY; `format(Number(amount))` would route it through the one
 * JavaScript type that cannot hold 1499.50, undoing at the last possible moment
 * the thing the string exists for.
 */
export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    // A quote is read to the minor unit; the extra places the API stores are
    // for per-unit rates, not for a total on a page.
    maximumFractionDigits: 2,
  });
  const exact = asNumericLiteral(amount);
  // The fallback exists only for a value that is not a decimal at all, which
  // the API's own schema already refuses. It goes through Number() so something
  // still renders rather than the page throwing.
  return exact === null ? formatter.format(Number(amount)) : formatter.format(exact);
}

/**
 * The one assertion in this file, and the regex above it is why it is safe.
 *
 * `Intl.NumberFormat.format` takes a template-literal type (`${number}`) that a
 * plain `string` cannot satisfy, so reaching the exact path needs a narrowing
 * that TypeScript cannot do on its own. The test is the same shape the API's
 * schema enforces on the way out, so this asserts something already true rather
 * than hoping.
 */
type NumericLiteral = `${number}`;

function asNumericLiteral(value: string): NumericLiteral | null {
  return /^-?\d+(?:\.\d+)?$/.test(value) ? (value as NumericLiteral) : null;
}

/**
 * A quantity or a percentage, for a person to read.
 *
 * `numeric(14,4)` comes back as "12.0000", which is the column being precise and
 * not a person's idea of twelve. Trailing zeros are trimmed for display ONLY —
 * the string that goes back to the API is never reformatted, because the API's
 * precision is the API's business.
 *
 * Not used for money: an amount keeps its minor units even when they are zeros,
 * and Intl already decides how many a currency has.
 */
export function formatCount(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** An engagement letter as a LIST shows it. */
export type LetterSummary =
  paths["/api/v1/engagement-letters"]["get"]["responses"][200]["content"]["application/json"]["letters"][number];

/** One letter in full: its lines, its PINNED clauses, and the engagements it
 *  created at signature. */
export type LetterRecord =
  paths["/api/v1/engagement-letters/{letterId}"]["get"]["responses"][200]["content"]["application/json"];

export type LetterClause = LetterRecord["clauses"][number];
export type EngagementRecord = LetterRecord["engagements"][number];

/**
 * A clause body, as the library stores it.
 *
 * Read defensively for the same reason role and service bodies are: the
 * registry keeps bodies as free-form JSON because each kind has its own shape,
 * so the generated schema types this as an object of unknowns.
 */
export interface ClauseBody {
  readonly title: string;
  readonly text: string;
  readonly jurisdictions: readonly string[];
  /**
   * WHOSE LAW governs, and WHERE a dispute is heard — each a country code AND
   * the words the document prints.
   *
   * Both halves, because neither does the other's job: "the laws of the State
   * of Delaware" does not follow from `US`, and a screen cannot compare prose.
   * Null on almost every clause, which is correct — confidentiality and fee
   * terms name no law — so this app renders nothing rather than inventing one.
   */
  readonly governingLaw: JurisdictionalTerm | null;
  readonly courts: JurisdictionalTerm | null;
}

export interface JurisdictionalTerm {
  readonly jurisdiction: string;
  readonly text: string;
}

function readTerm(raw: unknown): JurisdictionalTerm | null {
  if (typeof raw !== "object" || raw === null) return null;
  const term = raw as Record<string, unknown>;
  const jurisdiction = term["jurisdiction"];
  const text = term["text"];
  return typeof jurisdiction === "string" && typeof text === "string"
    ? { jurisdiction, text }
    : null;
}

export function readClauseBody(body: Record<string, unknown> | undefined): ClauseBody {
  const title = body?.["title"];
  const text = body?.["text"];
  const jurisdictions = body?.["jurisdictions"];
  return {
    title: typeof title === "string" ? title : "",
    text: typeof text === "string" ? text : "",
    jurisdictions: Array.isArray(jurisdictions)
      ? jurisdictions.filter((j): j is string => typeof j === "string")
      : [],
    governingLaw: readTerm(body?.["governingLaw"]),
    courts: readTerm(body?.["courts"]),
  };
}

/**
 * Whether a clause may go on a letter written for this jurisdiction.
 *
 * The API refuses a mismatch — a term drafted elsewhere may be unenforceable
 * here — and this is the same rule, used only to decide what to OFFER. An empty
 * list means everywhere, which is how the API reads it too.
 */
export function clauseApplies(clause: ClauseBody, jurisdiction: string): boolean {
  return clause.jurisdictions.length === 0 || clause.jurisdictions.includes(jurisdiction);
}

/** An invoice as a LIST shows it: the money, the client, and what it is for. */
export type InvoiceSummary =
  paths["/api/v1/invoices"]["get"]["responses"][200]["content"]["application/json"]["invoices"][number];

/** One invoice in full: its lines and the totals the database computed. */
export type InvoiceRecord =
  paths["/api/v1/invoices/{invoiceId}"]["get"]["responses"][200]["content"]["application/json"];

export type InvoiceLine = InvoiceRecord["lines"][number];
export type InvoiceStatus = InvoiceRecord["invoice"]["status"];

/**
 * What an invoice still owes: invoiced − paid − credited.
 *
 * There is no `paid` flag anywhere in this app because there is none in the
 * API. Both would be caches of an addition, and both drift the first time a
 * payment is corrected — leaving an invoice that says "paid" beside arithmetic
 * that says otherwise. The database computes this; nothing here adds money up.
 */
export type InvoiceBalance =
  paths["/api/v1/invoices/{invoiceId}/balance"]["get"]["responses"][200]["content"]["application/json"];

/** A debt with the two facts a person needs to act on it: WHOSE and WHICH.
 *  The API joins them — building the collections screen is what found that a
 *  bare balance is a row of uuids. */
export type Receivable =
  paths["/api/v1/receivables"]["get"]["responses"][200]["content"]["application/json"]["receivables"][number];

export type Payment =
  paths["/api/v1/invoices/{invoiceId}/payments"]["get"]["responses"][200]["content"]["application/json"]["payments"][number];

export type CreditNote =
  paths["/api/v1/invoices/{invoiceId}/credit-notes"]["get"]["responses"][200]["content"]["application/json"]["creditNotes"][number];

/** One rung of the ladder, as climbed against one receivable. */
export type DunningAction =
  paths["/api/v1/invoices/{invoiceId}/dunning"]["get"]["responses"][200]["content"]["application/json"]["actions"][number];

/** A terminal rung waiting for a partner, WITH what the decision turns on: the
 *  client, the invoice number, and what is actually still owed. A queue of
 *  uuids would be asking somebody to approve something they cannot see. */
export type PendingDunning =
  paths["/api/v1/dunning/pending"]["get"]["responses"][200]["content"]["application/json"]["actions"][number];

/**
 * The closed sets, read off the generated schema rather than retyped — the same
 * treatment LEAD_STAGES gets, for the same reason: these are domain rules the
 * API owns, and a hardcoded copy here drifts the day one is added.
 */
export type PaymentMethod = Payment["method"];
export type CreditReason = CreditNote["reason"];

export const PAYMENT_METHODS = [
  "bank_transfer",
  "cheque",
  "cash",
  "card",
  "upi",
  "other",
] as const satisfies readonly PaymentMethod[];

/**
 * WHY money came off an invoice.
 *
 * A closed set on purpose, and the reason is the whole value of the field:
 * without it the numbers always reconcile and why forty thousand came off does
 * not. The labels are this app's — a person picks from a dropdown — but the
 * VALUES are the API's, so a reason it does not accept is a compile error here.
 */
export const CREDIT_REASONS = [
  "service_failure",
  "billing_error",
  "goodwill",
  "scope_change",
  "duplicate_invoice",
  "bad_debt",
] as const satisfies readonly CreditReason[];

export const CREDIT_REASON_LABELS: Readonly<Record<CreditReason, string>> = {
  service_failure: "Service failure — ours",
  billing_error: "Billing error",
  goodwill: "Goodwill",
  scope_change: "Scope changed",
  duplicate_invoice: "Duplicate invoice",
  bad_debt: "Bad debt",
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  other: "Other",
};

/** The firm's standard prose — the exclusions, commercial notes and team block
 *  COPIED onto each new document. */
export type StandardBlock =
  paths["/api/v1/document-blocks/standard"]["get"]["responses"][200]["content"]["application/json"]["blocks"][number];

export type BlockKind = StandardBlock["kind"];

export const BLOCK_KINDS = ["exclusion", "commercial", "team"] as const satisfies readonly BlockKind[];

export const BLOCK_KIND_LABELS: Readonly<Record<BlockKind, string>> = {
  exclusion: "Exclusions",
  commercial: "Commercial notes",
  team: "Team",
};

/** One line of prose a DOCUMENT says — its own copy, editable per document. */
export type DocumentBlock = LetterRecord["blocks"][number];

/** Whose desk covers leads from a country. */
export type TerritoryRule =
  paths["/api/v1/territory-rules"]["get"]["responses"][200]["content"]["application/json"]["rules"][number];

/** An event with whoever caused it. The stored row keeps only an actor id —
 *  personal data stays out of a log erasure cannot mutate — and the name is a
 *  read-time join, so an erased account stops resolving and the event survives. */
export type EventRecord =
  paths["/api/v1/events"]["get"]["responses"][200]["content"]["application/json"]["events"][number];

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
