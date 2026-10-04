"use client";

/**
 * The bell's count, polled within the rate limit (0323).
 *
 * The API allows 300 requests a minute PER ADDRESS, and a 40-person office
 * behind one router is one address. So the count is asked:
 *
 *   - once a minute, and only while this tab is VISIBLE. A tab in the
 *     background asks nothing; it asks once the moment it is shown again, so
 *     a person coming back to it sees today's number at once;
 *   - one request at a time. A slow answer is waited for, never stacked;
 *   - never in a hurry after a refusal. A 429 doubles the wait (up to eight
 *     minutes) and the bell keeps its last number. It does NOT sign anybody
 *     out: the count is a nicety, and losing it must cost nothing else.
 *
 * Anything that changes the count on this side (marking read on the list, or
 * in the dropdown) calls `notificationsChanged()`, which asks at once.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

const EVERY_MS = 60_000;
const MAX_BACKOFF_MS = 8 * 60_000;
const CHANGED = "bib-notifications-changed";

/** Tell the bell its count may have moved. */
export function notificationsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

export function useUnreadCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let wait = EVERY_MS;
    let live = true;

    const ask = async (): Promise<void> => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!live || document.hidden) return; // `visibilitychange` asks when shown
      if (busy) return;
      busy = true;
      try {
        const { data, response } = await api.GET("/api/v1/notifications/unread-count", {});
        if (data !== undefined) {
          if (live) setCount(data.count);
          wait = EVERY_MS;
        } else if (response.status === 429) {
          wait = Math.min(wait * 2, MAX_BACKOFF_MS);
        }
      } catch {
        // The network: keep the last number and try again on the next beat.
      } finally {
        busy = false;
        if (live) {
          timer = setTimeout(() => void ask(), wait);
        }
      }
    };

    const onVisible = (): void => {
      if (!document.hidden) void ask();
    };
    const onChanged = (): void => {
      void ask();
    };
    void ask();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHANGED, onChanged);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHANGED, onChanged);
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled]);

  return count;
}
