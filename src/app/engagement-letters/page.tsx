"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { LetterSummary, PartySummary } from "@/lib/api/client";

/**
 * Engagement letters — what the firm has AGREED, as opposed to what it offered.
 *
 * The draft form asks for a jurisdiction, and that is not a formality: the
 * letter records the jurisdiction it was WRITTEN for, permanently, and it
 * decides which clauses may go on it. For a Dubai client of an Indian firm the
 * client's and the firm's differ, so the API asks rather than inferring — and
 * so does this form.
 */
export default function LettersPage() {
  const router = useRouter();
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advance, setAdvance] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, book] = await Promise.all([
      api.GET("/api/v1/engagement-letters", {}),
      api.GET("/api/v1/parties", {}),
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
    setLetters(list.data.letters);
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
    const amount = String(form.get("advanceAmount") ?? "").trim();
    const result = await api.POST("/api/v1/engagement-letters", {
      body: {
        partyId: String(form.get("partyId")),
        jurisdiction: String(form.get("jurisdiction")).toUpperCase(),
        title: String(form.get("title")),
        currency: String(form.get("currency")).toUpperCase(),
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        advanceRequired: advance,
        ...(advance && amount !== "" ? { advanceAmount: amount } : {}),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/engagement-letters/${result.data.id}`);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/proposals">Proposals</Link>
        <Link href="/catalogue">Catalogue</Link>
      </nav>
      <h1>Engagement letters</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        {letters.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing agreed yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Letter</th>
                <th>Client</th>
                <th>Where</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.letter.id}>
                  <td>
                    <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.title}</Link>
                    <div className="bib-muted" style={{ fontSize: 13 }}>
                      {l.lineCount} {l.lineCount === 1 ? "service" : "services"}
                      {l.letter.advanceRequired && " · advance required"}
                    </div>
                  </td>
                  <td>{l.party.displayName}</td>
                  <td className="bib-mono bib-muted">{l.letter.jurisdiction}</td>
                  <td>
                    <span
                      className="bib-pill"
                      data-tone={l.letter.status === "withdrawn" ? "revoked" : ""}
                    >
                      {l.letter.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }} className="bib-mono">
                    {formatMoney(l.totals.net, l.totals.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>New engagement letter</h2>
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
              <select className="bib-select" id="partyId" name="partyId" required
                      style={{ width: "100%" }}>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="bib-label" htmlFor="jurisdiction">
                Written for
              </label>
              {/* Stated, not inferred: not always the client's, not always the
                  firm's, and it decides which clauses may go on the letter. */}
              <input className="bib-input" id="jurisdiction" name="jurisdiction"
                     defaultValue="IN" maxLength={2} required />
            </div>
          </div>

          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="currency">
                Currency
              </label>
              <input className="bib-input" id="currency" name="currency" defaultValue="INR"
                     maxLength={3} required />
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
              <input className="bib-input" id="fxRateDate" name="fxRateDate" type="date"
                     defaultValue={today} required />
            </div>
          </div>

          <label className="bib-check" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <input
              type="checkbox"
              checked={advance}
              onChange={(e) => {
                setAdvance(e.target.checked);
              }}
            />
            <span>
              An advance is required before work begins. Engagements will be held until it is
              recorded — no advance, no jobs.
            </span>
          </label>
          {advance && (
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "0 1 200px" }}>
                <label className="bib-label" htmlFor="advanceAmount">
                  Advance amount
                </label>
                {/* Required once the box is ticked — the API refuses a gate with
                    no figure, because nobody can pass one. */}
                <input className="bib-input" id="advanceAmount" name="advanceAmount" required />
              </div>
            </div>
          )}

          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Drafting…" : "Draft letter"}
          </button>
        </form>
      </div>
    </main>
  );
}
