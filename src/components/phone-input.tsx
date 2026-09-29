"use client";

import { useId, useState, type ClipboardEvent } from "react";
import { Input, Select } from "@/components/ui";
import {
  acceptsNational,
  dialCodeOf,
  dialOptions,
  isDialCountry,
  isValidPhone,
  splitInternational,
  toE164,
} from "@/lib/phone";
import { countryName } from "@/lib/country";

/**
 * A phone number: the country's calling code, then the number.
 *
 * The API stores a phone in E.164 ("+919820012345") and refuses one it cannot
 * read, so the screen asks the two halves apart: a picker for the code, and a
 * box that takes only digits and the spaces or dashes people type between
 * them, and no more digits than that country's longest number. Pasting a whole
 * international number ("+971 50 123 4567") into the box picks its country.
 *
 * What reaches the page is always the E.164 string, or "" for an empty box:
 * through `onChange` for a controlled form, and through a hidden input named
 * `name` for a form read with `FormData`.
 *
 * `country` is the country the rest of the form has chosen (a lead's Country,
 * a client's registration); it moves the code until somebody picks one here.
 * `defaultCountry` is where the picker starts otherwise.
 */
export interface PhoneInputProps {
  name?: string;
  value?: string;
  onChange?: (e164: string) => void;
  country?: string | null;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Names the number box for a screen reader when no `<Field>` label does. */
  label?: string;
}

function startOf(value: string | undefined, fallback: string): { country: string; national: string } {
  if (value !== undefined && value !== "") {
    const split = splitInternational(value);
    if (split !== null) return split;
  }
  return { country: isDialCountry(fallback) ? fallback : "IN", national: "" };
}

export function PhoneInput({
  name,
  value,
  onChange,
  country,
  defaultCountry = "IN",
  placeholder = "e.g. 98200 12345",
  disabled,
  required,
  label,
}: PhoneInputProps) {
  // The field's label names the NUMBER box (it takes the field's id); the
  // code picker carries its own id and name, or two controls would share one.
  const pickerId = useId();
  const [initial] = useState(() => startOf(value, country ?? defaultCountry));
  const [picked, setPicked] = useState(initial.country);
  const [chosenHere, setChosenHere] = useState(value !== undefined && value !== "");
  const [national, setNational] = useState(initial.national);
  const [touched, setTouched] = useState(false);

  // The form's own country leads until somebody picks a code here.
  const code = !chosenHere && country !== undefined && country !== null && isDialCountry(country) ? country : picked;
  const e164 = toE164(national, code);
  const invalid = touched && e164 !== "" && !isValidPhone(e164);

  function emit(nextNational: string, nextCountry: string): void {
    onChange?.(toE164(nextNational, nextCountry));
  }

  function paste(e: ClipboardEvent<HTMLInputElement>): void {
    const split = splitInternational(e.clipboardData.getData("text"));
    if (split === null) return;
    e.preventDefault();
    setPicked(split.country);
    setChosenHere(true);
    setNational(split.national);
    emit(split.national, split.country);
  }

  const { usual, rest } = dialOptions();
  return (
    <div className="flex flex-col">
      <div className="phone-row">
        <span className="phone-code">
          <Select
            id={pickerId}
            aria-describedby={undefined}
            aria-label="Country code"
            value={code}
            disabled={disabled}
            onChange={(e) => {
              setPicked(e.target.value);
              setChosenHere(true);
              emit(national, e.target.value);
            }}
          >
            <optgroup label="Usual">
              {usual.map((o) => (
                <option key={o.country} value={o.country}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Every country">
              {rest.map((o) => (
                <option key={o.country} value={o.country}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </Select>
          <span className="phone-code-shown" aria-hidden="true">
            {dialCodeOf(code) ?? code}
          </span>
        </span>
        <span className="phone-number">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            {...(label === undefined ? {} : { "aria-label": label })}
            placeholder={placeholder}
            value={national}
            disabled={disabled}
            required={required}
            {...(invalid ? { "aria-invalid": true } : {})}
            onPaste={paste}
            onChange={(e) => {
              const typed = e.target.value;
              if (!acceptsNational(typed, code, national)) return;
              setNational(typed);
              emit(typed, code);
            }}
            onBlur={() => {
              setTouched(true);
            }}
          />
        </span>
      </div>
      {name !== undefined && <input type="hidden" name={name} value={e164} />}
      {invalid && (
        <p className="field-error" role="alert">
          {`Not a valid number for ${countryName(code)}. Check the digits.`}
        </p>
      )}
    </div>
  );
}
