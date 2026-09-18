"use client";

/**
 * WHAT THIS RULE SAID BEFORE — the version history of one configured thing.
 *
 * ── THE ROUTE THAT HAD NO READER, AND WHY THE BOARD'S NOTE WAS WRONG ────────
 *
 * `GET /api/v1/config/{kind}/{key}` was filed as a detail read whose list
 * already carries everything. It does not. `GET /config/{kind}` returns each
 * entry with TWO versions — what is published and the draft waiting beside it —
 * and this route returns `{ entry, versions[] }`: every version there has ever
 * been, newest first. Nothing in the product asked for it, so a firm could not
 * answer the one question a versioned registry exists to answer.
 *
 * That question is a compliance question, not a curiosity. "Which escalation
 * ladder was in force on 31 March", "when did we change who may check work",
 * "was this service quoted from the version we published in April" — a
 * proposal line is PINNED to a config version precisely so the answer survives
 * the rule changing, and until this panel there was no way to see the versions
 * it might be pinned to.
 *
 * ── WHAT IT SHOWS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
 *
 * The ladder of versions, each with the period it was IN FORCE — computed from
 * the next version's `publishedAt`, because that is the moment this one stopped
 * being the answer. Not a DIFF: bodies differ per kind (rungs, permissions,
 * steps, prices) and a generic renderer would print JSON, which is what
 * `/audit` already does properly for a payload. Every version links there.
 *
 * ── AND IT IS A DISCLOSURE, CLOSED, THAT FETCHES ON OPEN ────────────────────
 *
 * Six screens carry this and none of them is about history. A screen that
 * fetched every entry's versions on mount would make `/catalogue` — one entry
 * per service — into a page of requests nobody asked for.
 */

import { useCallback, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ConfigKind, ConfigVersion } from "@/lib/api/client";
import { ErrorNotice, Pill, Table, TableWrap, Td, Th } from "@/components/ui";
import { Loading } from "@/components/states";
import { longInstant } from "@/lib/day";

export function ConfigHistory({
  kind,
  entryKey,
  /** What this thing is called on the screen, so the disclosure and every
   *  control under it says WHICH one — six of these on `/catalogue` under one
   *  name would be six controls answering to "Its history". */
  name,
}: {
  kind: ConfigKind;
  entryKey: string;
  name: string;
}) {
  const [versions, setVersions] = useState<readonly ConfigVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/config/{kind}/{key}", {
      params: { path: { kind, key: entryKey } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setVersions([]);
      return;
    }
    setError(null);
    // FILTERED, NOT CAST. `noUncheckedIndexedAccess` gives the generated array
    // a nullable member, and a cast would be this file asserting something
    // about the wire it cannot know. Nothing real is dropped.
    setVersions(result.data.versions.filter((v) => v !== null));
  }, [kind, entryKey]);

  return (
    <details
      style={{ marginTop: "var(--s-4)" }}
      /* FETCHED FROM THE TOGGLE, not from an effect watching a piece of state
         that mirrors it. The disclosure opening IS the event, and `open` was a
         second copy of a fact the DOM already holds — which is what
         `react-hooks/set-state-in-effect` was pointing at. */
      onToggle={(e) => {
        if (!e.currentTarget.open || versions !== null) return;
        void load();
      }}
    >
      {/* THE DISCLOSURE AND WHAT IS INSIDE IT ARE TWO THINGS TO NAME. The
          visible word stays short; the accessible name says which rule. */}
      <summary aria-label={`Every version of ${name}`}>Its history</summary>

      <ErrorNotice error={error} />

      {versions === null ? (
        <Loading label={`Looking up the versions of ${name}`} />
      ) : versions.length === 0 ? (
        <p className="muted">No versions yet. Nothing has been drafted for this.</p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>State</Th>
                <Th>In force</Th>
                <Th>Until</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={v.id}>
                  <Td>
                    <span className="mono">v{v.version}</span>
                  </Td>
                  <Td>
                    {/* `published` is what is in force NOW; `archived` was and
                        still resolves, because something may be pinned to it;
                        a `draft` never took effect at all. Three different
                        facts and three different words. */}
                    <Pill tone={v.status === "published" ? "ok" : "quiet"}>{v.status}</Pill>
                  </Td>
                  <Td className="muted">
                    {v.publishedAt === null ? "never" : longInstant(v.publishedAt)}
                  </Td>
                  <Td className="muted">
                    {/*
                     * UNTIL THE NEXT ONE TOOK OVER, and that is the whole point
                     * of the column. `archivedAt` is when the row was marked,
                     * and the answer a partner needs is when it STOPPED BEING
                     * THE ANSWER — which is the moment the version above it in
                     * this list was published. Newest first, so that is `i - 1`.
                     */}
                    {v.publishedAt === null
                      ? ""
                      : i === 0
                        ? "still in force"
                        : (versions[i - 1]?.publishedAt ?? null) === null
                          ? "not recorded"
                          : longInstant(versions[i - 1]?.publishedAt ?? "")}
                  </Td>
                  <Td>
                    <a
                      className="text-sm muted"
                      href={`/audit?type=config_version&id=${v.id}`}
                      aria-label={`Everything that happened to version ${String(v.version)} of ${name}`}
                    >
                      What happened to it
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </details>
  );
}
