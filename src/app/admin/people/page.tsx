"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, Member, StaffGrade } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  Notice,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  Input,
} from "@/components/ui";

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

  /**
   * Who somebody reports to (T2.9).
   *
   * A FOURTH axis and it grants nothing either — one thing reads it, a
   * reporting-line rule on `/admin/verification` deciding who may check this
   * person's work. `null` is a real answer: a partner reports to nobody.
   */
  function changeReportsTo(membershipId: string, reportsToUserId: string | null): void {
    void act(membershipId, () =>
      api.PUT("/api/v1/tenancy/members/{membershipId}/reports-to", {
        params: { path: { membershipId } },
        body: { reportsToUserId },
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

  if (!loaded) return <Loading label="Loading the roster" />;

  return (
    <Page>
      <PageHeader
        eyebrow="The firm"
        title="People"
        lede="Who works at the firm, what their role reaches, how senior they are, and who they report to. Four independent axes — changing one never changes another."
        aside={<Pill tone="quiet">{members.length} on the roster</Pill>}
      />

      <ErrorNotice error={error} />

      <Stack gap="tight">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Grade</Th>
                <Th>Reports to</Th>
                <Th>Access</Th>
                <Th>Fees</Th>
                {/* The actions column has no visible heading, but an empty one
                    is announced as an empty column. This names it for anybody
                    navigating the table by header. */}
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membership.id} data-inactive={!m.membership.isActive}>
                  <Td>
                    {/* The name when there is one; the email otherwise. Nobody
                        is shown as a uuid. */}
                    {m.displayName ?? m.email}
                    {m.displayName !== null && <Sub>{m.email}</Sub>}
                  </Td>
                  <Td>
                    <Select
                      size="sm"
                      aria-label={`Role for ${m.displayName ?? m.email}`}
                      value={m.membership.role}
                      disabled={busy === m.membership.id}
                      onChange={(e) => { changeRole(m.membership.id, e.target.value); }}
                    >
                      {/* The role they hold is always an option, even if the firm
                          has since unpublished it — otherwise the dropdown would
                          silently show somebody as holding a different role. */}
                      {!roles.some((r) => r.entry.key === m.membership.role) && (
                        <option value={m.membership.role}>
                          {m.membership.role} (not published)
                        </option>
                      )}
                      {roles.map((r) => (
                        <option key={r.entry.key} value={r.entry.key}>
                          {readRoleBody(r.published?.body).label || r.entry.key}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Select
                      size="sm"
                      aria-label={`Grade for ${m.displayName ?? m.email}`}
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
                    </Select>
                  </Td>
                  <Td>
                    <Select
                      size="sm"
                      aria-label={`Reporting line for ${m.displayName ?? m.email}`}
                      value={m.membership.reportsToUserId ?? ""}
                      disabled={busy === m.membership.id}
                      onChange={(e) => {
                        changeReportsTo(m.membership.id, e.target.value || null);
                      }}
                    >
                      {/* Nobody is a real answer, not a blank to be filled in
                          later: a partner reports to nobody, and so does everybody
                          at a firm that has not recorded this. */}
                      <option value="">— nobody —</option>
                      {/* Active STAFF only, and never themselves. The API refuses
                          both — a client contact in the firm's reporting line
                          would make a client eligible to check the firm's work,
                          and the database refuses the self-loop — so offering
                          either would just be a slower error. */}
                      {members
                        .filter(
                          (o) =>
                            o.membership.userId !== m.membership.userId &&
                            o.membership.audience === "STAFF" &&
                            o.membership.isActive,
                        )
                        .map((o) => (
                          <option key={o.membership.id} value={o.membership.userId}>
                            {o.displayName ?? o.email}
                          </option>
                        ))}
                    </Select>
                  </Td>
                  <Td>
                    <Pill tone={m.membership.isActive ? "accent" : "danger"}>
                      {m.membership.isActive ? m.membership.audience : "revoked"}
                    </Pill>
                  </Td>
                  <Td>
                    {m.membership.commercialVisibility ? (
                      <Pill tone="neutral">visible</Pill>
                    ) : (
                      <Pill tone="quiet">hidden</Pill>
                    )}
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant={m.membership.isActive ? "destructive-quiet" : "secondary"}
                      /* The three selects in this row are already named for the
                         person; this button was not, so five rows offered five
                         identical "Revoke access" — the one press here that
                         takes somebody's access away. */
                      aria-label={`${
                        m.membership.isActive ? "Revoke access for" : "Restore access for"
                      } ${m.displayName ?? m.email}`}
                      loading={busy === m.membership.id}
                      onClick={() => { setActive(m.membership.id, !m.membership.isActive); }}
                    >
                      {m.membership.isActive ? "Revoke access" : "Restore"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="field-hint">
          Revoking takes effect on their next request, not at their next sign-in. A grade is
          seniority only — it grants nothing, and it is what review rules compare.
        </p>
      </Stack>

      <AddMember roles={roles} onAdded={() => void load()} onError={setError} />
    </Page>
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
  // What came of the LAST add, kept on the form rather than announced and
  // dismissed. "Was an email sent?" is the question an administrator asks
  // straight after pressing the button, and a toast that has already faded
  // answers it for nobody.
  const [outcome, setOutcome] = useState<{
    email: string;
    sent: boolean;
    audience: string;
  } | null>(null);

  const chosenRole = role || roles[0]?.entry.key || "";

  // What a client-portal login would actually be able to use: nothing.
  //
  // Gate 2 (audience) runs before gate 3 (role) and admits a portal session
  // only to the handful of session routes, none of which needs a permission.
  // So a portal membership carrying `manager` is not a hole — every staff route
  // answers 403 — but it is a decision an admin can make believing it did
  // something, and the roster would then show them as a Manager.
  //
  // The API does not refuse it, deliberately: which roles are portal roles is
  // not a fact the system records yet, and inventing that rule here would put
  // it in the one place a firm cannot change. So this SAYS so rather than
  // silently filtering the dropdown, which would hide a real state from an
  // admin looking at it. The real fix is a role that declares its audience, and
  // it lands with the client portal.
  const strandedPermissions =
    audience === "CLIENT_PORTAL"
      ? readRoleBody(roles.find((r) => r.entry.key === chosenRole)?.published?.body).permissions
      : [];

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
    // A member was created either way — `invitationSent: false` is an ordinary
    // outcome, not a failure, and it is reported rather than hidden. An admin
    // who is not told will believe a letter arrived.
    setOutcome({
      email,
      sent: result.data.invitationSent,
      audience: result.data.audience,
    });
    setEmail("");
    setDisplayName("");
    onAdded();
  }

  return (
    <Card>
      <CardHead title="Add somebody" level={2} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="stack">
          <FieldRow>
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
              />
            </Field>
            <Field label="Name" optional>
              <Input
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); }}
              />
            </Field>
            <Field label="Role">
              <Select value={chosenRole} onChange={(e) => { setRole(e.target.value); }}>
                {roles.map((r) => (
                  <option key={r.entry.key} value={r.entry.key}>
                    {readRoleBody(r.published?.body).label || r.entry.key}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Surface">
              <Select value={audience} onChange={(e) => { setAudience(e.target.value); }}>
                <option value="STAFF">Staff workspace</option>
                <option value="CLIENT_PORTAL">Client portal</option>
              </Select>
            </Field>
          </FieldRow>

          {strandedPermissions.length > 0 && (
            <Notice tone="warn" eyebrow="Will not apply">
              <p>
                <strong>
                  This role carries {strandedPermissions.length} permission
                  {strandedPermissions.length === 1 ? "" : "s"} a client-portal login cannot
                  use.
                </strong>{" "}
                A portal session reaches only its own sign-in and org-switch routes, so{" "}
                {strandedPermissions.join(", ")} will not apply. They will still be listed as
                “
                {readRoleBody(roles.find((r) => r.entry.key === chosenRole)?.published?.body)
                  .label || chosenRole}
                ” on the roster.
              </p>
            </Notice>
          )}

          <Checkbox
            label="Can see fees"
            note="separate from their role, on purpose."
            checked={seesFees}
            onChange={(e) => { setSeesFees(e.target.checked); }}
          />

          {outcome !== null && (
            <Notice
              tone={outcome.sent ? "ok" : "warn"}
              eyebrow={outcome.sent ? "Added" : "Added, not written to"}
            >
              <p>
                {outcome.sent ? (
                  <>
                    <strong>{outcome.email} has been emailed a sign-in link.</strong> It works
                    once and stops working after 72 hours. If they miss it, they can ask the
                    sign-in page for another one with the same address.
                  </>
                ) : outcome.audience === "CLIENT_PORTAL" ? (
                  <>
                    <strong>No email was sent, and that is deliberate.</strong> A portal login
                    made here can read nothing until it is granted a client, so there would be
                    nothing to invite them to. Invite a client&rsquo;s own people from that
                    client&rsquo;s page instead.
                  </>
                ) : (
                  <>
                    <strong>{outcome.email} was added, but the letter did not go out.</strong>{" "}
                    They still have access — tell them to sign in at the login page with this
                    address and ask for a link. The mail failure is in the server log.
                  </>
                )}
              </p>
            </Notice>
          )}

          <div>
            <Button type="submit" loading={busy}>
              Add
            </Button>
            <p className="field-hint">
              Staff are emailed a sign-in link that lasts 72 hours. A client-portal login is
              not — invite a client&rsquo;s people from that client&rsquo;s page, where the
              invite grants access at the same time.
            </p>
          </div>
        </div>
      </form>
    </Card>
  );
}
