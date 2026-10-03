import { longDay, longMoment } from "@/lib/day";
import { countryName } from "@/lib/country";

/**
 * Plain words for the audit trail.
 *
 * The API records what happened as a short code (`work_item.completed`), names
 * the record by its table (`work_item`) and carries the details as ids and
 * machine facts. A partner reading the trail is not a developer, so this file
 * says each of those three things in ordinary English. The raw values are
 * still shown on the screen, folded away, because an audit trail is read when
 * something has gone wrong and the exact record must stay reachable.
 *
 * The verb list mirrors `EVENT_VERBS` in the backend. A verb missing here is
 * not an error: `describeVerb` falls back to spelling the code out in words,
 * so a new verb reads as "Work item: review requested" until somebody writes
 * the sentence.
 */
const VERB_WORDS: Record<string, string> = {
  // the firm and its people
  "tenant.created": "The firm's account was created",
  "tenant.suspended": "The firm's account was suspended",
  "tenant.reinstated": "The firm's account was reinstated",
  "tenant.time_zone_changed": "The firm's time zone was changed",
  "membership.granted": "Someone was given access to the firm",
  "membership.revoked": "Someone's access was removed",
  "membership.restored": "Someone's access was restored",
  "membership.role_changed": "Someone's role was changed",
  "membership.grade_changed": "Someone's seniority level was changed",
  "membership.reports_to_changed": "Someone's reporting line was changed",
  "staff_grade.created": "A seniority level was added",
  "staff_grade.updated": "A seniority level was changed",
  "grade_ladder.seeded": "The standard seniority levels were loaded",
  "service_axis.created": "A Dept or delivery team was added",
  "service_axis.updated": "A Dept or delivery team was changed",
  "service_axis.retired": "A Dept or delivery team was retired",
  "service_axis.reactivated": "A Dept or delivery team was brought back",
  "work_split_axis.changed": "How client work is split between Depts and teams was changed",
  "session.started": "Signed in",

  // clients
  "party.created": "A client record was created",
  "party.archived": "A client record was archived",
  "party.unarchived": "A client record was restored",
  "legal_entity.registered": "A company's registration details were recorded",
  "party_identifier.added": "An identifier such as a PAN or GSTIN was added to a client",
  "party_relationship.recorded": "A relationship between two clients was recorded",
  "party_relationship.ended": "A relationship between two clients was ended",
  "client_assignment.created": "A staff member was assigned to a client",
  "client_assignment.ended": "A staff member's assignment to a client was ended",
  "client_import.staged": "A client spreadsheet was uploaded and checked",
  "client_import.confirmed": "A client spreadsheet import was confirmed",
  "portal_access.granted": "A client contact was given access to the client portal",
  "portal_access.ended": "A client contact's portal access was ended",
  "portal_invitation.resent": "A client portal invitation was sent again",
  "client_freeze.set": "Reminders to a client were paused",
  "client_freeze.lifted": "Reminders to a client were resumed",

  // settings
  "config_entry.created": "A new setting was created",
  "config_version.published": "A setting was published",
  "config_version.archived": "An older version of a setting was archived",
  "config_registry.seeded": "The standard settings were loaded",
  "firm_entity_preference.set": "The company that issues the firm's documents was set",
  "firm_signatory.set": "The person who signs for the firm was set",
  "territory_rule.set": "A territory rule was set",
  "standard_document_block.set": "The firm's standard document wording was changed",
  "brand_asset.set": "A logo, signature or letterhead was uploaded",
  "invoice_series.set": "The invoice numbering was set",
  "workflow_template.published": "A process was published",
  "rule_pack.activated": "A set of compliance rules was switched on",
  "client_request.routing_set": "Where new client requests go was set",

  // sales
  "lead.captured": "A new lead was added",
  "lead.merged": "Two leads were merged into one",
  "lead.stage_changed": "A lead moved to a new stage",
  "lead.owner_assigned": "A lead was given an owner",
  "proposal.drafted": "A proposal was drafted",
  "proposal.discount_approved": "A discount on a proposal was approved",
  "proposal.sent": "A proposal was sent to the client",
  "proposal.viewed": "The client opened a proposal",
  "proposal.accepted": "The client accepted a proposal",
  "proposal.rejected": "The client declined a proposal",
  "proposal.expired": "A proposal expired",
  "engagement_letter.drafted": "An engagement letter was drafted",
  "engagement_letter.drafted_from_proposal": "An engagement letter was drafted from a proposal",
  "engagement_letter.sent": "An engagement letter was sent to the client",
  "engagement_letter.withdrawn": "An engagement letter was withdrawn",
  "engagement_letter.signed": "An engagement letter was signed",
  "engagement_letter.advance_recorded": "An advance payment was recorded on an engagement letter",
  "contract.activated": "An engagement started",

  // billing
  "invoice.raised": "An invoice was raised",
  "invoice.issued": "An invoice was issued",
  "invoice.cancelled": "An invoice was cancelled",
  "invoice.registered": "An invoice was registered",
  "payment.recorded": "A payment was recorded",
  "credit_note.issued": "A credit note was issued",
  "dunning.decided": "A decision was taken on a payment reminder",
  "dunning.escalated": "A payment reminder was escalated",

  // documents
  "document.stored": "A document was uploaded",
  "document.client_visibility_set": "A document was shared with the client, or hidden from them",
  "document.attached": "A document was attached to a record",

  // delivery
  "job.spawned": "A job was created",
  "job.scope_extended": "A job's scope was extended",
  "job.template_pinned": "A job was tied to a version of its process",
  "job.started": "A job was started",
  "job.step_advanced": "A job moved on a step",
  "job.step_assigned": "A job step was assigned to someone",
  "job.step_skipped": "A job step was skipped",
  "job.step_failed": "A job step failed",
  "job.completed": "A job was completed",
  "work_item.created": "A task was created",
  "work_item.assigned": "A task was assigned",
  "work_item.updated": "A task was updated",
  "work_item.state_changed": "A task's status was changed",
  "work_item.completed": "A task was completed",
  "work_item.escalated": "A task was escalated",
  "work_item.dependency_added": "A task was set to wait for another task",
  "work_item.dependency_removed": "A task no longer waits for another task",
  "work_item.review_requested": "A task was sent for review",
  "work_item.review_approved": "A task passed review",
  "work_item.review_rejected": "A task was sent back from review",
  "work_item_state.created": "A task status was added",
  "work_item_state.updated": "A task status was changed",
  "work_item_priority.created": "A task priority was added",
  "work_item_priority.updated": "A task priority was changed",
  "work_vocabulary.seeded": "The standard task statuses and priorities were loaded",
  "output.approved": "A piece of work was approved",
  "output.rejected": "A piece of work was sent back",

  // compliance
  "obligation_rule.created": "A compliance rule was written",
  "obligation_rule.updated": "A compliance rule was changed",
  "obligation_rule.exception_added": "A carve-out was added to a compliance rule",
  "obligation_rule.exception_removed": "A carve-out was removed from a compliance rule",
  "obligation_rule.superseded": "A compliance rule was replaced by a new version",
  // T6.16: the catalogue is where a filing meets a service. The record's
  // object is the rule's CHAIN, so "compliance rule" below still names it.
  "obligation_rule.linked": "A compliance filing was added to a service",
  "obligation_rule.unlinked": "A compliance filing was removed from a service",
  "obligation_rules.seeded": "The standard compliance rules were loaded",
  "obligation_state.created": "A filing status was added",
  "obligation_state.updated": "A filing status was changed",
  "obligation_resolution_option.created": "A way to close a missed filing was added",
  "obligation_resolution_option.updated": "A way to close a missed filing was changed",
  "obligation_vocabulary.seeded": "The standard filing statuses were loaded",
  "obligation.spawned": "A filing was added to the calendar",
  "obligation.restored": "A filing taken off the calendar was put back on it",
  "obligation.work_raised": "A task was raised for a filing",
  "obligation.filed": "A filing was marked as filed",
  "obligation.filing_reversed": "A filing's filed mark was undone",
  "obligation.missed": "A filing was marked as missed",
  "obligation.resolved": "A missed filing was closed",
  "obligation.nudged": "The client was reminded about a filing",
  "obligation.escalated": "A filing was escalated",

  // between the firm and its clients
  "client_ask.raised": "The firm asked the client for something",
  "client_ask.answered": "The client answered a request from the firm",
  "client_ask.closed": "A request to the client was closed",
  "client_ask.withdrawn": "A request to the client was withdrawn",
  "client_ask.chased": "The client was reminded about a request",
  "client_request.raised": "A client sent the firm a request",
  "client_request.replied": "A reply was posted on a client's request",
  "client_request.assigned": "A client's request was assigned to someone",
  "client_request.closed": "A client's request was closed",
  "client_request.withdrawn": "A client withdrew their request",

  // the AI assistant
  "agent_run.completed": "The AI assistant finished a run",
  "agent_run.escalated": "The AI assistant asked a person to decide",
  "agent_run.decided": "A person decided on the AI assistant's question",
};

/** What kind of record it is, in plain words, and where its own screen is. */
const OBJECT_WORDS: Record<string, { noun: string; href?: (id: string) => string }> = {
  tenant: { noun: "The firm", href: () => "/admin/firm" },
  membership: { noun: "person's access", href: () => "/admin/people" },
  user_account: { noun: "login" },
  staff_grade: { noun: "seniority level", href: () => "/admin/grades" },
  service_axis: { noun: "Dept or delivery team", href: () => "/admin/structure" },
  party: { noun: "client", href: (id) => `/clients/${id}` },
  legal_entity: { noun: "company's registration" },
  party_identifier: { noun: "client identifier" },
  party_relationship: { noun: "client relationship" },
  client_assignment: { noun: "client assignment" },
  client_import: { noun: "client import", href: () => "/clients/import" },
  portal_access: { noun: "Client portal access" },
  client_freeze: { noun: "reminder pause" },
  config_entry: { noun: "setting" },
  config_version: { noun: "setting" },
  firm_entity_preference: { noun: "The issuing company", href: () => "/admin/firm" },
  territory_rule: { noun: "territory rule", href: () => "/admin/territories" },
  standard_document_block: { noun: "Standard wording", href: () => "/admin/document-blocks" },
  brand_asset: { noun: "brand asset", href: () => "/admin/brand" },
  invoice_series: { noun: "Invoice numbering", href: () => "/admin/brand" },
  workflow_template: { noun: "process", href: () => "/admin/workflows" },
  rule_pack: { noun: "set of compliance rules", href: () => "/admin/obligation-rules" },
  lead: { noun: "lead", href: (id) => `/leads/${id}` },
  proposal: { noun: "proposal", href: (id) => `/proposals/${id}` },
  engagement_letter: { noun: "engagement letter", href: (id) => `/engagement-letters/${id}` },
  engagement: { noun: "engagement" },
  invoice: { noun: "invoice", href: (id) => `/invoices/${id}` },
  payment: { noun: "payment" },
  credit_note: { noun: "credit note" },
  document: { noun: "document" },
  job: { noun: "job", href: (id) => `/work/${id}` },
  work_item: { noun: "task", href: (id) => `/work-items/${id}` },
  work_item_approval: { noun: "task review" },
  work_item_state: { noun: "task status", href: () => "/admin/work-vocabulary" },
  work_item_priority: { noun: "task priority", href: () => "/admin/work-vocabulary" },
  verification: { noun: "work check" },
  obligation_template: { noun: "compliance rule", href: () => "/admin/obligation-rules" },
  obligation_state: { noun: "filing status", href: () => "/admin/obligation-vocabulary" },
  obligation_resolution_option: {
    noun: "missed-filing decision",
    href: () => "/admin/obligation-vocabulary",
  },
  obligation_instance: { noun: "filing", href: () => "/calendar" },
  client_ask: { noun: "request to a client" },
  client_request: { noun: "client's request", href: (id) => `/client-requests/${id}` },
  agent_run: { noun: "AI assistant run" },
};

function words(code: string): string {
  return code
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** "A task was completed", or the code spelled out when no sentence is written for it. */
export function describeVerb(verb: string): string {
  const known = VERB_WORDS[verb];
  if (known !== undefined) return known;
  const dot = verb.indexOf(".");
  if (dot === -1) return capitalise(words(verb));
  return `${capitalise(words(verb.slice(0, dot)))}: ${words(verb.slice(dot + 1))}`;
}

/** "A task", "An invoice", or the table name spelled out. */
export function objectNoun(objectType: string): string {
  const known = OBJECT_WORDS[objectType]?.noun;
  return known === undefined ? capitalise(words(objectType)) : capitalise(known);
}

/** The record's own screen, when it has one. */
export function objectHref(objectType: string, objectId: string): string | null {
  return OBJECT_WORDS[objectType]?.href?.(objectId) ?? null;
}

/**
 * Who did it, when there is no account to name. The system acts on its own
 * (a scheduled sweep, a reminder going out), the AI assistant acts on its own,
 * and a person whose account has since been deleted leaves the event behind
 * with no name on it.
 */
export function describeActor(actorType: string): string {
  switch (actorType) {
    case "system":
      return "Automatic";
    case "agent":
      return "AI assistant";
    case "human":
      return "A person whose account was removed";
    default:
      return capitalise(words(actorType));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A few keys whose plain name is not simply the key spelled out. */
const KEY_WORDS: Record<string, string> = {
  from: "From",
  to: "To",
  stepKey: "Step",
  executor: "Done by",
  channel: "Sent by",
  reason: "Reason",
  note: "Note",
  title: "Title",
  ref: "Reference",
  kind: "Kind",
  key: "Name",
  version: "Version",
  amount: "Amount",
  currency: "Currency",
  dueOn: "Due on",
  filedOn: "Filed on",
  occurredOn: "On",
  count: "Count",
  // What adding or removing a filing did to the calendar (T6.16). Spelled out
  // they read "Kept started" and "Kept covered elsewhere", which say nothing
  // to a partner about WHY a filing stayed.
  spawned: "Filings added",
  restored: "Filings put back",
  withdrawn: "Filings taken off",
  kept: "Filings kept",
  keptStarted: "Kept, work had started",
  keptPastDue: "Kept, date passed or a decision waiting",
  keptCoveredElsewhere: "Kept, another service still includes it",
  repointed: "Moved to the client's other service",
  onCreate: "Added when it was written",
  services: "Services",
  serviceKey: "Service",
  serviceName: "Service",
  how: "How",
  // Countries and steps in words (F24): the trail read "Jurisdiction to: DD"
  // and "Rung key: second".
  jurisdiction: "Country",
  jurisdictions: "Countries",
  jurisdictionFrom: "Country before",
  jurisdictionTo: "Country now",
  fromJurisdiction: "Country before",
  toJurisdiction: "Country now",
  jurisdictionStated: "Country given",
  clientJurisdiction: "Client's country",
  issuerJurisdiction: "Issuer's country",
  governingLawJurisdiction: "Governing law of",
  courtsJurisdiction: "Courts of",
  rungKey: "Step",
  rung: "Step",
};

/** A payload key that holds a country code, whose value prints as a name. */
const COUNTRY_KEY = /jurisdiction/i;
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * A HANDLE, and the payload key naming the same thing in words when the event
 * carries it. The row keeps the handle's label and prints the name in place
 * of the handle, so a reader sees "Service: GST Compliance" once, not the key
 * and the name as two rows.
 *
 * `obligation_rule.linked` / `unlinked` carry `serviceName` beside
 * `serviceKey` since 2026-09-26, fixed when the event was written, so a later
 * rename does not rewrite what the trail says. Events written before that have
 * the key alone, and a name of null means the service had no version to be
 * named by: both print the key, which is what those rows always said.
 */
const NAMED_BY: Record<string, string> = {
  serviceKey: "serviceName",
};

/**
 * How a task or a step got to a desk (`work_item.assigned`, `job.step_assigned`).
 * The machine tokens read as "key manager" and "with task" once the underscore
 * goes, which says nothing about WHY. The first three are the rungs of the owner
 * rule (2026-09-27): the router chose, and which person it could find.
 */
const HOW_WORDS: Record<string, string> = {
  spoc: "Sent to the client's SPOC for that Dept",
  key_manager: "No SPOC, so sent to the client's Key Manager to hand out",
  partner: "No SPOC or Key Manager, so sent to the person who signs for the firm to hand out",
  manual: "Moved by hand",
  taken: "Taken by the person who does it",
  handover: "Handed over by a colleague",
  released: "Taken off the desk",
  with_task: "Went with the job's task when that was handed on",
};

/**
 * The same rungs when the router decided AGAIN because the account team was
 * named after the work was created (`catchUp: true`, T6.17): the task was
 * waiting on a fallback desk, or on nobody's, and moved.
 */
const CAUGHT_UP_WORDS: Record<string, string> = {
  spoc: "Moved to the client's SPOC for that Dept once one was named",
  key_manager: "Moved to the client's Key Manager to hand out once the account team was set",
  partner: "Moved to the person who signs for the firm to hand out",
};
const HANDLE_OF: Record<string, string> = Object.fromEntries(
  Object.entries(NAMED_BY).map(([handle, name]) => [name, handle]),
);

export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

function plainValue(v: unknown): string | null {
  if (v === null || v === undefined) return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (UUID.test(v)) return null;
    if (INSTANT.test(v)) return longMoment(v);
    if (DAY.test(v)) return longDay(v);
    // A machine token such as `in_review` reads as "in review"; ordinary text
    // (a title, a reference like INV/2026/0001) is left exactly as recorded.
    return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(v) ? v.replace(/_/g, " ") : v;
  }
  if (Array.isArray(v)) {
    const parts = v.map(plainValue).filter((p): p is string => p !== null);
    return parts.length === 0 ? null : parts.join(", ");
  }
  return null;
}

/**
 * The details a reader can use, one label and value per line.
 *
 * Ids are left out here (they are in the raw record below the row): a partner
 * reading "From: in review · To: done" has what they came for, and a string of
 * thirty-six hex characters beside it is one more thing between them and it.
 * Nested objects and lists of objects are likewise left to the raw record.
 */
export function detailRows(payload: Record<string, unknown>): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (/Ids?$/.test(key) || key === "id") continue;
    // Said by the `how` row below, in words, rather than as "Catch up: yes".
    if (key === "catchUp") continue;
    // A name is printed on its handle's row (`NAMED_BY`), and on its own only
    // in a payload that has no handle for it to sit on.
    const handle = HANDLE_OF[key];
    if (handle !== undefined && handle in payload) continue;
    const nameKey = NAMED_BY[key];
    const name = nameKey === undefined ? undefined : payload[nameKey];
    const said =
      key === "how" && typeof value === "string"
        ? ((payload["catchUp"] === true ? CAUGHT_UP_WORDS[value] : undefined) ?? HOW_WORDS[value])
        : undefined;
    const country =
      COUNTRY_KEY.test(key) && typeof value === "string" && COUNTRY_CODE.test(value)
        ? countryName(value)
        : COUNTRY_KEY.test(key) && Array.isArray(value)
          ? value.map((v) => (typeof v === "string" && COUNTRY_CODE.test(v) ? countryName(v) : String(v))).join(", ")
          : undefined;
    const shown =
      said ?? country ?? (typeof name === "string" && name.trim() !== "" ? name : plainValue(value));
    if (shown === null) continue;
    rows.push({ label: KEY_WORDS[key] ?? capitalise(words(key)), value: shown });
  }
  return rows;
}
