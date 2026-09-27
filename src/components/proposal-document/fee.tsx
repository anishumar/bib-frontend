"use client";

/**
 * A SERVICE'S FEE, changed where the document states it: "Fees H3: INR 50,000
 * Yearly". Two things make a fee on this page, the amount and how often it is
 * charged, so the box holds both, and saves when focus leaves the pair (or on
 * Enter); Escape puts it back. It changes this proposal's line only (D7).
 *
 * The amount is typed the way people type money here ("50,000", "5,00,000"),
 * the grouping is taken out (`cleanAmount`), and what is sent is the decimal
 * STRING the API takes. It is checked for being a plain decimal first, because
 * the API's refusal of "50k" is correct and slower. Whether a price is allowed
 * (a discount past the limit, a reason for no price) is the API's to say.
 */

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { cleanAmount, toMinorUnits } from "@/lib/money";
import type { ProposalLine } from "@/lib/api/client";
import { cx } from "@/components/ui";
import type { SaveOutcome } from "./editable";
import { EditablePieceShell } from "./editable";
import { FREQUENCY_WORDS } from "./words";
import type { BillingFrequency } from "./words";

export interface FeeChange {
  unitAmount: string;
  billingFrequency: BillingFrequency | null;
}

const FREQUENCIES = Object.keys(FREQUENCY_WORDS) as BillingFrequency[];

export function EditableFee({
  line,
  currency,
  editable,
  onSave,
  children,
}: {
  line: ProposalLine;
  currency: string;
  editable: boolean;
  onSave: (change: FeeChange) => Promise<SaveOutcome>;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<BillingFrequency | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      // Only if focus was LOST with the box (React parks it on <body>): if the
      // person has already moved on to another piece, it stays there.
      const active = document.activeElement;
      if (active === null || active === document.body) pencil.current?.focus();
    }
  }, [editing]);

  function open(): void {
    setAmount(line.unitAmount ?? "");
    setFrequency(line.billingFrequency ?? "");
    setError(null);
    setEditing(true);
  }

  function close(byKeyboard: boolean): void {
    refocus.current = byKeyboard;
    setError(null);
    setEditing(false);
  }

  async function save(byKeyboard: boolean): Promise<void> {
    if (saving.current) return;
    const typed = cleanAmount(amount.trim());
    const often = frequency === "" ? null : frequency;
    if (typed === (line.unitAmount ?? "") && often === line.billingFrequency) {
      close(byKeyboard);
      return;
    }
    if (toMinorUnits(typed) === null) {
      setError(`Type the fee as a number in ${currency}, like 50000 or 12500.50.`);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    const outcome = await onSave({ unitAmount: typed, billingFrequency: often });
    saving.current = false;
    setBusy(false);
    if (outcome !== null) {
      setError(outcome);
      return;
    }
    close(byKeyboard);
  }

  const qualified =
    line.quantity.replace(/\.0+$/, "") !== "1" ||
    (line.discountPercent !== null && !/^0+(\.0+)?$/.test(line.discountPercent));

  if (!editable) return <div>{children}</div>;

  if (editing) {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void save(true);
      }
    };
    // Leaving the PAIR saves; moving from the amount to the frequency does not.
    const leave = (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void save(false);
    };
    const box = "rounded-sm border border-brand bg-surface px-3 py-2 text-ink outline-none";
    return (
      <div onBlur={leave}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Fee ({currency}){qualified && ", for one, before discount"}
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              disabled={busy}
              aria-invalid={error !== null}
              className={cx(box, "w-48")}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
              onKeyDown={keys}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            How often
            <select
              value={frequency}
              disabled={busy}
              className={box}
              onChange={(e) => {
                setFrequency(e.target.value as BillingFrequency | "");
              }}
              onKeyDown={keys}
            >
              <option value="">Not stated</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_WORDS[f]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span role="status">
            {busy ? "Saving…" : "Saves when you click away or press Enter. Esc keeps it as it was."}
          </span>
          <button
            type="button"
            className="text-xs text-brand underline"
            onMouseDown={(e) => {
              e.preventDefault();
              close(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <EditablePieceShell
      className="cursor-text"
      onOpen={open}
      pencilRef={pencil}
      pencilLabel={`Edit the fee for ${line.description}`}
    >
      {children}
    </EditablePieceShell>
  );
}
