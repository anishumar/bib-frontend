"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type {
  AccountTeam,
  AssignmentRole,
  ClientAssignment,
  Colleague,
  ServiceAxis,
} from "@/lib/api/client";
import { longDay } from "@/lib/day";

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
  const [staff, setStaff] = useState<Colleague[]>([]);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [asOf, setAsOf] = useState<string>(today());
  const [role, setRole] = useState<AssignmentRole>("spoc");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An id of its own, because this control is not a `<Field>` — it sits in the
  // card's heading row, opposite the title, and `<Field>` is a stacked block.
  const asOfId = useId();

  const load = useCallback(
    async (onDate: string): Promise<void> => {
      const [assignments, roster, structure] = await Promise.all([
        api.GET("/api/v1/parties/{partyId}/assignments", {
          params: { path: { partyId }, query: { asOf: onDate } },
        }),
        // Both of these need tenant:admin, so a manager gets a 403 and no form.
        // The API's rule; this screen offers what the caller can actually use
        // rather than arguing with it.
        // The colleagues PICKER, not the roster (G3.2's gap, closed as on the work
        // board): names and rungs of active staff on `party:read`, no emails. The
        // roster is `tenant:admin`, so until 2026-09-25 nobody below
        // administrator was shown this picker at all.
        api.GET("/api/v1/tenancy/colleagues", {}),
        api.GET("/api/v1/tenancy/structure", {}),
      ]);
      if (assignments.error) {
        setError(apiError(assignments.error).message);
        return;
      }
      setTeam(assignments.data);
      setStaff(roster.data ? [...roster.data.colleagues] : []);
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
      <Card>
        <CardTitle level={2}>Account team</CardTitle>
        <p className="muted">
          {error ?? "Loading…"}
        </p>
      </Card>
    );
  }

  const canAssign = staff.length > 0 && axes.length > 0;
  const showingToday = asOf === today();
  // Everything that is not in force on the chosen day. Kept visible rather than
  // hidden: a handover is two rows, and the closed one is the only thing that
  // says who held the client before.
  const inForceIds = new Set(team.inForce.map((a) => a.id));
  const past = team.all.filter((a) => !inForceIds.has(a.id));
  /**
   * Rows still in force whose holder has left the firm.
   *
   * Nothing closes an assignment when somebody is deactivated — closing it
   * would destroy the record of who owned the client, which is what this panel
   * exists to answer — so the client keeps a Key Manager or a SPOC on paper
   * while the person named has gone. Escalation then goes to a desk nobody
   * sits at.
   *
   * ONLY WHEN SHOWING TODAY, and that is not tidiness. `holderIsActiveStaff` is
   * a fact about now, not about `asOf`: somebody who held this client in March
   * and has since left is the ordinary end of a working life, and flagging
   * March's team as broken would be answering a question nobody asked.
   */
  const stale = showingToday ? team.inForce.filter((a) => !a.holderIsActiveStaff) : [];

  return (
    <Card>
      {/* `.row` is those five declarations exactly — baseline-aligned, spread
          apart, wrapping rather than crushing the heading. It was written for
          a heading with something opposite it, which is this. */}
      <div className="row">
        <CardTitle level={2}>Account team</CardTitle>
        {/* THE LAST `label.label` WRAPPER IN THE APP, and it outlived the sweep
            that removed the other thirteen (42a7d79) because that sweep read
            the source. A wrapping <label> makes the control's name the whole
            label's text — here "As of" plus the date the browser renders inside
            it, so the name changed every time the value did. `aria-label` and a
            `<label for>` cannot both be right; the visible words stay, the name
            is fixed, and the box is `<Input>` rather than a raw
            `<input className="input">` so it wears the same chrome as every
            other date on the screen. */}
        <span className="label" style={{ marginBottom: 0 }}>
          <label htmlFor={asOfId}>As of</label>{" "}
          <Input
            id={asOfId}
            type="date"
            value={asOf}
            style={{ width: "auto", marginLeft: 6 }}
            onChange={(e) => {
              setAsOf(e.target.value === "" ? today() : e.target.value);
            }}
          />
        </span>
      </div>

      {!showingToday && (
        <p className="muted" style={{ marginTop: "var(--s-2)" }}>
          Showing who looked after {clientName} on {longDay(asOf)}, not today.
        </p>
      )}

      <ErrorNotice error={error} />

      {stale.length > 0 && (
        <Notice tone="warn" eyebrow="Nobody is covering this client">
          {stale.length === 1
            ? `${stale[0]?.holderName ?? stale[0]?.holderEmail} is still the ${roleLabel(
                stale[0]?.role ?? "spoc",
              ).toLowerCase()} on this client and no longer works at the firm.`
            : `${stale.length} people on this account team no longer work at the firm.`}{" "}
          The row stays as the record of who looked after the client. Assign somebody else
          below, then end this one.
        </Notice>
      )}

      {team.inForce.length === 0 ? (
        <p className="muted">
          Nobody was assigned to this client on {longDay(asOf)}. A Key Manager owns the whole
          relationship; a SPOC is the contact for one Dept or team.
        </p>
      ) : (
        <TableWrap>
          <Table>
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
                    <Pill>{roleLabel(a.role)}</Pill>
                  </Td>
                  <Td>
                    {a.holderName ?? a.holderEmail}
                    {/* On the row as well as in the banner: with four people on
                        an account team, a count at the top does not say WHICH,
                        and the row is where the handover is started from. */}
                    {showingToday && !a.holderIsActiveStaff && (
                      <>
                        {" "}
                        <Pill tone="warn">no longer at the firm</Pill>
                      </>
                    )}
                  </Td>
                  <Td className="muted">
                    {a.axis === null ? "whole relationship" : a.axis.name}
                  </Td>
                  <Td className="muted">{longDay(a.validFrom)}</Td>
                  {/* Half-open: the first day NOT in force, which is why this
                      column is "until" and an open row says "open". */}
                  <Td className="muted">{a.validTo === null ? "open" : longDay(a.validTo)}</Td>
                  <Td>
                    {showingToday && a.validTo === null && (
                      /* NAMED BY THE ROW. Cobalt Foods has four people on it and
                         every button said only "End today" — and the holder's
                         name does not separate them either, because one person
                         is SPOC for two Depts. Role + who + which Dept is what
                         the row IS, and none of the three is editable here. The
                         sweep that reported this route clean ran against a
                         client with no account team at all. */
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        aria-label={`End today: ${roleLabel(a.role)}, ${
                          a.holderName ?? a.holderEmail
                        }, ${a.axis === null ? "whole relationship" : a.axis.name}`}
                        onClick={() => {
                          void end(a);
                        }}
                      >
                        End today
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {past.length > 0 && (
        <details style={{ marginTop: "var(--s-4)" }}>
          <summary className="muted">
            {past.length} earlier {past.length === 1 ? "arrangement" : "arrangements"}
          </summary>
          <TableWrap>
            <Table style={{ marginTop: "var(--s-2)" }}>
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
                    <Td className="muted">{a.axis?.name ?? "whole relationship"}</Td>
                    <Td className="muted">{longDay(a.validFrom)}</Td>
                    <Td className="muted">{a.validTo === null ? "open" : longDay(a.validTo)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
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
          <FieldStack>
            <FieldRow>
              {/* The sentence that used to sit loose above the button belongs
                  HERE: it changes with the role — a handover for a Key Manager,
                  an addition for a SPOC — so it describes this control and
                  nothing else, and as `hint` it is read out with it. */}
              <Field
                label="Role"
                hint={
                  role === "key_manager"
                    ? "Assigning a new Key Manager is a handover. The current one is ended on this date, and both stay on record."
                    : "A Dept can have more than one SPOC, so this adds one. End the outgoing SPOC separately with End today."
                }
              >
                <Select
                  name="role"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as AssignmentRole);
                  }}
                >
                  <option value="spoc">SPOC</option>
                  <option value="key_manager">Key Manager</option>
                </Select>
              </Field>
              {/* Only a SPOC has one, and the API refuses a Key Manager carrying
                  a Dept — so the field is absent rather than disabled. */}
              {role === "spoc" && (
                <Field label="Dept / team">
                  <Select name="axisId">
                    {axes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.axis === "dept" ? "Dept" : "team"})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Who">
                <Select name="userId">
                  {staff.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {colleagueLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              {/* `id="validFrom"` was hardcoded here AND on the identifier form
                  of the page this renders inside, so the document carried the
                  same id twice and the SECOND label pointed at the FIRST input.
                  `Field` generates one with `useId`, which is why the class of
                  bug cannot come back. */}
              <Field label="From">
                <Input name="validFrom" type="date" defaultValue={today()} required />
              </Field>
            </FieldRow>
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {busy ? "Saving…" : "Assign"}
              </Button>
            </div>
          </FieldStack>
        </form>
      )}
    </Card>
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
