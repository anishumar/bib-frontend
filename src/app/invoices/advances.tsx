"use client";

import Link from "next/link";
import type { Route } from "next";
import { billingPersonName, formatMoney, invoiceNumberWords } from "@/lib/api/client";
import type { BillingAdvance } from "@/lib/api/client";
import { longDay } from "@/lib/day";
import { AdvanceStage } from "@/components/advance-status";
import { Empty } from "@/components/states";
import { Card, NotSet, Sub, Table, TableWrap, Td, Th } from "@/components/ui";

/**
 * ADVANCES (auto-invoice 0320; 0322): every advance a signed letter asked for,
 * and where it stands. Since 0322 an advance holds no work: it is drafted at
 * signing and chased (Ashish, 2026-10-02), so this list is where the money is.
 * Pending first, overdue first among them, then the oldest. Who is reminded is
 * under each row: the SPOC, the Key Manager and the partner see it on My day.
 */
export function AdvancesTab({ advances }: { advances: readonly BillingAdvance[] }) {
  const sorted = [...advances].sort(
    (a, b) =>
      Number(b.pending) - Number(a.pending) ||
      Number(b.overdue) - Number(a.overdue) ||
      a.billOn.localeCompare(b.billOn),
  );

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
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>For</Th>
            <Th align="right">Advance</Th>
            <Th>Invoice</Th>
            <Th>Where it stands</Th>
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
                  {reminded(a)}
                </Sub>
              </Td>
              <Td align="right" className="nowrap">
                {a.amount === null ? <NotSet>Hidden</NotSet> : formatMoney(a.amount, a.currency)}
                <Sub>before tax</Sub>
              </Td>
              <Td className="nowrap">
                {a.invoice === null || a.invoice.status === "cancelled" ? (
                  <Link href={"/invoices?tab=raise" as Route}>To raise</Link>
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
  );
}

/** " · Sonal, Kiran, Pooja": who is reminded about it, while it is pending. */
function reminded(a: BillingAdvance): string {
  if (!a.pending) return "";
  const names = [...a.people.spocs, a.people.keyManager, a.people.partner]
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => billingPersonName(p));
  const unique = [...new Set(names)];
  return unique.length === 0 ? " · nobody to remind" : ` · ${unique.join(", ")}`;
}
