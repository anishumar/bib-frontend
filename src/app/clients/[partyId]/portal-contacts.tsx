"use client";

import { useCallback, useEffect, useState } from "react";
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
  Table,
  TableWrap,
  Td,
  Th,
  useSwapFocus,
} from "@/components/ui";
import { browserDay, longDay, instantDay } from "@/lib/day";

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
 * ## One client per grant, on purpose
 *
 * A contact who should see four of a group's companies is invited once and
 * granted three more times, one visible decision each — access is never derived
 * from a group relationship. So this panel invites and grants THIS client, and
 * says so; the other three are granted from the other three pages.
 */
export function PortalContactsPanel({
  partyId,
  clientName,
  canGrant,
}: {
  partyId: string;
  clientName: string;
  /** `portal:grant`. Decides what is OFFERED — the API's refusal is what is
   *  shown if one arrives anyway. */
  canGrant: boolean;
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
  /** What the last write did, in words. A resend is otherwise invisible: the
   *  row it acts on does not change, so without this the button would look like
   *  it had done nothing at all. */
  const [outcome, setOutcome] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

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
      text:
        `${grant.contactEmail} can no longer see ${clientName}. Their login still works — ` +
        `this removed one company, not the account.`,
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

  return (
    <Card>
      <CardTitle level={2}>Who at {clientName} can see this</CardTitle>
      <p className="muted">
        A contact signs in to the client portal and sees this company&rsquo;s filings, documents
        and invoices — nothing else, and nobody at the firm by name. Access is granted one
        company at a time: somebody who should also see a sister company is granted it on that
        company&rsquo;s own page.
      </p>

      <ErrorNotice error={error} />
      {outcome !== null && (
        /* `tabIndex={-1}` is what makes it FOCUSABLE without adding a tab stop
           — the same half-fix the skip link needed. `Notice` already carries
           `role="status"`, so the sentence is announced whether or not focus
           lands here. */
        <div ref={outcomeRef} tabIndex={-1}>
          <Notice tone={outcome.tone} eyebrow={outcome.tone === "ok" ? "Sent" : "Removed"}>
            <p>{outcome.text}</p>
          </Notice>
        </div>
      )}

      {live.length === 0 ? (
        <p className="muted">
          Nobody at {clientName} can see this yet.{" "}
          {canGrant
            ? "Invite their first contact below — the invitation and the access are one act, so there is no state where somebody signs in to an empty portal."
            : "Inviting a client's own people needs permission to grant portal access."}
        </p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Got in?</Th>
                <Th>From</Th>
                <Th>Until</Th>
                <Th>Let in by</Th>
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
                      <Pill tone="warn">Invited, not yet in</Pill>
                    )}
                  </Td>
                  <Td className="muted">{longDay(g.validFrom)}</Td>
                  {/* Half-open: the first day NOT in force. */}
                  <Td className="muted">{g.validTo === null ? "open" : longDay(g.validTo)}</Td>
                  <Td className="muted">
                    {g.grantedByDisplayName ?? g.grantedByEmail ?? "— account closed"}
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
                  <Th>Let in by</Th>
                </tr>
              </thead>
              <tbody>
                {ended.map((g) => (
                  <tr key={g.id}>
                    <Td>{g.contactDisplayName ?? g.contactEmail}</Td>
                    <Td className="muted">{longDay(g.validFrom)}</Td>
                    <Td className="muted">{g.validTo === null ? "open" : longDay(g.validTo)}</Td>
                    <Td className="muted">
                      {g.grantedByDisplayName ?? g.grantedByEmail ?? "— account closed"}
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
                hint="The letter goes here, and it is the address they sign in with. It cannot be changed afterwards from this screen."
              >
                <Input name="email" type="email" required />
              </Field>
              <Field
                label="Their name (optional)"
                hint="Applied only if this address is new to the product. One firm inviting somebody is not grounds for renaming them at another."
              >
                <Input name="displayName" />
              </Field>
            </FieldRow>
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {busy ? "Inviting…" : "Invite and grant access"}
              </Button>
              <p className="field-hint">
                One act: the login, the access to {clientName}, and the letter. The firm never
                sees the link and never holds their password — they set it themselves.
              </p>
            </div>
          </FieldStack>
        </form>
      )}
    </Card>
  );
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
