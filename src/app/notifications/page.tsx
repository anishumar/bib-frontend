"use client";

/**
 * Notifications (0323): everything the bell has said to this person, newest
 * first, 30 at a time.
 *
 * Every row is the reader's own. The API takes no user id and a database
 * policy refuses anybody else's rows, so there is nothing here to filter by
 * person. The words come from the API, already rendered for this reader: a
 * colleague who may not see fees never receives an amount to hide.
 *
 * "Unread" is unread AND not done: a notification whose work is over (the task
 * finished, the advance was paid) is kept, marked Done, and no longer counted.
 * That is the same set the bell counts, so the two numbers always agree.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { NotificationItem } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import { Button, Card, ErrorNotice, Tabs } from "@/components/ui";
import { NotificationRow } from "@/components/notify/bell";
import { notificationsChanged } from "@/components/notify/unread";

type View = "all" | "unread";

export default function NotificationsPage() {
  const tabsId = useId();
  const [view, setView] = useState<View>("all");
  const [rows, setRows] = useState<NotificationItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (status: View, before: string | null): Promise<void> => {
    setError(null);
    const { data, error: failed } = await api.GET("/api/v1/notifications", {
      params: { query: { status, ...(before === null ? {} : { before }) } },
    });
    if (failed !== undefined) {
      setError(apiError(failed).message);
      return;
    }
    setRows((was) => (before === null ? [...data.rows] : [...(was ?? []), ...data.rows]));
    setNext(data.nextBefore);
  }, []);

  useEffect(() => {
    void (async () => {
      setRows(null);
      await load(view, null);
    })();
  }, [view, load]);

  async function markAll(): Promise<void> {
    setMarking(true);
    const newest = rows?.[0]?.createdAt;
    const { error: failed } = await api.POST("/api/v1/notifications/read-all", {
      body: newest === undefined ? {} : { upTo: newest },
    });
    setMarking(false);
    if (failed !== undefined) {
      setError(apiError(failed).message);
      return;
    }
    notificationsChanged();
    await load(view, null);
  }

  const anyUnread = rows?.some((r) => r.readAt === null) ?? false;

  return (
    <Page width="narrow">
      <PageHeader
        title="Notifications"
        aside={
          anyUnread ? (
            <Button variant="secondary" loading={marking} onClick={() => void markAll()}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      <Tabs
        id={tabsId}
        label="Which notifications"
        value={view}
        onChange={setView}
        tabs={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
      />

      <ErrorNotice error={error} />

      {rows === null && error === null && <Loading label="Loading notifications" />}

      {rows !== null && rows.length === 0 && (
        <Empty icon="bell" title={view === "unread" ? "You are all caught up" : "No notifications yet"} />
      )}

      {rows !== null && rows.length > 0 && (
        <Card className="notify-card">
          <ul className="notify-list" data-size="page">
            {rows.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {next !== null && (
        <div className="cluster">
          <Button
            variant="secondary"
            loading={more}
            onClick={() => {
              void (async () => {
                setMore(true);
                await load(view, next);
                setMore(false);
              })();
            }}
          >
            Show older
          </Button>
        </div>
      )}
    </Page>
  );
}
