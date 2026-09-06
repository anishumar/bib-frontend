"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ClientRequest } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import {
  Card,
  CardTitle,
  LinkButton,
  Meta,
  MetaItem,
  Notice,
  NotStated,
  Pill,
} from "@/components/ui";
import { longInstant } from "@/lib/day";
import { ReplyLine, whereItStands } from "../thread";

/**
 * One request a client raised, and the whole conversation — the RECORD.
 *
 * ── THE HOLE THIS CLOSES, AND IT IS NOT "A ROUTE WITH NO CALLER" ────────────
 *
 * `GET /api/v1/client-requests/{requestId}` had no caller, and the board filed
 * it beside the other detail reads whose list already carries everything. It is
 * not that shape at all. The inbox is `listLive` — `status IN ('open',
 * 'answered')` — so the moment somebody at the firm pressed Close, the record of
 * what a client asked and what the firm answered left EVERY staff screen.
 *
 * And the client kept theirs. `portal-request-repository`'s list filters on no
 * status at all, so a client could open their portal and read a conversation
 * the firm had closed three months earlier, with the whole thread, while nobody
 * at the firm could see it anywhere. Two surfaces disagreeing about the same
 * conversation, with the CLIENT holding the fuller record.
 *
 * So the fix was two things: `?state=finished` on the list (the archive), and
 * this page (the record you open from it).
 *
 * ── WHY THIS PAGE DOES NOT REPLY ────────────────────────────────────────────
 *
 * The inbox's card carries a reply box, a document picker that only offers what
 * is already filed against this client, and a reply-and-close that is one act.
 * That is a WORKFLOW, and duplicating a workflow is how two screens come to
 * behave differently. A small control with shared rules is worth repeating —
 * `/leads/[leadId]` has a stage select for that reason — and a workflow is not.
 * A live request reached here says where it is worked instead.
 */

/** How it ENDED, which is the question this page exists to answer. The inbox's
 *  `whereItStands` answers a different one — who owes whom a reply — and is
 *  meaningless once nobody is waiting. */
function howItEnded(request: ClientRequest): { label: string; tone: "quiet" | "ok" } | null {
  if (request.status === "closed") return { label: "Closed by us", tone: "ok" };
  // THE TWO ENDINGS BELONG TO OPPOSITE SIDES, and 0068 named the columns
  // `settled_*` rather than `closed_*` for exactly this reason: a withdrawal is
  // the client taking it back, and reading it as the firm closing them down is
  // the wrong story about the same row.
  if (request.status === "withdrawn") return { label: "Withdrawn by the client", tone: "quiet" };
  return null;
}

export default function ClientRequestRecordPage() {
  const router = useRouter();
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;

  const [request, setRequest] = useState<ClientRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/client-requests/{requestId}", {
      params: { path: { requestId } },
    });
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setRequest(result.data);
    setError(null);
    setLoaded(true);
  }, [requestId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading the request" />;
  if (request === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such request at this firm."}</Notice>
      </Page>
    );
  }

  const ended = howItEnded(request);

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery"
        title={request.subject}
        lede={
          <>
            Raised by <Link href={`/clients/${request.clientPartyId}`}>{request.clientName}</Link>{" "}
            through their portal.
          </>
        }
        aside={
          <LinkButton variant="ghost" href="/client-requests">
            Client requests
          </LinkButton>
        }
      />

      {ended === null && (
        /* A LIVE request reached by link. `neutral`, not `warn`: nothing is
           wrong — this page is simply not where it is worked. */
        <Notice tone="neutral" eyebrow={whereItStands(request)}>
          <p>
            This one is still going, so it is in the inbox on{" "}
            <Link href="/client-requests">Client requests</Link>, where it can be replied to,
            handed on and closed. This page is the record.
          </p>
        </Notice>
      )}

      <Card>
        <CardTitle level={2}>What they asked</CardTitle>
        <Meta>
          <MetaItem label="How it ended">
            {ended === null ? (
              <Pill tone="warn">{whereItStands(request)}</Pill>
            ) : (
              <Pill tone={ended.tone}>{ended.label}</Pill>
            )}
          </MetaItem>
          <MetaItem label="Who asked">
            {/* A company with two directors asking for different things is two
                conversations, so the person is worth naming — and null is
                ordinary on a seeded account, which is why it is not a blank. */}
            {request.raisedByName ?? <NotStated>somebody at the client</NotStated>}
          </MetaItem>
          {/* Every date here is a `timestamptz` — an INSTANT — so it is PARSED
              and printed as the day it happened where the READER is. A `date`
              column would be SPLIT instead; the field's type decides. */}
          <MetaItem label="Raised">{longInstant(request.raisedAt)}</MetaItem>
          {request.settledAt !== null && (
            <MetaItem label="Ended">{longInstant(request.settledAt)}</MetaItem>
          )}
          {request.settledByName !== null && (
            <MetaItem label="Ended by">{request.settledByName}</MetaItem>
          )}
          <MetaItem label="Whose desk">
            {request.assignee !== null ? (
              (request.assignee.displayName ?? request.assignee.email)
            ) : request.assignmentNote !== null ? (
              <NotStated>nobody — {request.assignmentNote}</NotStated>
            ) : (
              <NotStated>nobody</NotStated>
            )}
          </MetaItem>
        </Meta>
        <p style={{ whiteSpace: "pre-wrap", maxWidth: "62ch", marginTop: "var(--s-4)" }}>
          {request.body}
        </p>
      </Card>

      <Card>
        <CardTitle level={2}>The conversation</CardTitle>
        {request.replies.length === 0 ? (
          <p className="muted">
            {/* "CLOSED" WAS WRONG HERE and the walk caught it: the first
                withdrawn request rendered read "on a closed request", which is
                the firm's ending being used to describe the client's. The two
                endings belong to opposite sides and this sentence covers both. */}
            Nobody replied. On a finished request that is a real answer rather than a gap — it
            ended without a word going back, which is worth being able to see.
          </p>
        ) : (
          <Stack gap="tight">
            {request.replies.map((r) => (
              <ReplyLine key={r.replyId} reply={r} clientName={request.clientName} />
            ))}
          </Stack>
        )}
      </Card>
    </Page>
  );
}
