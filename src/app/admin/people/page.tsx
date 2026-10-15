"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, Member, PortalGrant, StaffGrade } from "@/lib/api/client";
import { Page, PageHeader, Stack, useSession } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import { ConfirmDialog } from "@/components/confirm-action";
import {
  Button,
  Checkbox,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  LinkButton,
  Notice,
  Pill,
  Select,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  Tr,
  Input,
  Menu,
  MenuItem,
  useSwapFocus,
} from "@/components/ui";

/**
 * The firm's roster, in two views: the firm's own staff, and the logins its
 * clients use for the portal. One table mixed both, and half its columns read
 * "Not for clients" on every client row.
 *
 * Every action here is one API call and the API owns every rule — which roles
 * may be assigned, and whether the firm would be left with nobody able to
 * administer it. Its refusals are shown verbatim.
 *
 * Roles and grades come from the firm's OWN published lists, not a hardcoded
 * one. The grade is a separate axis from the role: the role says what somebody
 * may reach, the grade how senior they are (edited on /admin/grades).
 */
type View = "firm" | "clients";

export default function PeoplePage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<ConfigEntry[]>([]);
  const [grades, setGrades] = useState<StaffGrade[]>([]);
  /** Grants in force today; null when this login may not read them (`portal:grant`). */
  const [grants, setGrants] = useState<PortalGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The last row change that held, said in a live region (CA#45). */
  const [saved, setSaved] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("firm");
  const tabsId = useId();
  // What came of the last add is said ON THE PAGE after the dialog closes:
  // "was an email sent?" is asked straight after the press.
  const [adding, setAdding] = useState(false);
  const [outcome, setOutcome] = useState<AddOutcome | null>(null);
  // Revoking access asks first (V1.3); restoring it does not.
  const [revoking, setRevoking] = useState<{ member: Member; from: HTMLElement | null } | null>(null);
  const { trigger: addTrigger } = useSwapFocus(adding);
  // F33 (audit 2026-10-03): somebody who reaches this page by its address
  // without administering the firm sees the API's refusal and nothing to press.
  const session = useSession();
  const administers = session?.permissions.includes("tenant:admin") === true;

  const load = useCallback(async (): Promise<void> => {
    const [roster, published, ladder, access] = await Promise.all([
      api.GET("/api/v1/tenancy/members", {}),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "role" } } }),
      api.GET("/api/v1/tenancy/grades", {}),
      api.GET("/api/v1/portal-access", {}),
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
    setGrants(access.data ? access.data.grants : null);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // The view lives in the URL (`?view=clients`) so a link can open it; read
  // after mount, because the server's render has no URL.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "clients") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable here
      setView("clients");
    }
  }, []);

  function showView(next: View): void {
    setView(next);
    setSaved(null);
    setOutcome(null);
    const q = new URLSearchParams(window.location.search);
    if (next === "firm") q.delete("view");
    else q.set("view", next);
    const query = q.toString();
    window.history.replaceState(
      null,
      "",
      query === "" ? window.location.pathname : `${window.location.pathname}?${query}`,
    );
  }

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
    // Role and fees are separate settings: say so, or a promotion reads as
    // having shown them fees (QA 2026-10-13).
    const m = members.find((x) => x.membership.id === membershipId);
    const hidden = m?.membership.audience === "STAFF" && !m.membership.commercialVisibility;
    void act(
      membershipId,
      () =>
        api.PUT("/api/v1/tenancy/members/{membershipId}/role", {
          params: { path: { membershipId } },
          body: { role },
        }),
      `Saved. ${who(membershipId)} role is changed.${hidden ? " Fees are still hidden for them; change that under Fees." : ""}`,
    );
  }

  function changeFees(membershipId: string, commercialVisibility: boolean): void {
    void act(
      membershipId,
      () =>
        api.PUT("/api/v1/tenancy/members/{membershipId}/fees", {
          params: { path: { membershipId } },
          body: { commercialVisibility },
        }),
      `Saved. ${who(membershipId)} fees are now ${commercialVisibility ? "visible" : "hidden"}.`,
    );
  }

  /** `null` takes somebody off the ladder: a real answer, not a missing one. */
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

  /** Who somebody reports to (T2.9). Grants nothing; a reporting-line rule on
   *  `/admin/verification` reads it. `null` is real: a partner reports to nobody. */
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

  const staff = members.filter((m) => m.membership.audience === "STAFF");
  const contacts = sortByClient(
    members.filter((m) => m.membership.audience !== "STAFF"),
    grants ?? [],
  );

  const name = (m: Member): string => m.displayName ?? m.email;

  /** One role select, offering only the roles for this person's side (F18). */
  const roleSelect = (m: Member, wide = false) => (
    // A wrapper caps the width (`.select` declares its own max-width); the
    // floor stops the select measuring before the web font arrives (CA#46).
    <span className={`inline-block align-middle ${wide ? "max-w-64" : "max-w-44"}`}>
      <Select
        variant="quiet"
        className={wide ? "min-w-56" : "min-w-36"}
        aria-label={`Role for ${name(m)}`}
        value={m.membership.role}
        disabled={busy === m.membership.id}
        onChange={(e) => {
          changeRole(m.membership.id, e.target.value);
        }}
      >
        {/* The role they hold is always an option, even once unpublished. */}
        {!roles.some((r) => r.entry.key === m.membership.role) && (
          <option value={m.membership.role}>{m.membership.role} (not published)</option>
        )}
        {roles
          .filter((r) => readRoleBody(r.published?.body).audience === m.membership.audience)
          .map((r) => (
            <option key={r.entry.key} value={r.entry.key}>
              {readRoleBody(r.published?.body).label || r.entry.key}
            </option>
          ))}
      </Select>
    </span>
  );

  /** Revoke sits in a menu (Wave 4): the one press here that takes access away. */
  const moreMenu = (m: Member) => (
    <Menu
      trigger={
        <span className="btn" data-variant="ghost" data-size="sm" aria-label={`More for ${name(m)}`}>
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
  );

  /** Name, a state pill when it is not the ordinary case, and the email under it. */
  const person = (m: Member, pill: ReactNode) => (
    // Held to 12rem with the email free to break (Wave 4).
    <span className="block max-w-48 [overflow-wrap:anywhere]">
      {name(m)}
      {!m.membership.isActive ? (
        <>
          {" "}
          <Pill dot tone="danger">
            Revoked
          </Pill>
        </>
      ) : (
        pill
      )}
      {m.displayName !== null && <Sub>{m.email}</Sub>}
    </span>
  );

  const staffTable = (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Person</Th>
            <Th>Role</Th>
            <Th>Grade</Th>
            <Th>Reports to</Th>
            <Th>Fees</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {staff.map((m) => (
            <Tr key={m.membership.id}>
              <Td>{person(m, null)}</Td>
              <Td>{roleSelect(m)}</Td>
              <Td>
                <span className="inline-block max-w-44 align-middle">
                  <Select
                    variant="quiet"
                    className="min-w-36"
                    aria-label={`Grade for ${name(m)}`}
                    value={m.grade?.id ?? ""}
                    disabled={busy === m.membership.id}
                    onChange={(e) => {
                      changeGrade(m.membership.id, e.target.value || null);
                    }}
                  >
                    <option value="">Not graded</option>
                    {/* A retired rung is offered only to the person already on it. */}
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
                <span className="inline-block max-w-56 align-middle">
                  <Select
                    variant="quiet"
                    className="min-w-36"
                    aria-label={`Reporting line for ${name(m)}`}
                    value={m.membership.reportsToUserId ?? ""}
                    disabled={busy === m.membership.id}
                    onChange={(e) => {
                      changeReportsTo(m.membership.id, e.target.value || null);
                    }}
                  >
                    <option value="">Nobody</option>
                    {/* Active staff only, never themselves: the API refuses both. */}
                    {staff
                      .filter((o) => o.membership.userId !== m.membership.userId && o.membership.isActive)
                      .map((o) => (
                        <option key={o.membership.id} value={o.membership.userId}>
                          {name(o)}
                        </option>
                      ))}
                  </Select>
                </span>
              </Td>
              <Td>
                <span className="inline-block max-w-32 align-middle">
                  <Select
                    variant="quiet"
                    className="min-w-28"
                    aria-label={`Fees for ${name(m)}`}
                    value={m.membership.commercialVisibility ? "visible" : "hidden"}
                    disabled={busy === m.membership.id}
                    onChange={(e) => {
                      changeFees(m.membership.id, e.target.value === "visible");
                    }}
                  >
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                  </Select>
                </span>
              </Td>
              <Td align="right">{moreMenu(m)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );

  const clientTable =
    contacts.length === 0 ? (
      <Empty title="No client logins yet" icon="clients">
        Invite a client&rsquo;s people from that client&rsquo;s page, under Portal access.
      </Empty>
    ) : (
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              {grants !== null && <Th>Client</Th>}
              <Th>Role</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((m) => {
              const sees = (grants ?? []).filter((g) => g.membershipId === m.membership.id);
              const first = sees[0];
              return (
                <Tr key={m.membership.id}>
                  <Td>
                    {person(
                      m,
                      first !== undefined && !first.contactAccepted ? (
                        <>
                          {" "}
                          <Pill dot tone="warn">
                            Not signed in yet
                          </Pill>
                        </>
                      ) : null,
                    )}
                  </Td>
                  {grants !== null && (
                    <Td>
                      {sees.length === 0 ? (
                        <span className="muted">No client yet</span>
                      ) : (
                        <span className="block max-w-64">
                          {sees.map((g) => (
                            <span key={g.id} className="block">
                              <Link href={`/clients/${g.clientPartyId}?section=portal`}>{g.clientName}</Link>
                            </span>
                          ))}
                        </span>
                      )}
                    </Td>
                  )}
                  <Td>{roleSelect(m, true)}</Td>
                  <Td align="right">{moreMenu(m)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    );

  return (
    <Page>
      <PageHeader
        title="People"
        aside={
          view === "firm" ? (
            <Button
              ref={addTrigger}
              onClick={() => {
                setOutcome(null);
                setAdding(true);
              }}
            >
              Add a colleague
            </Button>
          ) : (
            <LinkButton href="/clients">Invite a client contact</LinkButton>
          )
        }
      />

      <Tabs
        id={tabsId}
        label="People views"
        value={view}
        onChange={showView}
        tabs={[
          { value: "firm", label: "Our firm", count: staff.length },
          { value: "clients", label: "Clients", count: contacts.length },
        ]}
      />

      <ErrorNotice error={error} />

      {view === "firm" && outcome !== null && <AddedNotice outcome={outcome} />}

      <TabPanel tabsId={tabsId} value={view}>
        <Stack gap="tight">
          {/* A live region, so a change made in a row says it held (CA#45). */}
          <p className="text-md" role="status" aria-live="polite">
            {saved}
          </p>
          {view === "firm" ? staffTable : clientTable}
          <p className="field-hint">
            {view === "firm"
              ? "Revoking access takes effect at once."
              : "Invites are sent from the client's page, under Portal access. Revoking access takes effect at once."}
          </p>
        </Stack>
      </TabPanel>

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

/** Client logins A–Z by the first client they see; those who see none last. */
function sortByClient(contacts: Member[], grants: readonly PortalGrant[]): Member[] {
  const firstClient = (m: Member): string =>
    grants.find((g) => g.membershipId === m.membership.id)?.clientName ?? "";
  return [...contacts].sort((a, b) => {
    const ca = firstClient(a);
    const cb = firstClient(b);
    if (ca === "" || cb === "") return ca === cb ? 0 : ca === "" ? 1 : -1;
    return ca.localeCompare(cb) || (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email);
  });
}

interface AddOutcome {
  email: string;
  sent: boolean;
}

/**
 * What came of the LAST add, kept on the page. `invitationSent: false` is an
 * ordinary outcome and is reported: an admin who is not told will believe a
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

/** Adds a colleague. A client's people are invited from the client's page,
 *  where the invite also says which client they may see. */
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
  // Nothing preselected (F13), and staff roles only (F18).
  const [role, setRole] = useState("");
  const [seesFees, setSeesFees] = useState(false);
  const [busy, setBusy] = useState(false);
  // The refusal is shown IN the dialog, beside the form that caused it.
  const [error, setError] = useState<string | null>(null);
  const offered = roles.filter((r) => readRoleBody(r.published?.body).audience === "STAFF");

  async function submit(): Promise<void> {
    setBusy(true);
    // Cleared before the call: `ErrorNotice` moves focus when a message
    // appears, so a repeat refusal must be a fresh absent → present change.
    setError(null);
    const result = await api.POST("/api/v1/tenancy/members", {
      body: {
        email,
        audience: "STAFF",
        role,
        commercialVisibility: seesFees,
        // The API applies a name only to a NEW account.
        ...(displayName === "" ? {} : { displayName }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    onAdded({ email, sent: result.data.invitationSent });
  }

  const formId = "add-member";

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Add a colleague"
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
            <Field label="Role">
              <Select
                value={role}
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

          <p className="field-hint">They get a sign-in link by email.</p>
        </FieldStack>
      </form>
    </Dialog>
  );
}
