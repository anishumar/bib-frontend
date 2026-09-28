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
 *
 * ── THE WAVE 4 SHAPE (2026-09-28) ───────────────────────────────────────
 *
 * Every card carried an open reply form, a document picker, a desk picker and
 * five buttons: three requests were 2,500px. The reply box, the attachment
 * picker and Take it are still on the row, but the form opens on **Reply**
 * (its textarea takes focus, which is also what loads the documents), and the
 * desk picker is the "Whose desk" line itself, a labelled quiet select. The
 * routing notice is one line with no eyebrow.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import type { ClientRequest, ClientRequestReply, Colleague } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Empty, ErrorState, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  ErrorNotice,
  Notice,
  NotSet,
  Pill,
  RowChevron,
  RowLink,
  Select,
  TabPanel,
  Table,
  Tabs,
  TableWrap,
  Td,
  Textarea,
  Th,
  ThChevron,
  Tr,
  useSwapFocus,
} from "@/components/ui";
import { longInstant } from "@/lib/day";
import { ReplyLine, whereItStands } from "./thread";

interface Me {
  readonly userId: string;
  readonly permissions: readonly string[];
}

type Tab = "mine" | "unassigned" | "all" | "finished";

export default function ClientRequestsPage() {
  const router = useRouter();
  const tabsId = useId();
  const [requests, setRequests] = useState<readonly ClientRequest[]>([]);
  const [routing, setRouting] = useState<string>("none");
  const [roster, setRoster] = useState<readonly Colleague[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  // Opens on MINE (V1.2): what somebody comes here for first is what is theirs.
  const [tab, setTab] = useState<Tab>("mine");
  /**
   * THE ARCHIVE, and it is a SECOND read rather than a filter on the first.
   *
   * The inbox is `listLive` — open and answered — so until `?state=finished`
   * existed, the record of what a client asked and what the firm answered left
   * every staff screen the moment somebody pressed Close. The client's own
   * portal kept showing it, because that list filters on no status at all.
   *
   * Loaded when the tab is first opened, not with the page: a firm that never
   * looks at its archive should not pay for it on every visit, and the inbox is
   * what somebody came here to work.
   */
  const [finished, setFinished] = useState<readonly ClientRequest[] | null>(null);
  const [finishedError, setFinishedError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [inbox, who, people] = await Promise.all([
      api.GET("/api/v1/client-requests", {}),
      api.GET("/api/v1/auth/me", {}),
      // `tenant:admin`, and this page is `party:read` — so a 403 here is
      // ORDINARY and is not an error. It costs the full picker and nothing
      // else: "Take it" needs no roster, because the assignee is the caller.
      // The colleagues PICKER, not the roster (G3.2's gap, closed as on the work
      // board): names and rungs of active staff on `party:read`, no emails. The
      // roster is `tenant:admin`, so until 2026-09-25 nobody below
      // administrator was shown this picker at all.
      api.GET("/api/v1/tenancy/colleagues", {}),
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
    // THE ARCHIVE IS DROPPED WHENEVER THE INBOX IS RE-READ, and this is the
    // whole cache-invalidation rule. `load` runs after every write on this
    // screen, and a Close is exactly the write that moves a row from one list
    // to the other — so a reader who had already opened Finished once would
    // otherwise close a request and not find it there until they reloaded the
    // page. Null means "ask again next time the tab is opened", not "empty".
    setFinished(null);
    setRoster(people.error ? [] : people.data.colleagues);
    setMe(who.error ? null : { userId: who.data.userId, permissions: who.data.permissions });
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (tab !== "finished" || finished !== null) return;
    void (async () => {
      const result = await api.GET("/api/v1/client-requests", {
        params: { query: { state: "finished" } },
      });
      if (result.error) {
        setFinishedError(apiError(result.error).message);
        setFinished([]);
        return;
      }
      setFinishedError(null);
      setFinished(result.data.requests);
    })();
  }, [tab, finished]);

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
      <PageHeader title="Client requests" />

      {/* WHAT THIS FIRM DOES WITH AN ARRIVING REQUEST, said rather than left to
          be inferred from an empty column. Under `none` a reader opening
          "Unassigned" and finding everything in it would conclude the rule was
          broken; the truth is that there is no rule, which is a setting and not
          a fault. One line now (Wave 4). */}
      <Notice tone="neutral">
        {routing === "none" ? (
          <p>
            New requests go on nobody&rsquo;s desk until someone takes them. Change this in{" "}
            <Link href="/admin/structure">Firm structure</Link>.
          </p>
        ) : (
          <p>
            New requests go to the client&rsquo;s Key Manager, or wait in{" "}
            <strong>Unassigned</strong> when there is none.
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
          // NO COUNT, and that is not an oversight. A count would have to be
          // fetched to be shown, which means paying for the archive on every
          // visit to the inbox — and "how many conversations have we ever
          // finished" is not a number anybody works from.
          { value: "finished", label: "Finished" },
        ]}
      />

      {/* THE PANEL IS WHAT THE TAB CONTROLS. All three blocks below change with
          `tab`, and all three were loose siblings of the tablist — so every one
          of the three tabs pointed `aria-controls` at an id that is not in the
          document. */}
      <TabPanel tabsId={tabsId} value={tab}>
      {tab === "finished" ? (
        <FinishedList requests={finished} error={finishedError} />
      ) : (
      <>
      {requests.length === 0 && (
        <Empty title="Nothing outstanding" icon="check">
          Requests your clients raise on their portal arrive here.
        </Empty>
      )}

      {requests.length > 0 && shown.length === 0 && (
        <Empty
          title={tab === "mine" ? "None of them are yours" : "Everything has an owner"}
          icon="check"
        >
          {tab === "mine"
            ? "Nothing here is on your desk."
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
      </>
      )}
      </TabPanel>
    </Page>
  );
}

/**
 * THE ARCHIVE READS DIFFERENTLY FROM THE INBOX, and the difference is the point.
 *
 * An inbox row is a card with the whole thread and a reply box, because it is
 * WORKED. A finished one is LOOKED UP: what was it, whose it was, how it ended,
 * and then you open the one you want. Twenty finished conversations rendered in
 * full is a page nobody can find anything in — the same argument the portal made
 * when its two request lanes were split off a 4,489px home page.
 */
function FinishedList({
  requests,
  error,
}: {
  requests: readonly ClientRequest[] | null;
  error: string | null;
}) {
  if (error !== null) return <ErrorNotice error={error} />;
  if (requests === null) return <Loading label="Looking up what is finished" />;
  if (requests.length === 0) {
    return (
      <Empty title="Nothing has finished yet" icon="check">
        Closed and withdrawn requests move here, with their thread.
      </Empty>
    );
  }
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>What they asked</Th>
            <Th>Client</Th>
            <Th>How it ended</Th>
            <Th>Ended</Th>
            <ThChevron />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <Tr key={r.requestId} linked>
              <Td>
                <span className="cell-text">
                  <RowLink href={`/client-requests/${r.requestId}`}>{r.subject}</RowLink>
                </span>
              </Td>
              <Td>{r.clientName}</Td>
              {/* The two endings belong to OPPOSITE SIDES — `closed` is the
                  firm, `withdrawn` is the client — which is why 0068 called the
                  columns `settled_*` and why one word for both would be the
                  wrong story about half these rows. */}
              <Td>
                <Pill dot tone={r.status === "closed" ? "ok" : "neutral"}>
                  {r.status === "closed" ? "Closed by us" : "Withdrawn"}
                </Pill>
              </Td>
              <Td className="nowrap">
                {r.settledAt === null ? <NotSet /> : longInstant(r.settledAt)}
              </Td>
              <RowChevron />
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
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
  roster: readonly Colleague[];
  meUserId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [documents, setDocuments] = useState<readonly DocumentOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The reply form, open on Reply (Wave 4). Its textarea takes focus as it
   *  opens, which is also the moment the documents load. */
  const [replying, setReplying] = useState(false);
  const { panel: formRef, trigger: openRef } = useSwapFocus(replying);

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
    setReplying(false);
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
        <CardTitle level={2}>{request.subject}</CardTitle>
        <Pill dot tone={request.awaitingFirm ? "warn" : "ok"}>
          {whereItStands(request)}
        </Pill>
      </CardHead>
      <Stack gap="tight">
        <p className="text-ink-2">
          {/* The client is a LINK, because an unrouted inbox is read by
              somebody who has to work out whose this is. */}
          <Link href={`/clients/${request.clientPartyId}`}>{request.clientName}</Link>
          {request.raisedByName !== null && <> · {request.raisedByName}</>} ·{" "}
          {longInstant(request.raisedAt)}
        </p>
        <p>{request.body}</p>

        {request.replies.length > 0 && (
          <Stack gap="tight">
            {request.replies.map((r) => (
              <ReplyLine key={r.replyId} reply={r} clientName={request.clientName} />
            ))}
          </Stack>
        )}

        {/* WHOSE DESK — and the three answers are three different sentences.
            A blank here would collapse "nobody has taken it" into "the rule ran
            and found nobody", which is T4.5's blank-name bug in a new place.
            For somebody who may hand it on, the line IS the picker: a labelled
            quiet select (T6.9: never a bare select in the button row), which
            assigns on change as it always did; the rule's note sits under it. */}
        {mayAct && roster.length > 0 ? (
          <div className="max-w-[24rem]">
            <Field
              label="Whose desk"
              {...(request.assignee === null && request.assignmentNote !== null
                ? { hint: request.assignmentNote }
                : {})}
            >
              <Select
                variant="quiet"
                value={request.assignee?.userId ?? ""}
                onChange={(e) => void assign(e.target.value === "" ? null : e.target.value)}
                disabled={busy}
              >
                <option value="">On nobody&rsquo;s desk</option>
                {/* Only people who still work here: the colleagues read
                    carries active staff alone, so a revoked membership is
                    never offered. */}
                {roster.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {colleagueLabel(m)}
                    {m.userId === meUserId ? ", you" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <p className="text-ink-2">
            {request.assignee !== null ? (
              <>
                With <strong>{request.assignee.displayName ?? request.assignee.email}</strong>
                {request.assignee.userId === meUserId && <> (that is you)</>}
              </>
            ) : request.assignmentNote !== null ? (
              <>Nobody yet. {request.assignmentNote}</>
            ) : (
              <>On nobody&rsquo;s desk</>
            )}
          </p>
        )}

        <ErrorNotice error={error} eyebrow="That did not go through" />

        {mayAct && !replying && (
          /* CLAIMING NEEDS NO ROSTER, so Take it is the control everybody with
             `work:write` gets, beside Reply. */
          <div className="cluster">
            <Button
              ref={openRef}
              variant="secondary"
              size="sm"
              onClick={() => {
                setReplying(true);
              }}
            >
              Reply
            </Button>
            {request.assignee?.userId !== meUserId && meUserId !== null && (
              <Button variant="ghost" size="sm" onClick={() => void assign(meUserId)} disabled={busy}>
                Take it
              </Button>
            )}
            {request.assignee !== null && (
              <Button variant="ghost" size="sm" onClick={() => void assign(null)} disabled={busy}>
                Put it back
              </Button>
            )}
            {/* Closing with NO reply is allowed and is the duplicate case —
                two requests for the same thing, one of which gets answered. */}
            <Button variant="ghost" size="sm" onClick={() => void close()} disabled={busy}>
              Close without replying
            </Button>
          </div>
        )}

        {mayAct && replying && (
          <div ref={formRef} tabIndex={-1} className="stack tight">
            <Field label="Your reply">
              <Textarea
                rows={3}
                value={body}
                autoFocus
                placeholder="e.g. Sending both by Thursday."
                onFocus={() => void loadDocuments()}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>

            <Field
              label="Send them a document"
              optional
              hint="Their filed documents. Sending one shares it on their portal."
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
                    {d.isClientVisible ? " (they already have this)" : " (not shared yet)"}
                  </option>
                ))}
              </Select>
            </Field>

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
              <Button
                variant="ghost"
                onClick={() => {
                  setReplying(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
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
