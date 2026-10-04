"use client";

import { useEffect, useId, useState } from "react";
import { api, apiError, colleagueLabel } from "@/lib/api/client";
import type { Colleague, LetterOriginator } from "@/lib/api/client";
import { longInstant } from "@/lib/day";
import { Button, ErrorNotice, NotSet, Pill, Select } from "@/components/ui";

const HOW_WORDS: Readonly<Record<LetterOriginator["how"], string>> = {
  set: "",
  lead_owner: "the lead's owner",
  proposal_preparer: "who prepared the proposal",
  none: "",
};

/**
 * WHO WON THIS WORK (0355, Q049): the letter's originator, the salesperson the
 * revenue report credits. Read off the deal (the lead's owner, else who
 * prepared the proposal) until a partner or an administrator says otherwise;
 * correctable after signature, because it is not a term the client agreed to.
 * `canSet` is `tenant:admin`, which the default Partner role holds; the API
 * refuses anybody else.
 */
export function LetterOriginatorField({ letterId, canSet }: { letterId: string; canSet: boolean }) {
  const [current, setCurrent] = useState<LetterOriginator | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await api.GET("/api/v1/engagement-letters/{letterId}/originator", {
        params: { path: { letterId } },
      });
      if (live && result.data) setCurrent(result.data);
    })();
    return () => {
      live = false;
    };
  }, [letterId]);

  async function startEditing(): Promise<void> {
    setError(null);
    setChoice(current?.userId ?? "");
    setEditing(true);
    if (colleagues === null) {
      const result = await api.GET("/api/v1/tenancy/colleagues", {});
      setColleagues(result.data ? [...result.data.colleagues] : []);
    }
  }

  async function save(): Promise<void> {
    setError(null);
    setBusy(true);
    const result = await api.PUT("/api/v1/engagement-letters/{letterId}/originator", {
      params: { path: { letterId } },
      body: { userId: choice === "" ? null : choice },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setCurrent(result.data);
    setEditing(false);
  }

  if (current === null) return <NotSet>Loading</NotSet>;

  if (editing) {
    return (
      <span className="stack tight">
        <ErrorNotice error={error} />
        <label htmlFor={selectId} className="sr-only">
          Who won this work
        </label>
        <Select id={selectId} size="sm" value={choice} disabled={busy} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Nobody (not won by anyone)</option>
          {(colleagues ?? []).map((c) => (
            <option key={c.userId} value={c.userId}>
              {colleagueLabel(c)}
            </option>
          ))}
        </Select>
        <span className="cluster">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </span>
      </span>
    );
  }

  const how = HOW_WORDS[current.how];
  return (
    <>
      {current.userId === null ? (
        <NotSet>{current.how === "set" ? "Nobody, as recorded" : "Nobody recorded"}</NotSet>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2">
          {current.name ?? "Not on your staff"}
          {!current.activeStaff && current.name !== null && <Pill tone="quiet">Left</Pill>}
        </span>
      )}
      <span className="mt-0.5 block text-md text-muted">
        {current.how === "set"
          ? `Set by ${current.setBy?.name ?? "a colleague"}${current.setAt === null ? "" : ` on ${longInstant(current.setAt)}`}`
          : how === ""
            ? "Credited in the revenue report by originator"
            : `From ${how}`}
      </span>
      {canSet && (
        <Button variant="ghost" size="sm" onClick={() => void startEditing()} aria-label="Change who won this work">
          Change
        </Button>
      )}
    </>
  );
}
