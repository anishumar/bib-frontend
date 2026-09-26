"use client";

/**
 * A DOCUMENT'S OWN PROSE — the exclusions, commercial notes and team block that
 * belong to ONE quote or ONE letter (G1.7).
 *
 * ## Not the firm's standard set, and the difference is the whole point
 *
 * `/admin/document-blocks` edits the STANDARD lines — the firm's house wording,
 * copied onto every new document at drafting. This panel edits the copy that
 * landed on THIS document. Editing a standard line changes the next letter and
 * never this one; editing here changes this one and never the firm's.
 *
 * That is why the routes are different — `/document-blocks/standard/{id}`
 * against `/document-blocks/{id}` — and it is why a line with `sourceId === null`
 * is marked: it was written for this client and is not in the house set.
 *
 * ## Three routes with no caller, and none of them made sense alone
 *
 * `POST /document-blocks`, `PATCH /document-blocks/{id}` and its DELETE all
 * shipped with G1.7 and nothing has ever called any of them, so a firm could
 * read a quote's exclusions and not change one word. **The POST was missed by
 * the route sweep too**, because `/api/v1/document-blocks` is a PREFIX of
 * `/api/v1/document-blocks/standard`, which IS called — a substring test reads
 * that as covered. A panel that could edit and strike off but not add would
 * have been half a feature, so all three are here.
 *
 * ## What freezes, and where the rule actually lives
 *
 * A block on a SIGNED letter is refused by a database trigger —
 * `crm.refuse_signed_child_change()`, the same one that freezes the letter's
 * lines and clauses, resolving its parent from `engagement_letter_id`. The
 * exclusions a client agreed to are part of what they agreed to.
 *
 * A block on a PROPOSAL is untouched by that trigger (its
 * `engagement_letter_id` is NULL and the function's guards are IS NOT NULL), so
 * the database would accept an edit to a quote the client has already read. The
 * proposal SCREEN does not offer it, matching what that screen already does
 * with lines and prices — a sent quote is the record of what somebody was
 * shown. Each caller passes `editable` and the sentence explaining it, so the
 * rule is stated where a reader meets it rather than being a control that
 * quietly is not there.
 *
 * ## Which kinds, and why the caller says
 *
 * A letter carries two kinds a proposal does not — its COVER LETTER and its
 * ACCEPTANCE (0083), the paragraphs page one of the Annexure letter prints —
 * so each screen passes the kinds its document carries, in the order its PDF
 * prints them. Offering a proposal a cover letter would be offering a control
 * whose only outcome is the API's refusal. Those two are PARAGRAPHS of a letter
 * rather than items of a list, so they are drawn without bullets and written in
 * a box a paragraph fits in.
 *
 * ## One edit open at a time
 *
 * Not a limitation — it is what keeps the names distinct. Every line's editor
 * asks for "The line", "Order" and "A heading"; three open at once is nine
 * controls under three names, which is the defect probe 6 exists to catch. The
 * open editor's fieldset is named by the line's own words.
 */

import { useState } from "react";
import { api, apiError, BLOCK_KIND_LABELS, PARAGRAPH_BLOCK_KINDS } from "@/lib/api/client";
import type { BlockKind, DocumentBlock } from "@/lib/api/client";
import {
  Button,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { Card, CardTitle } from "@/components/tw";
import { cx } from "@/components/ui";

/** Exactly one, mirroring the CHECK on `crm.document_block`. */
export type BlockOwner = { proposalId: string } | { engagementLetterId: string };

export function DocumentBlocks({
  blocks,
  owner,
  kinds,
  canWrite,
  editable,
  frozenNote,
  onChanged,
}: {
  blocks: readonly DocumentBlock[];
  owner: BlockOwner;
  /** The kinds this document carries, in the order its PDF prints them. */
  kinds: readonly BlockKind[];
  /** `party:write`, the permission all three routes take. */
  canWrite: boolean;
  /** Whether this document's prose may still be changed. The caller decides,
   *  because the rule differs by document — see the note above. */
  editable: boolean;
  /** Why not, in words, when `editable` is false. Shown instead of the
   *  controls: a control that is simply absent reads as a missing feature. */
  frozenNote: string;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const { panel: editRef } = useSwapFocus(editing !== null);

  const may = canWrite && editable;

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await onChanged();
    setBusy(null);
    return true;
  }

  // Nothing to show and nothing to add: the card would be an empty box with a
  // heading. A document with no prose and no way to write any is not a state
  // worth drawing.
  if (blocks.length === 0 && !may) return null;

  const named = kinds.map((k) => BLOCK_KIND_LABELS[k].toLowerCase());
  const listed =
    named.length <= 1
      ? named.join("")
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1] ?? ""}`;

  return (
    <Card>
      <CardTitle level={2}>
        {kinds.some((k) => PARAGRAPH_BLOCK_KINDS.includes(k))
          ? "The letter's own wording"
          : "Exclusions, notes and team"}
      </CardTitle>
      <p className="muted text-md">
        These are this document&rsquo;s own {listed}. They were copied from your firm&rsquo;s
        standard text when the document was drafted, and belong to this document from then on.
        Changing the standard text on Standard prose affects the next document, never this one.
        The terms themselves are the clauses, which come from the clause library.
      </p>
      {!editable && <p className="muted text-md">{frozenNote}</p>}

      <ErrorNotice error={error} />

      {kinds.map((kind) => {
        const mine = blocks.filter((b) => b.kind === kind);
        const prose = PARAGRAPH_BLOCK_KINDS.includes(kind);
        // A kind with nothing on it and nothing to add is not drawn — the same
        // rule the read-only version of this card has always used.
        if (mine.length === 0 && !may) return null;
        return (
          <div key={kind} className="mb-4">
            <div className="label">{BLOCK_KIND_LABELS[kind]}</div>
            {mine.length === 0 ? (
              <p className="muted text-md">
                Nothing. This document carries no {BLOCK_KIND_LABELS[kind].toLowerCase()}.
              </p>
            ) : (
              <ul className={cx("mt-1 pl-[18px]", prose ? "list-none" : "list-disc")}>
                {mine.map((b) =>
                  editing === b.id ? (
                    <li key={b.id} className="list-none -ml-[18px]">
                      <div ref={editRef} tabIndex={-1}>
                        <form
                          action={(form) => {
                            void act(b.id, () =>
                              api.PATCH("/api/v1/document-blocks/{blockId}", {
                                params: { path: { blockId: b.id } },
                                body: {
                                  body: String(form.get("blockBody") ?? ""),
                                  isHeading: form.get("blockHeading") === "on",
                                  sortOrder: Number(form.get("blockOrder")),
                                },
                              }),
                            ).then((ok) => {
                              if (ok) setEditing(null);
                            });
                          }}
                        >
                          {/* NAMED BY THE LINE'S OWN WORDS. Only one editor is
                              open at a time, so this is the only group on the
                              card asking for "The line" — but the name is what
                              tells a reader WHICH line they are in, and the
                              body is the only identity a block has. */}
                          <fieldset
                            className="fieldset"
                            aria-label={`Editing “${b.body.slice(0, 60)}”`}
                          >
                            <FieldStack>
                              <Field label="The line">
                                <Textarea name="blockBody" rows={3} defaultValue={b.body} required />
                              </Field>
                              <FieldRow>
                                <Field
                                  label="Order"
                                  hint="Where it prints among the others of its kind."
                                >
                                  <Input
                                    name="blockOrder"
                                    type="number"
                                    min={1}
                                    defaultValue={b.sortOrder}
                                    required
                                  />
                                </Field>
                              </FieldRow>
                              {/* A HEADING is a section title, not an item —
                                  the team block is a list with headings in it,
                                  and without the distinction it goes back to
                                  being one blob of text. */}
                              <Checkbox
                                label="A heading, not an item"
                                name="blockHeading"
                                defaultChecked={b.isHeading}
                              />
                              <div className="cluster">
                                <Button type="submit" loading={busy === b.id}>
                                  {busy === b.id ? "Saving…" : "Save the line"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => {
                                    setEditing(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </FieldStack>
                          </fieldset>
                        </form>
                      </div>
                    </li>
                  ) : (
                    <li
                      key={b.id}
                      className={cx(
                        "text-md",
                        (b.isHeading || prose) && "-ml-[18px] list-none",
                        prose && "mb-2 whitespace-pre-wrap",
                      )}
                    >
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                      {/* THREE STATES, AND THE THIRD ONE ONLY EXISTS BECAUSE
                          THIS PANEL DOES. `sourceId === null` is a line written
                          for this client. `isEdited` is a HOUSE line somebody
                          has since reworded — which, before there was an
                          editor, could not happen, so the absence of a marker
                          meant "the firm's exact standard wording" and now
                          would not. 0025's own comment asks for exactly this
                          pair of words. */}
                      {b.sourceId === null ? (
                        <span className="text-xs text-muted"> · this document&apos;s own</span>
                      ) : (
                        b.isEdited && (
                          <span className="text-xs text-muted">
                            {" "}
                            · edited from the firm&apos;s standard line
                          </span>
                        )
                      )}
                      {may && (
                        <span className="cluster" style={{ marginLeft: "var(--s-2)" }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            /* NAMED BY THE LINE. A letter with nine exclusions
                               draws nine of each of these and the visible word
                               never changes. Truncated, because a block's body
                               is up to 4,000 characters and its opening words
                               are the only identity anybody would recognise. */
                            aria-label={`Edit the ${BLOCK_KIND_LABELS[kind].toLowerCase()} line “${b.body.slice(0, 60)}”`}
                            onClick={() => {
                              setEditing(b.id);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busy === `rm:${b.id}`}
                            aria-label={`Strike off the ${BLOCK_KIND_LABELS[kind].toLowerCase()} line “${b.body.slice(0, 60)}”`}
                            onClick={() => {
                              void act(`rm:${b.id}`, () =>
                                api.DELETE("/api/v1/document-blocks/{blockId}", {
                                  params: { path: { blockId: b.id } },
                                }),
                              );
                            }}
                          >
                            Strike it off
                          </Button>
                        </span>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}

            {may && (
              <form
                style={{ marginTop: "var(--s-3)" }}
                action={(form) => {
                  void act(`add:${kind}`, () =>
                    api.POST("/api/v1/document-blocks", {
                      body: {
                        ...owner,
                        kind,
                        body: String(form.get(`${kind}-body`) ?? ""),
                        sortOrder: Number(form.get(`${kind}-order`)),
                        isHeading: form.get(`${kind}-heading`) === "on",
                      },
                    }),
                  );
                }}
              >
                {/* ONE OF THESE PER KIND ON ONE CARD, so each is a named group
                    with no legend — the same fix `/admin/document-blocks`
                    needed, where three identical forms put 12 controls under 4
                    names. Named by the KIND, which is immutable; the line's own
                    words are in a box inside the group and would rename it on
                    every keystroke. */}
                <fieldset
                  className="fieldset"
                  aria-label={`Add to ${BLOCK_KIND_LABELS[kind]}`}
                >
                  <FieldStack>
                    <FieldRow>
                      <Field label={prose ? "A new paragraph" : "A new line"}>
                        {prose ? (
                          <Textarea name={`${kind}-body`} rows={3} required />
                        ) : (
                          <Input name={`${kind}-body`} required />
                        )}
                      </Field>
                      <Field label="Order">
                        <Input
                          name={`${kind}-order`}
                          type="number"
                          min={1}
                          defaultValue={mine.length + 1}
                          required
                        />
                      </Field>
                    </FieldRow>
                    <Checkbox label="A heading, not an item" name={`${kind}-heading`} />
                    <div className="cluster">
                      <Button
                        type="submit"
                        variant="secondary"
                        loading={busy === `add:${kind}`}
                        aria-label={`Add a line to ${BLOCK_KIND_LABELS[kind]}`}
                      >
                        {busy === `add:${kind}` ? "Adding…" : "Add"}
                      </Button>
                    </div>
                  </FieldStack>
                </fieldset>
              </form>
            )}
          </div>
        );
      })}
    </Card>
  );
}
