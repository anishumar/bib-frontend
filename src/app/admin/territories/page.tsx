"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { Member, TerritoryRule } from "@/lib/api/client";

/**
 * Whose desk covers leads from a country.
 *
 * A territory rule OVERRIDES the assignment rotation: a lead captured from a
 * country named here goes to that desk however loaded it is, and everything
 * else falls through to the rotation, which gives it to whoever is holding the
 * fewest open leads.
 *
 * THERE IS NO WILDCARD ROW, and the screen says so rather than leaving a reader
 * hunting for one. Assignment already has a better fallback than a catch-all:
 * the rotation. A country nobody has claimed is not a gap in the rules.
 *
 * The desk picker is the firm's OWN roster, active staff only — the API refuses
 * anybody else, and offering what will fail is just a slower error. It also
 * checks again at assignment time, because a membership is revoked long after a
 * rule is written; a rule naming somebody who has left quietly stops applying
 * and its leads go to the rotation instead of parking on a dead desk.
 */
export default function TerritoriesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<TerritoryRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, roster] = await Promise.all([
      api.GET("/api/v1/territory-rules", {}),
      api.GET("/api/v1/tenancy/members", {}),
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
    setRules(list.data.rules);
    if (roster.data) setMembers(roster.data.members);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function set(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const note = String(form.get("note") ?? "");
    const result = await api.POST("/api/v1/territory-rules", {
      body: {
        jurisdiction: String(form.get("jurisdiction")).toUpperCase(),
        ownerUserId: String(form.get("ownerUserId")),
        ...(note === "" ? {} : { note }),
      },
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

  // Only somebody who can actually take a lead. The API applies the same test,
  // twice — here and again when the rule fires.
  const desks = members.filter((m) => m.membership.isActive && m.membership.audience === "STAFF");
  const nameOf = (userId: string): string => {
    const member = members.find((m) => m.membership.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  };

  return (
    <main>
      <h1>Territories</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        A lead from one of these countries goes to that desk, whatever its load. Everywhere else
        falls through to the rotation — there is no wildcard rule, because the rotation is a
        better fallback than a row somebody has to remember to maintain.
      </p>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
        {rules.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            No territories. Every lead is assigned by the rotation — to whoever holds the fewest
            open leads.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Country</th>
                <th>Desk</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="bib-pill" data-tone="code">{r.jurisdiction}</span>
                  </td>
                  {/* The roster is already loaded for the picker, so naming the
                      desk costs nothing extra here. If this list ever outgrows
                      the roster read, the join belongs in the API. */}
                  <td>{nameOf(r.ownerUserId)}</td>
                  <td className="bib-muted">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Set a territory</h2>
        <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
          One desk per country. Setting a country that already has one MOVES it — the rule keeps
          its identity, and leads assigned under the old one are not re-assigned.
        </p>
        <form
          action={(form) => {
            void set(form);
          }}
        >
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="jurisdiction">
                Country
              </label>
              <input
                className="bib-input"
                id="jurisdiction"
                name="jurisdiction"
                maxLength={2}
                placeholder="GB"
                required
                style={{ width: 90 }}
              />
            </div>
            <div style={{ flex: "2 1 220px" }}>
              <label className="bib-label" htmlFor="ownerUserId">
                Desk
              </label>
              <select className="bib-select" id="ownerUserId" name="ownerUserId" required style={{ width: "100%" }}>
                {desks.map((m) => (
                  <option key={m.membership.userId} value={m.membership.userId}>
                    {m.displayName ?? m.email}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 220px" }}>
              <label className="bib-label" htmlFor="note">
                Why
              </label>
              <input className="bib-input" id="note" name="note" placeholder="Ravi covers the UK" />
            </div>
          </div>
          <button className="bib-button" type="submit" disabled={busy}>
            Set territory
          </button>
        </form>
      </div>
    </main>
  );
}
