"use client";

/**
 * CLIENT REQUESTS (T6.8) — what clients have asked the FIRM for, unprompted.
 *
 * The other side of `/portal`'s "Ask the firm". Everything else in this product
 * flows outward: the firm raises an ask, the calendar raises a filing, the
 * chaser sends a reminder. These rows came IN, and until this screen existed
 * there was nowhere they could arrive.
 *
 * ── THE FIRM DECIDES WHETHER ANYTHING IS ROUTED, AND THE PAGE SAYS WHICH ──
 *
 * T6.8 shipped this with no routing at all, because the firm had never said who
 * an inbound request belongs to. It still has not — so migration 0070 gives the
 * firm a SWITCH rather than giving this product an opinion, and `none` is the
 * default and reproduces exactly what shipped.
 *
 * `routing` therefore travels with the list, and the empty state and the
 * Unassigned tab both read it. An inbox where nothing is assigned because the
 * firm routes nothing, and one where the rule ran and placed nothing, are the
 * SAME PICTURE — and only one of them is somebody's to fix. That is T4.5's
 * `ladderPublished` decision, and it is why this screen never just shows a
 * blank Assigned column.
 *
 * A SPOC is not among the options and cannot become one: a SPOC covers a Dept
 * or a delivery team, a request names no service, and picking an axis for it
 * would be the arbitrary answer this task exists to keep refusing.
 *
 * `awaitingFirm` is that flag, and it is NOT the status. A client's follow-up
 * does not walk `answered` back to `open` — that status means "the firm has
 * come back at least once" and is the same fact as `first_replied_at` being
 * set — so who spoke last is its own answer, computed by the API off the
 * thread.
 *
 * ── REPLYING MAY SEND A DOCUMENT, AND SENDING IT IS WHAT SHARES IT ───────
 *
 * The attachment picker lists documents already filed against THAT CLIENT
 * (`GET /documents?partyId=`). It is not an upload: "send me last year's
 * balance sheet" is answered by something the firm already holds, and a second
 * upload path here would file the client's own papers somewhere nobody working
 * their jobs is looking.
 *
 * Attaching one also makes it visible in their library — `is_client_visible`,
 * flipped by the API in the same transaction, because sending a document to a
 * client IS the decision to show it to them. The form says that before the
 * click, because it is a disclosure decision and not a formatting one.
 *
 * ── "TAKE IT" IS THE PRIMARY CONTROL, AND IT NEEDS NO ROSTER ─────────────
 *
 * The roster is `tenant:admin` and this page is `party:read`, so the full
 * picker is offered only to somebody who can actually read the list — the same
 * honest gap `/work-items/[id]`, the pipeline's owner dropdown and the account
 * team form all have, left consistent with them rather than widened here.
 *
 * But claiming a request needs no roster at all: the assignee is the caller.
 * On a firm-wide list with no owner that is the verb people actually use, so it
 * is a button everybody with `work:write` gets, and the picker is the extra.
 *
 * ── AND THERE IS NO WITHDRAW BUTTON ─────────────────────────────────────
 *
 * Taking a request back is the CLIENT's own act. "We decided you did not need
 * this" is a refusal, and a refusal is a close with a reply saying so — which
 * is why Close sits next to the reply box rather than alone.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ClientRequest, ClientRequestReply, Member } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Empty, ErrorState, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  Notice,
  Pill,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";

interface Me {
  readonly userId: string;
  readonly permissions: readonly string[];
}

type Tab = "mine" | "unassigned" | "all";

export default function ClientRequestsPage() {
  const router = useRouter();
  const tabsId = useId();
  const [requests, setRequests] = useState<readonly ClientRequest[]>([]);
  const [routing, setRouting] = useState<string>("none");
  const [roster, setRoster] = useState<readonly Member[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [inbox, who, people] = await Promise.all([
      api.GET("/api/v1/client-requests", {}),
      api.GET("/api/v1/auth/me", {}),
      // `tenant:admin`, and this page is `party:read` — so a 403 here is
      // ORDINARY and is not an error. It costs the full picker and nothing
      // else: "Take it" needs no roster, because the assignee is the caller.
      api.GET("/api/v1/tenancy/members", {}),
    ]);
    if (inbox.response.status === 401) {
      router.push("/login");
      return;
    }
    if (inbox.error) {
      setError(apiError(inbox.error).message);
      setLoaded(true);
      return;
    }
    setRequests(inbox.data.requests);
    setRouting(inbox.data.routing);
    setRoster(people.error ? [] : people.data.members);
    setMe(who.error ? null : { userId: who.data.userId, permissions: who.data.permissions });
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading />;
  if (error !== null) return <ErrorState title="Could not load the inbox" message={error} />;

  // Offered from what /auth/me says the session holds. Somebody without
  // `work:write` reads the inbox and is given no controls — the API refuses
  // them anyway, and offering what will 403 is a slower error.
  const mayAct = me?.permissions.includes("work:write") ?? false;
  const mine = requests.filter((r) => r.assignee !== null && r.assignee.userId === me?.userId);
  const unassigned = requests.filter((r) => r.assignee === null);
  const shown = tab === "mine" ? mine : tab === "unassigned" ? unassigned : requests;

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title="Client requests"
        lede="What clients have asked you for through their portal — everything not finished, newest first."
      />

      {/* WHAT THIS FIRM DOES WITH AN ARRIVING REQUEST, said rather than left to
          be inferred from an empty column. Under `none` a reader opening
          "Unassigned" and finding everything in it would conclude the rule was
          broken; the truth is that there is no rule, which is a setting and not
          a fault. */}
      <Notice
        tone="neutral"
        eyebrow={routing === "none" ? "Nothing is routed" : "Routed to the Key Manager"}
      >
        {routing === "none" ? (
          <p>
            An arriving request is put on nobody&rsquo;s desk — anyone who can write work can
            take any of them. A partner can change that under{" "}
            <Link href="/admin/structure">Firm structure</Link>.
          </p>
        ) : (
          <p>
            An arriving request goes to that client&rsquo;s Key Manager. Where a client has none
            it waits in <strong>Unassigned</strong> with a line saying so — and anybody can
            still take one, or hand it on.
          </p>
        )}
      </Notice>

      <Tabs
        id={tabsId}
        label="Client request views"
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
        }}
        tabs={[
          { value: "mine", label: "Mine", count: mine.length },
          // THE TAB THAT WOULD NOT EXIST ON A NAIVE LIST, and the one that
          // matters most: work the rule could not place, or nobody has taken.
          // 0051 makes the same argument for the work board — unassigned work
          // is only chased if somebody can list it.
          { value: "unassigned", label: "Unassigned", count: unassigned.length },
          { value: "all", label: "Everything", count: requests.length },
        ]}
      />

      {requests.length === 0 && (
        <Empty title="Nothing outstanding" icon="check">
          No client has an open request. Anything raised from a client&rsquo;s portal arrives
          here.
        </Empty>
      )}

      {requests.length > 0 && shown.length === 0 && (
        <Empty
          title={tab === "mine" ? "None of them are yours" : "Everything has an owner"}
          icon="check"
        >
          {tab === "mine"
            ? "Nothing here is on your desk. The other tabs have the rest."
            : "Every open request is on somebody's desk."}
        </Empty>
      )}

      {shown.length > 0 && (
        <Stack gap="tight">
          {shown.map((request) => (
            <RequestCard
              key={request.requestId}
              request={request}
              mayAct={mayAct}
              roster={roster}
              meUserId={me?.userId ?? null}
              onChanged={load}
            />
          ))}
        </Stack>
      )}
    </Page>
  );
}

function RequestCard({
  request,
  mayAct,
  roster,
  meUserId,
  onChanged,
}: {
  request: ClientRequest;
  mayAct: boolean;
  roster: readonly Member[];
  meUserId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [documents, setDocuments] = useState<readonly DocumentOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The client's own filed documents.
   *
   * ── FETCHED WHEN THE REPLY BOX IS TOUCHED, NOT WHEN THE PICKER IS ───────
   *
   * Not on mount: an inbox of twenty rows would be twenty document reads
   * nobody asked for. And NOT on the picker's own focus, which is where this
   * started — a native `<select>` opens the instant it is clicked, so the
   * options arrived after the list was already on screen and the reader saw
   * "Nothing attached" and nothing else. Found by clicking it.
   *
   * Typing the reply comes first in every real use of this form, and one
   * sentence is far longer than the round trip.
   */
  async function loadDocuments(): Promise<void> {
    if (documents !== null) return;
    const result = await api.GET("/api/v1/documents", {
      params: { query: { partyId: request.clientPartyId } },
    });
    setDocuments(
      result.error
        ? []
        : result.data.documents.map((d) => ({
            documentId: d.id,
            title: d.title,
            isClientVisible: d.isClientVisible,
          })),
    );
  }

  async function reply(alsoClose: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const sent = await api.POST("/api/v1/client-requests/{requestId}/replies", {
      params: { path: { requestId: request.requestId } },
      body: { body: body.trim(), documentId: documentId === "" ? null : documentId },
    });
    if (sent.error) {
      setBusy(false);
      setError(apiError(sent.error).message);
      return;
    }
    if (alsoClose) {
      const closed = await api.POST("/api/v1/client-requests/{requestId}/close", {
        params: { path: { requestId: request.requestId } },
      });
      if (closed.error) {
        setBusy(false);
        // The reply LANDED. Saying so is the difference between somebody
        // typing it again and somebody pressing Close again.
        setError(`Your reply was sent, but closing it did not: ${apiError(closed.error).message}`);
        await onChanged();
        return;
      }
    }
    setBusy(false);
    setBody("");
    setDocumentId("");
    await onChanged();
  }

  async function assign(assigneeUserId: string | null): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.PUT("/api/v1/client-requests/{requestId}/assignee", {
      params: { path: { requestId: request.requestId } },
      body: { assigneeUserId },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    // RELOADS rather than patching the row. Who holds a request decides which
    // tab it belongs in, so a local patch would leave it sitting in a list it
    // is no longer part of.
    await onChanged();
  }

  async function close(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/client-requests/{requestId}/close", {
      params: { path: { requestId: request.requestId } },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onChanged();
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{request.subject}</CardTitle>
        <Pill tone={request.awaitingFirm ? "warn" : "ok"}>{whereItStands(request)}</Pill>
      </CardHead>
      <Stack gap="tight">
        <p className="muted">
          {/* The client is a LINK, because an unrouted inbox is read by
              somebody who has to work out whose this is. */}
          <Link href={`/clients/${request.clientPartyId}`}>{request.clientName}</Link>
          {request.raisedByName !== null && <> · {request.raisedByName}</>} ·{" "}
          {longInstant(request.raisedAt)}
        </p>
        <p>{request.body}</p>

        {/* WHOSE DESK — and the three answers are three different sentences.
            A blank space here would collapse "nobody has taken it" into "the
            rule ran and found nobody", which is T4.5's blank-name bug in a new
            place: only one of the two is somebody's to fix. */}
        <p className="muted">
          {request.assignee !== null ? (
            <>
              With <strong>{request.assignee.displayName ?? request.assignee.email}</strong>
              {request.assignee.userId === meUserId && <> — that is you</>}
            </>
          ) : request.assignmentNote !== null ? (
            <>Nobody yet — {request.assignmentNote}</>
          ) : (
            <>On nobody&rsquo;s desk</>
          )}
        </p>

        {request.replies.length > 0 && (
          <Stack gap="tight">
            {request.replies.map((r) => (
              <ReplyLine key={r.replyId} reply={r} clientName={request.clientName} />
            ))}
          </Stack>
        )}

        {error !== null && (
          <Notice tone="danger" eyebrow="That did not go through">
            <p>{error}</p>
          </Notice>
        )}

        {mayAct && (
          <>
            <Field label="Your reply">
              <Textarea
                rows={3}
                value={body}
                onFocus={() => void loadDocuments()}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>

            <Field
              label="Send them a document (optional)"
              hint="Only documents already filed against this client. Sending one also makes it visible in their library."
            >
              <Select
                value={documentId}
                onFocus={() => void loadDocuments()}
                onChange={(e) => setDocumentId(e.target.value)}
              >
                <option value="">Nothing attached</option>
                {documents === null && (
                  <option value="" disabled>
                    Looking for this client&rsquo;s documents…
                  </option>
                )}
                {documents?.length === 0 && (
                  <option value="" disabled>
                    Nothing filed against this client yet
                  </option>
                )}
                {(documents ?? []).map((d) => (
                  <option key={d.documentId} value={d.documentId}>
                    {d.title}
                    {/* WHAT SENDING IT WILL DO, said on the option itself. A
                        document the client already has is a different act from
                        one this reply is about to share with them, and only one
                        of the two is a disclosure decision. */}
                    {d.isClientVisible ? " — they already have this" : " — not shared yet"}
                  </option>
                ))}
              </Select>
            </Field>

            {/* CLAIMING NEEDS NO ROSTER, so it is the control everybody with
                `work:write` gets. The picker below is the extra, and it is
                absent rather than broken for somebody who cannot read the
                roster. */}
            <div className="cluster">
              {request.assignee?.userId !== meUserId && meUserId !== null && (
                <Button variant="ghost" onClick={() => void assign(meUserId)} disabled={busy}>
                  Take it
                </Button>
              )}
              {request.assignee !== null && (
                <Button variant="ghost" onClick={() => void assign(null)} disabled={busy}>
                  Put it back
                </Button>
              )}
            </div>

            {/* THE PICKER IS A LABELLED FIELD, not a bare dropdown sitting in
                the button row. A full-width select with no label beside two
                small ghost buttons reads as a control that lost its label —
                found by looking at the page, which is the only place it shows. */}
            {roster.length > 0 && (
              <Field label="Or hand it to somebody else">
                <Select
                  value={request.assignee?.userId ?? ""}
                  onChange={(e) => void assign(e.target.value === "" ? null : e.target.value)}
                  disabled={busy}
                >
                  <option value="">Nobody</option>
                  {roster
                    // Only people who still work here. A revoked membership
                    // stays on the roster — it is the record that they did —
                    // and offering it would produce the API's refusal, which is
                    // just a slower error.
                    .filter((m) => m.membership.isActive)
                    .map((m) => (
                      <option key={m.membership.userId} value={m.membership.userId}>
                        {m.displayName ?? m.email}
                      </option>
                    ))}
                </Select>
              </Field>
            )}

            <div className="cluster">
              <Button onClick={() => void reply(false)} disabled={busy || body.trim() === ""}>
                Send
              </Button>
              {/* REPLY AND CLOSE IS ONE PRESS, because the commonest thing a
                  firm does with a request is answer it and be done. The two
                  calls are still two calls — the API keeps them apart so a
                  reply can stand without a closure — and the error path says
                  which of them landed. */}
              <Button
                variant="ghost"
                onClick={() => void reply(true)}
                disabled={busy || body.trim() === ""}
              >
                Send and close
              </Button>
              {/* Closing with NO reply is allowed and is the duplicate case —
                  two requests for the same thing, one of which gets answered. */}
              <Button variant="ghost" onClick={() => void close()} disabled={busy}>
                Close without replying
              </Button>
            </div>
          </>
        )}
      </Stack>
    </Card>
  );
}

interface DocumentOption {
  readonly documentId: string;
  readonly title: string;
  readonly isClientVisible: boolean;
}

function ReplyLine({ reply, clientName }: { reply: ClientRequestReply; clientName: string }) {
  const fromFirm = reply.authorSide === "firm";
  return (
    <div>
      <p className="muted">
        {/* BOTH SIDES ARE NAMED HERE, unlike the portal's copy of this thread —
            the firm needs to know which of its own people answered, and which
            of the client's two directors asked. */}
        {reply.authorName ?? (fromFirm ? "Somebody here" : clientName)} ·{" "}
        {fromFirm ? "us" : clientName} · {longInstant(reply.writtenAt)}
      </p>
      <p>{reply.body}</p>
      {reply.document !== null && <p className="muted">Sent: {reply.document.title}</p>}
    </div>
  );
}

/**
 * THREE STATES, AND THE RAW `status` IS ON NONE OF THEM.
 *
 * The first draft printed the pill AND `request.status` in the meta line, which
 * on a live row said one thing twice — "Waiting on us" beside "open" — and this
 * codebase has now been caught by that shape three times (the portal listing a
 * filing as both a filing and a task; the action centre printing an ask and its
 * blocked reason). Found by looking at the page; both chips were correct.
 *
 * Dropping the duplicate also drops a machine word off a partner's screen. What
 * is left is the three states a reader actually acts on, and the middle one —
 * the client came BACK after the firm replied — is the one neither chip could
 * say on its own: `status` stays `answered` (the firm has come back at least
 * once, which is what that word means and what 0068's CHECK ties to
 * `first_replied_at`), while `awaitingFirm` flips to true off the thread.
 */
function whereItStands(request: ClientRequest): string {
  if (!request.awaitingFirm) return "We replied last";
  return request.replies.length === 0 ? "Waiting on us" : "They came back";
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
