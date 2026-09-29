/**
 * Phone numbers, the way the API stores them: E.164 ("+919820012345").
 *
 * The API holds every phone as a plus, the country's calling code and the
 * national number with nothing between the digits, because a phone is how a
 * repeat enquiry is recognised and "098200 12345" and "+91 98200-12345" must
 * be the same person. It also checks the numbers of the countries this firm
 * works in for length. This file is the screen's half: which countries dial
 * which code, how long a number may be, and how to print one back.
 *
 * The numbering plans come from libphonenumber-js (Google's libphonenumber
 * metadata), not a table typed in here. Its checks are at least as strict as
 * the API's, so a number the screen accepts is one the API accepts.
 */

import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js";
import { countryName } from "./country";

export interface DialOption {
  readonly country: string;
  readonly code: string;
  readonly label: string;
}

/** Where this firm's clients usually are, offered first (the country list's
 *  own order, so the two pickers agree). */
const USUAL: readonly string[] = ["IN", "SG", "AE", "GB", "US"];

let cached: { usual: DialOption[]; rest: DialOption[] } | null = null;

/** Every country with its calling code: the usual few, then the rest by name. */
export function dialOptions(): { usual: DialOption[]; rest: DialOption[] } {
  if (cached !== null) return cached;
  const all = getCountries().map((country) => {
    const code = getCountryCallingCode(country);
    return { country, code, label: `${countryName(country)} +${code}` };
  });
  cached = {
    usual: USUAL.flatMap((c) => all.filter((o) => o.country === c)),
    rest: all.filter((o) => !USUAL.includes(o.country)).sort((a, b) => a.label.localeCompare(b.label)),
  };
  return cached;
}

/** Whether libphonenumber knows this country's numbering plan. */
export function isDialCountry(country: string): country is CountryCode {
  return getCountries().includes(country as CountryCode);
}

/** "+91", for a country with a plan; null otherwise. */
export function dialCodeOf(country: string): string | null {
  return isDialCountry(country) ? `+${getCountryCallingCode(country)}` : null;
}

/** The digits of what was typed, and nothing else. */
export function phoneDigits(typed: string): string {
  return typed.replace(/\D/g, "");
}

/** Countries whose numbers are all one length (India ten, Singapore eight),
 *  so a digit after a complete number can only be a typo. Elsewhere a valid
 *  number can be the start of a longer one, and only the plan's own maximum
 *  stops the box. */
const FIXED_LENGTH: readonly string[] = ["IN", "AE", "SG", "US", "CA"];

/**
 * What the national-number box will accept as the next value, given what it
 * holds now: digits and the separators people type between them, and no digit
 * past a complete number (or past the country's longest). A trunk "0" is
 * allowed (people type 098200 12345) and is dropped when the number is put
 * together.
 */
export function acceptsNational(typed: string, country: string, before = ""): boolean {
  if (!/^[\d\s().-]*$/.test(typed)) return false;
  const digits = phoneDigits(typed).replace(/^0/, "");
  if (digits === "" || !isDialCountry(country)) return digits.length <= 15;
  if (validatePhoneNumberLength(digits, country) === "TOO_LONG") return false;
  const had = phoneDigits(before).replace(/^0/, "");
  const grew = digits.length > had.length;
  return !(grew && FIXED_LENGTH.includes(country) && isValidPhone(toE164(had, country)) && !isValidPhone(toE164(digits, country)));
}

/** The E.164 number for a national number typed in a country, or "" for an
 *  empty box. Not checked: `isValidPhone` says whether it is a real number. */
export function toE164(national: string, country: string): string {
  const digits = phoneDigits(national).replace(/^0/, "");
  if (digits === "") return "";
  const code = dialCodeOf(country);
  return code === null ? `+${digits}` : `${code}${digits}`;
}

/** Whether an E.164 number is one somebody could be reached on. */
export function isValidPhone(e164: string): boolean {
  return isValidPhoneNumber(e164);
}

/** A number pasted with its country code ("+971 50 123 4567"), split back
 *  into the country and the national number; null when it is not one. */
export function splitInternational(typed: string): { country: string; national: string } | null {
  const trimmed = typed.trim().replace(/^00/, "+");
  if (!trimmed.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.country === undefined) return null;
  return { country: parsed.country, national: parsed.formatNational() };
}

/** A stored number as a person reads it: "+91 98200 12345". Anything the
 *  library cannot read (a number stored before the API checked them) is
 *  printed as it was stored rather than hidden. */
export function formatPhone(stored: string): string {
  const parsed = parsePhoneNumberFromString(stored);
  return parsed === undefined ? stored : parsed.formatInternational();
}
