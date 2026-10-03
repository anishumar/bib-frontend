"use client";

/**
 * What reaches the bell, per category (0323). One component for two owners:
 *
 *   - `mine` (Your account): the person's own choice, on top of the firm's.
 *   - `firm` (Your firm, `tenant:admin` to change): what everybody starts with.
 *
 * Only the bell is offered, because only the bell is built. An email switch
 * would be a control that does nothing until the email channel exists, and a
 * person who turns it on would reasonably expect mail. The API already carries
 * the email and push channels, so they join this table the day they send.
 *
 * Escalations and missed filings are always on in the bell: the API refuses to
 * switch them off (409), so the box is shown ticked and fixed rather than
 * offered and then refused.
 */
import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { NotificationCategorySettings } from "@/lib/api/client";
import { ErrorNotice, Table, TableWrap, Td, Th, Tr } from "@/components/ui";
import { LoadingCard } from "@/components/states";

const GROUPS: readonly { key: NotificationCategorySettings["group"]; label: string }[] = [
  { key: "work", label: "Work" },
  { key: "clients", label: "Clients" },
  { key: "billing", label: "Billing" },
  { key: "deadlines", label: "Deadlines" },
];

export function NotificationSettings({ owner, canEdit = true }: { owner: "mine" | "firm"; canEdit?: boolean }) {
  const path = owner === "mine" ? "/api/v1/notifications/preferences" : "/api/v1/notifications/firm-defaults";
  const [rows, setRows] = useState<readonly NotificationCategorySettings[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const { data, error: failed } = await api.GET(path, {});
    if (failed !== undefined) {
      setError(apiError(failed).message);
      return;
    }
    setRows(data.categories);
  }, [path]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function set(category: NotificationCategorySettings["category"], enabled: boolean): Promise<void> {
    setBusy(category);
    setError(null);
    // The box moves at once; the API's answer then replaces the whole table,
    // and a refusal puts back what the API holds.
    setRows((was) =>
      was === null
        ? was
        : was.map((r) =>
            r.category === category ? { ...r, channels: { ...r.channels, in_app: { ...r.channels.in_app, enabled } } } : r,
          ),
    );
    const body = { settings: [{ category, channel: "in_app" as const, enabled }] };
    const result =
      owner === "mine"
        ? await api.PUT("/api/v1/notifications/preferences", { body })
        : await api.PUT("/api/v1/notifications/firm-defaults", { body });
    setBusy(null);
    if (result.error !== undefined) {
      setError(apiError(result.error).message);
      await load();
      return;
    }
    setRows(result.data.categories);
  }

  if (rows === null) return error === null ? <LoadingCard lines={4} /> : <ErrorNotice error={error} />;

  return (
    <div className="stack tight">
      <ErrorNotice error={error} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Tell {owner === "mine" ? "me" : "people"} when</Th>
              <Th align="center">In the bell</Th>
            </tr>
          </thead>
          {GROUPS.map((g) => {
            const inGroup = rows.filter((r) => r.group === g.key);
            if (inGroup.length === 0) return null;
            return (
              <tbody key={g.key}>
                <tr className="notify-group-row">
                  <th scope="rowgroup" colSpan={2}>
                    {g.label}
                  </th>
                </tr>
                {inGroup.map((r) => {
                  const bell = r.channels.in_app;
                  return (
                    <Tr key={r.category}>
                      <Td>
                        {r.label}
                        {owner === "mine" && bell.overridden && (
                          <span className="notify-note"> · Your choice. The firm has it {bell.firmEnabled ? "on" : "off"}.</span>
                        )}
                        {bell.locked && <span className="notify-note"> · Always on</span>}
                      </Td>
                      <Td align="center">
                        <input
                          type="checkbox"
                          className="notify-check"
                          aria-label={`${r.label}: in the bell`}
                          checked={bell.enabled}
                          disabled={bell.locked || !canEdit || busy !== null}
                          onChange={(e) => {
                            void set(r.category, e.target.checked);
                          }}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            );
          })}
        </Table>
      </TableWrap>
    </div>
  );
}
