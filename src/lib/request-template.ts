"use client";

/**
 * A REQUEST TEMPLATE (F1, backend 0384): what a firm asks a client for every
 * period, and by when. "Monthly close": sales invoices, purchase invoices, bank
 * statements and expense claims, asked the day after the month ends and due on
 * the 5th.
 *
 * ── WHY THESE SHAPES ARE WRITTEN HERE AND NOT GENERATED ─────────────────────
 *
 * The one rule of this app is that an API shape is generated, never retyped.
 * This file is the exception, and it is narrow. The registry's routes carry a
 * config BODY as `{ [key: string]: unknown }` for every kind, because its shape
 * depends on the kind, so `schema.d.ts` has nothing to generate: the shape is
 * stated in prose on `DefineConfigEntryRequest.body` and defined once, by the
 * backend's validator (`validateRequestTemplateBody` in
 * `domain/config/model.ts`, the F1 contract in `docs/FIN_BUILD_PLAN.md`).
 *
 * So the body is typed ONCE, here, and nowhere else. Two things keep this copy
 * honest:
 *   - everything the generated schema DOES carry is taken from it: an ask's
 *     kind and a document kind are the generated `ClientAsk` unions, so a kind
 *     the API drops is still a compile error;
 *   - a stored body is READ through `readRequestTemplate`, which fails closed
 *     (null) on anything that is not one, and a write this copy got wrong is
 *     refused by the API, whose sentence the screen shows verbatim.
 *
 * The same goes for a process step's `requestTemplateKey`, which sits inside a
 * `workflow_template` body: `readStepRequestTemplateKey` is its one reader.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { ClientAsk, ConfigEntry } from "@/lib/api/client";
import { addDays, longDay, monthEnd, monthYear } from "@/lib/day";

/** document, question or approval: the ask's own kind, generated. */
export type AskKind = ClientAsk["askKind"];
/** What a client's upload is filed as, generated. */
export type AskDocumentKind = NonNullable<ClientAsk["documentKind"]>;

/** One thing asked for, every period. The F1 contract's six fields. */
export interface RequestTemplateItem {
  /** The item's handle: every ask raised from it records it, and the sweep
   *  asks once per item per task by it. */
  readonly key: string;
  /** What the client reads on their portal. */
  readonly label: string;
  readonly askKind: AskKind;
  /** Present exactly when `askKind` is `document`. */
  readonly documentKind: AskDocumentKind | null;
  /** Whole days after the period's last day that the client is asked. */
  readonly sendOffsetDays: number;
  /** Whole days after the period's last day that it is due. */
  readonly dueOffsetDays: number;
}

export interface RequestTemplateBody {
  readonly label: string;
  readonly items: readonly RequestTemplateItem[];
}

/** The API's limits (backend `MAX_REQUEST_*`), restated so a form can say what
 *  is wrong before the API refuses it. The API stays the judge. */
export const REQUEST_LIMITS = {
  items: 30,
  label: 200,
  itemLabel: 500,
  sendMax: 90,
  dueMin: 1,
  dueMax: 120,
} as const;

/** A template's own short name: the registry's key shape (backend `KEY_PATTERN`). */
const ENTRY_KEY = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const ENTRY_KEY_MAX = 64;
/** An item's short name: the step-key shape (backend `STEP_KEY_PATTERN`). */
const ITEM_KEY = /^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])$/;

// ── The words a firm reads ──────────────────────────────────────────────────

/** What the firm wants, as the ask form on a task offers it. Shared with that
 *  form (`work-items/[workItemId]/client-asks.tsx`) so the two say it the same
 *  way. A fourth kind would be a row the client's screen cannot draw. */
export const ASK_KINDS: readonly { value: AskKind; label: string; short: string }[] = [
  { value: "document", label: "A document (they upload a file)", short: "A document" },
  { value: "question", label: "A question (they answer in words)", short: "A question" },
  { value: "approval", label: "An approval (they say yes or no)", short: "An approval" },
];

/** What an uploaded answer is FILED as. The firm chooses; the client never
 *  sees it. The kinds a firm asks a client for, not every kind there is. */
export const ASK_FILING_KINDS: readonly { value: AskDocumentKind; label: string }[] = [
  { value: "working_paper", label: "Working paper" },
  { value: "identity_proof", label: "Identity proof" },
  { value: "statutory_filing", label: "Statutory filing" },
  { value: "correspondence", label: "Correspondence" },
  // What FinCompliance reads (backend 0383): a client's invoices, statements,
  // payroll and receipts for their books.
  { value: "books_input", label: "Client's books (invoices, statements, payroll)" },
  { value: "other", label: "Other" },
];

function days(n: number): string {
  return `${String(n)} ${n === 1 ? "day" : "days"}`;
}

/** When an item is asked, in words: "1 day after the period ends". */
export function sendWords(sendOffsetDays: number): string {
  return sendOffsetDays === 0
    ? "On the period's last day"
    : `${days(sendOffsetDays)} after the period ends`;
}

/** When it is due, in words: "5 days after the period ends". */
export function dueWords(dueOffsetDays: number): string {
  return `${days(dueOffsetDays)} after the period ends`;
}

/**
 * Both days in one sentence, the way a partner says it: "Asked 1 day after the
 * period ends, due 5 days after."
 */
export function whenWords(sendOffsetDays: number, dueOffsetDays: number): string {
  return sendOffsetDays === 0
    ? `Asked on the period's last day, due ${days(dueOffsetDays)} after it ends.`
    : `Asked ${days(sendOffsetDays)} after the period ends, due ${days(dueOffsetDays)} after.`;
}

/**
 * The two days for a month that is easy to picture: the one `today` is in.
 * "For October 2026: asked 01 Nov 2026, due 05 Nov 2026." Counted from the
 * month's last day, as the backend's `requestDates` counts.
 */
export function exampleDates(
  today: string,
  sendOffsetDays: number,
  dueOffsetDays: number,
): string {
  const end = monthEnd(today);
  return `For ${monthYear(end)}: asked ${longDay(addDays(end, sendOffsetDays))}, due ${longDay(
    addDays(end, dueOffsetDays),
  )}.`;
}

// ── The example ─────────────────────────────────────────────────────────────

/**
 * "Monthly close", FinCompliance plan v3.2 §11: four document items, all filed
 * as the client's books, asked 1 day after the month ends and due 5 days after.
 * Offered to start from, never saved on anybody's behalf (nothing is seeded).
 */
export const MONTHLY_CLOSE: RequestTemplateBody = {
  label: "Monthly close",
  items: [
    { key: "sales-invoices", label: "Sales invoices" },
    { key: "purchase-invoices", label: "Purchase invoices" },
    { key: "bank-statements", label: "Bank statements" },
    { key: "expense-claims", label: "Expense claims" },
  ].map((i) => ({
    ...i,
    askKind: "document" as const,
    documentKind: "books_input" as const,
    sendOffsetDays: 1,
    dueOffsetDays: 5,
  })),
};

// ── Reading a stored body ───────────────────────────────────────────────────

function isAskKind(v: unknown): v is AskKind {
  return ASK_KINDS.some((k) => k.value === v);
}

/**
 * A stored body as a template, or null when it is not one. Fails closed, like
 * the backend's own reader: a body that does not parse is shown as nothing
 * rather than as a guess.
 */
export function readRequestTemplate(
  body: Record<string, unknown> | null | undefined,
): RequestTemplateBody | null {
  if (!body) return null;
  const label = body["label"];
  const raw = body["items"];
  if (typeof label !== "string" || !Array.isArray(raw)) return null;
  const items: RequestTemplateItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const i = entry as Record<string, unknown>;
    const askKind = i["askKind"];
    const documentKind = i["documentKind"];
    if (
      typeof i["key"] !== "string" ||
      typeof i["label"] !== "string" ||
      !isAskKind(askKind) ||
      typeof i["sendOffsetDays"] !== "number" ||
      typeof i["dueOffsetDays"] !== "number"
    ) {
      return null;
    }
    items.push({
      key: i["key"],
      label: i["label"].trim(),
      askKind,
      documentKind:
        askKind === "document" && typeof documentKind === "string"
          ? (documentKind as AskDocumentKind)
          : null,
      sendOffsetDays: i["sendOffsetDays"],
      dueOffsetDays: i["dueOffsetDays"],
    });
  }
  return { label: label.trim(), items };
}

/** The name a template is picked by: its published label, else its draft's,
 *  else its short name. */
export function requestTemplateLabel(entry: ConfigEntry): string {
  const read = readRequestTemplate((entry.published ?? entry.pendingDraft)?.body);
  return read !== null && read.label !== "" ? read.label : entry.entry.key;
}

/** A process step's `requestTemplateKey`, read off a stored step. Absent and
 *  null both mean the step asks the client for nothing (backend F1.2). */
export function readStepRequestTemplateKey(step: Record<string, unknown>): string | null {
  const key = step["requestTemplateKey"];
  return typeof key === "string" && key !== "" ? key : null;
}

// ── The firm's templates, by name ───────────────────────────────────────────

export interface RequestTemplateName {
  readonly key: string;
  readonly label: string;
  /** Published: a step may name only these, and only these raise asks. */
  readonly inForce: boolean;
}

/**
 * The firm's request templates, by key and name. `enabled` false fetches
 * nothing (a task with no template-raised ask needs no names). Null until the
 * answer arrives, and empty when the read is refused: a name is a nicety
 * wherever this is used, and the short name stands in for it.
 */
export function useRequestTemplateNames(enabled = true): readonly RequestTemplateName[] | null {
  const [names, setNames] = useState<readonly RequestTemplateName[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void api
      .GET("/api/v1/config/{kind}", { params: { path: { kind: "request_template" } } })
      .then((r) => {
        if (!live) return;
        setNames(
          (r.data?.entries ?? []).map((e) => ({
            key: e.entry.key,
            label: requestTemplateLabel(e),
            inForce: e.published !== null,
          })),
        );
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  return names;
}

// ── Checking a template before it is sent ───────────────────────────────────

/** An item as the editor holds it: the day boxes are TEXT, so an empty or
 *  half-typed box is something to say about rather than a NaN to send. */
export interface ItemDraft {
  key: string;
  label: string;
  askKind: AskKind;
  documentKind: AskDocumentKind | "";
  send: string;
  due: string;
  /** The short name still follows the label (a new item, untouched). */
  autoKey: boolean;
}

/** What is wrong with a template, in the words a partner fixes it by. Empty
 *  when the API's own rules (backend `validateRequestTemplateBody`) are met. */
export interface TemplateProblems {
  readonly template: readonly string[];
  /** One list per item, in order. */
  readonly items: readonly (readonly string[])[];
  readonly count: number;
}

/** A day box's text as a whole number of days, or null for anything else. */
export function wholeDays(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/**
 * The backend's checks, said before the save so a mistake reads as a sentence
 * beside the item rather than a refusal naming `items[2].dueOffsetDays`. The
 * API still checks everything and its message is still shown when it refuses.
 */
export function checkTemplate(
  label: string,
  templateKey: string | null,
  takenKeys: readonly string[],
  items: readonly ItemDraft[],
): TemplateProblems {
  const template: string[] = [];
  const name = label.trim();
  if (name === "") template.push("Give the template a name, e.g. Monthly close.");
  else if (name.length > REQUEST_LIMITS.label) {
    template.push(`Keep the name to ${String(REQUEST_LIMITS.label)} characters.`);
  }
  if (templateKey !== null) {
    if (!ENTRY_KEY.test(templateKey) || templateKey.length > ENTRY_KEY_MAX) {
      template.push(
        'The short name (under More) must start with a letter and use lower-case letters, digits, "-" or "_".',
      );
    } else if (takenKeys.includes(templateKey)) {
      template.push(`A template called "${templateKey}" exists. Change the short name under More.`);
    }
  }
  if (items.length === 0) template.push("Add at least one thing to ask for.");
  if (items.length > REQUEST_LIMITS.items) {
    template.push(
      `A template holds at most ${String(REQUEST_LIMITS.items)} items. Split it into two templates.`,
    );
  }

  const keyCount = new Map<string, number>();
  for (const i of items) keyCount.set(i.key.trim(), (keyCount.get(i.key.trim()) ?? 0) + 1);

  const perItem = items.map((i) => {
    const out: string[] = [];
    const words = i.label.trim();
    if (words === "") out.push("Say what the client is asked for.");
    else if (words.length > REQUEST_LIMITS.itemLabel) {
      out.push(`Keep what the client reads to ${String(REQUEST_LIMITS.itemLabel)} characters.`);
    }
    const key = i.key.trim();
    if (!ITEM_KEY.test(key)) {
      out.push(
        'The short name (under More) must be 2 to 40 lower-case letters, digits, "-" or "_".',
      );
    } else if ((keyCount.get(key) ?? 0) > 1) {
      out.push(`Another item has the short name "${key}". Change one under More.`);
    }
    if (i.askKind === "document" && i.documentKind === "") {
      out.push("Choose how to file what the client sends.");
    }
    const send = wholeDays(i.send);
    const due = wholeDays(i.due);
    if (send === null || send > REQUEST_LIMITS.sendMax) {
      out.push(
        `Ask between 0 and ${String(REQUEST_LIMITS.sendMax)} days after the period ends, in whole days.`,
      );
    }
    if (due === null || due < REQUEST_LIMITS.dueMin || due > REQUEST_LIMITS.dueMax) {
      out.push(
        `Make it due ${String(REQUEST_LIMITS.dueMin)} to ${String(REQUEST_LIMITS.dueMax)} days after the period ends, in whole days.`,
      );
    } else if (send !== null && due <= send) {
      out.push(`Make it due after the day it is asked: ${String(send + 1)} days or more.`);
    }
    return out;
  });

  return {
    template,
    items: perItem,
    count: template.length + perItem.reduce((n, p) => n + p.length, 0),
  };
}

/** The editor's items as the API's body. Call only once `checkTemplate` is
 *  clean: the day boxes are whole numbers by then. */
export function toTemplateBody(label: string, items: readonly ItemDraft[]): RequestTemplateBody {
  return {
    label: label.trim(),
    items: items.map((i) => ({
      key: i.key.trim(),
      label: i.label.trim(),
      askKind: i.askKind,
      // Null for a question or an approval: the API refuses a filing kind on
      // either, as the ask's own CHECK does.
      documentKind: i.askKind === "document" && i.documentKind !== "" ? i.documentKind : null,
      sendOffsetDays: Number(i.send.trim()),
      dueOffsetDays: Number(i.due.trim()),
    })),
  };
}

/** A stored item back into the editor. A saved item's short name is a handle
 *  asks already record, so it never follows the label again. */
export function toItemDraft(item: RequestTemplateItem, autoKey = false): ItemDraft {
  return {
    key: item.key,
    label: item.label,
    askKind: item.askKind,
    documentKind: item.documentKind ?? "",
    send: String(item.sendOffsetDays),
    due: String(item.dueOffsetDays),
    autoKey,
  };
}
