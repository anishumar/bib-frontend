"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { PendingDunning, Receivable } from "@/lib/api/client";

/**
 * Who owes the firm money, and what is being done about it.
 *
 * Two lists that answer two different questions. The first is arithmetic —
 * every issued invoice with something still on it, computed by the database
 * over invoices, payments and credit notes. The second is POLICY: the rungs the
 * worker climbed to and stopped at, because credit hold and legal action are
 * the two things on the ladder a firm cannot take back with an apology.
 *
 * THE DECISION QUEUE IS THE POINT OF THIS SCREEN. A machine may chase; only a
 * person may put a client on credit hold. The worker leaves the rung
 * `pending_approval` and nothing further happens until somebody here decides —
 * and a rejection is recorded as loudly as an approval, because "we considered
 * legal action and decided against it" is a fact somebody wants three months
 * later.
 */
export default function ReceivablesPage() {
  const router = useRouter();
  const [owing, setOwing] = useState<Receivable[]>([]);
  const [pending, setPending] = useState<PendingDunning[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, queue, me] = await Promise.all([
      api.GET("/api/v1/receivables", {}),
      api.GET("/api/v1/dunning/pending", {}),
      api.GET("/api/v1/auth/me", {}),
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
    setOwing(list.data.receivables);
    if (queue.data) setPending(queue.data.actions);
    if (me.data) setPermissions(me.data.permissions);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function decide(actionId: string, approve: boolean, note: string): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/dunning/{actionId}/decide", {
      params: { path: { actionId } },
      body: { approve, ...(note === "" ? {} : { note }) },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const mayDecide = permissions.includes("tenant:admin");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/invoices">Invoices →</Link>
      </nav>
      <h1>Receivables</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      {/* ── Waiting for a person ───────────────────────────────────────── */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Waiting for a decision</h2>
        {pending.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing has reached a step that needs a person.
          </p>
        ) : (
          <>
            <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
              The worker climbed to these and stopped. Credit hold and legal action are the two
              rungs it may reach and may not apply.
            </p>
            <table className="bib-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Step</th>
                  <th style={{ textAlign: "right" }}>Outstanding</th>
                  {mayDecide && <th>Decide</th>}
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.action.id}>
                    {/* WHOSE. The decision is "put this client on credit hold",
                        and a queue that showed a uuid would be asking somebody
                        to approve something they cannot see. */}
                    <td>{p.party.displayName}</td>
                    <td className="bib-mono">
                      <Link href={`/invoices/${p.action.invoiceId}`}>{p.invoiceNumber}</Link>
                      <div className="bib-muted" style={{ fontSize: 13 }}>
                        due {p.dueOn ?? "—"}
                      </div>
                    </td>
                    <td className="bib-mono">
                      {p.action.step} <span className="bib-muted">D+{p.action.afterDays}</span>
                      <div>
                        <span className="bib-pill" data-tone="revoked">
                          {p.action.action.replace("_", " ")}
                        </span>
                      </div>
                    </td>
                    {/* Read NOW, not when the rung fired. A debt settled since
                        is exactly the case a partner rejects, and a stale
                        figure would hide it. */}
                    <td style={{ textAlign: "right" }} className="bib-mono">
                      {formatMoney(p.outstanding, p.currency)}
                    </td>
                    {mayDecide && (
                      <td>
                        <form
                          action={(form) => {
                            void decide(
                              p.action.id,
                              String(form.get("verdict")) === "approve",
                              String(form.get("why") ?? ""),
                            );
                          }}
                        >
                          <div className="bib-field-row">
                            <input
                              className="bib-input"
                              name="why"
                              placeholder="Why (optional)"
                              style={{ flex: "2 1 160px" }}
                            />
                            <button className="bib-button-danger" type="submit" name="verdict" value="approve" disabled={busy}>
                              Approve
                            </button>
                            <button className="bib-button-quiet" type="submit" name="verdict" value="reject" disabled={busy}>
                              Reject
                            </button>
                          </div>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="bib-hint" style={{ marginBottom: 0 }}>
              {mayDecide
                ? "A decision is final — the database refuses to change one. Rejecting is recorded too: the firm looked and chose not to, which is a fact somebody will want later."
                : "Deciding these needs tenant:admin."}
            </p>
          </>
        )}
      </div>

      {/* ── What is owed ───────────────────────────────────────────────── */}
      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Outstanding</h2>
        {owing.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing outstanding. Only ISSUED invoices appear here — a draft has asked nobody for
            anything, and a cancelled one was withdrawn.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Invoice</th>
                <th>Due</th>
                <th style={{ textAlign: "right" }}>Invoiced</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Credited</th>
                <th style={{ textAlign: "right" }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {owing.map((r) => (
                <tr key={r.balance.invoiceId}>
                  <td>{r.party.displayName}</td>
                  <td className="bib-mono">
                    <Link href={`/invoices/${r.balance.invoiceId}`}>{r.number}</Link>
                  </td>
                  <td className="bib-mono">
                    {r.balance.dueOn ?? <span className="bib-unstated">no date</span>}
                    {/* A receivable with no due date is never chased — the firm
                        never said when to pay, and the ladder counts days from
                        a date that does not exist. Worth seeing on this screen
                        rather than wondering why nothing happened. */}
                    {r.balance.dueOn !== null && r.balance.dueOn < today && (
                      <div className="bib-muted" style={{ fontSize: 13 }}>overdue</div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(r.balance.invoiced, r.balance.currency)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(r.balance.paid, r.balance.currency)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(r.balance.credited, r.balance.currency)}
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    <strong>{formatMoney(r.balance.outstanding, r.balance.currency)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
