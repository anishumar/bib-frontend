"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { ADVANCE_STATE_WORDS, api, apiError, billingPersonName, formatMoney } from "@/lib/api/client";
import type { BillingAdvance, BillingAdvanceState } from "@/lib/api/client";
import { longInstant } from "@/lib/day";
import { ConfirmAction } from "@/components/confirm-action";
import { Card, CardTitle, ErrorNotice, NotSet, Pill, Sub, Table, TableWrap, Td, Th, type PillTone } from "@/components/ui";

/**
 * THE ADVANCE, on the letter (auto-invoice phase 2, 0320). Every advance is a
 * tax invoice, raised from To raise like any bill, and the work it holds starts
 * by itself when that invoice is paid in full. A part payment waits for an
 * admin's Approve start, offered here and on the Advances tab. This replaces the
 * old "Record the advance" button, which started the work on a click.
 *
 * Rendered only when the letter has an advance bill, so a letter with no
 * advance shows nothing.
 */
export function AdvanceStatus({ letterId, isAdmin }: { letterId: string; isAdmin: boolean }) {
  const [advances, setAdvances] = useState<BillingAdvance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped after an Approve start, to read the advances again. */
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await api.GET("/api/v1/billing/advances", {});
      if (!live) return;
      setAdvances(result.data?.advances.filter((a) => a.letter.id === letterId) ?? []);
    })();
    return () => {
      live = false;
    };
  }, [letterId, reads]);

  async function approve(a: BillingAdvance): Promise<void> {
    setError(null);
    setBusy(true);
    const result = await api.POST("/api/v1/billing/advances/{dueId}/approve-start", {
      params: { path: { dueId: a.id } },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setReads((n) => n + 1);
  }

  if (advances === null || advances.length === 0) return null;

  return (
    <Card>
      <CardTitle level={2}>Advance</CardTitle>
      <ErrorNotice error={error} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>For</Th>
              <Th align="right">Advance</Th>
              <Th>Invoice</Th>
              <Th>Where it stands</Th>
            </tr>
          </thead>
          <tbody>
            {advances.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span className="cell-text">{a.engagementId === null ? "The whole letter" : a.serviceName}</span>
                </Td>
                <Td align="right" className="nowrap">
                  {a.amount === null ? <NotSet>Hidden</NotSet> : formatMoney(a.amount, a.currency)}
                  <Sub>before tax</Sub>
                </Td>
                <Td className="nowrap">
                  {a.invoice === null || a.invoice.status === "cancelled" ? (
                    <Link href={"/invoices?tab=raise" as Route}>Raise it</Link>
                  ) : (
                    <Link href={`/invoices/${a.invoice.id}` as Route}>{a.invoice.number}</Link>
                  )}
                </Td>
                <Td>
                  <AdvanceState advance={a} />
                  {isAdmin && (a.state === "part_paid" || a.state === "paid") && (
                    <div className="mt-1">
                      <ConfirmAction
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        title="Start the work now?"
                        confirmLabel="Approve start"
                        consequence={
                          <p>
                            The work this advance holds starts today, and the rest of the invoice stays owed.
                          </p>
                        }
                        onConfirm={() => void approve(a)}
                      >
                        Approve start
                      </ConfirmAction>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

const STATE_TONE: Readonly<Record<BillingAdvanceState, PillTone>> = {
  not_raised: "warn",
  on_draft: "warn",
  unpaid: "neutral",
  part_paid: "warn",
  paid: "ok",
  started: "ok",
};

/** The state pill, with what was paid and who started it under it. */
export function AdvanceState({ advance: a }: { advance: BillingAdvance }) {
  return (
    <>
      <Pill dot tone={STATE_TONE[a.state]}>
        {ADVANCE_STATE_WORDS[a.state]}
      </Pill>
      {a.state === "part_paid" && a.balance !== null && a.balance.paid !== null && a.balance.invoiced !== null && (
        <Sub>
          {formatMoney(a.balance.paid, a.currency)} of {formatMoney(a.balance.invoiced, a.currency)} paid. Waiting
          for an admin.
        </Sub>
      )}
      {a.released !== null && (
        <Sub>
          {a.released.how === "approved"
            ? `Approved${a.released.by === null ? "" : ` by ${billingPersonName(a.released.by)}`}, `
            : "Paid in full, "}
          {longInstant(a.released.at)}
        </Sub>
      )}
    </>
  );
}
