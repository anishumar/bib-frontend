/**
 * Countries, for a person to read and to pick.
 *
 * The API stores a country as an ISO 3166-1 alpha-2 code in upper case ("IN",
 * "SG") because it is COMPARED — against the firm's territory rules. A code is
 * right for the wire and wrong for a reader: "AE" is not something a partner
 * should have to decode. So the screen shows the name and sends the code.
 *
 * The names come from the browser's own `Intl.DisplayNames`, not a list typed
 * in here: a hand-kept list of ~250 names is one more thing to be wrong, and
 * the platform already has the translated, maintained one.
 */

const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/**
 * The 249 codes ISO 3166-1 assigns TODAY, and nothing else (audit 2026-10-03,
 * F04 / CA#44). The list used to be every AA..ZZ the browser could name, and
 * the browser also names RETIRED codes: "Germany" appeared twice and the first
 * saved DD (East Germany), "United Kingdom" could save UK, which no rule keyed
 * on GB matches, and fifteen names were doubled. The API now refuses anything
 * outside this list (`domain/country.ts`, the same 249).
 */
const ASSIGNED =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
  "BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM " +
  "DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS " +
  "GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN " +
  "KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ " +
  "MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM " +
  "PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV " +
  "SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI " +
  "VN VU WF WS YE YT ZA ZM ZW";

export const COUNTRY_CODES: readonly string[] = ASSIGNED.split(" ");

/** The country's English name, or the code itself when the platform has none
 *  — a code the reader can look up beats a blank. */
export function countryName(code: string): string {
  return names.of(code) ?? code;
}

export interface CountryOption {
  readonly code: string;
  readonly name: string;
}

/**
 * Where this firm's prospects usually are, offered FIRST so the common answer
 * is one keystroke away rather than a scroll past Afghanistan. A convenience,
 * not a rule: every other country is still in the list below them.
 */
const USUAL: readonly string[] = ["IN", "SG", "AE", "GB", "US"];

/** One entry per country, named by the browser, sorted by name. */
function allCountries(): CountryOption[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((x, y) =>
    x.name.localeCompare(y.name),
  );
}

let cached: { usual: CountryOption[]; rest: CountryOption[] } | null = null;

/** The usual few, then everything else by name. Built once, on first use. */
export function countryOptions(): { usual: CountryOption[]; rest: CountryOption[] } {
  if (cached !== null) return cached;
  const all = allCountries();
  cached = {
    usual: USUAL.map((code) => ({ code, name: countryName(code) })),
    rest: all.filter((c) => !USUAL.includes(c.code)),
  };
  return cached;
}
