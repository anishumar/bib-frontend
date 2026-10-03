"use client";

import type { FormEvent } from "react";

/**
 * Submit a form and KEEP what was typed when the API refuses it (F05).
 *
 * ── WHY NOT `<form action={fn}>` ────────────────────────────────────────────
 *
 * React 19 resets a form whose `action` is a function once that function has
 * run: every uncontrolled box goes back to its default. It does that whatever
 * the function decided, so a refusal ("That GSTIN is already on Acme") arrived
 * over a form that had just been emptied, and the person typed all of it again
 * to change one box. Seen on Capture a lead, Record a payment, Add an
 * identifier and Raise an invoice; the same shape was in every form below.
 *
 * ── WHAT THIS DOES ──────────────────────────────────────────────────────────
 *
 * `onSubmit={(event) => keepTyped(event, fn)}` stops the browser's own
 * submit, reads the same `FormData` React would have handed an action (the
 * pressed button's name/value included, which is how a form with two submit
 * buttons tells them apart), and calls `fn` with it. Nothing is reset unless
 * `fn` says so:
 *
 * - `fn` resolves `true` when the save went through AND the form stays on
 *   screen for the next entry (add a line, record a payment). Only then is it
 *   cleared, which is what the reset was for.
 * - anything else (a refusal, a check that stopped it before the call, or a
 *   form that closes on success anyway) leaves every box exactly as typed.
 *
 * The browser's own checks (`required`, `min`, `pattern`) still run first: a
 * submit event only fires on a form that passed them.
 *
 * Called INSIDE the handler rather than returning one, because a handler made
 * during render from a closure that touches a ref (a form that focuses or
 * resets through one) is what the React compiler's `refs` rule refuses.
 *
 * ── AND THE REFUSAL STILL TAKES FOCUS ───────────────────────────────────────
 *
 * Unchanged: the handler clears its message BEFORE the call (see
 * `useAppearFocus`), so a second identical refusal is another absent → present
 * transition and focus moves to it again. With the boxes kept, pressing the
 * same button twice is now a real thing people do.
 */
export function keepTyped(
  event: FormEvent<HTMLFormElement>,
  handler: (form: FormData) => boolean | void | Promise<boolean | void>,
): void {
  event.preventDefault();
  const element = event.currentTarget;
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  let data: FormData;
  try {
    data = new FormData(element, submitter);
  } catch {
    // A submitter that is not this form's own submit button (a programmatic
    // `requestSubmit` with another element) — read the boxes without it.
    data = new FormData(element);
  }
  void Promise.resolve(handler(data)).then((cleared) => {
    if (cleared === true && element.isConnected) element.reset();
  });
}
