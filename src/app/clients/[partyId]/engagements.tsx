"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { longDay } from "@/lib/day";
import { Card, CardTitle, ErrorNotice, Sub, Table, TableWrap, Td, Th } from "@/components/ui";
import { EngagementActions, EngagementStatePill } from "@/components/engagement-life";

type ClientEngagement = components["schemas"]["BillableEngagement"];

/**
 * WHAT THE FIRM DOES FOR THIS CLIENT, and where each piece stands (V2.3).
 *
 * Every engagement the client's letters created, live or ended, with End,
 * Pause and Resume beside each. It reads the same list the invoice form bills
 * from, because that is the one read of "this client's engagements" the API
 * has: one row per service per company, with its letter.
 *
 * A client who leaves is ended here, service by service, and then archived
 * from the page header; the archive refuses while anything is still live.
 */
export function EngagementsPanel({
  partyId,
  canWrite,
}: {
  partyId: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<readonly ClientEngagement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/parties/{partyId}/billable-engagements", {
      params: { path: { partyId } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setRows(result.data.engagements);
  }, [partyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Nothing signed yet: no card, the letters section says what to do.
  if (rows !== null && rows.length === 0) return null;

  return (
    <Card>
      <CardTitle level={2}>Engagements</CardTitle>
      <ErrorNotice error={error} />
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Service</Th>
                <Th>Letter</Th>
                <Th>Where it stands</Th>
                <Th>From</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.engagementId}>
                  <Td>
                    {e.description}
                    <Sub>{e.entityName}</Sub>
                    {e.endReason !== null && <Sub>{e.endReason}</Sub>}
                  </Td>
                  <Td className="nowrap">
                    <Link href={`/engagement-letters/${e.letterId}` as Route}>{e.letterRef}</Link>
                  </Td>
                  <Td>
                    <EngagementStatePill
                      e={{ id: e.engagementId, status: e.status, effectiveFrom: e.effectiveFrom, endsOn: e.endsOn }}
                    />
                  </Td>
                  <Td className="nowrap">{longDay(e.effectiveFrom)}</Td>
                  <Td align="right">
                    <EngagementActions
                      e={{ id: e.engagementId, status: e.status, effectiveFrom: e.effectiveFrom, endsOn: e.endsOn }}
                      name={`${e.description} for ${e.entityName}`}
                      canWrite={canWrite}
                      onChanged={load}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}
