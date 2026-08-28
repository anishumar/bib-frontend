"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, Member, StaffGrade } from "@/lib/api/client";

/**
 * The firm's roster.
 *
 * Every action here is one API call and the API owns every rule — which roles
 * may be assigned, and whether the firm would be left with nobody able to
 * administer it. This screen does not reimplement either check; it shows what
 * the API says when it refuses, verbatim, because those messages are written to
 * be acted on and a friendlier local rewrite would lose the reason.
 *
 * The role dropdown is fed from the firm's OWN published roles, not a hardcoded
 * list: a firm that invents "rm" sees it here without a deploy, and a role that
 * exists only as a draft is correctly absent.
 *
 * The grade dropdown works the same way and is a SEPARATE axis: the role says
 * what somebody may reach, the grade says how senior they are, and it is the
 * grade the firm's review rule ("Manager or above") compares. The ladder itself
 * is edited on /admin/grades; this screen only says who is on which rung.
 */
export default function PeoplePage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<ConfigEntry[]>([]);
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [roster, published, ladder] = await Promise.all([
      api.GET("/api/v1/tenancy/members", {}),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "role" } } }),
      api.GET("/api/v1/tenancy/grades", {}),
    ]);
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (roster.response.status === 401) {
      router.push("/login");
      return;
    }
    if (roster.error) {
      setError(apiError(roster.error).message);
      setLoaded(true);
      return;
    }
    setMembers(roster.data.members);
    if (published.data) setRoles(published.data.entries.filter((e) => e.published !== null));
    if (ladder.data) setGrades(ladder.data.grades);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    // Wrapped rather than `void load()` so the await boundary is visible to the
    // hooks lint: nothing here sets state synchronously, and the same shape is
    // used on the workspace home page.
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every mutation funnels through here so one place owns the busy flag, the
   *  error message and the reload. */
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

  function changeRole(membershipId: string, role: string): void {
    void act(membershipId, () =>
      api.PUT("/api/v1/tenancy/members/{membershipId}/role", {
        params: { path: { membershipId } },
        body: { role },
      }),
    );
  }

  /** `null` takes somebody off the ladder, which is a real answer rather than a
   *  missing one — a client contact has no rung, and neither does somebody whose
   *  designation the firm has never ranked. */
  function changeGrade(membershipId: string, gradeId: string | null): void {
    void act(membershipId, () =>
      api.PUT("/api/v1/tenancy/members/{membershipId}/grade", {
        params: { path: { membershipId } },
        body: { gradeId },
      }),
    );
  }

  function setActive(membershipId: string, isActive: boolean): void {
    void act(membershipId, () =>
      api.PUT("/api/v1/tenancy/members/{membershipId}/active", {
        params: { path: { membershipId } },
        body: { isActive },
      }),
    );
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <h1>People</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <table className="bib-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Grade</th>
              <th>Access</th>
              <th>Fees</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membership.id} data-inactive={!m.membership.isActive}>
                <td>
                  {/* The name when there is one; the email otherwise. Nobody is
                      shown as a uuid. */}
                  <div>{m.displayName ?? m.email}</div>
                  {m.displayName !== null && (
                    <div className="bib-muted bib-mono">{m.email}</div>
                  )}
                </td>
                <td>
                  <select
                    className="bib-select"
                    value={m.membership.role}
                    disabled={busy === m.membership.id}
                    onChange={(e) => { changeRole(m.membership.id, e.target.value); }}
                  >
                    {/* The role they hold is always an option, even if the firm
                        has since unpublished it — otherwise the dropdown would
                        silently show somebody as holding a different role. */}
                    {!roles.some((r) => r.entry.key === m.membership.role) && (
                      <option value={m.membership.role}>{m.membership.role} (not published)</option>
                    )}
                    {roles.map((r) => (
                      <option key={r.entry.key} value={r.entry.key}>
                        {readRoleBody(r.published?.body).label || r.entry.key}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="bib-select"
                    value={m.grade?.id ?? ""}
                    disabled={busy === m.membership.id}
                    onChange={(e) => { changeGrade(m.membership.id, e.target.value || null); }}
                  >
                    {/* Ungraded is offered as a choice, not shown as an empty
                        cell: taking somebody off the ladder is a decision, and a
                        portal contact belongs on no rung at all. */}
                    <option value="">— not graded —</option>
                    {/* A retired rung is offered only to the person already on
                        it. The API refuses it for anybody else, and offering
                        what will fail is just a slower error. */}
                    {grades
                      .filter((g) => g.isActive || g.id === m.grade?.id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.isActive ? "" : " (retired)"}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <span className="bib-pill" data-tone={m.membership.isActive ? "active" : "revoked"}>
                    {m.membership.isActive ? m.membership.audience : "revoked"}
                  </span>
                </td>
                <td className="bib-muted">{m.membership.commercialVisibility ? "visible" : "hidden"}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className={`bib-button-quiet${m.membership.isActive ? " bib-button-danger" : ""}`}
                    disabled={busy === m.membership.id}
                    onClick={() => { setActive(m.membership.id, !m.membership.isActive); }}
                  >
                    {m.membership.isActive ? "Revoke access" : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0, marginTop: "var(--bib-gap-2)" }}>
          Revoking takes effect on their next request, not at their next sign-in. A grade is
          seniority only — it grants nothing, and it is what review rules compare.
        </p>
      </div>

      <AddMember roles={roles} onAdded={() => void load()} onError={setError} />
    </main>
  );
}

function AddMember({
  roles,
  onAdded,
  onError,
}: {
  roles: ConfigEntry[];
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [audience, setAudience] = useState("STAFF");
  const [seesFees, setSeesFees] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosenRole = role || roles[0]?.entry.key || "";

  async function submit(): Promise<void> {
    setBusy(true);
    const result = await api.POST("/api/v1/tenancy/members", {
      body: {
        email,
        audience,
        role: chosenRole,
        commercialVisibility: seesFees,
        // Only sent when given: the API applies it to a NEW account and never
        // renames somebody who already has one.
        ...(displayName === "" ? {} : { displayName }),
      },
    });
    setBusy(false);
    if (result.error) {
      onError(apiError(result.error).message);
      return;
    }
    setEmail("");
    setDisplayName("");
    onAdded();
  }

  return (
    <div className="bib-card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Add somebody</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="bib-field-row">
          <div>
            <label className="bib-label" htmlFor="email">Email</label>
            <input
              id="email" className="bib-input" type="email" required value={email}
              onChange={(e) => { setEmail(e.target.value); }}
            />
          </div>
          <div>
            <label className="bib-label" htmlFor="name">Name (optional)</label>
            <input
              id="name" className="bib-input" value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); }}
            />
          </div>
          <div>
            <label className="bib-label" htmlFor="role">Role</label>
            <select
              id="role" className="bib-select" style={{ width: "100%" }} value={chosenRole}
              onChange={(e) => { setRole(e.target.value); }}
            >
              {roles.map((r) => (
                <option key={r.entry.key} value={r.entry.key}>
                  {readRoleBody(r.published?.body).label || r.entry.key}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="bib-label" htmlFor="audience">Surface</label>
            <select
              id="audience" className="bib-select" style={{ width: "100%" }} value={audience}
              onChange={(e) => { setAudience(e.target.value); }}
            >
              <option value="STAFF">Staff workspace</option>
              <option value="CLIENT_PORTAL">Client portal</option>
            </select>
          </div>
        </div>

        <label className="bib-check" style={{ marginTop: "var(--bib-gap-2)" }}>
          <input
            type="checkbox" checked={seesFees}
            onChange={(e) => { setSeesFees(e.target.checked); }}
          />
          <span>
            Can see fees
            <span className="bib-muted"> — separate from their role, on purpose.</span>
          </span>
        </label>

        <button className="bib-button" style={{ marginTop: "var(--bib-gap-2)" }} disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
        <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          No email is sent yet — they sign in with a magic link from the login page.
        </p>
      </form>
    </div>
  );
}
