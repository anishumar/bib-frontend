import { codeLabel } from "@/lib/api/client";

/**
 * What KIND of company a client is, by name, saved as a code (CA#22).
 *
 * "Register it" asked for this as free text with "Use the codes your
 * compliance rules use", which nobody at a CA firm could act on, and it saved
 * whatever was typed ("Private Limited" one day, "private_limited" the next).
 * A filing rule that is only for one kind of company matches the code
 * EXACTLY, so the code has to come from a list. These are the kinds the client
 * import already names (private_limited, llp, partnership, pte_ltd, fzco,
 * c_corp) plus the common Indian ones. The shipped filing rules apply to every
 * kind, so this list narrows nothing by itself.
 */
export const ENTITY_KINDS: readonly { readonly code: string; readonly label: string }[] = [
  { code: "private_limited", label: "Private limited company" },
  { code: "public_limited", label: "Public limited company" },
  { code: "opc", label: "One person company" },
  { code: "section_8", label: "Section 8 company" },
  { code: "llp", label: "Limited liability partnership (LLP)" },
  { code: "partnership", label: "Partnership firm" },
  { code: "proprietorship", label: "Sole proprietorship" },
  { code: "individual", label: "Individual" },
  { code: "huf", label: "Hindu undivided family (HUF)" },
  { code: "trust", label: "Trust" },
  { code: "society", label: "Society" },
  { code: "aop", label: "Association of persons" },
  { code: "pte_ltd", label: "Private limited (Singapore)" },
  { code: "fzco", label: "Free zone company (FZCO)" },
  { code: "fze", label: "Free zone establishment (FZE)" },
  { code: "llc", label: "LLC" },
  { code: "c_corp", label: "C corporation" },
];

/** The kind's name for a reader; a code the list does not know reads as words. */
export function entityKindLabel(code: string): string {
  return ENTITY_KINDS.find((k) => k.code === code)?.label ?? codeLabel(code);
}
