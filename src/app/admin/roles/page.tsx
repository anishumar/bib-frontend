"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, readRoleBody } from "@/lib/api/client";
import type { ConfigEntry, PermissionInfo } from "@/lib/api/client";

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

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <h1>Roles</h1>
      {error !== null && <p className="bib-error">{error}</p>}

      {roles.map((role) => (
        <RoleCard
          key={role.entry.key}
          role={role}
          permissions={permissions}
          onSaved={() => void load()}
          onError={setError}
        />
      ))}

      <NewRole permissions={permissions} onCreated={() => void load()} onError={setError} />
    </main>
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
    <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {current.label || role.entry.key}{" "}
          <span className="bib-muted bib-mono">{role.entry.key}</span>
        </h2>
        <span className="bib-pill">
          {role.published === null ? "not published" : `v${String(role.published.version)}`}
        </span>
      </div>

      <div style={{ marginTop: "var(--bib-gap-2)", display: "grid", gap: "var(--bib-gap-1)" }}>
        {permissions.map((p) => (
          <label key={p.key} className="bib-check">
            <input
              type="checkbox"
              checked={held.includes(p.key)}
              onChange={(e) => {
                setHeld((was) =>
                  e.target.checked ? [...was, p.key] : was.filter((k) => k !== p.key),
                );
              }}
            />
            <span>
              <span className="bib-mono">{p.key}</span>
              <span className="bib-muted"> — {p.description}</span>
            </span>
          </label>
        ))}
      </div>

      {changed && (
        <button
          className="bib-button"
          style={{ marginTop: "var(--bib-gap-2)" }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Publishing…" : "Publish as a new version"}
        </button>
      )}
    </div>
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
    <div className="bib-card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Add a role</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="bib-field-row">
          <div>
            <label className="bib-label" htmlFor="key">Handle</label>
            <input
              id="key" className="bib-input" required value={key} placeholder="relationship-manager"
              onChange={(e) => { setKey(e.target.value); }}
            />
          </div>
          <div>
            <label className="bib-label" htmlFor="label">Name</label>
            <input
              id="label" className="bib-input" required value={label} placeholder="Relationship manager"
              onChange={(e) => { setLabel(e.target.value); }}
            />
          </div>
        </div>
        <p className="bib-muted" style={{ fontSize: 13 }}>
          The handle is permanent and is what memberships refer to. The name can be changed
          whenever you like.
        </p>

        <div style={{ display: "grid", gap: "var(--bib-gap-1)" }}>
          {permissions.map((p) => (
            <label key={p.key} className="bib-check">
              <input
                type="checkbox"
                checked={held.includes(p.key)}
                onChange={(e) => {
                  setHeld((was) =>
                    e.target.checked ? [...was, p.key] : was.filter((k) => k !== p.key),
                  );
                }}
              />
              <span>
                <span className="bib-mono">{p.key}</span>
                <span className="bib-muted"> — {p.description}</span>
              </span>
            </label>
          ))}
        </div>

        <button className="bib-button" style={{ marginTop: "var(--bib-gap-2)" }} disabled={busy}>
          {busy ? "Creating…" : "Create and publish"}
        </button>
      </form>
    </div>
  );
}
