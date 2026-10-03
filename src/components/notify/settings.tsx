"use client";

/**
 * Who hears what, per category, in the bell and by email (0323, 0324). One
 * component for two owners:
 *
 *   - `mine` (Your account): the person's own choice, on top of the firm's.
 *   - `firm` (Your firm, `tenant:admin` to change): what everybody starts with,
 *     and the hour the daily email goes out.
 *
 * HOW an email goes is the category's, not a setting: escalations and missed
 * filings at once, everything else in one email a day (DESIGN.md §J). The line
 * above the table says so, with the firm's hour, because "By email" alone does
 * not tell anybody when to expect it.
 *
 * Escalations and missed filings are always on in the bell: the API refuses to
 * switch them off (409), so the box is shown ticked and fixed rather than
 * offered and then refused. Their email may be switched off like any other.
 * Push does not exist yet and is not offered.
 */
import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { NotificationCategorySettings } from "@/lib/api/client";
import { ErrorNotice, Field, Select, Table, TableWrap, Td, Th, Tr } from "@/components/ui";
import { LoadingCard } from "@/components/states";

const GROUPS: readonly { key: NotificationCategorySettings["group"]; label: string }[] = [
  { key: "work", label: "Work" },
  { key: "clients", label: "Clients" },
  { key: "billing", label: "Billing" },
  { key: "deadlines", label: "Deadlines" },
];

type Channel = "in_app" | "email";
const CHANNELS: readonly { key: Channel; label: string; aria: string }[] = [
  { key: "in_app", label: "In the bell", aria: "in the bell" },
  { key: "email", label: "By email", aria: "by email" },
];

const hourLabel = (h: number): string => `${String(h).padStart(2, "0")}:00`;

export function NotificationSettings({ owner, canEdit = true }: { owner: "mine" | "firm"; canEdit?: boolean }) {
  const path = owner === "mine" ? "/api/v1/notifications/preferences" : "/api/v1/notifications/firm-defaults";
  const [rows, setRows] = useState<readonly NotificationCategorySettings[] | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    // The firm's hour is on firm-defaults, which every colleague may read.
    const [mine, firm] = await Promise.all([
      api.GET(path, {}),
      api.GET("/api/v1/notifications/firm-defaults", {}),
    ]);
    if (mine.error !== undefined) {
      setError(apiError(mine.error).message);
      return;
    }
    setRows(mine.data.categories);
    if (firm.data !== undefined) setHour(firm.data.digestHour);
  }, [path]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function set(category: NotificationCategorySettings["category"], channel: Channel, enabled: boolean): Promise<void> {
    setBusy(category);
    setError(null);
    // The box moves at once; the API's answer then replaces the whole table,
    // and a refusal puts back what the API holds.
    setRows((was) =>
      was === null
        ? was
        : was.map((r) =>
            r.category === category
              ? { ...r, channels: { ...r.channels, [channel]: { ...r.channels[channel], enabled } } }
              : r,
          ),
    );
    const body = { settings: [{ category, channel, enabled }] };
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

  async function changeHour(next: number): Promise<void> {
    setBusy("hour");
    setError(null);
    const was = hour;
    setHour(next);
    const result = await api.PUT("/api/v1/notifications/digest-hour", { body: { digestHour: next } });
    setBusy(null);
    if (result.error !== undefined) {
      setError(apiError(result.error).message);
      setHour(was);
    }
  }

  if (rows === null) return error === null ? <LoadingCard lines={4} /> : <ErrorNotice error={error} />;

  return (
    <div className="stack tight">
      <p className="notify-note">
        Escalations and missed filings are emailed at once. The rest come in one email a day
        {hour === null ? "" : ` at ${hourLabel(hour)}`}.
      </p>
      {owner === "firm" && hour !== null && (
        <div className="notify-hour">
          <Field label="Daily email at">
            <Select
              value={String(hour)}
              disabled={!canEdit || busy !== null}
              onChange={(e) => {
                void changeHour(Number(e.target.value));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <ErrorNotice error={error} />
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Tell {owner === "mine" ? "me" : "people"} when</Th>
              {CHANNELS.map((c) => (
                <Th key={c.key} align="center">
                  {c.label}
                </Th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => {
            const inGroup = rows.filter((r) => r.group === g.key);
            if (inGroup.length === 0) return null;
            return (
              <tbody key={g.key}>
                <tr className="notify-group-row">
                  <th scope="rowgroup" colSpan={1 + CHANNELS.length}>
                    {g.label}
                  </th>
                </tr>
                {inGroup.map((r) => {
                  const changed = owner === "mine" && CHANNELS.some((c) => r.channels[c.key].overridden);
                  return (
                    <Tr key={r.category}>
                      <Td>
                        {r.label}
                        {r.channels.in_app.locked && <span className="notify-note"> · Always in the bell</span>}
                        {changed && <span className="notify-note"> · Your choice</span>}
                      </Td>
                      {CHANNELS.map((c) => {
                        const ch = r.channels[c.key];
                        return (
                          <Td key={c.key} align="center">
                            <input
                              type="checkbox"
                              className="notify-check"
                              aria-label={`${r.label}: ${c.aria}`}
                              checked={ch.enabled}
                              disabled={ch.locked || !canEdit || busy !== null}
                              title={
                                owner === "mine" && ch.overridden
                                  ? `Your firm has this ${ch.firmEnabled ? "on" : "off"}.`
                                  : undefined
                              }
                              onChange={(e) => {
                                void set(r.category, c.key, e.target.checked);
                              }}
                            />
                          </Td>
                        );
                      })}
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
