"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ClientTds } from "@/lib/api/client";
import { AmountInput, Button, Card, CardTitle, ErrorNotice, Field, FieldRow, Input } from "@/components/ui";
import { cleanAmount } from "@/lib/money";

/**
 * THE TDS THIS CLIENT DEDUCTS (Q057): the section and the rate.
 *
 * With one set, its invoices print the deduction under the total, on the
 * amount before tax, and the net it remits; the full total stays the bill, and
 * each payment records the TDS the client actually deducted beside the money.
 * An invoice already issued keeps the rate it went out with.
 */
export function TdsCard({ partyId, canWrite }: { partyId: string; canWrite: boolean }) {
  const [tds, setTds] = useState<ClientTds | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const r = await api.GET("/api/v1/clients/{partyId}/tds", { params: { path: { partyId } } });
    if (r.error) {
      setError(apiError(r.error).message);
      return;
    }
    setTds(r.data.tds);
  }, [partyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function save(next: { section: string; percent: string } | null): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await api.PUT("/api/v1/clients/{partyId}/tds", { params: { path: { partyId } }, body: { tds: next } });
    setBusy(false);
    if (r.error) {
      setError(apiError(r.error).message);
      return;
    }
    setTds(r.data.tds);
    setOpen(false);
  }

  return (
    <Card id="tds">
      <CardTitle level={2}>TDS deducted by the client</CardTitle>
      {tds === undefined ? (
        <p className="text-md text-muted">Loading…</p>
      ) : tds === null ? (
        <p className="text-md">Does not deduct TDS.</p>
      ) : (
        <p className="text-md">
          Deducts TDS under section <strong>{tds.section}</strong> at <strong>{Number(tds.percent)}%</strong>.
        </p>
      )}
      <p className="text-sm text-muted">
        Its invoices show &ldquo;Less: TDS&rdquo; on the amount before tax, then the net it pays. When it pays,
        record the TDS it deducted with the payment: the invoice is settled when both cover it.
      </p>
      <ErrorNotice error={error} />
      {canWrite && tds !== undefined && (
        <details
          className="card-foot"
          open={open}
          onToggle={(e) => {
            setOpen(e.currentTarget.open);
          }}
        >
          <summary>{tds === null ? "Set the TDS it deducts" : "Change or stop"}</summary>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void save({
                section: String(form.get("section") ?? "").trim(),
                percent: cleanAmount(String(form.get("percent") ?? "")),
              });
            }}
          >
            <FieldRow>
              <Field label="Section" hint="As the Act writes it, e.g. 194J.">
                <Input name="section" required maxLength={12} defaultValue={tds?.section ?? ""} placeholder="e.g. 194J" />
              </Field>
              <Field label="Rate %" hint="e.g. 10.">
                <AmountInput name="percent" decimals={2} required defaultValue={tds === null ? "" : String(Number(tds.percent))} placeholder="e.g. 10" />
              </Field>
            </FieldRow>
            <div className="cluster">
              <Button type="submit" variant="secondary" loading={busy}>
                Save
              </Button>
              {tds !== null && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void save(null);
                  }}
                >
                  It no longer deducts TDS
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
    </Card>
  );
}
