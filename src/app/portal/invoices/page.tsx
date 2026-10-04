"use client";

/**
 * The client portal's INVOICES (T6.7).
 *
 * ── THE PAGE THAT STOPPED THE FOOTER LYING ────────────────────────────────
 *
 * `/portal` carried a line reading *"your invoices and the firm's own documents
 * are not here yet — email 10x Global for those as you do now"*, which was true
 * when T6.6 wrote it and is the second sentence on that page to go stale inside
 * one task. This is the half that makes it false, and the footer moved with it.
 *
 * ── FOUR THINGS THIS SCREEN IS CAREFUL ABOUT ─────────────────────────────
 *
 * · MONEY IS A STRING, all the way from `numeric` in the database. Never
 *   `Number()` and never arithmetic in the browser: the four figures on a row
 *   are computed by `crm.invoice_balance` and printed. A subtraction done here
 *   would be a second source of truth about what a client owes.
 * · A DRAFT IS NOT HERE, and cannot be — the wall refuses it (migration 0066),
 *   not this component. A draft is a demand nobody has made yet.
 * · A CANCELLED ONE IS HERE, deliberately, and marked. A client holding a copy
 *   of a withdrawn invoice has to be able to see that it was withdrawn;
 *   removing it would leave them believing they still owe it.
 * · AND `dueOn` IS THE ONE INVENTED DATE THE PORTAL SHOWS. Everywhere else this
 *   product refuses to put a deadline it made up in front of a client. This one
 *   is already printed on the invoice they hold, and a page that hid it would
 *   disagree with a document the firm has already sent.
 *
 * ── THERE IS NO "PAY" BUTTON, AND ITS ABSENCE IS THE POINT ──────────────
 *
 * Payments are P11 (Phase 7) and nothing in this product takes money. A button
 * that opened a mailto, or a bank detail typed into a component, would be the
 * screen promising something the system cannot do — the same class of lie as a
 * `scan()` that returns clean. The page says how to pay in the firm's own terms
 * instead: ask them.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { NotSet } from "@/components/ui";
import type { PortalInvoice } from "@/lib/api/client";
import { Empty, Page, PageHeader, Pill, Table, TableWrap, Td, Th } from "@/components/tw";
import { ErrorState, Loading } from "@/components/states";
import { usePortalSession } from "../portal-frame";
import { browserDay, longDay } from "@/lib/day";

export default function PortalInvoicesPage() {
  const session = usePortalSession();
  const [invoices, setInvoices] = useState<PortalInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // // No day is sent (F-07-1): which companies this login may see is resolved
    // on the firm's own day, and a day from here can no longer reach it.
    const result = await api.GET("/api/v1/portal/invoices");
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setInvoices(result.data.invoices);
    setError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const firm = session?.tenantName ?? "your accountants";

  if (!loaded) return <Loading label="Loading your invoices" />;
  if (invoices === null) {
    return (
      <Page>
        <PageHeader title="Your invoices" />
        <ErrorState message={error ?? "This page could not be loaded."} />
      </Page>
    );
  }

  // OUTSTANDING ONLY, and only where the invoice is live. A cancelled invoice
  // carries no balance whatever its lines say, and adding one to a total a
  // client acts on would be the arithmetic this page refuses to do.
  const owing = invoices.filter((i) => i.status === "issued" && owes(i.outstanding));

  return (
    <Page>
      {/* HOW MANY ARE OPEN GOES IN THE LEDE, and it used to be a Section of its
          own with one sentence under it — a heading over a single line, above
          the table that actually answers it. NO TOTAL, deliberately: adding
          these together would be arithmetic done in a browser about somebody's
          money, across currencies this page cannot convert. Each row carries
          its own figure, computed in the database. */}
      <PageHeader
        title="Your invoices"
        lede={
          owing.length === 0
            ? "Nothing is outstanding."
            : `${owing.length === 1 ? "One is" : `${String(owing.length)} are`} still open.`
        }
      />

      {invoices.length === 0 ? (
        <Empty title="Nothing billed yet" icon="check">
          Invoices from {firm} appear here once they are issued.
        </Empty>
      ) : (
        <>
          {/* No section heading (Wave 4): one table on the page, under the title. */}
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>From</Th>
                  <Th>Issued</Th>
                  <Th>Due by</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Still owing</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceLine key={inv.invoiceId} inv={inv} today={browserDay()} />
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}

      <p className="max-w-[var(--measure)] text-sm text-muted">
        You cannot pay from this page. Settle as you do now.
      </p>
    </Page>
  );
}

function InvoiceLine({ inv, today }: { inv: PortalInvoice; today: string }) {
  const cancelled = inv.status === "cancelled";
  // String comparison on YYYY-MM-DD, which is what these are: no Date is
  // constructed, so no timezone can move a date by a day.
  const overdue =
    !cancelled && inv.dueOn !== null && inv.dueOn < today && owes(inv.outstanding);
  return (
    <tr>
      <Td>
        {inv.number}
        {cancelled && (
          <>
            {" "}
            {/* WITHDRAWN, AND STILL LISTED. A client holding a copy of this
                invoice needs to see that it was cancelled; removing the row
                would leave them believing they still owe it. */}
            <Pill tone="neutral">Cancelled</Pill>
          </>
        )}
      </Td>
      <Td>{inv.issuedBy}</Td>
      <Td>{inv.issuedOn === null ? <NotSet>Not issued</NotSet> : longDay(inv.issuedOn)}</Td>
      <Td>
        {inv.dueOn === null ? (
          <NotSet>No due date</NotSet>
        ) : (
          <>
            {longDay(inv.dueOn)}
            {overdue && (
              <>
                {" "}
                <Pill tone="danger">Past the date</Pill>
              </>
            )}
          </>
        )}
      </Td>
      {/* PRINTED, NEVER COMPUTED. These arrive as decimal strings from
          `crm.invoice_balance` and are shown as they arrived. */}
      <Td align="right" className="tabular-nums">
        <Money amount={inv.total} currency={inv.currency} />
      </Td>
      <Td align="right" className="tabular-nums">
        <Money amount={inv.paid} currency={inv.currency} />
      </Td>
      <Td align="right" className="tabular-nums">
        {cancelled ? (
          <NotSet>Nothing</NotSet>
        ) : inv.outstanding.trim().startsWith("-") && !isZero(inv.outstanding) ? (
          /* PAID OVER (audit 2026-10-03): a credit, never a minus amount owing. */
          <span className="text-muted">
            <Money amount={inv.outstanding.trim().replace(/^-/, "")} currency={inv.currency} /> paid over
          </span>
        ) : (
          <Money amount={inv.outstanding} currency={inv.currency} />
        )}
      </Td>
    </tr>
  );
}

/**
 * Money, as it arrived, through THE formatter (Wave 4): INR in lakhs with the
 * rupee sign, other currencies with their code, no ".00". `formatMoney` hands
 * the decimal string to `Intl.NumberFormat` exactly; no `Number()` anywhere.
 */
function Money({ amount, currency }: { amount: string; currency: string }) {
  return <>{formatMoney(amount, currency)}</>;
}

/** Whether a decimal string is zero, without parsing it as a number. */
/** Something is still owed: more than zero. Paid over is not owing. */
function owes(amount: string): boolean {
  return !isZero(amount) && !amount.trim().startsWith("-");
}

function isZero(amount: string): boolean {
  return /^-?0*(\.0*)?$/.test(amount.trim());
}

