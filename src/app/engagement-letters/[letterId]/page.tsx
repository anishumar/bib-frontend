"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  apiError,
  clauseApplies,
  formatCount,
  formatMoney,
  readClauseBody,
  readServiceBody,
} from "@/lib/api/client";
import type { ConfigEntry, LetterRecord } from "@/lib/api/client";

/**
 * One engagement letter: its terms, its signature, and the work it created.
 *
 * The screen where the difference between a proposal and a letter shows. A
 * proposal can be superseded quietly; this cannot be changed at all once it is
 * signed — the database refuses it, not just this app — so the page stops
 * offering edits and starts showing what was agreed.
 *
 * The clauses render with the wording that was PINNED. Reading a signed letter
 * must show what the client agreed to, not what the library says today, and
 * that is the API's doing rather than this page's.
 */
export default function LetterPage() {
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const letterId = params.letterId;

  const [record, setRecord] = useState<LetterRecord | null>(null);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [clauses, setClauses] = useState<ConfigEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [one, catalogue, library] = await Promise.all([
      api.GET("/api/v1/engagement-letters/{letterId}", { params: { path: { letterId } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }),
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
    // Published only, for both. A draft was never in force, and the API refuses
    // to put one in a contract — offering it would be a dropdown entry whose
    // only outcome is an error.
    if (catalogue.data) setServices(catalogue.data.entries.filter((e) => e.published !== null));
    if (library.data) setClauses(library.data.entries.filter((e) => e.published !== null));
    setError(null);
    setLoaded(true);
  }, [letterId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;
  if (record === null) {
    return (
      <main>
        <nav className="bib-nav">
          <Link href="/engagement-letters">← Engagement letters</Link>
        </nav>
        <p className="bib-error">{error ?? "No such engagement letter."}</p>
      </main>
    );
  }

  const { letter, totals, lines, engagements } = record;
  const isDraft = letter.status === "draft";
  const isSigned = letter.status === "signed";
  // Clauses already on the letter, so the picker does not offer a duplicate —
  // the same term twice on one contract is a drafting error, and the API
  // refuses it anyway.
  const alreadyOn = new Set(record.clauses.map((c) => c.clauseVersionId));
  const available = clauses.filter((entry) => {
    const published = entry.published;
    if (published === null || alreadyOn.has(published.id)) return false;
    // Offer only what will work: a clause written for another jurisdiction is
    // refused by the API, and this is the same rule used to decide what to show.
    return clauseApplies(readClauseBody(published.body), letter.jurisdiction);
  });

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/engagement-letters">← Engagement letters</Link>
        <Link href={`/audit?type=engagement_letter&id=${letterId}`}>History</Link>
      </nav>

      <h1 style={{ marginBottom: 4 }}>{letter.title}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {record.party.displayName} · written for {letter.jurisdiction} ·{" "}
        <span className="bib-pill" data-tone={letter.status === "withdrawn" ? "revoked" : ""}>
          {letter.status}
        </span>
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      {isSigned && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Signed</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            By {letter.signedByName} on {letter.signedAt?.slice(0, 10)} ·{" "}
            {letter.signatureMethod}
            {letter.signatureReference !== null && ` · ref ${letter.signatureReference}`}
          </p>
          {/* The fingerprint of exactly what was signed. On the page because
              verifying it should not need a database session — recompute the
              canonical rendering and compare. */}
          <p className="bib-mono bib-muted" style={{ margin: 0, fontSize: 11, wordBreak: "break-all" }}>
            {letter.signedContentHash}
          </p>
          <p className="bib-muted" style={{ marginBottom: 0, fontSize: 13 }}>
            This letter can no longer be changed — the database refuses it. A change is a new
            letter that supersedes this one, which is what keeps this readable as what was
            actually agreed.
          </p>
        </div>
      )}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Services</h2>
        <table className="bib-table">
          <thead>
            <tr>
              <th>Line</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Net</th>
              {isDraft && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <div>{l.description}</div>
                  {l.service !== null && (
                    <div className="bib-muted bib-mono">
                      {l.service.key}@{l.service.version}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatCount(l.quantity)}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.unitAmount, l.currency)}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.net, l.currency)}
                </td>
                {isDraft && (
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="bib-button-quiet"
                      disabled={busy !== null}
                      onClick={() => {
                        void act(l.id, () =>
                          api.DELETE("/api/v1/engagement-letters/{letterId}/lines/{lineId}", {
                            params: { path: { letterId, lineId: l.id } },
                          }),
                        );
                      }}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="bib-muted">
                  Nothing agreed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ textAlign: "right", marginTop: "var(--bib-gap-2)" }}>
          <div className="bib-mono" style={{ fontSize: 20 }}>
            {formatMoney(totals.net, totals.currency)}
          </div>
          {letter.advanceRequired && (
            <div className="bib-muted" style={{ fontSize: 14 }}>
              advance {formatMoney(letter.advanceAmount, totals.currency)}
              {letter.advanceRecordedAt === null
                ? " · outstanding"
                : ` · recorded ${letter.advanceRecordedAt.slice(0, 10)}`}
            </div>
          )}
        </div>
      </div>

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Terms</h2>
        {record.clauses.length === 0 ? (
          <p className="bib-muted" style={{ marginTop: 0 }}>
            None yet. A letter cannot be sent without terms — a signed contract with none is
            enforceable as whatever a court reads into it.
          </p>
        ) : (
          record.clauses.map((c) => (
            <div key={c.id} style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {c.title}{" "}
                {/* The version that was PINNED. On a signed letter this is the
                    wording the client agreed to, not today's. */}
                <span className="bib-muted bib-mono" style={{ fontWeight: 400 }}>
                  {c.key}@{c.version}
                </span>
              </div>
              <div style={{ fontSize: 14 }}>{c.text}</div>
            </div>
          ))
        )}

        {isDraft && (
          <form
            style={{ marginTop: "var(--bib-gap-2)" }}
            action={(form) => {
              void act("clause", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/clauses", {
                  params: { path: { letterId } },
                  body: { clauseVersionId: String(form.get("clauseVersionId")) },
                }),
              );
            }}
          >
            <div className="bib-field-row">
              <div style={{ flex: "2 1 240px" }}>
                <label className="bib-label" htmlFor="clauseVersionId">
                  Add a term
                </label>
                <select className="bib-select" id="clauseVersionId" name="clauseVersionId"
                        required style={{ width: "100%" }} disabled={available.length === 0}>
                  {available.map((entry) => {
                    const body = readClauseBody(entry.published?.body);
                    return (
                      <option key={entry.entry.id} value={entry.published?.id}>
                        {body.title || entry.entry.key}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <button className="bib-button" type="submit"
                        disabled={busy !== null || available.length === 0}>
                  Add
                </button>
              </div>
            </div>
            {available.length === 0 && (
              <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0 }}>
                No published clause applies to {letter.jurisdiction} that is not already on this
                letter. Publish one in the catalogue.
              </p>
            )}
          </form>
        )}
      </div>

      {isDraft && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Agree a service</h2>
          <form
            action={(form) => {
              void act("line", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/lines", {
                  params: { path: { letterId } },
                  body: {
                    serviceVersionId: String(form.get("serviceVersionId")),
                    description: String(form.get("description")),
                    quantity: String(form.get("quantity")),
                    unitAmount: String(form.get("unitAmount")),
                    discountPercent: String(form.get("discountPercent")),
                  },
                }),
              );
            }}
          >
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="serviceVersionId">
                  From the catalogue
                </label>
                <select className="bib-select" id="serviceVersionId" name="serviceVersionId"
                        required style={{ width: "100%" }}>
                  {services.map((entry) => {
                    const body = readServiceBody(entry.published?.body);
                    return (
                      <option key={entry.entry.id} value={entry.published?.id}>
                        {body.name || entry.entry.key}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="description">
                  As it reads on the letter
                </label>
                <input className="bib-input" id="description" name="description" required />
              </div>
            </div>
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div>
                <label className="bib-label" htmlFor="quantity">
                  Quantity
                </label>
                <input className="bib-input" id="quantity" name="quantity" defaultValue="1"
                       required />
              </div>
              <div>
                <label className="bib-label" htmlFor="unitAmount">
                  Agreed price ({letter.currency})
                </label>
                <input className="bib-input" id="unitAmount" name="unitAmount" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="discountPercent">
                  Discount %
                </label>
                <input className="bib-input" id="discountPercent" name="discountPercent"
                       defaultValue="0" required />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy !== null}>
              Add line
            </button>
          </form>
        </div>
      )}

      {engagements.length > 0 && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Engagements</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            One per line, created when the letter was signed. These are what the delivery side
            schedules against.
          </p>
          <table className="bib-table">
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id}>
                  <td>
                    {lines.find((l) => l.id === e.engagementLetterLineId)?.description ??
                      e.engagementLetterLineId}
                  </td>
                  <td>
                    <span
                      className="bib-pill"
                      data-tone={e.status === "pending_advance" ? "revoked" : ""}
                    >
                      {e.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="bib-muted">{e.activatedAt?.slice(0, 10) ?? "not started"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          {isDraft ? "Send it" : "Where it stands"}
        </h2>
        <div className="bib-nav" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          {isDraft && (
            <button className="bib-button" disabled={busy !== null}
                    onClick={() => {
                      void act("send", () =>
                        api.POST("/api/v1/engagement-letters/{letterId}/send", {
                          params: { path: { letterId } },
                        }),
                      );
                    }}>
              Send for signature
            </button>
          )}
          {(isDraft || letter.status === "sent") && (
            <button className="bib-button-quiet bib-button-danger" disabled={busy !== null}
                    onClick={() => {
                      void act("withdraw", () =>
                        api.POST("/api/v1/engagement-letters/{letterId}/withdraw", {
                          params: { path: { letterId } },
                        }),
                      );
                    }}>
              Withdraw
            </button>
          )}
          {letter.advanceRequired && isSigned && letter.advanceRecordedAt === null && (
            <button className="bib-button" disabled={busy !== null}
                    onClick={() => {
                      void act("advance", () =>
                        api.POST("/api/v1/engagement-letters/{letterId}/advance", {
                          params: { path: { letterId } },
                        }),
                      );
                    }}>
              Record the advance
            </button>
          )}
        </div>

        {letter.status === "sent" && (
          <form
            style={{ marginTop: "var(--bib-gap-2)" }}
            action={(form) => {
              void act("sign", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/signature", {
                  params: { path: { letterId } },
                  body: {
                    signedByName: String(form.get("signedByName")),
                    reference: String(form.get("reference") ?? ""),
                  },
                }),
              );
            }}
          >
            <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
              {/* Said plainly, because the audit trail will say it too: this
                  records an attestation by somebody at the firm, not a
                  cryptographic signature. */}
              Recording that the client signed — on paper, or through a provider the firm
              already uses. This is a colleague&apos;s attestation, and the audit trail says so.
            </p>
            <div className="bib-field-row">
              <div>
                <label className="bib-label" htmlFor="signedByName">
                  Who signed
                </label>
                <input className="bib-input" id="signedByName" name="signedByName" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="reference">
                  Reference
                </label>
                <input className="bib-input" id="reference" name="reference"
                       placeholder="paper-001" />
              </div>
              <div>
                <button className="bib-button" type="submit" disabled={busy !== null}>
                  Record the signature
                </button>
              </div>
            </div>
          </form>
        )}

        {letter.status === "withdrawn" && (
          <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
            This letter was withdrawn on {letter.withdrawnAt?.slice(0, 10)} and stays that way,
            so the interval in which it was off the table is still on the record.
          </p>
        )}
      </div>
    </main>
  );
}
