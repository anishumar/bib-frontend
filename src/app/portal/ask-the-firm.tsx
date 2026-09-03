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
  Card,
  CardHead,
  CardTitle,
  Field,
  Input,
  Notice,
  Pill,
  Select,
  Textarea,
  type PillTone,
} from "@/components/ui";
import { Section, Stack } from "@/components/layout";
import { usePortalSession } from "./portal-frame";

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
      <Notice tone="warn" eyebrow="Could not load what you have asked for">
        <p>{error}</p>
      </Notice>
    );
  }

  const live = [...requests.awaitingFirm, ...requests.replied];

  return (
    <Section title="Ask the firm" level={2}>
      <Stack gap="tight">
        <p className="muted">
          {mayRequest
            ? `Anything you need from ${firm} — a document you cannot find, a copy of something, a correction, or a call. It goes straight to their team.`
            : `Your login can read everything here but cannot open a request. Ask your contact at ${firm} to give this address permission, or ask from a colleague's login.`}
        </p>

        {mayRequest && !composing && (
          <div className="cluster">
            <Button onClick={() => setComposing(true)}>Ask for something</Button>
          </div>
        )}

        {mayRequest && composing && (
          <NewRequest
            companies={companies}
            asOf={asOf}
            onDone={() => {
              setComposing(false);
              void load();
            }}
            onCancel={() => setComposing(false)}
          />
        )}

        {live.length === 0 && requests.settled.length === 0 && (
          <p className="muted">You have not asked {firm} for anything through this page yet.</p>
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
            <p className="muted">Finished</p>
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
      </Stack>
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
      <Stack gap="tight">
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

        {error !== null && (
          <Notice tone="danger" eyebrow="That did not go through">
            <p>{error}</p>
          </Notice>
        )}

        <div className="cluster">
          <Button onClick={() => void send()} disabled={busy || !ready}>
            Send it
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Stack>
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
    <Card>
      <CardHead>
        <CardTitle>{request.subject}</CardTitle>
        <Pill tone={toneOf(request.status)}>{statusLabel(request.status, firm)}</Pill>
      </CardHead>
      <Stack gap="tight">
        <p>{request.body}</p>
        <p className="muted">
          {request.companyName !== null && <>{request.companyName} · </>}
          asked {longInstant(request.raisedAt)}
          {/* A DATE AND NOT A COUNT, on both surfaces and for two different
              reasons. On an ask it is because a tally is an accusation; here it
              is simply the only part of the thread worth repeating at the top —
              the whole conversation is directly below. */}
          {request.lastRepliedAt !== null && <> · {firm} replied {longInstant(request.lastRepliedAt)}</>}
        </p>

        {request.replies.length > 0 && (
          <Stack gap="tight">
            {request.replies.map((reply) => (
              <ReplyLine key={reply.replyId} reply={reply} firm={firm} />
            ))}
          </Stack>
        )}

        {error !== null && (
          <Notice tone="danger" eyebrow="That did not go through">
            <p>{error}</p>
          </Notice>
        )}

        {live && mayRequest && (
          <>
            <Field label="Add to this">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="cluster">
              <Button
                onClick={() => void act("replies")}
                disabled={busy || note.trim().length === 0}
              >
                Send
              </Button>
              {/* THE CLIENT'S OWN ENDING, and the firm cannot do it for them:
                  "we decided you did not need this" is a refusal, which the
                  firm has to close with a reply saying so. */}
              <Button variant="ghost" onClick={() => void act("withdraw")} disabled={busy}>
                Never mind
              </Button>
            </div>
          </>
        )}
      </Stack>
    </Card>
  );
}

function ReplyLine({ reply, firm }: { reply: PortalRequestReply; firm: string }) {
  const fromFirm = reply.authorSide === "firm";
  return (
    <div>
      <p className="muted">
        {/* `authorName` is NULL on everything the firm wrote — the API drops it,
            not this component. Their own colleague's name survives, because a
            company with two directors needs to know which of them wrote. */}
        {fromFirm ? firm : (reply.authorName ?? "You")} · {longInstant(reply.writtenAt)}
      </p>
      <p>{reply.body}</p>
      {reply.document !== null && (
        <p className="muted">
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
function toneOf(status: string): PillTone {
  if (status === "open") return "warn";
  if (status === "answered") return "ok";
  return "quiet";
}

/**
 * "2 September 2026" from an ISO INSTANT, in the reader's own zone.
 *
 * ── AND THIS IS THE OPPOSITE OF WHAT A `date` COLUMN NEEDS ──────────────
 *
 * Every field this renders — `raisedAt`, `writtenAt`, `lastRepliedAt`,
 * `settledAt` — is a `timestamptz`, an INSTANT. The right day for an instant is
 * the day it happened where the READER is, which is what `toLocaleDateString`
 * gives, and it is the formatter the action centre already uses.
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
/**
 * An INSTANT, printed as the day it fell on where the READER is.
 *
 * Renamed from `longDay`, which is the name of the function that must NOT do
 * this. Both spellings existed side by side in this app: one splits a
 * `YYYY-MM-DD` because a statutory deadline is the same day everywhere, and
 * this one parses a `...At` because one moment lands on different days in
 * different places. Every call below passes a `...At`, so parsing is correct
 * here — the name was the only thing wrong, and it was the dangerous thing to
 * get wrong, because the next person needing a date formatter copies the
 * nearest one they find.
 *
 * The canonical pair is in `@/lib/day`.
 */
function longInstant(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
