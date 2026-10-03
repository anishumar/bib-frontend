"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, Member, StaffGrade } from "@/lib/api/client";
import { Page, PageHeader, Stack, useSession } from "@/components/layout";
import { Loading } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-action";
import {
  Button,
  Checkbox,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Notice,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Input,
  Menu,
  MenuItem,
  useSwapFocus,
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
  /** The last row change that held, said in a live region (CA#45). */
  const [saved, setSaved] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // "Add somebody" is the page's one brand button, top right, and opens a
  // dialog (Wave 4). What came of the last add is said ON THE PAGE after the
  // dialog closes: "was an email sent?" is asked straight after the press.
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<AddOutcome | null>(null);
  // Revoking access asks first (V1.3); restoring it does not.
  const [revoking, setRevoking] = useState<{ member: Member; from: HTMLElement | null } | null>(null);
  const { trigger: addTrigger } = useSwapFocus(adding);
  // F33 (audit 2026-10-03): somebody who reaches this page by its address
  // without administering the firm was offered Add somebody over an empty
  // table. They are shown the API's refusal and nothing to press.
  const session = useSession();
  const administers = session?.permissions.includes("tenant:admin") === true;

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
  async function act(
    key: string,
    call: () => Promise<{ error?: unknown }>,
    /** What to say once it held (CA#45): these selects saved with no sign. */
    done?: string,
  ): Promise<void> {
    setBusy(key);
    setError(null);
    setSaved(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
    if (done !== undefined) setSaved(done);
  }

  /** The person's name as the roster shows it, for the "Saved" line. */
  const who = (membershipId: string): string => {
    const m = members.find((x) => x.membership.id === membershipId);
    return m === undefined ? "Their" : `${m.displayName ?? m.email}'s`;
  };

  function changeRole(membershipId: string, role: string): void {
    void act(
      membershipId,
      () =>
        api.PUT("/api/v1/tenancy/members/{membershipId}/role", {
          params: { path: { membershipId } },
          body: { role },
        }),
      `Saved. ${who(membershipId)} role is changed.`,
    );
  }

  /** `null` takes somebody off the ladder, which is a real answer rather than a
   *  missing one — a client contact has no rung, and neither does somebody whose
   *  designation the firm has never ranked. */
  function changeGrade(membershipId: string, gradeId: string | null): void {
    void act(
      membershipId,
      () =>
        api.PUT("/api/v1/tenancy/members/{membershipId}/grade", {
          params: { path: { membershipId } },
          body: { gradeId },
        }),
      `Saved. ${who(membershipId)} grade is changed.`,
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
    void act(
      membershipId,
      () =>
        api.PUT("/api/v1/tenancy/members/{membershipId}/reports-to", {
          params: { path: { membershipId } },
          body: { reportsToUserId },
        }),
      `Saved. ${who(membershipId)} reporting line is changed.`,
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
  if (session !== null && !administers) {
    return (
      <Page>
        <PageHeader title="People" />
        <ErrorNotice error={error} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="People"
        aside={
          <Button
            ref={addTrigger}
            onClick={() => {
              setOutcome(null);
              setAdding(true);
            }}
          >
            Add somebody
          </Button>
        }
      />

      <ErrorNotice error={error} />

      {/* A live region, so a change made in a row says it held (CA#45). */}
      <p className="text-md" role="status" aria-live="polite">
        {saved}
      </p>

      {outcome !== null && <AddedNotice outcome={outcome} />}

      <Stack gap="tight">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Grade</Th>
                <Th>Reports to</Th>
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
                <Tr key={m.membership.id}>
                  <Td>
                    {/* The name when there is one; the email otherwise. Nobody
                        is shown as a uuid. Held to 12rem with the email free
                        to break (Wave 4): the roster hid 287px of columns at
                        1280 behind one long address. */}
                    <span className="block max-w-48 [overflow-wrap:anywhere]">
                      {m.displayName ?? m.email}
                      {/* ACCESS AS A PILL BESIDE THE NAME, only when it is not
                          the ordinary case. It was a column that read "STAFF"
                          on every row; a revoked login and a client-portal
                          login are the two a reader needs to spot. */}
                      {!m.membership.isActive ? (
                        <>
                          {" "}
                          <Pill dot tone="danger">
                            Revoked
                          </Pill>
                        </>
                      ) : m.membership.audience !== "STAFF" ? (
                        <>
                          {" "}
                          <Pill tone="neutral">
                            {AUDIENCE_WORDS[m.membership.audience] ?? m.membership.audience}
                          </Pill>
                        </>
                      ) : null}
                      {m.displayName !== null && <Sub>{m.email}</Sub>}
                    </span>
                  </Td>
                  <Td>
                    {/* A WRAPPER caps it: one long role, grade or name in the
                        firm's lists sets a select's width and pushed the last
                        columns out of view. `.select` declares its own
                        max-width, so the cap cannot sit on the select. */}
                    <span className="inline-block max-w-44 align-middle">
                      <Select
                        variant="quiet"
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
                        {/* Only the roles for THIS person's surface (F18): a
                            staff member was offered "Client contact", one
                            mis-pick from becoming a portal login. */}
                        {roles
                          .filter((r) => readRoleBody(r.published?.body).audience === m.membership.audience)
                          .map((r) => (
                            <option key={r.entry.key} value={r.entry.key}>
                              {readRoleBody(r.published?.body).label || r.entry.key}
                            </option>
                          ))}
                      </Select>
                    </span>
                  </Td>
                  {m.membership.audience !== "STAFF" ? (
                    /* A client's login has no grade and reports to nobody at
                       the firm (F18): no selects that mean nothing for them. */
                    <>
                      <Td>
                        <span className="muted">Not for clients</span>
                      </Td>
                      <Td>
                        <span className="muted">Not for clients</span>
                      </Td>
                    </>
                  ) : (
                  <>
                  <Td>
                    {/* A WRAPPER caps it: one long role, grade or name in the
                        firm's lists sets a select's width and pushed the last
                        columns out of view. `.select` declares its own
                        max-width, so the cap cannot sit on the select. */}
                    <span className="inline-block max-w-44 align-middle">
                      <Select
                        variant="quiet"
                        aria-label={`Grade for ${m.displayName ?? m.email}`}
                        value={m.grade?.id ?? ""}
                        disabled={busy === m.membership.id}
                        onChange={(e) => { changeGrade(m.membership.id, e.target.value || null); }}
                      >
                        {/* Ungraded is offered as a choice, not shown as an empty
                            cell: taking somebody off the ladder is a decision, and a
                            portal contact belongs on no rung at all. */}
                        <option value="">Not graded</option>
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
                    </span>
                  </Td>
                  <Td>
                    {/* A WRAPPER caps it: one long role, grade or name in the
                        firm's lists sets a select's width and pushed the last
                        columns out of view. `.select` declares its own
                        max-width, so the cap cannot sit on the select. */}
                    <span className="inline-block max-w-44 align-middle">
                      <Select
                        variant="quiet"
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
                        <option value="">Nobody</option>
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
                    </span>
                  </Td>
                  </>
                  )}
                  <Td>{m.membership.commercialVisibility ? "Visible" : "Hidden"}</Td>
                  <Td align="right">
                    {/* IN A MENU (Wave 4): the one press here that takes
                        somebody's access away, one click deeper and 90px back
                        in a table that hid its last columns at 1280. Named for
                        the person, as the button was. */}
                    <Menu
                      trigger={
                        <span
                          className="btn"
                          data-variant="ghost"
                          data-size="sm"
                          aria-label={`More for ${m.displayName ?? m.email}`}
                        >
                          {busy === m.membership.id ? "Saving" : "More"}
                        </span>
                      }
                    >
                      <MenuItem
                        {...(m.membership.isActive ? { tone: "danger" as const } : {})}
                        disabled={busy === m.membership.id}
                        onClick={() => {
                          if (m.membership.isActive) {
                            setRevoking({
                              member: m,
                              from: document.activeElement instanceof HTMLElement ? document.activeElement : null,
                            });
                            return;
                          }
                          setActive(m.membership.id, true);
                        }}
                      >
                        {m.membership.isActive ? "Revoke access" : "Restore access"}
                      </MenuItem>
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="field-hint">Revoking access takes effect at once.</p>
        <ConfirmDialog
          open={revoking !== null}
          onClose={() => {
            setRevoking(null);
          }}
          title={`Revoke ${revoking?.member.displayName ?? revoking?.member.email ?? ""}'s access?`}
          confirmLabel="Revoke access"
          destructive
          consequence={
            <p>
              {revoking?.member.displayName ?? revoking?.member.email} is signed out at once and
              cannot sign in to this firm. Their work stays where it is. You can restore access
              later.
            </p>
          }
          onConfirm={() => {
            if (revoking !== null) setActive(revoking.member.membership.id, false);
          }}
          returnFocusTo={revoking?.from ?? null}
        />
      </Stack>

      {adding && (
        <AddMember
          roles={roles}
          onClose={() => {
            setAdding(false);
          }}
          onAdded={(added) => {
            setOutcome(added);
            setAdding(false);
            void load();
          }}
        />
      )}
    </Page>
  );
}

const AUDIENCE_WORDS: Record<string, string> = {
  STAFF: "Staff",
  CLIENT_PORTAL: "Client portal",
};

interface AddOutcome {
  email: string;
  sent: boolean;
  audience: string;
}

/**
 * What came of the LAST add, kept on the page rather than announced and
 * dismissed. `invitationSent: false` is an ordinary outcome, not a failure, and
 * it is reported rather than hidden: an admin who is not told will believe a
 * letter arrived.
 */
function AddedNotice({ outcome }: { outcome: AddOutcome }) {
  return (
    <Notice
      tone={outcome.sent ? "ok" : "warn"}
      eyebrow={outcome.sent ? "Added" : "Added, but no email sent"}
    >
      <p>
        {outcome.sent ? (
          <>{outcome.email} has been emailed a sign-in link. It works once, for 72 hours.</>
        ) : outcome.audience === "CLIENT_PORTAL" ? (
          <>
            A client-portal login sees nothing until it has a client. Invite a client&rsquo;s
            people from that client&rsquo;s page.
          </>
        ) : (
          <>
            {outcome.email} has access, but the email did not go out. Ask them to request a
            link from the sign-in page.
          </>
        )}
      </p>
    </Notice>
  );
}

function AddMember({
  roles,
  onClose,
  onAdded,
}: {
  roles: ConfigEntry[];
  onClose: () => void;
  onAdded: (outcome: AddOutcome) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [audience, setAudience] = useState("STAFF");
  const [seesFees, setSeesFees] = useState(false);
  const [busy, setBusy] = useState(false);
  // The refusal is shown IN the dialog, beside the form that caused it.
  const [error, setError] = useState<string | null>(null);

  // NOTHING PRESELECTED (F13): it was the first published role. And only the
  // roles for the surface chosen (F18), so a staff member cannot be added as a
  // client contact, or the other way round.
  const chosenRole = role;
  const offered = roles.filter((r) => readRoleBody(r.published?.body).audience === audience);

  async function submit(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    setError(null);
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
      setError(apiError(result.error).message);
      return;
    }
    // A member was created either way; see `AddedNotice`.
    onAdded({ email, sent: result.data.invitationSent, audience: result.data.audience });
  }

  const formId = "add-member";

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Add somebody"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Add
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FieldStack>
          <FieldRow>
            <Field label="Email">
              <Input
                type="email"
                required
                autoFocus
                placeholder="e.g. asha@yourfirm.in"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            </Field>
            <Field label="Name" optional>
              <Input
                placeholder="e.g. Asha Verma"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                }}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Signs in to">
              <Select
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value);
                  setRole("");
                }}
              >
                <option value="STAFF">Staff workspace</option>
                <option value="CLIENT_PORTAL">Client portal</option>
              </Select>
            </Field>
            <Field label="Role">
              <Select
                value={chosenRole}
                required
                onChange={(e) => {
                  setRole(e.target.value);
                }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {offered.map((r) => (
                  <option key={r.entry.key} value={r.entry.key}>
                    {readRoleBody(r.published?.body).label || r.entry.key}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>

          <Checkbox
            label="Can see fees"
            note="set separately from their role."
            checked={seesFees}
            onChange={(e) => {
              setSeesFees(e.target.checked);
            }}
          />

          <ErrorNotice error={error} />

          <p className="field-hint">
            Staff get a sign-in link by email. Invite a client&rsquo;s people from their page.
          </p>
        </FieldStack>
      </form>
    </Dialog>
  );
}
