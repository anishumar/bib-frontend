"use client";

/**
 * The bell in the top bar (0323): how many notifications are unread, and the
 * latest few, one click away from anywhere in the workspace.
 *
 * The count is polled (see `unread.ts` for the rate-limit budget). The list is
 * NOT: it is read when the panel opens, because a person opens it a few times a
 * day and the count is what they glance at.
 *
 * Built on `<details>` like `Menu`, so it opens, closes and answers Escape
 * without a click-outside handler. Opening a notification marks it read and
 * goes to the thing it is about.
 */
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { NotificationItem } from "@/lib/api/client";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { notificationsChanged, useUnreadCount } from "./unread";
import { arrived } from "./when";

const LATEST = 8;

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const count = useUnreadCount(enabled);
  const box = useRef<HTMLDetailsElement>(null);
  const [rows, setRows] = useState<readonly NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setFailed(false);
    const { data } = await api.GET("/api/v1/notifications", { params: { query: { limit: LATEST } } });
    if (data === undefined) {
      setFailed(true);
      return;
    }
    setRows(data.rows);
  }, []);

  const close = (): void => {
    if (box.current !== null) box.current.open = false;
  };

  async function markAll(): Promise<void> {
    const newest = rows?.[0]?.createdAt;
    await api.POST("/api/v1/notifications/read-all", { body: newest === undefined ? {} : { upTo: newest } });
    notificationsChanged();
    await load();
  }

  const badge = count === null || count === 0 ? null : count > 99 ? "99+" : String(count);

  return (
    <details
      ref={box}
      className="menu notify-bell"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary
        className="notify-bell-button"
        aria-label={badge === null ? "Notifications" : `Notifications, ${badge} unread`}
        title="Notifications"
      >
        <Icon name="bell" size={18} />
        {badge !== null && <span className="notify-badge">{badge}</span>}
      </summary>
      <div className="menu-panel notify-panel" data-align="right">
        <div className="notify-panel-head">
          <b>Notifications</b>
          {rows !== null && rows.some((r) => r.readAt === null) && (
            <button type="button" className="notify-link" onClick={() => void markAll()}>
              Mark all as read
            </button>
          )}
        </div>
        {rows === null && !failed && (
          <div className="notify-panel-wait">
            <Spinner />
          </div>
        )}
        {failed && <p className="notify-empty">Could not load. Try again in a minute.</p>}
        {rows !== null && rows.length === 0 && <p className="notify-empty">Nothing yet.</p>}
        {rows !== null && rows.length > 0 && (
          <ul className="notify-list">
            {rows.map((n) => (
              <li key={n.id}>
                <NotificationRow
                  n={n}
                  onOpen={() => {
                    close();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="notify-panel-foot">
          <Link href="/notifications" className="notify-link" onClick={close}>
            See all
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * One notification as a link. Shared by the bell and `/notifications`.
 * Opening it marks it read first, so the count is right on the page it opens.
 */
export function NotificationRow({ n, onOpen }: { n: NotificationItem; onOpen?: () => void }) {
  const unread = n.readAt === null && n.resolvedAt === null;
  return (
    <Link
      href={n.href as Route}
      className="notify-row"
      data-unread={unread || undefined}
      onClick={() => {
        if (n.readAt === null) {
          void api
            .POST("/api/v1/notifications/{notificationId}/read", { params: { path: { notificationId: n.id } } })
            .then(() => {
              notificationsChanged();
            });
        }
        onOpen?.();
      }}
    >
      <span className="notify-dot" aria-hidden="true" />
      <span className="notify-text">
        <span className="notify-title">{n.title}</span>
        {n.detail !== null && <span className="notify-detail">{n.detail}</span>}
        <span className="notify-meta">
          <time dateTime={n.createdAt}>{arrived(n.createdAt)}</time>
          {n.resolvedAt !== null && <span className="notify-done">Done</span>}
          {unread && <span className="sr-only">Unread</span>}
        </span>
      </span>
    </Link>
  );
}
