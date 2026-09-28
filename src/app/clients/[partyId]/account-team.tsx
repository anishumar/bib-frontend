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
  NotSet,
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
  CaughtUpWork,
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
 * ## Who is shown the form
 *
 * Assigning needs `party:write`, which a manager and an associate hold. Its two
 * PICKERS — the firm's people and the firm's Depts — were admin reads until
 * 2026-09-25, so a manager permitted to assign was shown no form to do it in.
 * Both are `party:read` reads now: `/tenancy/colleagues` (names and rungs, no
 * emails) and `/tenancy/axes` (the active Depts and teams, which the table above
 * already prints). The first swap alone left the form hidden; walking the page
 * as a manager is what found the second.
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
  // What the last assignment MOVED of the client's waiting work (T6.17), in
  // words, or null when there is nothing to say.
  const [moved, setMoved] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
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
        // The colleagues PICKER, not the roster (G3.2's gap, closed as on the work
        // board): names and rungs of active staff on `party:read`, no emails. The
        // roster is `tenant:admin`, so until 2026-09-25 nobody below
        // administrator was shown this picker at all.
        api.GET("/api/v1/tenancy/colleagues", {}),
        // AND THE DEPT LIST, which was the other half of the same gap: this read
        // was the admin-only `/tenancy/structure`, so a manager still got a 403
        // here and no form even after the colleagues swap. Found by walking the
        // page as a manager. `/tenancy/axes` is the active rows on `party:read`.
        api.GET("/api/v1/tenancy/axes", {}),
      ]);
      if (assignments.error) {
        setError(apiError(assignments.error).message);
        return;
      }
      setTeam(assignments.data);
      setStaff(roster.data ? [...roster.data.colleagues] : []);
      // Active only, by the API's own answer: a retired Dept is refused by the
      // write, so a picker that offered it would be inviting a refusal.
      setAxes(structure.data?.axes ?? []);
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
    // Cleared BEFORE the call, so a second assignment says what IT moved.
    setMoved(null);
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
    setMoved(caughtUpWords(result.data.caughtUp, staff, clientName));
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

      {moved !== null && (
        // Spaced off the table below it, which otherwise meets its border.
        <div style={{ marginBottom: "var(--s-3)" }}>
          <Notice tone={moved.tone} eyebrow="Work already created">
            {moved.text}
          </Notice>
        </div>
      )}

      {stale.length > 0 && (
        <Notice tone="warn" eyebrow="Nobody is covering this client">
          {stale.length === 1
            ? `${stale[0]?.holderName ?? stale[0]?.holderEmail} is still the ${roleLabel(
                stale[0]?.role ?? "spoc",
              )} here and has left the firm.`
            : `${stale.length} people on this account team have left the firm.`}{" "}
          Assign somebody else below, then end the old row.
        </Notice>
      )}

      {team.inForce.length === 0 ? (
        <p className="muted">Nobody was assigned to this client on {longDay(asOf)}.</p>
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
                  <Td className="nowrap">
                    <strong>{roleLabel(a.role)}</strong>
                  </Td>
                  <Td>
                    {a.holderName ?? a.holderEmail}
                    {/* On the row as well as in the banner: with four people on
                        an account team, a count at the top does not say WHICH,
                        and the row is where the handover is started from. */}
                    {showingToday && !a.holderIsActiveStaff && (
                      <>
                        {" "}
                        <Pill dot tone="warn">
                          Left the firm
                        </Pill>
                      </>
                    )}
                  </Td>
                  <Td>{a.axis === null ? "Whole client" : a.axis.name}</Td>
                  <Td className="nowrap">{longDay(a.validFrom)}</Td>
                  {/* Half-open: the first day NOT in force, which is why this
                      column is "until" and an open row says so in words. */}
                  <Td className="nowrap">
                    {a.validTo === null ? <NotSet>Ongoing</NotSet> : longDay(a.validTo)}
                  </Td>
                  <Td align="right">
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
                        }, ${a.axis === null ? "Whole client" : a.axis.name}`}
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
                    <Td className="nowrap">{roleLabel(a.role)}</Td>
                    <Td>{a.holderName ?? a.holderEmail}</Td>
                    <Td>{a.axis?.name ?? "Whole client"}</Td>
                    <Td className="nowrap">{longDay(a.validFrom)}</Td>
                    <Td className="nowrap">
                      {a.validTo === null ? <NotSet>Ongoing</NotSet> : longDay(a.validTo)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </details>
      )}

      {canAssign && (
        /* No heading of its own (Wave 4): a rule above it and the button's
           word say what it is. */
        <form
          className="card-foot"
          action={(form) => {
            void assign(form);
          }}
        >
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
                    ? "A handover: the current Key Manager ends on this date."
                    : "Adds a SPOC. End the outgoing one on its row."
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
              <Button type="submit" variant="secondary" loading={busy}>
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

/**
 * What the catch-up moved, in words (T6.17): "3 tasks and 20 steps moved to
 * Priya Shah." Naming somebody on the account team moves the client's work
 * that was waiting on the Key Manager's or the signing partner's desk to be
 * handed out, or on nobody's; work somebody handed on or started stays put.
 * Nothing to say when nothing was waiting. The names come from the roster the
 * form already holds; the API sends ids.
 */
function caughtUpWords(
  caughtUp: CaughtUpWork,
  staff: readonly Colleague[],
  clientName: string,
): { tone: "ok" | "warn"; text: string } | null {
  if (caughtUp === null) {
    return {
      tone: "warn",
      text:
        `Saved. The work already created for ${clientName} could not be moved to the new ` +
        `account team, so it is still where it was. Hand it out from the work board.`,
    };
  }
  if (caughtUp.moves.length === 0) return null;
  const sentences = caughtUp.moves.map((m) => {
    const who = staff.find((c) => c.userId === m.userId)?.displayName ?? "a colleague";
    const tasks = `${m.tasks} ${m.tasks === 1 ? "task" : "tasks"}`;
    const steps = m.steps === 0 ? "" : ` and ${m.steps} ${m.steps === 1 ? "step" : "steps"}`;
    return `${tasks}${steps} moved to ${who}.`;
  });
  return { tone: "ok", text: sentences.join(" ") };
}
