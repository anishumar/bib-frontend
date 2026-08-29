"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { InvoiceSummary, PartySummary } from "@/lib/api/client";

/**
 * What the firm has BILLED, and to whom.
 *
 * The number is the first column and it is the point of the screen: an invoice
 * number is what a client quotes back, what a tax authority cites, and — unlike
 * a proposal reference — it may never gap. The API allocates it from a per-
 * entity, per-financial-year counter inside the same transaction that writes
 * the row, so this screen never picks one and never shows a "pending number".
 *
 * ISSUING is deliberately not offered here. It sends a legal demand under one of
 * the firm's own entities and the API gates it on `tenant:admin`; a list is
 * where somebody skims, and a one-click issue on a skim screen is how the wrong
 * invoice goes out. It lives on the invoice's own page, next to what it says.
 */
export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, book, firm] = await Promise.all([
      api.GET("/api/v1/invoices", {}),
      api.GET("/api/v1/parties", {}),
      // WHICH OF THE FIRM'S OWN ENTITIES is charging. Not a free-text field and
      // not this app's guess: the preferences screen is where a firm says which
      // entity serves which country, and an invoice must be raised by one of
      // them because the series belongs to the entity.
      api.GET("/api/v1/firm-entities/preferences", {}),
    ]);
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setInvoices(list.data.invoices);
    if (book.data) setParties(book.data.parties);
    if (firm.data) {
      // One row per country, so the same entity appears more than once. The
      // picker wants each company once.
      const seen = new Map<string, string>();
      for (const p of firm.data.preferences) seen.set(p.firmEntity.id, p.firmEntity.displayName);
      setEntities([...seen].map(([id, displayName]) => ({ id, displayName })));
    }
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function raise(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const dueOn = String(form.get("dueOn") ?? "");
    const seriesDate = String(form.get("seriesDate") ?? "");
    const result = await api.POST("/api/v1/invoices", {
      body: {
        partyId: String(form.get("partyId")),
        entityPartyId: String(form.get("entityPartyId")),
        currency: String(form.get("currency")).toUpperCase(),
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        ...(dueOn === "" ? {} : { dueOn }),
        // Which financial year's series this belongs to. Offered because a firm
        // raising an invoice on 2 April for March's work is DECIDING it, not
        // discovering it — and the series it lands in is not reversible.
        ...(seriesDate === "" ? {} : { seriesDate }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/invoices/${result.data.id}`);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/receivables">Receivables →</Link>
      </nav>
      <h1>Invoices</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        {invoices.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing billed yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Client</th>
                <th>Status</th>
                <th>Due</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.invoice.id}>
                  <td className="bib-mono">
                    <Link href={`/invoices/${i.invoice.id}`}>{i.invoice.number}</Link>
                    {/* An IRN is the government registry's identifier for this
                        document. Shown here because a firm chasing an e-invoice
                        failure wants to see at a glance which are registered. */}
                    {i.invoice.irn !== null && (
                      <div className="bib-muted" style={{ fontSize: 13 }}>
                        IRN {i.invoice.irn}
                      </div>
                    )}
                  </td>
                  <td>{i.party.displayName}</td>
                  <td>
                    <span className="bib-pill" data-tone={toneOf(i.invoice.status)}>
                      {i.invoice.status}
                    </span>
                  </td>
                  <td className="bib-muted" style={{ fontSize: 13 }}>
                    {i.invoice.dueOn ?? "—"}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(i.totals.total, i.totals.currency)}
                    {/* The line count is what tells a zero total apart from an
                        empty draft — the API refuses to issue the second. */}
                    <div className="bib-muted" style={{ fontSize: 13 }}>
                      {i.totals.lineCount} {i.totals.lineCount === 1 ? "line" : "lines"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>New invoice</h2>
        <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
          The number is allocated by the write itself, from the issuing entity&apos;s series.
          It cannot be chosen, and once allocated it cannot be changed — a wrong invoice is
          cancelled and a new one issued, and both stay readable.
        </p>
        <form
          action={(form) => {
            void raise(form);
          }}
        >
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div style={{ flex: "2 1 220px" }}>
              <label className="bib-label" htmlFor="partyId">
                Bill to
              </label>
              <select className="bib-select" id="partyId" name="partyId" required style={{ width: "100%" }}>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 220px" }}>
              <label className="bib-label" htmlFor="entityPartyId">
                Charged by
              </label>
              <select
                className="bib-select"
                id="entityPartyId"
                name="entityPartyId"
                required
                style={{ width: "100%" }}
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName}
                  </option>
                ))}
              </select>
              <p className="bib-hint">Each of the firm&apos;s entities owns its own series.</p>
            </div>
          </div>

          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="currency">
                Billed in
              </label>
              <input className="bib-input" id="currency" name="currency" defaultValue="INR" maxLength={3} required />
            </div>
            <div>
              <label className="bib-label" htmlFor="fxRate">
                Rate to the firm&apos;s currency
              </label>
              <input className="bib-input" id="fxRate" name="fxRate" defaultValue="1" required />
            </div>
            <div>
              <label className="bib-label" htmlFor="fxRateDate">
                Rate dated
              </label>
              <input className="bib-input" id="fxRateDate" name="fxRateDate" type="date" defaultValue={today} required />
            </div>
            <div>
              <label className="bib-label" htmlFor="dueOn">
                Due
              </label>
              <input className="bib-input" id="dueOn" name="dueOn" type="date" />
              <p className="bib-hint">No due date is never chased.</p>
            </div>
            <div>
              <label className="bib-label" htmlFor="seriesDate">
                Series date
              </label>
              <input className="bib-input" id="seriesDate" name="seriesDate" type="date" defaultValue={today} />
              <p className="bib-hint">Which financial year&apos;s series.</p>
            </div>
          </div>

          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Raising…" : "Raise invoice"}
          </button>
        </form>
      </div>
    </main>
  );
}

/** A cancelled invoice wears the same pill a revoked membership does: it is
 *  still there, still numbered, and no longer in force. */
function toneOf(status: InvoiceSummary["invoice"]["status"]): string {
  if (status === "cancelled") return "revoked";
  return status === "issued" ? "live" : "neutral";
}
