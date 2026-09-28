"use client";

/**
 * "Changed for this proposal. Back to standard": a scope text the document
 * rewrote, and the way back to the catalogue's words (a null override is the
 * API's "print the catalogue's"). Used by the proposal's and the letter's
 * "Edit" lists (2026-09-28).
 */

import { useState } from "react";
import type { SaveOutcome } from "./editable";

/** Marks a text this proposal changed, with the way back to the catalogue's
 *  words: a null override is the API's "print the catalogue's". */
export function BackToStandard({
  noun,
  service,
  standard,
  onRestore,
  documentNoun = "proposal",
}: {
  noun: string;
  service: string;
  /** What the document is called: "proposal" or "letter". */
  documentNoun?: string;
  /** The catalogue's words, or null when it has none (putting it back then
   *  takes the text off this proposal). */
  standard: string | null;
  onRestore: () => Promise<SaveOutcome>;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <span>Changed for this {documentNoun}.</span>
      <button
        type="button"
        disabled={busy}
        className="text-xs text-brand underline"
        aria-label={`Put back the catalogue's ${noun} for ${service}`}
        title={standard === null ? `The catalogue has none, so this takes it off the ${documentNoun}.` : `The catalogue says: ${standard}`}
        onClick={() => {
          setBusy(true);
          setRefusal(null);
          void onRestore().then((outcome) => {
            setBusy(false);
            setRefusal(outcome);
          });
        }}
      >
        {busy ? "Putting it back…" : standard === null ? "Back to standard (none)" : "Back to standard"}
      </button>
      {refusal !== null && (
        <span role="alert" className="text-sm text-danger">
          {refusal}
        </span>
      )}
    </div>
  );
}
