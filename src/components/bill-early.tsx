"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { BillingEarlyBill } from "@/lib/api/client";
import { longDay } from "@/lib/day";
import { Button, Card, CardTitle, ErrorNotice } from "@/components/ui";

/**
 * RAISE INVOICE NOW (Q071 b; Ashish, 4 Oct 2026: "after a job/task is closed,
 * offer to raise the invoice"). Recurring work finished before its bill date:
 * the bill of that period is made on its date (the period's last day, or a
 * yearly filing's due date), and this offers it today instead. Pressing it
 * writes the bill and takes the reader to Invoices, To raise, where it is
 * ticked and raised the ordinary way; it is the bill the daily run would have
 * made, made sooner, never a second one.
 *
 * Asks the API about one job or one task and renders nothing when there is
 * nothing to offer (work not done, billed already, automatic billing off, or a
 * login that may not read bills).
 */
export function BillEarly({
  jobId,
  workItemId,
  canWrite,
}: {
  jobId?: string;
  workItemId?: string;
  /** `party:write`: writing a bill. Without it the card only says the bill
   *  can be made early. */
  canWrite: boolean;
}) {
  const [periods, setPeriods] = useState<BillingEarlyBill[] | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await api.GET("/api/v1/billing/bill-early", {
        params: {
          query: { ...(jobId === undefined ? {} : { jobId }), ...(workItemId === undefined ? {} : { workItemId }) },
        },
      });
      if (live) setPeriods(result.data?.periods ?? []);
    })();
    return () => {
      live = false;
    };
  }, [jobId, workItemId]);

  async function billNow(p: BillingEarlyBill): Promise<void> {
    // Clear the refusal BEFORE the call: a notice focuses when it appears, so
    // the same refusal twice must disappear in between.
    setError(null);
    setBusy(true);
    const result = await api.POST("/api/v1/billing/bill-early", {
      body: { subjectKey: p.subjectKey, periodStart: p.period.start },
    });
    if (result.error) {
      setBusy(false);
      setError(apiError(result.error).message);
      return;
    }
    router.push("/invoices?tab=raise" as Route);
  }

  if (periods === null || periods.length === 0) return null;

  return (
    <Card>
      <CardTitle level={2}>Bill this work now</CardTitle>
      <ErrorNotice error={error} />
      {periods.map((p) => (
        <div key={`${p.subjectKey}:${p.period.start}`} className="stack tight max-w-[var(--measure)]">
          <p>
            <strong>
              {p.serviceName} for {p.period.label}
            </strong>{" "}
            · {p.party.displayName}
          </p>
          <p className="text-ink-2">
            The work finished on {longDay(p.work.doneOn)}. Its bill is due on {longDay(p.plannedBillOn)}
            {p.datedByFiling === null ? "" : `, the ${p.datedByFiling.name} due date`}. You can raise the
            invoice today instead: the bill goes to To raise, where you raise it.
          </p>
          {/* No figure for a login that may not see fees, nor for a letter
              that names no price: the bill then asks for one when raised. */}
          {p.fullAmount !== null && (
            <p className="text-ink-2">Fee: {formatMoney(p.fullAmount, p.currency)} before tax</p>
          )}
          {canWrite && (
            <div className="cluster">
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                aria-label={`Raise invoice now: ${p.serviceName} for ${p.period.label}`}
                onClick={() => void billNow(p)}
              >
                Raise invoice now
              </Button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
