"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import type { BillingUnscheduled } from "@/lib/api/client";
import { longDay } from "@/lib/day";
import { BillingScheduleDialog, frequencyWord, type ScheduleSubject } from "@/components/billing-schedule";
import { Empty } from "@/components/states";
import { Button, Card, Notice, NotSet, Sub, Table, TableWrap, Td, Th } from "@/components/ui";

/**
 * BILLING NOT SET UP: recurring engagements the sweep will never bill, because
 * nobody has said from which period (auto-invoice, 0318).
 *
 * There is no firm-wide go-live date (Ashish, 2026-10-01): each engagement goes
 * live when its two dates are set, so a client already billed by hand is never
 * billed twice for an old month. The suggestion is the API's (the current
 * period, billed the day after it ends) and is what "Set billing" opens on.
 *
 * A fee group is billed once, so its engagements are ONE row here, and setting
 * it sets every engagement in the group (the API does that).
 */
export function NotSetUpTab({
  rows,
  canWrite,
  onChanged,
}: {
  rows: readonly BillingUnscheduled[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const [setting, setSetting] = useState<Row | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const grouped = byFeeGroup(rows);

  if (grouped.length === 0) {
    return (
      <>
        {said !== null && <Notice tone="ok">{said}</Notice>}
        <Card>
          <Empty title="Every recurring service has billing set up" icon="check" />
        </Card>
      </>
    );
  }

  return (
    <>
      {said !== null && <Notice tone="ok">{said}</Notice>}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>How often</Th>
              <Th>Started</Th>
              <Th>Suggested first bill</Th>
              {canWrite && (
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {grouped.map((r) => (
              <tr key={r.key}>
                <Td>
                  <span className="cell-text" data-size="narrow">
                    <Link href={`/clients/${r.first.party.id}` as Route}>{r.first.party.displayName}</Link>
                  </span>
                </Td>
                <Td>
                  <span className="cell-text">{r.services}</span>
                  {r.first.feeGroup !== null && <Sub>One fee: {r.first.feeGroup.title}</Sub>}
                  {r.first.entityName !== r.first.party.displayName && <Sub>{r.first.entityName}</Sub>}
                  <Sub>{r.first.letterRef}</Sub>
                </Td>
                <Td className="nowrap">{frequencyWord(r.first.billingFrequency)}</Td>
                <Td className="nowrap">{longDay(r.first.effectiveFrom)}</Td>
                <Td className="nowrap">
                  {r.first.suggestion === null ? (
                    <>
                      <NotSet />
                      <Sub>
                        <Link href={"/admin/firm#deadlines" as Route}>Set the financial year</Link>
                      </Sub>
                    </>
                  ) : (
                    <>
                      {r.first.suggestion.periodLabel}
                      <Sub>Invoice on {longDay(r.first.suggestion.firstInvoiceOn)}</Sub>
                    </>
                  )}
                </Td>
                {canWrite && (
                  <Td align="right">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Set billing for ${r.services}, ${r.first.party.displayName}`}
                      onClick={() => {
                        setSaid(null);
                        setSetting(r);
                      }}
                    >
                      Set billing
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <BillingScheduleDialog
        subject={setting === null ? null : subjectOf(setting)}
        suggestion={setting?.first.suggestion ?? null}
        onClose={() => {
          setSetting(null);
        }}
        onSaved={(set) => {
          const name = setting?.services ?? set.serviceName;
          setSetting(null);
          void (async () => {
            await onChanged();
            setSaid(
              set.firstInvoiceOn === null
                ? `Billing for ${name} is off.`
                : `${name} is billed from now on. First invoice ${longDay(set.firstInvoiceOn)}.`,
            );
          })();
        }}
      />
    </>
  );
}

interface Row {
  readonly key: string;
  readonly first: BillingUnscheduled;
  /** The service, or every service the fee group covers. */
  readonly services: string;
}

/** One row per engagement, except a fee group: one row for the group. */
function byFeeGroup(rows: readonly BillingUnscheduled[]): Row[] {
  const out = new Map<string, { first: BillingUnscheduled; names: string[] }>();
  for (const r of rows) {
    const key = r.feeGroup === null ? r.engagementId : `group-${r.feeGroup.id}`;
    const at = out.get(key);
    if (at === undefined) out.set(key, { first: r, names: [r.serviceName] });
    else if (!at.names.includes(r.serviceName)) at.names.push(r.serviceName);
  }
  return [...out.entries()]
    .map(([key, v]) => ({ key, first: v.first, services: [...v.names].sort((a, b) => a.localeCompare(b)).join(", ") }))
    .sort(
      (a, b) =>
        a.first.party.displayName.localeCompare(b.first.party.displayName) || a.services.localeCompare(b.services),
    );
}

function subjectOf(r: Row): ScheduleSubject {
  return {
    engagementId: r.first.engagementId,
    serviceName: r.services,
    clientName: r.first.party.displayName,
    billingFrequency: r.first.billingFrequency,
    feeGroupTitle: r.first.feeGroup?.title ?? null,
    billingFrom: r.first.billingFrom,
    firstInvoiceOn: r.first.firstInvoiceOn,
  };
}
