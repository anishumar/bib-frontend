"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { api, apiError } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Card,
  ErrorNotice,
  LinkButton,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { EventRecord } from "@/lib/api/client";
import { longMoment } from "@/lib/day";
import {
  describeActor,
  describeVerb,
  detailRows,
  objectHref,
  objectNoun,
} from "@/lib/ui/audit-words";

/**
 * The audit trail — every state transition the firm has made, newest first.
 *
 * There is no separate history table anywhere in this product. This IS the
 * history: a lead's timeline, a proposal's, a membership's are all the same log
 * filtered by object, which is why `?type=&id=` narrows this page rather than
 * some other screen owning it.
 *
 * The log is append-only in the database — no UPDATE or DELETE grant — so
 * nothing here can be edited, and there is deliberately no control that
 * suggests otherwise.
 *
 * The PAYLOAD holds ids and machine facts and never personal data, because
 * erasure cannot mutate an append-only log. The actor's NAME is a read-time
 * join, not a stored field: erase the account and the name stops resolving
 * while the event survives.
 *
 * WHAT THE READER SEES IS IN WORDS, AND THE RECORD IS UNDERNEATH (2026-09-18).
 * The first version printed the verb (`session.started`), the table name
 * (`user_account`) and the payload as JSON, on the argument that an audit
 * trail is read when something has gone wrong and prettifying stands between
 * the reader and the record. Shrestha, looking at it: a partner cannot read
 * that. Both are true, so the row says "Signed in" and the exact record sits
 * under "Exact record" on the same row, folded away, in the same characters
 * the database holds. `@/lib/ui/audit-words` is the dictionary.
 */
export default function AuditPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AuditFeed />
    </Suspense>
  );
}

function AuditFeed() {
  const router = useRouter();
  const search = useSearchParams();
  const objectType = search.get("type");
  const objectId = search.get("id");

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result =
      objectType !== null && objectId !== null
        ? await api.GET("/api/v1/objects/{objectType}/{objectId}/events", {
            params: { path: { objectType, objectId } },
          })
        : await api.GET("/api/v1/events", { params: { query: { limit: 100 } } });

    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      // 403 here is the ordinary answer for an associate: the whole trail names
      // every client the firm has, which is a partner-and-manager read.
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setEvents(result.data.events);
    setError(null);
    setLoaded(true);
  }, [objectType, objectId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading the record" />;

  const scoped = objectType !== null && objectId !== null;
  // "this task", "this invoice"; but "the firm", never "this the firm".
  const subject = scoped ? thisNoun(objectNoun(objectType)) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Record"
        title={scoped ? "History" : "Audit trail"}
        lede={
          scoped
            ? `Everything that has happened to ${subject ?? "this record"}, newest first.`
            : "Everything that has happened in your firm's account, newest first. Entries are written automatically as people work, and nothing here can be changed or deleted."
        }
        aside={
          scoped ? (
            <LinkButton size="sm" href="/audit">
              Back to the whole trail
            </LinkButton>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      {events.length === 0 && error === null ? (
        <Card>
          <Empty title="Nothing recorded yet" icon="audit">
            Entries appear here on their own as your firm works. Nothing is typed in by hand.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What happened</Th>
                <Th>By whom</Th>
                {!scoped && <Th>Record</Th>}
              </tr>
            </thead>
            <tbody>
              {events.map((r) => {
                const details = detailRows(r.event.payload);
                const href = objectHref(r.event.objectType, r.event.objectId);
                const noun = objectNoun(r.event.objectType);
                return (
                  <tr key={r.event.id}>
                    <Td className="nowrap">
                      <span className="mono">{longMoment(r.event.occurredAt)}</span>
                    </Td>
                    <Td>
                      {/* A block with a max-width, because `.table` is
                          `min-width: max-content` and a long sentence in a cell
                          would otherwise widen the table until it scrolled. */}
                      <div className="audit-what">
                        {describeVerb(r.event.verb)}
                        {details.length > 0 && (
                          <Sub>{details.map((d) => `${d.label}: ${d.value}`).join(" · ")}</Sub>
                        )}
                        <details className="audit-record">
                          <summary>Exact record</summary>
                          <span className="mono">
                            {r.event.verb} · {r.event.objectType} {r.event.objectId}
                            {Object.keys(r.event.payload).length > 0 && (
                              <>
                                <br />
                                {JSON.stringify(r.event.payload)}
                              </>
                            )}
                          </span>
                        </details>
                      </div>
                    </Td>
                    <Td>
                      {/* Null is a real answer, not a gap: the system and agent
                          actors have no account, and neither does a human whose
                          account has since been erased. */}
                      {r.actor === null ? (
                        <span className="muted">{describeActor(r.event.actorType)}</span>
                      ) : (
                        (r.actor.displayName ?? r.actor.email)
                      )}
                    </Td>
                    {!scoped && (
                      <Td>
                        {/* The record's own screen when it has one, and its
                            full history either way. Named by KIND, not by id:
                            a partner opening the trail wants "Invoice", and
                            the id is one click down under "Exact record". */}
                        {href === null ? noun : <Link href={href as Route}>{noun}</Link>}
                        <Sub>
                          <Link
                            href={`/audit?type=${r.event.objectType}&id=${r.event.objectId}`}
                            aria-label={`Full history of ${thisNoun(noun)}`}
                          >
                            Full history
                          </Link>
                        </Sub>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Page>
  );
}

/** "this task", "this invoice"; "the firm" stays as it is. */
function thisNoun(noun: string): string {
  const lower = noun.toLowerCase();
  return lower.startsWith("the ") ? lower : `this ${lower}`;
}
