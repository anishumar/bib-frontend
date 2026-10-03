"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  apiError,
  codeLabel,
  formatMoney,
  LEAD_STAGES,
  PROPOSAL_STATUS_WORDS,
  colleagueLabel,
  recordsLostReason,
  TERMINAL_STAGES,
} from "@/lib/api/client";
import type {
  Colleague,
  EventRecord,
  LeadStage,
  LeadView,
  ProposalSummary,
} from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  LinkButton,
  Meta,
  MetaItem,
  NotSet,
  Notice,
  Pill,
  RowChevron,
  RowLink,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  ThChevron,
  Tr,
  type PillTone,
  AmountInput,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader, useSession } from "@/components/layout";
import { DeleteMistake, DeletedNotice } from "@/components/delete-mistake";
import { longInstant, longMoment } from "@/lib/day";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { cleanAmount, previewAmount } from "@/lib/money";
import { MissingMoney, useSeesFees } from "@/components/fees";

/** "500000.00" as somebody would type it back: the API's two places are
 *  noise in an edit box when there are no paise. */
function editable(amount: string): string {
  return amount.endsWith(".00") ? amount.slice(0, -3) : amount;
}

/**
 * One opportunity, and everything that happened to it.
 *
 * ── WHY THIS SCREEN EXISTS, GIVEN THE LIST ALREADY HAS THE ROW ──────────────
 *
 * `GET /api/v1/leads/{leadId}` had no caller: it returns exactly the
 * `LeadRecord` the list returns, so a page built only on it would show what
 * `/leads` already shows. What the LIST cannot show is the rest of the story —
 * a table row has four columns and this opportunity has eleven facts, a
 * paragraph of notes, a proposal that may have come out of it, and a history.
 * Three of those facts (`notes`, `jurisdiction`, `capturedAt`) were captured by
 * the API and rendered by NOTHING until this page existed.
 *
 * ── AND IT GIVES A SECOND ROUTE ITS SECOND READER ───────────────────────────
 *
 * `GET /api/v1/objects/{objectType}/{objectId}/events` was reachable only by
 * typing a uuid into `/audit`'s query string. A lead's own history is four
 * verbs — captured, merged, stage_changed, owner_assigned — and it answers the
 * question a partner actually asks about a stalled opportunity: who has had it,
 * and since when.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It does not re-implement the pipeline's queue behaviour. `/leads` restores
 * focus to the select it just wrote through and narrates every write into a
 * live region, because somebody working a queue changes ten rows in a row and
 * must not lose their place. Here there is one lead and a page reload, so the
 * same acts are the plain forms they look like. The RULES are not duplicated at
 * all: `LEAD_STAGES`, `recordsLostReason` and `TERMINAL_STAGES` are the shared
 * ones the list uses, and every refusal is the API's.
 *
 * A closed opportunity has no controls, on this page or on the list, because
 * `canMoveStage` refuses a move out of a terminal stage. The card says so
 * instead of offering something that would be refused.
 */

/** The four verbs a lead can carry, as a sentence. The payload is what makes
 *  two of them worth reading — "new → contacted" is the event; `lead.stage_changed`
 *  is the filing cabinet's name for it. The full payload stays on `/audit`,
 *  which is where a quoted record belongs. */
function sentenceFor(event: EventRecord["event"]): string {
  const p = event.payload as Record<string, unknown>;
  const from = typeof p["from"] === "string" ? p["from"] : null;
  const to = typeof p["to"] === "string" ? p["to"] : null;
  switch (event.verb) {
    case "lead.captured":
      return typeof p["source"] === "string"
        ? `Captured (${codeLabel(p["source"])})`
        : "Captured";
    case "lead.merged":
      return "A second capture was merged into this opportunity";
    case "lead.stage_changed":
      return from !== null && to !== null
        ? `Moved from ${codeLabel(from)} to ${codeLabel(to)}`
        : "Moved";
    case "lead.details_changed": {
      // Both sides travel in the payload, so the sentence can say what moved
      // without a second read. Only what CHANGED is named.
      const parts: string[] = [];
      const cFrom = p["jurisdictionFrom"];
      const cTo = p["jurisdictionTo"];
      if (cFrom !== cTo) {
        parts.push(
          typeof cTo === "string" ? `Country set to ${countryName(cTo)}` : "Country cleared",
        );
      }
      const vFrom = p["estimatedValueFrom"];
      const vTo = p["estimatedValueTo"];
      const currency = typeof p["currency"] === "string" ? p["currency"] : null;
      if (vFrom !== vTo) {
        parts.push(
          typeof vTo === "string" && currency !== null
            ? `value set to ${formatMoney(vTo, currency)}`
            : "value cleared",
        );
      }
      const said = parts.join(", ");
      return said === "" ? "Details changed" : said.charAt(0).toUpperCase() + said.slice(1);
    }
    case "lead.owner_assigned":
      // WHO is not in the sentence on purpose: the payload carries a user id,
      // and resolving it to a name here would mean a second read per row for a
      // fact the actor column already answers most of the time.
      return p["ownerUserId"] === null ? "Owner removed" : "Owner assigned";
    case "lead.deleted":
      return "Deleted as entered by mistake";
    default:
      return event.verb;
  }
}

export default function LeadPage() {
  const router = useRouter();
  const params = useParams<{ leadId: string }>();
  const leadId = params.leadId;
  const session = useSession();
  // THE FEE AXIS (B33/F02): the value is null for a login that cannot see
  // fees, and the API refuses one it sends (null included), so it reads
  // Hidden here and its box is not offered.
  const seesFees = useSeesFees();

  const [record, setRecord] = useState<LeadView | null>(null);
  const [staff, setStaff] = useState<Colleague[]>([]);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** The close in progress. Choosing `lost` or `abandoned` does not write — it
   *  opens the reason box and writes BOTH in one call, because the API refuses
   *  a close with no reason and firing first would report an error the reader
   *  could not have avoided. The same shape as the list, for the same reason. */
  const [closing, setClosing] = useState<LeadStage | null>(null);
  /** What the value box says, for the preview under it. Null until touched,
   *  so the preview starts from the saved value. */
  const [typedValue, setTypedValue] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [one, roster, quotes, history] = await Promise.all([
      api.GET("/api/v1/leads/{leadId}", { params: { path: { leadId } } }),
      // Needs `tenant:admin`, so an associate gets a 403 and no owner picker.
      // That is the API's rule and this screen does not argue with it.
      // The colleagues PICKER, not the roster (G3.2's gap, closed as on the work
      // board): names and rungs of active staff on `party:read`, no emails. The
      // roster is `tenant:admin`, so until 2026-09-25 nobody below
      // administrator was shown this picker at all.
      api.GET("/api/v1/tenancy/colleagues", {}),
      // No `leadId` filter on the list, so this filters. The alternative is a
      // query parameter nothing else would use.
      api.GET("/api/v1/proposals", {}),
      api.GET("/api/v1/objects/{objectType}/{objectId}/events", {
        params: { path: { objectType: "lead", objectId: leadId } },
      }),
    ]);
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setRecord(one.data);
    setStaff(roster.data ? [...roster.data.colleagues] : []);
    setProposals((quotes.data?.proposals ?? []).filter((p) => p.proposal.leadId === leadId));
    // A 403 here is the ordinary answer for an associate — the trail is a
    // partner-and-manager read — and it costs the history card, not the page.
    setEvents(history.data?.events ?? []);
    setError(null);
    setLoaded(true);
  }, [leadId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(said: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    // Cleared BEFORE the call, so a second identical refusal is a second
    // absent → present transition and `ErrorNotice` moves focus again.
    setError(null);
    setNote(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
    setNote(said);
  }

  function move(stage: LeadStage, lostReason?: string): void {
    void act(`Moved to ${codeLabel(stage)}.`, async () => {
      const result = await api.POST("/api/v1/leads/{leadId}/stage", {
        params: { path: { leadId } },
        body: {
          stage,
          ...(lostReason === undefined || lostReason === "" ? {} : { lostReason }),
        },
      });
      if (!result.error) setClosing(null);
      return result;
    });
  }

  function saveDetails(form: FormData): void {
    const jurisdiction = String(form.get("jurisdiction") ?? "");
    const estimatedValue = cleanAmount(String(form.get("estimatedValue") ?? ""));
    void act(seesFees === true ? "Country and value saved." : "Country saved.", async () => {
      const result = await api.PUT("/api/v1/leads/{leadId}/details", {
        params: { path: { leadId } },
        // A blank box is "not known", which is null on the wire. The value is
        // sent only by a login that sees fees: left out, the API keeps it.
        body: {
          jurisdiction: jurisdiction === "" ? null : jurisdiction,
          ...(seesFees === true ? { estimatedValue: estimatedValue === "" ? null : estimatedValue } : {}),
        },
      });
      if (!result.error) setTypedValue(null);
      return result;
    });
  }

  if (!loaded) return <Loading label="Loading the opportunity" />;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such opportunity."}</Notice>
      </Page>
    );
  }

  const { lead, party, owner } = record;
  const closed = TERMINAL_STAGES.includes(lead.stage);
  // Deleted as a mistake (0086): out of the pipeline, and final — so none of
  // the forms below is offered, because every one of them would be refused.
  const deleted = lead.deletedAt !== null;
  const canPropose =
    !closed && !deleted && (session?.permissions.includes("party:write") ?? false);

  // What can still be done to it: a deleted lead takes nothing, a closed one
  // takes a corrected country or value and nothing else.
  const canEdit = !deleted;
  const canMove = !deleted && !closed;

  return (
    <Page>
      {/* THE WAVE 4 SHAPE (2026-09-28): New proposal is the one brand button;
          the opportunity's facts, its stage and owner, its country and value
          and its notes are ONE card (they were three, and the first repeated
          the other two); stage and source read as words, never codes. */}
      <PageHeader
        title={lead.title}
        lede={
          <>
            An opportunity with <Link href={`/clients/${party.id}`}>{party.displayName}</Link>.
            {deleted && " Deleted as entered by mistake."}
          </>
        }
        aside={
          /* THE PROPOSAL CARRIES THIS LEAD. The old way in was the form on
             /proposals, which never sent a lead, so "Proposals from this
             opportunity" below stayed empty whatever was quoted. */
          canPropose ? (
            <LinkButton variant="primary" href={`/proposals/new?leadId=${lead.id}`}>
              New proposal
            </LinkButton>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      {/* The same live region the pipeline uses, for the same reason: a write
          that only changes a value in a box says nothing to somebody who cannot
          see the box. */}
      <p className="muted" role="status" aria-live="polite">
        {note ?? ""}
      </p>

      {lead.deletedAt !== null && (
        <DeletedNotice what="This lead" deletedAt={lead.deletedAt} deletedBy={record.deletedBy}>
          It is not counted as lost, and it cannot change again. If the prospect is real, capture
          a new lead.
        </DeletedNotice>
      )}

      <Card>
        <Meta>
          {!canMove && (
            <MetaItem label="Stage">
              <Pill dot tone={stageTone(lead.stage)}>
                {codeLabel(lead.stage)}
              </Pill>
            </MetaItem>
          )}
          {!canMove && (
            <MetaItem label="Owner">
              {owner === null ? (
                /* Unassigned is a real state — it is the queue somebody works
                   from — and saying so is not the same as saying nothing. */
                <NotSet>Unassigned</NotSet>
              ) : (
                (owner.displayName ?? owner.email)
              )}
            </MetaItem>
          )}
          <MetaItem label="Source">{codeLabel(lead.source)}</MetaItem>
          {!canEdit && (
            <MetaItem label="Where the prospect is">
              {/* Null is ORDINARY here — often nobody knows at capture — and an
                  unknown country matches no territory rule, which is why the
                  assignment rotation covers it. */}
              {lead.jurisdiction === null ? <NotSet /> : countryName(lead.jurisdiction)}
            </MetaItem>
          )}
          {(!canEdit || seesFees !== true) && (
            <MetaItem label="Could be worth">
              {lead.estimatedValue === null ? (
                <MissingMoney seesFees={seesFees} />
              ) : (
                <span className="num">
                  {formatMoney(lead.estimatedValue.amount, lead.estimatedValue.currency)}
                </span>
              )}
            </MetaItem>
          )}
          {/* An INSTANT, parsed: `capturedAt` is a timestamptz and the day it
              fell on where the reader is standing is the answer they want. */}
          <MetaItem label="Captured">{longInstant(lead.capturedAt)}</MetaItem>
          {lead.closedAt !== null && (
            <MetaItem label="Closed">{longInstant(lead.closedAt)}</MetaItem>
          )}
        </Meta>

        {lead.lostReason !== null && (
          /* `warn`, never `danger`. An opportunity that did not close is
             ordinary commercial life, and the reason is the most useful
             sentence on this page — a firm that cannot tell "chose a
             competitor" from "went quiet" cannot tell which of its two fixable
             failures it has. */
          <div className="card-part">
            <Notice tone="warn" eyebrow="Why it did not close">
              <p>{lead.lostReason}</p>
            </Notice>
          </div>
        )}

        {closed && !deleted && (
          /* A converted, lost or abandoned opportunity cannot be reopened; a
             new capture is linked to the same client record. */
          <p className="muted card-part">
            Closed for good. If talks restart, capture a new lead on{" "}
            <Link href="/leads">the pipeline</Link>.
          </p>
        )}

        {canMove && (
          <div className="card-foot">
            <FieldRow>
              <Field label="Stage" hint="Lost and abandoned ask for a reason.">
                <Select
                  value={closing ?? lead.stage}
                  disabled={busy}
                  onChange={(e) => {
                    const stage = e.target.value as LeadStage;
                    // Every CLOSING stage asks a second time (V1.3): a closed
                    // lead is never reopened. Lost and abandoned also ask why.
                    if (TERMINAL_STAGES.includes(stage)) {
                      setClosing(stage);
                      return;
                    }
                    setClosing(null);
                    move(stage);
                  }}
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {codeLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Owner"
                hint={
                  staff.length === 0
                    ? "You cannot see the staff list."
                    : "Unassigned puts it in the queue."
                }
              >
                <Select
                  value={owner?.userId ?? ""}
                  disabled={busy || staff.length === 0}
                  onChange={(e) => {
                    const ownerUserId = e.target.value === "" ? null : e.target.value;
                    const who =
                      ownerUserId === null
                        ? "on nobody's desk"
                        : `with ${
                            (() => {
                              const c = staff.find((m) => m.userId === ownerUserId);
                              return c === undefined ? "somebody else" : colleagueLabel(c);
                            })()
                          }`;
                    void act(`Now ${who}.`, () =>
                      api.PUT("/api/v1/leads/{leadId}/owner", {
                        params: { path: { leadId } },
                        body: { ownerUserId },
                      }),
                    );
                  }}
                >
                  <option value="">Unassigned</option>
                  {staff.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {colleagueLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>

            {closing !== null && (
              <form
                action={(form) => {
                  move(
                    closing,
                    recordsLostReason(closing) ? String(form.get("lostReason") ?? "").trim() : undefined,
                  );
                }}
              >
                {/* Its own group: two forms are open on this card once a close
                    begins, and "Stage" above and this box are different
                    questions about the same lead. */}
                <fieldset
                  className="card"
                  aria-label={`Closing this opportunity as ${codeLabel(closing).toLowerCase()}`}
                  style={{ marginTop: "var(--s-4)" }}
                >
                  <p className="text-md">
                    {closing === "converted"
                      ? "Mark this lead converted? "
                      : `Close this lead as ${codeLabel(closing).toLowerCase()}? `}
                    A closed lead cannot be reopened. If talks restart, capture a new lead.
                  </p>
                  {recordsLostReason(closing) && (
                    <Field label={`Why is it ${codeLabel(closing).toLowerCase()}?`} hint="Required, in your own words.">
                      <Textarea
                        name="lostReason"
                        rows={3}
                        required
                        placeholder="e.g. Chose their existing auditor"
                      />
                    </Field>
                  )}
                  <div className="cluster" style={{ marginTop: "var(--s-3)" }}>
                    <Button type="submit" loading={busy}>
                      {busy
                        ? "Closing…"
                        : closing === "converted"
                          ? "Mark it converted"
                          : `Close it as ${codeLabel(closing).toLowerCase()}`}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setClosing(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </div>
        )}

        {/* Open AND closed: what a deal was worth is worth correcting after it
            closes, and the API allows it for that reason. The key remounts the
            form on a save, so its boxes start from what was just stored. */}
        {canEdit && (
          <form
            className={canMove ? undefined : "card-foot"}
            style={canMove ? { marginTop: "var(--s-4)" } : undefined}
            key={`${lead.jurisdiction ?? ""}|${lead.estimatedValue?.amount ?? ""}`}
            action={(form) => {
              saveDetails(form);
            }}
          >
            <FieldRow>
              <Field label="Country" hint="Changing it does not move it to another desk.">
                <CountrySelect name="jurisdiction" defaultValue={lead.jurisdiction ?? ""} />
              </Field>
              {seesFees === true && (
              <Field
                label="Could be worth"
                hint={
                  previewAmount(
                    cleanAmount(
                      typedValue ??
                        (lead.estimatedValue === null ? "" : editable(lead.estimatedValue.amount)),
                    ),
                    // Grouped as the value's own currency is (lakhs for INR).
                    lead.estimatedValue?.currency,
                  ) ?? "In the firm's currency. Blank if nobody knows."
                }
              >
                <AmountInput
                  name="estimatedValue"
                  placeholder="e.g. 5,00,000"
                  defaultValue={
                    lead.estimatedValue === null ? "" : editable(lead.estimatedValue.amount)
                  }
                  onChange={(e) => {
                    setTypedValue(e.target.value);
                  }}
                />
              </Field>
              )}
              <div className="field-action">
                <Button type="submit" variant="secondary" disabled={busy}>
                  Save
                </Button>
              </div>
            </FieldRow>
          </form>
        )}

        <Meta layout="list" className="card-part">
          <MetaItem label="Notes">
            {lead.notes === null || lead.notes.trim() === "" ? (
              /* Notes come in with a capture; a second capture for the same
                 prospect is added to this opportunity rather than a new one. */
              <NotSet />
            ) : (
              <span style={{ whiteSpace: "pre-wrap", maxWidth: "62ch", display: "block" }}>
                {lead.notes}
              </span>
            )}
          </MetaItem>
        </Meta>
      </Card>

      <Card>
        <CardTitle level={2}>Proposals from this opportunity</CardTitle>
        {proposals.length === 0 ? (
          <p className="muted">
            None yet.{canPropose && " Start one with New proposal."}
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Proposal</Th>
                  <Th>Ref</Th>
                  <Th>Status</Th>
                  <Th align="right">Total</Th>
                  <ThChevron />
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <Tr key={p.proposal.id} linked>
                    <Td>
                      <RowLink href={`/proposals/${p.proposal.id}`}>{p.proposal.title}</RowLink>
                    </Td>
                    <Td className="nowrap">{p.proposal.ref}</Td>
                    <Td>
                      <Pill dot tone={proposalTone(p.proposal.status)}>
                        {PROPOSAL_STATUS_WORDS[p.proposal.status]}
                      </Pill>
                    </Td>
                    {/* "Hidden" for a caller without commercial visibility —
                        the API answers null rather than refusing the row, and
                        the row is still worth seeing. */}
                    <Td align="right" className="nowrap">
                      {p.totals.net === null ? (
                        <NotSet>Hidden</NotSet>
                      ) : (
                        formatMoney(p.totals.net, p.totals.currency)
                      )}
                    </Td>
                    <RowChevron />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHead
          title="History"
          level={2}
          aside={
            <LinkButton
              variant="ghost"
              size="sm"
              href={`/audit?type=lead&id=${leadId}`}
              aria-label="The full audit trail for this opportunity"
            >
              In the audit trail
            </LinkButton>
          }
        />
        {events.length === 0 ? (
          <p className="muted">Nothing to show. You may not have access to the audit trail.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>What</Th>
                  <Th>Who</Th>
                </tr>
              </thead>
              <tbody>
                {/* Oldest first: this is a story, and a story is read forwards.
                    `/audit` is newest-first because it is a monitor. */}
                {[...events].reverse().map((r) => (
                  <tr key={r.event.id}>
                    {/* WITH ITS CLOCK. An event is a timestamptz and the time of
                        day is half of what "who had it and since when" means. */}
                    <Td className="nowrap">{longMoment(r.event.occurredAt)}</Td>
                    <Td>{sentenceFor(r.event)}</Td>
                    <Td>
                      {r.actor === null ? (
                        <NotSet>{codeLabel(r.event.actorType)}</NotSet>
                      ) : (
                        (r.actor.displayName ?? r.actor.email)
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* Last, below the history: it is the one act on this page that is not
          about working the opportunity. */}
      <DeleteMistake
        title="Entered by mistake?"
        intro={
          <p className="muted">
            Delete a duplicate or a test. A real lead that fell through is closed as lost.
          </p>
        }
        label="Delete this lead"
        consequence={
          <>
            <p>It leaves the pipeline and its numbers, and is not counted as lost.</p>
            <p>The audit trail records that you deleted it. This cannot be undone.</p>
          </>
        }
        name={lead.title}
        refusal={record.deleteRefusal}
        explained={["LEAD_HAS_PROPOSALS", "CLOSED_LEAD_NEEDS_ADMIN"]}
        canWrite={session?.permissions.includes("party:write") ?? false}
        onDelete={async () => {
          setError(null);
          setNote(null);
          const result = await api.DELETE("/api/v1/leads/{leadId}", {
            params: { path: { leadId } },
          });
          if (result.error) {
            setError(apiError(result.error).message);
            return false;
          }
          await load();
          setNote("Deleted. It is no longer in the pipeline.");
          return true;
        }}
      />
    </Page>
  );
}

/** Which pill a stage wears: won is done, lost and abandoned are the same
 *  kind of fact, and the open stages are neither good nor bad. */
function stageTone(stage: LeadStage): PillTone {
  if (stage === "converted") return "ok";
  return recordsLostReason(stage) ? "danger" : "neutral";
}

/** The proposals list's own mapping, for the same statuses. */
function proposalTone(status: ProposalSummary["proposal"]["status"]): PillTone {
  if (status === "accepted") return "ok";
  return status === "rejected" || status === "expired" ? "danger" : "neutral";
}
