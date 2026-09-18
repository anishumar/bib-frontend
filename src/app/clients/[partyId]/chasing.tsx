"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ClientFreeze } from "@/lib/api/client";
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
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  useSwapFocus,
} from "@/components/ui";
import { browserDay, longDay } from "@/lib/day";

/**
 * REMINDERS TO THIS CLIENT, and the firm's decision to stop them (T4.4).
 *
 * ## What a freeze actually stops, because the name does not say
 *
 * "Freeze the client" reads like stopping work, and this one is nothing of the
 * sort. It stops the OUTWARD reminder ladder and only that. Read from the
 * module rather than inferred from the word, because a partner who freezes a
 * client believing it halts invoicing has been misled by a screen:
 *
 * - **What is chased** is an open ASK — something the firm asked this client
 *   for, raised from a task's "What we are waiting on the client for" panel.
 *   Not an invoice, not a filing.
 * - **A chase raises a reminder in the client's own portal.** Nothing is
 *   emailed: `ChaserService` holds no mailer at all, deliberately, because
 *   there is no configured channel yet and a stub that logged "sent" would be
 *   a lie in an operator's log.
 * - **Work, invoicing and the portal are untouched.** The client signs in, sees
 *   everything they saw yesterday, and can still answer.
 * - **The firm goes on hearing about its own late work**, through the
 *   escalation ladder, which is a different ladder pointing inward. The API's
 *   own words: a dispute is the worst possible moment to go blind to that.
 *
 * The panel says all of that in the card's lede, and names the firm's actual
 * rungs rather than describing them in the abstract — the cadence is a config
 * entry, so "after 3, 7 and 15 days" is read, not written down here.
 *
 * ## Two half-open dates and a required reason
 *
 * `validTo` is the FIRST DAY NOT FROZEN, the same convention as every other
 * effective-dated row in this product. Lifting defaults to TODAY, so pressing
 * the button means the next sweep chases rather than midnight doing it.
 *
 * The reason is required by the API and the requirement is a good one: "why is
 * this client not being chased" gets asked months later by somebody who did not
 * set it, and a freeze with no reason cannot be told apart from one nobody
 * remembered to lift. It is deliberately NOT in the ledger — it is a partner's
 * words about a client, and that log cannot be erased — which is why this
 * panel's history is the only place it is ever readable.
 *
 * ## Who may
 *
 * Reading the history is `party:read`; freezing and lifting are `tenant:admin`.
 * That asymmetry is the API's and it is right — anybody looking at a client
 * should be able to see why nothing is going out, and stopping the firm's own
 * chasing is a partner's call.
 */
export function ChasingPanel({
  partyId,
  clientName,
  canFreeze,
  rungs,
}: {
  partyId: string;
  clientName: string;
  /** `tenant:admin`. Decides what is OFFERED — the API's refusal is what is
   *  shown if one arrives anyway. */
  canFreeze: boolean;
  /**
   * The firm's published reminder cadence, in days. Empty means the firm has
   * published no ladder at all, and that is a REAL and shipped state: with no
   * rungs the sweep chases nobody, so freezing a client changes nothing. The
   * panel says so rather than offering a switch with nothing behind it.
   */
  rungs: readonly { key: string; label: string; afterDays: number }[];
}) {
  const [freezes, setFreezes] = useState<ClientFreeze[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  /** What the last write did, in words — and its own eyebrow rather than one
   *  derived from the tone. Freezing and lifting are opposite acts and a tone
   *  cannot tell them apart. */
  const [outcome, setOutcome] = useState<{
    tone: "ok" | "warn";
    eyebrow: string;
    text: string;
  } | null>(null);

  /** The form REPLACES the button that opened it — the exact shape
   *  `useSwapFocus` exists for. */
  const { panel: formRef, trigger: openRef } = useSwapFocus(opening);
  /** And the outcome notice replaces the row that was acted on, which is the
   *  third shape: there is no button to hand focus back to, so `trigger` is
   *  deliberately unattached. */
  const { panel: outcomeRef } = useSwapFocus(outcome !== null);
  /**
   * FREEZING HAS NO OUTCOME SENTENCE, so the notice that appears is what takes
   * focus.
   *
   * "Stop the reminders" unmounts itself by succeeding — the form is replaced
   * by the standing-state notice — so focus lands on `<body>` and this hands it
   * to the thing that replaced it. The same condition as everywhere else:
   * `useSwapFocus` acts only when focus was actually lost, so a mouse user who
   * clicked into another card keeps it.
   */
  const { panel: liveRef } = useSwapFocus(freezes !== null && liveFreeze(freezes) !== undefined);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/clients/{partyId}/freezes", {
      params: { path: { partyId } },
    });
    if (result.error) {
      // A 403 is ordinary rather than broken — see the permission note above.
      setFreezes([]);
      setError(result.response.status === 403 ? null : apiError(result.error).message);
      return;
    }
    setFreezes(result.data);
    setError(null);
  }, [partyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function freeze(form: FormData): Promise<void> {
    const reason = String(form.get("freezeReason") ?? "").trim();
    const until = String(form.get("freezeUntil") ?? "").trim();
    setBusy(true);
    setError(null);
    setOutcome(null);
    const result = await api.POST("/api/v1/clients/{partyId}/freezes", {
      params: { path: { partyId } },
      body: {
        // The BROWSER's calendar day. A UTC server is a day behind a firm in
        // India every morning, and this value decides whether the sweep that
        // runs tonight treats the client as frozen.
        validFrom: String(form.get("freezeFrom")),
        reason,
        ...(until === "" ? {} : { validTo: until }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    // Close, reload, then say what happened — the order that gives the focus
    // effects a transition to watch, and the order every write in this repo's
    // panels now uses.
    setOpening(false);
    await load();
    // NO OUTCOME SENTENCE HERE — see `liveRef` above. The notice that appears
    // says it better and says more.
  }

  async function lift(freezeId: string): Promise<void> {
    setBusy(true);
    setError(null);
    setOutcome(null);
    const result = await api.POST("/api/v1/freezes/{freezeId}/lift", {
      params: { path: { freezeId } },
      // TODAY, in the reader's own calendar. The API defaults to its own day if
      // this is absent, which is a day behind a firm in India every morning —
      // and on this value that means one more day of not chasing after somebody
      // pressed the button that says chase again.
      body: { on: browserDay() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
    setOutcome({
      tone: "ok",
      eyebrow: "Chasing again",
      text:
        `Anything ${clientName} still owes an answer on is being reminded again, from today. ` +
        `A reminder that already went out is not sent twice.`,
    });
  }

  if (freezes === null) {
    return (
      <Card>
        <CardTitle level={2}>Reminders to this client</CardTitle>
        <p className="muted">{error ?? "Loading…"}</p>
      </Card>
    );
  }

  const today = browserDay();
  // Half-open: `validTo` is the first day NOT frozen, so one ending today is
  // already over. The API refuses more than one in force at a time, so this is
  // at most one row — but it is derived rather than assumed, because a screen
  // that took `[0]` would be silently wrong the day that changes.
  const live = liveFreeze(freezes);
  const over = freezes.filter((f) => !inForceToday(f));

  return (
    <Card>
      <CardTitle level={2}>Reminders to this client</CardTitle>
      <p className="muted">
        When {clientName} owes the firm an answer or a document, they are reminded
        {rungs.length === 0 ? (
          <>
            {" "}
            automatically once the firm publishes a reminder ladder. None is published yet, so
            nobody is being chased, and stopping reminders here would change nothing.
          </>
        ) : (
          <>
            {": "}
            {rungs.map((r, i) => (
              <span key={r.key}>
                {i > 0 ? (i === rungs.length - 1 ? " and " : ", ") : ""}
                {r.label.toLowerCase()} after {r.afterDays}{" "}
                {r.afterDays === 1 ? "day" : "days"}
              </span>
            ))}
            . The reminder appears in their client portal. Nothing is emailed yet.
          </>
        )}
      </p>
      {/* WHAT A FREEZE DOES NOT DO, above the control that sets one. The same
          shape /admin/verification uses for maker≠checker: the consequence is
          stated before the button, because "freeze the client" reads like
          stopping work and it is nothing of the sort. */}
      <p className="muted">
        Stopping reminders stops <strong>only</strong> the reminders. Work and invoices carry on,
        {clientName} keeps their portal access and can still reply, and your own team is still
        alerted about late work through the escalation ladder.
      </p>

      <ErrorNotice error={error} />
      {outcome !== null && (
        <div ref={outcomeRef} tabIndex={-1}>
          <Notice tone={outcome.tone} eyebrow={outcome.eyebrow}>
            <p>{outcome.text}</p>
          </Notice>
        </div>
      )}

      {live === undefined ? (
        <>
          <p className="muted">
            Reminders are going out as normal.
            {!canFreeze && " Only a firm administrator can stop them."}
          </p>
          {canFreeze &&
            (opening ? (
              <div ref={formRef} tabIndex={-1}>
                <form
                  action={(form) => {
                    void freeze(form);
                  }}
                >
                  {/* A NAMED GROUP WITH NO LEGEND. This page carries several
                      forms and two of them already ask for a date called
                      "From"; without a name here there would be a third. */}
                  <fieldset className="fieldset" aria-label="Stop chasing this client">
                    <FieldStack>
                      <CardTitle level={3}>Stop chasing {clientName}</CardTitle>
                      <Field
                        label="Why"
                        hint="Required. Write it so that somebody reading this months later understands why this client was not chased. The reason is shown here only, not in the audit trail."
                      >
                        <Textarea name="freezeReason" rows={3} required />
                      </Field>
                      <FieldRow>
                        <Field
                          label="First day frozen"
                          hint="Today, unless the decision was made earlier and you are recording it now."
                        >
                          <Input
                            type="date"
                            name="freezeFrom"
                            defaultValue={today}
                            required
                          />
                        </Field>
                        <Field
                          label="Until (optional)"
                          hint="The first day reminders start again (not the last day they are stopped). Leave it empty to keep them stopped until somebody lifts it."
                        >
                          <Input type="date" name="freezeUntil" />
                        </Field>
                      </FieldRow>
                      <div className="cluster">
                        <Button type="submit" variant="destructive-quiet" loading={busy}>
                          {busy ? "Stopping…" : "Stop the reminders"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setOpening(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </FieldStack>
                  </fieldset>
                </form>
              </div>
            ) : (
              <div className="cluster">
                <Button
                  ref={openRef}
                  variant="secondary"
                  onClick={() => {
                    setOpening(true);
                  }}
                >
                  Stop chasing this client
                </Button>
              </div>
            ))}
        </>
      ) : (
        /* `tabIndex={-1}` makes it focusable by script without adding a tab
           stop — the same half-fix the skip link needed. `Notice` already
           carries `role="status"`, so the sentence is announced whether or not
           focus lands here. */
        <div ref={liveRef} tabIndex={-1}>
        <Notice tone="warn" eyebrow="Not being chased">
          <p>
            Reminders to {clientName} have been stopped since {longDay(live.validFrom)}
            {live.validTo === null ? "" : `, and start again on ${longDay(live.validTo)}`}.{" "}
            {live.setByName === null
              ? "The person who decided it no longer has an account."
              : `${live.setByName} decided it.`}
          </p>
          {/* THE REASON, VERBATIM AND UNDECORATED. It is somebody's sentence
              about a client and the only copy of it — quoting it is the whole
              value of this panel to the person reading it six months later. */}
          <p>
            <em>{live.reason}</em>
          </p>
          {canFreeze && (
            <div className="cluster">
              <Button
                loading={busy}
                aria-label={`Start chasing ${clientName} again, from today`}
                onClick={() => {
                  void lift(live.freezeId);
                }}
              >
                Start chasing again
              </Button>
            </div>
          )}
        </Notice>
        </div>
      )}

      {over.length > 0 && (
        <details style={{ marginTop: "var(--s-4)" }}>
          <summary
            className="muted"
            aria-label={`Every earlier time ${clientName} was not being chased`}
          >
            {over.length} earlier {over.length === 1 ? "freeze" : "freezes"}
          </summary>
          <TableWrap>
            <Table style={{ marginTop: "var(--s-2)" }}>
              <thead>
                <tr>
                  <Th>From</Th>
                  <Th>Until</Th>
                  <Th>Why</Th>
                  <Th>Stopped by</Th>
                  <Th>Lifted by</Th>
                </tr>
              </thead>
              <tbody>
                {over.map((f) => (
                  <tr key={f.freezeId}>
                    <Td className="muted">{longDay(f.validFrom)}</Td>
                    {/* HALF-OPEN, so this is the day chasing RESUMED — and when
                        it equals the day it started, the freeze was in force on
                        no day at all. That is a real record rather than a broken
                        row (the API documents it), and it is the commonest one
                        after somebody stops and restarts on an afternoon. Two
                        identical dates in two columns reads as a freeze that
                        lasted a day, which is the opposite of what happened. */}
                    <Td className="muted">
                      {f.validTo === null
                        ? "open"
                        : f.validTo === f.validFrom
                          ? "lifted the same day"
                          : longDay(f.validTo)}
                    </Td>
                    <Td>{f.reason}</Td>
                    <Td className="muted">{f.setByName ?? "account closed"}</Td>
                    <Td className="muted">{f.liftedByName ?? "account closed"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </details>
      )}
    </Card>
  );
}

/**
 * Half-open, on the READER's calendar day: `validTo` is the first day NOT
 * frozen, so a freeze ending today is already over.
 *
 * Module-level so the focus hook and the render read the same definition. It
 * was written twice inside the component for one commit, which is one edit away
 * from a screen whose notice and whose history disagree about the same row.
 */
function inForceToday(f: ClientFreeze): boolean {
  const today = browserDay();
  return f.validTo === null || f.validTo > today;
}

function liveFreeze(freezes: readonly ClientFreeze[]): ClientFreeze | undefined {
  return freezes.find(inForceToday);
}
