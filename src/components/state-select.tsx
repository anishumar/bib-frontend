"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { GstState } from "@/lib/api/client";
import { Select } from "@/components/ui";

/** Read once per page load: the list is the law's, not the firm's. */
let cached: Promise<GstState[]> | null = null;

function states(): Promise<GstState[]> {
  cached ??= api.GET("/api/v1/invoicing/states", {}).then((r) => r.data?.states ?? []);
  return cached;
}

/**
 * An Indian state or union territory, by name, from the API's one list (Q056).
 *
 * A typed state ("Mumbai", "MH") could not tell an invoice its place of supply;
 * a chosen one always can. The value is the state's NAME, which is what an
 * address prints and what the API reads a place of supply from. A region typed
 * before this existed, that is not a state, stays offered as typed so a save
 * does not silently drop it.
 */
export function StateSelect({
  name,
  defaultValue,
  id,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
}) {
  const rest = { name, ...(id === undefined ? {} : { id }) };
  const [list, setList] = useState<GstState[] | null>(null);
  useEffect(() => {
    void states().then(setList);
  }, []);
  const typed = defaultValue ?? "";
  const known = list?.some((s) => s.name === typed) ?? false;
  if (list === null) {
    return (
      <Select {...rest} defaultValue={typed} disabled>
        <option value={typed}>{typed === "" ? "Loading…" : typed}</option>
      </Select>
    );
  }
  return (
    <Select {...rest} defaultValue={typed}>
      <option value="">Choose the state</option>
      {typed !== "" && !known && <option value={typed}>{typed} (as typed: choose the state)</option>}
      {list.map((s) => (
        <option key={s.code} value={s.name}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

/** The states, for a picker that saves as it changes; null while loading. */
export function useGstStates(): GstState[] | null {
  const [list, setList] = useState<GstState[] | null>(null);
  useEffect(() => {
    void states().then(setList);
  }, []);
  return list;
}
