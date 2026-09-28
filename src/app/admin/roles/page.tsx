"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, PermissionInfo } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Loading } from "@/components/states";
import {
  Button,
  Checkbox,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Pill,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  useSwapFocus,
} from "@/components/ui";

/**
 * What the firm's roles MEAN — the other half of access control, and the screen
 * that makes the configuration registry visible.
 *
 * Roles are config rows the firm owns: it can rename them, change what they
 * carry, and invent its own. Two things this screen shows on purpose, because
 * they are the registry's actual design and hiding them would make the version
 * numbers look decorative:
 *
 *   - each role's VERSION, so it is obvious that changing one publishes a new
 *     version rather than editing the old one, and that the old one is kept;
 *   - the permission set fetched from the API rather than retyped here, so this
 *     screen cannot offer a permission the backend does not check.
 */
export default function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, vocabulary] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "role" } } }),
      api.GET("/api/v1/config/permissions", {}),
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
    setRoles(list.data.entries);
    if (vocabulary.data) setPermissions(vocabulary.data.permissions);
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

  if (!loaded) return <Loading label="Loading roles" />;

  return (
    <Page>
      {/* No lede (Wave 4). Saving a role publishes a NEW version of it; the
          old one is kept, and the version is shown under each role's name. */}
      <PageHeader
        title="Roles"
        aside={
          <NewRole permissions={permissions} onCreated={() => void load()} />
        }
      />

      <ErrorNotice error={error} />

      <RoleMatrix
        roles={roles}
        permissions={permissions}
        onSaved={() => void load()}
        onError={setError}
      />
    </Page>
  );
}

/**
 * The permission checklist, written once.
 *
 * Both the editor and the create form need exactly this list with exactly this
 * behaviour, and they had two copies of it. Local to this screen rather than in
 * the design system, because a checklist of THIS API's permissions is not a
 * general-purpose component — the shared parts (`Checkbox`, the mono key, the
 * muted description) already come from there.
 */
function PermissionChecklist({
  permissions,
  forRole,
  held,
  onToggle,
}: {
  permissions: PermissionInfo[];
  /**
   * Whose permissions these are. NOT optional.
   *
   * Measured on the rendered screen: 66 checkboxes, ELEVEN distinct names, each
   * repeated six times — once per role — and not one of them said which role.
   * "tenant:admin — Administer the firm: who works here, what their roles are,
   * and every configuration setting" read identically on Associate and on
   * Partner. The role headings carry it for somebody who can see them; nothing
   * carried it for somebody who cannot, on the screen that decides who may do
   * what.
   */
  forRole: string;
  held: string[];
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
    /* `aria-label` and no <legend>: the role's name is already on screen as the
       card's heading, so a visible caption would repeat it. `.fieldset` is
       border/padding/margin zero, which is right here — this is a plain list,
       not a card, so there is nothing for it to strip. */
    <fieldset className="fieldset stack tight" aria-label={`Permissions for ${forRole}`}>
      {permissions.map((p) => (
        <Checkbox
          key={p.key}
          checked={held.includes(p.key)}
          onChange={(e) => { onToggle(p.key, e.target.checked); }}
          label={p.description}
          note={p.key}
        />
      ))}
    </fieldset>
  );
}

/**
 * ONE TABLE, PERMISSIONS DOWN AND ROLES ACROSS (Wave 4).
 *
 * It was one card per role, each listing all twelve permissions with their
 * full sentence: 4,243px, and the one question a partner brings here ("which
 * roles can approve a discount?") needed five cards read side by side in their
 * head. Across, the answer is one row. Each role still saves on its own,
 * two calls, draft then publish, from its own Publish button, which appears
 * under that column only when its ticks differ from what is in force.
 */
function RoleMatrix({
  roles,
  permissions,
  onSaved,
  onError,
}: {
  roles: ConfigEntry[];
  permissions: PermissionInfo[];
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [held, setHeld] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const current = (role: ConfigEntry): string[] => [...readRoleBody(role.published?.body).permissions];
  const ticks = (role: ConfigEntry): string[] => held[role.entry.key] ?? current(role);
  const changed = (role: ConfigEntry): boolean => {
    const now = ticks(role);
    const was = current(role);
    return now.length !== was.length || now.some((p) => !was.includes(p));
  };

  async function save(role: ConfigEntry): Promise<void> {
    const label = readRoleBody(role.published?.body).label;
    setBusy(role.entry.key);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing.
    onError("");
    // Two calls: draft, then publish. For a role an admin is editing on
    // screen they are one intent, so this does both. If the publish is refused
    // (it would leave the firm with nobody able to administer it), the draft
    // stays and the reason is shown.
    const draft = await api.POST("/api/v1/config/{kind}/{key}/versions", {
      params: { path: { kind: "role", key: role.entry.key } },
      body: { body: { label, permissions: ticks(role) } },
    });
    if (draft.error || !draft.data) {
      onError(apiError(draft.error).message);
      setBusy(null);
      return;
    }
    const published = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "role", key: role.entry.key, version: draft.data.version } },
    });
    setBusy(null);
    if (published.error) {
      onError(apiError(published.error).message);
      return;
    }
    setHeld((was) => {
      const next = { ...was };
      delete next[role.entry.key];
      return next;
    });
    onSaved();
  }

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Permission</Th>
            {roles.map((role) => {
              const label = readRoleBody(role.published?.body).label || role.entry.key;
              return (
                <Th key={role.entry.key} align="center">
                  {label}
                  <Sub>
                    {role.published === null ? "Not published" : `v${String(role.published.version)}`}
                  </Sub>
                </Th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.key}>
              <Td>
                <span className="cell-text">
                  {p.description}
                  <Sub>
                    <span className="mono">{p.key}</span>
                  </Sub>
                </span>
              </Td>
              {roles.map((role) => {
                const label = readRoleBody(role.published?.body).label || role.entry.key;
                return (
                  <Td key={role.entry.key} align="center">
                    {/* NAMED BY THE PERMISSION AND THE ROLE: 66 boxes with
                        eleven names, none saying which role, was measured on
                        the card version of this screen. */}
                    <label className="check justify-center">
                      <input
                        type="checkbox"
                        aria-label={`${p.key} for ${label}`}
                        checked={ticks(role).includes(p.key)}
                        disabled={busy === role.entry.key}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setHeld((was) => {
                            const base = was[role.entry.key] ?? current(role);
                            return {
                              ...was,
                              [role.entry.key]: on
                                ? [...base, p.key]
                                : base.filter((k) => k !== p.key),
                            };
                          });
                        }}
                      />
                    </label>
                  </Td>
                );
              })}
            </tr>
          ))}
          <tr>
            <Td>
              <span className="sub">Ticks save per role, as a new version.</span>
            </Td>
            {roles.map((role) => {
              const label = readRoleBody(role.published?.body).label || role.entry.key;
              return (
                <Td key={role.entry.key} align="center">
                  {changed(role) && (
                    <Button
                      size="sm"
                      loading={busy === role.entry.key}
                      aria-label={`Publish ${label} as a new version`}
                      onClick={() => void save(role)}
                    >
                      Publish
                    </Button>
                  )}
                </Td>
              );
            })}
          </tr>
        </tbody>
      </Table>
    </TableWrap>
  );
}

function NewRole({
  permissions,
  onCreated,
}: {
  permissions: PermissionInfo[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { trigger } = useSwapFocus(open);
  // The refusal is shown IN the dialog, beside the form that caused it.
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [held, setHeld] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    setError(null);
    const defined = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind: "role" } },
      body: { key, body: { label, permissions: held } },
    });
    const draft = defined.data?.draft;
    if (defined.error || !draft) {
      setError(apiError(defined.error).message);
      setBusy(false);
      return;
    }
    const published = await api.POST(
      "/api/v1/config/{kind}/{key}/versions/{version}/publish",
      { params: { path: { kind: "role", key, version: draft.version } } },
    );
    setBusy(false);
    if (published.error) {
      setError(apiError(published.error).message);
      return;
    }
    setKey("");
    setLabel("");
    setHeld([]);
    setOpen(false);
    onCreated();
  }

  return (
    <>
      <Button ref={trigger} onClick={() => { setOpen(true); }}>
        Add a role
      </Button>
      <Dialog
        open={open}
        size="lg"
        onClose={() => { setOpen(false); }}
        title="Add a role"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); }}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={busy}>
              Create and publish
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
              <Field label="Short name">
                <Input
                  required
                  autoFocus
                  value={key}
                  placeholder="e.g. relationship-manager"
                  onChange={(e) => { setKey(e.target.value); }}
                />
              </Field>
              <Field label="Name">
                <Input
                  required
                  value={label}
                  placeholder="e.g. Relationship manager"
                  onChange={(e) => { setLabel(e.target.value); }}
                />
              </Field>
            </FieldRow>
            {/* UNDER the row (the FieldRow rule). */}
            <p className="field-hint">The short name cannot change later. The name can.</p>

            <PermissionChecklist
              permissions={permissions}
              /* A fixed phrase, not the `label` state: naming the group after
                 the name being typed would rename it on every keystroke. */
              forRole="the new role"
              held={held}
              onToggle={(k, on) => {
                setHeld((was) => (on ? [...was, k] : was.filter((x) => x !== k)));
              }}
            />
            <ErrorNotice error={error} />
          </FieldStack>
        </form>
      </Dialog>
    </>
  );
}
