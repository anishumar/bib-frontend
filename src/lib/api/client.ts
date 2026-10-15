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
import { minorUnits } from "@/lib/currency";

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
/** One notification as the bell and `/notifications` show it (0323): the words
 *  are the API's, rendered for this reader (no amount without fee access). */
export type NotificationItem =
  paths["/api/v1/notifications"]["get"]["responses"][200]["content"]["application/json"]["rows"][number];
/** One category's settings, per channel (0323). */
export type NotificationCategorySettings =
  paths["/api/v1/notifications/preferences"]["get"]["responses"][200]["content"]["application/json"]["categories"][number];
export type Principal = paths["/api/v1/auth/me"]["get"]["responses"][200]["content"]["application/json"];
/**
 * What signing in answers with — the principal, and every firm this login
 * belongs to.
 *
 * The sign-in page reads it to decide WHICH HALF of the product to open: this
 * is a B2B2C product and a firm's staff and a firm's clients use the same form.
 */
export type SignInResponse =
  paths["/api/v1/auth/login"]["post"]["responses"][200]["content"]["application/json"];

export type Membership =
  paths["/api/v1/tenancy/me/memberships"]["get"]["responses"][200]["content"]["application/json"]["memberships"][number];

/** One row of the firm's roster — a membership with the person behind it, and
 *  the rung they sit on. */
export type Member =
  paths["/api/v1/tenancy/members"]["get"]["responses"][200]["content"]["application/json"]["members"][number];

/** A colleague as a PICKER shows them: active staff, by name and rung, with no
 *  email. `party:read`, where the roster above is `tenant:admin`, which is
 *  what lets a manager who may assign a task actually see whom to. */
export type Colleague =
  paths["/api/v1/tenancy/colleagues"]["get"]["responses"][200]["content"]["application/json"]["colleagues"][number];

/** What a picker prints for a colleague. Never the email: this shape does not
 *  carry one, on purpose, so the fallback for an unnamed account is the role. */
export function colleagueLabel(c: Colleague): string {
  const grade = c.gradeName === null ? "" : ` (${c.gradeName})`;
  return `${c.displayName ?? c.role}${grade}`;
}

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
 * One line of a step's two lists (T6.15): a SUB-STEP, ticked by whoever does
 * the step, or a REVIEW POINT, ticked by whoever checks it. The same shape for
 * both on purpose, because a line reads the same way wherever it sits: what it
 * says, whether it is settled, and who settled it when.
 *
 * `outcome` null is OPEN, and that includes a line somebody ticked and then
 * took the tick back. `not_applicable` is settled as surely as `done` and is
 * never drawn as ticked: "it did not apply here" is a different fact from "I
 * did it", and `note` says why.
 */
export type CheckLine = JobStep["subSteps"][number];

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

/**
 * One process step on the signed-in person's own desk, across jobs, with the
 * job it belongs to (`job`: the client by id, period, services and the due day
 * of the job's unfinished tasks; null when the job names no engagement).
 * `status: "blocked"` is READY for this person; `pending` waits on an earlier
 * step.
 */
export type MyStep =
  paths["/api/v1/my-steps"]["get"]["responses"][200]["content"]["application/json"]["steps"][number];

/**
 * Setup readiness (V2.6): eight lines, each `done` or naming its `gaps`.
 * `tenant:admin` only. `missing` is a closed vocabulary per line that the
 * screen words (`lib/ui/readiness.tsx`); the API ships no sentence there.
 */
export type Readiness =
  paths["/api/v1/tenancy/readiness"]["get"]["responses"][200]["content"]["application/json"];
export type ReadinessLine = Readiness["lines"][number];

/** One of the firm's companies with the bank accounts and LUTs its invoices
 *  print (Q056, 0369). */
export type CompanyInvoicing =
  paths["/api/v1/invoicing/companies"]["get"]["responses"][200]["content"]["application/json"]["companies"][number];
export type CompanyBankAccount = CompanyInvoicing["bankAccounts"][number];
/** India's GST states, by code (a GSTIN's first two digits). */
export type GstState =
  paths["/api/v1/invoicing/states"]["get"]["responses"][200]["content"]["application/json"]["states"][number];
/** Q057: the TDS a client deducts. */
export type ClientTds = NonNullable<
  paths["/api/v1/clients/{partyId}/tds"]["get"]["responses"][200]["content"]["application/json"]["tds"]
>;

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
  NOT_THE_CLIENTS_CHECKER: "Not the client's Key Manager",
  NO_CLIENT_CHECKER: "The client has no Key Manager",
};

/** What each rule means, in the words the founder's screen offers it in. */
export const VERIFICATION_RULES: readonly {
  readonly value: VerificationRule;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "client_key_manager",
    label: "The client's Key Manager",
    detail: "The Key Manager of the client the work is for. If there is none, or they did the work, the person who signs for the firm.",
  },
  {
    value: "rank_threshold",
    label: "Anybody senior enough",
    detail: "Anybody at or above a grade you choose. Nobody waits on one person.",
  },
  {
    value: "reporting_line",
    label: "The maker's own manager",
    detail: "Only their manager. The strictest: if the manager is on leave, nobody checks.",
  },
  {
    value: "reporting_line_or_rank",
    label: "Their manager, or anybody senior enough",
    detail: "Their manager, or a grade you choose when the manager is away.",
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
/** One note on a task (0330, CA#30): append-only, with its author's name. */
export type WorkItemNote = WorkItemDetail["notes"][number];
/** Sent back and not yet sent again (CA#29): the checker's note, when, by whom. */
export type SentBack = NonNullable<WorkItem["sentBack"]>;
/** The filing a task files, and the company's open filings it could (CA#36). */
export type TaskFiling =
  paths["/api/v1/work-items/{workItemId}/filing"]["get"]["responses"][200]["content"]["application/json"];
export type LinkableFiling = TaskFiling["open"][number];
/** The firm's rules for who checks work, by label (CA#27). */
export type ReviewRule =
  paths["/api/v1/review-rules"]["get"]["responses"][200]["content"]["application/json"]["rules"][number];

/**
 * One thing a task waits on, with the task at the other end RESOLVED.
 *
 * It was three uuids on the wire until a screen tried to draw it — the sixth
 * time this product has learnt that a bare edge renders as a bare edge.
 * `dependsOnIsTerminal` is the FLAG and not a state code: a firm owns the names
 * of its states, and this is what separates a blocker still holding the task
 * back from a record of what it used to wait on.
 */
export type WorkItemDependency = WorkItemDetail["dependencies"][number];

/**
 * One row of the firm's own check queue — a review, plus the VIEWER's verdict.
 *
 * A different type from `WorkItemReview` because it answers a different
 * question. On an item's page a review is HISTORY: who checked it and what they
 * said. In the queue it is work waiting on somebody, and `viewer` is whether
 * that somebody is you — `reason` being the sentence to say when it is not.
 * The API sends the sentence rather than a code so the queue and the "who may
 * check this?" list never phrase one refusal in two different sets of words.
 */
export type WorkItemCheckRow =
  paths["/api/v1/work-item-checks"]["get"]["responses"][200]["content"]["application/json"]["checks"][number];

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

/**
 * One notice the firm's escalation ladder raised (T4.5).
 *
 * NOT a work item and not a filing — it is the record that somebody was TOLD
 * about one. `raisedToName` is who, `minGradeRank` means it went to a rank
 * rather than a person, and `note` is set when it reached nobody and says which
 * of the three reasons. All three matter on the screen: a notice with nobody on
 * it is the row a reader has to act on.
 */
export type Escalation =
  paths["/api/v1/escalations"]["get"]["responses"][200]["content"]["application/json"]["rows"][number];

/** How urgent, as a row. `rank` is what sorts — 1 is most urgent — and the name
 *  is display. */
export type WorkItemPriority = WorkItem["priority"];

/** The firm's whole vocabulary, retired rows included: an admin needs to see
 *  what was stopped and be able to bring it back. */
export type WorkVocabulary =
  paths["/api/v1/work-vocabulary"]["get"]["responses"][200]["content"]["application/json"];

/**
 * The edit a state accepts — every field optional, because the API resolves
 * absent ones to their current values.
 *
 * DERIVED, not retyped. The admin screen carried a hand-written copy of this
 * shape and it went stale the moment the API grew `isUnderReview` (0073) — the
 * exact failure `bib-frontend/CLAUDE.md` opens with. A retyped request body is
 * a type that compiles, is wrong, and says nothing when the backend moves.
 */
export type UpdateWorkItemStateRequest =
  paths["/api/v1/work-vocabulary/states/{stateId}"]["patch"]["requestBody"]["content"]["application/json"];

/** A member of staff, and whether they may check one particular work item. The
 *  same rule a process step's check uses. */
export type WorkItemChecker =
  paths["/api/v1/work-item-checks/{approvalId}/checkers"]["get"]["responses"][200]["content"]["application/json"]["checkers"][number];

/** A configured thing and whatever it currently says. `published` is null when
 *  only drafts exist, which is a state the screens have to show. */
/**
 * One row of the compliance calendar — what the LAW asks of one entity for one
 * period (T3.2).
 *
 * Two dates, and the difference between them is the whole point:
 * `statutoryDueOn` is what the law says and missing it is the client's money;
 * `internalTargetOn` is the firm's own T–X and is the actionable one, which is
 * why the API orders by it.
 */
export type CalendarRow =
  paths["/api/v1/calendar"]["get"]["responses"][200]["content"]["application/json"]["rows"][number];

/**
 * A live engagement the calendar produced NOTHING for, and why.
 *
 * THE ANSWER TO AN EMPTY CALENDAR, and the reason this type exists at all. None
 * of the reasons is an error — most advisory work legitimately has no
 * compliance rule — but a firm looking at a blank screen with no explanation
 * cannot tell that from broken software.
 */
export type CoverageGap =
  paths["/api/v1/calendar/coverage"]["get"]["responses"][200]["content"]["application/json"]["gaps"][number];

export type CoverageReason = CoverageGap["reason"];

/**
 * A deadline that has passed with nothing filed, waiting on a partner (T3.3).
 *
 * A WORKLIST and not a window, unlike `CalendarRow`: an obligation missed in
 * April is still owed in September, so the API applies no date filter and the
 * list is ordered oldest-first. `daysLate` is computed against the day the
 * BROWSER sends, because this screen's whole job is saying how late something
 * is and the server's UTC day is yesterday in India each morning.
 */
export type DecisionRow =
  paths["/api/v1/calendar/decisions"]["get"]["responses"][200]["content"]["application/json"]["rows"][number];

/**
 * The firm's own words for its compliance calendar (T3.3).
 *
 * The counterpart of `WorkVocabulary`, and it did not exist until T3.3 —
 * 0052 held these as rows precisely so a firm could rename them, and nothing
 * could write them. Read the FLAGS rather than the codes: `isMissed` is where
 * an overdue filing goes, `isFiled` where a completed one lands, and the names
 * beside them are the firm's to change.
 */
export type ObligationVocabulary =
  paths["/api/v1/obligation-vocabulary"]["get"]["responses"][200]["content"]["application/json"];

export type ObligationState = ObligationVocabulary["states"][number];
export type ResolutionOption = ObligationVocabulary["resolutionOptions"][number];

/**
 * A compliance rule — what the law asks, and when.
 *
 * `coverage` is the field to read before anything else: `needs_formula` means
 * the obligation is REAL and its timing depends on a fact this system does not
 * hold, and `unresolvedReason` says which. Forty-six of the fifty-seven shipped
 * India rules are in that state, and rendering them as failures would be
 * wrong — they are questions for the firm.
 */
export type ObligationRule =
  paths["/api/v1/obligation-rules"]["get"]["responses"][200]["content"]["application/json"]["rules"][number];

export type ObligationException = ObligationRule["exceptions"][number];
export type RuleCoverage = ObligationRule["coverage"];

/** The row of a rule's CHAIN that today's filings are due under, read on the
 *  firm's own day, and the row that takes over after it when the law changed
 *  from a later date (T6.16 follow-up). A row's own `dueRule` is the chain's
 *  newest row, which after "from April 2027 it is the 22nd" is the successor,
 *  so a screen saying when a filing is due reads these two instead. */
export type RuleInForceToday = NonNullable<ObligationRule["inForceToday"]>;
export type RuleNextChange = NonNullable<ObligationRule["nextChange"]>;

/** One catalogue service a rule's chain is on (T6.16), named. The catalogue is
 *  the one place a filing meets a service; the library reads this to say
 *  where each rule is used, and the catalogue's picker reads its length. */
export type RuleUse = ObligationRule["usedIn"][number];

/** What adding a filing to a service did: whether it was already there,
 *  whether it confirmed an unconfirmed rule, and what reached the calendar. */
export type FilingLinkEffect =
  paths["/api/v1/services/{serviceEntryId}/filings"]["post"]["responses"][200]["content"]["application/json"]["effect"];

/** What removing a filing from a service did: what came off the calendar, and
 *  what stayed and why. `kept` is the sum of the three reasons. */
export type FilingUnlinkEffect =
  paths["/api/v1/services/{serviceEntryId}/filings/{ruleId}/unlink"]["post"]["responses"][200]["content"]["application/json"]["effect"];

export type ConfigEntry =
  paths["/api/v1/config/{kind}"]["get"]["responses"][200]["content"]["application/json"]["entries"][number];

/** The registry's closed set of kinds, taken from the PATH PARAMETER rather
 *  than retyped — the same treatment `LEAD_STAGES` gets and for the same
 *  reason: a hardcoded copy drifts the day the API adds one. */
export type ConfigKind = paths["/api/v1/config/{kind}"]["get"]["parameters"]["path"]["kind"];

/** One version of a configured thing. The LIST carries two of these per entry —
 *  what is published and the draft beside it — and `GET /config/{kind}/{key}`
 *  carries every version there has ever been, which is what `ConfigHistory`
 *  reads. */
export type ConfigVersion = NonNullable<
  paths["/api/v1/config/{kind}/{key}"]["get"]["responses"][200]["content"]["application/json"]["versions"][number]
>;

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
  /** Which surface the role is for (T6.6). Absent in a role body means STAFF,
   *  as the API reads it. Used to offer a staff member only staff roles and a
   *  client contact only client roles (F18). */
  readonly audience: "STAFF" | "CLIENT_PORTAL";
}

export function readRoleBody(body: Record<string, unknown> | undefined): RoleBody {
  const label = body?.["label"];
  const permissions = body?.["permissions"];
  const audience = body?.["audience"];
  return {
    label: typeof label === "string" ? label : "",
    permissions: Array.isArray(permissions)
      ? permissions.filter((p): p is string => typeof p === "string")
      : [],
    audience: audience === "CLIENT_PORTAL" ? "CLIENT_PORTAL" : "STAFF",
  };
}

/** A proposal as a LIST shows it: the money, the client, and how many lines. */
export type ProposalSummary =
  paths["/api/v1/proposals"]["get"]["responses"][200]["content"]["application/json"]["proposals"][number];

/** A proposal's status in words. `rejected` reads "Declined" because that is
 *  the client's own button on the link they were sent (0085); the rest are
 *  the code in sentence case. A status added on the API is a compile error. */
export const PROPOSAL_STATUS_WORDS: Readonly<Record<ProposalSummary["proposal"]["status"], string>> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
};

/** One proposal in full: its lines, each with the catalogue version it was
 *  PINNED to, and the totals the database computed. */
export type ProposalRecord =
  paths["/api/v1/proposals/{proposalId}"]["get"]["responses"][200]["content"]["application/json"];

export type ProposalLine = ProposalRecord["lines"][number];

/** What the RECIPIENT of a share link reads. A different shape from the staff
 *  one, deliberately — it carries none of the firm's insides. */
export type SharedProposal =
  paths["/api/v1/proposals/shared"]["post"]["responses"][200]["content"]["application/json"];

/** What sending returned about the email bib wrote (0085) — `sent`, `failed`
 *  with the reason, or null when no email was asked for. */
export type ProposalEmailOutcome =
  paths["/api/v1/proposals/{proposalId}/send"]["post"]["responses"][200]["content"]["application/json"]["email"];

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
 * Who a letter for one client may name (F-10-1): the companies its lines may be
 * FOR, and the people it may be addressed to, on the firm's day.
 *
 * The API's own answer and the same read its refusal applies, so a letter's
 * pickers offer exactly this and never build their own list. Deliberately NOT
 * `groupCompanies` (lib/group.ts): that one reads the group both ways round for
 * PORTAL ACCESS, while a letter may cover only the client and what it holds —
 * its subsidiaries, and the companies it is a shareholder or director of.
 */
export type ClientStructure =
  paths["/api/v1/parties/{partyId}/structure"]["get"]["responses"][200]["content"]["application/json"];

/**
 * One code from the product's relationship vocabulary, with the sentence it
 * reads as from either end.
 *
 * The same six rows for every firm — product data, like a currency list. It is
 * fetched rather than written into a component because the alternative is a
 * copy of `core.relationship_type`'s seed living in a screen: the day the
 * product adds `beneficial_owner_of`, the copy is silently a code short and the
 * picker cannot offer it.
 *
 * `label` reads "{from} is {label} {to}". `inverseLabel` reads
 * "{to} {inverseLabel} {from}" — a verb phrase, so it completes the sentence on
 * its own ("has director", "is a subsidiary of").
 */
export type RelationshipType =
  paths["/api/v1/parties/relationship-types"]["get"]["responses"][200]["content"]["application/json"]["types"][number];

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

/**
 * What naming somebody on the account team MOVED (T6.17's catch-up): the
 * client's work that was waiting on the Key Manager's or the signing partner's
 * desk to be handed out, or on nobody's. Null when moving it failed; the
 * assignment stands either way.
 */
export type CaughtUpWork =
  paths["/api/v1/parties/{partyId}/assignments"]["post"]["responses"][201]["content"]["application/json"]["caughtUp"];

/**
 * One person at a client who can see that client's records — gate 4's grant,
 * with the contact and the granter resolved (G3.4).
 *
 * Live AND historic in one list, deliberately: ending a grant is never a
 * delete, and the closed row is the only thing that answers "could this person
 * see us in March". `validTo` is HALF-OPEN — the first day NOT in force.
 *
 * `contactAccepted` says whether they have ever set a password. It is what
 * decides whether re-sending the invitation is worth offering: once somebody
 * has one there is no invitation left, and re-issuing would be the firm
 * resetting its own client's password.
 */
export type PortalGrant =
  paths["/api/v1/portal-access/clients/{partyId}"]["get"]["responses"][200]["content"]["application/json"]["grants"][number];

/**
 * One period during which the firm stopped chasing a client (T4.4).
 *
 * Live AND historic in one list, newest first: "was this client being chased in
 * March" is the question, and a list of only the current freeze answers it with
 * silence. `validTo` is HALF-OPEN — the first day NOT frozen.
 *
 * `reason` is required by the API and is deliberately NOT in the audit ledger —
 * it is a partner's words about a client and that log cannot be erased. This
 * row is the only place it is ever readable, which is why the panel quotes it
 * rather than summarising it.
 */
export type ClientFreeze =
  paths["/api/v1/clients/{partyId}/freezes"]["get"]["responses"][200]["content"]["application/json"][number];

/** One client on the signed-in person's book, with every role they hold over
 *  it — a partner is commonly the Key Manager AND a Dept's SPOC on the same
 *  client, and this is one row either way. */
export type OwnedClient =
  paths["/api/v1/my-clients"]["get"]["responses"][200]["content"]["application/json"]["clients"][number];

/** One row of the pipeline: the opportunity, the prospect it is about, and
 *  whose desk it is on. */
export type LeadRecord =
  paths["/api/v1/leads"]["get"]["responses"][200]["content"]["application/json"]["leads"][number];

/** One lead as its own page reads it: the row, who deleted it, and whether
 *  Delete would work now — the API's own refusal, or null (0086). */
export type LeadView =
  paths["/api/v1/leads/{leadId}"]["get"]["responses"][200]["content"]["application/json"];

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

/** A contact person's role at a company (CA#20), off the generated schema. */
export type ContactRole = NonNullable<
  paths["/api/v1/leads"]["post"]["requestBody"]["content"]["application/json"]["contact"]
>["role"];

/** The roles a lead's contact person can hold, in words, for a picker. */
export const CONTACT_ROLE_OPTIONS: readonly { readonly code: ContactRole; readonly label: string }[] = [
  { code: "director_of", label: "Director" },
  { code: "authorised_signatory_of", label: "Authorised signatory" },
  { code: "employee_of", label: "Employee" },
  { code: "shareholder_of", label: "Shareholder" },
];

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
  /** The four blocks a letter prints for this service unless the letter
   *  tailors them — shown as the placeholder of the box that would. */
  readonly scope: string | null;
  readonly clientObligations: string | null;
  readonly volumeLimits: string | null;
  readonly exclusions: string | null;
}

export function readServiceBody(body: Record<string, unknown> | undefined): ServiceBody {
  const name = body?.["name"];
  const raw = body?.["listPrice"];
  const price = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const amount = price?.["amount"];
  const currency = price?.["currency"];
  const text = (key: string): string | null => {
    const value = body?.[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };
  return {
    name: typeof name === "string" ? name : "",
    listPrice:
      typeof amount === "string" && typeof currency === "string" ? { amount, currency } : null,
    scope: text("scope"),
    clientObligations: text("clientObligations"),
    volumeLimits: text("volumeLimits"),
    exclusions: text("exclusions"),
  };
}

/**
 * An amount, for a person to read. THE one money formatter for the screen.
 *
 * The API sends money as a decimal STRING and this app keeps it one all the way
 * to the screen. `Intl.NumberFormat.format` accepts a decimal string and
 * formats it EXACTLY; `format(Number(amount))` would route it through the one
 * JavaScript type that cannot hold 1499.50, undoing at the last possible moment
 * the thing the string exists for.
 *
 * THE SHAPE (the Wave 4 brief, 2026-09-28), and none of it follows the
 * reader's browser, because a partner in Mumbai with an English (US) browser
 * still counts in lakhs:
 *   - INR in Indian grouping with the rupee sign: `₹12,00,000`, never
 *     `₹1,200,000`;
 *   - every other currency with its code, in its own grouping: `AED 5,000`;
 *   - no `.00` when there are no paise; two places when there are
 *     (`₹25,00,000.50`).
 *
 * `null` is "Not set": the value was never given. (A fee hidden from somebody
 * without commercial visibility is also null on the wire; a screen that can
 * tell the two apart says which.)
 */
export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "Not set";
  const exact = asNumericLiteral(amount);
  // NOT `Number(amount)`, which is what this used to fall back to.
  //
  // The fallback is only reached by a value that is not a decimal at all, which
  // the API's own schema refuses — so it is either a bug on the wire or a
  // string like "1.0e3" or "12,50". `Number("12,50")` is NaN and rendered
  // "₹NaN"; `Number("1.0e3")` silently became a thousand. So it renders the
  // value it was given, marked with the currency and nothing else. An amount a
  // person can see is wrong is worth more than one they cannot.
  if (exact === null) return `${currency} ${amount}`;
  // Paise are shown only when there are some: "12.50" keeps them, "12.00"
  // and "12" do not. Read off the string, never off a number. As many places
  // as the currency has (0344): two for most, none for the yen, three for
  // the Kuwaiti dinar.
  const minor = minorUnits(currency);
  const places = minor > 0 && /\.\d*[1-9]/.test(amount) ? minor : 0;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: places,
      maximumFractionDigits: minor,
    }).format(exact);
  }
  const figure = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: minor,
  }).format(exact);
  return `${currency} ${figure}`;
}

/**
 * A document's totals, one per currency (0344): "₹5,000 + AED 4,000". Two
 * currencies are never added, so this is a list said in one line, the main
 * currency first as the API orders it. Null when a figure is withheld from
 * the login (fees not visible), which a cell says as "Hidden".
 */
export function formatTotals(totals: readonly { readonly net: string | null; readonly currency: string }[]): string | null {
  if (totals.some((t) => t.net === null)) return null;
  return totals.map((t) => formatMoney(t.net, t.currency)).join(" + ");
}

/**
 * A fixed PRODUCT code as words: "referral" -> "Referral", "one_time" ->
 * "One time", "private_limited" -> "Private limited".
 *
 * Only for the product's own closed sets (a lead's source and stage, a
 * frequency, a status) where no better word is written down. A firm's own
 * names, its Depts, its services, its process states, arrive from the API as
 * the firm wrote them and are shown as they are. A code on screen in its raw
 * lowercase ("new", "retainer") reads as a system talking to itself.
 */
export function codeLabel(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim();
  return words === "" ? code : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
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

/**
 * One thing a client can be billed for, with the price its letter agreed.
 *
 * `unitAmount` is the LETTER LINE's figure and not the catalogue's list price —
 * reading the list price would quietly bill a negotiated discount away. NULL is
 * a real answer ("as mutually agreed", with `pricingNote` saying why), and an
 * invoice line cannot be unpriced, so a screen asks for the figure rather than
 * prefilling one.
 */
export type BillableEngagement =
  paths["/api/v1/parties/{partyId}/billable-engagements"]["get"]["responses"][200]["content"]["application/json"]["engagements"][number];

/** An engagement letter as a LIST shows it. */
export type LetterSummary =
  paths["/api/v1/engagement-letters"]["get"]["responses"][200]["content"]["application/json"]["letters"][number];

/** One letter in full: its lines, its PINNED clauses, and the engagements it
 *  created at signature. */
export type LetterRecord =
  paths["/api/v1/engagement-letters/{letterId}"]["get"]["responses"][200]["content"]["application/json"];

/**
 * Whose desk an unsigned letter's work will land on, one row per Dept (T6.17).
 * The warning above Send reads it; it never refuses anything.
 */
export type LetterRouting =
  paths["/api/v1/engagement-letters/{letterId}/routing"]["get"]["responses"][200]["content"]["application/json"];
export type LetterDeptRouting = LetterRouting["depts"][number];

export type LetterClause = LetterRecord["clauses"][number];
export type LetterLine = LetterRecord["lines"][number];

/**
 * ONE FEE FOR SEVERAL SERVICES — a section of the letter's Annexure 1 (0083).
 *
 * `code` is its letter, "A" or "B", its rank among the letter's live groups; the
 * PDF heads the section with it and the Summary of Fees gives it a row. Its
 * services carry no price of their own — `lineIds` are the ones it pays for.
 */
export type FeeGroup = LetterRecord["feeGroups"][number];

/** How often a fee is billed, as a letter says it. The API's closed set; a
 *  frequency added there is a compile error here. */
export const BILLING_FREQUENCY_LABELS: Readonly<Record<FeeGroup["billingFrequency"], string>> = {
  one_time: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  custom: "Custom",
};

/** "per month" — what a fee's figure is a figure OF. Empty for a one-off or a
 *  custom period, where the figure is the whole fee. */
export const PER_PERIOD: Readonly<Record<FeeGroup["billingFrequency"], string>> = {
  one_time: "",
  monthly: " per month",
  quarterly: " per quarter",
  annually: " per year",
  custom: "",
};

/** The same, for a frequency the wire types as a plain string (the billable
 *  read's). An unknown one says nothing rather than guessing a period. */
export function perPeriod(frequency: string): string {
  return Object.entries(PER_PERIOD).find(([key]) => key === frequency)?.[1] ?? "";
}
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

/**
 * Whether a clause's governing law and courts are the ISSUING company's
 * (T6.18, D6): the API's `refuseForeignTerms`, used only to decide what to
 * offer. A clause naming neither always fits; one naming either needs the
 * issuer registered in the country it names. `issuerJurisdiction` is the
 * letter read's `issuer.jurisdiction`.
 */
export function lawFits(clause: ClauseBody, issuerJurisdiction: string | null): boolean {
  const named = [clause.governingLaw, clause.courts].filter((t) => t !== null);
  if (named.length === 0) return true;
  return issuerJurisdiction !== null && named.every((t) => t.jurisdiction === issuerJurisdiction);
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
 * A BILL THAT HAS FALLEN DUE (auto-invoice, 0318): one period of one engagement,
 * or of one fee group, that the daily sweep says should be billed. It carries no
 * invoice number: the number is drawn only when somebody presses Raise, so a
 * bill the manager skips leaves no cancelled number behind. `status` is derived
 * by the API (a cancelled invoice makes its bills open again); `escalated` means
 * a week has passed and it is on the manager's own manager's desk too.
 */
export type BillingDue =
  paths["/api/v1/billing/dues"]["get"]["responses"][200]["content"]["application/json"]["dues"][number];
export type BillingDueStatus = BillingDue["status"];
export type BillingPerson = NonNullable<BillingDue["manager"]>;

/** A recurring engagement with no billing schedule yet, and the default the API
 *  offers for one (the current period, billed on its last day: Q042). */
export type BillingUnscheduled =
  paths["/api/v1/billing/unscheduled"]["get"]["responses"][200]["content"]["application/json"]["engagements"][number];

/** An engagement's schedule, as setting it answers. */
export type BillingSchedule =
  paths["/api/v1/engagements/{engagementId}/billing"]["put"]["responses"][200]["content"]["application/json"];

/** Whose name a bill or an invoice carries: the display name, else the email. */
export function billingPersonName(p: BillingPerson): string {
  return p.displayName ?? p.email;
}

/**
 * THE ADVANCE AND THE FINAL BILL (0320; 0322). Every advance is a tax invoice,
 * drafted the moment the letter is signed, and it holds NO work (Ashish,
 * 2026-10-02): the work starts at signing and the advance is chased by
 * reminders. `stage`, `overdue`, `escalated`, `people` and `duties` are the
 * API's; nothing here works out a day.
 */
export type BillingAdvance =
  paths["/api/v1/billing/advances"]["get"]["responses"][200]["content"]["application/json"]["advances"][number];
export type BillingAdvanceStage = BillingAdvance["stage"];
/** The firm's billing settings (0318; 0322): the switch, how advances are
 *  chased, and each company's default tax rate for an automatic advance draft. */
export type BillingSettings =
  paths["/api/v1/billing/settings"]["get"]["responses"][200]["content"]["application/json"];
export type AdvancePolicy = BillingSettings["advancePolicy"];
export type TaxDefault = BillingSettings["taxDefaults"][number];
/** Why an advance is on somebody's My day (`?mine=true`): the client's SPOC for
 *  the work, its Key Manager, the partner above them, or an administrator. */
export type BillingAdvanceDuty = BillingAdvance["duties"][number];
/** An advance left over once the work it covered is finished: "To refund". */
export type BillingRefund =
  paths["/api/v1/billing/refunds"]["get"]["responses"][200]["content"]["application/json"]["refunds"][number];
/** A one-time service with no process: billed by hand with Bill it now. */
export type BillingBillNow =
  paths["/api/v1/billing/bill-now"]["get"]["responses"][200]["content"]["application/json"]["engagements"][number];
/** A period whose work is done before its bill date (Q071 b): "Raise invoice
 *  now" writes its bill today. */
export type BillingEarlyBill =
  paths["/api/v1/billing/bill-early"]["get"]["responses"][200]["content"]["application/json"]["periods"][number];

/**
 * AN ADVANCE TAKEN BEFORE THE LETTER (0363, Q044-Q048): its invoice, how much
 * of it is mapped to services and to which, what is left, and whether it is
 * paid. Amounts are null for a login without the fee axis; `paidState` and
 * `status` are not amounts and always come.
 */
export type AdhocAdvance =
  paths["/api/v1/advances"]["get"]["responses"][200]["content"]["application/json"]["advances"][number];
export type AdhocAllocation = AdhocAdvance["allocations"][number];
/** A service of the advance's client, and why it cannot take the advance
 *  (`refusal`, the API's own words) when it cannot. */
export type AdvanceTarget =
  paths["/api/v1/advances/{advanceId}/targets"]["get"]["responses"][200]["content"]["application/json"]["services"][number];
/** What a letter names as received, and what it could name (Q048). */
export type LetterAdvancesReceived =
  paths["/api/v1/engagement-letters/{letterId}/advances-received"]["get"]["responses"][200]["content"]["application/json"];

/**
 * WORK VS BILLING (Q041): one row per client, service and period with its jobs,
 * bill, invoice and money, and the API's flags (codes; the screen writes the
 * words). Amounts are null for a login without the fee axis (`feesVisible`).
 */
export type WorkBilling =
  paths["/api/v1/billing/work-vs-billing"]["get"]["responses"][200]["content"]["application/json"];
export type WorkBillingRow = WorkBilling["rows"][number];
export type WorkBillingFlag = WorkBillingRow["flags"][number];

/** The client summary: per client and service, billed, received and pending,
 *  with the Key Manager and the SPOCs. Behind the fee axis. */
export type ClientSummary =
  paths["/api/v1/dashboard/client-summary"]["get"]["responses"][200]["content"]["application/json"];
export type ClientSummaryClient = ClientSummary["clients"][number];
export type ClientSummaryLine = ClientSummaryClient["lines"][number];
export type SummaryFigures = ClientSummary["currencies"][number];
/** The coming months: the fees each client's services will be billed, before
 *  tax, by the month each bill falls due (the billing schedule run forward). */
export type ClientProjection =
  paths["/api/v1/dashboard/client-summary/projection"]["get"]["responses"][200]["content"]["application/json"];
export type ProjectionClient = ClientProjection["clients"][number];
export type ProjectionLine = ProjectionClient["lines"][number];
export type ProjectedFigures = ClientProjection["currencies"][number];

/** A bill in words: "Bookkeeping, Oct 2026", "Statutory audit, final bill",
 *  "Advance, EL-2026-0007" or "Advance for Statutory audit". */
export function billLabel(d: Pick<BillingDue, "kind" | "serviceName" | "periodLabel" | "engagementId" | "letter">): string {
  if (d.kind === "advance") return d.engagementId === null ? `Advance, ${d.letter.ref}` : `Advance for ${d.serviceName}`;
  if (d.kind === "final") return `${d.serviceName}, final bill`;
  return `${d.serviceName}, ${d.periodLabel}`;
}

/** Where an advance stands, in words. */
export const ADVANCE_STAGE_WORDS: Readonly<Record<BillingAdvanceStage, string>> = {
  not_raised: "No invoice yet",
  on_draft: "Draft, not issued",
  unpaid: "Not paid yet",
  part_paid: "Part paid",
  paid: "Paid in full",
};

/** "3 days", "1 day", "today". */
export function daysWords(n: number | null): string {
  if (n === null || n <= 0) return "today";
  return n === 1 ? "1 day" : `${String(n)} days`;
}

/** "today", "1 day ago", "3 days ago": how long since a day, for a line of words. */
export function agoWords(n: number | null): string {
  return n === null || n <= 0 ? "today" : `${daysWords(n)} ago`;
}

/**
 * An invoice's number, or what stands in for one (0322: the number is drawn at
 * ISSUE, so a draft has none): "Draft", and "Cancelled draft" for a draft
 * cancelled before it was issued, which never had one. Drafts made before 0322
 * keep the number they drew, and show it.
 */
export function invoiceNumberWords(number: string | null, status?: string): string {
  if (number !== null) return number;
  return status === "cancelled" ? "Cancelled draft" : "Draft";
}

/**
 * A bill with no price, in weeks: "No price yet", "No price for 1 week", "No
 * price for 3 weeks". Ashish asked for the SPOC, the manager and the admins to
 * be reminded every week; the reminder is the count going up (nothing is sent).
 */
export function noPriceWords(daysSinceBillOn: number): string {
  const weeks = Math.floor(Math.max(0, daysSinceBillOn) / 7);
  if (weeks === 0) return "No price yet";
  return `No price for ${String(weeks)} ${weeks === 1 ? "week" : "weeks"}`;
}

/** The frequencies a schedule can be set for; a one-off or a custom period is
 *  billed by hand. */
export const SCHEDULED_FREQUENCIES: readonly string[] = ["monthly", "quarterly", "annually"];

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
  service_failure: "Service failure (our fault)",
  billing_error: "Billing error",
  goodwill: "Goodwill",
  scope_change: "Scope changed",
  duplicate_invoice: "Duplicate invoice",
  bad_debt: "Bad debt",
  // Only from "To refund" (0320), never chosen from the dropdown, so it is not
  // in CREDIT_REASONS; a credit note that carries it still reads in words.
  advance_refund: "Advance given back",
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  other: "Other",
};

/** One of the firm's OWN companies (T6.18): the firm itself, and each company
 *  it has said issues documents for a country. With where it is registered, the
 *  client countries the firm's rule sends to it, and the currency a document it
 *  issues starts in. */
export type FirmEntity =
  paths["/api/v1/firm-entities"]["get"]["responses"][200]["content"]["application/json"]["entities"][number];

/** One person on the firm's list of signatories (0343, Q005): who may sign an
 *  engagement letter for the firm, what they sign as, their own signature
 *  image, and whether they are the default or retired. */
export type Signatory =
  paths["/api/v1/tenancy/signatories"]["get"]["responses"][200]["content"]["application/json"]["signatories"][number];

/** One row of the firm's rule: clients in this country (or `*`, everywhere
 *  else) are quoted by that company. */
export type FirmEntityPreference =
  paths["/api/v1/firm-entities/preferences"]["get"]["responses"][200]["content"]["application/json"]["preferences"][number];

/** The firm's standard prose — the exclusions, commercial notes and team block
 *  COPIED onto each new document. */
export type StandardBlock =
  paths["/api/v1/document-blocks/standard"]["get"]["responses"][200]["content"]["application/json"]["blocks"][number];

export type BlockKind = StandardBlock["kind"];

export const BLOCK_KINDS = [
  "exclusion",
  "commercial",
  "team",
  "cover",
  "acceptance",
] as const satisfies readonly BlockKind[];

export const BLOCK_KIND_LABELS: Readonly<Record<BlockKind, string>> = {
  exclusion: "Exclusions",
  commercial: "Commercial notes",
  team: "Team",
  cover: "Cover letter",
  acceptance: "Acceptance",
};

/**
 * THE COVER LETTER AND THE ACCEPTANCE ARE A LETTER'S ONLY (0083).
 *
 * A proposal has no cover letter and nobody signs one to accept it, so the API
 * never copies these onto a proposal and refuses one written there by hand.
 * These lists are what each document's screen OFFERS — the refusal is still the
 * API's.
 */
export const PROPOSAL_BLOCK_KINDS = [
  "exclusion",
  "commercial",
  "team",
] as const satisfies readonly BlockKind[];

/** In the order the Annexure letter prints them: the cover letter and the
 *  acceptance on page one, then commercials, team and exclusions at the end of
 *  Annexure 1. */
export const LETTER_BLOCK_KINDS = [
  "cover",
  "acceptance",
  "commercial",
  "team",
  "exclusion",
] as const satisfies readonly BlockKind[];

/** The kinds that print as PARAGRAPHS of a letter rather than items of a list
 *  — and so are written in a box that fits a paragraph. */
export const PARAGRAPH_BLOCK_KINDS: readonly BlockKind[] = ["cover", "acceptance"];

/**
 * One line of ONE document's own prose — an exclusion, a commercial note, a
 * line of the team block. Its own copy, editable per document.
 *
 * `sourceId` is the firm's standard line it was copied from at drafting, and
 * NULL is the interesting value: somebody wrote this line for THIS client and
 * it is not in the house set. A signed letter's blocks are frozen by the same
 * database trigger that freezes its lines and its clauses; a proposal's are
 * not, and that difference is why each screen decides for itself whether to
 * offer the editor.
 */
export type DocumentBlock = LetterRecord["blocks"][number];

/**
 * One invoice number series — a company, a financial year, and a document type.
 *
 * A row exists only once that company has issued its first document of that
 * type in that year: the counter is created by the write that allocates the
 * number. So an empty list is not "no companies", it is "nothing invoiced yet",
 * and a screen must not read the two the same way.
 *
 * `lastNumber` is where the series has REACHED, which is also how many it has
 * issued — a gapless series has no zeroth document.
 */
export type InvoiceSeries =
  paths["/api/v1/invoice-series"]["get"]["responses"][200]["content"]["application/json"]["series"][number];

/** Whose desk covers leads from a country. */
export type TerritoryRule =
  paths["/api/v1/territory-rules"]["get"]["responses"][200]["content"]["application/json"]["rules"][number];

/** An event with whoever caused it. The stored row keeps only an actor id —
 *  personal data stays out of a log erasure cannot mutate — and the name is a
 *  read-time join, so an erased account stops resolving and the event survives. */
export type EventRecord =
  paths["/api/v1/events"]["get"]["responses"][200]["content"]["application/json"]["events"][number];

// ── The document store (T3.6) ───────────────────────────────────────────────
//
// Two things called "document" now exist in this app, and the difference is
// worth stating once: a `DocumentBlock` is a line of PROSE inside a proposal or
// letter (G1.7). A `StoredDocument` is a FILE — bytes, versions, and what they
// are attached to. They meet nowhere.

/** A file the firm holds, with its latest version and the names a list renders
 *  from — never bare uuids, per the API's read-model rule. */
export type StoredDocument =
  paths["/api/v1/documents"]["get"]["responses"][200]["content"]["application/json"]["documents"][number];

/** One immutable set of bytes. `contentHash` is the same value an engagement
 *  letter commits to, which is what makes "is the file the client holds the one
 *  we issued" a comparison rather than a matter of trust. */
export type StoredDocumentVersion = StoredDocument["latestVersion"];

/** A file as ONE subject's list shows it: the document, and what it is to that
 *  subject (`role`): `copy_of_record` for an issued invoice's or a sent letter's
 *  one copy, `draft_copy` for a draft printed for the firm (2026-09-29). */
export type SubjectFile =
  paths["/api/v1/subjects/{subjectKind}/{subjectRef}/documents"]["get"]["responses"][200]["content"]["application/json"]["documents"][number];

/** What a document is attached to. `subjectLabel` is NULL when the subject does
 *  not resolve — the reference carries no foreign key, so a dangling link is
 *  possible and is shown as unresolved rather than rendered blank. */
export type DocumentLink =
  paths["/api/v1/documents/{documentId}/links"]["get"]["responses"][200]["content"]["application/json"]["links"][number];

/** A mark the firm prints on what it sends — per ISSUING ENTITY, never per
 *  firm, because a firm signing on two letterheads must not put the Indian logo
 *  on a letter its US entity issued. */
export type BrandAsset =
  paths["/api/v1/firm-entities/{entityPartyId}/brand-assets"]["get"]["responses"][200]["content"]["application/json"]["assets"][number];

export type BrandAssetKind = BrandAsset["kind"];

export const BRAND_ASSET_KINDS = [
  "logo",
  "signature",
  "letterhead",
  "proposal_cover",
] as const satisfies readonly BrandAssetKind[];

export const BRAND_ASSET_LABELS: Readonly<Record<BrandAssetKind, string>> = {
  logo: "Logo",
  signature: "Signature",
  letterhead: "Letterhead",
  proposal_cover: "Proposal cover",
};

export const BRAND_ASSET_HINTS: Readonly<Record<BrandAssetKind, string>> = {
  // One line each (Wave 4). A signature is a PNG so its background is clear
  // and the mark sits on the line rather than in a white box.
  logo: "Heads every letter, invoice and proposal. PNG or JPG.",
  signature: "Signs engagement letters once sent. A PNG with a clear background.",
  // The uploaded FILE is kept and not drawn: said on the row, because a
  // control that looks live and is inert is the thing to avoid. The letterhead
  // a document prints is the company's details, from Your firm (CA#18).
  letterhead:
    "The file is kept, not drawn. Letters, invoices and proposals print the company's address, tax numbers and contact from Your firm.",
  // WHERE the two names land is the layout's, so the artwork has to leave room
  // for them: "Prepared for" in dark text about 40% down on the right, and
  // "Prepared by" in white about 78% down on the right.
  proposal_cover:
    "First page of each proposal. Portrait PNG or JPG; keep the right side clear 40% and 78% down.",
};

/**
 * What the file picker will offer, per kind.
 *
 * NARROWED FOR THE TWO THAT ARE DRAWN. A logo and a signature are embedded into
 * every document the entity issues and the renderer can embed PNG and JPEG only;
 * `image/*` invited a `.webp`, which uploaded cleanly and then vanished from
 * every letter with nothing saying why. The API refuses it now — this is the
 * same rule where the person picking the file can see it, not a substitute for
 * that refusal.
 *
 * The letterhead keeps the wide set: it is legitimately a PDF and nothing draws
 * it as an image.
 */
export const BRAND_ASSET_ACCEPT: Readonly<Record<BrandAssetKind, string>> = {
  logo: "image/png,image/jpeg",
  signature: "image/png",
  letterhead: "image/*,application/pdf",
  proposal_cover: "image/png,image/jpeg",
};

/** What a document can be attached to. A CLOSED set in the API — the reference
 *  carries no foreign key, so an unknown kind is refused at the write rather
 *  than becoming a link nothing can follow. */
export type DocumentSubjectKind = DocumentLink["subjectKind"];

/** What the document IS. The product's own types, not a vocabulary a firm
 *  edits — a firm does not invent a new kind of engagement letter. */
export type StoredDocumentKind = StoredDocument["kind"];

export const DOCUMENT_KINDS = [
  "identity_proof",
  "statutory_filing",
  "working_paper",
  "correspondence",
  "proposal",
  "engagement_letter",
  "invoice",
  "credit_note",
  "brand_asset",
  "other",
] as const;

export const DOCUMENT_KIND_LABELS: Readonly<Record<string, string>> = {
  identity_proof: "Identity proof",
  statutory_filing: "Statutory filing",
  working_paper: "Working paper",
  correspondence: "Correspondence",
  proposal: "Proposal",
  engagement_letter: "Engagement letter",
  invoice: "Invoice",
  credit_note: "Credit note",
  brand_asset: "Brand asset",
  other: "Other",
};

/**
 * A file size, for people.
 *
 * `byteSize` arrives as a number the API has already bounded (nothing over
 * BIB_MAX_UPLOAD_BYTES is stored), so this is presentation and nothing more.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? "KB"}`;
}

/**
 * Fetch a document's bytes and hand them to the browser as a download.
 *
 * A plain `<a href>` would be the obvious thing and it is the wrong thing here.
 * The session is an httpOnly cookie set by a DIFFERENT origin, and the API sets
 * `SameSite=Lax` — so a link works on localhost (same site, different port) and
 * silently downloads an HTML error page in any environment where the API is on
 * another domain. Every other authenticated call in this app goes through fetch
 * with `credentials: "include"`; bytes are not the place to invent a second
 * mechanism that fails differently.
 *
 * The whole file is held in memory to do this. That is bounded by the API's own
 * upload limit, and it is the honest cost of not using a pre-signed URL — which
 * the backend deliberately does not offer, because a pre-signed URL answers to
 * none of the four scoping gates.
 */
export async function downloadDocument(
  documentId: string,
  filename: string,
  versionId?: string,
): Promise<string | null> {
  const path =
    versionId === undefined
      ? `/api/v1/documents/${documentId}/content`
      : `/api/v1/documents/${documentId}/versions/${versionId}/content`;
  const response = await fetch(`${baseUrl}${path}`, { credentials: "include" });
  if (!response.ok) {
    // The error body is the API's envelope, not bytes. Showing its message
    // matters most for 502 — "storage lost the bytes" is a different thing from
    // "no such document", and the API is careful to distinguish them.
    try {
      const body: unknown = await response.json();
      return apiError(body).message;
    } catch {
      return `the file could not be fetched (${String(response.status)})`;
    }
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than immediately: Safari has historically
  // cancelled an in-flight download whose object URL was revoked synchronously.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
  return null;
}

/**
 * A stored document's bytes, for drawing it on the page (2026-09-28): a sent
 * proposal's PDF of record, a letter's signed copy. The same route and the same
 * `credentials: "include"` as `downloadDocument`, for the same reasons; the
 * route answers `attachment`, which a `fetch` does not care about.
 */
export async function fetchDocumentBytes(
  documentId: string,
  versionId?: string,
): Promise<{ bytes: Uint8Array; error: null } | { bytes: null; error: string }> {
  const path =
    versionId === undefined
      ? `/api/v1/documents/${documentId}/content`
      : `/api/v1/documents/${documentId}/versions/${versionId}/content`;
  const response = await fetch(`${baseUrl}${path}`, { credentials: "include" });
  if (!response.ok) {
    try {
      const body: unknown = await response.json();
      return { bytes: null, error: apiError(body).message };
    } catch {
      return { bytes: null, error: `the file could not be fetched (${String(response.status)})` };
    }
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), error: null };
}

// ── The leadership figures (T3.7) ───────────────────────────────────────────

/** MRR, receivables ageing and DSO. Every figure is derived from rows at read
 *  time, never a cached column, and already converted to the one currency named
 *  on the response. */
export type DashboardOverview =
  paths["/api/v1/dashboard/overview"]["get"]["responses"][200]["content"]["application/json"];

/** What each of the firm's companies billed, month by month (Wave 5): issued
 *  invoices before tax, less credit notes, each company in its own currency,
 *  and the whole firm in the reporting currency. */
export type RevenueByCompany =
  paths["/api/v1/dashboard/revenue/by-company"]["get"]["responses"][200]["content"]["application/json"];

/** What each manager's invoices billed (before tax, less credit notes),
 *  collected (cash, with tax) month by month, and are owed now (auto-invoice
 *  T4). One row (`userId: null`) is the invoices naming nobody. */
export type RevenueByManager =
  paths["/api/v1/dashboard/revenue/by-manager"]["get"]["responses"][200]["content"]["application/json"];
/** The revenue report (Q049): invoiced, collected and outstanding per manager
 *  or per originator, one row per person and CURRENCY, never converted. */
export type RevenueReport =
  paths["/api/v1/dashboard/revenue/report"]["get"]["responses"][200]["content"]["application/json"];
/** Who won a letter's work (0355): its originator, and how that was arrived at. */
export type LetterOriginator =
  paths["/api/v1/engagement-letters/{letterId}/originator"]["get"]["responses"][200]["content"]["application/json"];

/** One row of a grouped figure — a client, a service. Carries the NAME. */
export type DashboardSlice =
  paths["/api/v1/dashboard/mrr/{axis}"]["get"]["responses"][200]["content"]["application/json"]["slices"][number];

/** Why an engagement's fee is not in MRR. The firm sees these BESIDE the
 *  headline number, never instead of it. */
export type MrrGapReason = DashboardOverview["mrr"]["gaps"][number]["reason"];

export const MRR_GAP_LABELS: Readonly<Record<string, string>> = {
  unpriced: "not yet priced",
  no_frequency_stated: "no billing frequency stated",
  one_time: "one-off fees",
  custom_frequency: "custom billing",
};

export const MRR_GAP_HINTS: Readonly<Record<string, string>> = {
  unpriced: "The firm agreed to the work and has not set a price. There is no revenue to count.",
  no_frequency_stated:
    "Nobody has said whether this is billed monthly, quarterly or annually, so it cannot be turned into a monthly figure.",
  one_time: "Charged once. Real revenue, but not recurring revenue.",
  custom_frequency: "Billed on a custom schedule, so it cannot be turned into a monthly figure.",
};

export type AgeingBucket = DashboardOverview["receivables"]["bands"][number]["bucket"];

export const AGEING_LABELS: Readonly<Record<string, string>> = {
  current: "Not yet due",
  d1_30: "1 to 30 days",
  d31_60: "31 to 60 days",
  d61_90: "61 to 90 days",
  d90_plus: "Over 90 days",
  no_due_date: "No due date set",
};

/**
 * The client portal's status home (T6.5) — the FIRST shape in this file that a
 * person outside the firm reads.
 *
 * Two fields on it are facts rather than data, and the portal renders them as
 * such: `companies` EMPTY means invited-but-granted-nothing (which the screen
 * must say, not draw as a blank page), and `statutoryDueOn` is NULL on
 * everything the law did not date — the firm's own turnaround times have never
 * been given, so a deadline this product derived is a promise nobody made.
 */
export type PortalStatusHome =
  paths["/api/v1/portal/home"]["get"]["responses"][200]["content"]["application/json"];

/** A piece of the firm's work, as its client reads it. No assignee, no
 *  priority, no internal note — see the API's own schema for why each is
 *  absent. */
export type PortalWorkRow = PortalStatusHome["inProgress"][number];

/** A statutory filing one of the client's companies owes, or has made. */
export type PortalFilingRow = PortalStatusHome["upcomingFilings"][number];

/**
 * The client portal's ACTION CENTRE (T6.6) — what the firm is waiting on this
 * client for.
 *
 * Two lists, and they are different sentences rather than a filter: `awaitingYou`
 * is still open, `withTheFirm` is what they have answered and the firm has not
 * finished with. A client's reply does NOT close an ask — the firm looks at what
 * arrived and decides — so a wrong file is answered with "that was not it"
 * rather than with a second request that reads as a fresh one.
 *
 * There is no due date on any of it and there will not be one: no deadline this
 * product invented reaches a client.
 */
export type PortalActionCentre =
  paths["/api/v1/portal/asks"]["get"]["responses"][200]["content"]["application/json"];

/** One thing the firm has asked for. `askKind` decides which control the screen
 *  draws under it — a file picker, a text box, or two buttons. */
export type PortalAsk = PortalActionCentre["awaitingYou"][number];

/** One act by the client: a file, an answer in words, or a decision. Appended,
 *  never overwritten, so "the wrong register then the right one" is a history. */
export type PortalAskResponse = PortalAsk["responses"][number];

/**
 * The client portal's SELF-SERVE LIBRARY (T6.7) — a client's own documents.
 *
 * NOT WINDOWED, unlike the status home: the acceptance line is *"a client finds
 * LAST YEAR's challan"*, and a rolling window would make the one question this
 * list exists for unanswerable.
 *
 * A document is on it because it is the client's AND the firm marked it
 * client-visible (migration 0066) — a working paper about a client is not a
 * document of theirs. That is enforced in the DATABASE, so nothing a screen does
 * can widen it and nothing it forgets can leak.
 */
export type PortalLibrary =
  paths["/api/v1/portal/documents"]["get"]["responses"][200]["content"]["application/json"];

/** One document a client can open. The bytes come from
 *  `/portal/documents/{id}/content` — a real request with the session cookie,
 *  never a pre-signed URL (T3.6). */
export type PortalDocument = PortalLibrary["documents"][number];

/**
 * A client's own invoices, with what is still outstanding.
 *
 * MONEY IS A DECIMAL STRING on every field and stays one: `numeric` in the
 * database, a string on the wire, a string in the component. A `Number()`
 * anywhere on this path is a rounding error on somebody's own bill.
 *
 * A DRAFT is not here — the wall refuses it, not the query — because a draft is
 * a demand nobody has made yet. A CANCELLED one IS, because a client holding a
 * copy of a withdrawn invoice has to be able to see it was withdrawn.
 */
export type PortalInvoices =
  paths["/api/v1/portal/invoices"]["get"]["responses"][200]["content"]["application/json"];

export type PortalInvoice = PortalInvoices["invoices"][number];

/**
 * One calendar month of what the firm did (T6.7).
 *
 * IT IS A SCREEN AND NOT AN EMAIL. The board asks for a "monthly digest"; there
 * is no message transport in this product yet (P10 is Phase 7), so this is the
 * thing behind the email rather than the email, and the page says so.
 */
export type PortalDigest =
  paths["/api/v1/portal/digest"]["get"]["responses"][200]["content"]["application/json"];

export type PortalDigestRow = PortalDigest["filed"][number];

/**
 * An ask as the FIRM reads it, on the work item it was raised from.
 *
 * Wider than the client's view — it carries who raised it, who closed it, and
 * the two statuses a client never sees (`closed`, `withdrawn`).
 */
export type ClientAsk =
  paths["/api/v1/work-items/{workItemId}/asks"]["get"]["responses"][200]["content"]["application/json"][number];

/**
 * A CLIENT'S OWN REQUEST (T6.8) — the first thing on this portal a client can
 * START rather than answer.
 *
 * Three lists rather than a filter, and the split is not the action centre's.
 * An ASK is sorted by whether it still wants something from the client; a
 * request they raised themselves never does, so it sorts on whether the firm
 * has come back: `awaitingFirm`, `replied`, and `settled` — which is on this
 * surface at all because *"did I already ask for this"* is the question that
 * stops the second phone call.
 *
 * `clientPartyId` goes UP on the write and never comes back down: the client
 * names which of their companies they are writing about, and the database
 * refuses any they were not granted (migration 0068).
 */
export type PortalRequests =
  paths["/api/v1/portal/requests"]["get"]["responses"][200]["content"]["application/json"];

export type PortalRequest = PortalRequests["awaitingFirm"][number];

/** One message in the thread, from either side. `authorName` is NULL on
 *  everything the firm wrote — nobody at the firm is named on this surface, and
 *  a name here invites chasing a junior directly. */
export type PortalRequestReply = PortalRequest["replies"][number];

/**
 * The same request as the FIRM reads it — the inbox.
 *
 * Wider than the client's view: it carries which client it came from, who there
 * wrote it, and `awaitingFirm`, which is the flag the screen works from. There
 * is NO ROUTING — nobody is assigned one — so the company name is what tells
 * one row from another at a glance.
 */
export type ClientRequestInbox =
  paths["/api/v1/client-requests"]["get"]["responses"][200]["content"]["application/json"];

export type ClientRequest = ClientRequestInbox["requests"][number];

/**
 * How the firm routes an arriving request (migration 0070).
 *
 * IT TRAVELS WITH THE LIST, and that is T4.5's `ladderPublished` decision: an
 * inbox where nothing is assigned because the firm routes nothing, and one
 * where the rule ran and placed nothing, are the same picture — and only one of
 * them is somebody's to fix.
 *
 * `none` is the default and a real answer. A SPOC is not a member of this union
 * and cannot become one: a SPOC covers a Dept, and a request names no service.
 */
export type RequestRouting = ClientRequestInbox["routing"];

export type ClientRequestReply = ClientRequest["replies"][number];

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
