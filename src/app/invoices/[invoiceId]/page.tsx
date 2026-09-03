"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import {
  CREDIT_REASONS,
  CREDIT_REASON_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  api,
  apiError,
  formatCount,
  formatMoney,
} from "@/lib/api/client";
import type {
  CreditNote,
  DunningAction,
  InvoiceBalance,
  InvoiceRecord,
  Payment,
} from "@/lib/api/client";
import { Meta, MetaItem, Pill, Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";
import { browserDay } from "@/lib/day";

/**
 * One invoice: what it says, what has been paid against it, and what is left.
 *
 * THE BALANCE IS NEVER COMPUTED HERE. The API returns invoiced, paid, credited
 * and outstanding, all computed by Postgres in `numeric` over three tables, and
 * this screen renders the four strings. Adding them up in JavaScript would be
 * the one place a rounding error could enter money that has already been agreed
 * — and it would put a second answer beside the database's.
 *
 * There is no "paid" badge, because there is no such column: an invoice's
 * status is about the DOCUMENT (drafted, sent, withdrawn) and what has been
 * paid is arithmetic. A badge would be a cache of a sum, and it would drift the
 * first time a payment was corrected.
 *
 * Every rule is the API's. Whether this invoice may still be edited, whether a
 * credit would exceed it, whether money may be applied at all: each comes back
 * as a refusal written to be acted on, and this screen shows it verbatim.
 */
export default function InvoicePage() {
  const router = useRouter();
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;

  const [record, setRecord] = useState<InvoiceRecord | null>(null);
  const [balance, setBalance] = useState<InvoiceBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [chased, setChased] = useState<DunningAction[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const path = { params: { path: { invoiceId } } };
    const [one, bal, paid, credited, dunning, me] = await Promise.all([
      api.GET("/api/v1/invoices/{invoiceId}", path),
      api.GET("/api/v1/invoices/{invoiceId}/balance", path),
      api.GET("/api/v1/invoices/{invoiceId}/payments", path),
      api.GET("/api/v1/invoices/{invoiceId}/credit-notes", path),
      api.GET("/api/v1/invoices/{invoiceId}/dunning", path),
      api.GET("/api/v1/auth/me", {}),
    ]);
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setRecord(one.data);
    if (bal.data) setBalance(bal.data);
    if (paid.data) setPayments(paid.data.payments);
    if (credited.data) setCredits(credited.data.creditNotes);
    if (dunning.data) setChased(dunning.data.actions);
    if (me.data) setPermissions(me.data.permissions);
    setError(null);
    setLoaded(true);
  }, [invoiceId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write goes through here: run it, show the API's own words on
   *  failure, and re-read on success rather than patching local state — the
   *  totals and the balance are the database's answer, not this screen's. */
  async function act(run: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await run();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!loaded) return <p className="muted">Loading…</p>;
  if (record === null) {
    return (
      <Page>
        <p className="notice" data-tone="danger" role="alert">{error ?? "No such invoice."}</p>
      </Page>
    );
  }

  const invoice = record.invoice;
  const draft = invoice.status === "draft";
  const issued = invoice.status === "issued";
  const mayAdmin = permissions.includes("tenant:admin");
  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();

  return (
    <Page>

      <PageHeader
        eyebrow="Commercial"
        title={<span className="mono">{invoice.number}</span>}
        aside={
          <Pill tone={invoice.status === "cancelled" ? "danger" : issued ? "accent" : "neutral"}>
            {invoice.status}
          </Pill>
        }
      />

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <Meta>
          <MetaItem label="Bill to">{record.party.displayName}</MetaItem>
          {/* WHO IS CHARGING — one of the firm's own entities, and the owner of
              the series this number came from. Two of a firm's companies each
              issue their own INV/2026-27/0001, so the number alone is not an
              identifier without this. */}
          <MetaItem label="Charged by">{record.entity.displayName}</MetaItem>
          <MetaItem label="Issued">{invoice.issuedOn ?? "not yet"}</MetaItem>
          <MetaItem label="Due">{invoice.dueOn ?? "no date"}</MetaItem>
          <MetaItem label="Series">
            <span className="mono">
              FY {invoice.financialYear}–{String((invoice.financialYear + 1) % 100).padStart(2, "0")} · #
              {invoice.sequenceNumber}
            </span>
          </MetaItem>
          <MetaItem label="Rate">
            <span className="mono">
              {invoice.fxRate} on {invoice.fxRateDate}
            </span>
          </MetaItem>
        </Meta>
      </div>

      {/* ── The money, as the database computed it ─────────────────────── */}
      {balance !== null && (
        <div className="card">
          <h2 className="card-title">What is owed</h2>
          <Meta>
            <MetaItem label="Invoiced">
              <span className="mono">{formatMoney(balance.invoiced, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Paid">
              <span className="mono">{formatMoney(balance.paid, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Credited">
              <span className="mono">{formatMoney(balance.credited, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Outstanding">
              {/* A NEGATIVE outstanding is not an error: the client overpaid, or
                  settled two invoices with one transfer. The API records what
                  actually arrived rather than what was tidy, and so does this. */}
              <strong className="mono">{formatMoney(balance.outstanding, balance.currency)}</strong>
            </MetaItem>
          </Meta>
          {Number(balance.outstanding) < 0 && (
            <p className="field-hint">
              More has been received than was billed — an overpayment, or one transfer settling
              more than this invoice.
            </p>
          )}
        </div>
      )}

      {/* ── The lines ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <h2 className="card-title">Lines</h2>
        {record.lines.length === 0 ? (
          <p className="muted">
            Nothing on it yet. An invoice with no lines asks the client for nothing, and the API
            refuses to issue one.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <Th>Description</Th>
                <Th style={{ textAlign: "right" }}>Qty</Th>
                <Th style={{ textAlign: "right" }}>Unit</Th>
                <Th style={{ textAlign: "right" }}>Disc.</Th>
                <Th style={{ textAlign: "right" }}>Tax</Th>
                <Th style={{ textAlign: "right" }}>Net</Th>
                {draft && <Th />}
              </tr>
            </thead>
            <tbody>
              {record.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatCount(l.quantity)}
                  </Td>
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatMoney(l.unitAmount, l.currency)}
                  </Td>
                  {/* A discount is a price, so the fee axis takes it too — an
                      em dash rather than "0%", which would be a figure this
                      reader was not shown rather than one that is true. */}
                  <Td style={{ textAlign: "right" }} className="mono">
                    {l.discountPercent === null ? "—" : `${formatCount(l.discountPercent)}%`}
                  </Td>
                  {/* Tax is per LINE because it is per service: 18% on
                      professional fees and 0% on a recharge, on one invoice. */}
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatCount(l.taxPercent)}% · {formatMoney(l.tax, l.currency)}
                  </Td>
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatMoney(l.net, l.currency)}
                  </Td>
                  {draft && (
                    <Td style={{ textAlign: "right" }}>
                      <button
                        className="btn" data-variant="secondary" data-size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            api.DELETE("/api/v1/invoices/{invoiceId}/lines/{lineId}", {
                              params: { path: { invoiceId, lineId: l.id } },
                            }),
                          )
                        }
                      >
                        Remove
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <Td colSpan={4} />
                <Td style={{ textAlign: "right" }} className="label">
                  Tax
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  {formatMoney(record.totals.tax, record.totals.currency)}
                </Td>
                {draft && <Td />}
              </tr>
              <tr>
                <Td colSpan={4} />
                <Td style={{ textAlign: "right" }} className="label">
                  Total
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  <strong>{formatMoney(record.totals.total, record.totals.currency)}</strong>
                </Td>
                {draft && <Td />}
              </tr>
            </tfoot>
          </table>
        )}

        {draft && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const discount = String(form.get("discountPercent") ?? "");
              const tax = String(form.get("taxPercent") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/lines", {
                  params: { path: { invoiceId } },
                  body: {
                    description: String(form.get("description")),
                    quantity: String(form.get("quantity")),
                    unitAmount: String(form.get("unitAmount")),
                    ...(discount === "" ? {} : { discountPercent: discount }),
                    ...(tax === "" ? {} : { taxPercent: tax }),
                  },
                }),
              );
            }}
          >
            <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
              <div style={{ flex: "3 1 240px" }}>
                <label className="label" htmlFor="description">
                  Description
                </label>
                <input className="input" id="description" name="description" required />
              </div>
              <div>
                <label className="label" htmlFor="quantity">
                  Qty
                </label>
                <input className="input" id="quantity" name="quantity" defaultValue="1" required />
              </div>
              <div>
                <label className="label" htmlFor="unitAmount">
                  Unit amount
                </label>
                <input className="input" id="unitAmount" name="unitAmount" required />
              </div>
              <div>
                <label className="label" htmlFor="discountPercent">
                  Discount %
                </label>
                <input className="input" id="discountPercent" name="discountPercent" defaultValue="0" />
              </div>
              <div>
                <label className="label" htmlFor="taxPercent">
                  Tax %
                </label>
                <input className="input" id="taxPercent" name="taxPercent" defaultValue="0" />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Add line
            </button>
          </form>
        )}
      </div>

      {/* ── Issue, cancel, register ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <h2 className="card-title">The document</h2>
        {!mayAdmin && (draft || issued) && (
          <p className="field-hint">
            Issuing and cancelling need <span className="mono">tenant:admin</span>: both leave
            a permanent mark in a consecutive series a tax authority may ask about.
          </p>
        )}
        <div className="cluster" style={{ marginBottom: 0 }}>
          {draft && mayAdmin && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/issue", { params: { path: { invoiceId } } }),
                )
              }
            >
              Issue
            </button>
          )}
          {(draft || issued) && mayAdmin && (
            <button
              className="btn" data-variant="destructive-quiet" data-size="sm"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/cancel", { params: { path: { invoiceId } } }),
                )
              }
            >
              Cancel
            </button>
          )}
        </div>
        {invoice.status === "cancelled" && (
          <p className="field-hint">
            Cancelled — and it keeps its number. The series stays consecutive, which is what shows
            an auditor where a number went. A replacement is a new invoice.
          </p>
        )}

        {/* The government registry's identifier. Nothing in this product talks
            to the IRP: this records an answer obtained elsewhere, exactly as the
            advance-fee gate records an attestation. */}
        <div>
          <Meta>
            <MetaItem label="IRN">
              {invoice.irn === null ? (
                <span className="unstated">not registered</span>
              ) : (
                <span className="mono">{invoice.irn}</span>
              )}
            </MetaItem>
          </Meta>
          {invoice.irn === null && (
            <form
              action={(form) => {
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/irn", {
                    params: { path: { invoiceId } },
                    body: { irn: String(form.get("irn")) },
                  }),
                );
              }}
            >
              <div className="field-row">
                <div style={{ flex: "2 1 240px" }}>
                  <label className="label" htmlFor="irn">
                    Record the e-invoice reference
                  </label>
                  <input className="input" id="irn" name="irn" required />
                  <p className="field-hint">
                    Obtained from the IRP elsewhere. It is the registry&apos;s identifier for this
                    document and cannot be replaced once recorded.
                  </p>
                </div>
                <div style={{ alignSelf: "end" }}>
                  <button className="btn" type="submit" disabled={busy}>
                    Record
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Money against it ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <h2 className="card-title">Payments</h2>
        {payments.length === 0 ? (
          <p className="muted">Nothing received.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th style={{ textAlign: "right" }}>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td className="mono">{p.receivedOn}</Td>
                  <Td>{PAYMENT_METHOD_LABELS[p.method]}</Td>
                  <Td className="mono muted">{p.reference ?? "—"}</Td>
                  {/* A NEGATIVE payment is a reversal — a bounced cheque — and
                      it is a row of its own beside the original rather than the
                      original edited away. Both are shown, which is the point. */}
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatMoney(p.amount, p.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {issued && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const reference = String(form.get("reference") ?? "");
              const note = String(form.get("note") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/payments", {
                  params: { path: { invoiceId } },
                  body: {
                    amount: String(form.get("amount")),
                    receivedOn: String(form.get("receivedOn")),
                    method: String(form.get("method")) as Payment["method"],
                    ...(reference === "" ? {} : { reference }),
                    ...(note === "" ? {} : { note }),
                  },
                }),
              );
            }}
          >
            <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
              <div>
                <label className="label" htmlFor="amount">
                  Amount
                </label>
                <input className="input" id="amount" name="amount" required />
                <p className="field-hint">Negative for a reversal.</p>
              </div>
              <div>
                <label className="label" htmlFor="receivedOn">
                  Received
                </label>
                <input className="input" id="receivedOn" name="receivedOn" type="date" defaultValue={today} required />
              </div>
              <div>
                <label className="label" htmlFor="method">
                  Method
                </label>
                <select className="select" id="method" name="method" defaultValue="bank_transfer">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <label className="label" htmlFor="reference">
                  Bank reference
                </label>
                <input className="input" id="reference" name="reference" />
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <label className="label" htmlFor="note">
                  Note
                </label>
                <input className="input" id="note" name="note" />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Record payment
            </button>
          </form>
        )}
        {!issued && (
          <p className="field-hint">
            Money attaches only to an issued invoice: a draft has asked for nothing, and a
            cancelled one is a refund rather than a settlement.
          </p>
        )}
      </div>

      {/* ── Credit notes ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <h2 className="card-title">Credit notes</h2>
        {credits.length === 0 ? (
          <p className="muted">Nothing credited.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Issued</Th>
                <Th>Why</Th>
                <Th style={{ textAlign: "right" }}>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id}>
                  {/* Its OWN series, keyed separately from the invoice one — a
                      credit note is a distinct legal document. */}
                  <Td className="mono">{c.number}</Td>
                  <Td className="mono">{c.issuedOn}</Td>
                  <Td>
                    {CREDIT_REASON_LABELS[c.reason]}
                    {c.note !== null && (
                      <div className="muted text-sm">{c.note}</div>
                    )}
                  </Td>
                  <Td style={{ textAlign: "right" }} className="mono">
                    {formatMoney(c.amount, c.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {issued && mayAdmin && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const note = String(form.get("creditNote") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/credit-notes", {
                  params: { path: { invoiceId } },
                  body: {
                    amount: String(form.get("creditAmount")),
                    reason: String(form.get("reason")) as CreditNote["reason"],
                    ...(note === "" ? {} : { note }),
                  },
                }),
              );
            }}
          >
            <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
              <div>
                <label className="label" htmlFor="creditAmount">
                  Amount
                </label>
                <input className="input" id="creditAmount" name="creditAmount" required />
              </div>
              <div style={{ flex: "2 1 220px" }}>
                <label className="label" htmlFor="reason">
                  Why
                </label>
                <select className="select" id="reason" name="reason" required style={{ width: "100%" }}>
                  {CREDIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {CREDIT_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                {/* The reason is mandatory and closed because without it the
                    numbers always reconcile and WHY money came off does not. */}
                <p className="field-hint">
                  A category, not a sentence: &ldquo;how much did we write off to service
                  failures&rdquo; is a question free text cannot answer.
                </p>
              </div>
              <div style={{ flex: "2 1 220px" }}>
                <label className="label" htmlFor="creditNote">
                  Particulars
                </label>
                <input className="input" id="creditNote" name="creditNote" />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Issue credit note
            </button>
          </form>
        )}
        {issued && !mayAdmin && (
          <p className="field-hint">
            Issuing a credit note needs <span className="mono">tenant:admin</span>: it takes
            money off a legal document, and somebody has to answer for it later.
          </p>
        )}
      </div>

      {/* ── How far it has been chased ─────────────────────────────────── */}
      {chased.length > 0 && (
        <div className="card">
          <h2 className="card-title">Chased</h2>
          <table className="table">
            <thead>
              <tr>
                <Th>Step</Th>
                <Th>Action</Th>
                <Th>Fired at</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {chased.map((a) => (
                <tr key={a.id}>
                  <Td className="mono">{a.step}</Td>
                  <Td>{a.action.replace("_", " ")}</Td>
                  <Td className="muted">D+{a.afterDays}</Td>
                  <Td>
                    <span className="pill" data-tone={a.state === "rejected" ? "danger" : a.state === "approved" ? "accent" : "neutral"}>
                      {a.state.replace("_", " ")}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="field-hint">
            The worker climbs the ladder on its own. Credit hold and legal action are the two
            rungs it may reach and not apply — those wait for a partner on{" "}
            <Link href="/receivables">Receivables</Link>.
          </p>
        </div>
      )}
      {/* An invoice's own paperwork — the issued PDF once T3.8 renders one, the
          client's remittance advice, a signed challan. `party:write` decides
          what to OFFER; the API is still the only place the answer lives. */}
      <Documents
        subjectKind="invoice"
        subjectRef={invoiceId}
        partyId={invoice?.partyId ?? undefined}
        canWrite={permissions.includes("party:write")}
        renderable="invoice"
        emptyHint="Nothing attached yet. A remittance advice, a signed challan, or the issued copy of this invoice belongs here."
      />
    </Page>
  );
}
