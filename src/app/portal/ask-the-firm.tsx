"use client";

/**
 * ASK THE FIRM (T6.8) — the first thing on this portal a client can START.
 *
 * ── WHY IT IS HERE AND NOT A FIFTH LINK IN THE RAIL ─────────────────────
 *
 * T6.7 settled the shape of the portal's frame: four flat links, and a fifth
 * has to displace one of the four or admit it is the firm's convenience. This
 * is not a fifth screen — it is the other half of what the action centre
 * already is. That section is *what the firm is waiting on you for*; this is
 * *what you are waiting on the firm for*, and putting them on one page is what
 * makes "what is outstanding between us" a single answer rather than two.
 *
 * ── THE SPLIT IS NOT THE ACTION CENTRE's, AND THAT IS DELIBERATE ────────
 *
 * An ask is sorted by whether it still wants something FROM the client. A
 * request the client raised never does, so it sorts on whether the firm has
 * come back: `awaitingFirm`, then `replied`. `settled` is on this surface at
 * all — unlike a closed ask, which is not — because *"did I already ask for
 * this"* is the question that stops the second phone call, and a client's own
 * history is short.
 *
 * ── WHAT IT OFFERS IS A PERMISSION; WHAT IT SHOWS IS NOT ────────────────
 *
 * `portal:request` is the SECOND permission a portal session can hold, and it
 * is not a widening of `portal:respond`: everything that one covers is a reply
 * to something the firm raised. A firm may want the clerk who sends the
 * registers every month to go on sending them and not to open requests, so the
 * two are separate and a `client_viewer` holds neither.
 *
 * The check here decides what to OFFER. The API's refusal is what gets shown if
 * one arrives anyway.
 *
 * ── AND NOBODY AT THE FIRM IS NAMED ON THE THREAD ───────────────────────
 *
 * `authorName` comes back NULL on every reply the firm wrote — the API does
 * that, not this component — so the thread reads "10x Global" against their
 * side and the client's own colleague's name against theirs. T6.5's rule: whose
 * desk the work is on is the firm's business, and a name here invites chasing a
 * junior directly.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalRequest, PortalRequestReply, PortalRequests } from "@/lib/api/client";
import {
  Button,
  Field,
  Input,
  ErrorNotice,
  Notice as UiNotice,
  Select,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { Card, Pill, Section } from "@/components/tw";
import { usePortalSession } from "./portal-frame";
import { longInstant } from "@/lib/day";

interface Company {
  readonly clientPartyId: string;
  readonly clientName: string;
}

export function AskTheFirm({
  asOf,
  companies,
  firm,
}: {
  asOf: string;
  readonly companies: readonly Company[];
  firm: string;
}) {
  const session = usePortalSession();
  const mayRequest = session?.permissions.includes("portal:request") ?? false;

  const [requests, setRequests] = useState<PortalRequests | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [composing, setComposing] = useState(false);
  const { panel: composePanel, trigger: composeTrigger } = useSwapFocus(composing);

  const load = useCallback(async (): Promise<void> => {
    // The BROWSER's own calendar day, for the reason the status home sends it:
    // it decides which grants are in force, and a UTC server is a day behind a
    // firm in India every morning.
    const result = await api.GET("/api/v1/portal/requests", { params: { query: { asOf } } });
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setRequests(result.data);
    setError(null);
    setLoaded(true);
  }, [asOf]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return null;
  if (requests === null) {
    return error === null ? null : (
      <UiNotice tone="warn" eyebrow="Could not load what you have asked for">
        <p>{error}</p>
      </UiNotice>
    );
  }

  const live = [...requests.awaitingFirm, ...requests.replied];

  return (
    <Section
      title="Ask the firm"
      level={2}
      lede={
        mayRequest
          ? `Anything you need from ${firm}: a document you cannot find, a copy of something, a correction, or a call. It goes straight to their team.`
          : `Your login can read everything here but cannot open a request. Ask your contact at ${firm} to give this address permission, or ask from a colleague's login.`
      }
    >
      <div className="flex flex-col gap-3">

        {/* THE BUTTON UNMOUNTS ITSELF, so focus has to be carried across.
            Measured on this very screen: pressing Enter on "Ask for
            something" left focus on <body>, and the next Tab started at the
            top of the portal. This is the CLIENT half of the product, where
            somebody who does not use the firm's software every day is the one
            being asked to find their way back. See `useSwapFocus`. */}
        {mayRequest && !composing && (
          <div className="cluster">
            <Button ref={composeTrigger} onClick={() => setComposing(true)}>
              Ask for something
            </Button>
          </div>
        )}

        {mayRequest && composing && (
          <div ref={composePanel} tabIndex={-1}>
          <NewRequest
            companies={companies}
            asOf={asOf}
            onDone={() => {
              setComposing(false);
              void load();
            }}
            onCancel={() => setComposing(false)}
          />
          </div>
        )}

        {live.length === 0 && requests.settled.length === 0 && (
          <p className="text-sm text-muted">You have not asked {firm} for anything through this page yet.</p>
        )}

        {live.map((request) => (
          <RequestCard
            key={request.requestId}
            request={request}
            firm={firm}
            asOf={asOf}
            mayRequest={mayRequest}
            onChanged={load}
          />
        ))}

        {/* FINISHED, AND STILL HERE. A closed ask leaves the action centre
            because the firm is done asking; a request the client raised stays,
            because the question it answers — "did I already ask for this" — is
            asked precisely about the ones that are over. */}
        {requests.settled.length > 0 && (
          <>
            <p className="text-sm text-muted">Finished</p>
            {requests.settled.map((request) => (
              <RequestCard
                key={request.requestId}
                request={request}
                firm={firm}
                asOf={asOf}
                mayRequest={mayRequest}
                onChanged={load}
              />
            ))}
          </>
        )}
      </div>
    </Section>
  );
}

function NewRequest({
  companies,
  asOf,
  onDone,
  onCancel,
}: {
  readonly companies: readonly Company[];
  asOf: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [company, setCompany] = useState(companies[0]?.clientPartyId ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/portal/requests", {
      params: { query: { asOf } },
      body: { clientPartyId: company, subject: subject.trim(), body: body.trim() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  const ready = subject.trim().length > 0 && body.trim().length > 0 && company !== "";

  return (
    <Card>
      <div className="flex flex-col gap-2">
        {/* ONE COMPANY NEEDS NO PICKER. The threshold `/portal/documents` used
            for its search box, applied to a control rather than a filter: a
            select with one option is a decision the reader is being asked to
            take and has no way to get wrong. The value still goes up on the
            write, because the API requires it and the database refuses any
            company this login was not granted. */}
        {companies.length > 1 && (
          <Field label="Which company">
            <Select value={company} onChange={(e) => setCompany(e.target.value)}>
              {companies.map((c) => (
                <option key={c.clientPartyId} value={c.clientPartyId}>
                  {c.clientName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="What you need, in one line">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Last year's balance sheet"
          />
        </Field>

        <Field
          label="And the detail"
          hint="What it is for, which year, anything that saves a phone call."
        >
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <ErrorNotice error={error} eyebrow="That did not go through" />

        <div className="cluster">
          <Button onClick={() => void send()} disabled={busy || !ready}>
            Send it
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RequestCard({
  request,
  firm,
  asOf,
  mayRequest,
  onChanged,
}: {
  request: PortalRequest;
  firm: string;
  asOf: string;
  mayRequest: boolean;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = request.status === "open" || request.status === "answered";

  async function act(path: "replies" | "withdraw"): Promise<void> {
    setBusy(true);
    setError(null);
    const result =
      path === "replies"
        ? await api.POST("/api/v1/portal/requests/{requestId}/replies", {
            params: { path: { requestId: request.requestId }, query: { asOf } },
            body: { body: note.trim() },
          })
        : await api.POST("/api/v1/portal/requests/{requestId}/withdraw", {
            params: { path: { requestId: request.requestId }, query: { asOf } },
          });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setNote("");
    await onChanged();
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-md font-semibold text-ink">{request.subject}</h3>
        <Pill tone={toneOf(request.status)}>{statusLabel(request.status, firm)}</Pill>
      </div>
      <div className="flex flex-col gap-2">
        <p>{request.body}</p>
        <p className="text-sm text-muted">
          {request.companyName !== null && <>{request.companyName} · </>}
          asked {longInstant(request.raisedAt)}
          {/* A DATE AND NOT A COUNT, on both surfaces and for two different
              reasons. On an ask it is because a tally is an accusation; here it
              is simply the only part of the thread worth repeating at the top —
              the whole conversation is directly below. */}
          {request.lastRepliedAt !== null && <> · {firm} replied {longInstant(request.lastRepliedAt)}</>}
        </p>

        {request.replies.length > 0 && (
          <div className="flex flex-col gap-2">
            {request.replies.map((reply) => (
              <ReplyLine key={reply.replyId} reply={reply} firm={firm} />
            ))}
          </div>
        )}

        <ErrorNotice error={error} eyebrow="That did not go through" />

        {live && mayRequest && (
          /* NAMED BY THE SUBJECT — the same reason the firm's half of this page
             names its controls by the job. Two live requests draw two "Add to
             this" boxes and two "Send" buttons, and "Send" already collides
             with the answer button on an ask further up the SAME page: one word
             for two different lanes. The subject is what the reader typed when
             they opened the request and nothing on this card can edit it. */
          <fieldset
            className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
            aria-label={`Your request: ${request.subject}`}
          >
            <Field label="Add to this">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="cluster">
              <Button
                aria-label={`Send your reply on ${request.subject}`}
                onClick={() => void act("replies")}
                disabled={busy || note.trim().length === 0}
              >
                Send
              </Button>
              {/* THE CLIENT'S OWN ENDING, and the firm cannot do it for them:
                  "we decided you did not need this" is a refusal, which the
                  firm has to close with a reply saying so. */}
              <Button
                variant="ghost"
                aria-label={`Never mind: withdraw ${request.subject}`}
                onClick={() => void act("withdraw")}
                disabled={busy}
              >
                Never mind
              </Button>
            </div>
          </fieldset>
        )}
      </div>
    </Card>
  );
}

function ReplyLine({ reply, firm }: { reply: PortalRequestReply; firm: string }) {
  const fromFirm = reply.authorSide === "firm";
  return (
    <div>
      <p className="text-sm text-muted">
        {/* `authorName` is NULL on everything the firm wrote — the API drops it,
            not this component. Their own colleague's name survives, because a
            company with two directors needs to know which of them wrote. */}
        {fromFirm ? firm : (reply.authorName ?? "You")} · {longInstant(reply.writtenAt)}
      </p>
      <p>{reply.body}</p>
      {reply.document !== null && (
        <p className="text-sm text-muted">
          {/* It is in the library too — sending it is what made it visible
              there (0066) — so the bytes come from the download route that
              already exists rather than from a second one written here. */}
          <a href={`/portal/documents`}>{reply.document.title}</a> · {reply.document.filename}
        </p>
      )}
    </div>
  );
}

function statusLabel(status: string, firm: string): string {
  if (status === "open") return `With ${firm}`;
  if (status === "answered") return "Replied";
  if (status === "closed") return "Closed";
  return "You took it back";
}

/** `warn` and never `danger` — the portal's rule since T6.5: a red panel on a
 *  client's own page is an accusation, and a request the firm has not answered
 *  yet is the FIRM's outstanding item, not theirs. */
function toneOf(status: string): "neutral" | "ok" | "warn" | "danger" {
  if (status === "open") return "warn";
  if (status === "answered") return "ok";
  // `quiet` in the old vocabulary. `neutral` is the same thing under the name
  // the Tailwind Pill uses, and it is the default there for the same reason:
  // most chips are labels rather than alarms.
  return "neutral";
}

/**
 * "02 Sep 2026" from an ISO INSTANT, in the reader's own zone — `longInstant`
 * from `@/lib/day`, which is the one date format this product prints.
 *
 * ── AND THIS IS THE OPPOSITE OF WHAT A `date` COLUMN NEEDS ──────────────
 *
 * Every field this renders — `raisedAt`, `writtenAt`, `lastRepliedAt`,
 * `settledAt` — is a `timestamptz`, an INSTANT. The right day for an instant is
 * the day it happened where the READER is, which is what `longInstant` gives by
 * PARSING it. (This comment used to name `toLocaleDateString`; that is what the
 * file called before `@/lib/day` existed, and it was replaced precisely because
 * the reader's locale also decides the ORDER — the same instant read
 * "02 Sep 2026" in London and "Sep 02, 2026" in New York.)
 *
 * The portal's other rule — *"a date is SPLIT, never parsed"* — is about a
 * `YYYY-MM-DD` DATE column, where `new Date("2026-09-20")` is UTC midnight and
 * prints as the 19th west of Greenwich. The two rules point in OPPOSITE
 * directions and the field's type is what decides which applies.
 *
 * The first draft of this file read the UTC fields, which is the date-column
 * answer. Walking it caught it: a request raised at 00:20 in Delhi rendered
 * "01 Sep" — the day before the client made it — because 00:20 IST is 18:50 UTC
 * the previous day. Nothing in a typecheck or a test can see that, and east of
 * Greenwich it is wrong for five and a half hours every night.
 */
