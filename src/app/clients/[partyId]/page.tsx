"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { IdentifierType, PartyProfile } from "@/lib/api/client";

/**
 * Party 360 — everything the firm knows about one counterparty.
 *
 * The identifiers are the interesting half. A PAN, a GSTIN, a CIN: the API
 * validates each against its own format and normalises it before storing, so a
 * mistyped PAN is refused here with a message that says which one and why. This
 * screen does not reimplement any of that; it shows the refusal.
 *
 * Identifiers are also what makes lead capture deduplicate — the same company
 * arriving twice by two routes resolves to this one party rather than becoming
 * two.
 */
export default function PartyPage() {
  const router = useRouter();
  const params = useParams<{ partyId: string }>();
  const partyId = params.partyId;

  const [profile, setProfile] = useState<PartyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const one = await api.GET("/api/v1/parties/{partyId}", {
      params: { path: { partyId } },
    });
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setProfile(one.data);
    setError(null);
    setLoaded(true);
  }, [partyId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function addIdentifier(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const jurisdiction = String(form.get("jurisdiction") ?? "").trim();
    const result = await api.POST("/api/v1/parties/{partyId}/identifiers", {
      params: { path: { partyId } },
      body: {
        type: String(form.get("type")) as IdentifierType,
        value: String(form.get("value")).trim(),
        validFrom: String(form.get("validFrom")),
        isPrimary: form.get("isPrimary") === "on",
        ...(jurisdiction === "" ? {} : { jurisdiction }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;
  if (profile === null) {
    return (
      <main>
        <nav className="bib-nav">
          <Link href="/clients">← Clients</Link>
        </nav>
        <p className="bib-error">{error ?? "No such party."}</p>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/clients">← Clients</Link>
      </nav>
      <h1 style={{ marginBottom: 4 }}>{profile.party.displayName}</h1>
      {/* The subtype detail. The display name prefers a trade name, so the LEGAL
          name is a different fact and worth showing when they differ — it is
          what goes on an engagement letter. */}
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {profile.organization !== null
          ? [
              profile.organization.legalName === profile.party.displayName
                ? null
                : profile.organization.legalName,
              profile.organization.industry,
              profile.organization.website,
            ]
              .filter((v): v is string => v !== null && v !== "")
              .join(" · ") || "organization"
          : profile.person !== null
            ? [profile.person.nationality, profile.person.dateOfBirth]
                .filter((v): v is string => v !== null && v !== "")
                .join(" · ") || "person"
            : profile.party.kind}
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      {profile.legalEntities.length > 0 && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Registered</h2>
          <table className="bib-table">
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Type</th>
                <th>Incorporated</th>
                <th>FY end</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {profile.legalEntities.map((e) => (
                <tr key={`${e.jurisdiction}-${e.entityType}`}>
                  <td className="bib-mono">{e.jurisdiction}</td>
                  <td>{e.entityType}</td>
                  <td className="bib-muted">{e.incorporatedOn ?? "—"}</td>
                  {/* MM-DD: a financial year ends on a date in the calendar,
                      not in a particular year. */}
                  <td className="bib-muted">{e.financialYearEnd ?? "—"}</td>
                  <td>
                    <span
                      className="bib-pill"
                      data-tone={e.status === "active" ? "" : "revoked"}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Identifiers</h2>
        {profile.identifiers.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            None yet. A PAN or an email is what lets a second capture of this
            counterparty find this record instead of making another.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Where</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {profile.identifiers.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.type}
                    {i.isPrimary && (
                      <span className="bib-pill" style={{ marginLeft: 8 }}>
                        primary
                      </span>
                    )}
                  </td>
                  {/* Stored normalised by the API — uppercase, unspaced — which
                      is what makes two captures of one company match. */}
                  <td className="bib-mono">{i.value}</td>
                  <td className="bib-muted">{i.jurisdiction ?? "—"}</td>
                  <td className="bib-muted">{i.validFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Relationships</h2>
        {profile.relationships.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            None recorded.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Counterparty</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {profile.relationships.map((r) => (
                <tr key={r.relationship.id}>
                  {/* Direction matters: "Priya is a director of Meridian" and
                      "Meridian has Priya as a director" are one row read from
                      two ends, and the sentence is different each way. */}
                  <td>
                    {r.relationship.type} {r.direction === "outgoing" ? "→" : "←"}
                  </td>
                  <td>
                    <Link href={`/clients/${r.counterparty.id}`}>
                      {r.counterparty.displayName}
                    </Link>
                  </td>
                  <td className="bib-muted">{r.relationship.validFrom}</td>
                  {/* Effective dating: an open relationship has no end, which is
                      a different fact from one that ended today. */}
                  <td className="bib-muted">{r.relationship.validTo ?? "open"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Attach an identifier</h2>
        <form
          action={(form) => {
            void addIdentifier(form);
          }}
        >
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="type">
                Type
              </label>
              <select className="bib-select" id="type" name="type" style={{ width: "100%" }}>
                {IDENTIFIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 220px" }}>
              <label className="bib-label" htmlFor="value">
                Value
              </label>
              <input className="bib-input" id="value" name="value" required />
            </div>
            <div>
              <label className="bib-label" htmlFor="jurisdiction">
                Jurisdiction
              </label>
              <input className="bib-input" id="jurisdiction" name="jurisdiction" maxLength={2}
                     placeholder="IN" />
            </div>
            <div>
              <label className="bib-label" htmlFor="validFrom">
                Valid from
              </label>
              <input className="bib-input" id="validFrom" name="validFrom" type="date"
                     defaultValue={today} required />
            </div>
          </div>
          <label className="bib-check" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <input type="checkbox" name="isPrimary" />
            <span>The primary one of its type for this party.</span>
          </label>
          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Attaching…" : "Attach"}
          </button>
        </form>
      </div>
    </main>
  );
}

/**
 * The identifier types the API accepts.
 *
 * Listed here because the generated schema gives them as a union type, which
 * TypeScript cannot enumerate at runtime — `satisfies` makes anything that is
 * not one of them a compile error, so this cannot drift silently past a
 * regenerate.
 */
const IDENTIFIER_TYPES = [
  "pan",
  "gstin",
  "cin",
  "llpin",
  "tan",
  "din",
  "uen",
  "trn",
  "ein",
  "crn",
  "vat",
  "passport",
  "email",
  "phone",
  "other",
] as const satisfies readonly IdentifierType[];
