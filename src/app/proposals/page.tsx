"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { PartySummary, ProposalSummary } from "@/lib/api/client";

/**
 * What the firm has quoted, and to whom.
 *
 * The list is a summary read — totals and a line COUNT, not the lines. That is
 * the API's shape rather than this screen's choice, and it is why thirty
 * proposals cost one request instead of thirty-one.
 *
 * Money renders as an em dash for somebody without commercial visibility. The
 * API sends null rather than refusing the row, because "you may not see the
 * fee" and "there is no proposal" are different answers a person acts on
 * differently — so the client and the status are here either way.
 */
export default function ProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, book] = await Promise.all([
      api.GET("/api/v1/proposals", {}),
      api.GET("/api/v1/parties", {}),
    ]);
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setProposals(list.data.proposals);
    if (book.data) setParties(book.data.parties);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function draft(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const validUntil = String(form.get("validUntil") ?? "");
    const result = await api.POST("/api/v1/proposals", {
      body: {
        partyId: String(form.get("partyId")),
        title: String(form.get("title")),
        currency: String(form.get("currency")).toUpperCase(),
        // The rate back to the firm's own reporting currency. "1" when quoting
        // in it — sent rather than omitted, so "did we convert this?" is never
        // a question about a missing value.
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        ...(validUntil === "" ? {} : { validUntil }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/proposals/${result.data.id}`);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
      </nav>
      <h1>Proposals</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        {proposals.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing quoted yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Proposal</th>
                <th>Client</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.proposal.id}>
                  {/* The firm's own number for the document, first: it is what
                      a client quotes back and what an audit cites. */}
                  <td className="bib-mono">
                    <Link href={`/proposals/${p.proposal.id}`}>{p.proposal.ref}</Link>
                  </td>
                  <td>
                    <Link href={`/proposals/${p.proposal.id}`}>{p.proposal.title}</Link>
                    <div className="bib-muted" style={{ fontSize: 13 }}>
                      {p.lineCount} {p.lineCount === 1 ? "line" : "lines"}
                    </div>
                  </td>
                  {/* The client by NAME. The API returns a joined read model, so
                      a list of quotes is not a column of uuids. */}
                  <td>{p.party.displayName}</td>
                  <td>
                    <span className="bib-pill" data-tone={toneOf(p.proposal.status)}>
                      {p.proposal.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(p.totals.net, p.totals.currency)}
                  </td>
                  {/* The TRACK half of send/track: has the client looked at it. */}
                  <td className="bib-muted" style={{ fontSize: 13 }}>
                    {p.proposal.viewCount === 0 ? "not yet" : `${p.proposal.viewCount}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>New proposal</h2>
        <form
          action={(form) => {
            void draft(form);
          }}
        >
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div style={{ flex: "2 1 240px" }}>
              <label className="bib-label" htmlFor="title">
                Title
              </label>
              <input className="bib-input" id="title" name="title" required />
            </div>
            <div>
              <label className="bib-label" htmlFor="partyId">
                Client
              </label>
              <select
                className="bib-select"
                id="partyId"
                name="partyId"
                required
                style={{ width: "100%" }}
              >
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="currency">
                Quoted in
              </label>
              <input
                className="bib-input"
                id="currency"
                name="currency"
                defaultValue="INR"
                maxLength={3}
                required
              />
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
              <input
                className="bib-input"
                id="fxRateDate"
                name="fxRateDate"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div>
              <label className="bib-label" htmlFor="validUntil">
                Valid until
              </label>
              <input className="bib-input" id="validUntil" name="validUntil" type="date" />
            </div>
          </div>

          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Drafting…" : "Draft proposal"}
          </button>
        </form>
      </div>
    </main>
  );
}

/** Which pill a status wears. `rejected` and `expired` are the same kind of
 *  fact — this one is not going anywhere — and the rest are neutral. */
function toneOf(status: ProposalSummary["proposal"]["status"]): string {
  return status === "rejected" || status === "expired" ? "revoked" : "neutral";
}
