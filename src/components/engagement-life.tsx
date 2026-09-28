"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { browserDay, longDay } from "@/lib/day";
import { Button, Dialog, ErrorNotice, Field, Input, Notice, Pill, Textarea } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";

/**
 * AN ENGAGEMENT'S LIFE AFTER SIGNATURE (V2.3): where it stands, in words, and
 * End, Pause and Resume. One component for the letter page's Engagements table
 * and the client page, because the acts and their wording must not drift.
 *
 * What each act does is the user's decision of 2026-09-28, said in the
 * dialogs: ending takes it out of the firm's recurring revenue at once, the
 * work up to the last day still happens, and untouched filings for later
 * periods come off the calendar. Jobs already on the board for after the end
 * are not cancelled; the answer names them and links to each.
 */

type EngagementStatus = components["schemas"]["Engagement"]["status"];
type EndOutcome = components["schemas"]["EngagementEnded"];

export interface EngagementFacts {
  readonly id: string;
  readonly status: EngagementStatus | string;
  readonly effectiveFrom: string;
  readonly endsOn: string | null;
}

const LIVE = new Set<string>(["pending_advance", "active", "paused"]);

/** Where it stands today, in words and a colour that means something. */
export function EngagementStatePill({ e }: { e: EngagementFacts }) {
  const today = browserDay();
  switch (e.status) {
    case "pending_advance":
      return (
        <Pill dot tone="warn">
          Waiting for the advance
        </Pill>
      );
    case "active":
      return e.effectiveFrom > today ? (
        <Pill dot>Starts {longDay(e.effectiveFrom)}</Pill>
      ) : (
        <Pill dot tone="ok">
          Active
        </Pill>
      );
    case "paused":
      return (
        <Pill dot tone="warn">
          Paused
        </Pill>
      );
    case "completed":
      return e.endsOn === null ? (
        <Pill dot>Ended</Pill>
      ) : (
        <Pill dot>
          {e.endsOn >= today ? "Ends" : "Ended"} {longDay(e.endsOn)}
        </Pill>
      );
    case "cancelled":
      return (
        <Pill dot tone="danger">
          Cancelled
        </Pill>
      );
    default:
      return <Pill dot>{e.status}</Pill>;
  }
}

/**
 * End, Pause, Resume for one engagement. Nothing for one that has ended, or
 * for a session without `party:write`. `name` says which engagement in the
 * buttons' accessible names and in the dialogs ("Monthly bookkeeping for
 * Kaveri Foods").
 */
export function EngagementActions({
  e,
  name,
  canWrite,
  onChanged,
}: {
  e: EngagementFacts;
  name: string;
  canWrite: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<EndOutcome | null>(null);
  const endButton = useRef<HTMLButtonElement>(null);

  if (!canWrite) return null;

  async function lifecycle(act: "pause" | "resume"): Promise<void> {
    setBusy(true);
    setError(null);
    const result =
      act === "pause"
        ? await api.POST("/api/v1/engagements/{engagementId}/pause", { params: { path: { engagementId: e.id } } })
        : await api.POST("/api/v1/engagements/{engagementId}/resume", { params: { path: { engagementId: e.id } } });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onChanged();
  }

  return (
    <div className="stack tight">
      {LIVE.has(e.status) && (
        <div className="cluster">
          {e.status === "active" && (
            <ConfirmAction
              variant="secondary"
              size="sm"
              disabled={busy}
              aria-label={`Pause: ${name}`}
              title={`Pause ${name}?`}
              confirmLabel="Pause it"
              consequence={
                <p>
                  No new jobs or filings until you resume. Nothing already on the board or the
                  calendar changes. It leaves your monthly revenue while paused.
                </p>
              }
              onConfirm={() => void lifecycle("pause")}
            >
              Pause
            </ConfirmAction>
          )}
          {e.status === "paused" && (
            <ConfirmAction
              variant="secondary"
              size="sm"
              disabled={busy}
              aria-label={`Resume: ${name}`}
              title={`Resume ${name}?`}
              confirmLabel="Resume it"
              consequence={
                <p>
                  Work starts again from today. Months that fell inside the pause get no job.
                  Filings that fell due meanwhile come back, marked missed if their date has
                  passed.
                </p>
              }
              onConfirm={() => void lifecycle("resume")}
            >
              Resume
            </ConfirmAction>
          )}
          <Button
            ref={endButton}
            variant="destructive-quiet"
            size="sm"
            disabled={busy}
            aria-haspopup="dialog"
            aria-label={`End: ${name}`}
            onClick={() => {
              setEnding(true);
            }}
          >
            End
          </Button>
        </div>
      )}
      <ErrorNotice error={error} />
      {ended !== null && <EndedNotice outcome={ended} />}
      <EndDialog
        open={ending}
        name={name}
        engagementId={e.id}
        onClose={() => {
          setEnding(false);
          // Back to the button that opened it, when it is still there.
          requestAnimationFrame(() => {
            if (document.activeElement === null || document.activeElement === document.body) {
              endButton.current?.focus();
            }
          });
        }}
        onEnded={async (outcome) => {
          setEnding(false);
          setEnded(outcome);
          await onChanged();
        }}
      />
    </div>
  );
}

/** What ending did, and the jobs it left on the board for after the end. */
function EndedNotice({ outcome }: { outcome: EndOutcome }) {
  const last = outcome.engagement.endsOn;
  const n = outcome.filings.withdrawn;
  return (
    <Notice tone="ok" role="status">
      <p>
        Ended{last === null ? "" : `, last day ${longDay(last)}`}.{" "}
        {n === 0
          ? "No filings needed to come off the calendar."
          : `${String(n)} ${n === 1 ? "filing" : "filings"} for later periods came off the calendar.`}
      </p>
      {outcome.openJobsAfterEnd.length > 0 && (
        <p>
          Still on the board for after the end:{" "}
          {outcome.openJobsAfterEnd.map((j, i) => (
            <span key={j.jobId}>
              {i > 0 && ", "}
              <Link href={`/work/${j.jobId}` as Route}>{j.periodLabel ?? "a job"}</Link>
            </span>
          ))}
          . Open each to cancel it.
        </p>
      )}
    </Notice>
  );
}

/**
 * The End dialog: the last day and the reason, both required. A refusal is
 * shown INSIDE the dialog, because the page behind a modal cannot be read.
 */
function EndDialog({
  open,
  name,
  engagementId,
  onClose,
  onEnded,
}: {
  open: boolean;
  name: string;
  engagementId: string;
  onClose: () => void;
  onEnded: (outcome: EndOutcome) => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // onSubmit, not a form `action`: React resets an action form's fields as
  // soon as the action returns, so a refusal came back to an empty form and
  // the reason had to be typed again.
  async function submit(data: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/engagements/{engagementId}/end", {
      params: { path: { engagementId } },
      body: {
        endsOn: String(data.get("endsOn") ?? ""),
        reason: String(data.get("reason") ?? "").trim(),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onEnded(result.data);
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title={`End ${name}?`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              onClose();
            }}
          >
            Go back
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            onClick={() => {
              form.current?.requestSubmit();
            }}
          >
            End it
          </Button>
        </>
      }
    >
      <form
        ref={form}
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void submit(new FormData(event.currentTarget));
        }}
      >
        <p>
          It leaves your monthly revenue today. Work and filings continue up to the last day, then
          stop. Untouched filings for later periods come off the calendar. You cannot undo this.
        </p>
        <Field label="Last day you serve them">
          <Input name="endsOn" type="date" required />
        </Field>
        <Field label="Why is it ending?">
          <Textarea
            name="reason"
            rows={2}
            required
            maxLength={1000}
            placeholder="e.g. Moved their books to another firm"
          />
        </Field>
        <ErrorNotice error={error} />
      </form>
    </Dialog>
  );
}
