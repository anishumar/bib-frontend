"use client";

/**
 * "Signed by" on a DRAFT letter (0343, Q005): who signs it for the firm.
 *
 * The client's words: "the drop down at the time of finalizing EL to select who
 * will sign that particular EL". Used where a letter is sent from, the letter
 * page and the builder's send panel, so the choice sits beside the button.
 *
 * The choice is saved on the draft straight away (PATCH the letter), so the
 * preview redraws with that name and signature before anybody presses send.
 * "Firm default" saves null: the letter then takes whoever is the default at
 * send. Send freezes the person, title and signature; a sent letter never
 * changes. A choice the firm has since retired is still shown, marked, so the
 * drafter sees why the send will be refused.
 */
import { useEffect, useId, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { LetterRecord, Signatory } from "@/lib/api/client";
import { Field, Select } from "@/components/ui";

export function SignedBySelect({
  letterId,
  chosenSignatoryId,
  canWrite,
  onSaved,
}: {
  letterId: string;
  chosenSignatoryId: string | null;
  canWrite: boolean;
  /** The letter as the API answered the change. */
  onSaved: (record: LetterRecord) => void | Promise<void>;
}) {
  const [list, setList] = useState<readonly Signatory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => {
    let live = true;
    void api.GET("/api/v1/tenancy/signatories", {}).then((r) => {
      if (live) setList(r.data?.signatories ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  if (list === null) return null;
  const fallback = list.find((s) => s.isDefault) ?? null;
  if (fallback === null) {
    return (
      <p className="text-md text-muted">
        No signatory named, so the firm&apos;s signature block goes out blank. Name one on Your firm.
      </p>
    );
  }

  const label = (s: Signatory): string => `${s.displayName ?? "Unnamed"}, ${s.title}`;
  // Offered: everyone active, plus the current choice even if retired since.
  const offered = list.filter((s) => (s.isActive && !s.isDefault) || s.id === chosenSignatoryId);

  async function choose(value: string): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.PATCH("/api/v1/engagement-letters/{letterId}", {
      params: { path: { letterId } },
      body: { chosenSignatoryId: value === "" ? null : value },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved(result.data);
  }

  return (
    // As wide as a name and a title need, not the card.
    <div style={{ maxWidth: "32rem" }}>
      <Field label="Signed by" hint={error === null ? "Printed under Yours sincerely." : undefined}>
        <Select
          name="chosenSignatoryId"
          value={chosenSignatoryId ?? ""}
          disabled={!canWrite || busy}
          aria-describedby={error === null ? undefined : errorId}
          onChange={(e) => void choose(e.target.value)}
        >
          <option value="">{`Firm default: ${label(fallback)}`}</option>
          {offered.map((s) => (
            <option key={s.id} value={s.id}>
              {s.isActive ? label(s) : `${label(s)} (retired)`}
            </option>
          ))}
        </Select>
        {error !== null && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </Field>
    </div>
  );
}
