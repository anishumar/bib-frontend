"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Card, CardTitle, Notice, useSwapFocus } from "@/components/ui";
import { longInstant } from "@/lib/day";

/**
 * DELETING SOMETHING MADE BY MISTAKE — a lead, a draft proposal, a draft letter
 * (0086).
 *
 * One component for the three pages, because it is one act with one set of
 * rules, and three hand-written versions would drift apart on the wording that
 * matters most: that a deletion is not an outcome (a deleted lead is not a lost
 * deal) and that it cannot be undone.
 *
 * ── THE API DECIDES, AND SAYS SO BEFORE ANYBODY PRESSES ─────────────────────
 *
 * Each page's read carries `deleteRefusal`: the very code and sentence a DELETE
 * would be refused with, or null when it would work. So the button is offered
 * only when it will work. A few refusals are worth showing where the button
 * would be, because they say what to do first — a proposal drafted from this
 * lead, a closed lead only an administrator may take out of the numbers — and
 * the page names those in `explained`. Every other refusal is about what the
 * thing IS (sent, signed, converted, already deleted), which the page already
 * says elsewhere, so the card is simply absent rather than a disabled button
 * nobody can do anything with.
 *
 * ── CONFIRMED IN PLACE ──────────────────────────────────────────────────────
 *
 * The same shape as the catalogue's "Remove from this service": the quiet
 * button is REPLACED by a warning saying exactly what will happen, with the
 * destructive press beside "Keep it". Not a dialog — the consequence belongs
 * next to the thing it is about, and `useSwapFocus` puts focus on it because
 * the button that had focus was unmounted by its own press.
 */
export function DeleteMistake({
  title,
  intro,
  label,
  consequence,
  name,
  refusal,
  explained,
  canWrite,
  onDelete,
}: {
  /** "Entered by mistake?", "Made by mistake?" */
  title: string;
  /** Before anybody presses: when deleting is the right thing to do. */
  intro: ReactNode;
  /** The quiet button — "Delete this lead", "Delete this draft". */
  label: string;
  /** After the first press: exactly what deleting will do. */
  consequence: ReactNode;
  /** What is being deleted, for the buttons' accessible names. */
  name: string;
  refusal: { readonly code: string; readonly message: string } | null;
  /** The refusal codes worth showing where the button would be. */
  explained: readonly string[];
  /** Whether the session holds `party:write`, as /auth/me says. */
  canWrite: boolean;
  /** True when the API took it. The page reloads, and says it was deleted. */
  onDelete: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const { panel, trigger } = useSwapFocus(confirming);

  if (!canWrite) return null;
  if (refusal !== null && !explained.includes(refusal.code)) return null;

  return (
    <Card>
      <CardTitle level={2}>{title}</CardTitle>
      {refusal !== null ? (
        // The API's own sentence, unimproved — it names what to do first.
        <p className="muted">{refusal.message}</p>
      ) : confirming ? (
        // KEYED, both branches, and the keys are the safety. Without them React
        // reuses the one <button> — same place, same component — and relabels
        // it: focus stays on it, and a double-click or a second Enter on
        // "Delete this draft" lands on "Delete it" before anybody has read what
        // it does. Measured in the walk, not assumed. With them the quiet
        // button unmounts, and `useSwapFocus` puts focus on the warning.
        <div key="confirm" ref={panel} tabIndex={-1} className="stack tight">
          <Notice tone="warn" eyebrow="DELETE">
            {consequence}
          </Notice>
          <div className="cluster">
            <Button
              variant="destructive"
              size="sm"
              loading={working}
              aria-label={`Delete it: ${name}`}
              onClick={() => {
                void (async () => {
                  setWorking(true);
                  // On a refusal the panel stays open, so the reason (in the
                  // page's error notice) is read beside what was pressed.
                  const done = await onDelete();
                  setWorking(false);
                  if (done) setConfirming(false);
                })();
              }}
            >
              Delete it
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={working}
              aria-label={`Keep it: ${name}`}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div key="ask" className="stack tight">
          {intro}
          <div className="cluster">
            <Button
              ref={trigger}
              variant="destructive-quiet"
              size="sm"
              aria-label={`${label}: ${name}`}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {label}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * The page's own statement that what it shows was DELETED (0086) — when, by
 * whom, and what that means. A deleted item still opens from its link, because
 * the audit trail points at it for ever; this is what stops the page reading
 * as a live one somebody forgot to finish.
 *
 * `warn`, not `danger`: nothing went wrong. Somebody tidied up a mistake.
 */
export function DeletedNotice({
  what,
  deletedAt,
  deletedBy,
  children,
}: {
  /** "This lead", "This draft". */
  what: string;
  deletedAt: string;
  deletedBy: { readonly displayName: string | null; readonly email: string } | null;
  /** What it means for THIS kind of thing — which list it left, and so on. */
  children: ReactNode;
}) {
  const who = deletedBy === null ? null : (deletedBy.displayName ?? deletedBy.email);
  return (
    <Notice tone="warn" eyebrow="DELETED">
      <p>
        {what} was deleted as a mistake on {longInstant(deletedAt)}
        {who === null ? "" : ` by ${who}`}. {children}
      </p>
    </Notice>
  );
}
