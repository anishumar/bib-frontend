"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Td, Th } from "@/components/ui";
import type {
  AccountTeam,
  AssignmentRole,
  ClientAssignment,
  Member,
  ServiceAxis,
} from "@/lib/api/client";

/**
 * Who at the firm owns this client (G3.2).
 *
 * Two facts sit here and they are at different levels. The **Key Manager** owns
 * the relationship — pricing, renewals, escalation — and there is one at a
 * time. A **SPOC** is the day-to-day contact for one Dept or delivery team, and
 * the firm's own practice is one per Dept: *"each client will defacto have two
 * SPOC, one from TRC and one from FRC"*.
 *
 * ## The date box is the point of this panel
 *
 * Nothing here is edited over. A handover closes one row and opens the next, so
 * every arrangement this client has ever had is still on file — and that is what
 * makes **"who was the SPOC in March"** a date in a box rather than a question
 * for somebody's memory. The API returns the whole history on one request, so
 * changing the date filters what is already loaded.
 *
 * Dates are HALF-OPEN throughout: "until" is the first day NOT in force, so an
 * assignment ending 1 April was in force up to and including 31 March. The
 * column says "until" rather than "to" for exactly that reason.
 *
 * ## Why the form is not always there
 *
 * Assigning needs `party:write`, which a manager and an associate hold. But the
 * two PICKERS it needs — the firm's people and the firm's Depts — are read from
 * the admin surface, which needs `tenant:admin`. So a manager can be permitted
 * to assign and still not be shown a form to do it in.
 *
 * That is the same shape the pipeline screen already has with its owner
 * dropdown, and it is left consistent with it rather than fixed here on a
 * whim: widening either read is a decision about who may see the firm's roster,
 * and it belongs in one place for both screens. Recorded on the board as an
 * honest gap.
 */
export function AccountTeamPanel({
  partyId,
  clientName,
}: {
  partyId: string;
  clientName: string;
}) {
  const [team, setTeam] = useState<AccountTeam | null>(null);
  const [staff, setStaff] = useState<Member[]>([]);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [asOf, setAsOf] = useState<string>(today());
  const [role, setRole] = useState<AssignmentRole>("spoc");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (onDate: string): Promise<void> => {
      const [assignments, roster, structure] = await Promise.all([
        api.GET("/api/v1/parties/{partyId}/assignments", {
          params: { path: { partyId }, query: { asOf: onDate } },
        }),
        // Both of these need tenant:admin, so a manager gets a 403 and no form.
        // The API's rule; this screen offers what the caller can actually use
        // rather than arguing with it.
        api.GET("/api/v1/tenancy/members", {}),
        api.GET("/api/v1/tenancy/structure", {}),
      ]);
      if (assignments.error) {
        setError(apiError(assignments.error).message);
        return;
      }
      setTeam(assignments.data);
      setStaff(roster.data?.members.filter((m) => m.membership.isActive) ?? []);
      // Retired Depts are offered to nobody new — the API refuses them anyway,
      // and a picker that showed them would be inviting a refusal.
      setAxes(structure.data?.axes.filter((a) => a.isActive) ?? []);
      setError(null);
    },
    [partyId],
  );

  useEffect(() => {
    void (async () => {
      await load(asOf);
    })();
  }, [load, asOf]);

  async function assign(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const chosenRole = String(form.get("role")) as AssignmentRole;
    const axisId = String(form.get("axisId") ?? "");
    const result = await api.POST("/api/v1/parties/{partyId}/assignments", {
      params: { path: { partyId } },
      body: {
        role: chosenRole,
        userId: String(form.get("userId")),
        validFrom: String(form.get("validFrom")),
        // A Key Manager takes no axis and the API refuses one, so this is
        // omitted rather than sent as null-for-tidiness.
        ...(chosenRole === "spoc" ? { axisId } : {}),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load(asOf);
  }

  async function end(assignment: ClientAssignment): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST(
      "/api/v1/parties/{partyId}/assignments/{assignmentId}/end",
      {
        params: { path: { partyId, assignmentId: assignment.id } },
        body: { validTo: today() },
      },
    );
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load(asOf);
  }

  if (team === null) {
    return (
      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-title">Account team</h2>
        <p className="muted">
          {error ?? "Loading…"}
        </p>
      </div>
    );
  }

  const canAssign = staff.length > 0 && axes.length > 0;
  const showingToday = asOf === today();
  // Everything that is not in force on the chosen day. Kept visible rather than
  // hidden: a handover is two rows, and the closed one is the only thing that
  // says who held the client before.
  const inForceIds = new Set(team.inForce.map((a) => a.id));
  const past = team.all.filter((a) => !inForceIds.has(a.id));

  return (
    <div className="card" style={{ marginBottom: "var(--s-5)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <h2 className="card-title">Account team</h2>
        <label className="label" style={{ marginBottom: 0 }}>
          As of{" "}
          <input
            className="input"
            type="date"
            value={asOf}
            style={{ width: "auto", marginLeft: 6 }}
            onChange={(e) => {
              setAsOf(e.target.value === "" ? today() : e.target.value);
            }}
          />
        </label>
      </div>

      {!showingToday && (
        <p className="muted" style={{ marginTop: "var(--s-2)" }}>
          Showing who held {clientName} on {asOf} — not today.
        </p>
      )}

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {team.inForce.length === 0 ? (
        <p className="muted">
          Nobody held this client on {asOf}. A Key Manager owns the relationship;
          a SPOC is the contact for one Dept.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Who</Th>
              <Th>Dept / team</Th>
              <Th>From</Th>
              <Th>Until</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {team.inForce.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span className="pill">{roleLabel(a.role)}</span>
                </Td>
                <Td>{a.holderName ?? a.holderEmail}</Td>
                <Td className="muted">
                  {a.axis === null ? "— whole relationship" : a.axis.name}
                </Td>
                <Td className="muted">{a.validFrom}</Td>
                {/* Half-open: the first day NOT in force, which is why this
                    column is "until" and an open row says "open". */}
                <Td className="muted">{a.validTo ?? "open"}</Td>
                <Td>
                  {showingToday && a.validTo === null && (
                    <button
                      className="btn" data-variant="secondary" data-size="sm"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void end(a);
                      }}
                    >
                      End today
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {past.length > 0 && (
        <details style={{ marginTop: "var(--s-4)" }}>
          <summary className="muted">
            {past.length} earlier {past.length === 1 ? "arrangement" : "arrangements"}
          </summary>
          <table className="table" style={{ marginTop: "var(--s-2)" }}>
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Who</Th>
                <Th>Dept / team</Th>
                <Th>From</Th>
                <Th>Until</Th>
              </tr>
            </thead>
            <tbody>
              {past.map((a) => (
                <tr key={a.id}>
                  <Td className="muted">{roleLabel(a.role)}</Td>
                  <Td className="muted">{a.holderName ?? a.holderEmail}</Td>
                  <Td className="muted">{a.axis?.name ?? "—"}</Td>
                  <Td className="muted">{a.validFrom}</Td>
                  <Td className="muted">{a.validTo ?? "open"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {canAssign && (
        <form
          style={{ marginTop: "var(--s-5)" }}
          action={(form) => {
            void assign(form);
          }}
        >
          <h3 className="text-md" style={{ marginBottom: "var(--s-2)" }}>Put somebody in charge</h3>
          <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
            <div>
              <label className="label" htmlFor="role">
                Role
              </label>
              <select
                className="select"
                id="role"
                name="role"
                value={role}
                style={{ width: "100%" }}
                onChange={(e) => {
                  setRole(e.target.value as AssignmentRole);
                }}
              >
                <option value="spoc">SPOC</option>
                <option value="key_manager">Key Manager</option>
              </select>
            </div>
            {/* Only a SPOC has one, and the API refuses a Key Manager carrying
                a Dept — so the field is absent rather than disabled. */}
            {role === "spoc" && (
              <div>
                <label className="label" htmlFor="axisId">
                  Dept / team
                </label>
                <select className="select" id="axisId" name="axisId" style={{ width: "100%" }}>
                  {axes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.axis === "dept" ? "Dept" : "team"})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: "2 1 220px" }}>
              <label className="label" htmlFor="userId">
                Who
              </label>
              <select className="select" id="userId" name="userId" style={{ width: "100%" }}>
                {staff.map((m) => (
                  <option key={m.membership.id} value={m.membership.userId}>
                    {m.displayName ?? m.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="validFrom">
                From
              </label>
              <input
                className="input"
                id="validFrom"
                name="validFrom"
                type="date"
                defaultValue={today()}
                required
              />
            </div>
          </div>
          <p className="muted" style={{ marginBottom: "var(--s-4)" }}>
            {role === "key_manager"
              ? "A new Key Manager is a handover: the current one is closed on this date, and both stay on file."
              : "A Dept can have more than one SPOC — this adds one. Ending the outgoing SPOC is a separate step."}
          </p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Assign"}
          </button>
        </form>
      )}
    </div>
  );
}

function roleLabel(role: AssignmentRole): string {
  return role === "key_manager" ? "Key Manager" : "SPOC";
}

/**
 * Today, in the CALENDAR the person is looking at — not in UTC.
 *
 * `toISOString().slice(0, 10)` is the obvious one-liner and it is wrong here,
 * which opening this page at 04:11 in Delhi is how we found out: it rendered
 * "as of 29-08" on the thirtieth, so the panel's idea of today was a day behind
 * the date picker's, and a SPOC assigned from today would have appeared under
 * "earlier arrangements" instead of in force. Anywhere east of Greenwich in the
 * morning, or west of it in the evening, gets the same off-by-one.
 *
 * A handover is a calendar fact in the firm's own office, not an instant — the
 * same argument the scheduler's date arithmetic makes for having no `Date` in
 * it at all.
 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
