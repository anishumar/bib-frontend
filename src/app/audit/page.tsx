"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
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
    <Suspense fallback={<p className="bib-muted">Loading…</p>}>
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

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const scoped = objectType !== null && objectId !== null;

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        {scoped && <Link href="/audit">The whole trail</Link>}
      </nav>
      <h1 style={{ marginBottom: 4 }}>{scoped ? "History" : "Audit trail"}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {scoped
          ? `Everything that ever happened to this ${objectType}.`
          : "Every state transition, newest first. Append-only — nothing here can be edited."}
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card">
        {events.length === 0 && error === null ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing recorded yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Who</th>
                <th>About</th>
              </tr>
            </thead>
            <tbody>
              {events.map((r) => (
                <tr key={r.event.id}>
                  <td className="bib-muted" style={{ whiteSpace: "nowrap" }}>
                    {r.event.occurredAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="bib-mono">{r.event.verb}</td>
                  <td>
                    {/* Null is a real answer, not a gap: the system and agent
                        actors have no account, and neither does a human whose
                        account has since been erased. */}
                    {r.actor === null ? (
                      <span className="bib-muted">{r.event.actorType}</span>
                    ) : (
                      (r.actor.displayName ?? r.actor.email)
                    )}
                  </td>
                  <td>
                    {scoped ? (
                      <span className="bib-muted">{r.event.objectType}</span>
                    ) : (
                      <Link
                        href={`/audit?type=${r.event.objectType}&id=${r.event.objectId}`}
                        className="bib-mono"
                      >
                        {r.event.objectType}
                      </Link>
                    )}
                    {Object.keys(r.event.payload).length > 0 && (
                      // Ids and machine facts. Shown raw and not prettified: an
                      // audit trail is read when something has gone wrong, and
                      // a friendlier rendering is one more thing between the
                      // reader and what was actually recorded.
                      <div className="bib-muted bib-mono" style={{ fontSize: 11 }}>
                        {JSON.stringify(r.event.payload)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
