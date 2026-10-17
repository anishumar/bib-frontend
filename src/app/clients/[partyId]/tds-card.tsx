"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ClientTds } from "@/lib/api/client";
import { AmountInput, Button, Card, CardTitle, ErrorNotice, Field, FieldRow, Input } from "@/components/ui";
import { cleanAmount } from "@/lib/money";
import { FormOrButton } from "./client-sections";

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

  async function save(next: { section: string; percent: string } | null): Promise<boolean> {
    setBusy(true);
    setError(null);
    const r = await api.PUT("/api/v1/clients/{partyId}/tds", { params: { path: { partyId } }, body: { tds: next } });
    setBusy(false);
    if (r.error) {
      setError(apiError(r.error).message);
      return false;
    }
    setTds(r.data.tds);
    return true;
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
        // While it deducts nothing, the form is the card; once it does, the
        // rate reads as a sentence and the form waits behind Change.
        <FormOrButton folded={tds !== null} label="Change or stop">
          {({ done, cancel }) => (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void save({
                section: String(form.get("section") ?? "").trim(),
                percent: cleanAmount(String(form.get("percent") ?? "")),
              }).then((ok) => {
                if (ok) done();
              });
            }}
          >
            <FieldRow>
              <Field label="Section" hint="As the Act writes it: 194J, or 393(1) Sl6(iii)D(b)-Fees under the 2025 Act.">
                <Input name="section" required maxLength={40} defaultValue={tds?.section ?? ""} placeholder="e.g. 393(1) Sl6(iii)D(b)-Fees" />
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
                    void save(null).then((ok) => {
                      if (ok) done();
                    });
                  }}
                >
                  It no longer deducts TDS
                </Button>
              )}
              {cancel}
            </div>
          </form>
          )}
        </FormOrButton>
      )}
    </Card>
  );
}
