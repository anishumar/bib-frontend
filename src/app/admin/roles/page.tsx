"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, PermissionInfo } from "@/lib/api/client";
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
  Input,
  Pill,
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
      <PageHeader
        eyebrow="The firm"
        title="Roles"
        lede="What each role MEANS. Changing one publishes a new version rather than editing the old one — the version beside each name is the registry's design, not decoration."
        aside={<Pill tone="quiet">{roles.length} defined</Pill>}
      />

      <ErrorNotice error={error} />

      <Stack>
        {roles.map((role) => (
          <RoleCard
            key={role.entry.key}
            role={role}
            permissions={permissions}
            onSaved={() => void load()}
            onError={setError}
          />
        ))}
      </Stack>

      <NewRole permissions={permissions} onCreated={() => void load()} onError={setError} />
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
          label={<span className="mono">{p.key}</span>}
          note={p.description}
        />
      ))}
    </fieldset>
  );
}

function RoleCard({
  role,
  permissions,
  onSaved,
  onError,
}: {
  role: ConfigEntry;
  permissions: PermissionInfo[];
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const current = readRoleBody(role.published?.body);
  const [held, setHeld] = useState<string[]>([...current.permissions]);
  const [busy, setBusy] = useState(false);

  const changed =
    held.length !== current.permissions.length ||
    held.some((p) => !current.permissions.includes(p));

  async function save(): Promise<void> {
    setBusy(true);
    // CLEARED BEFORE THE CALL. `ErrorNotice` moves focus when a message
    // APPEARS, so a second identical refusal has to be a second absent →
    // present transition or the press looks like it did nothing. It also
    // stops a refusal from the LAST action sitting over this one.
    onError("");
    // Two calls: draft, then publish. The registry keeps them separate because
    // preparing a change and putting it in force are different decisions — but
    // for a role an admin is editing on screen they are one intent, so this does
    // both. If the publish is refused (it would leave the firm with nobody able
    // to administer it), the draft stays and the reason is shown; nothing is in
    // force that the admin did not intend.
    const draft = await api.POST("/api/v1/config/{kind}/{key}/versions", {
      params: { path: { kind: "role", key: role.entry.key } },
      body: { body: { label: current.label, permissions: held } },
    });
    if (draft.error || !draft.data) {
      onError(apiError(draft.error).message);
      setBusy(false);
      return;
    }
    const published = await api.POST(
      "/api/v1/config/{kind}/{key}/versions/{version}/publish",
      {
        params: {
          path: { kind: "role", key: role.entry.key, version: draft.data.version },
        },
      },
    );
    setBusy(false);
    if (published.error) {
      onError(apiError(published.error).message);
      return;
    }
    onSaved();
  }

  return (
    <Card>
      <CardHead
        level={2}
        title={
          <>
            {current.label || role.entry.key}{" "}
            <span className="mono muted">{role.entry.key}</span>
          </>
        }
        aside={
          <Pill tone={role.published === null ? "warn" : "neutral"}>
            {role.published === null ? "not published" : `v${String(role.published.version)}`}
          </Pill>
        }
      />

      <PermissionChecklist
        permissions={permissions}
        forRole={current.label}
        held={held}
        onToggle={(key, on) => {
          setHeld((was) => (on ? [...was, key] : was.filter((k) => k !== key)));
        }}
      />

      {changed && (
        <div className="card-foot">
          <Button loading={busy} onClick={() => void save()}>
            Publish as a new version
          </Button>
        </div>
      )}
    </Card>
  );
}

function NewRole({
  permissions,
  onCreated,
  onError,
}: {
  permissions: PermissionInfo[];
  onCreated: () => void;
  onError: (message: string) => void;
}) {
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
    onError("");
    const defined = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind: "role" } },
      body: { key, body: { label, permissions: held } },
    });
    const draft = defined.data?.draft;
    if (defined.error || !draft) {
      onError(apiError(defined.error).message);
      setBusy(false);
      return;
    }
    const published = await api.POST(
      "/api/v1/config/{kind}/{key}/versions/{version}/publish",
      { params: { path: { kind: "role", key, version: draft.version } } },
    );
    setBusy(false);
    if (published.error) {
      onError(apiError(published.error).message);
      return;
    }
    setKey("");
    setLabel("");
    setHeld([]);
    onCreated();
  }

  return (
    <Card>
      <CardHead title="Add a role" level={2} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="stack">
          <FieldRow>
            <Field
              label="Handle"
              hint="Permanent, and what memberships refer to."
            >
              <Input
                required
                value={key}
                placeholder="relationship-manager"
                onChange={(e) => { setKey(e.target.value); }}
              />
            </Field>
            <Field label="Name" hint="Changeable whenever you like.">
              <Input
                required
                value={label}
                placeholder="Relationship manager"
                onChange={(e) => { setLabel(e.target.value); }}
              />
            </Field>
          </FieldRow>

          <PermissionChecklist
            permissions={permissions}
            /* A fixed phrase, not the `label` state: the role's name is being
               typed in a field a few lines up, and naming the group after it
               would rename the group on every keystroke. */
            forRole="the new role"
            held={held}
            onToggle={(k, on) => {
              setHeld((was) => (on ? [...was, k] : was.filter((x) => x !== k)));
            }}
          />

          <div>
            <Button type="submit" loading={busy}>
              Create and publish
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
