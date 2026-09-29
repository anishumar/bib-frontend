"use client";

import { useRef, type ChangeEvent } from "react";
import { Input, type InputProps } from "./field";

/**
 * A box for a number: a fee, a quantity, a discount, an exchange rate.
 *
 * It takes only what a number is written with. Digits, one decimal point, and
 * commas, because this firm's people write five lakh as 5,00,000 and the
 * screens take the commas out before anything is sent (`cleanAmount`). A
 * letter, a currency sign or a second point is simply not taken: the box keeps
 * what it had, so "1e5" and "12.5.0" cannot be typed at all. Pasting
 * "₹ 25,000.00" keeps "25,000.00".
 *
 * The value is still a STRING. Money crosses the wire as a decimal string and
 * is never a JavaScript number (`lib/money.ts`), so this box never parses what
 * it holds; it only refuses what could never be a number.
 *
 * `decimals` is how many places after the point the API takes for this field:
 * 2 for money, 4 for a quantity or a percentage, 10 for an exchange rate, 0
 * for a count. `signed` lets a leading minus in, for a payment that reverses
 * one.
 */
export interface AmountInputProps extends Omit<InputProps, "type" | "inputMode"> {
  decimals?: number;
  signed?: boolean;
}

/** What a number box may hold, as typed so far. Also the test the component
 *  applies, exported so a screen can check a value it did not get from one. */
export function isTypedAmount(value: string, decimals = 2, signed = false): boolean {
  const sign = signed ? "-?" : "";
  const fraction = decimals > 0 ? `(\\.\\d{0,${String(decimals)}})?` : "";
  return new RegExp(`^${sign}[\\d,]*${fraction}$`).test(value);
}

export function AmountInput({ decimals = 2, signed = false, onChange, onFocus, ...rest }: AmountInputProps) {
  // The last value the box accepted, to go back to when a keystroke is not
  // taken. A controlled box is told its value by the page, so that wins.
  const accepted = useRef(String(rest.defaultValue ?? ""));

  function change(e: ChangeEvent<HTMLInputElement>): void {
    const box = e.currentTarget;
    const typed = box.value;
    const caret = box.selectionStart ?? typed.length;
    // Anything that is not part of a number goes: spaces, ₹, "INR", letters.
    const keep = signed ? /[^\d.,-]/g : /[^\d.,]/g;
    const cleaned = typed.replace(keep, "");
    const removedBeforeCaret = typed.slice(0, caret).length - typed.slice(0, caret).replace(keep, "").length;

    const back = rest.value === undefined ? accepted.current : String(rest.value);
    // Refused only when it BREAKS a good value. A box the page filled with
    // more places than this one takes ("25000.0000" from the API) must still
    // be editable, or no keystroke would ever be taken.
    if (!isTypedAmount(cleaned, decimals, signed) && isTypedAmount(back, decimals, signed)) {
      // A second point, one decimal too many, a minus in the middle: keep
      // what was there and put the caret back where the keystroke landed.
      const moved = typed.length - back.length;
      box.value = back;
      box.setSelectionRange(Math.max(0, caret - moved), Math.max(0, caret - moved));
      return;
    }
    if (cleaned !== typed) {
      box.value = cleaned;
      box.setSelectionRange(caret - removedBeforeCaret, caret - removedBeforeCaret);
    }
    accepted.current = cleaned;
    onChange?.(e);
  }

  return (
    <Input
      {...rest}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      autoComplete="off"
      onFocus={(e) => {
        // A form reset, or a page writing into an uncontrolled box, changes
        // the value without a keystroke; start from what is really there.
        if (isTypedAmount(e.currentTarget.value, decimals, signed)) accepted.current = e.currentTarget.value;
        onFocus?.(e);
      }}
      onChange={change}
    />
  );
}
