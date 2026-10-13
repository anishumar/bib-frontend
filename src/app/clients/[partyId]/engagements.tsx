"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { api, apiError, SCHEDULED_FREQUENCIES } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { longDay, monthYear } from "@/lib/day";
import { Button, Card, CardHead, ErrorNotice, LinkButton, Notice, Sub, Table, TableWrap, Td, Th } from "@/components/ui";
import { EngagementActions, EngagementStatePill } from "@/components/engagement-life";
import { BillingScheduleDialog, frequencyWord, type ScheduleSubject } from "@/components/billing-schedule";

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
 *
 * BILLING (auto-invoice, 0318): how often each is billed and, for a monthly,
 * quarterly or yearly one, its schedule: "Not set up" until the two dates are
 * given, then the first period and its invoice date. "Set billing" / "Change"
 * open the same dialog Invoices' "Billing not set up" tab uses. A fee group's
 * engagements share one schedule; the API sets them together.
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
  const [setting, setSetting] = useState<ScheduleSubject | null>(null);
  const [said, setSaid] = useState<string | null>(null);

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

  // Nothing signed yet. Said in words: the section is opened on its own now,
  // and a blank one reads as broken.
  if (rows !== null && rows.length === 0) {
    return (
      <Card>
        <CardHead title="Engagements" level={2} />
        <p className="muted">None yet. They appear once an engagement letter is signed.</p>
      </Card>
    );
  }

  return (
    <Card>
      {/* Work vs Billing (Q041), filtered to this client: each service and
          period with its work, bill, invoice and money. */}
      <CardHead
        title="Engagements"
        level={2}
        aside={
          <LinkButton variant="ghost" size="sm" href={`/invoices?tab=work&client=${partyId}`}>
            Work vs Billing
          </LinkButton>
        }
      />
      <ErrorNotice error={error} />
      {said !== null && <Notice tone="ok">{said}</Notice>}
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
                <Th>Billing</Th>
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
                  <Td className="nowrap">
                    <BillingCell
                      e={e}
                      canWrite={canWrite}
                      onSet={() => {
                        setSaid(null);
                        setSetting({
                          engagementId: e.engagementId,
                          serviceName: e.description,
                          clientName: e.entityName,
                          billingFrequency: e.billingFrequency,
                          feeGroupTitle: e.feeGroup?.title ?? null,
                          billingFrom: e.billingFrom,
                          firstInvoiceOn: e.firstInvoiceOn,
                          workStartedOn: e.effectiveFrom,
                        });
                      }}
                    />
                  </Td>
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
      <BillingScheduleDialog
        subject={setting}
        suggestion={undefined}
        onClose={() => {
          setSetting(null);
        }}
        onSaved={(set) => {
          const name = setting?.serviceName ?? set.serviceName;
          setSetting(null);
          void (async () => {
            await load();
            setSaid(
              set.firstInvoiceOn === null
                ? `Billing for ${name} is off.`
                : `${name} is billed from now on. First invoice ${longDay(set.firstInvoiceOn)}.${set.notice === null ? "" : ` ${set.notice}`}`,
            );
          })();
        }}
      />
    </Card>
  );
}

/** How often, and the schedule when it has one. */
function BillingCell({
  e,
  canWrite,
  onSet,
}: {
  e: ClientEngagement;
  canWrite: boolean;
  onSet: () => void;
}) {
  const how = frequencyWord(e.billingFrequency);
  if (!SCHEDULED_FREQUENCIES.includes(e.billingFrequency ?? "")) {
    return (
      <>
        {how}
        <Sub>Billed by hand</Sub>
      </>
    );
  }
  const isSet = e.billingFrom !== null && e.firstInvoiceOn !== null;
  return (
    <>
      {how}
      {e.billingFrom !== null && e.firstInvoiceOn !== null ? (
        <>
          <Sub>From {monthYear(e.billingFrom)}</Sub>
          <Sub>First invoice {longDay(e.firstInvoiceOn)}</Sub>
        </>
      ) : (
        <Sub>
          <span className="tone-warn">Not set up</span>
        </Sub>
      )}
      {canWrite && (e.status !== "ended" || isSet) && (
        <Button
          variant="link"
          size="sm"
          aria-label={`${isSet ? "Change billing" : "Set billing"}: ${e.description} for ${e.entityName}`}
          onClick={onSet}
        >
          {isSet ? "Change" : "Set billing"}
        </Button>
      )}
    </>
  );
}
