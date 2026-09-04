"use client";

/**
 * The client portal's ACTION CENTRE (T6.6) — the only part of this product a
 * client can act on.
 *
 * ── WHY IT SITS ABOVE "HELD UP", WHICH USED TO BE FIRST ──────────────────
 *
 * T6.5 put "Held up" at the top because it was the only section a reader could
 * do anything about, and it was doing that job badly: `blocked_reason` is a note
 * the firm's own team wrote to itself, and it reads *"the client has not sent
 * the register"* as readily as *"the GST portal is down"*. A client could tell
 * which was which only by reading carefully, and had nowhere to reply either
 * way.
 *
 * These rows are different. Somebody at the firm addressed each one to this
 * client deliberately, and each carries the control that answers it. So this
 * goes first and "Held up" stays where it is, still honest about being the
 * firm's own words — the two are different facts and the firm may be waiting on
 * more than one thing at a time.
 *
 * ── THREE KINDS, THREE CONTROLS, AND A FOURTH THING THEY ALL DO ─────────
 *
 * `document` draws a file picker, `question` a text box, `approval` two buttons
 * — and EVERY one of them also offers the text box, because "we hold none, the
 * shop closed in 2019" is a real and useful answer to a request for a document
 * and the API accepts it. Making the honest answer unsayable would send it to
 * email, which is where all of this was before.
 *
 * ── WHAT IT OFFERS IS DECIDED BY A PERMISSION; WHAT IT SHOWS IS NOT ─────
 *
 * `portal:respond` is the permission, and a contact without it — `client_viewer`
 * — sees every ask and is offered no control. That is the whole difference
 * between the two portal roles, and the reason reading is NOT behind a
 * permission: being granted a company is the authorisation to read it.
 *
 * The check here decides what to OFFER. The API's refusal is what gets shown if
 * one arrives anyway.
 *
 * ── AND SINCE T6.7 IT SAYS WHEN THEY WERE LAST REMINDED ─────────────────
 *
 * `delivery.client_ask_chase` (0065) recorded every rung of the outward ladder
 * from the day it was written and NOTHING rendered any of it — the sixth
 * registered thing in this codebase found with a writer and no reader.
 *
 * It is a DATE and not a count, and that is a decision about tone rather than a
 * rendering detail (Shrestha, 2026-09-01). *"We have reminded you 4 times"* is
 * an accusation printed on somebody's own page, and on a daily rung it reads
 * "9 times" within a fortnight. What a client can act on is WHEN — "you last
 * heard from us on the 12th" tells them whether they missed a message. The
 * COUNT is not lost: the firm's own screen carries every rung, which is where
 * "we asked you four times" is a sentence that needs evidence behind it.
 *
 * NULL is ordinary and is drawn as nothing at all. A firm that has published no
 * chaser ladder chases nobody, which is the shipped state.
 *
 * ── AND THE FILE IS NOT SCANNED, WHICH IS SAID RATHER THAN IMPLIED ──────
 *
 * There is no virus scanner in this product. The upload control says so, in one
 * line, because a client sending their books somewhere is entitled to know what
 * happens to them — and because a page that quietly implied otherwise would be
 * the lie the backend refused to write as a `scan()` returning "clean".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalActionCentre, PortalAsk, PortalAskResponse } from "@/lib/api/client";
import { Button, Field, Notice as UiNotice, Textarea } from "@/components/ui";
import { Card, Pill, Section } from "@/components/tw";
import { usePortalSession } from "./portal-frame";
import { longInstant } from "@/lib/day";

/** What the firm wants, in one word, above the prompt. */
const KIND_LABEL: Record<string, string> = {
  document: "A document",
  question: "A question",
  approval: "Your approval",
};

export function ActionCentre({ asOf, onChanged }: { asOf: string; onChanged?: () => void }) {
  const session = usePortalSession();
  const [centre, setCentre] = useState<PortalActionCentre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // A PERMISSION DECIDES WHAT TO OFFER. `/auth/me` reports what this contact
  // actually holds — which, since T6.6, is a real answer for a portal session
  // rather than a blanket empty.
  const mayRespond = session?.permissions.includes("portal:respond") ?? false;

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/portal/asks", {
      // The BROWSER's own calendar day, for the same reason the status home
      // sends it: it decides which grants are in force, and a UTC server is a
      // day behind a firm in India every morning.
      params: { query: { asOf } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setCentre(result.data);
    setError(null);
    setLoaded(true);
  }, [asOf]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function refresh(): Promise<void> {
    await load();
    onChanged?.();
  }

  if (!loaded) return null;
  if (centre === null) {
    return error === null ? null : (
      <UiNotice tone="warn" eyebrow="Could not load what is waiting on you">
        <p>{error}</p>
      </UiNotice>
    );
  }

  const nothing = centre.awaitingYou.length === 0 && centre.withTheFirm.length === 0;
  if (nothing) return null;

  return (
    <>
      {/* `level={2}` on both sections below: since these moved off the status
          home onto `/portal/requests` they ARE that page's top-level structure,
          and a card inside one ranks `h3`. The portal's outline was measured
          INVERTED before this — h3 sections wrapping h2 cards — and a screen
          reader's heading list is how somebody who cannot see the layout
          navigates a page. */}
      {centre.awaitingYou.length > 0 && (
        <Section
          title="Waiting on you"
          level={2}
          count={centre.awaitingYou.length}
          lede={
            mayRespond
              ? "Each of these is a request somebody wrote to you. Answer it here and it goes straight onto the job it belongs to."
              : "Your login can read everything here but cannot reply. Ask your contact at the firm to give this address permission to respond, or reply from a colleague's login."
          }
        >
          <div className="flex flex-col gap-3">
            {centre.awaitingYou.map((ask) => (
              <AskCard key={ask.askId} ask={ask} mayRespond={mayRespond} onDone={refresh} />
            ))}
          </div>
        </Section>
      )}

      {/* SENT, AND NOT FINISHED WITH. It stays visible because a client's reply
          does not close an ask — the firm looks at what arrived and decides. A
          list that removed an ask the moment it was answered would leave a
          client who sent the wrong file with no way to see what they sent. */}
      {centre.withTheFirm.length > 0 && (
        <Section
          title="Sent — with the firm"
          level={2}
          count={centre.withTheFirm.length}
          lede={
            <>
              {/* THE SECOND HALF OF THIS SENTENCE IS A PROMISE, so it is only
                  made to somebody who can keep it. The walk found a read-only
                  contact being told they could "still send another" beside a
                  card with no controls on it at all — and, because all their
                  asks were answered, that was the only sentence about them on
                  the page. */}
              You have answered these. They stay here until the firm confirms it has what it
              needs
              {mayRespond
                ? " — if you sent the wrong thing, you can still send another."
                : ". Your login can read them but cannot reply."}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {centre.withTheFirm.map((ask) => (
              <AskCard key={ask.askId} ask={ask} mayRespond={mayRespond} onDone={refresh} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function AskCard({
  ask,
  mayRespond,
  onDone,
}: {
  ask: PortalAsk;
  mayRespond: boolean;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(send: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await send();
    setBusy(false);
    if (result.error) {
      // THE API'S REFUSAL IS WHAT GETS SHOWN. The permission check above decides
      // what to offer; this is what happens when the server disagrees anyway.
      setError(apiError(result.error).message);
      return;
    }
    setNote("");
    if (fileInput.current) fileInput.current.value = "";
    await onDone();
  }

  const answer = () =>
    run(() =>
      api.POST("/api/v1/portal/asks/{askId}/answer", {
        params: { path: { askId: ask.askId } },
        body: { answerText: note },
      }),
    );

  const decide = (decision: "approved" | "declined") =>
    run(() =>
      api.POST("/api/v1/portal/asks/{askId}/decision", {
        params: { path: { askId: ask.askId } },
        body: { decision, note: note.trim().length === 0 ? null : note },
      }),
    );

  const upload = () => {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    const payload = new FormData();
    payload.set("file", file);
    if (note.trim().length > 0) payload.set("note", note);
    return run(() =>
      api.POST("/api/v1/portal/asks/{askId}/documents", {
        params: { path: { askId: ask.askId } },
        body: payload as unknown as never,
        bodySerializer: (b: unknown) => b as FormData,
      }),
    );
  };

  return (
    <Card className="p-4">
      {/* Title and state on ONE row. The pill on its own line under the
          heading cost a line in every card on the page a client actually has
          to work through. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-md font-semibold text-ink">
          {KIND_LABEL[ask.askKind] ?? "A request"}
        </h3>
        <Pill tone={ask.status === "open" ? "warn" : "neutral"}>
          {ask.status === "open" ? "Waiting on you" : "Sent"}
        </Pill>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        {/* THE FIRM'S OWN WORDS, VERBATIM, under a line saying whose they are —
            the same treatment `blocked_reason` gets, for the same reason. */}
        <p>{ask.prompt}</p>
        <p className="muted">
          {ask.companyName ?? "About your account"} · {ask.workItemTitle} · asked{" "}
          {longInstant(ask.raisedAt)}
          {/* WHEN, NOT HOW MANY — see the header. Only drawn when there is one:
              an ask nobody has chased says nothing rather than "never
              reminded", which would read as a reproach about the firm. */}
          {ask.lastRemindedAt !== null && (
            <> · last reminded {longInstant(ask.lastRemindedAt)}</>
          )}
        </p>

        {ask.responses.length > 0 && (
          <div className="flex flex-col gap-2">
            {ask.responses.map((r) => (
              <SentLine key={r.responseId} response={r} />
            ))}
          </div>
        )}

        {error !== null && (
          <UiNotice tone="danger" eyebrow="That did not go through">
            <p>{error}</p>
          </UiNotice>
        )}

        {mayRespond && (
          <div className="flex flex-col gap-3">
            {ask.askKind === "document" && (
              <>
                <Field label="The file" hint="Nothing is scanned before it reaches the firm.">
                  <input ref={fileInput} type="file" name="file" />
                </Field>
                <Field
                  label="Anything to say about it (optional)"
                  hint="Or answer in words instead — 'we hold none' is a real answer."
                >
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div className="cluster">
                  <Button onClick={() => void upload()} disabled={busy}>
                    Send the file
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void answer()}
                    disabled={busy || note.trim().length === 0}
                  >
                    Answer in words instead
                  </Button>
                </div>
              </>
            )}

            {ask.askKind === "question" && (
              <>
                <Field label="Your answer">
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="cluster">
                  <Button
                    onClick={() => void answer()}
                    disabled={busy || note.trim().length === 0}
                  >
                    Send
                  </Button>
                </div>
              </>
            )}

            {ask.askKind === "approval" && (
              <>
                <Field label="Why, if you want to say (optional)">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="cluster">
                  <Button onClick={() => void decide("approved")} disabled={busy}>
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void decide("declined")}
                    disabled={busy}
                  >
                    Decline
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** What was already sent, so a client can see it arrived — and see WHICH of
 *  their own people sent it. Nobody at the firm is named anywhere here. */
function SentLine({ response }: { response: PortalAskResponse }) {
  const who = response.respondedByName ?? "Somebody at your company";
  const what =
    response.document !== null
      ? `sent ${response.document.filename}`
      : response.decision !== null
        ? response.decision === "approved"
          ? "approved this"
          : "declined this"
        : "replied";
  return (
    <div className="muted">
      <strong>
        {who} {what}
      </strong>{" "}
      · {longInstant(response.respondedAt)}
      {response.answerText !== null && <div>{response.answerText}</div>}
    </div>
  );
}

/** "03 Sep 2026" from an ISO instant — `longInstant` from `@/lib/day`, the one
 *  date format this product prints. Never with a time: an ask has no deadline
 *  and the hour it was raised is not something a client needs. */
