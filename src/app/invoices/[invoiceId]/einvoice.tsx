"use client";

/**
 * THE E-INVOICE REGISTRATION as the portal returned it (0395): the IRN, the
 * Ack No., the Ack Date and the signed QR, recorded once and printed on the
 * issued invoice, as 10x's own invoices carry them. Nothing here talks to the
 * IRP: a person registers the invoice there and records the answer here.
 *
 * The portal's answer can be pasted whole: its JSON names the four as `Irn`,
 * `AckNo`, `AckDt` and `SignedQRCode`, and the boxes fill from it.
 */

import { useState } from "react";
import { Button, Field, FieldRow, FieldStack, Input, Textarea } from "@/components/ui";

interface Registration {
  irn: string;
  ackNumber: string | null;
  ackDate: string | null;
  signedQr: string | null;
}

/** The four facts out of the portal's JSON, or null when it is not that. */
function fromPortal(pasted: string): Partial<Registration> | null {
  try {
    const raw: unknown = JSON.parse(pasted);
    if (typeof raw !== "object" || raw === null) return null;
    // The answer may be wrapped: `{ "Data": { … } }` or `{ "data": { … } }`.
    const o = raw as Record<string, unknown>;
    const inner = (o["Data"] ?? o["data"] ?? o) as Record<string, unknown>;
    const text = (k: string): string | undefined => {
      const v = inner[k];
      return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
    };
    const found: Partial<Registration> = {};
    const irn = text("Irn");
    const ack = text("AckNo");
    const at = text("AckDt");
    const qr = text("SignedQRCode");
    if (irn !== undefined) found.irn = irn;
    if (ack !== undefined) found.ackNumber = ack;
    if (at !== undefined) found.ackDate = at;
    if (qr !== undefined) found.signedQr = qr;
    return Object.keys(found).length === 0 ? null : found;
  } catch {
    return null;
  }
}

export function EInvoiceForm({
  invoiceNumber,
  issued,
  busy,
  onRecord,
}: {
  invoiceNumber: string | null;
  issued: boolean;
  busy: boolean;
  onRecord: (body: Registration) => Promise<boolean>;
}) {
  const [irn, setIrn] = useState("");
  const [ackNumber, setAckNumber] = useState("");
  const [ackDate, setAckDate] = useState("");
  const [signedQr, setSignedQr] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  if (!issued) {
    return (
      <p className="mt-2 text-sm text-muted">
        Once it is issued and registered on the e-invoice portal, record the IRN and the QR here.
      </p>
    );
  }

  const blank = (v: string): string | null => (v.trim() === "" ? null : v.trim());

  return (
    /* Behind a disclosure (Wave 4): recorded once per invoice. */
    <details style={{ marginTop: "var(--s-3)" }}>
      <summary>Record the e-invoice details</summary>
      <form
        style={{ marginTop: "var(--s-3)" }}
        onSubmit={(event) => {
          event.preventDefault();
          void onRecord({ irn: irn.trim(), ackNumber: blank(ackNumber), ackDate: blank(ackDate), signedQr: blank(signedQr) });
        }}
      >
        <FieldStack>
          <Field
            label="Paste the portal's answer"
            optional
            hint="The JSON the e-invoice portal gave back. The boxes below fill from it."
          >
            <Textarea
              rows={2}
              placeholder='e.g. {"AckNo": 172621302389842, "AckDt": "2026-09-30 18:16:00", "Irn": "…"}'
              onChange={(e) => {
                const pasted = e.target.value.trim();
                if (pasted === "") {
                  setPasteNote(null);
                  return;
                }
                const found = fromPortal(pasted);
                if (found === null) {
                  setPasteNote("That is not the portal's answer. Fill the boxes below instead.");
                  return;
                }
                if (found.irn !== undefined) setIrn(found.irn);
                if (found.ackNumber !== undefined) setAckNumber(found.ackNumber ?? "");
                if (found.ackDate !== undefined) setAckDate(found.ackDate ?? "");
                if (found.signedQr !== undefined) setSignedQr(found.signedQr ?? "");
                setPasteNote("Filled from the portal's answer. Check them, then Record.");
              }}
            />
          </Field>
          {pasteNote !== null && (
            <p role="status" className="text-sm text-muted">
              {pasteNote}
            </p>
          )}
          <Field label="IRN" hint="It cannot change later.">
            <Input name="irn" required value={irn} placeholder="e.g. 453ff33a85e3687f…" onChange={(e) => { setIrn(e.target.value); }} />
          </Field>
          <FieldRow>
            <Field label="Ack No." optional>
              <Input name="ackNumber" inputMode="numeric" value={ackNumber} placeholder="e.g. 172621302389842" onChange={(e) => { setAckNumber(e.target.value); }} />
            </Field>
            <Field label="Ack Date" optional hint="As the portal writes it.">
              <Input name="ackDate" value={ackDate} placeholder="e.g. 2026-09-30 18:16:00" onChange={(e) => { setAckDate(e.target.value); }} />
            </Field>
          </FieldRow>
          <Field label="Signed QR code" optional hint="The SignedQRCode text. The invoice prints it as the QR.">
            <Textarea name="signedQr" rows={3} value={signedQr} maxLength={4000} onChange={(e) => { setSignedQr(e.target.value); }} />
          </Field>
          <div className="cluster">
            <Button
              type="submit"
              variant="secondary"
              disabled={busy}
              aria-label={`Record the e-invoice details for ${invoiceNumber ?? "this invoice"}`}
            >
              Record
            </Button>
          </div>
          <p className="text-sm text-muted">
            The issued invoice is filed again with these on it; the copy it replaces stays in its history.
          </p>
        </FieldStack>
      </form>
    </details>
  );
}
