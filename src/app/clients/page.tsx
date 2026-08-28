"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { PartySummary } from "@/lib/api/client";

/**
 * The firm's book: every counterparty it stores.
 *
 * "Client" is the word a firm uses, but the model underneath is a PARTY — a
 * prospect, a client, a director, a related company are all the same kind of
 * row, and which of them a party IS depends on the relationships and
 * opportunities attached to it, not on a type column. That is why this list
 * shows organizations and people together rather than splitting them.
 */
export default function ClientsPage() {
  const router = useRouter();
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"organization" | "person">("organization");

  const load = useCallback(async (): Promise<void> => {
    const list = await api.GET("/api/v1/parties", {});
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setParties(list.data.parties);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function create(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const optional = (name: string): Record<string, string> => {
      const value = String(form.get(name) ?? "").trim();
      return value === "" ? {} : { [name]: value };
    };
    const result =
      kind === "organization"
        ? await api.POST("/api/v1/parties/organizations", {
            body: {
              legalName: String(form.get("legalName")).trim(),
              ...optional("tradeName"),
              ...optional("industry"),
              ...optional("website"),
            },
          })
        : await api.POST("/api/v1/parties/persons", {
            body: {
              fullName: String(form.get("fullName")).trim(),
              ...optional("nationality"),
              ...optional("dateOfBirth"),
            },
          });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/clients/${result.data.partyId}`);
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/leads">Pipeline</Link>
        <Link href="/proposals">Proposals</Link>
      </nav>
      <h1>Clients</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        {parties.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nobody in the book yet.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/clients/${p.id}`}>{p.displayName}</Link>
                  </td>
                  <td className="bib-muted">{p.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Add to the book</h2>
        {/* Organization and person are different rows with different fields, so
            this is a real choice rather than a toggle over one form. */}
        <div className="bib-nav" style={{ marginBottom: "var(--bib-gap-2)" }}>
          {(["organization", "person"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="bib-button-quiet"
              aria-current={kind === k ? "page" : undefined}
              style={kind === k ? { borderColor: "var(--bib-ink-muted)" } : undefined}
              onClick={() => {
                setKind(k);
              }}
            >
              {k === "organization" ? "Organization" : "Person"}
            </button>
          ))}
        </div>

        <form
          action={(form) => {
            void create(form);
          }}
        >
          {kind === "organization" ? (
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 240px" }}>
                <label className="bib-label" htmlFor="legalName">
                  Legal name
                </label>
                <input className="bib-input" id="legalName" name="legalName" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="tradeName">
                  Trade name
                </label>
                <input className="bib-input" id="tradeName" name="tradeName" />
              </div>
              <div>
                <label className="bib-label" htmlFor="industry">
                  Industry
                </label>
                <input className="bib-input" id="industry" name="industry" />
              </div>
              <div>
                <label className="bib-label" htmlFor="website">
                  Website
                </label>
                <input className="bib-input" id="website" name="website" />
              </div>
            </div>
          ) : (
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 240px" }}>
                <label className="bib-label" htmlFor="fullName">
                  Full name
                </label>
                <input className="bib-input" id="fullName" name="fullName" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="nationality">
                  Nationality
                </label>
                <input className="bib-input" id="nationality" name="nationality" />
              </div>
              <div>
                <label className="bib-label" htmlFor="dateOfBirth">
                  Date of birth
                </label>
                <input className="bib-input" id="dateOfBirth" name="dateOfBirth" type="date" />
              </div>
            </div>
          )}
          <button className="bib-button" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Add"}
          </button>
        </form>
      </div>
    </main>
  );
}
