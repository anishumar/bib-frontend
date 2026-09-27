"use client";

/**
 * ONE PROPOSAL, READ ONCE, FOR EVERYBODY ON THE SCREEN.
 *
 * The document and the Send panel are two components that each take only a
 * `proposalId` (T6.18: the builder's step 3 mounts both, and so does the
 * proposal page), and they have to agree. Sending turns the document read-only
 * in the same instant; an edit in the document is what the Send panel's PDF
 * will print. Two fetches in two components would disagree for as long as it
 * takes somebody to reload.
 *
 * So the record lives here, keyed by id, and every reader subscribes to it.
 * A write that answers with the whole record (`PATCH /proposals/{id}` does)
 * puts that answer in with `putProposal`; every other write calls
 * `reloadProposal`. Nothing here decides anything about a proposal: it is a
 * cache of the API's own answer, replaced whole every time.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ProposalRecord } from "@/lib/api/client";

export interface ProposalState {
  readonly record: ProposalRecord | null;
  /** The API's own sentence when the read failed. */
  readonly error: string | null;
  /** The session expired or was revoked: a route to /login, not an error. */
  readonly signedOut: boolean;
  readonly loaded: boolean;
}

const EMPTY: ProposalState = { record: null, error: null, signedOut: false, loaded: false };

const states = new Map<string, ProposalState>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<void>>();
const queued = new Map<string, Promise<void>>();
/** Bumped by `putProposal`. A read that left before a write answered with the
 *  whole record would bring back the record without that write, so its answer
 *  is dropped when this has moved while it was out. */
const writes = new Map<string, number>();

function publish(proposalId: string, state: ProposalState): void {
  states.set(proposalId, state);
  for (const listener of listeners.get(proposalId) ?? []) listener();
}

/**
 * Read the proposal again and hand the answer to every reader.
 *
 * A call made while a read is already under way does NOT share it: that read
 * may have left before the write that is asking for this one, and would bring
 * back the record without it. It waits and reads once more after, and any
 * further calls in the meantime share that one.
 */
export function reloadProposal(proposalId: string): Promise<void> {
  const running = inFlight.get(proposalId);
  if (running !== undefined) {
    const waiting = queued.get(proposalId);
    if (waiting !== undefined) return waiting;
    const next = running.then(() => {
      queued.delete(proposalId);
      return reloadProposal(proposalId);
    });
    queued.set(proposalId, next);
    return next;
  }
  const call = (async () => {
    const startedAt = writes.get(proposalId) ?? 0;
    const result = await api.GET("/api/v1/proposals/{proposalId}", {
      params: { path: { proposalId } },
    });
    if ((writes.get(proposalId) ?? 0) !== startedAt) return;
    const before = states.get(proposalId) ?? EMPTY;
    if (result.response.status === 401) {
      publish(proposalId, { ...before, signedOut: true, loaded: true });
      return;
    }
    if (result.error) {
      // The record already on screen stays: a failed re-read is not a reason
      // to blank a document somebody is reading. The sentence says what failed.
      publish(proposalId, { ...before, error: apiError(result.error).message, loaded: true });
      return;
    }
    publish(proposalId, { record: result.data, error: null, signedOut: false, loaded: true });
  })().finally(() => {
    inFlight.delete(proposalId);
  });
  inFlight.set(proposalId, call);
  return call;
}

/** A write that answered with the whole record: no second read needed. */
export function putProposal(proposalId: string, record: ProposalRecord): void {
  writes.set(proposalId, (writes.get(proposalId) ?? 0) + 1);
  publish(proposalId, { record, error: null, signedOut: false, loaded: true });
}

/**
 * The proposal, kept current. Every reader that mounts asks again (sharing a
 * read already under way) and sees the cached record until the answer lands.
 */
export function useProposal(proposalId: string): ProposalState & { reload: () => Promise<void> } {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(proposalId) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(proposalId, set);
      return () => {
        set.delete(listener);
      };
    },
    [proposalId],
  );
  const snapshot = useCallback(() => states.get(proposalId) ?? EMPTY, [proposalId]);
  const state = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  // Read on every mount, and show what is cached meanwhile: coming back to a
  // proposal after a colleague sent it must not show the draft it was. Two
  // readers mounting together share the one request.
  useEffect(() => {
    void reloadProposal(proposalId);
  }, [proposalId]);

  const reload = useCallback(() => reloadProposal(proposalId), [proposalId]);
  return { ...state, reload };
}
