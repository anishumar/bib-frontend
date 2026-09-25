/**
 * The companies in one client's GROUP — and why this is a filter and not a list.
 *
 * The client page reads it, and so does **portal access**: a contact at Cobalt
 * Foods who should also see Cobalt Logistics is granted it deliberately, one
 * company at a time. The picker that offers those companies is an
 * ACCESS-CONTROL picker: a name that does not belong on it is a client's
 * records handed to somebody at another company.
 *
 * **A letter does NOT read it (F-10-1, 2026-09-25).** What a letter may cover is
 * the API's own `GET /parties/{id}/structure` — the client and what it HOLDS
 * (subsidiaries at any depth, companies it is a shareholder or director of) —
 * because drafting refuses anything else, and this function also reads the
 * group the other way round (the client's parent and its shareholders). A
 * picker built here would offer companies the letter then refuses.
 *
 * So the list is derived narrowly, from what the firm actually recorded, and
 * the screens say in words which relationships they are reading.
 *
 * ## What counts as the group, and what deliberately does not
 *
 * `core.relationship_type` holds six codes in three categories. Only the
 * **ownership** pair describes one company being part of another's group:
 *
 *   `parent_of`       X is the parent of Y — a subsidiary either way round.
 *   `shareholder_of`  X is a shareholder of Y.
 *
 * The other four are excluded, and each for its own reason rather than by
 * being left out of a list:
 *
 *   `director_of`, `authorised_signatory_of`, `employee_of` — these attach a
 *   PERSON to a company. Priya Menon is a director of Cobalt Foods; she is not
 *   a company whose filings and invoices exist to be shown.
 *   `client_of` — this points at the FIRM. Cobalt Foods is a client OF 10x
 *   Global, and a picker that read every relationship would offer the firm's
 *   own company to the firm's own client. That is the exact accident this
 *   function exists to make impossible.
 *
 * The counterparty must also be an **organization**, which is the backstop for
 * all three person types at once: a person recorded as a shareholder is still
 * a person, and `kind` says so without this having to enumerate the codes.
 *
 * ## In force on the day, not ever
 *
 * A relationship is effective-dated and `validTo` is half-open — the first day
 * NOT in force. A subsidiary sold in March is not part of the group in
 * September, and offering it would be reading a historical fact as a current
 * one. Pass the reader's own calendar day (`browserDay()`), never the server's.
 *
 * ## Direction does not matter, and that is the point
 *
 * "Cobalt Foods is the parent of Cobalt Logistics" and "Cobalt Logistics is a
 * subsidiary of Cobalt Foods" are ONE row read from two ends. Both companies
 * are in each other's group, so both directions are taken and the direction is
 * kept only to say the relationship in words on the screen.
 */
import type { PartyProfile, PartyRelationship } from "@/lib/api/client";

/** The ownership pair. A `Set` so adding `subsidiary_of` later is one line and
 *  not a second `||`. */
const GROUP_TYPES = new Set(["parent_of", "shareholder_of"]);

export interface GroupCompany {
  readonly id: string;
  readonly name: string;
  /** How the firm recorded it, in words — "the parent of", "a shareholder of".
   *  Shown beside the name so somebody choosing can tell WHY this company is on
   *  the list, which is the only defence against a stale relationship. */
  readonly relation: string;
}

/** Read as a sentence from THIS party's end. `label` is "{from} is {label}
 *  {to}", so an outgoing row reads forwards and an incoming one reads with the
 *  inverse. */
function relationOf(r: PartyRelationship): string {
  const type = r.relationship.type;
  if (type === "parent_of") return r.direction === "outgoing" ? "a subsidiary" : "the parent";
  return r.direction === "outgoing" ? "part-owned by this client" : "a shareholder";
}

/**
 * The other companies in this client's group, on `onDate`.
 *
 * Deduplicated by party: two companies can hold two recorded relationships (a
 * parent that is also a shareholder) and that is one company on a picker, not
 * two identical options — which probe 2 would read as one name twice.
 *
 * The client itself is never in here; `party_relationship` cannot hold a
 * self-relationship (a CHECK constraint refuses it), so this is a property of
 * the data rather than a filter, and callers that want the client too add it
 * themselves and say so.
 */
export function groupCompanies(profile: PartyProfile, onDate: string): GroupCompany[] {
  const seen = new Map<string, GroupCompany>();
  for (const r of profile.relationships) {
    if (!GROUP_TYPES.has(r.relationship.type)) continue;
    if (r.counterparty.kind !== "organization") continue;
    // Half-open: `validTo` is the first day NOT in force, so a row ending today
    // is already over. Same comparison the portal grants use, on purpose —
    // these are ISO days and string ordering is the correct ordering.
    if (r.relationship.validTo !== null && r.relationship.validTo <= onDate) continue;
    if (r.relationship.validFrom > onDate) continue;
    if (seen.has(r.counterparty.id)) continue;
    seen.set(r.counterparty.id, {
      id: r.counterparty.id,
      name: r.counterparty.displayName,
      relation: relationOf(r),
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
