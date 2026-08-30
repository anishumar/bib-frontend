"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import {
  BLOCK_KIND_LABELS,
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
 * One engagement letter: the document, its signatures, and the work it created.
 *
 * The screen where the difference between a proposal and a letter shows. A
 * proposal can be superseded quietly; this cannot be changed at all once it is
 * signed — the database refuses it, not just this app — so the page stops
 * offering edits and starts showing what was agreed.
 *
 * IT READS LIKE THE DOCUMENT IT IS. Its reference, who it was written to, who
 * on the firm's side is bound by it, why the client is buying, when the work
 * begins, the terms as they were PINNED, and BOTH halves of the signature
 * block. Every one of those is a term the signature hash commits to, and until
 * they were on this page a letter's own screen could not show what its client
 * was holding.
 *
 * Where the API returns an id it also returns the NAME — the issuing entity,
 * the addressee, each line's entity, the letter this one replaces — so nothing
 * here has to render a uuid at a person.
 */
export default function LetterPage() {
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const letterId = params.letterId;

  const [record, setRecord] = useState<LetterRecord | null>(null);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [clauses, setClauses] = useState<ConfigEntry[]>([]);
  // The entity a line is FOR (G0.1). An engagement is `service x ONE legal
  // entity` — vCFO for a group of four companies is four engagements, not one
  // — so a line has to name the company, and a dropdown of uuids would be
  // exactly the read-model failure this codebase keeps re-learning.
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  // WHO WILL BIND THE FIRM. The letter's own block is a snapshot taken when it
  // is SENT, so a draft has none yet and the standing signatory is the only
  // honest answer to "whose name goes under Yours sincerely". Null is a real
  // state: a firm that has named nobody sends letters with no signature block.
  const [standing, setStanding] = useState<
    { userId: string; displayName: string | null; title: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // What to OFFER, never what is allowed — the API is the only place the answer
  // lives, and its refusal is shown verbatim when one arrives.
  const [permissions, setPermissions] = useState<string[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const [one, catalogue, library, book, signatory, me] = await Promise.all([
      api.GET("/api/v1/engagement-letters/{letterId}", { params: { path: { letterId } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }),
      api.GET("/api/v1/parties"),
      api.GET("/api/v1/tenancy/firm-signatory"),
      api.GET("/api/v1/auth/me", {}),
    ]);
    setPermissions(me.data?.permissions ?? []);
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
    if (book.data) {
      setEntities(book.data.parties.map((p) => ({ id: p.id, displayName: p.displayName })));
    }
    // Read on `config:read`, so a caller who may not administer the firm still
    // sees whose signature will be on what they are drafting. A 403 leaves it
    // null, which reads the same as "nobody named" — the page says which.
    setStanding(signatory.data?.signatory ?? null);
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
  const signatureDay = letter.signedAt?.slice(0, 10) ?? null;
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

  /**
   * When work begins, and WHERE that answer came from.
   *
   * The rule is two defaults deep — a line falls back to the letter, the letter
   * falls back to the signature date — and a blank cell would hide both. So the
   * page states the day AND its provenance: "1 Oct 2026, this line only" is a
   * different fact from "1 Oct 2026, with the letter", and on an unsigned
   * letter the honest answer is that the day is not decided yet.
   *
   * Nothing is computed that the API has already resolved: once the letter is
   * signed, each engagement carries its own stored `effectiveFrom` and that is
   * what the Engagements table below shows.
   */
  function begins(lineEffectiveFrom: string | null): { day: string | null; from: string } {
    if (lineEffectiveFrom !== null) return { day: lineEffectiveFrom, from: "this line only" };
    if (letter.effectiveFrom !== null) {
      return { day: letter.effectiveFrom, from: "with the letter" };
    }
    if (signatureDay !== null) return { day: signatureDay, from: "the signature date" };
    return { day: null, from: "the day it is signed" };
  }

  const letterBegins = begins(null);
  const letterBeginsNote = [
    letter.effectiveFrom === null && letterBegins.day !== null ? "the signature date" : null,
    lines.some((l) => l.effectiveFrom !== null) ? "some lines start later" : null,
  ]
    .filter((note): note is string => note !== null)
    .join(" · ");

  return (
    <main>
      {/* The tab says what the caller is holding, for the same reason the header
          does. React hoists this into the document head. */}
      <title>{`${letter.ref} — ${letter.title}`}</title>
      <nav className="bib-nav">
        <Link href="/engagement-letters">← Engagement letters</Link>
        <Link href={`/audit?type=engagement_letter&id=${letterId}`}>History</Link>
      </nav>

      {/* The reference, first and in the document's own type. This is the string
          a client reads down the phone; the uuid in the address bar is the
          system's name for the letter, not the firm's. */}
      <p className="bib-mono bib-muted" style={{ margin: "0 0 4px", fontSize: 14 }}>
        {letter.ref}
      </p>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>{letter.title}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {record.party.displayName} · issued by {record.issuingEntity.displayName} · written for{" "}
        {letter.jurisdiction} ·{" "}
        <span className="bib-pill" data-tone={letter.status === "withdrawn" ? "revoked" : ""}>
          {letter.status}
        </span>
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      {/* LINEAGE, both directions and by reference. A signed letter is never
          edited — it is replaced — and until this the instruction the model gave
          had nowhere to be recorded and nothing to follow. */}
      {(record.supersededBy !== null || record.supersedes !== null) && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          {record.supersededBy !== null && (
            <p style={{ marginTop: 0, marginBottom: record.supersedes === null ? 0 : 8 }}>
              <span className="bib-pill" data-tone="revoked">
                superseded
              </span>{" "}
              Replaced by{" "}
              <Link className="bib-mono" href={`/engagement-letters/${record.supersededBy.id}`}>
                {record.supersededBy.ref}
              </Link>
              . <span className="bib-muted">This is no longer the agreement in force.</span>
            </p>
          )}
          {record.supersedes !== null && (
            <p style={{ margin: 0 }}>
              Replaces{" "}
              <Link className="bib-mono" href={`/engagement-letters/${record.supersedes.id}`}>
                {record.supersedes.ref}
              </Link>
              . <span className="bib-muted">That letter stays exactly as it was signed.</span>
            </p>
          )}
        </div>
      )}

      {/* THE DOCUMENT — the half a client reads before the table of fees. */}
      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>The document</h2>
        <div className="bib-field-row"
             style={{ alignItems: "flex-start", marginBottom: "var(--bib-gap-3)" }}>
          <div>
            <p className="bib-label" style={{ marginBottom: 2 }}>
              Addressed to
            </p>
            {/* A named PERSON, care-of the client — not who is BILLED, which is
                the client and is unchanged. Until the letter could store an
                individual there was no individual to address. */}
            {record.addressedTo === null ? (
              <p className="bib-muted" style={{ margin: 0 }}>
                {record.party.displayName} — no individual named
              </p>
            ) : (
              <>
                <p style={{ margin: 0 }}>{record.addressedTo.displayName}</p>
                <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                  care of {record.party.displayName}
                </p>
              </>
            )}
          </div>
          <div>
            <p className="bib-label" style={{ marginBottom: 2 }}>
              Issued by
            </p>
            {/* WHICH of the firm's own entities is contracting. The
                jurisdiction says WHERE the work is; this says WHO on our side
                is bound by it, and the two are not the same question. */}
            <p style={{ margin: 0 }}>{record.issuingEntity.displayName}</p>
            <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
              under {letter.jurisdiction} law
            </p>
          </div>
          <div>
            <p className="bib-label" style={{ marginBottom: 2 }}>
              Dated
            </p>
            {/* The document's OWN date, distinct from when this system
                transmitted it. Null defaults to the day it is sent, so the page
                says which of the two it is showing. */}
            {letter.issuedOn !== null ? (
              <p style={{ margin: 0 }}>{letter.issuedOn}</p>
            ) : letter.sentAt === null ? (
              <p className="bib-muted" style={{ margin: 0 }}>
                the day it is sent
              </p>
            ) : (
              <>
                <p style={{ margin: 0 }}>{letter.sentAt.slice(0, 10)}</p>
                <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                  the day it was sent
                </p>
              </>
            )}
          </div>
          <div>
            <p className="bib-label" style={{ marginBottom: 2 }}>
              Work begins
            </p>
            <p style={{ margin: 0 }}>
              {letterBegins.day ?? (
                <span className="bib-muted">on the day it is signed</span>
              )}
            </p>
            {letterBeginsNote !== "" && (
              <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                {letterBeginsNote}
              </p>
            )}
          </div>
        </div>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}
            className="bib-muted">
          Background
        </h3>
        {letter.background === null ? (
          <p className="bib-muted" style={{ marginBottom: 0, fontSize: 14 }}>
            None written. The letter opens straight at the services — which is a choice, and one
            that cannot be changed after it is sent.
          </p>
        ) : (
          // Prose, as prose: this is the paragraph the client reads first, and
          // it is a TERM — inside the canonical content the signature commits
          // to, not presentation around it.
          <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{letter.background}</p>
        )}
      </div>

      {isSigned && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Signed</h2>
          <div className="bib-field-row" style={{ alignItems: "flex-start" }}>
            {/* The CLIENT's half. */}
            <div>
              <p className="bib-label" style={{ marginBottom: 2 }}>
                For {record.party.displayName}
              </p>
              <p style={{ margin: 0 }}>{letter.signedByName}</p>
              <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                {letter.signedByTitle ?? "capacity not recorded"}
              </p>
              <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                {signatureDay} · {letter.signatureMethod}
                {letter.signatureReference !== null && ` · ref ${letter.signatureReference}`}
              </p>
            </div>
            {/* The FIRM's half — the "Yours sincerely, …, Director" that was
                never modelled, so the block rendered as a blank line. It is a
                SNAPSHOT taken at send: naming a successor next year must not
                restate who signed a letter in 2026. */}
            <div>
              <p className="bib-label" style={{ marginBottom: 2 }}>
                For {record.issuingEntity.displayName}
              </p>
              {record.firmSignatory === null ? (
                <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                  No signature block — the firm had named no signatory when this letter went out.
                </p>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    {record.firmSignatory.displayName ?? (
                      // The name is a read-time join; the title is what the
                      // document said. An erased account stops resolving, and
                      // that is the record being right rather than a bug.
                      <span className="bib-muted">name no longer on record</span>
                    )}
                  </p>
                  <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                    {record.firmSignatory.title}
                  </p>
                  <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
                    {record.firmSignatory.signedAt.slice(0, 10)}
                  </p>
                </>
              )}
            </div>
          </div>
          {/* The fingerprint of exactly what was signed. On the page because
              verifying it should not need a database session — recompute the
              canonical rendering and compare. */}
          <p className="bib-mono bib-muted"
             style={{ marginBottom: 0, fontSize: 11, wordBreak: "break-all" }}>
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
              <th>Begins</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Net</th>
              {isDraft && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const start = begins(l.effectiveFrom);
              return (
                <tr key={l.id}>
                  <td>
                    <div>{l.description}</div>
                    {/* WHOSE entity the work is for. One line per group company
                        is the whole reason a letter has more than one. */}
                    {l.entity !== null && <div className="bib-muted">{l.entity.displayName}</div>}
                    {l.service !== null && (
                      <div className="bib-muted bib-mono">
                        {l.service.key}@{l.service.version}
                      </div>
                    )}
                  </td>
                  <td>
                    {start.day ?? <span className="bib-muted">on signature</span>}
                    <div className="bib-muted" style={{ fontSize: 12 }}>
                      {start.from}
                    </div>
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
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="bib-muted">
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

      {/* ── The letter's own prose ─────────────────────────────────────
          Not clauses. A clause is a term of the contract, drawn from a versioned
          library and pinned; these are the document's own exclusions, commercial
          notes and team block — COPIED from the firm's standard set when the
          letter was drafted, and this letter's from then on. Editing the
          standard set changes the next letter and never this one. */}
      {record.blocks.length > 0 && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Exclusions, notes and team</h2>
          {(["exclusion", "commercial", "team"] as const).map((kind) => {
            const mine = record.blocks.filter((b) => b.kind === kind);
            if (mine.length === 0) return null;
            return (
              <div key={kind} style={{ marginBottom: "var(--bib-gap-2)" }}>
                <div className="bib-label">{BLOCK_KIND_LABELS[kind]}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {mine.map((b) => (
                    <li key={b.id} style={{ fontSize: 14, listStyle: b.isHeading ? "none" : undefined, marginLeft: b.isHeading ? -18 : 0 }}>
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                      {/* Written on this document rather than copied from the
                          firm's standard set — what this client negotiated. */}
                      {b.sourceId === null && (
                        <span className="bib-muted" style={{ fontSize: 12 }}> · this letter&apos;s own</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

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
              {/* WHOSE LAW, structured. The prose above prints it; these are the
                  comparable halves, and the API refuses a clause whose law is
                  not the ISSUING ENTITY's — the exact mistake the firm caught
                  when a US-issued letter named Indian law and Delhi courts.
                  Shown so a reader can see the letter is internally consistent,
                  rather than trusting that it is. */}
              {(c.governingLaw !== null || c.courts !== null) && (
                <div className="bib-muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {c.governingLaw !== null && (
                    <span>
                      Governed by {c.governingLaw.text}{" "}
                      <span className="bib-pill" data-tone="code">{c.governingLaw.jurisdiction}</span>
                    </span>
                  )}
                  {c.governingLaw !== null && c.courts !== null && " · "}
                  {c.courts !== null && (
                    <span>
                      Heard by {c.courts.text}{" "}
                      <span className="bib-pill" data-tone="code">{c.courts.jurisdiction}</span>
                    </span>
                  )}
                </div>
              )}
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
              const effectiveFrom = String(form.get("effectiveFrom") ?? "").trim();
              void act("line", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/lines", {
                  params: { path: { letterId } },
                  body: {
                    entityPartyId: String(form.get("entityPartyId")),
                    serviceVersionId: String(form.get("serviceVersionId")),
                    description: String(form.get("description")),
                    quantity: String(form.get("quantity")),
                    unitAmount: String(form.get("unitAmount")),
                    discountPercent: String(form.get("discountPercent")),
                    // Sent only when the drafter set one. Absent means "whatever
                    // the letter says", which is a different fact from a date
                    // that happens to match it.
                    ...(effectiveFrom === "" ? {} : { effectiveFrom }),
                  },
                }),
              );
            }}
          >
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 200px" }}>
                <label className="bib-label" htmlFor="entityPartyId">
                  Delivered to
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
              </div>
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
              <div>
                <label className="bib-label" htmlFor="effectiveFrom">
                  Begins
                </label>
                {/* Per line as well as per document, because per line can
                    express a single shared date and the reverse cannot: an
                    Incorporation line starts the day it is signed while the GST
                    line beside it starts next period. */}
                <input className="bib-input" id="effectiveFrom" name="effectiveFrom"
                       type="date" />
                <p className="bib-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  Blank follows the letter.
                </p>
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
            schedules against, and each carries the start date resolved from its line, then this
            letter, then the signature.
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
                    {/* `state`, not `status`: the stored status is the
                        COMMERCIAL gate, and `pending_start` is the calendar
                        narrowing it. An engagement that begins in October is
                        agreed, paid for and not started. */}
                    <span
                      className="bib-pill"
                      data-tone={
                        e.status === "pending_advance" || e.status === "cancelled" ? "revoked" : ""
                      }
                    >
                      {e.state.replace("_", " ")}
                    </span>
                  </td>
                  <td className="bib-muted">from {e.effectiveFrom}</td>
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

        {isDraft && (
          // Whose name will be under "Yours sincerely" — read from the firm's
          // standing signatory, because the letter has none until it is sent.
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            {standing === null
              ? "The firm has named no standing signatory, so this letter goes out with the firm's half of the signature block blank — nobody is recorded as having bound it."
              : `Sending snapshots the firm's signature block onto this letter: ${
                  standing.displayName ?? "the named account"
                }, ${standing.title}. Naming a successor later never restates it.`}
          </p>
        )}

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
              const signedByTitle = String(form.get("signedByTitle") ?? "").trim();
              void act("sign", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/signature", {
                  params: { path: { letterId } },
                  body: {
                    signedByName: String(form.get("signedByName")),
                    reference: String(form.get("reference") ?? ""),
                    // The capacity they signed in — optional, because it is not
                    // always known when a wet signature is attested afterwards,
                    // and a letter recorded without it is still verifiable.
                    ...(signedByTitle === "" ? {} : { signedByTitle }),
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
                <label className="bib-label" htmlFor="signedByTitle">
                  In what capacity
                </label>
                <input className="bib-input" id="signedByTitle" name="signedByTitle"
                       placeholder="Director" />
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
      {/* The letter's own paperwork. THE signed copy belongs here: the API
          stores a content hash per version, and `crm.engagement_letter` carries
          one too — which is what makes "is the PDF the client holds the one we
          issued" a comparison rather than a matter of trust. */}
      <Documents
        subjectKind="engagement_letter"
        subjectRef={letterId}
        canWrite={permissions.includes("party:write")}
        emptyHint="Nothing attached yet. The signed copy belongs here — its content hash is what proves the file a client holds is the one the firm issued."
      />
    </main>
  );
}
