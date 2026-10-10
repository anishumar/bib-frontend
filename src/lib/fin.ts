import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, type FinReader, type FinRouteBasis, type Principal } from "@/lib/api/client";

/**
 * Whether FinCompliance is on for the firm this session is in, asked ONCE.
 *
 * The staff app shows FinCompliance (the "Files received" link, the `/fin`
 * screens) only when `GET /api/v1/fin/status` answers 200. Every other answer
 * means OFF, and they are three different facts the API is careful to keep
 * apart:
 *
 *   - 404 `FIN_NOT_ENABLED`: the firm's own switch is off. With the
 *     deployment's switch off the route is not registered at all, which is a
 *     404 too, and means the same thing to a reader.
 *   - 403: the role does not hold `books:read`. Never asked: the session
 *     already says so (`permissions`), so the request is not made.
 *   - anything else (a 5xx, a 429, no answer): the API could not say. Off for
 *     the nav, but NOT remembered, so the next screen that asks tries again;
 *     a busy minute must not hide FinCompliance until the next page load.
 *
 * ── ONE READ PER SESSION AND FIRM, SHARED ─────────────────────────────────
 *
 * The shell asks for the nav and `app/fin/layout.tsx` asks for its gate, and
 * on a direct load of `/fin/intake` they mount in the same instant. The answer
 * is kept here, keyed by who is signed in and which firm they are in, and
 * every reader subscribes to it (the proposal store's arrangement,
 * `components/proposal-document/store.ts`): two readers share one request, and
 * switching firm asks again because the key changes. A page load starts empty.
 */

export type FinStatus =
  /** Not known yet: the session has not answered, or the status read is out. */
  | { readonly kind: "checking" }
  | { readonly kind: "on"; readonly enabledSince: string }
  | { readonly kind: "off"; readonly why: FinOffReason };

export type FinOffReason =
  /** The firm has not switched FinCompliance on (or the deployment has not). */
  | "not_enabled"
  /** The role does not hold `books:read`. */
  | "no_permission"
  /** The API could not answer. Asked again by the next reader. */
  | "unreachable";

const CHECKING: FinStatus = { kind: "checking" };
const NO_PERMISSION: FinStatus = { kind: "off", why: "no_permission" };
const NOT_ENABLED: FinStatus = { kind: "off", why: "not_enabled" };
const UNREACHABLE: FinStatus = { kind: "off", why: "unreachable" };

const answers = new Map<string, FinStatus>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<void>>();

function publish(key: string, status: FinStatus): void {
  answers.set(key, status);
  for (const listener of listeners.get(key) ?? []) listener();
}

/** Who is asking, as the cache key; null when there is nothing to ask. */
function keyOf(p: Principal | null): string | null {
  if (p === null || p.tenantId === null) return null;
  return `${p.userId}|${p.tenantId}`;
}

/** Ask the API, unless a definite answer is already held or a read is out. */
function ensure(key: string, force: boolean): Promise<void> {
  const running = inFlight.get(key);
  if (running !== undefined) return running;
  const held = answers.get(key);
  if (!force && held !== undefined && held !== UNREACHABLE) return Promise.resolve();
  // Asking again after "could not answer" reads as checking, not as the old
  // failure, so the gate shows Loading rather than the sentence it is retrying.
  if (held !== undefined) publish(key, CHECKING);
  const call = (async () => {
    try {
      const result = await api.GET("/api/v1/fin/status", {});
      if (result.data !== undefined) {
        publish(key, { kind: "on", enabledSince: result.data.enabledSince });
        return;
      }
      const status = result.response.status;
      publish(key, status === 404 ? NOT_ENABLED : status === 403 ? NO_PERMISSION : UNREACHABLE);
    } catch {
      // fetch rejects only when no answer arrived at all.
      publish(key, UNREACHABLE);
    }
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, call);
  return call;
}

/**
 * FinCompliance's status for this session, and a way to ask again.
 *
 * `principal` is the shell's (`useSession()`), passed in rather than read here
 * so the shell itself can call this without importing its own context. Null
 * (the session has not answered yet) reads as `checking`.
 */
export function useFinStatus(principal: Principal | null): FinStatus & { retry: () => void } {
  const key = keyOf(principal);
  const mayRead = principal?.permissions.includes("books:read") ?? false;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (key === null) return () => undefined;
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );
  const snapshot = useCallback(
    () => (key === null ? CHECKING : (answers.get(key) ?? CHECKING)),
    [key],
  );
  const held = useSyncExternalStore(subscribe, snapshot, () => CHECKING);

  useEffect(() => {
    if (key === null || !mayRead) return;
    void ensure(key, false);
  }, [key, mayRead]);

  const retry = useCallback(() => {
    if (key === null || !mayRead) return;
    void ensure(key, true);
  }, [key, mayRead]);

  // Decided from the session before anything is asked: a role without the
  // permission gets 403 from the API, so the request would say nothing new.
  if (principal === null) return { ...CHECKING, retry };
  if (principal.tenantId === null) return { ...NOT_ENABLED, retry };
  if (!mayRead) return { ...NO_PERMISSION, retry };
  return { ...held, retry };
}

// ── The words ────────────────────────────────────────────────────────────────

/**
 * The readers, in the order the screen lists them, and what each is called.
 * `one` is a file's own pill ("Spreadsheet"), `many` the count's label
 * ("Spreadsheets"). Codes never reach the screen (Wave 4 rule 9): `manual` is
 * "Needs a person", because that is what it asks of the reader.
 */
export const FIN_READERS: readonly {
  readonly code: FinReader;
  readonly one: string;
  readonly many: string;
}[] = [
  { code: "pdf", one: "PDF", many: "PDFs" },
  { code: "sheet", one: "Spreadsheet", many: "Spreadsheets" },
  { code: "image", one: "Photo or scan", many: "Photos and scans" },
  { code: "archive", one: "ZIP file", many: "ZIP files" },
  { code: "manual", one: "Needs a person", many: "Needs a person" },
];

export function isFinReader(value: string | null): value is FinReader {
  return FIN_READERS.some((r) => r.code === value);
}

export function readerWords(code: FinReader): string {
  return FIN_READERS.find((r) => r.code === code)?.one ?? code;
}

/** The part of a file name after its last dot, lower case, or null. */
function endingOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * How the reader was chosen, in a few words under its pill: the type the
 * upload declared, the name's ending when that type said nothing useful, or
 * neither ("Nothing fit"). The ending is named where it decided, or where it
 * is the reason nothing fit (".json" has no reader).
 */
export function basisWords(basis: FinRouteBasis, filename: string): string {
  const ending = endingOf(filename);
  if (basis === "media_type") return "From its file type";
  if (basis === "extension") return ending === null ? "From its name" : `From its name (.${ending})`;
  return ending === null ? "Nothing fit" : `Nothing fit .${ending} files`;
}

/** A count for people, grouped the way the product groups rupees: 1,169. */
export function finCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}
