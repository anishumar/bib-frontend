"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
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

  if (!loaded) return <Loading label="Loading the trail" />;

  const scoped = objectType !== null && objectId !== null;

  return (
    <Page>
      <PageHeader
        eyebrow="Record"
        title={scoped ? "History" : "Audit trail"}
        lede={
          scoped
            ? `Everything that ever happened to this ${objectType}.`
            : "Every state transition, newest first. Append-only — nothing here can be edited."
        }
        aside={
          scoped ? (
            <LinkButton size="sm" href="/audit">
              The whole trail
            </LinkButton>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      {events.length === 0 && error === null ? (
        <Card>
          <Empty title="Nothing recorded yet" icon="audit">
            The trail fills itself as the firm works. Nothing writes to it by hand.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What</Th>
                <Th>Who</Th>
                <Th>About</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((r) => (
                <tr key={r.event.id}>
                  <Td className="nowrap">
                    <span className="mono">
                      {r.event.occurredAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </Td>
                  <Td>
                    <span className="mono">{r.event.verb}</span>
                  </Td>
                  <Td>
                    {/* Null is a real answer, not a gap: the system and agent
                        actors have no account, and neither does a human whose
                        account has since been erased. */}
                    {r.actor === null ? (
                      <span className="muted">{r.event.actorType}</span>
                    ) : (
                      (r.actor.displayName ?? r.actor.email)
                    )}
                  </Td>
                  <Td>
                    {scoped ? (
                      <span className="muted">{r.event.objectType}</span>
                    ) : (
                      <Link
                        href={`/audit?type=${r.event.objectType}&id=${r.event.objectId}`}
                        className="mono"
                      >
                        {r.event.objectType}
                      </Link>
                    )}
                    {Object.keys(r.event.payload).length > 0 && (
                      // Ids and machine facts. Shown raw and not prettified: an
                      // audit trail is read when something has gone wrong, and
                      // a friendlier rendering is one more thing between the
                      // reader and what was actually recorded.
                      <Sub>
                        <span className="mono">{JSON.stringify(r.event.payload)}</span>
                      </Sub>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Page>
  );
}
