"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { ADVANCE_STAGE_WORDS, agoWords, api, formatMoney, invoiceNumberWords } from "@/lib/api/client";
import type { BillingAdvance, BillingAdvanceStage } from "@/lib/api/client";
import { Card, CardTitle, NotSet, Pill, Sub, Table, TableWrap, Td, Th, type PillTone } from "@/components/ui";

/**
 * THE ADVANCE, on the letter (auto-invoice 0320; 0322). Every advance is a tax
 * invoice, drafted the moment the letter is signed, and it holds no work: the
 * work started at signing (Ashish, 2026-10-02). This card says where the
 * advance stands; the SPOC, the Key Manager and the partner are reminded on My
 * day, and the admins weekly. Rendered only when the letter has an advance.
 */
export function AdvanceStatus({ letterId }: { letterId: string }) {
  const [advances, setAdvances] = useState<BillingAdvance[] | null>(null);

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
  }, [letterId]);

  if (advances === null || advances.length === 0) return null;

  return (
    <Card>
      <CardTitle level={2}>Advance</CardTitle>
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
                    <Link href={`/invoices/${a.invoice.id}` as Route}>{invoiceNumberWords(a.invoice.number)}</Link>
                  )}
                </Td>
                <Td>
                  <AdvanceStage advance={a} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

const STAGE_TONE: Readonly<Record<BillingAdvanceStage, PillTone>> = {
  not_raised: "warn",
  on_draft: "warn",
  unpaid: "neutral",
  part_paid: "warn",
  paid: "ok",
};

/** The stage pill, and one line under it: how long it has waited, or why it
 *  has no invoice. Overdue turns the pill to the danger tone. */
export function AdvanceStage({ advance: a }: { advance: BillingAdvance }) {
  const tone: PillTone = a.status === "skipped" ? "neutral" : a.overdue ? "danger" : STAGE_TONE[a.stage];
  return (
    <>
      <Pill dot tone={tone}>
        {a.status === "skipped" ? "Skipped" : a.overdue ? `${ADVANCE_STAGE_WORDS[a.stage]}, overdue` : ADVANCE_STAGE_WORDS[a.stage]}
      </Pill>
      {a.status !== "skipped" && <Sub>{advanceLine(a)}</Sub>}
    </>
  );
}

/** What the reader can do about it, in one short line. */
export function advanceLine(a: BillingAdvance): string {
  if (a.stage === "paid") return "Settled.";
  if (a.stage === "not_raised") {
    if (a.draftBlocked === "no_tax_rate") return `No tax rate for ${a.issuer.displayName}. Set one on Your firm.`;
    if (a.draftBlocked === "billed_by_hand" && a.handRaised !== null) {
      return `Already invoiced by hand on ${a.handRaised.number}? An admin links it.`;
    }
    return `Not invoiced. Signed ${agoWords(a.daysPending)}.`;
  }
  if (a.stage === "on_draft") return `Waiting for an admin to issue it. Signed ${agoWords(a.daysPending)}.`;
  if (a.stage === "part_paid" && a.balance !== null && a.balance.paid !== null && a.balance.invoiced !== null) {
    return `${formatMoney(a.balance.paid, a.currency)} of ${formatMoney(a.balance.invoiced, a.currency)} paid. Issued ${agoWords(a.daysPending)}.`;
  }
  return `Issued ${agoWords(a.daysPending)}.`;
}
