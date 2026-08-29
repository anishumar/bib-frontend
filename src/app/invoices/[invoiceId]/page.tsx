"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Fact, Facts } from "@/lib/ui/record";

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

  if (!loaded) return <p className="bib-muted">Loading…</p>;
  if (record === null) {
    return (
      <main>
        <nav className="bib-nav">
          <Link href="/invoices">← Invoices</Link>
        </nav>
        <p className="bib-error">{error ?? "No such invoice."}</p>
      </main>
    );
  }

  const invoice = record.invoice;
  const draft = invoice.status === "draft";
  const issued = invoice.status === "issued";
  const mayAdmin = permissions.includes("tenant:admin");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/invoices">← Invoices</Link>
        <Link href="/receivables">Receivables →</Link>
      </nav>

      <div className="bib-record-head">
        <h1 className="bib-mono" style={{ marginBottom: 0 }}>
          {invoice.number}
        </h1>
        <span className="bib-pill" data-tone={invoice.status === "cancelled" ? "revoked" : issued ? "live" : "neutral"}>
          {invoice.status}
        </span>
      </div>

      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <Facts>
          <Fact label="Bill to">{record.party.displayName}</Fact>
          {/* WHO IS CHARGING — one of the firm's own entities, and the owner of
              the series this number came from. Two of a firm's companies each
              issue their own INV/2026-27/0001, so the number alone is not an
              identifier without this. */}
          <Fact label="Charged by">{record.entity.displayName}</Fact>
          <Fact label="Issued">{invoice.issuedOn ?? "not yet"}</Fact>
          <Fact label="Due">{invoice.dueOn ?? "no date"}</Fact>
          <Fact label="Series">
            <span className="bib-mono">
              FY {invoice.financialYear}–{String((invoice.financialYear + 1) % 100).padStart(2, "0")} · #
              {invoice.sequenceNumber}
            </span>
          </Fact>
          <Fact label="Rate">
            <span className="bib-mono">
              {invoice.fxRate} on {invoice.fxRateDate}
            </span>
          </Fact>
        </Facts>
      </div>

      {/* ── The money, as the database computed it ─────────────────────── */}
      {balance !== null && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>What is owed</h2>
          <Facts>
            <Fact label="Invoiced">
              <span className="bib-mono">{formatMoney(balance.invoiced, balance.currency)}</span>
            </Fact>
            <Fact label="Paid">
              <span className="bib-mono">{formatMoney(balance.paid, balance.currency)}</span>
            </Fact>
            <Fact label="Credited">
              <span className="bib-mono">{formatMoney(balance.credited, balance.currency)}</span>
            </Fact>
            <Fact label="Outstanding">
              {/* A NEGATIVE outstanding is not an error: the client overpaid, or
                  settled two invoices with one transfer. The API records what
                  actually arrived rather than what was tidy, and so does this. */}
              <strong className="bib-mono">{formatMoney(balance.outstanding, balance.currency)}</strong>
            </Fact>
          </Facts>
          {Number(balance.outstanding) < 0 && (
            <p className="bib-hint" style={{ marginBottom: 0 }}>
              More has been received than was billed — an overpayment, or one transfer settling
              more than this invoice.
            </p>
          )}
        </div>
      )}

      {/* ── The lines ──────────────────────────────────────────────────── */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Lines</h2>
        {record.lines.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing on it yet. An invoice with no lines asks the client for nothing, and the API
            refuses to issue one.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit</th>
                <th style={{ textAlign: "right" }}>Disc.</th>
                <th style={{ textAlign: "right" }}>Tax</th>
                <th style={{ textAlign: "right" }}>Net</th>
                {draft && <th />}
              </tr>
            </thead>
            <tbody>
              {record.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatCount(l.quantity)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(l.unitAmount, l.currency)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatCount(l.discountPercent)}%
                  </td>
                  {/* Tax is per LINE because it is per service: 18% on
                      professional fees and 0% on a recharge, on one invoice. */}
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatCount(l.taxPercent)}% · {formatMoney(l.tax, l.currency)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(l.net, l.currency)}
                  </td>
                  {draft && (
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="bib-button-quiet"
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} />
                <td style={{ textAlign: "right" }} className="bib-label">
                  Tax
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(record.totals.tax, record.totals.currency)}
                </td>
                {draft && <td />}
              </tr>
              <tr>
                <td colSpan={4} />
                <td style={{ textAlign: "right" }} className="bib-label">
                  Total
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  <strong>{formatMoney(record.totals.total, record.totals.currency)}</strong>
                </td>
                {draft && <td />}
              </tr>
            </tfoot>
          </table>
        )}

        {draft && (
          <form
            style={{ marginTop: "var(--bib-gap-2)" }}
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
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "3 1 240px" }}>
                <label className="bib-label" htmlFor="description">
                  Description
                </label>
                <input className="bib-input" id="description" name="description" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="quantity">
                  Qty
                </label>
                <input className="bib-input" id="quantity" name="quantity" defaultValue="1" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="unitAmount">
                  Unit amount
                </label>
                <input className="bib-input" id="unitAmount" name="unitAmount" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="discountPercent">
                  Discount %
                </label>
                <input className="bib-input" id="discountPercent" name="discountPercent" defaultValue="0" />
              </div>
              <div>
                <label className="bib-label" htmlFor="taxPercent">
                  Tax %
                </label>
                <input className="bib-input" id="taxPercent" name="taxPercent" defaultValue="0" />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy}>
              Add line
            </button>
          </form>
        )}
      </div>

      {/* ── Issue, cancel, register ────────────────────────────────────── */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>The document</h2>
        {!mayAdmin && (draft || issued) && (
          <p className="bib-hint" style={{ marginTop: 0 }}>
            Issuing and cancelling need <span className="bib-mono">tenant:admin</span>: both leave
            a permanent mark in a consecutive series a tax authority may ask about.
          </p>
        )}
        <div className="bib-nav" style={{ marginBottom: 0 }}>
          {draft && mayAdmin && (
            <button
              className="bib-button"
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
              className="bib-button-danger"
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
          <p className="bib-hint" style={{ marginBottom: 0 }}>
            Cancelled — and it keeps its number. The series stays consecutive, which is what shows
            an auditor where a number went. A replacement is a new invoice.
          </p>
        )}

        {/* The government registry's identifier. Nothing in this product talks
            to the IRP: this records an answer obtained elsewhere, exactly as the
            advance-fee gate records an attestation. */}
        <div style={{ marginTop: "var(--bib-gap-2)" }}>
          <Facts>
            <Fact label="IRN">
              {invoice.irn === null ? (
                <span className="bib-unstated">not registered</span>
              ) : (
                <span className="bib-mono">{invoice.irn}</span>
              )}
            </Fact>
          </Facts>
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
              <div className="bib-field-row">
                <div style={{ flex: "2 1 240px" }}>
                  <label className="bib-label" htmlFor="irn">
                    Record the e-invoice reference
                  </label>
                  <input className="bib-input" id="irn" name="irn" required />
                  <p className="bib-hint">
                    Obtained from the IRP elsewhere. It is the registry&apos;s identifier for this
                    document and cannot be replaced once recorded.
                  </p>
                </div>
                <div style={{ alignSelf: "end" }}>
                  <button className="bib-button" type="submit" disabled={busy}>
                    Record
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Money against it ───────────────────────────────────────────── */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Payments</h2>
        {payments.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>Nothing received.</p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Method</th>
                <th>Reference</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="bib-mono">{p.receivedOn}</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                  <td className="bib-mono bib-muted">{p.reference ?? "—"}</td>
                  {/* A NEGATIVE payment is a reversal — a bounced cheque — and
                      it is a row of its own beside the original rather than the
                      original edited away. Both are shown, which is the point. */}
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(p.amount, p.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {issued && (
          <form
            style={{ marginTop: "var(--bib-gap-2)" }}
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
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div>
                <label className="bib-label" htmlFor="amount">
                  Amount
                </label>
                <input className="bib-input" id="amount" name="amount" required />
                <p className="bib-hint">Negative for a reversal.</p>
              </div>
              <div>
                <label className="bib-label" htmlFor="receivedOn">
                  Received
                </label>
                <input className="bib-input" id="receivedOn" name="receivedOn" type="date" defaultValue={today} required />
              </div>
              <div>
                <label className="bib-label" htmlFor="method">
                  Method
                </label>
                <select className="bib-select" id="method" name="method" defaultValue="bank_transfer">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="reference">
                  Bank reference
                </label>
                <input className="bib-input" id="reference" name="reference" />
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="note">
                  Note
                </label>
                <input className="bib-input" id="note" name="note" />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy}>
              Record payment
            </button>
          </form>
        )}
        {!issued && (
          <p className="bib-hint" style={{ marginBottom: 0 }}>
            Money attaches only to an issued invoice: a draft has asked for nothing, and a
            cancelled one is a refund rather than a settlement.
          </p>
        )}
      </div>

      {/* ── Credit notes ───────────────────────────────────────────────── */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Credit notes</h2>
        {credits.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>Nothing credited.</p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Issued</th>
                <th>Why</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id}>
                  {/* Its OWN series, keyed separately from the invoice one — a
                      credit note is a distinct legal document. */}
                  <td className="bib-mono">{c.number}</td>
                  <td className="bib-mono">{c.issuedOn}</td>
                  <td>
                    {CREDIT_REASON_LABELS[c.reason]}
                    {c.note !== null && (
                      <div className="bib-muted" style={{ fontSize: 13 }}>{c.note}</div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(c.amount, c.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {issued && mayAdmin && (
          <form
            style={{ marginTop: "var(--bib-gap-2)" }}
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
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div>
                <label className="bib-label" htmlFor="creditAmount">
                  Amount
                </label>
                <input className="bib-input" id="creditAmount" name="creditAmount" required />
              </div>
              <div style={{ flex: "2 1 220px" }}>
                <label className="bib-label" htmlFor="reason">
                  Why
                </label>
                <select className="bib-select" id="reason" name="reason" required style={{ width: "100%" }}>
                  {CREDIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {CREDIT_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
                {/* The reason is mandatory and closed because without it the
                    numbers always reconcile and WHY money came off does not. */}
                <p className="bib-hint">
                  A category, not a sentence: &ldquo;how much did we write off to service
                  failures&rdquo; is a question free text cannot answer.
                </p>
              </div>
              <div style={{ flex: "2 1 220px" }}>
                <label className="bib-label" htmlFor="creditNote">
                  Particulars
                </label>
                <input className="bib-input" id="creditNote" name="creditNote" />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy}>
              Issue credit note
            </button>
          </form>
        )}
        {issued && !mayAdmin && (
          <p className="bib-hint" style={{ marginBottom: 0 }}>
            Issuing a credit note needs <span className="bib-mono">tenant:admin</span>: it takes
            money off a legal document, and somebody has to answer for it later.
          </p>
        )}
      </div>

      {/* ── How far it has been chased ─────────────────────────────────── */}
      {chased.length > 0 && (
        <div className="bib-card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Chased</h2>
          <table className="bib-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Action</th>
                <th>Fired at</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {chased.map((a) => (
                <tr key={a.id}>
                  <td className="bib-mono">{a.step}</td>
                  <td>{a.action.replace("_", " ")}</td>
                  <td className="bib-muted">D+{a.afterDays}</td>
                  <td>
                    <span className="bib-pill" data-tone={a.state === "rejected" ? "revoked" : a.state === "approved" ? "live" : "neutral"}>
                      {a.state.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="bib-hint" style={{ marginBottom: 0 }}>
            The worker climbs the ladder on its own. Credit hold and legal action are the two
            rungs it may reach and not apply — those wait for a partner on{" "}
            <Link href="/receivables">Receivables</Link>.
          </p>
        </div>
      )}
    </main>
  );
}
