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
 * Codes that ARE well formed and that `Intl` does name, but that are not a
 * place a prospect can be: user-assigned ranges (AA, QM–QZ, XA–XZ except
 * Kosovo, ZZ), groupings (EU, EZ, UN) and the "exceptionally reserved" codes
 * that name a territory already covered by its country (Canary Islands, Ceuta
 * and Melilla, Diego Garcia …). Offering "European Union" as where a client
 * is would be a choice nobody means.
 */
function isPickable(code: string): boolean {
  if (["AA", "ZZ", "EU", "EZ", "UN", "AC", "CP", "CQ", "DG", "EA", "IC", "TA"].includes(code)) {
    return false;
  }
  if (code >= "QM" && code <= "QZ") return false;
  if (code.startsWith("X") && code !== "XK") return false;
  return true;
}

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

function allCountries(): CountryOption[] {
  const out: CountryOption[] = [];
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      if (!isPickable(code)) continue;
      const name = names.of(code);
      // `fallback: "none"` answers undefined for a code the platform does not
      // know — which is how the unassigned two-letter combinations drop out.
      if (name === undefined || name === code) continue;
      out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
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
