"use client";

/**
 * WHAT WE ARE WAITING ON THE CLIENT FOR (T6.6) — the firm's side of the ask.
 *
 * ── IT IS NOT THE BLOCKED REASON, AND BOTH BELONG ON THIS PAGE ───────────
 *
 * The card above already shows `blockedReason`, and it stays: "we cannot
 * proceed" is a fact about the WORK, and the sentence beside it is as likely to
 * say the GST portal is down as to say the client has not sent anything. This
 * panel is the other fact — something addressed to the client, with somewhere
 * for them to answer it — and a task can genuinely have both.
 *
 * Raising one does NOT block the task, deliberately. A job can be waiting on the
 * client for one thing and moving on three others; coupling them here would make
 * that the product's opinion rather than the firm's.
 *
 * ── A DUE DAY, BUT ONLY ONE THE FIRM STATED (F1.5, reversing T6.6) ────────
 *
 * T6.6 left no due date anywhere: the firm had never given its turnaround
 * times, so a date here would have been a promise nobody made. A request
 * template (F1, backend 0385) is the firm writing its own day down, "the
 * month's records by the 5th", and an ask it raises carries that day. Somebody
 * raising one by hand may type a day too, and may leave it empty: empty is no
 * due day, as every older ask has. The API refuses a day before the firm's
 * today and its sentence is shown as it comes.
 *
 * Late is an OPEN ask past its day, judged on the reader's own calendar day
 * (`browserDay`), as the board judges a task. An answered ask is not late: the
 * client did their part and the firm is the one looking. The chaser still
 * counts from when the ask was raised, not from this day.
 *
 * An ask the requests sweep raised names no person (`raisedByName` is null),
 * so the row says which template it came from instead of "somebody who has
 * since left".
 *
 * ── AND A CLIENT'S ANSWER DOES NOT CLOSE IT ─────────────────────────────
 *
 * `answered` and `closed` are different, and this panel is where the second one
 * happens: somebody here looks at what arrived and says it was what they needed.
 * A client who sent last quarter's register would otherwise see their ask marked
 * done, and the firm would have to raise a second one that reads as a fresh
 * request rather than "that was not it".
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError, codeLabel } from "@/lib/api/client";
import type { ClientAsk } from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Field,
  FieldRow,
  ErrorNotice,
  Input,
  Notice,
  Pill,
  Select,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { Stack } from "@/components/layout";
import { browserDay, longDay, longInstant } from "@/lib/day";
// The three kinds the API accepts and what an upload may be filed as, said the
// same way here and on a request template's items (F1.7): one list, in the
// module that types the template.
import {
  ASK_FILING_KINDS as DOCUMENT_KINDS,
  ASK_KINDS as KINDS,
  useRequestTemplateNames,
} from "@/lib/request-template";
import type { AskDocumentKind, AskKind } from "@/lib/request-template";

export function ClientAsks({
  workItemId,
  canWrite,
  isClientVisible,
  about,
  prefill,
  hiddenHint = "Hidden from the client portal, so they will not see an ask. Turn it on above.",
}: {
  workItemId: string;
  canWrite: boolean;
  isClientVisible: boolean;
  /** Which task the asks hang off, said under the title where the panel is not
   *  on the task's own page (a job's page, CA#37). */
  about?: string;
  /** Open the form with these words, each time `key` changes: a process step's
   *  "Ask the client" (CA#37) starts the ask with the step's title. */
  prefill?: { readonly key: number; readonly prompt: string } | null;
  /** What to say when the task is hidden from the portal: the switch is on the
   *  task's own page, so another page says where it is. */
  hiddenHint?: string;
}) {
  const [asks, setAsks] = useState<readonly ClientAsk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // TYPED OFF THE GENERATED CLIENT, not `string`. The API's enums are the
  // product's own closed vocabularies, and widening them here would turn "a kind
  // no screen can draw a control for" from a compile error into a 400 somebody
  // sees in the browser.
  const [kind, setKind] = useState<AskKind>("document");
  // Nothing preselected (F13): an untouched form filed every client document
  // as a working paper.
  const [documentKind, setDocumentKind] = useState<AskDocumentKind | "">("");
  const [prompt, setPrompt] = useState("");
  /** The day the firm wants it by, `YYYY-MM-DD`, or "" for none (F1.5). */
  const [dueOn, setDueOn] = useState("");
  /** The ask form, closed until somebody means to ask (Wave 4): it was an open
   *  form of three fields on every task, asked of or not. */
  const [asking, setAsking] = useState(false);
  const { panel: formRef, trigger: openRef } = useSwapFocus(asking);
  // A step's "Ask the client" (CA#37): React's recipe for following a prop,
  // compared with what was last seen and set during render.
  const [seenPrefill, setSeenPrefill] = useState<number | null>(null);
  if (prefill !== undefined && prefill !== null && prefill.key !== seenPrefill) {
    setSeenPrefill(prefill.key);
    setAsking(true);
    setPrompt(prefill.prompt);
  }

  // Names for the asks a request template raised (F1.5), read only when there
  // is one: most tasks have none, and a template's NAME is all that is wanted.
  const templateNames = useRequestTemplateNames(
    (asks ?? []).some((a) => a.fromTemplate !== null),
  );

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/work-items/{workItemId}/asks", {
      params: { path: { workItemId } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setAsks(result.data);
    setError(null);
  }, [workItemId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, send: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await send();
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  const raise = () => {
    if (kind === "document" && documentKind === "") {
      setError("Choose how to file what the client sends.");
      return Promise.resolve();
    }
    return act("raise", async () => {
      const result = await api.POST("/api/v1/work-items/{workItemId}/asks", {
        params: { path: { workItemId } },
        body: {
          askKind: kind,
          prompt,
          // Sent ONLY for a document ask — the API refuses it on the other two,
          // because a filing decision on an approval is a field somebody filled
          // in without meaning to.
          documentKind: kind === "document" && documentKind !== "" ? documentKind : null,
          // Left out when empty: no due day, as every ask before F1.5.
          ...(dueOn === "" ? {} : { dueOn }),
        },
      });
      if (!result.error) {
        setPrompt("");
        setDocumentKind("");
        setDueOn("");
        setAsking(false);
      }
      return result;
    });
  };

  if (asks === null && error === null) return null;

  /** Which template an ask came from, by name: the template's short name
   *  until (or unless) the names arrive. Null for an ask a person raised. */
  function templateLabel(ask: ClientAsk): string | null {
    if (ask.fromTemplate === null) return null;
    const key = ask.fromTemplate.templateKey;
    return templateNames?.find((t) => t.key === key)?.label ?? codeLabel(key);
  }

  const today = browserDay();
  const open = (asks ?? []).filter((a) => a.status === "open" || a.status === "answered");
  const settled = (asks ?? []).filter((a) => a.status === "closed" || a.status === "withdrawn");

  return (
    <Card>
      <CardHead>
        <CardTitle level={2}>Asked of the client</CardTitle>
        {open.length > 0 && <Pill tone="warn">{`${String(open.length)} open`}</Pill>}
      </CardHead>
      {about !== undefined && <p className="text-sm text-ink-2">{about}</p>}

      <Stack gap="tight">
        {/* THE ONE PLACE THIS PANEL AND THE SWITCH ABOVE INTERACT. An ask about
            work the client cannot see is an ask about nothing: the portal's read
            joins the work item, and 0062's visibility policy filters that join,
            so the ask disappears with the task. Said here rather than left for
            somebody to discover from an unanswered request. */}
        {!isClientVisible && (
          <Notice tone="warn">
            <p>{hiddenHint}</p>
          </Notice>
        )}

        <ErrorNotice error={error} eyebrow="That did not go through" />

        {open.length === 0 && settled.length === 0 && (
          <p className="text-md">Nothing asked yet. An ask goes to their portal.</p>
        )}

        {open.map((ask) => (
          <AskLine
            key={ask.askId}
            ask={ask}
            today={today}
            templateLabel={templateLabel(ask)}
            canWrite={canWrite}
            busy={busy}
            onClose={() =>
              void act(ask.askId, () =>
                api.POST("/api/v1/asks/{askId}/close", {
                  params: { path: { askId: ask.askId } },
                }),
              )
            }
            onWithdraw={() =>
              void act(ask.askId, () =>
                api.POST("/api/v1/asks/{askId}/withdraw", {
                  params: { path: { askId: ask.askId } },
                }),
              )
            }
          />
        ))}

        {settled.length > 0 && (
          <details>
            <summary>
              {settled.length} finished{" "}
              {settled.length === 1 ? "ask" : "asks"}
            </summary>
            <Stack gap="tight">
              {settled.map((ask) => (
                <AskLine
                  key={ask.askId}
                  ask={ask}
                  today={today}
                  templateLabel={templateLabel(ask)}
                  canWrite={false}
                  busy={busy}
                />
              ))}
            </Stack>
          </details>
        )}

        {canWrite && !asking && (
          <div className="cluster">
            <Button
              ref={openRef}
              variant="secondary"
              size="sm"
              onClick={() => {
                setAsking(true);
              }}
            >
              Ask the client
            </Button>
          </div>
        )}
        {canWrite && asking && (
          <div ref={formRef} tabIndex={-1}>
          <Stack gap="tight">
            <FieldRow>
              <Field label="What do you need?">
                <Select value={kind} onChange={(e) => setKind(e.target.value as AskKind)}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {kind === "document" && (
                <Field label="File it as" hint="The client never sees this.">
                  <Select
                    value={documentKind}
                    required
                    onChange={(e) => setDocumentKind(e.target.value as AskDocumentKind)}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {DOCUMENT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </FieldRow>
            <Field label="Your words" hint="They see this word for word, with your name.">
              <Textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Please send the Maharashtra purchase register for July."
              />
            </Field>
            {/* OPTIONAL, and empty means no due day (F1.5). The API holds it
                to the firm's own today and its refusal is shown as it comes. */}
            <div className="max-w-[16rem]">
              <Field label="Due by" optional hint="They see this day.">
                <Input
                  type="date"
                  min={today}
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                />
              </Field>
            </div>
            <div className="cluster">
              <Button
                variant="secondary"
                onClick={() => void raise()}
                disabled={busy !== null || prompt.trim().length === 0}
              >
                Send the ask
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAsking(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </Stack>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function AskLine({
  ask,
  today,
  templateLabel,
  canWrite,
  busy,
  onClose,
  onWithdraw,
}: {
  ask: ClientAsk;
  /** The reader's calendar day, `YYYY-MM-DD`, that lateness is judged on. */
  today: string;
  /** The request template's name when the sweep raised it, else null. */
  templateLabel: string | null;
  canWrite: boolean;
  busy: string | null;
  onClose?: () => void;
  onWithdraw?: () => void;
}) {
  const late = ask.status === "open" && ask.dueOn !== null && ask.dueOn < today;
  return (
    <div className="notice">
      {/* `.notice` is a flex ROW — it is built for one `.notice-body` and,
          optionally, an action beside it. Five block children laid straight
          into it became five COLUMNS: the question, when it was asked, the
          reply and the buttons side by side, with each paragraph crushed to
          about sixty pixels of text. `.notice-body` is the design system's own
          answer (`flex: 1; min-width: 0`), and `stack tight` gives the gaps the
          flex row was accidentally providing. */}
      <div className="notice-body stack tight">
        {/* `.row` is `display:flex; align-items:baseline; justify-content:
            space-between; gap: var(--s-4); flex-wrap: wrap` — so `gap` and
            `between` were describing what it already does and were defined in
            no stylesheet. Probe 1 finds these; it had never been run on a
            detail route with an ask on it. */}
        <div className="row">
          <strong>{ask.prompt}</strong>
          <Pill tone={STATUS_TONE[ask.status] ?? "neutral"}>{STATUS_LABEL[ask.status]}</Pill>
        </div>
        <p className="text-ink-2">
          {/* The DAY the firm wants it by first, split and never parsed
              (`longDay`), and marked late the way the board marks a task. */}
          {ask.dueOn !== null && (
            <>
              <span className={late ? "tone-danger" : undefined}>
                Due {longDay(ask.dueOn)}
                {late && ", late"}
              </span>
              {" · "}
            </>
          )}
          {templateLabel !== null ? (
            <>
              From {templateLabel} · asked {longInstant(ask.raisedAt)}
            </>
          ) : (
            <>
              {ask.raisedByName ?? "Somebody who has since left"} asked {longInstant(ask.raisedAt)}
            </>
          )}
          {ask.firstAnsweredAt !== null && <> · first reply {longInstant(ask.firstAnsweredAt)}</>}
          {ask.closedAt !== null && (
            <>
              {" "}
              · {ask.status === "withdrawn" ? "withdrawn" : "closed"} {longInstant(ask.closedAt)} by{" "}
              {ask.closedByName ?? "somebody who has since left"}
            </>
          )}
        </p>

        {/* ── WHAT THE CHASER HAS ALREADY SENT (T4.4, read since T6.7) ────────

            `delivery.client_ask_chase` recorded every rung of the outward ladder
            from the day migration 0065 was written and NOTHING rendered it — the
            sixth registered thing in this codebase found with a writer and no
            reader. Without it a colleague opening this task cannot see that the
            sweep has already reminded this client three times, so the next thing
            they do is chase it a fourth time by hand, which is the work T4.4
            exists to remove.

            THE COUNT IS THE POINT HERE, and it is the half the CLIENT's own page
            deliberately does not show: "we asked you four times" is what a firm
            says when a filing goes late, and `client_ask_chase` is append-only by
            GRANT so it is evidence rather than a note. On the client's action
            centre the same rows render as a date and no tally — a count on
            somebody's own page is an accusation.

            Each rung is named by its KEY, which is the firm's own word for it.
            Not the label: that lives in the published `chaser` config and a
            ladder edited in April must not restate what March's chase was
            called. */}
        {ask.chases.length > 0 && (
          <p className="text-ink-2">
            Reminded automatically{" "}
            {ask.chases.length === 1 ? "once" : `${String(ask.chases.length)} times`}
            {": "}
            {ask.chases
              .map((c) => `${c.rungKey} on ${longInstant(c.chasedAt)}`)
              .join(", ")}
            .
          </p>
        )}

        {ask.responses.map((r) => (
          <p key={r.responseId} className="text-ink-2">
            <strong>{r.respondedByName ?? "Their contact"}</strong>{" "}
            {r.document !== null ? (
              <>
                sent {r.document.filename} ({Math.max(1, Math.round(r.document.byteSize / 1024))} KB)
                {/* SAID, NOT IMPLIED. There is no virus scanner in this product
                    and no agent runtime to run one, so a file arrives exactly as
                    the client sent it. The download route serves it as an
                    attachment and never inline, which is the one protection that
                    does exist. */}
                <span> · not scanned for viruses</span>
              </>
            ) : r.decision !== null ? (
              r.decision === "approved" ? (
                "approved this"
              ) : (
                "declined this"
              )
            ) : (
              "replied"
            )}{" "}
            · {longInstant(r.respondedAt)}
            {/* A SPAN, not a div: this sits inside the <p> above, and a <div>
                there is invalid HTML. The browser silently closes the
                paragraph around it, so it LOOKS right and React reports a
                hydration mismatch on every render of this panel — visible
                only in the console, which is why it survived T6.6. `display:
                block` is what a div was doing here anyway. */}
            {r.answerText !== null && (
              <span className="block">&ldquo;{r.answerText}&rdquo;</span>
            )}
          </p>
        ))}

        {canWrite && onClose !== undefined && onWithdraw !== undefined && (
          <div className="cluster">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={busy === ask.askId}>
              Got what we needed
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onWithdraw}
              disabled={busy === ask.askId}
            >
              No longer needed
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** `answered` is not `closed`, and the labels say so — "Sent, with us" is what a
 *  colleague needs to see to know somebody still has to look at it. */
const STATUS_LABEL: Record<string, string> = {
  open: "Waiting on them",
  answered: "Answered, needs a look",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<string, "warn" | "ok" | "neutral"> = {
  open: "warn",
  answered: "ok",
  closed: "neutral",
  withdrawn: "neutral",
};

