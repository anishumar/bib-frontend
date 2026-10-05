"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Colleague, TaxDefault } from "@/lib/api/client";
import { AdjustTab } from "@/app/invoices/adjust";

/**
 * THE CLIENT'S ADVANCES TAKEN BEFORE A LETTER (0363, Q044): the Invoices
 * tab's list, cut to this client, with Raise preset to it. Reads what the
 * raise dialog needs (the firm's companies, the colleagues, the default tax
 * rates) itself, so the page above does not carry it.
 */
export function ClientAdvancesPanel({ partyId, clientName }: { partyId: string; clientName: string }) {
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [taxDefaults, setTaxDefaults] = useState<TaxDefault[]>([]);
  const [reportingCurrency, setReportingCurrency] = useState("INR");

  useEffect(() => {
    void (async () => {
      const [firm, staff, settings] = await Promise.all([
        api.GET("/api/v1/firm-entities", {}),
        api.GET("/api/v1/tenancy/colleagues", {}),
        api.GET("/api/v1/billing/settings", {}),
      ]);
      if (firm.data) {
        setEntities(firm.data.entities.map((e) => ({ id: e.partyId, displayName: e.name })));
        setReportingCurrency(firm.data.reportingCurrency);
      }
      setColleagues(staff.data ? [...staff.data.colleagues] : []);
      setTaxDefaults(settings.data ? [...settings.data.taxDefaults] : []);
    })();
  }, []);

  return (
    <AdjustTab
      partyId={partyId}
      parties={[{ id: partyId, displayName: clientName, isOwnCompany: false }]}
      entities={entities}
      colleagues={colleagues}
      reportingCurrency={reportingCurrency}
      taxDefaults={taxDefaults}
    />
  );
}
