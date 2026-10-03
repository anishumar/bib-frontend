import { longInstant } from "@/lib/day";

/**
 * When a notification arrived, the way a person says it: "Just now",
 * "12 min ago", "3 h ago", "Yesterday", then the date. Where the reader is,
 * because it is an instant.
 */
export function arrived(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return `${String(Math.floor(minutes / 60))} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return "Yesterday";
  return longInstant(iso);
}
