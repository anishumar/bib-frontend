"use client";

/**
 * ONE LETTER, READ ONCE, FOR EVERYBODY ON THE SCREEN (T6.18 S6).
 *
 * The letter builder's three steps, its document and its Send panel all show
 * the same letter, and have to agree: a fee changed in the document moves the
 * footer's totals, and sending turns the document read-only. So the record is
 * kept here, keyed by id, and every reader subscribes to it — the proposal's
 * `store.ts`, for a letter.
 *
 * A write that answers with the whole letter (`PATCH /engagement-letters/{id}`
 * and `PATCH …/lines/{lineId}` do) puts that answer in with `putLetter`; every
 * other write calls `reloadLetter`. Nothing here decides anything about a
 * letter: it is a cache of the API's answer, replaced whole every time.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, apiError } from "@/lib/api/client";
import type { LetterRecord } from "@/lib/api/client";

export interface LetterState {
  readonly record: LetterRecord | null;
  /** The API's own sentence when the read failed. */
  readonly error: string | null;
  /** The session expired: a route to /login, not an error. */
  readonly signedOut: boolean;
  readonly loaded: boolean;
}

const EMPTY: LetterState = { record: null, error: null, signedOut: false, loaded: false };

const states = new Map<string, LetterState>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<void>>();
const queued = new Map<string, Promise<void>>();
/** Bumped by `putLetter`: a read that left before a write answered with the
 *  whole letter is dropped when this has moved while it was out. */
const writes = new Map<string, number>();

function publish(letterId: string, state: LetterState): void {
  states.set(letterId, state);
  for (const listener of listeners.get(letterId) ?? []) listener();
}

/** Read the letter again. A call made while a read is out waits for it and
 *  reads once more, since the read out may predate the write asking. */
export function reloadLetter(letterId: string): Promise<void> {
  const running = inFlight.get(letterId);
  if (running !== undefined) {
    const waiting = queued.get(letterId);
    if (waiting !== undefined) return waiting;
    const next = running.then(() => {
      queued.delete(letterId);
      return reloadLetter(letterId);
    });
    queued.set(letterId, next);
    return next;
  }
  const call = (async () => {
    const startedAt = writes.get(letterId) ?? 0;
    const result = await api.GET("/api/v1/engagement-letters/{letterId}", {
      params: { path: { letterId } },
    });
    if ((writes.get(letterId) ?? 0) !== startedAt) return;
    const before = states.get(letterId) ?? EMPTY;
    if (result.response.status === 401) {
      publish(letterId, { ...before, signedOut: true, loaded: true });
      return;
    }
    if (result.error) {
      publish(letterId, { ...before, error: apiError(result.error).message, loaded: true });
      return;
    }
    publish(letterId, { record: result.data, error: null, signedOut: false, loaded: true });
  })().finally(() => {
    inFlight.delete(letterId);
  });
  inFlight.set(letterId, call);
  return call;
}

/** A write that answered with the whole letter: no second read needed. */
export function putLetter(letterId: string, record: LetterRecord): void {
  writes.set(letterId, (writes.get(letterId) ?? 0) + 1);
  publish(letterId, { record, error: null, signedOut: false, loaded: true });
}

/** The letter, kept current; read on every mount, cached meanwhile. */
export function useLetter(letterId: string): LetterState & { reload: () => Promise<void> } {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(letterId) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(letterId, set);
      return () => {
        set.delete(listener);
      };
    },
    [letterId],
  );
  const snapshot = useCallback(() => states.get(letterId) ?? EMPTY, [letterId]);
  const state = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  useEffect(() => {
    void reloadLetter(letterId);
  }, [letterId]);

  const reload = useCallback(() => reloadLetter(letterId), [letterId]);
  return { ...state, reload };
}
