"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { api, apiError, billingPersonName, formatMoney } from "@/lib/api/client";
import type { BillingAdvance } from "@/lib/api/client";
import { longDay } from "@/lib/day";
import { AdvanceState } from "@/components/advance-status";
import { ConfirmAction } from "@/components/confirm-action";
import { Empty } from "@/components/states";
import { Card, ErrorNotice, Notice, NotSet, Sub, Table, TableWrap, Td, Th } from "@/components/ui";

/**
 * ADVANCES (auto-invoice phase 2, 0320): every advance a signed letter asked
 * for, and where it stands. The work an advance holds starts by itself when its
 * invoice is paid in full; a PART-PAID one waits here for an admin's Approve
 * start (the dunning decision queue's pattern: a person decides). Those come
 * first. The invoice itself is raised from To raise, like any bill.
 */
export function AdvancesTab({
  advances,
  isAdmin,
  onChanged,
}: {
  advances: readonly BillingAdvance[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const order: Record<BillingAdvance["state"], number> = {
    part_paid: 0,
    paid: 1,
    not_raised: 2,
    on_draft: 3,
    unpaid: 4,
    started: 5,
  };
  const sorted = [...advances].sort(
    (a, b) => order[a.state] - order[b.state] || a.billOn.localeCompare(b.billOn),
  );

  async function approve(a: BillingAdvance): Promise<void> {
    setError(null);
    setDone(null);
    setBusy(true);
    const result = await api.POST("/api/v1/billing/advances/{dueId}/approve-start", {
      params: { path: { dueId: a.id } },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onChanged();
    setDone(`The work for ${a.party.displayName} has started.`);
  }

  if (advances.length === 0) {
    return (
      <Card>
        <Empty title="No advances" icon="check">
          An advance appears here when a letter that asks for one is signed.
        </Empty>
      </Card>
    );
  }

  return (
    <>
      <ErrorNotice error={error} />
      {done !== null && (
        <Notice tone="ok">
          <p>{done}</p>
        </Notice>
      )}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>For</Th>
              <Th align="right">Advance</Th>
              <Th>Invoice</Th>
              <Th>Where it stands</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span className="cell-text" data-size="narrow">
                    <Link href={`/clients/${a.party.id}` as Route}>{a.party.displayName}</Link>
                  </span>
                  <Sub>Signed {longDay(a.billOn)}</Sub>
                </Td>
                <Td>
                  <span className="cell-text">{a.engagementId === null ? "Whole letter" : a.serviceName}</span>
                  <Sub>
                    <Link href={`/engagement-letters/${a.letter.id}` as Route}>{a.letter.ref}</Link>
                    {a.manager === null ? "" : ` · ${billingPersonName(a.manager)}`}
                  </Sub>
                </Td>
                <Td align="right" className="nowrap">
                  {a.amount === null ? <NotSet>Hidden</NotSet> : formatMoney(a.amount, a.currency)}
                  <Sub>before tax</Sub>
                </Td>
                <Td className="nowrap">
                  {a.invoice === null || a.invoice.status === "cancelled" ? (
                    <NotSet>Not raised</NotSet>
                  ) : (
                    <Link href={`/invoices/${a.invoice.id}` as Route}>{a.invoice.number}</Link>
                  )}
                </Td>
                <Td>
                  <AdvanceState advance={a} />
                </Td>
                <Td className="nowrap">
                  {(a.state === "not_raised" || a.state === "on_draft") && (
                    <Link href={"/invoices?tab=raise" as Route}>To raise</Link>
                  )}
                  {isAdmin && (a.state === "part_paid" || a.state === "paid") && (
                    <ConfirmAction
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      title={`Start ${a.party.displayName}'s work now?`}
                      confirmLabel="Approve start"
                      consequence={
                        <p>The work this advance holds starts today, and the rest of the invoice stays owed.</p>
                      }
                      onConfirm={() => void approve(a)}
                    >
                      Approve start
                    </ConfirmAction>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
