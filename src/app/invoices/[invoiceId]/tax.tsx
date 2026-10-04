"use client";

import Link from "next/link";
import type { Route } from "next";
import type { InvoiceRecord } from "@/lib/api/client";
import { Card, CardTitle, Meta, MetaItem, NotSet, Select } from "@/components/ui";
import { useGstStates } from "@/components/state-select";
import { countryName } from "@/lib/country";

type Tax = InvoiceRecord["invoice"]["tax"];

/** How an invoice is taxed, in words (Q056). */
export function treatmentWords(tax: Tax, lut: InvoiceRecord["lut"]): string | null {
  switch (tax.treatment) {
    case "gst_intra":
      return "CGST + SGST: the client is in the same state";
    case "gst_intra_ut":
      return "CGST + UTGST: the client is in the same union territory";
    case "gst_inter":
      return "IGST: the client is in another state";
    case "gst_export_lut":
      return `Zero-rated export under LUT${lut === null ? "" : ` ${lut.reference}`}`;
    case "gst_export_igst":
      return "IGST on an export: no LUT recorded for the year";
    case "plain":
      return "One tax figure (not a GST invoice)";
    default:
      return null;
  }
}

/** The tax's parts on one line or on the totals, by treatment. */
export function taxParts(tax: Tax): readonly ("cgst" | "sgst" | "utgst" | "igst")[] {
  switch (tax.treatment) {
    case "gst_intra":
      return ["cgst", "sgst"];
    case "gst_intra_ut":
      return ["cgst", "utgst"];
    case "gst_inter":
    case "gst_export_igst":
    case "gst_export_lut":
      return ["igst"];
    default:
      return [];
  }
}

export const PART_LABEL: Readonly<Record<"cgst" | "sgst" | "utgst" | "igst", string>> = {
  cgst: "CGST",
  sgst: "SGST",
  utgst: "UTGST",
  igst: "IGST",
};

/**
 * WHAT THE INVOICE SAYS ABOUT TAX (Q056): which taxes, where it is supplied,
 * both GSTINs, reverse charge, the TDS the client deducts and where it pays.
 * On a draft it follows the client and the company until it is issued; the
 * place of supply can be chosen here for a client registered in several
 * states, or whose address names no state.
 */
export function TaxCard({
  record,
  canChoose,
  busy,
  onChoosePlace,
}: {
  record: InvoiceRecord;
  canChoose: boolean;
  busy: boolean;
  onChoosePlace: (stateCode: string | null) => void;
}) {
  const states = useGstStates();
  const tax = record.invoice.tax;
  const draft = record.invoice.status === "draft";
  const gst = tax.treatment !== null && tax.treatment !== "plain";
  const words = treatmentWords(tax, record.lut);
  const pos = tax.placeOfSupply;
  const place =
    pos === null
      ? null
      : pos.stateCode !== null
        ? `${pos.stateName ?? ""} (${pos.stateCode})`
        : `Outside India${pos.country === null ? "" : ` (${countryName(pos.country)})`}`;
  // A draft whose client's state cannot be read waits on a choice here.
  const unknownPlace = draft && record.issueBlocked?.reason === "PLACE_OF_SUPPLY_UNKNOWN";
  const offerPlace = draft && canChoose && (gst || unknownPlace) && pos?.country == null;

  return (
    <Card id="tax">
      <CardTitle level={2}>Tax</CardTitle>
      <Meta>
        <MetaItem label="How it is taxed">{words ?? <NotSet>Decided when the place of supply is known</NotSet>}</MetaItem>
        <MetaItem label="Place of supply">
          {offerPlace ? (
            <Select
              variant="quiet"
              size="sm"
              aria-label="Place of supply"
              value={tax.chosenPlaceOfSupply ?? ""}
              disabled={busy || states === null}
              onChange={(e) => {
                onChoosePlace(e.target.value === "" ? null : e.target.value);
              }}
            >
              <option value="">
                {unknownPlace ? "Choose the state" : `As the client: ${tax.chosenPlaceOfSupply === null && place !== null ? place : "its GSTIN or address"}`}
              </option>
              {(states ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          ) : place === null ? (
            <NotSet />
          ) : (
            place
          )}
        </MetaItem>
        {gst && <MetaItem label="Our GSTIN">{tax.supplierGstin ?? <NotSet />}</MetaItem>}
        {gst && <MetaItem label="Client's GSTIN">{tax.recipientGstin ?? <NotSet>Not registered</NotSet>}</MetaItem>}
        {gst && <MetaItem label="Reverse charge">No</MetaItem>}
        <MetaItem label="TDS by the client">
          {tax.tds === null ? (
            <NotSet>None</NotSet>
          ) : (
            `u/s ${tax.tds.section} @ ${String(Number(tax.tds.percent))}%`
          )}
          {draft && (
            <>
              {" · "}
              <Link href={`/clients/${record.party.id}#tds` as Route}>{tax.tds === null ? "Set" : "Change"}</Link>
            </>
          )}
        </MetaItem>
        <MetaItem label="Paid into">
          {record.bankAccount === null ? (
            <NotSet>
              No account. <Link href={"/admin/firm#invoicing" as Route}>Add one</Link>
            </NotSet>
          ) : (
            <>
              {record.bankAccount.bankName} {record.bankAccount.accountNumber}
              {record.bankAccount.ifsc !== null && <span className="text-sm text-muted"> · IFSC {record.bankAccount.ifsc}</span>}
            </>
          )}
        </MetaItem>
      </Meta>
      {draft && (
        <p className="mt-3 text-sm text-muted">
          A draft follows the client and the company until it is issued; then what it says here is fixed.
        </p>
      )}
    </Card>
  );
}
