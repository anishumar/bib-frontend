"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalGrant } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
  useSwapFocus,
} from "@/components/ui";
import { browserDay, longDay, instantDay } from "@/lib/day";
import type { GroupCompany } from "@/lib/group";

/**
 * The client's OWN people, and what each of them can see (G3.4, T6.5, T7.0b).
 *
 * ## This screen did not exist, and its absence was load-bearing
 *
 * `/admin/people` has said for months — under the button, and in the outcome
 * notice — *"invite a client's own people from that client's page"*. There was
 * no such thing. The whole portal-invite and gate-4 surface shipped API-only:
 * five routes with no caller anywhere in this app, so the only way a firm could
 * let a client into the portal it had been sold was a curl command.
 *
 * That is the same shape as the legal-entity form on the page around this one,
 * and it is the rule this repo runs on: a write with no read — or, here, with
 * no writer — is not a working product.
 *
 * ## Three facts on one row, and they are different questions
 *
 * **Can they see us** is the grant, and it is effective-dated. Ending one is
 * never a delete, so a closed row stays and is the only thing that answers
 * "could this person see us in March". `validTo` is HALF-OPEN — the first day
 * NOT in force — which is why the column says "until".
 *
 * **Have they got in** is `contactAccepted`, and it is a different fact
 * entirely. A grant is in force from the day it was written whether or not the
 * letter ever arrived, so a contact can be fully granted and completely stuck.
 * That state is exactly what the resend exists for, and it is why this column
 * is not derived from the dates.
 *
 * **Who let them in** is the granter, and it is a LEFT join in the API: an
 * account since erased must not take the grant off the screen.
 *
 * ## One client per grant, on purpose — and the three more times
 *
 * A contact who should see four of a group's companies is invited once and
 * granted three more times, one visible decision each. Access is never DERIVED
 * from a group relationship: the API refuses to walk `core.party_relationship`
 * on a firm's behalf, because a grant that widened itself when somebody
 * recorded a shareholding would make "who decided this contact may see Kaveri"
 * unanswerable, and would turn the CRM into an access-control screen without
 * anybody reviewing it as one.
 *
 * So the other three grants are three deliberate acts — and until now there was
 * nowhere to perform them. The invite route was the only writer this panel had,
 * and it grants exactly one company: the one whose page you are on. Somebody
 * who should also see the subsidiary had to be invited a second time at a
 * second address, or the firm reached for curl.
 *
 * `Give another company` is that act, and three things about it are deliberate:
 *
 * - **The list is the recorded GROUP, not the book.** `groupCompanies` reads
 *   the ownership relationships on this client's own profile and nothing else.
 *   A picker over every party at the firm would put one mis-click between a
 *   contact at Cobalt Foods and another client's invoices; a picker over every
 *   RELATIONSHIP would offer 10x Global itself, which is a `client_of` row.
 * - **What they can already see is the SERVER's answer**, from
 *   `/portal-access/memberships/{id}/scope`, and not this screen re-deriving a
 *   half-open date range. The scope route is what the portal's own requests are
 *   filtered by, so a company missing from the picker is missing because the
 *   thing that will actually let them in says they are already through it.
 * - **It says the company's name in the outcome.** A grant made from Cobalt
 *   Foods' page is a grant to a DIFFERENT company, and a sentence that only
 *   said "access granted" would read as though it had acted on the page it was
 *   on.
 */
export function PortalContactsPanel({
  partyId,
  clientName,
  canGrant,
  group,
}: {
  partyId: string;
  clientName: string;
  /** `portal:grant`. Decides what is OFFERED — the API's refusal is what is
   *  shown if one arrives anyway. */
  canGrant: boolean;
  /**
   * The OTHER companies in this client's group, in force today — the whole of
   * what "give them another company" may offer.
   *
   * Passed in rather than read here because the page above already holds the
   * party profile these come from, and a second fetch of the same record would
   * be one round trip to answer a question already answered. Empty is the
   * ordinary case and the panel says nothing at all about grouping when it is:
   * a firm with no recorded shareholdings must not be shown a picker with
   * nothing in it and left wondering what it was for.
   */
  group: readonly GroupCompany[];
}) {
  const [grants, setGrants] = useState<PortalGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * WHICH ROW IS WORKING — and why this is not `busy`.
   *
   * Passing `disabled={busy}` to every row button is the shape a hundred call
   * sites in this app use, and on a panel with several rows it is wrong in a
   * way only a walk finds: `busy` disables ALL of them at once, the browser
   * blurs the disabled one, and `Button`'s focus-restore hands focus to
   * whichever of them re-enables first. Measured — after inviting somebody,
   * focus landed on another contact's "Remove access", which is the
   * destructive control on this panel.
   *
   * So only the button that was pressed is marked, and it is marked `loading`
   * rather than disabled: `loading` swallows the click and says `aria-busy`
   * without the browser taking focus away from it at all. The others stay
   * pressable, which is correct — a second press acts on a different row, and
   * the API is the thing that refuses anything genuinely conflicting.
   */
  const [acting, setActing] = useState<string | null>(null);
  /**
   * What the last write did, in words. A resend is otherwise invisible: the
   * row it acts on does not change, so without this the button would look like
   * it had done nothing at all.
   *
   * THE EYEBROW IS CARRIED, NOT DERIVED FROM THE TONE. It was
   * `tone === "ok" ? "Sent" : "Removed"` while this panel did two things and
   * one of them was an email — and granting a second company then arrived under
   * the word SENT, over a sentence saying somebody can now see a company.
   * Nothing had been sent. A tone says how a thing reads; it does not know what
   * the act was.
   */
  const [outcome, setOutcome] = useState<{
    tone: "ok" | "warn";
    eyebrow: string;
    text: string;
  } | null>(null);

  /**
   * WHERE FOCUS GOES WHEN A ROW REMOVES ITSELF.
   *
   * "Remove access" is a button that unmounts by succeeding: the grant closes,
   * the row leaves the live table for the collapsed history below it, and the
   * browser parks focus on `<body>` — so the next Tab restarts at the skip
   * link. It is the same defect `useSwapFocus` was written for, in a third
   * shape, so it is the same hook rather than a second answer to it: the
   * outcome notice is the panel, it appears at exactly that moment, and it is
   * the sentence saying what just happened. Every write clears `outcome` first,
   * which is what makes this a TRANSITION rather than a replacement the effect
   * would sleep through.
   *
   * `trigger` is deliberately unattached. There is no button to hand focus back
   * to — that is the whole situation.
   */
  const { panel: outcomeRef } = useSwapFocus(outcome !== null);

  /**
   * WHICH CONTACT IS BEING GIVEN ANOTHER COMPANY, and what that login can
   * already see.
   *
   * `elsewhere` is null while the two reads are in flight, which is a real
   * state and not a flicker: the picker cannot be drawn until the server has
   * said what this person already sees, because drawing it early would offer a
   * company they hold and turn a duplicate into the commonest outcome of the
   * button.
   */
  const [granting, setGranting] = useState<PortalGrant | null>(null);
  const [elsewhere, setElsewhere] = useState<Elsewhere | null>(null);

  /**
   * WHERE FOCUS GOES, and why this one is NOT `useSwapFocus`.
   *
   * The hook is for a button that unmounts by its own click. This button does
   * not: it stays in its row, and the panel it opens is below the whole table.
   * So focus is never LOST — it is left somewhere far from the thing that just
   * appeared, which is a different defect with a different fix. The button
   * carries `aria-expanded` and `aria-controls` (the app's rule: a disclosure
   * whose region is elsewhere on the page says so), and focus is moved to the
   * panel deliberately.
   *
   * The trigger node is captured from the event rather than through a ref,
   * because there is one of these per row and a single ref would end up
   * pointing at whichever row rendered last. React keeps the same DOM node
   * across re-renders — the rows are keyed by grant id — so the captured node
   * is still the live button when the panel closes.
   *
   * When the grant SUCCEEDS the button may be gone (it was the last company
   * left to give). Focusing a detached node is a no-op and leaves focus on
   * `<body>`, which is exactly the condition the outcome notice's own hook
   * waits for — so the sentence takes focus instead, and nothing is dropped
   * either way round.
   */
  const grantPanelRef = useRef<HTMLDivElement>(null);
  const grantTriggerRef = useRef<HTMLButtonElement | null>(null);
  const grantPanelId = useId();
  const grantOpen = granting !== null;
  const grantWasOpen = useRef(false);
  useEffect(() => {
    if (grantWasOpen.current === grantOpen) return;
    grantWasOpen.current = grantOpen;
    if (grantOpen) grantPanelRef.current?.focus();
    else grantTriggerRef.current?.focus();
  }, [grantOpen]);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/portal-access/clients/{partyId}", {
      params: { path: { partyId } },
    });
    if (result.error) {
      // A 403 here is ordinary rather than broken: this read carries
      // `portal:grant`, the same permission as the writes, deliberately — the
      // list names a client's own people and what each may see, which is not a
      // fact the whole firm needs. Somebody without it sees the panel explain
      // itself, not an error they cannot act on.
      setGrants([]);
      setError(result.response.status === 403 ? null : apiError(result.error).message);
      return;
    }
    setGrants(result.data.grants);
    setError(null);
  }, [partyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Invite somebody, and grant them this client, in ONE act.
   *
   * The API makes it one call because every halfway state is silent and bad —
   * a membership with no grant is a portal that opens onto nothing, and the
   * contact cannot tell that from broken software. This screen must not take it
   * back apart.
   */
  async function invite(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    setOutcome(null);
    const email = String(form.get("email") ?? "").trim();
    const displayName = String(form.get("displayName") ?? "").trim();
    const result = await api.POST("/api/v1/portal-invites", {
      body: {
        email,
        clientPartyId: partyId,
        // The BROWSER's calendar day. A UTC server is a day behind a firm in
        // India every morning, and this value decides when the grant starts.
        validFrom: browserDay(),
        // Only when given: the API applies it to a NEW account and never
        // renames somebody who already holds a login at another firm.
        ...(displayName === "" ? {} : { displayName }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    // THE RELOAD COMES FIRST, AND THE ORDER IS THE FIX. `useSwapFocus` watches
    // the notice APPEARING, and the row it replaces is removed by `load()`. Set
    // the other way round, the effect fired while the pressed button was still
    // mounted and still focused, saw a live `activeElement`, and correctly did
    // nothing — then the row unmounted a render later with nothing watching.
    // Measured: focus sat on `<body>` and the next Tab restarted at the skip
    // link. Every write in this panel is ordered this way for that reason.
    await load();
    setOutcome({
      tone: "ok",
      eyebrow: "Sent",
      text:
        `${email} has been emailed an invitation to ${clientName}'s records. ` +
        `The link works once, and stops working on ${expiryDay(result.data.expiresAt)}.`,
    });
  }

  /**
   * Send the invitation again — same person, same address.
   *
   * There is no field for an address and there will not be one. "Re-invite this
   * contact" has two questions behind it — did they lose the link, or has
   * somebody else taken over that mailbox — and only the first is answered
   * here. Moving a client's portal access to a different email is a different
   * act, and not one anybody holding a firm login should be able to perform as
   * a side effect of a button called "Send it again".
   */
  async function resend(grant: PortalGrant): Promise<void> {
    setActing(`resend:${grant.id}`);
    setError(null);
    setOutcome(null);
    const result = await api.POST("/api/v1/portal-invites/{membershipId}/resend", {
      params: { path: { membershipId: grant.membershipId } },
    });
    setActing(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
    setOutcome({
      tone: "ok",
      eyebrow: "Sent again",
      text:
        `The invitation has gone to ${grant.contactEmail} again. It replaces any earlier ` +
        `link, and stops working on ${expiryDay(result.data.expiresAt)}.`,
    });
  }

  /** Stop somebody seeing this client, today. Never a delete — the row stays,
   *  which is what makes the history below readable a year later. */
  async function end(grant: PortalGrant): Promise<void> {
    setActing(`end:${grant.id}`);
    setError(null);
    setOutcome(null);
    const result = await api.POST("/api/v1/portal-access/grants/{grantId}/end", {
      params: { path: { grantId: grant.id } },
      body: { validTo: browserDay() },
    });
    setActing(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
    setOutcome({
      tone: "warn",
      eyebrow: "Removed",
      text:
        `${grant.contactEmail} can no longer see ${clientName}. Their login still works. ` +
        `This removed access to one company, not the account.`,
    });
  }

  /**
   * Open the panel for one contact, and ASK THE SERVER what they can see.
   *
   * Two reads, in parallel, and they answer different questions:
   *
   *   `/portal-access/memberships/{id}` — every company this login has EVER
   *   been able to see, live and closed, with each one's name. The names are
   *   only on this read: the scope route answers in ids, because it is what a
   *   session resolver consumes and not what a screen renders.
   *
   *   `…/scope?asOf=` — which of them are in force TODAY, resolved by the same
   *   code the portal's own requests are filtered by. This screen could
   *   compute it from the rows above and deliberately does not: a half-open
   *   range re-implemented in a component is a second answer to a question
   *   that must only have one, and the day it disagrees is the day somebody is
   *   offered a company they already hold or refused one they do not.
   *
   * `asOf` is the BROWSER's calendar day. A UTC server is a day behind a firm
   * in India every morning, and this value decides which grants are in force.
   */
  async function openGrant(grant: PortalGrant, node: HTMLButtonElement): Promise<void> {
    grantTriggerRef.current = node;
    setError(null);
    setOutcome(null);
    setElsewhere(null);
    setGranting(grant);
    const [held, scope] = await Promise.all([
      api.GET("/api/v1/portal-access/memberships/{membershipId}", {
        params: { path: { membershipId: grant.membershipId } },
      }),
      api.GET("/api/v1/portal-access/memberships/{membershipId}/scope", {
        params: {
          path: { membershipId: grant.membershipId },
          query: { asOf: browserDay() },
        },
      }),
    ]);
    if (held.error || scope.error) {
      setError(apiError(held.error ?? scope.error).message);
      setGranting(null);
      return;
    }
    setElsewhere({ grants: held.data.grants, inForce: scope.data.clientPartyIds });
  }

  /**
   * Grant one more company — one call, one company, one event.
   *
   * The value comes off `FormData` and not a `document.querySelector`: this
   * card holds a second form (the invite) and the client page around it holds
   * several more, and a lookup by name reads whichever the document happens to
   * hold first. That is the duplicate-id bug this repo already fixed on this
   * very page, in a new costume.
   */
  async function grantAnother(form: FormData): Promise<void> {
    const grant = granting;
    if (grant === null) return;
    const clientPartyId = String(form.get("grantCompany") ?? "");
    const company = group.find((c) => c.id === clientPartyId);
    if (company === undefined) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    const result = await api.POST("/api/v1/portal-access/memberships/{membershipId}", {
      params: { path: { membershipId: grant.membershipId } },
      // The BROWSER's day again, for the same reason: a grant starting the
      // server's "today" is not in force yet for a firm in India before 05:30.
      body: { clientPartyId, validFrom: browserDay() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    // CLOSE FIRST, then reload, then say what happened — the order every write
    // on this panel uses, so the outcome notice APPEARS as the thing it
    // describes finishes and the focus effects have a transition to watch.
    setGranting(null);
    setElsewhere(null);
    await load();
    setOutcome({
      tone: "ok",
      eyebrow: "Granted",
      // NAMES THE OTHER COMPANY. This grant was made from Cobalt Foods' page
      // and is not about Cobalt Foods; a sentence saying only "access granted"
      // would read as though it had acted on the page it was on.
      text:
        `${grant.contactEmail} can now see ${company.name} as well. They sign in with the ` +
        `same login. This added a company, not a new account.`,
    });
  }

  if (grants === null) {
    return (
      <Card>
        <CardTitle level={2}>Who at {clientName} can see this</CardTitle>
        <p className="muted">{error ?? "Loading…"}</p>
      </Card>
    );
  }

  const today = browserDay();
  const live = grants.filter((g) => g.validTo === null || g.validTo > today);
  const ended = grants.filter((g) => !(g.validTo === null || g.validTo > today));

  /**
   * What the open panel offers, derived once rather than inside the JSX.
   *
   * `inForce` is the SERVER's list for today; `queued` is a grant written to
   * start later, which this app never makes but the API accepts — and a
   * company in either state must not be on the picker, because the API refuses
   * an overlapping duplicate and a refusal is a poor way to learn that
   * somebody already has access.
   *
   * `removedOn` annotates an option the firm has taken away before. Putting
   * somebody BACK on a company they were removed from is a different decision
   * from granting a new one, and the option is the only place that fact is in
   * front of the person deciding.
   */
  const inForce = new Set(elsewhere?.inForce ?? []);
  const queued = (elsewhere?.grants ?? []).filter(
    (g) => g.validFrom > today && (g.validTo === null || g.validTo > today),
  );
  const seesToday = [...inForce]
    .map(
      (id) =>
        (elsewhere?.grants ?? []).find((g) => g.clientPartyId === id)?.clientName ?? "a company",
    )
    .sort((a, b) => a.localeCompare(b));
  const removedOn = new Map<string, string>();
  for (const g of elsewhere?.grants ?? []) {
    if (g.validTo === null || g.validTo > today) continue;
    const prev = removedOn.get(g.clientPartyId);
    if (prev === undefined || g.validTo > prev) removedOn.set(g.clientPartyId, g.validTo);
  }
  const offerable = group.filter(
    (c) => !inForce.has(c.id) && !queued.some((g) => g.clientPartyId === c.id),
  );

  return (
    <Card>
      <CardTitle level={2}>Who at {clientName} can see this</CardTitle>
      <p className="muted">
        A contact signs in to the client portal and sees this company&rsquo;s filings, documents
        and invoices, and nothing else. Access is given one company at a time. Use Give another
        company to let the same person see a group company too.
      </p>

      <ErrorNotice error={error} />
      {outcome !== null && (
        /* `tabIndex={-1}` is what makes it FOCUSABLE without adding a tab stop
           — the same half-fix the skip link needed. `Notice` already carries
           `role="status"`, so the sentence is announced whether or not focus
           lands here. */
        <div ref={outcomeRef} tabIndex={-1}>
          <Notice tone={outcome.tone} eyebrow={outcome.eyebrow}>
            <p>{outcome.text}</p>
          </Notice>
        </div>
      )}

      {live.length === 0 ? (
        <p className="muted">
          Nobody at {clientName} can see this yet.{" "}
          {canGrant
            ? "Invite their first contact below. The invitation and the access are set up together."
            : "You need permission to grant portal access to invite them."}
        </p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Status</Th>
                <Th>From</Th>
                <Th>Until</Th>
                <Th>Invited by</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {live.map((g) => (
                <tr key={g.id}>
                  <Td>
                    {g.contactDisplayName ?? g.contactEmail}
                    {g.contactDisplayName !== null && (
                      <div className="muted text-xs">{g.contactEmail}</div>
                    )}
                  </Td>
                  <Td>
                    {/* A DIFFERENT FACT FROM THE DATES, and the reason this
                        column exists at all. The grant is in force from the day
                        it was written whether or not the letter ever arrived,
                        so a contact can be fully granted and completely stuck —
                        which is the exact state the resend was built for. */}
                    {g.contactAccepted ? (
                      <Pill tone="ok">Signed in</Pill>
                    ) : (
                      <Pill tone="warn">Invited, not signed in yet</Pill>
                    )}
                  </Td>
                  <Td className="muted">{longDay(g.validFrom)}</Td>
                  {/* Half-open: the first day NOT in force. */}
                  <Td className="muted">{g.validTo === null ? "open" : longDay(g.validTo)}</Td>
                  <Td className="muted">
                    {g.grantedByDisplayName ?? g.grantedByEmail ?? "account closed"}
                  </Td>
                  <Td>
                    {canGrant && (
                      <div className="cluster">
                        {/* OFFERED ONLY WHILE THERE IS AN INVITATION LEFT.
                            Once they have a password the API refuses this, and
                            rightly: re-issuing would be the firm resetting its
                            own client's password. A button whose commonest
                            outcome is a refusal is worse than no button. */}
                        {!g.contactAccepted && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={acting === `resend:${g.id}`}
                            /* NAMED BY THE ROW. A client with four contacts
                               draws four of these and the visible word never
                               changes — and the address is the one thing about
                               the row this screen cannot edit. */
                            aria-label={`Send the invitation again to ${g.contactEmail}`}
                            onClick={() => {
                              void resend(g);
                            }}
                          >
                            Send it again
                          </Button>
                        )}
                        {/* OFFERED ONLY WHEN THERE IS A GROUP TO OFFER. A
                            client with no recorded shareholding has no other
                            company this could name, and a button that opens a
                            panel with an empty picker is worse than no button
                            — it reads as a feature that is broken rather than
                            one that has nothing to act on. */}
                        {group.length > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            /* A DISCLOSURE WHOSE REGION IS ELSEWHERE. The panel
                               opens below the whole table, not under this row,
                               so the state has to be announced — the same
                               reason the Documents versions row carries it and
                               a label-flipping toggle does not. */
                            aria-expanded={granting?.id === g.id}
                            aria-controls={granting?.id === g.id ? grantPanelId : undefined}
                            aria-label={`Give ${g.contactEmail} another of ${clientName}'s group companies`}
                            onClick={(e) => {
                              void openGrant(g, e.currentTarget);
                            }}
                          >
                            Give another company
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={acting === `end:${g.id}`}
                          aria-label={`Remove ${g.contactEmail}'s access to ${clientName}`}
                          onClick={() => {
                            void end(g);
                          }}
                        >
                          Remove access
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}


      {granting !== null && (
        /* `tabIndex={-1}` makes it focusable by script without adding a tab
           stop. Focus lands on the PANEL and not its select, so a reader hears
           the heading and the sentence about what this person can already see
           before it reaches the choice — which is the order somebody would
           read it in, and the sentence is the thing the choice depends on. */
        <div
          ref={grantPanelRef}
          tabIndex={-1}
          id={grantPanelId}
          style={{ marginTop: "var(--s-4)" }}
        >
          <form
            action={(form) => {
              void grantAnother(form);
            }}
          >
            <FieldStack>
              <CardTitle level={3}>
                Give {granting.contactDisplayName ?? granting.contactEmail} another company
              </CardTitle>

              {elsewhere === null ? (
                <p className="muted">Checking what they can already see…</p>
              ) : (
                <>
                  <p className="muted">
                    {/* THE COMPANY, NOT THE PAGE. Everything else on this card is
                        about {clientName}; this one sentence is about every
                        company the login opens onto, and it is the fact the
                        choice below depends on. */}
                    {granting.contactEmail} can see{" "}
                    {seesToday.length === 0 ? (
                      <>nothing at all today</>
                    ) : (
                      <strong>{seesToday.join(", ")}</strong>
                    )}
                    {queued.length > 0 && <> today, and {String(queued.length)} more from a later date</>}. They
                    keep the same login and password. This adds a company, not a new account.
                  </p>

                  {offerable.length === 0 ? (
                    <Notice tone="neutral" eyebrow="Nothing left to give">
                      <p>
                        Every company recorded in {clientName}&rsquo;s group is already open to{" "}
                        {granting.contactEmail}. To give access to a company that is not in this
                        group, open that company&rsquo;s own page and invite them there.
                      </p>
                    </Notice>
                  ) : (
                    /* A NAMED GROUP, because this card holds a second form. The
                       invite form below asks for an email and a name; without a
                       fieldset naming this one, two forms on one card are told
                       apart only by the order somebody happens to reach them. */
                    <fieldset
                      className="fieldset"
                      aria-label={`Another company for ${granting.contactEmail}`}
                    >
                      <Field
                        label="Which company"
                        hint={`Only companies recorded under Relationships as part of ${clientName}'s group are offered: a parent, a subsidiary or a shareholder in force today.`}
                      >
                        {/* NO PRE-SELECTED COMPANY. The first option is an empty
                            disabled placeholder, so opening this panel and
                            pressing the button cannot grant a company nobody
                            chose. A select whose default is a real value turns
                            an access decision into a default. */}
                        <Select name="grantCompany" required defaultValue="">
                          <option value="" disabled>
                            Choose a company
                          </option>
                          {offerable.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.relation})
                              {removedOn.has(c.id)
                                ? ` · access removed ${longDay(removedOn.get(c.id) ?? "")}`
                                : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </fieldset>
                  )}

                  <div className="cluster">
                    {offerable.length > 0 && (
                      <Button type="submit" loading={busy}>
                        {busy ? "Giving access…" : "Give access"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Leave ${granting.contactEmail}'s access as it is`}
                      onClick={() => {
                        setGranting(null);
                        setElsewhere(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </FieldStack>
          </form>
        </div>
      )}

      {ended.length > 0 && (
        <details style={{ marginTop: "var(--s-4)" }}>
          <summary className="muted" aria-label={`Everybody who could once see ${clientName}`}>
            {ended.length} {ended.length === 1 ? "person" : "people"} who could see this before
          </summary>
          <TableWrap>
            <Table style={{ marginTop: "var(--s-2)" }}>
              <thead>
                <tr>
                  <Th>Who</Th>
                  <Th>From</Th>
                  <Th>Until</Th>
                  <Th>Invited by</Th>
                </tr>
              </thead>
              <tbody>
                {ended.map((g) => (
                  <tr key={g.id}>
                    <Td>{g.contactDisplayName ?? g.contactEmail}</Td>
                    <Td className="muted">{longDay(g.validFrom)}</Td>
                    <Td className="muted">{g.validTo === null ? "open" : longDay(g.validTo)}</Td>
                    <Td className="muted">
                      {g.grantedByDisplayName ?? g.grantedByEmail ?? "account closed"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </details>
      )}

      {canGrant && (
        <form
          style={{ marginTop: "var(--s-5)" }}
          action={(form) => {
            void invite(form);
          }}
        >
          <FieldStack>
            <CardTitle level={3}>Invite somebody at {clientName}</CardTitle>
            <FieldRow>
              <Field
                label="Their email"
                hint="The invitation is emailed here, and this is the address they will sign in with. It cannot be changed later from this screen."
              >
                <Input name="email" type="email" required />
              </Field>
              <Field
                label="Their name (optional)"
                hint="Used only if this email address does not already have a login."
              >
                <Input name="displayName" />
              </Field>
            </FieldRow>
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {busy ? "Inviting…" : "Invite and grant access"}
              </Button>
              <p className="field-hint">
                This creates their login, gives them access to {clientName} and emails the
                invitation. They set their own password; the firm never sees it.
              </p>
            </div>
          </FieldStack>
        </form>
      )}
    </Card>
  );
}

/**
 * What one portal login can see, from the two reads that answer it.
 *
 * `grants` carries the NAMES (live and closed); `inForce` is the server's
 * resolved list of ids for today. Kept apart rather than merged because they
 * are two different facts and merging them would hide which one a screen is
 * relying on — the names are a convenience, the ids are the access.
 */
interface Elsewhere {
  readonly grants: readonly PortalGrant[];
  readonly inForce: readonly string[];
}

/**
 * The expiry, as the day it falls on HERE.
 *
 * `expiresAt` is a `timestamptz`, so `.slice(0, 10)` would print the UTC day —
 * yesterday in India until 05:30 every morning, on a value whose whole job is
 * to tell somebody when a link stops working. `instantDay` turns it into the
 * reader's own calendar day so `longDay` can print it. This is the fourth time
 * that slice has been the bug; `@/lib/day` exists to end it.
 */
function expiryDay(expiresAt: string): string {
  return longDay(instantDay(expiresAt));
}
