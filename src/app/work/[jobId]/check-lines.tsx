"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckLine } from "@/lib/api/client";
import { Button, Checkbox, Field, Fieldset, Input, cx, useSwapFocus } from "@/components/ui";
import { Pill } from "@/components/tw";
import { longMoment } from "@/lib/day";

/**
 * A step's sub-steps, or a check's review points, as a list somebody ticks
 * (T6.15).
 *
 * ONE COMPONENT FOR BOTH LISTS, because a line reads the same way wherever it
 * sits: what it says, whether it is settled, and who settled it when. What
 * differs is WHO may tick it (the doer, or the checker) and what it holds shut
 * (Done, or Approve), and both of those are the caller's to decide from the
 * API's own data. Nothing here counts what is open: `open` is the API's number,
 * the same one its 409 refuses on, so the list and the refusal cannot disagree.
 *
 * ── "NOT APPLICABLE" ASKS WHY, ON THE LINE ──────────────────────────────────
 *
 * The firm's own process says "payroll information WHERE INCLUDED" and
 * "accruals WHERE APPLICABLE". Without a way to say "not this month", somebody
 * has to tick a line for work that did not happen, and the record lies. So a
 * line can be settled as not applicable, and the API refuses that without a
 * reason. The reason is asked for inline, in a box under the line, and never in
 * a browser `prompt()`: a prompt cannot show the line it is about, cannot be
 * styled, and loses what was typed the moment it is dismissed.
 *
 * ── A LINE THAT DID NOT APPLY IS NEVER DRAWN AS TICKED ──────────────────────
 *
 * Its box stays empty and the line says "not applicable" with the reason
 * beside it. A ticked box there would read as "I did this", which is exactly
 * the false record the option exists to prevent. Ticking the box on such a line
 * records that it DID apply after all, and Undo puts it back to open.
 *
 * ── WHO AND WHEN, ON EVERY SETTLED LINE ─────────────────────────────────────
 *
 * The instant is printed WITH its clock, in the reader's zone (`longMoment`).
 * A list ticked over one afternoon is the same day on every line, and "which
 * of these was done after the manager's call" is a question somebody asks.
 */
export function CheckLines({
  title,
  scope,
  lines,
  open,
  editable,
  lockedBecause,
  busy,
  onMark,
}: {
  /** "Sub-steps" or "Review points". */
  title: string;
  /** What the lines belong to, by the step's label. Two steps of one job can
   *  each have a line called "Bank statements", and a control named only by
   *  its line would be two identical names on one page. */
  scope: string;
  lines: readonly CheckLine[];
  /** How many are still open. The API's count, never recounted here. */
  open: number;
  /** Whether THIS viewer may change the lines NOW. False draws the list as a
   *  record: the boxes are shown, and nothing can be pressed. */
  editable: boolean;
  /** Why the lines cannot be changed, when that is worth saying, or null. A
   *  list of dead checkboxes with no sentence reads as a broken page. */
  lockedBecause: string | null;
  /** The key of the line being saved right now, or null. */
  busy: string | null;
  /** Record one line. Resolves true when the API took it, so an open reason
   *  box closes only once the reason is actually on record. */
  onMark: (key: string, outcome: CheckLine["outcome"], note: string | null) => Promise<boolean>;
}) {
  const settled = lines.length - open;
  return (
    /* The spacing and the width are on a WRAPPER, not on the fieldset. `.fieldset`
       declares `margin: 0` and is unlayered, so `mt-3` on it silently did
       nothing and the list sat flush against the line above it: found in the
       first screenshot, invisible to the types.

       The measure keeps "Not applicable" and "Undo" within reach of the line
       they act on. At full width on a checker's screen they sat 750px to the
       right of the words, which is a list read in two halves. */
    <div className="mt-3 max-w-[var(--measure)]">
      <Fieldset
        legend={
          <>
            {title}{" "}
            <span className="annot">
              {settled} of {lines.length}
            </span>
            <span className="sr-only"> for {scope}</span>
          </>
        }
      >
        <ul className="m-0 list-none p-0">
          {lines.map((line) => (
            <LineRow
              key={line.key}
              line={line}
              scope={scope}
              editable={editable}
              saving={busy === line.key}
              onMark={onMark}
            />
          ))}
        </ul>
        {lockedBecause !== null && <p className="muted mt-1 text-xs">{lockedBecause}</p>}
      </Fieldset>
    </div>
  );
}

function LineRow({
  line,
  scope,
  editable,
  saving,
  onMark,
}: {
  line: CheckLine;
  scope: string;
  editable: boolean;
  saving: boolean;
  onMark: (key: string, outcome: CheckLine["outcome"], note: string | null) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  // The reason box REPLACES the button that opened it, so a keyboard user
  // pressing Enter on "Not applicable" would otherwise land on <body>. The
  // trigger ref follows whichever button sits in that slot, so after the reason
  // is saved focus comes back to "Undo" on the same line.
  const { panel, trigger } = useSwapFocus(asking);
  const notApplicable = line.outcome === "not_applicable";

  // UNDO REMOVES ITSELF. Once the API takes it the line is open again, so
  // "Undo" unmounts and "Not applicable" mounts in its slot, and a keyboard
  // user who pressed Enter on Undo would be left on <body>, with the next Tab
  // starting again from the sidebar. `useSwapFocus` cannot see this swap (the
  // reason box never opened), and the button's own focus-back only follows one
  // mounted button going from disabled to enabled. So the press is remembered,
  // and when the line comes back open focus goes to the button now in that
  // slot, only if focus was actually lost: a mouse user who clicked elsewhere
  // meanwhile keeps where they are.
  const undoing = useRef(false);
  useEffect(() => {
    if (!undoing.current || line.outcome !== null) return;
    undoing.current = false;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    trigger.current?.focus();
  }, [line.outcome, trigger]);

  async function saveReason(): Promise<void> {
    const note = reason.trim();
    // The API refuses a blank reason too, and says so. This only stops a press
    // that can only ever be refused; the button is already disabled for it.
    if (note === "" || saving) return;
    if (await onMark(line.key, "not_applicable", note)) {
      setAsking(false);
      setReason("");
    }
  }

  return (
    <li className="py-1">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <Checkbox
          className="flex-[1_1_16rem]"
          label={<span className={cx(notApplicable && "text-muted")}>{line.label}</span>}
          checked={line.outcome === "done"}
          // NOT disabled while saving. A disabled control is blurred by the
          // browser, and a keyboard user ticking down a list of eight would be
          // thrown to the top of the page on every line. A second press while
          // the first is in flight is ignored instead.
          disabled={!editable}
          onChange={(e) => {
            if (saving) return;
            void onMark(line.key, e.target.checked ? "done" : null, null);
          }}
        />
        {editable && !asking && line.outcome === null && (
          <Button
            ref={trigger}
            variant="ghost"
            size="sm"
            aria-label={`Not applicable: ${line.label} (${scope})`}
            onClick={() => {
              setAsking(true);
            }}
          >
            Not applicable
          </Button>
        )}
        {editable && notApplicable && (
          <Button
            ref={trigger}
            variant="ghost"
            size="sm"
            loading={saving}
            aria-label={`Undo not applicable: ${line.label} (${scope})`}
            onClick={() => {
              undoing.current = true;
              void onMark(line.key, null, null).then((taken) => {
                if (!taken) undoing.current = false;
              });
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {/* Indented to sit under the label rather than under the box. */}
      {notApplicable && (
        <p className="mt-0.5 pl-6 text-xs">
          <Pill>not applicable</Pill>{" "}
          <span className="muted">{line.note === null ? "" : `“${line.note}”`}</span>
        </p>
      )}
      {line.markedBy !== null && line.markedAt !== null && (
        <p className="muted mt-0.5 pl-6 text-xs">
          {notApplicable ? "Marked" : "Ticked"} by {line.markedBy.displayName},{" "}
          {longMoment(line.markedAt)}
        </p>
      )}

      {asking && (
        <div ref={panel} tabIndex={-1} className="mt-1 max-w-[48ch] pl-6">
          <Field
            label="Why does it not apply?"
            hint="Required. A few words, kept with the line so anybody can see why it was not done."
          >
            <Input
              size="sm"
              value={reason}
              maxLength={500}
              placeholder="No payroll this month"
              onChange={(e) => {
                setReason(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveReason();
                }
                if (e.key === "Escape") {
                  setAsking(false);
                  setReason("");
                }
              }}
            />
          </Field>
          <div className="cluster tight mt-1">
            <Button
              variant="secondary"
              size="sm"
              loading={saving}
              disabled={reason.trim() === ""}
              aria-label={`Save: ${line.label} does not apply (${scope})`}
              onClick={() => {
                void saveReason();
              }}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(false);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
