"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { LetterSummary, PartySummary } from "@/lib/api/client";

/**
 * Engagement letters — what the firm has AGREED, as opposed to what it offered.
 *
 * EVERY ROW LEADS WITH ITS REFERENCE. `EL-2026-0001` is the string the client
 * quotes back down the phone, the one an invoice narrates and a court filing
 * cites; the uuid is the system's name for the letter and this is the firm's.
 * A list that showed only the title made the one question a caller actually
 * asks — "which letter?" — unanswerable from this screen.
 *
 * The draft form asks WHERE and WHO separately, and that is not a formality.
 * `jurisdiction` is the law the letter is written under and it decides which
 * clauses may go on it; the ISSUING ENTITY is which of the firm's own companies
 * is bound by it. The letter that started this review was issued by the US
 * entity and printed Indian law, and nothing in the schema could have caught it
 * because nothing knew who had issued it.
 */
export default function LettersPage() {
  const router = useRouter();
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advance, setAdvance] = useState(false);
  // The prose and the dates are settable HERE and nowhere else: a letter is
  // editable only while it is a draft, and there is deliberately no route that
  // rewrites a sent one — the client already has it as it was sent.
  const [moreTerms, setMoreTerms] = useState(false);

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
    // Only what has a value. An empty string is not a date, not a paragraph and
    // not a party — sending one would be this form asserting a fact nobody
    // entered, and the API's schemas refuse it anyway.
    const text = (name: string): string => String(form.get(name) ?? "").trim();
    const background = text("background");
    const addressedToPartyId = text("addressedToPartyId");
    const issuedOn = text("issuedOn");
    const effectiveFrom = text("effectiveFrom");
    const supersedesId = text("supersedesId");
    const issuingEntityPartyId = text("issuingEntityPartyId");

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
        ...(issuingEntityPartyId === "" ? {} : { issuingEntityPartyId }),
        ...(background === "" ? {} : { background }),
        ...(addressedToPartyId === "" ? {} : { addressedToPartyId }),
        ...(issuedOn === "" ? {} : { issuedOn }),
        ...(effectiveFrom === "" ? {} : { effectiveFrom }),
        ...(supersedesId === "" ? {} : { supersedesId }),
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
  // A letter already replaced cannot be replaced again — the API refuses a
  // second successor, naming the first — and a draft or a withdrawn letter was
  // never supersedable at all. The list already carries both facts, so the
  // picker offers only what will work rather than a slower error.
  const replaced = new Set(
    letters.map((l) => l.letter.supersedesId).filter((id): id is string => id !== null),
  );
  const supersedable = letters.filter(
    (l) => l.letter.status === "signed" && !replaced.has(l.letter.id),
  );

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
                <th>Ref</th>
                <th>Letter</th>
                <th>Client</th>
                <th>Issued by</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.letter.id}>
                  {/* The number, first, because it is what somebody arrives
                      holding. */}
                  <td className="bib-mono">
                    <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.ref}</Link>
                  </td>
                  <td>
                    <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.title}</Link>
                    <div className="bib-muted" style={{ fontSize: 13 }}>
                      {l.lineCount} {l.lineCount === 1 ? "service" : "services"}
                      {l.letter.advanceRequired && " · advance required"}
                      {l.letter.effectiveFrom !== null && ` · from ${l.letter.effectiveFrom}`}
                    </div>
                  </td>
                  <td>{l.party.displayName}</td>
                  {/* WHO is bound, and WHERE the law is — the two questions the
                      jurisdiction alone could never answer, side by side. */}
                  <td>
                    {l.issuingEntity.displayName}
                    <div className="bib-mono bib-muted" style={{ fontSize: 13 }}>
                      {l.letter.jurisdiction}
                    </div>
                  </td>
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

          <label className="bib-check" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <input
              type="checkbox"
              checked={moreTerms}
              onChange={(e) => {
                setMoreTerms(e.target.checked);
              }}
            />
            <span>
              Write the document — who it is addressed to, why they are buying, its date, when
              the work begins, and the letter it replaces. Every one of these is frozen at
              signature, and none of them can be added afterwards.
            </span>
          </label>

          {moreTerms && (
            <>
              <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
                <div style={{ flex: "2 1 220px" }}>
                  <label className="bib-label" htmlFor="issuingEntityPartyId">
                    Issued by
                  </label>
                  {/* Stored, never derived: the firm's rule for picking an
                      entity may change, and re-deriving this at read time would
                      silently restate every letter already issued. Left blank,
                      the API applies the firm's own preference for this
                      jurisdiction. */}
                  <select className="bib-select" id="issuingEntityPartyId"
                          name="issuingEntityPartyId" defaultValue="" style={{ width: "100%" }}>
                    <option value="">the firm&apos;s entity for this jurisdiction</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "2 1 220px" }}>
                  <label className="bib-label" htmlFor="addressedToPartyId">
                    Addressed to
                  </label>
                  {/* A named PERSON, care-of the client above. Not who is
                      billed — that is the client — which is why it is a second
                      field and not a rename of the first. */}
                  <select className="bib-select" id="addressedToPartyId" name="addressedToPartyId"
                          defaultValue="" style={{ width: "100%" }}>
                    <option value="">nobody named — the organization</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "var(--bib-gap-2)" }}>
                <label className="bib-label" htmlFor="background">
                  Background
                </label>
                <textarea
                  className="bib-input"
                  id="background"
                  name="background"
                  rows={4}
                  placeholder="Why this client is buying this — the paragraph the letter opens with."
                />
              </div>

              <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
                <div>
                  <label className="bib-label" htmlFor="issuedOn">
                    Dated
                  </label>
                  <input className="bib-input" id="issuedOn" name="issuedOn" type="date" />
                  <p className="bib-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    The date under the letterhead. Blank means the day it is sent.
                  </p>
                </div>
                <div>
                  <label className="bib-label" htmlFor="effectiveFrom">
                    Work begins
                  </label>
                  <input className="bib-input" id="effectiveFrom" name="effectiveFrom"
                         type="date" />
                  <p className="bib-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    Blank means the signature date. A line may start later still.
                  </p>
                </div>
                <div>
                  <label className="bib-label" htmlFor="supersedesId">
                    Replaces
                  </label>
                  <select className="bib-select" id="supersedesId" name="supersedesId"
                          defaultValue="" style={{ width: "100%" }}
                          disabled={supersedable.length === 0}>
                    <option value="">nothing — this is a new agreement</option>
                    {supersedable.map((l) => (
                      <option key={l.letter.id} value={l.letter.id}>
                        {l.letter.ref} — {l.party.displayName}
                      </option>
                    ))}
                  </select>
                  <p className="bib-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {supersedable.length === 0
                      ? "No signed letter is waiting to be replaced."
                      : "A signed letter is never edited. This is how the change is recorded."}
                  </p>
                </div>
              </div>
            </>
          )}

          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Drafting…" : "Draft letter"}
          </button>
        </form>
      </div>
    </main>
  );
}
