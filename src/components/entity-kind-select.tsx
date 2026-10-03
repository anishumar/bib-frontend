"use client";

import { Select } from "@/components/ui";
import type { SelectProps } from "@/components/ui/field";
import { ENTITY_KINDS, entityKindLabel } from "@/lib/entity-kind";

/**
 * Kind of company, picked by name (CA#22). "Choose…" first with nothing
 * preselected. A kind saved before this list existed is kept as an option,
 * named in words, so a correction form does not silently change it.
 */
export function EntityKindSelect(props: Omit<SelectProps, "children">) {
  const current = typeof props.defaultValue === "string" ? props.defaultValue : typeof props.value === "string" ? props.value : "";
  const unlisted = current !== "" && !ENTITY_KINDS.some((k) => k.code === current) ? current : null;
  return (
    <Select {...props}>
      <option value="">Choose…</option>
      {unlisted === null ? null : <option value={unlisted}>{entityKindLabel(unlisted)}</option>}
      {ENTITY_KINDS.map((k) => (
        <option key={k.code} value={k.code}>
          {k.label}
        </option>
      ))}
    </Select>
  );
}
