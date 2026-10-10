"use client";

import { useId, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { Button, Field, FieldRow, FieldStack, Input, Select } from "@/components/ui";
import { ErrorNotice, Notice } from "@/components/tw";
import { shortNameFrom } from "@/lib/short-name";
import { browserDay } from "@/lib/day";
import {
  ASK_FILING_KINDS,
  ASK_KINDS,
  MONTHLY_CLOSE,
  checkTemplate,
  exampleDates,
  toItemDraft,
  toTemplateBody,
  wholeDays,
  whenWords,
} from "@/lib/request-template";
import type { AskDocumentKind, AskKind, ItemDraft, RequestTemplateBody } from "@/lib/request-template";

/**
 * Writing a request template, or a new version of one.
 *
 * `templateKey` null is a NEW template, whose short name is made from its name
 * (CA#26, as Processes does) and can be set under More; otherwise it is a new
 * version and the short name cannot move: every process step names the
 * template by it.
 *
 * ── THE API's RULES ARE CHECKED HERE FIRST, AND STILL BY THE API ────────────
 *
 * `checkTemplate` says the backend's refusals as sentences beside the item, so
 * "due before it is asked" reads as "Make it due after the day it is asked: 2
 * days or more" on the item, not as `items[2].dueOffsetDays` at the top of the
 * page. Nothing is sent while it finds anything. When the API refuses anyway
 * (a rule this copy has not caught up with), its own message is shown as it
 * came.
 *
 * ── THE DAYS ARE SAID IN WORDS, AND WITH A REAL MONTH ───────────────────────
 *
 * Two numbers counted from the period's LAST day are easy to type and easy to
 * misread ("is 5 the 5th, or five days after we ask?"). Under each item the
 * screen says it back: "Asked 1 day after the period ends, due 5 days after
 * the period ends. For October 2026: asked 01 Nov 2026, due 05 Nov 2026."
 */
export function TemplateEditor({
  templateKey,
  initial,
  takenKeys,
  note,
  onStartFrom,
  onDone,
  onCancel,
  onError,
}: {
  templateKey: string | null;
  /** What the form starts with; null is an empty template. */
  initial: RequestTemplateBody | null;
  /** Every template's short name, so a new one does not clash. */
  takenKeys: readonly string[];
  note: string;
  /** Offered on a NEW template: start again from the example. */
  onStartFrom?: (start: RequestTemplateBody) => void;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const isNew = templateKey === null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initial === null
      ? [blankItem([])]
      : // An example's items follow their labels like new ones; a saved
        // version's keys are handles asks already record.
        initial.items.map((i) => toItemDraft(i, isNew)),
  );
  const [busy, setBusy] = useState(false);
  /** Problems are shown once a save has been tried, then follow every edit. */
  const [tried, setTried] = useState(false);
  const today = browserDay();

  const entryKey = templateKey ?? (keyTouched ? key.trim() : shortNameFrom(label, "entry", "requests", takenKeys));
  const problems = checkTemplate(label, isNew ? entryKey : null, takenKeys, items);

  function patch(index: number, change: Partial<ItemDraft>): void {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== index) return item;
        let next: ItemDraft = { ...item, ...change };
        if (change.key !== undefined) next = { ...next, autoKey: false };
        else if (change.label !== undefined && item.autoKey) {
          const taken = current.filter((_, j) => j !== index).map((x) => x.key);
          next = { ...next, key: shortNameFrom(change.label, "step", `item-${String(index + 1)}`, taken) };
        }
        return next;
      }),
    );
  }

  async function save(): Promise<void> {
    // CLEARED BEFORE THE CALL, as every editor here does: `ErrorNotice` takes
    // focus when a message APPEARS, so a second identical refusal has to be a
    // second absent-to-present change or the press looks like it did nothing.
    onError("");
    setTried(true);
    if (problems.count > 0) return;
    setBusy(true);
    const body: Record<string, unknown> = { ...toTemplateBody(label, items) };
    const result = isNew
      ? await api.POST("/api/v1/config/{kind}", {
          params: { path: { kind: "request_template" } },
          body: { key: entryKey, body },
        })
      : await api.POST("/api/v1/config/{kind}/{key}/versions", {
          params: { path: { kind: "request_template", key: templateKey } },
          body: { body },
        });
    setBusy(false);
    if (result.error) {
      // Verbatim: the validator names the item, the field and what it accepts.
      onError(apiError(result.error).message);
      return;
    }
    onDone();
  }

  const scope = templateKey ?? "a new template";

  return (
    <div className="mt-4">
      {isNew && onStartFrom !== undefined && (
        <div className="mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onStartFrom(MONTHLY_CLOSE);
            }}
          >
            Start from an example: Monthly close
          </Button>
        </div>
      )}

      <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={scope}>
        <div className="max-w-[36rem]">
          <Field label="Name">
            <Input
              value={label}
              placeholder="e.g. Monthly close"
              onChange={(e) => {
                setLabel(e.target.value);
              }}
            />
          </Field>
        </div>
        {isNew && (
          <details className="mt-2">
            <summary className="text-sm">More</summary>
            <Field label="Short name" hint="Made from the name. Processes refer to it, so it cannot change later.">
              <Input
                value={entryKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
              />
            </Field>
          </details>
        )}
      </fieldset>

      {tried && problems.template.length > 0 && (
        <div className="mt-2">
          <Notice tone="danger">
            {problems.template.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </Notice>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {items.map((item, index) => (
          <ItemFields
            key={index}
            index={index}
            scope={scope}
            item={item}
            today={today}
            problems={tried ? (problems.items[index] ?? []) : []}
            onChange={(change) => {
              patch(index, change);
            }}
            onRemove={() => {
              setItems((current) => current.filter((_, i) => i !== index));
            }}
          />
        ))}
      </div>

      {tried && problems.count > 0 && (
        <div className="mt-2">
          {/* ONE SENTENCE THAT DOES NOT CHANGE while the marks below are fixed:
              `ErrorNotice` takes focus whenever its message changes, so a count
              here would pull the cursor out of the box being corrected on every
              keystroke that fixed something. */}
          <ErrorNotice error="Fix what is marked above, then save again." />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Add an item to ${scope}`}
          onClick={() => {
            setItems((current) => [...current, blankItem(current)]);
          }}
        >
          Add an item
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          {busy ? "Saving…" : "Save as a draft"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  );
}

/** A new item: a document filed as the client's books (the kind a period's
 *  request is almost always for), asked the day after the period ends and due
 *  five days after, as the firm's monthly close is. */
function blankItem(current: readonly ItemDraft[]): ItemDraft {
  return {
    key: shortNameFrom("", "step", `item-${String(current.length + 1)}`, current.map((i) => i.key)),
    label: "",
    askKind: "document",
    documentKind: "books_input",
    send: "1",
    due: "5",
    autoKey: true,
  };
}

function ItemFields({
  index,
  scope,
  item,
  today,
  problems,
  onChange,
  onRemove,
}: {
  index: number;
  scope: string;
  item: ItemDraft;
  today: string;
  problems: readonly string[];
  onChange: (change: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const groupName = `${scope} · item ${String(index + 1)}`;
  const send = wholeDays(item.send);
  const due = wholeDays(item.due);
  const said =
    send !== null && due !== null && due > send
      ? `${whenWords(send, due)} ${exampleDates(today, send, due)}`
      : null;
  return (
    /* A named group per item, drawn as Processes draws a step: sunk, and named
       by the template AND the position, because two editors can be open. */
    <fieldset
      className="m-0 min-w-0 rounded-md border border-line bg-surface-sunk p-6"
      aria-label={groupName}
    >
      <FieldStack>
        <FieldRow>
          <Field label="What the client reads">
            <Input
              value={item.label}
              placeholder="e.g. Purchase invoices for the month"
              onChange={(e) => {
                onChange({ label: e.target.value });
              }}
            />
          </Field>
          <Field label="What you need">
            <Select
              value={item.askKind}
              onChange={(e) => {
                const askKind = e.target.value as AskKind;
                // A document starts filed as the client's books; the other two
                // carry no filing kind at all.
                onChange({
                  askKind,
                  documentKind: askKind === "document" ? item.documentKind || "books_input" : "",
                });
              }}
            >
              {ASK_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          {item.askKind === "document" && (
            <Field label="File it as">
              <Select
                value={item.documentKind}
                required
                onChange={(e) => {
                  onChange({ documentKind: e.target.value as AskDocumentKind });
                }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {ASK_FILING_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldRow>
        {/* Two small numbers, held to a width that reads as two numbers: at the
            row's full width each box was 500px wide for a "1" and a "5". */}
        <div>
          <FieldRow className="max-w-[32rem]">
            <Field label="Ask, days after the period ends">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                step={1}
                value={item.send}
                aria-describedby={`${id}-when`}
                onChange={(e) => {
                  onChange({ send: e.target.value });
                }}
              />
            </Field>
            <Field label="Due, days after the period ends">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                step={1}
                value={item.due}
                aria-describedby={`${id}-when`}
                onChange={(e) => {
                  onChange({ due: e.target.value });
                }}
              />
            </Field>
          </FieldRow>
          {/* UNDER the row, never a column of it (the FieldRow rule): the plain
              words for the two numbers, with a real month. */}
          <p className="field-hint" id={`${id}-when`}>
            {said ?? "The period is the month or quarter the job covers."}
          </p>
        </div>
      </FieldStack>

      {problems.length > 0 && (
        <div className="mt-2">
          <Notice tone="danger">
            {problems.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </Notice>
        </div>
      )}

      <details className="mt-2">
        <summary className="text-sm">More</summary>
        <Field label="Short name" hint="Made from what the client reads. Each ask records it.">
          <Input
            value={item.key}
            onChange={(e) => {
              onChange({ key: e.target.value });
            }}
          />
        </Field>
      </details>

      <div className="cluster">
        <Button
          variant="destructive-quiet"
          size="sm"
          aria-label={`Remove ${groupName}`}
          onClick={onRemove}
        >
          Remove this item
        </Button>
      </div>
    </fieldset>
  );
}
